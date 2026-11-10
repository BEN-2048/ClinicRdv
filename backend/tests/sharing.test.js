process.env.JWT_SECRET = 'test-secret';

jest.mock('../src/config/db', () => {
  const query = jest.fn();
  const client = { query, release: jest.fn() };
  return { query, connect: jest.fn(async () => client) };
});

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const pool = require('../src/config/db');
const app = require('../src/app');
const { canAccessPatient, RULES } = require('../src/services/access.service');

const token = (role, id) => `Bearer ${jwt.sign({ id, role }, 'test-secret')}`;

const setup = (routes = []) => {
  pool.query.mockReset();
  pool.query.mockImplementation(async (sql, params) => {
    for (const [part, result] of routes) {
      if (sql.includes(part)) return typeof result === 'function' ? result(sql, params) : result;
    }
    return { rows: [], rowCount: 0 };
  });
};

const calls = (part) => pool.query.mock.calls.filter(([sql]) => sql.includes(part));
const SELF = ['LEFT JOIN patient_guardians g', { rows: [{ user_id: 7, link_status: null }], rowCount: 1 }];

const doctorDb = ({ care = [], scopes = null, emergency = false }) => ({
  query: jest.fn(async (sql) => (sql.includes('SELECT DISTINCT a.facility_id')
    ? { rows: care.map((facility_id) => ({ facility_id })), rowCount: care.length }
    : { rows: [{ consent_scopes: scopes, emergency }], rowCount: 1 })),
});

describe('Règles d accès avec partage', () => {
  const doctor = { id: 4, role: 'doctor' };

  test('sans consentement, la lecture reste limitee aux etablissements de soins', async () => {
    const r = await canAccessPatient(doctor, 20, 'view_record', doctorDb({ care: [3] }));
    expect(r).toMatchObject({ allowed: true, basis: 'treating_doctor', sharing: { summaryAll: false, fullAll: false } });
  });

  test('le consentement ne s applique qu aux etablissements ou le medecin soigne le patient', async () => {
    const db = doctorDb({ care: [3], scopes: ['summary'] });
    const r = await canAccessPatient(doctor, 20, 'view_summary', db);
    expect(r.sharing).toMatchObject({ summaryAll: true, fullAll: false, consent: true });
    const [sql, params] = db.query.mock.calls[1];
    expect(sql).toContain('c.facility_id = ANY($3::int[])');
    expect(sql).toContain('c.revoked_at IS NULL AND (c.expires_at IS NULL OR c.expires_at > now())');
    expect(params).toEqual([4, 20, [3]]);
  });

  test('l acces d urgence ne donne que la synthese, sans ecriture', async () => {
    const db = doctorDb({ care: [], emergency: true });
    expect(await canAccessPatient(doctor, 20, 'view_summary', db)).toMatchObject({ allowed: true, basis: 'emergency_access' });
    expect((await canAccessPatient(doctor, 20, 'view_record', db)).allowed).toBe(false);
    expect((await canAccessPatient(doctor, 20, 'write_clinical', db)).allowed).toBe(false);
    expect(RULES.emergency_access).toEqual(['view_summary']);
  });

  test('seuls le patient et son tuteur verifie gerent les consentements', () => {
    const managers = Object.entries(RULES).filter(([, a]) => a.includes('manage_consent')).map(([b]) => b);
    expect(managers.sort()).toEqual(['guardian_verified', 'self']);
  });
});

describe('Visibilité du dossier partagé', () => {
  const doctorRoutes = (scopes, emergency = false, care = [3]) => [
    ['SELECT DISTINCT a.facility_id', { rows: care.map((facility_id) => ({ facility_id })), rowCount: care.length }],
    ['AS consent_scopes', { rows: [{ consent_scopes: scopes, emergency }], rowCount: 1 }],
  ];
  const listSql = () => calls('FROM patient_allergies e')[0][0];

  test('consentement synthese : informations des autres etablissements, sauf confidentielles', async () => {
    setup(doctorRoutes(['summary']));
    await request(app).get('/api/patients/20/record').set('Authorization', token('doctor', 4));
    expect(listSql()).toContain('(e.facility_id = ANY($2::int[]) OR e.facility_id IS NULL OR NOT e.confidential)');
  });

  test('consentement complet : tout le dossier, y compris confidentiel', async () => {
    setup(doctorRoutes(['full', 'summary']));
    await request(app).get('/api/patients/20/record').set('Authorization', token('doctor', 4));
    expect(listSql()).toContain('(e.facility_id = ANY($2::int[]) OR e.facility_id IS NULL OR true)');
  });

  test('consentement synthese : pas de documents des autres etablissements', async () => {
    setup(doctorRoutes(['summary']));
    await request(app).get('/api/patients/20/documents').set('Authorization', token('doctor', 4));
    const [sql] = calls('FROM medical_documents d').pop();
    expect(sql).toContain('(d.facility_id = ANY($2::int[]) OR d.facility_id IS NULL)');
  });

  test('en urgence, la synthese est lisible mais pas les documents', async () => {
    setup(doctorRoutes(null, true, []));
    const summary = await request(app).get('/api/patients/20/record').set('Authorization', token('doctor', 4));
    expect(summary.status).toBe(200);
    expect(summary.body.access).toMatchObject({ basis: 'emergency_access', canWriteClinical: false });
    expect(listSql()).toContain('OR NOT e.confidential');
    const documents = await request(app).get('/api/patients/20/documents').set('Authorization', token('doctor', 4));
    expect(documents.status).toBe(403);
  });
});

describe('Consentements', () => {
  test('le patient accorde un acces a un etablissement pour 90 jours', async () => {
    setup([
      SELF,
      ["FROM facilities WHERE id = $1 AND status = 'active'", { rows: [{ id: 2 }], rowCount: 1 }],
      ['INSERT INTO record_consents', { rows: [{ id: 5 }], rowCount: 1 }],
      ['FROM record_consents c', { rows: [{ id: 5, scope: 'summary', active: true }], rowCount: 1 }],
    ]);
    const res = await request(app)
      .post('/api/patients/20/consents')
      .set('Authorization', token('patient', 7))
      .send({ facilityId: 2, scope: 'summary', durationDays: 90 });

    expect(res.status).toBe(201);
    expect(calls('UPDATE record_consents SET revoked_at')[0][1]).toEqual([20, 2, 7]);
    expect(calls('INSERT INTO record_consents')[0][1]).toEqual([20, 2, 'summary', 7, 90]);
  });

  test.each([
    [{ facilityId: 2, scope: 'everything' }],
    [{ facilityId: 2, scope: 'full', durationDays: 3650 }],
    [{ scope: 'full' }],
  ])('rejette un consentement invalide %j', async (body) => {
    setup([SELF]);
    const res = await request(app).post('/api/patients/20/consents').set('Authorization', token('patient', 7)).send(body);
    expect(res.status).toBe(400);
  });

  test('un tuteur en attente ne gere pas les consentements', async () => {
    setup([['LEFT JOIN patient_guardians g', { rows: [{ user_id: null, link_status: 'pending' }], rowCount: 1 }]]);
    const res = await request(app).post('/api/patients/20/consents').set('Authorization', token('patient', 7)).send({ facilityId: 2, scope: 'full' });
    expect(res.status).toBe(403);
    expect(calls('INSERT INTO record_consents')).toHaveLength(0);
  });

  test.each(['doctor', 'secretary', 'admin'])('le role %s ne gere pas les consentements', async (role) => {
    setup();
    const res = await request(app).post('/api/patients/20/consents').set('Authorization', token(role, 1)).send({ facilityId: 2, scope: 'full' });
    expect(res.status).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('le patient consulte l historique des acces a son dossier', async () => {
    setup([SELF]);
    const res = await request(app).get('/api/patients/20/access-history').set('Authorization', token('patient', 7));
    expect(res.status).toBe(200);
    const [sql, params] = calls('FROM patient_access_logs l')[0];
    expect(sql).toContain('WHERE l.patient_id = $1');
    expect(params).toEqual([20, 7, 100]);
  });
});

describe('Accès d urgence', () => {
  const emergencyFacility = ["fs.service_code = 'emergency'", { rows: [{ id: 2, name: 'Hopital B' }], rowCount: 1 }];

  test('un medecin sans service d urgences ne peut ni chercher ni ouvrir un dossier', async () => {
    setup();
    const lookup = await request(app).get('/api/emergency/patient-lookup').query({ number: 'CLRDV-P-000001' }).set('Authorization', token('doctor', 4));
    expect(lookup.status).toBe(403);
    const open = await request(app).post('/api/patients/20/emergency-access').set('Authorization', token('doctor', 4)).send({ reason: 'Patient inconscient aux urgences' });
    expect(open.status).toBe(403);
    expect(calls('INSERT INTO emergency_access_sessions')).toHaveLength(0);
  });

  test('la recherche exige un numero patient complet', async () => {
    setup([emergencyFacility]);
    const res = await request(app).get('/api/emergency/patient-lookup').query({ number: 'CLRDV-P-0' }).set('Authorization', token('doctor', 4));
    expect(res.status).toBe(400);
  });

  test('un motif detaille est obligatoire', async () => {
    setup([emergencyFacility]);
    const res = await request(app).post('/api/patients/20/emergency-access').set('Authorization', token('doctor', 4)).send({ reason: 'urgence' });
    expect(res.status).toBe(400);
  });

  test('l ouverture est limitee a 24 h, notifiee au patient et journalisee', async () => {
    setup([
      emergencyFacility,
      ['SELECT id FROM patients WHERE id = $1', { rows: [{ id: 20 }], rowCount: 1 }],
      ['FROM emergency_access_sessions\n      WHERE doctor_user_id', { rows: [{ n: 0 }], rowCount: 1 }],
      ['SELECT first_name, last_name FROM users', { rows: [{ first_name: 'Essai', last_name: 'Urgence' }], rowCount: 1 }],
      ['INSERT INTO emergency_access_sessions', { rows: [{ id: 9, started_at: new Date(), expires_at: new Date() }], rowCount: 1 }],
    ]);
    const res = await request(app)
      .post('/api/patients/20/emergency-access')
      .set('Authorization', token('doctor', 4))
      .send({ reason: 'Patient inconscient amené aux urgences' });

    expect(res.status).toBe(201);
    expect(calls('INSERT INTO emergency_access_sessions')[0][1]).toEqual([20, 4, 2, 'Patient inconscient amené aux urgences', 24]);
    expect(calls('INSERT INTO notifications')).toHaveLength(1);
    expect(calls('INSERT INTO patient_access_logs')[0][1].slice(3, 6)).toEqual(['emergency_access', true, 'emergency_access']);
  });

  test('au-dela de 5 acces d urgence en 24 h, le medecin est bloque', async () => {
    setup([
      emergencyFacility,
      ['SELECT id FROM patients WHERE id = $1', { rows: [{ id: 20 }], rowCount: 1 }],
      ['FROM emergency_access_sessions\n      WHERE doctor_user_id', { rows: [{ n: 5 }], rowCount: 1 }],
    ]);
    const res = await request(app).post('/api/patients/20/emergency-access').set('Authorization', token('doctor', 4)).send({ reason: 'Patient inconscient amené aux urgences' });
    expect(res.status).toBe(429);
  });
});

describe('Migration 013_consents_emergency_access', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', '013_consents_emergency_access.sql'), 'utf8');

  test('un consentement ne peut que etre revoque, jamais modifie ni supprime', () => {
    expect(sql).toContain("Seule la revocation d''un consentement est possible");
    expect(sql).toContain('BEFORE DELETE ON record_consents');
  });

  test('un acces d urgence dure 24 h au plus, avec un motif, et reste trace', () => {
    expect(sql).toContain("expires_at <= started_at + interval '24 hours'");
    expect(sql).toContain('length(trim(reason)) >= 15');
    expect(sql).toContain('BEFORE UPDATE OR DELETE ON emergency_access_sessions');
  });

  test('ne supprime aucune donnee existante', () => {
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b|\bDELETE\s+FROM\b|\bTRUNCATE\b/i);
  });
});
