process.env.JWT_SECRET = 'test-secret';

jest.mock('../src/config/db', () => ({
  query: jest.fn(),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const pool = require('../src/config/db');
const app = require('../src/app');

const token = (role, id = 1) =>
  'Bearer ' + jwt.sign({ id, role }, 'test-secret');

const route = (sqlPart, result) => [sqlPart, result];

const mockDb = (routes) => {
  pool.query.mockImplementation(async (sql) => {
    for (const [part, result] of routes) {
      if (sql.includes(part)) return typeof result === 'function' ? result() : result;
    }
    return { rows: [], rowCount: 0 };
  });
};

const accessRow = (row) => route('LEFT JOIN patient_guardians g', { rows: row ? [row] : [], rowCount: row ? 1 : 0 });
const patientRow = route('FROM patients WHERE id = $1', {
  rows: [{ id: 20, patient_number: 'CLRDV-P-000020', first_name: 'Nathan', last_name: 'Mbuyi' }],
});
const consultations = route('FROM appointments a', {
  rows: [{ appointment_id: 5, notes: 'RAS', prescription: null }],
});

const calls = (part) => pool.query.mock.calls.filter(([sql]) => sql.includes(part));

beforeEach(() => {
  pool.query.mockReset();
  mockDb([]);
});

describe('GET /api/medical-record/me', () => {
  test('refuse les requetes sans authentification', async () => {
    const res = await request(app).get('/api/medical-record/me');
    expect(res.status).toBe(401);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test.each(['doctor', 'secretary', 'admin'])('refuse le role %s', async (role) => {
    const res = await request(app)
      .get('/api/medical-record/me')
      .set('Authorization', token(role));

    expect(res.status).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('renvoie le dossier du profil du titulaire et journalise l acces', async () => {
    mockDb([
      route('SELECT id FROM patients WHERE user_id = $1', { rows: [{ id: 3 }], rowCount: 1 }),
      accessRow({ user_id: 7, link_status: null }),
      consultations,
    ]);

    const res = await request(app)
      .get('/api/medical-record/me')
      .set('Authorization', token('patient', 7));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ appointment_id: 5, notes: 'RAS', prescription: null }]);
    const [, recordParams] = calls('FROM appointments a')[0];
    expect(recordParams).toEqual([3, false]);
    const [, logParams] = calls('INSERT INTO patient_access_logs')[0];
    expect(logParams.slice(0, 6)).toEqual([7, 'patient', 3, 'view_record', true, 'self']);
  });

  test('renvoie une liste vide si le compte n a pas de profil patient', async () => {
    const res = await request(app)
      .get('/api/medical-record/me')
      .set('Authorization', token('patient', 7));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('n expose jamais les fiches de consultation en brouillon', async () => {
    mockDb([
      route('SELECT id FROM patients WHERE user_id = $1', { rows: [{ id: 3 }], rowCount: 1 }),
      accessRow({ user_id: 7, link_status: null }),
    ]);

    await request(app)
      .get('/api/medical-record/me')
      .set('Authorization', token('patient', 7));

    const sql = calls('FROM appointments a')[0][0].replace(/\s+/g, ' ');
    expect(sql).toMatch(
      /LEFT JOIN consultation_notes cn ON cn\.appointment_id = a\.id AND cn\.status = 'completed'/
    );
    expect(sql).toContain('WHERE a.patient_profile_id = $1');
  });
});

describe('GET /api/medical-record/patients/:id', () => {
  const get = (id = 20, user = 7) =>
    request(app)
      .get(`/api/medical-record/patients/${id}`)
      .set('Authorization', token('patient', user));

  test('un parent avec un lien verifie consulte le dossier de son enfant', async () => {
    mockDb([accessRow({ user_id: null, link_status: 'verified' }), patientRow, consultations]);

    const res = await get();

    expect(res.status).toBe(200);
    expect(res.body.patient.patient_number).toBe('CLRDV-P-000020');
    expect(res.body.consultations).toHaveLength(1);
    expect(calls('INSERT INTO patient_access_logs')[0][1].slice(0, 6))
      .toEqual([7, 'patient', 20, 'view_record', true, 'guardian_verified']);
  });

  test('un tuteur verifie ne voit pas les ordonnances confidentielles', async () => {
    mockDb([accessRow({ user_id: null, link_status: 'verified' }), patientRow, consultations]);

    await get();

    const [sql, params] = calls('FROM appointments a')[0];
    expect(sql).toContain('NOT (rx.confidential AND $2::boolean)');
    expect(params).toEqual([20, true]);
  });

  test('un lien en attente ne donne pas acces au dossier, avec un message explicite', async () => {
    mockDb([accessRow({ user_id: null, link_status: 'pending' }), patientRow, consultations]);

    const res = await get();

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/verification du lien/);
    expect(calls('FROM appointments a')).toHaveLength(0);
    expect(calls('INSERT INTO patient_access_logs')[0][1].slice(0, 6))
      .toEqual([7, 'patient', 20, 'view_record', false, 'guardian_pending']);
  });

  test.each(['rejected', 'revoked', null])('un lien %s ne donne aucun acces', async (status) => {
    mockDb([accessRow({ user_id: 99, link_status: status }), patientRow, consultations]);

    const res = await get();

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Acces refuse');
    expect(calls('FROM appointments a')).toHaveLength(0);
  });

  test('un patient inexistant renvoie la meme reponse qu un acces refuse', async () => {
    mockDb([accessRow(null)]);

    const res = await get(999);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Acces refuse');
    expect(calls('INSERT INTO patient_access_logs')).toHaveLength(0);
  });

  test('refuse l acces si la journalisation echoue', async () => {
    mockDb([
      accessRow({ user_id: null, link_status: 'verified' }),
      route('INSERT INTO patient_access_logs', () => { throw new Error('db down'); }),
      patientRow,
      consultations,
    ]);
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await get();

    expect(res.status).toBe(503);
    expect(calls('FROM appointments a')).toHaveLength(0);
    console.error.mockRestore();
  });

  test('rejette un identifiant invalide', async () => {
    const res = await request(app)
      .get('/api/medical-record/patients/abc')
      .set('Authorization', token('patient', 7));

    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test.each(['doctor', 'secretary', 'admin'])('refuse le role %s', async (role) => {
    const res = await request(app)
      .get('/api/medical-record/patients/20')
      .set('Authorization', token(role));

    expect(res.status).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
  });
});
