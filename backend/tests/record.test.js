process.env.JWT_SECRET = 'test-secret';

jest.mock('../src/config/db', () => ({ query: jest.fn(), connect: jest.fn() }));

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const pool = require('../src/config/db');
const app = require('../src/app');

const token = (role, id) => `Bearer ${jwt.sign({ id, role }, 'test-secret')}`;

const setup = ({ patientAccess = null, doctorFacilities = [], entry = null, insertRow = { id: 99 } } = {}) => {
  pool.query.mockReset();
  pool.query.mockImplementation(async (sql) => {
    if (sql.includes('LEFT JOIN patient_guardians g')) {
      return { rows: patientAccess ? [patientAccess] : [], rowCount: patientAccess ? 1 : 0 };
    }
    if (sql.includes('SELECT DISTINCT a.facility_id')) {
      return { rows: doctorFacilities.map((facility_id) => ({ facility_id })), rowCount: doctorFacilities.length };
    }
    if (sql.startsWith('SELECT * FROM') && sql.includes('WHERE id = $1 AND patient_id = $2')) {
      return { rows: entry ? [entry] : [], rowCount: entry ? 1 : 0 };
    }
    if (/^\s*INSERT INTO (patient_allergies|patient_conditions|patient_medications|immunizations)/.test(sql)) {
      return { rows: [insertRow], rowCount: 1 };
    }
    if (/^\s*UPDATE (patient_allergies|patient_conditions|patient_medications|immunizations)/.test(sql)) {
      return { rows: [{ ...entry, updated: true }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
};

const calls = (pattern) => pool.query.mock.calls.filter(([sql]) => pattern.test(sql));
const listSql = () => calls(/FROM patient_allergies e/)[0];
const insertCall = (table) => calls(new RegExp(`^\\s*INSERT INTO ${table}`))[0];

const SELF = { user_id: 7, link_status: null };
const GUARDIAN_VERIFIED = { user_id: null, link_status: 'verified' };
const GUARDIAN_PENDING = { user_id: null, link_status: 'pending' };

describe('Lecture du dossier', () => {
  test('le patient lit son dossier, sans les saisies erronees, et l acces est journalise', async () => {
    setup({ patientAccess: SELF });
    const res = await request(app).get('/api/patients/20/record').set('Authorization', token('patient', 7));

    expect(res.status).toBe(200);
    expect(res.body.access).toMatchObject({ basis: 'self', canDeclare: true, canWriteClinical: false });
    const [sql] = listSql();
    expect(sql).toContain('NOT e.entered_in_error');
    expect(sql).not.toContain('NOT e.confidential');
    const log = calls(/INSERT INTO patient_access_logs/)[0][1];
    expect(log.slice(0, 6)).toEqual([7, 'patient', 20, 'view_record', true, 'self']);
    expect(log.slice(7)).toEqual(['record_summary', null]);
  });

  test('un responsable verifie ne voit pas les informations confidentielles', async () => {
    setup({ patientAccess: GUARDIAN_VERIFIED });
    const res = await request(app).get('/api/patients/20/record').set('Authorization', token('patient', 7));

    expect(res.status).toBe(200);
    expect(listSql()[0]).toContain('NOT e.confidential');
  });

  test('un lien en attente ne donne pas acces au dossier', async () => {
    setup({ patientAccess: GUARDIAN_PENDING });
    const res = await request(app).get('/api/patients/20/record').set('Authorization', token('patient', 7));

    expect(res.status).toBe(403);
    expect(listSql()).toBeUndefined();
  });

  test('le medecin traitant ne voit que ses etablissements de soins et les declarations du patient', async () => {
    setup({ doctorFacilities: [1, 3] });
    const res = await request(app)
      .get('/api/patients/20/record')
      .query({ includeErrors: 'true' })
      .set('Authorization', token('doctor', 4));

    expect(res.status).toBe(200);
    expect(res.body.access).toMatchObject({ basis: 'treating_doctor', canWriteClinical: true, canDeclare: false });
    const [sql, params] = listSql();
    expect(sql).toContain('(e.facility_id = ANY($2::int[]) OR e.facility_id IS NULL)');
    expect(sql).not.toContain('NOT e.entered_in_error');
    expect(params).toEqual([20, [1, 3]]);
  });

  test('un patient ne peut pas demander les saisies erronees', async () => {
    setup({ patientAccess: SELF });
    await request(app).get('/api/patients/20/record').query({ includeErrors: 'true' }).set('Authorization', token('patient', 7));
    expect(listSql()[0]).toContain('NOT e.entered_in_error');
  });

  test('un medecin sans relation de soins est refuse', async () => {
    setup({ doctorFacilities: [] });
    const res = await request(app).get('/api/patients/20/record').set('Authorization', token('doctor', 4));
    expect(res.status).toBe(403);
    expect(listSql()).toBeUndefined();
  });

  test.each(['secretary', 'admin'])('le role %s n a pas acces au dossier', async (role) => {
    setup();
    const res = await request(app).get('/api/patients/20/record').set('Authorization', token(role, 1));
    expect(res.status).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe('Ajout d informations', () => {
  test('le patient declare une allergie : source patient, sans etablissement, jamais confidentielle', async () => {
    setup({ patientAccess: SELF });
    const res = await request(app)
      .post('/api/patients/20/record/allergies')
      .set('Authorization', token('patient', 7))
      .send({ substance: 'Pénicilline', severity: 'severe', confidential: true });

    expect(res.status).toBe(201);
    const [sql, params] = insertCall('patient_allergies');
    expect(sql).toContain('patient_id, source, recorded_by, updated_by, facility_id, confidential');
    expect(params.slice(0, 6)).toEqual([20, 'patient', 7, 7, null, false]);
  });

  test.each(['conditions', 'medications', 'immunizations'])('le patient ne peut pas ajouter de %s', async (kind) => {
    setup({ patientAccess: SELF });
    const bodies = {
      conditions: { label: 'Asthme' },
      medications: { name: 'Salbutamol' },
      immunizations: { vaccine: 'BCG', administeredOn: '2020-01-01' },
    };
    const res = await request(app).post(`/api/patients/20/record/${kind}`).set('Authorization', token('patient', 7)).send(bodies[kind]);
    expect(res.status).toBe(403);
    expect(calls(/INSERT INTO patient_access_logs/)).toHaveLength(0);
    expect(calls(/^\s*INSERT INTO (patient_allergies|patient_conditions|patient_medications|immunizations)/)).toHaveLength(0);
  });

  test('le medecin traitant ajoute un antecedent dans son seul etablissement de soins', async () => {
    setup({ doctorFacilities: [3] });
    const res = await request(app)
      .post('/api/patients/20/record/conditions')
      .set('Authorization', token('doctor', 4))
      .send({ label: 'Drépanocytose', icd10Code: 'd57.1', confidential: true });

    expect(res.status).toBe(201);
    const [, params] = insertCall('patient_conditions');
    expect(params.slice(0, 6)).toEqual([20, 'clinician', 4, 4, 3, true]);
    expect(params).toContain('D57.1');
  });

  test('un medecin present dans plusieurs etablissements doit preciser lequel', async () => {
    setup({ doctorFacilities: [1, 3] });
    const res = await request(app).post('/api/patients/20/record/medications').set('Authorization', token('doctor', 4)).send({ name: 'Paracétamol' });
    expect(res.status).toBe(400);
  });

  test('un medecin ne peut pas ecrire dans un etablissement hors de sa relation de soins', async () => {
    setup({ doctorFacilities: [1, 3] });
    const res = await request(app)
      .post('/api/patients/20/record/medications')
      .set('Authorization', token('doctor', 4))
      .send({ name: 'Paracétamol', facilityId: 9 });
    expect(res.status).toBe(403);
    expect(calls(/^\s*INSERT INTO patient_medications/)).toHaveLength(0);
  });

  test.each([
    ['allergies', { substance: '' }],
    ['immunizations', { vaccine: 'BCG', administeredOn: '2999-01-01' }],
    ['conditions', { label: 'X', icd10Code: 'pas-un-code' }],
    ['medications', { name: 'X', startDate: '2026-02-01', endDate: '2026-01-01' }],
    ['allergies', { substance: 'Arachide', recordedBy: 1 }],
  ])('rejette des donnees invalides pour %s', async (kind, body) => {
    setup({ doctorFacilities: [3] });
    const res = await request(app).post(`/api/patients/20/record/${kind}`).set('Authorization', token('doctor', 4)).send(body);
    expect(res.status).toBe(400);
  });

  test('rejette un type d information inconnu', async () => {
    setup({ patientAccess: SELF });
    const res = await request(app).post('/api/patients/20/record/surgeries').set('Authorization', token('patient', 7)).send({});
    expect(res.status).toBe(400);
  });
});

describe('Modification et correction', () => {
  const clinicianEntry = { id: 5, patient_id: 20, source: 'clinician', facility_id: 3, entered_in_error: false };
  const declaredEntry = { id: 6, patient_id: 20, source: 'patient', facility_id: null, entered_in_error: false };

  test('le patient ne modifie pas une information saisie par un medecin', async () => {
    setup({ patientAccess: SELF, entry: clinicianEntry });
    const res = await request(app).patch('/api/patients/20/record/allergies/5').set('Authorization', token('patient', 7)).send({ status: 'resolved' });
    expect(res.status).toBe(403);
  });

  test('le patient ne rend pas une information confidentielle', async () => {
    setup({ patientAccess: SELF, entry: declaredEntry });
    const res = await request(app).patch('/api/patients/20/record/allergies/6').set('Authorization', token('patient', 7)).send({ confidential: true });
    expect(res.status).toBe(403);
  });

  test('le medecin confirme une allergie declaree par le patient', async () => {
    setup({ doctorFacilities: [3], entry: declaredEntry });
    const res = await request(app).patch('/api/patients/20/record/allergies/6').set('Authorization', token('doctor', 4)).send({ severity: 'severe' });
    expect(res.status).toBe(200);
    const [sql, params] = calls(/^\s*UPDATE patient_allergies/)[0];
    expect(sql).toContain('updated_by = $3');
    expect(params).toEqual([6, 20, 4, 'severe']);
  });

  test('un medecin ne modifie pas une information d un autre etablissement', async () => {
    setup({ doctorFacilities: [1], entry: clinicianEntry });
    const res = await request(app).patch('/api/patients/20/record/allergies/5').set('Authorization', token('doctor', 4)).send({ status: 'resolved' });
    expect(res.status).toBe(403);
  });

  test('une saisie erronee est marquee avec un motif, jamais supprimee', async () => {
    setup({ doctorFacilities: [3], entry: clinicianEntry });
    const res = await request(app)
      .post('/api/patients/20/record/allergies/5/entered-in-error')
      .set('Authorization', token('doctor', 4))
      .send({ reason: 'Mauvais patient' });

    expect(res.status).toBe(200);
    const [sql, params] = calls(/^\s*UPDATE patient_allergies/)[0];
    expect(sql).toContain('entered_in_error = true');
    expect(params).toEqual([5, 20, 'Mauvais patient', 4]);
    expect(calls(/^\s*DELETE/)).toHaveLength(0);
  });

  test('le motif de correction est obligatoire', async () => {
    setup({ doctorFacilities: [3], entry: clinicianEntry });
    const res = await request(app).post('/api/patients/20/record/allergies/5/entered-in-error').set('Authorization', token('doctor', 4)).send({});
    expect(res.status).toBe(400);
  });

  test('une information deja marquee erronee ne se modifie plus', async () => {
    setup({ doctorFacilities: [3], entry: { ...clinicianEntry, entered_in_error: true } });
    const res = await request(app).patch('/api/patients/20/record/allergies/5').set('Authorization', token('doctor', 4)).send({ notes: 'x' });
    expect(res.status).toBe(409);
  });
});

describe('Migration 010_longitudinal_record', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', '010_longitudinal_record.sql'), 'utf8');

  test('interdit la suppression et conserve chaque version precedente', () => {
    expect(sql).toContain("RAISE EXCEPTION 'Suppression interdite");
    expect(sql).toContain('BEFORE DELETE ON %I');
    expect(sql).toContain('INSERT INTO record_revisions');
    expect(sql).toContain('BEFORE UPDATE ON %I');
  });

  test('seules les allergies peuvent etre declarees par le patient', () => {
    expect(sql).toContain("CHECK ((source = 'patient') = (facility_id IS NULL))");
    expect(sql.match(/CHECK \(source = 'clinician' AND facility_id IS NOT NULL\)/g)).toHaveLength(3);
  });

  test('ne supprime aucune donnee existante', () => {
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b|\bDELETE\s+FROM\b|\bTRUNCATE\b/i);
  });
});
