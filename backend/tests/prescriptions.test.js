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

const token = (role, id) => `Bearer ${jwt.sign({ id, role }, 'test-secret')}`;

const setup = (routes = []) => {
  pool.query.mockReset();
  pool.query.mockImplementation(async (sql) => {
    for (const [part, result] of routes) {
      if (sql.includes(part)) return typeof result === 'function' ? result(sql) : result;
    }
    return { rows: [], rowCount: 0 };
  });
};

const calls = (part) => pool.query.mock.calls.filter(([sql]) => sql.includes(part));
const item = { medicationName: 'Amoxicilline', dosage: '500 mg' };

describe('Rédaction des ordonnances', () => {
  test.each(['patient', 'secretary', 'admin'])('le role %s ne peut pas rediger d ordonnance', async (role) => {
    setup();
    const res = await request(app).post('/api/appointments/5/prescriptions').set('Authorization', token(role, 1)).send({ items: [item] });
    expect(res.status).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('un medecin ne redige que pour ses propres rendez-vous', async () => {
    setup();
    const res = await request(app).post('/api/appointments/5/prescriptions').set('Authorization', token('doctor', 4)).send({ items: [item] });
    expect(res.status).toBe(404);
    expect(calls('INSERT INTO prescriptions')).toHaveLength(0);
    const [sql, params] = calls('FROM appointments a')[0];
    expect(sql).toContain('d.user_id = $2');
    expect(sql).toContain("da.status = 'active'");
    expect(params).toEqual([5, 4]);
  });

  test('pas d ordonnance sur un rendez-vous annule', async () => {
    setup([['FROM appointments a', { rows: [{ id: 5, status: 'cancelled' }], rowCount: 1 }]]);
    const res = await request(app).post('/api/appointments/5/prescriptions').set('Authorization', token('doctor', 4)).send({ items: [item] });
    expect(res.status).toBe(409);
  });

  test.each([
    [{ items: [] }],
    [{ items: [{ medicationName: '' }] }],
    [{ items: [{ ...item, unknown: 1 }] }],
    [{ items: Array.from({ length: 31 }, () => item) }],
  ])('rejette une ordonnance invalide %#', async (body) => {
    setup();
    const res = await request(app).post('/api/appointments/5/prescriptions').set('Authorization', token('doctor', 4)).send(body);
    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('seul le prescripteur emet ou annule son ordonnance', async () => {
    setup();
    const res = await request(app).post('/api/prescriptions/9/issue').set('Authorization', token('doctor', 4)).send({});
    expect(res.status).toBe(404);
    const [sql, params] = calls('FROM prescriptions rx')[0];
    expect(sql).toContain('rx.prescriber_user_id = $2');
    expect(params).toEqual([9, 4]);
  });

  test('l annulation exige un motif', async () => {
    setup();
    const res = await request(app).post('/api/prescriptions/9/cancel').set('Authorization', token('doctor', 4)).send({});
    expect(res.status).toBe(400);
  });

  test('une ordonnance emise ne repasse pas en brouillon', async () => {
    setup([['FROM prescriptions rx', { rows: [{ id: 9, status: 'issued', patient_id: 20, timezone: 'Africa/Lubumbashi' }], rowCount: 1 }]]);
    const res = await request(app).put('/api/prescriptions/9').set('Authorization', token('doctor', 4)).send({ notes: 'x' });
    expect(res.status).toBe(409);
    expect(calls('UPDATE prescriptions')).toHaveLength(0);
  });
});

describe('Consultation des ordonnances', () => {
  const access = (row) => ['LEFT JOIN patient_guardians g', { rows: [row], rowCount: 1 }];

  test('le patient ne voit pas les brouillons', async () => {
    setup([access({ user_id: 7, link_status: null })]);
    const res = await request(app).get('/api/patients/20/prescriptions').set('Authorization', token('patient', 7));
    expect(res.status).toBe(200);
    const sql = calls('FROM prescriptions rx').pop()[0];
    expect(sql).toContain("rx.status <> 'draft'");
    expect(sql).not.toContain('NOT rx.confidential');
  });

  test('un tuteur verifie ne voit ni brouillons ni ordonnances confidentielles', async () => {
    setup([access({ user_id: null, link_status: 'verified' })]);
    await request(app).get('/api/patients/20/prescriptions').set('Authorization', token('patient', 7));
    const sql = calls('FROM prescriptions rx').pop()[0];
    expect(sql).toContain("rx.status <> 'draft' AND NOT rx.confidential");
  });

  test('le medecin traitant voit ses etablissements et seulement ses propres brouillons', async () => {
    setup([['SELECT DISTINCT a.facility_id', { rows: [{ facility_id: 3 }], rowCount: 1 }]]);
    await request(app).get('/api/patients/20/prescriptions').set('Authorization', token('doctor', 4));
    const [sql, params] = calls('FROM prescriptions rx').pop();
    expect(sql).toContain("rx.facility_id = ANY($2::int[]) AND (rx.status <> 'draft' OR rx.prescriber_user_id = $3)");
    expect(params).toEqual([20, [3], 4]);
  });

  test('le personnel administratif n a pas acces aux ordonnances', async () => {
    setup();
    const res = await request(app).get('/api/patients/20/prescriptions').set('Authorization', token('secretary', 1));
    expect(res.status).toBe(403);
  });
});

describe('Historique des consultations et complements', () => {
  test('seul un medecin consulte l historique, limite a ses etablissements de soins', async () => {
    setup([['SELECT DISTINCT a.facility_id', { rows: [{ facility_id: 3 }], rowCount: 1 }]]);
    const res = await request(app).get('/api/patients/20/consultations').set('Authorization', token('doctor', 4));
    expect(res.status).toBe(200);
    const [sql, params] = calls('JOIN consultation_notes c')[0];
    expect(sql).toContain("c.status = 'completed'");
    expect(sql).toContain('a.facility_id = ANY($2::int[])');
    expect(params).toEqual([20, [3]]);
  });

  test.each(['patient', 'secretary'])('le role %s n a pas acces a l historique clinique', async (role) => {
    setup();
    const res = await request(app).get('/api/patients/20/consultations').set('Authorization', token(role, 7));
    expect(res.status).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('un complement exige un contenu', async () => {
    setup();
    const res = await request(app).post('/api/appointments/5/consultation/addenda').set('Authorization', token('doctor', 4)).send({ content: '  ' });
    expect(res.status).toBe(400);
  });

  test('pas de complement sur une consultation non terminee', async () => {
    setup([
      ['FROM appointments a', { rows: [{ id: 5, status: 'confirmed', patient_profile_id: 20 }], rowCount: 1 }],
      ['FROM consultation_notes', { rows: [{ status: 'draft' }], rowCount: 1 }],
    ]);
    const res = await request(app).post('/api/appointments/5/consultation/addenda').set('Authorization', token('doctor', 4)).send({ content: 'Note' });
    expect(res.status).toBe(409);
    expect(calls('INSERT INTO consultation_addenda')).toHaveLength(0);
  });
});

describe('Migration 011_prescriptions_addenda', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', '011_prescriptions_addenda.sql'), 'utf8');

  test('verrouille les ordonnances emises, leurs lignes et les complements', () => {
    expect(sql).toContain('Une ordonnance emise ou annulee ne peut plus etre modifiee');
    expect(sql).toContain('BEFORE INSERT OR UPDATE OR DELETE ON prescription_items');
    expect(sql).toContain('BEFORE UPDATE OR DELETE ON consultation_addenda');
    expect(sql).toContain('BEFORE DELETE ON prescriptions');
  });

  test('ne supprime aucune donnee existante', () => {
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b|\bDELETE\s+FROM\b|\bTRUNCATE\b/i);
  });
});
