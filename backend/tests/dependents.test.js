process.env.JWT_SECRET = 'test-secret';

jest.mock('../src/config/db', () => ({
  query: jest.fn(),
  connect: jest.fn(),
}));

jest.mock('../src/services/slots.service', () => ({
  getAvailableSlots: jest.fn(),
  resolveFacility: jest.fn(async () => ({ id: 1, name: 'Etablissement principal', timezone: 'Africa/Lubumbashi' })),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const pool = require('../src/config/db');
const { getAvailableSlots } = require('../src/services/slots.service');
const { ageOn } = require('../src/services/patients.service');
const app = require('../src/app');

const auth = (role, id = 1) =>
  'Bearer ' + jwt.sign({ id, role }, 'test-secret');

const child = {
  firstName: 'Nathan',
  lastName: 'Mbuyi',
  birthDate: '2019-04-12',
  relationship: 'parent',
};

const makeClient = (handlers) => {
  const client = {
    query: jest.fn(async (sql) => {
      for (const [match, result] of handlers) {
        if (sql.includes(match)) return typeof result === 'function' ? result() : result;
      }
      return { rows: [], rowCount: 0 };
    }),
    release: jest.fn(),
  };
  pool.connect.mockResolvedValue(client);
  return client;
};

beforeEach(() => {
  pool.query.mockReset();
  pool.connect.mockReset();
  getAvailableSlots.mockReset();
  pool.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('Ajout d un enfant ou d une personne a charge', () => {
  test('cree le profil et un lien en attente de verification', async () => {
    const client = makeClient([
      ['FROM users WHERE id = $1', { rows: [{ id: 7 }], rowCount: 1 }],
      ['count(*)::int AS n', { rows: [{ n: 1 }] }],
      ['INSERT INTO patients', {
        rows: [{ id: 20, patient_number: 'CLRDV-P-000020', first_name: 'Nathan', last_name: 'Mbuyi', birth_date: '2019-04-12', sex: null }],
      }],
      ['INSERT INTO patient_guardians', { rows: [{ relationship: 'parent', link_status: 'pending' }] }],
    ]);

    const res = await request(app)
      .post('/api/patients/dependents')
      .set('Authorization', auth('patient', 7))
      .send(child);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ patient_number: 'CLRDV-P-000020', link_status: 'pending' });
    const sqls = client.query.mock.calls.map((c) => c[0]);
    expect(sqls[0]).toBe('BEGIN');
    expect(sqls).toContain('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  test('exige la date de naissance', async () => {
    const { birthDate, ...withoutBirthDate } = child;

    const res = await request(app)
      .post('/api/patients/dependents')
      .set('Authorization', auth('patient', 7))
      .send(withoutBirthDate);

    expect(res.status).toBe(400);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  test('refuse une date de naissance dans le futur', async () => {
    const res = await request(app)
      .post('/api/patients/dependents')
      .set('Authorization', auth('patient', 7))
      .send({ ...child, birthDate: '2999-01-01' });

    expect(res.status).toBe(400);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  test('refuse un enfant majeur declare par un parent', async () => {
    const res = await request(app)
      .post('/api/patients/dependents')
      .set('Authorization', auth('patient', 7))
      .send({ ...child, birthDate: '1990-01-01' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/majeure/);
  });

  test('accepte un majeur sous tutelle legale (verification par le personnel)', async () => {
    makeClient([
      ['FROM users WHERE id = $1', { rows: [{ id: 7 }], rowCount: 1 }],
      ['count(*)::int AS n', { rows: [{ n: 0 }] }],
      ['INSERT INTO patients', { rows: [{ id: 21 }] }],
      ['INSERT INTO patient_guardians', { rows: [{ relationship: 'legal_guardian', link_status: 'pending' }] }],
    ]);

    const res = await request(app)
      .post('/api/patients/dependents')
      .set('Authorization', auth('patient', 7))
      .send({ ...child, birthDate: '1960-01-01', relationship: 'legal_guardian' });

    expect(res.status).toBe(201);
  });

  test('limite le nombre de profils rattaches et annule la transaction', async () => {
    const client = makeClient([
      ['FROM users WHERE id = $1', { rows: [{ id: 7 }], rowCount: 1 }],
      ['count(*)::int AS n', { rows: [{ n: 10 }] }],
    ]);

    const res = await request(app)
      .post('/api/patients/dependents')
      .set('Authorization', auth('patient', 7))
      .send(child);

    expect(res.status).toBe(409);
    const sqls = client.query.mock.calls.map((c) => c[0]);
    expect(sqls).toContain('ROLLBACK');
    expect(sqls.some((s) => s.includes('INSERT INTO patients'))).toBe(false);
  });

  test('refuse les champs inconnus comme un numero patient impose', async () => {
    const res = await request(app)
      .post('/api/patients/dependents')
      .set('Authorization', auth('patient', 7))
      .send({ ...child, patientNumber: 'CLRDV-P-000001' });

    expect(res.status).toBe(400);
  });

  test.each(['doctor', 'secretary', 'admin'])('refuse le role %s', async (role) => {
    const res = await request(app)
      .post('/api/patients/dependents')
      .set('Authorization', auth(role))
      .send(child);

    expect(res.status).toBe(403);
  });
});

describe('Liste des profils du compte', () => {
  test('ne renvoie que les profils lies au compte connecte', async () => {
    const res = await request(app)
      .get('/api/patients/mine')
      .set('Authorization', auth('patient', 7));

    expect(res.status).toBe(200);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain('WHERE p.user_id = $1');
    expect(sql).toContain('WHERE g.guardian_user_id = $1');
    expect(sql).not.toContain("'revoked'");
    expect(params).toEqual([7]);
  });
});

describe('Reservation pour un enfant', () => {
  const booking = {
    doctorId: 2,
    startsAt: '2030-01-07T08:00:00.000Z',
    patientProfileId: 20,
  };

  test.each([
    ['inexistant', []],
    ['non rattache', [{ user_id: 99, link_status: null }]],
    ['au lien refuse', [{ user_id: null, link_status: 'rejected' }]],
    ['au lien revoque', [{ user_id: null, link_status: 'revoked' }]],
  ])('refuse de reserver pour un profil %s', async (_label, rows) => {
    pool.query.mockResolvedValueOnce({ rows, rowCount: rows.length });

    const res = await request(app)
      .post('/api/appointments')
      .set('Authorization', auth('patient', 7))
      .send(booking);

    expect(res.status).toBe(403);
    expect(getAvailableSlots).not.toHaveBeenCalled();
    expect(pool.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO appointments'))).toBe(false);
  });

  test('un lien en attente suffit pour reserver', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ user_id: null, link_status: 'pending' }], rowCount: 1 });
    getAvailableSlots.mockResolvedValue([
      { startsAt: booking.startsAt, endsAt: '2030-01-07T08:30:00.000Z', available: true },
    ]);
    pool.query.mockResolvedValueOnce({ rows: [{ id: 99, patient_id: 7, patient_profile_id: 20 }] });

    const res = await request(app)
      .post('/api/appointments')
      .set('Authorization', auth('patient', 7))
      .send(booking);

    expect(res.status).toBe(201);
    const [checkSql, checkParams] = pool.query.mock.calls[0];
    expect(checkSql).toContain('LEFT JOIN patient_guardians g');
    expect(checkParams).toEqual([7, 20]);
    const insert = pool.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO appointments'));
    expect(insert[1].slice(0, 2)).toEqual([7, 20]);
  });

  test('sans profil indique, reserve pour le titulaire du compte', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 3 }], rowCount: 1 });
    getAvailableSlots.mockResolvedValue([]);

    await request(app)
      .post('/api/appointments')
      .set('Authorization', auth('patient', 7))
      .send({ doctorId: 2, startsAt: booking.startsAt });

    expect(pool.query.mock.calls[0]).toEqual([
      'SELECT id FROM patients WHERE user_id = $1',
      [7],
    ]);
  });
});

describe('Validation des liens par le personnel', () => {
  test('la secretaire valide un lien en attente', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Etablissement principal', city: 'Lubumbashi', status: 'active', role: 'secretary' }], rowCount: 1 });
    pool.query.mockResolvedValueOnce({ rows: [{ id: 4, status: 'verified' }], rowCount: 1 });

    const res = await request(app)
      .patch('/api/admin/guardian-links/4')
      .set('Authorization', auth('secretary', 12))
      .send({ status: 'verified' });

    expect(res.status).toBe(200);
    const [sql, params] = pool.query.mock.calls[1];
    expect(sql).toContain('AND status = ANY($5::text[])');
    expect(params).toEqual(['verified', null, 12, 4, ['pending']]);
  });

  test('un refus exige un motif', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Etablissement principal', city: 'Lubumbashi', status: 'active', role: 'secretary' }], rowCount: 1 });
    const res = await request(app)
      .patch('/api/admin/guardian-links/4')
      .set('Authorization', auth('secretary', 12))
      .send({ status: 'rejected' });

    expect(res.status).toBe(400);
    expect(pool.query.mock.calls.some(([q]) => q.includes('UPDATE patient_guardians'))).toBe(false);
  });

  test('un lien deja traite ne peut pas etre revalide', async () => {
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .patch('/api/admin/guardian-links/4')
      .set('Authorization', auth('admin', 1))
      .send({ status: 'verified' });

    expect(res.status).toBe(409);
  });

  test('un patient ne peut pas valider son propre lien', async () => {
    const res = await request(app)
      .patch('/api/admin/guardian-links/4')
      .set('Authorization', auth('patient', 7))
      .send({ status: 'verified' });

    expect(res.status).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('la liste signale les doublons potentiels au personnel', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Etablissement principal', city: 'Lubumbashi', status: 'active', role: 'secretary' }], rowCount: 1 });
    const res = await request(app)
      .get('/api/admin/guardian-links')
      .set('Authorization', auth('secretary', 12));

    expect(res.status).toBe(200);
    const [sql, params] = pool.query.mock.calls[1];
    expect(sql).toContain('AS possible_duplicates');
    expect(params).toEqual(['pending']);
  });
});

describe('Calcul de l age', () => {
  const today = new Date('2026-11-10T12:00:00Z');

  test.each([
    ['2008-11-10', 18],
    ['2008-11-11', 17],
    ['2019-04-12', 7],
    ['2008-02-29', 18],
  ])('ne le %s, age %i au 10/11/2026', (birth, age) => {
    expect(ageOn(birth, today)).toBe(age);
  });
});
