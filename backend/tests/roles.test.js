process.env.JWT_SECRET = 'test-secret';
process.env.OTP_SECRET = 'test-otp-secret';
process.env.BREVO_API_KEY = 'test-brevo-key';
process.env.BREVO_SENDER_EMAIL = 'test@example.com';

jest.mock('../src/config/db', () => {
  const query = jest.fn();
  const clientQuery = jest.fn();
  const client = { query: clientQuery, release: jest.fn() };

  return {
    query,
    connect: jest.fn(async () => client),
    __clientQuery: clientQuery,
  };
});

jest.mock('@getbrevo/brevo', () => ({
  BrevoClient: jest.fn().mockImplementation(() => ({
    transactionalEmails: {
      sendTransacEmail: jest.fn().mockResolvedValue({
        data: { messageId: 'test-message-id' },
      }),
    },
  })),
}));
const request = require('supertest');
const jwt = require('jsonwebtoken');
const pool = require('../src/config/db');
const clientQuery = pool.__clientQuery;
const app = require('../src/app');

const token = (role, id = 1) => `Bearer ${jwt.sign({ id, role }, 'test-secret')}`;

beforeEach(() => {
  pool.query.mockReset();
  clientQuery.mockReset();
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

  test('GET /api/admin/appointments limite le secrétaire à ses établissements', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Etablissement principal', city: 'Lubumbashi', status: 'active', role: 'secretary' }], rowCount: 1 });
    const res = await request(app).get('/api/admin/appointments').set('Authorization', token('secretary'));
    expect(res.status).toBe(200);
    expect(pool.query.mock.calls[1][1]).toEqual([null, null, null, null, [1], null]);
  });

  test('GET /api/admin/appointments voit tous les établissements pour l administrateur de la plateforme', async () => {
    await request(app).get('/api/admin/appointments').set('Authorization', token('admin'));
    expect(pool.query.mock.calls[0][1]).toEqual([null, null, null, null, null, null]);
  });

  test('POST /api/admin/doctors valide les données', async () => {
    const res = await request(app).post('/api/admin/doctors')
      .set('Authorization', token('secretary')).send({ email: 'pas-un-email' });
    expect(res.status).toBe(400);
  });
});

describe('rendez-vous', () => {
  test('annulation par le secrétaire : limitée à ses établissements', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Etablissement principal', city: 'Lubumbashi', status: 'active', role: 'secretary' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{}], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Etablissement principal', city: 'Lubumbashi', status: 'active', role: 'secretary' }], rowCount: 1 });
    await request(app).patch('/api/admin/appointments/5/cancel').set('Authorization', token('secretary', 9));
    const update = pool.query.mock.calls.find(([q]) => q.includes('UPDATE appointments'));
    expect(update[1]).toEqual([5, true, 9, [1], 'facility', 'other', null]);
  });

  test('annulation par un patient : limitée à ses RDV', async () => {
    await request(app).patch('/api/appointments/5/cancel').set('Authorization', token('patient', 3));
    expect(pool.query.mock.calls[0][1]).toEqual([5, false, 3, null, 'patient', 'patient_request', null]);
  });

  test('annulation par un médecin : limitée à ses RDV', async () => {
    await request(app).patch('/api/appointments/5/cancel').set('Authorization', token('doctor', 4));
    expect(pool.query.mock.calls[0][1]).toEqual([5, false, 4, null, 'doctor', 'other', null]);
  });

  test('report via la route patient interdit au secrétaire', async () => {
    const res = await request(app).patch('/api/appointments/5/reschedule')
      .set('Authorization', token('secretary')).send({ startsAt: '2030-01-01T08:00:00.000Z' });
    expect(res.status).toBe(403);
  });

  test('GET /appointments/mine pour un patient reste filtré sur ses profils accessibles', async () => {
    await request(app).get('/api/appointments/mine').set('Authorization', token('patient', 3));
    const sql = pool.query.mock.calls[0][0].replace(/\s+/g, ' ');
    expect(sql).toContain('a.patient_profile_id IN ( SELECT p.id FROM patients p WHERE p.user_id = $1');
    expect(sql).toContain("g.guardian_user_id = $1 AND g.status IN ('pending', 'verified')");
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
  test('impossible de choisir le role secretary', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    clientQuery.mockImplementation(async (sql) =>
      sql.includes('INSERT INTO users') ? { rows: [{ id: 1 }], rowCount: 1 } : { rows: [], rowCount: 0 }
    );

    const res = await request(app).post('/api/auth/register').send({
      phone: '081 234 5678',
      email: 'x@y.fr',
      password: 'motdepasse',
      firstName: 'A',
      lastName: 'B',
      role: 'secretary',
    });
    console.log.mockRestore();

    expect(res.status).toBe(201);

    const insert = clientQuery.mock.calls.find(
      ([sql]) => sql.includes('INSERT INTO users')
    );

    expect(insert).toBeDefined();
    expect(insert[0]).toContain("'patient'");
    expect(insert[0]).toContain('is_verified');
    expect(insert[0]).toContain('FALSE');
    expect(insert[1]).not.toContain('secretary');

    expect(res.body.phone).toBe('+243812345678');
    expect(res.body.verification).toBe('sms');
    expect(res.body.token).toBeUndefined();
    expect(res.body.user).toBeUndefined();
  });
});