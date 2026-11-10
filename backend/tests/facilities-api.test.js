process.env.JWT_SECRET = 'test-secret';

jest.mock('../src/config/db', () => ({
  query: jest.fn(),
  connect: jest.fn(),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const pool = require('../src/config/db');
const app = require('../src/app');

const auth = (role = 'patient', id = 7) =>
  'Bearer ' + jwt.sign({ id, role }, 'test-secret');

beforeEach(() => {
  pool.query.mockReset();
  pool.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('GET /api/facilities', () => {
  test('exige une authentification', async () => {
    const res = await request(app).get('/api/facilities');
    expect(res.status).toBe(401);
  });

  test('ne liste que les etablissements actifs et applique les filtres', async () => {
    const res = await request(app)
      .get('/api/facilities')
      .query({ q: ' sendwe ', city: 'Lubumbashi', specialtyId: '2', service: 'emergency' })
      .set('Authorization', auth());

    expect(res.status).toBe(200);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("WHERE f.status = 'active'");
    expect(params).toEqual(['sendwe', 'Lubumbashi', 2, 'emergency', 30]);
    expect(sql).not.toContain('acos');
  });

  test('trie par distance quand la position est fournie', async () => {
    await request(app)
      .get('/api/facilities')
      .query({ lat: '-11.66', lng: '27.48' })
      .set('Authorization', auth());

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain('acos');
    expect(sql).toContain('ORDER BY distance_km NULLS LAST');
    expect(params.slice(5)).toEqual([-11.66, 27.48]);
  });

  test.each([
    [{ lat: '-11.66' }],
    [{ lat: '200', lng: '27' }],
    [{ service: "x'; DROP TABLE users;--" }],
    [{ limit: '500' }],
  ])('rejette des parametres invalides %j', async (query) => {
    const res = await request(app).get('/api/facilities').query(query).set('Authorization', auth());
    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe('GET /api/facilities/:id', () => {
  test('renvoie 404 pour un etablissement inactif ou inexistant', async () => {
    const res = await request(app).get('/api/facilities/9').set('Authorization', auth());
    expect(res.status).toBe(404);
    expect(pool.query.mock.calls[0][0]).toContain("status = 'active'");
  });

  test('assemble la fiche avec horaires, services, specialites et medecins actifs', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Etablissement principal', timezone: 'Africa/Lubumbashi' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ weekday: 1, opensAt: '08:00', closesAt: '17:00' }] })
      .mockResolvedValueOnce({ rows: [{ code: 'emergency', name: 'Urgences', available_24h: true }] })
      .mockResolvedValueOnce({ rows: [{ id: 2, name: 'Pédiatre' }] })
      .mockResolvedValueOnce({ rows: [{ id: 4, first_name: 'Dr.', last_name: 'Mutombo', fee: '25.00' }] });

    const res = await request(app).get('/api/facilities/1').set('Authorization', auth());

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 1,
      opening_hours: [{ weekday: 1 }],
      services: [{ code: 'emergency' }],
      specialties: [{ name: 'Pédiatre' }],
      doctors: [{ id: 4, fee: '25.00' }],
    });
    const doctorsSql = pool.query.mock.calls[4][0];
    expect(doctorsSql).toContain("da.status = 'active' AND d.active");
    expect(doctorsSql).toContain('COALESCE(da.fee, d.fee)');
  });

  test('rejette un identifiant non numerique', async () => {
    const res = await request(app).get('/api/facilities/abc').set('Authorization', auth());
    expect(res.status).toBe(400);
  });
});

describe('Medecins et etablissements', () => {
  test('filtre les medecins par etablissement actif', async () => {
    await request(app).get('/api/doctors').query({ facilityId: '3' }).set('Authorization', auth());
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("f.status = 'active'");
    expect(sql).toContain('AS facilities');
    expect(params).toEqual([null, null, 3]);
  });

  test('un identifiant de medecin non numerique est refuse', async () => {
    const res = await request(app).get('/api/doctors/abc').set('Authorization', auth());
    expect(res.status).toBe(400);
  });
});
