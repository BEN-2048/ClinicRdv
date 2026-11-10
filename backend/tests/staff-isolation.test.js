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

const token = (role, id = 50) => `Bearer ${jwt.sign({ id, role }, 'test-secret')}`;

const membership = (facilities) => ({
  rows: facilities.map(([id, role]) => ({ id, name: `E${id}`, city: 'X', status: 'active', role })),
  rowCount: facilities.length,
});

const setup = ({ facilities = [[1, 'secretary']] } = {}) => {
  pool.query.mockReset();
  pool.query.mockImplementation(async (sql) => {
    if (sql.includes('FROM facility_members m')) return membership(facilities);
    if (sql.includes('count(') && !/^\s*(INSERT|UPDATE|DELETE)/i.test(sql)) return { rows: [{ count: 0 }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
};

const mutations = () =>
  pool.query.mock.calls
    .map(([sql]) => sql.trim())
    .filter((sql) => /^(INSERT|UPDATE|DELETE)\b/i.test(sql));

const OTHER_DOCTOR = 77;
const OTHER_APPOINTMENT = 88;
const OTHER_FACILITY = 2;

const doctorRoutes = [
  ['get', `/api/admin/doctors/${OTHER_DOCTOR}`],
  ['patch', `/api/admin/doctors/${OTHER_DOCTOR}`, { firstName: 'X' }],
  ['get', `/api/admin/doctors/${OTHER_DOCTOR}/working-hours`],
  ['put', `/api/admin/doctors/${OTHER_DOCTOR}/working-hours`, { hours: [], consultationMinutes: 30 }],
  ['get', `/api/admin/doctors/${OTHER_DOCTOR}/leaves`],
  ['post', `/api/admin/doctors/${OTHER_DOCTOR}/leaves`, { startDate: '2030-01-01', endDate: '2030-01-02' }],
  ['delete', `/api/admin/doctors/${OTHER_DOCTOR}/leaves/3`],
  ['get', `/api/admin/doctors/${OTHER_DOCTOR}/blocked-slots`],
  ['post', `/api/admin/doctors/${OTHER_DOCTOR}/blocked-slots`, {
    startsAt: '2030-01-01T08:00:00.000Z', endsAt: '2030-01-01T09:00:00.000Z',
  }],
  ['delete', `/api/admin/doctors/${OTHER_DOCTOR}/blocked-slots/3`],
];

const appointmentRoutes = [
  ['patch', `/api/admin/appointments/${OTHER_APPOINTMENT}/cancel`],
  ['patch', `/api/admin/appointments/${OTHER_APPOINTMENT}/reschedule`, { startsAt: '2030-01-01T08:00:00.000Z' }],
];

const facilityRoutes = [
  ['get', `/api/admin/facilities/${OTHER_FACILITY}`],
  ['patch', `/api/admin/facilities/${OTHER_FACILITY}`, { name: 'Pirate' }],
  ['put', `/api/admin/facilities/${OTHER_FACILITY}/services`, { services: [] }],
  ['put', `/api/admin/facilities/${OTHER_FACILITY}/opening-hours`, { hours: [] }],
  ['put', `/api/admin/facilities/${OTHER_FACILITY}/specialties`, { specialtyIds: [] }],
  ['post', `/api/admin/facilities/${OTHER_FACILITY}/members`, { email: 'x@example.com', role: 'secretary' }],
  ['delete', `/api/admin/facilities/${OTHER_FACILITY}/members/4`],
  ['post', `/api/admin/facilities/${OTHER_FACILITY}/doctors`, { doctorId: 3 }],
  ['patch', `/api/admin/facilities/${OTHER_FACILITY}/doctors/3`, { status: 'inactive' }],
];

const call = (method, url, body) => {
  const r = request(app)[method](url).set('Authorization', token('secretary'));
  return body ? r.send(body) : r;
};

describe('Isolement des données entre établissements', () => {
  test.each([...doctorRoutes, ...appointmentRoutes, ...facilityRoutes].map(([m, u, b]) => [m, u, b ?? null]))(
    'secrétaire de l établissement 1 : %s %s refusé sans modification',
    async (method, url, body) => {
      setup();
      const res = await call(method, url, body);
      expect([403, 404]).toContain(res.status);
      expect(mutations()).toEqual([]);
    }
  );

  test('un secrétaire sans établissement rattaché est refusé partout', async () => {
    setup({ facilities: [] });
    for (const url of ['/api/admin/dashboard', '/api/admin/appointments', '/api/admin/doctors', '/api/admin/stats']) {
      const res = await request(app).get(url).set('Authorization', token('secretary'));
      expect([url, res.status]).toEqual([url, 403]);
    }
  });

  test.each([
    ['/api/admin/dashboard'],
    ['/api/admin/stats'],
    ['/api/admin/appointments'],
    ['/api/admin/doctors'],
    ['/api/admin/patients'],
    ['/api/admin/facilities'],
  ])('%s filtre sur les établissements du secrétaire', async (url) => {
    setup();
    const res = await request(app).get(url).set('Authorization', token('secretary'));
    expect(res.status).toBe(200);
    const dataQueries = pool.query.mock.calls.filter(([sql]) => !sql.includes('WHERE m.user_id = $1'));
    expect(dataQueries.length).toBeGreaterThan(0);
    for (const [, params] of dataQueries) {
      expect(params).toContainEqual([1]);
    }
  });

  test('l annulation par la route patient reste limitée aux établissements du secrétaire', async () => {
    setup();
    await request(app).patch(`/api/appointments/${OTHER_APPOINTMENT}/cancel`).set('Authorization', token('secretary'));
    const update = pool.query.mock.calls.find(([sql]) => sql.includes('UPDATE appointments'));
    expect(update[0]).toContain('facility_id = ANY($4::int[])');
    expect(update[1]).toEqual([OTHER_APPOINTMENT, true, 50, [1]]);
  });
});

describe('Rôles de gestion des établissements', () => {
  test('seule la plateforme crée un établissement', async () => {
    setup({ facilities: [[1, 'facility_admin']] });
    const res = await call('post', '/api/admin/facilities', { name: 'Nouveau', type: 'clinic', timezone: 'Africa/Kinshasa' });
    expect(res.status).toBe(403);
    expect(mutations()).toEqual([]);
  });

  test('un secrétaire simple ne modifie pas la fiche de son établissement', async () => {
    setup({ facilities: [[1, 'secretary']] });
    const res = await call('patch', '/api/admin/facilities/1', { phone: '+243' });
    expect(res.status).toBe(403);
    expect(mutations()).toEqual([]);
  });

  test('un administrateur d établissement ne change ni le statut ni le fuseau', async () => {
    setup({ facilities: [[1, 'facility_admin']] });
    for (const body of [{ status: 'active' }, { timezone: 'Africa/Kinshasa' }]) {
      const res = await call('patch', '/api/admin/facilities/1', body);
      expect(res.status).toBe(403);
    }
    expect(mutations()).toEqual([]);
  });

  test('un administrateur d établissement ne nomme pas d autre administrateur', async () => {
    setup({ facilities: [[1, 'facility_admin']] });
    const res = await call('post', '/api/admin/facilities/1/members', { email: 'x@example.com', role: 'facility_admin' });
    expect(res.status).toBe(403);
    expect(mutations()).toEqual([]);
  });

  test('un administrateur d établissement modifie la fiche de son établissement', async () => {
    setup({ facilities: [[1, 'facility_admin']] });
    pool.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM facility_members m')) return membership([[1, 'facility_admin']]);
      if (sql.startsWith('UPDATE facilities')) return { rows: [], rowCount: 1 };
      if (sql.includes('SELECT * FROM facilities')) return { rows: [{ id: 1, name: 'E1' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    const res = await call('patch', '/api/admin/facilities/1', { phone: '+243 99 000 0000' });
    expect(res.status).toBe(200);
    expect(res.body.can_manage).toBe(true);
    expect(mutations()).toHaveLength(1);
  });

  test('l administrateur de la plateforme voit tous les établissements', async () => {
    setup();
    const res = await request(app).get('/api/admin/me/scope').set('Authorization', token('admin'));
    expect(res.body).toEqual({ platformAdmin: true, facilities: null });
    expect(pool.query).not.toHaveBeenCalled();
  });
});
