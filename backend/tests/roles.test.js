process.env.JWT_SECRET = 'test-secret';

jest.mock('../src/config/db', () => {
  const query = jest.fn();
  const client = { query, release: jest.fn() };
  return { query, connect: jest.fn(async () => client) };
});

const request = require('supertest');
const jwt = require('jsonwebtoken');
const pool = require('../src/config/db');
const app = require('../src/app');

const token = (role, id = 1) => `Bearer ${jwt.sign({ id, role }, 'test-secret')}`;

beforeEach(() => {
  pool.query.mockReset();
  pool.query.mockResolvedValue({ rows: [{ count: 1, status: 'confirmed', id: 1 }], rowCount: 1 });
});

const staffRoutes = [
  ['get', '/api/admin/dashboard'],
  ['get', '/api/admin/stats'],
  ['get', '/api/admin/patients'],
  ['get', '/api/admin/doctors'],
  ['get', '/api/admin/doctors/1/working-hours'],
  ['get', '/api/admin/appointments'],
  ['patch', '/api/admin/appointments/1/cancel'],
];

describe('routes /api/admin', () => {
  test.each(staffRoutes)('%s %s : 401 sans jeton', async (method, url) => {
    const res = await request(app)[method](url);
    expect(res.status).toBe(401);
  });

  test.each(staffRoutes)('%s %s : 403 pour patient et médecin', async (method, url) => {
    for (const role of ['patient', 'doctor']) {
      const res = await request(app)[method](url).set('Authorization', token(role));
      expect(res.status).toBe(403);
    }
    expect(pool.query).not.toHaveBeenCalled();
  });

  test.each(['secretary', 'admin'])('GET /api/admin/dashboard autorisé pour %s', async (role) => {
    const res = await request(app).get('/api/admin/dashboard').set('Authorization', token(role));
    expect(res.status).toBe(200);
    expect(res.body.today).toBeDefined();
  });

  test('GET /api/admin/appointments renvoie tous les RDV pour le secrétaire', async () => {
    const res = await request(app).get('/api/admin/appointments').set('Authorization', token('secretary'));
    expect(res.status).toBe(200);
    expect(pool.query.mock.calls[0][1]).toEqual([null, null, null, null]);
  });

  test('POST /api/admin/doctors valide les données', async () => {
    const res = await request(app).post('/api/admin/doctors')
      .set('Authorization', token('secretary')).send({ email: 'pas-un-email' });
    expect(res.status).toBe(400);
  });
});

describe('rendez-vous', () => {
  test('annulation par le secrétaire : accès cabinet', async () => {
    await request(app).patch('/api/admin/appointments/5/cancel').set('Authorization', token('secretary', 9));
    expect(pool.query.mock.calls[0][1]).toEqual([5, true, 9]);
  });

  test('annulation par un patient : limitée à ses RDV', async () => {
    await request(app).patch('/api/appointments/5/cancel').set('Authorization', token('patient', 3));
    expect(pool.query.mock.calls[0][1]).toEqual([5, false, 3]);
  });

  test('annulation par un médecin : limitée à ses RDV', async () => {
    await request(app).patch('/api/appointments/5/cancel').set('Authorization', token('doctor', 4));
    expect(pool.query.mock.calls[0][1]).toEqual([5, false, 4]);
  });

  test('report via la route patient interdit au secrétaire', async () => {
    const res = await request(app).patch('/api/appointments/5/reschedule')
      .set('Authorization', token('secretary')).send({ startsAt: '2030-01-01T08:00:00.000Z' });
    expect(res.status).toBe(403);
  });

  test('GET /appointments/mine pour un patient reste filtré sur lui-même', async () => {
    await request(app).get('/api/appointments/mine').set('Authorization', token('patient', 3));
    expect(pool.query.mock.calls[0][0]).toMatch(/a\.patient_id\s*=\s*\$1/);
    expect(pool.query.mock.calls[0][1]).toEqual([3]);
  });
});

describe('tableau de bord médecin', () => {
  test("/doctors/me/dashboard n'est pas capturée par /doctors/:id", async () => {
    const res = await request(app).get('/api/doctors/me/dashboard').set('Authorization', token('patient'));
    expect(res.status).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe('inscription publique', () => {
  test('impossible de choisir le rôle secretary', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 1, email: 'x@y.fr', role: 'patient', first_name: 'A', last_name: 'B' }], rowCount: 1,
    });
    const res = await request(app).post('/api/auth/register').send({
      email: 'x@y.fr', password: 'motdepasse', firstName: 'A', lastName: 'B', role: 'secretary',
    });
    expect(res.status).toBe(201);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("'patient'");
    expect(params).not.toContain('secretary');
    expect(res.body.user.role).toBe('patient');
  });
});
