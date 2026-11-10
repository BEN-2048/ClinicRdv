process.env.JWT_SECRET = 'test-secret';

jest.mock('../src/config/db', () => {
  const query = jest.fn();
  return { query, connect: jest.fn(async () => ({ query, release: jest.fn() })) };
});

const jwt = require('jsonwebtoken');
const request = require('supertest');
const pool = require('../src/config/db');
const app = require('../src/app');

const token = (role, id = 1) => `Bearer ${jwt.sign({ id, role }, 'test-secret')}`;
const setup = (routes = []) => {
  pool.query.mockReset();
  pool.query.mockImplementation(async (sql, params) => {
    for (const [part, result] of routes) if (sql.includes(part)) return typeof result === 'function' ? result(sql, params) : result;
    return { rows: [], rowCount: 0 };
  });
};
const calls = (part) => pool.query.mock.calls.filter(([sql]) => sql.includes(part));
const NUMBER = { label: 'Protection civile', number: '112', source: 'Arrêté provincial n° 12/2026', verifiedAt: '2026-11-01' };

describe('Annuaire d urgence public', () => {
  test('accessible sans compte, avec l avertissement et les numeros actifs seulement', async () => {
    setup([
      ['FROM emergency_numbers WHERE active', { rows: [{ id: 1, label: 'Protection civile', number: '112' }], rowCount: 1 }],
      ['FROM facilities f', { rows: [{ id: 3, name: 'Hôpital Sendwe', latitude: '-11.66', longitude: '27.48', distance_km: '2.4' }], rowCount: 1 }],
    ]);
    const res = await request(app).get('/api/emergency/directory?lat=-11.7&lng=27.5');
    expect(res.status).toBe(200);
    expect(res.body.disclaimer).toContain('ne remplace pas les services d’urgence');
    expect(res.body.numbers).toHaveLength(1);
    expect(res.body.facilities[0]).toMatchObject({ latitude: -11.66, longitude: 27.48, distance_km: 2.4 });
    expect(res.headers['cache-control']).toContain('max-age=300');
  });

  test('ne liste que les services d urgence actifs et disponibles, classes par distance', async () => {
    setup();
    await request(app).get('/api/emergency/directory?lat=-11.7&lng=27.5&city=Lubumbashi');
    const [sql, params] = calls('FROM facilities f')[0];
    expect(sql).toContain("fs.service_code = 'emergency'");
    expect(sql).toContain("f.status = 'active'");
    expect(sql).toContain('fs.unavailable_until IS NULL OR fs.unavailable_until <= now()');
    expect(sql).toMatch(/ORDER BY distance_km NULLS LAST/);
    expect(params).toEqual([-11.7, 27.5, 'Lubumbashi']);
  });

  test('sans position, classement par ville', async () => {
    setup();
    await request(app).get('/api/emergency/directory?city=Likasi');
    const [sql, params] = calls('FROM facilities f')[0];
    expect(sql).toContain('NULL::numeric AS distance_km');
    expect(params).toEqual(['Likasi']);
  });

  test('refuse une position incomplete', async () => {
    setup();
    expect((await request(app).get('/api/emergency/directory?lat=1')).status).toBe(400);
  });

  test('aucune donnee de patient n est lue', async () => {
    setup();
    await request(app).get('/api/emergency/directory');
    const sql = pool.query.mock.calls.map(([q]) => q).join('\n');
    expect(sql).not.toMatch(/patients|appointments|users/);
  });
});

describe('Numéros d urgence gérés par l administrateur', () => {
  test('reserve a l administrateur de la plateforme', async () => {
    setup([['FROM facility_members m', { rows: [{ id: 1, name: 'E', city: 'L', status: 'active', role: 'facility_admin' }], rowCount: 1 }]]);
    const res = await request(app).post('/api/admin/emergency-numbers').set('Authorization', token('secretary', 9)).send(NUMBER);
    expect(res.status).toBe(403);
    expect(calls('INSERT INTO emergency_numbers')).toHaveLength(0);
  });

  test('la source et la date de verification sont obligatoires', async () => {
    setup();
    const { source, ...noSource } = NUMBER;
    expect((await request(app).post('/api/admin/emergency-numbers').set('Authorization', token('admin')).send(noSource)).status).toBe(400);
    expect((await request(app).post('/api/admin/emergency-numbers').set('Authorization', token('admin'))
      .send({ ...NUMBER, verifiedAt: '2999-01-01' })).status).toBe(400);
    expect((await request(app).post('/api/admin/emergency-numbers').set('Authorization', token('admin'))
      .send({ ...NUMBER, number: 'appelez-nous' })).status).toBe(400);
  });

  test('enregistre qui a verifie le numero', async () => {
    setup([['INSERT INTO emergency_numbers', { rows: [{ id: 5, ...NUMBER }], rowCount: 1 }]]);
    const res = await request(app).post('/api/admin/emergency-numbers').set('Authorization', token('admin', 42)).send(NUMBER);
    expect(res.status).toBe(201);
    expect(calls('INSERT INTO emergency_numbers')[0][1]).toEqual(['Protection civile', '112', null, 'Arrêté provincial n° 12/2026', '2026-11-01', 42, 0]);
  });

  test('desactiver ou supprimer un numero inconnu renvoie 404', async () => {
    setup();
    expect((await request(app).patch('/api/admin/emergency-numbers/9').set('Authorization', token('admin')).send({ active: false })).status).toBe(404);
    expect((await request(app).delete('/api/admin/emergency-numbers/9').set('Authorization', token('admin'))).status).toBe(404);
  });
});
