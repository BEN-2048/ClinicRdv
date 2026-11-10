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

beforeEach(() => {
  pool.query.mockReset();
  pool.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('GET /api/medical-record/me', () => {
  test('refuse les requetes sans authentification', async () => {
    const res = await request(app).get('/api/medical-record/me');
    expect(res.status).toBe(401);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test.each(['doctor', 'secretary', 'admin'])(
    'refuse le role %s',
    async (role) => {
      const res = await request(app)
        .get('/api/medical-record/me')
        .set('Authorization', token(role));

      expect(res.status).toBe(403);
      expect(pool.query).not.toHaveBeenCalled();
    }
  );

  test('filtre les consultations selon le patient connecte', async () => {
    const res = await request(app)
      .get('/api/medical-record/me')
      .set('Authorization', token('patient', 7));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query.mock.calls[0][0]).toContain('a.patient_id = $1');
    expect(pool.query.mock.calls[0][1]).toEqual([7]);
  });

  test('n expose jamais les fiches de consultation en brouillon', async () => {
    await request(app)
      .get('/api/medical-record/me')
      .set('Authorization', token('patient', 7));

    const sql = pool.query.mock.calls[0][0].replace(/\s+/g, ' ');
    expect(sql).toMatch(
      /LEFT JOIN consultation_notes cn ON cn\.appointment_id = a\.id AND cn\.status = 'completed'/
    );
  });
});
