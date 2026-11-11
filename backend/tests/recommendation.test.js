process.env.JWT_SECRET = 'test-secret';

jest.mock('../src/config/db', () => {
  const query = jest.fn();
  return { query, connect: jest.fn(async () => ({ query, release: jest.fn() })) };
});

jest.mock('../src/services/alternatives.service', () => ({
  ...jest.requireActual('../src/services/alternatives.service'),
  nextSlots: jest.fn(),
}));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const pool = require('../src/config/db');
const alternatives = require('../src/services/alternatives.service');
const { score, WEIGHTS } = require('../src/services/recommendation.service');
const app = require('../src/app');

const token = (role, id = 7) => `Bearer ${jwt.sign({ id, role }, 'test-secret')}`;
const HOUR = 3600000;
const inHours = (h) => new Date(Date.now() + h * HOUR).toISOString();

const doctor = (over) => ({
  doctor_id: 1, first_name: 'Paul', last_name: 'Kabila', specialty: 'Cardiologue', languages: 'fr',
  fee: '20.00', facility_id: 10, facility_name: 'Clinique A', city: 'Lubumbashi', address: null,
  timezone: 'Africa/Lubumbashi', distance_km: null, same_city: false, past_visits: 0, ...over,
});

const setup = ({ candidates = [], slots = {}, specialty = { id: 4, name: 'Cardiologue' }, ownProfile = true } = {}) => {
  pool.query.mockReset();
  pool.query.mockImplementation(async (sql) => {
    if (sql.includes('FROM specialties WHERE id')) return { rows: specialty ? [specialty] : [], rowCount: specialty ? 1 : 0 };
    if (sql.includes('ap WHERE ap.id')) return { rows: ownProfile ? [{}] : [], rowCount: ownProfile ? 1 : 0 };
    if (sql.includes('FROM doctor_affiliations da')) return { rows: candidates, rowCount: candidates.length };
    return { rows: [], rowCount: 0 };
  });
  alternatives.nextSlots.mockReset();
  alternatives.nextSlots.mockImplementation(async (doctorId) => {
    const at = slots[doctorId];
    return at === undefined ? [] : [{ startsAt: at, endsAt: at }];
  });
};

const get = (query, role = 'patient') =>
  request(app).get('/api/recommendations/doctors').query(query).set('Authorization', token(role));

describe('Score de recommandation', () => {
  const now = Date.parse('2026-11-10T08:00:00Z');
  const slotIn = (h) => ({ startsAt: new Date(now + h * HOUR).toISOString() });

  test('les poids totalisent 100', () => {
    expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });

  test('tous les criteres reunis donnent le score maximal', () => {
    const r = score(doctor({ distance_km: '0', past_visits: 2, languages: 'fr, sw' }), slotIn(0), { language: 'sw', now });
    expect(r.score).toBe(100);
    expect(r.reasons).toEqual([
      'Premier créneau libre dans moins de 24 h', 'À 0 km de vous', 'Parle swahili', 'Vous a déjà reçu 2 fois',
    ]);
  });

  test('le delai fait baisser le score jusqu a zero a 14 jours', () => {
    expect(score(doctor(), slotIn(7 * 24), { now }).parts.delay).toBe(20);
    expect(score(doctor(), slotIn(20 * 24), { now }).parts.delay).toBe(0);
  });

  test('distance : proportionnelle, nulle au dela de 30 km, moitie pour la meme ville sans position', () => {
    expect(score(doctor({ distance_km: '15' }), slotIn(1), { now }).parts.distance).toBe(15);
    expect(score(doctor({ distance_km: '45' }), slotIn(1), { now }).parts.distance).toBe(0);
    const city = score(doctor({ same_city: true }), slotIn(1), { now });
    expect(city.parts.distance).toBe(15);
    expect(city.reasons).toContain('Dans votre ville (Lubumbashi)');
  });

  test('la langue n est comptee que si elle est demandee et parlee', () => {
    expect(score(doctor({ languages: 'fr,ln' }), slotIn(1), { language: 'ln', now }).parts.language).toBe(15);
    expect(score(doctor({ languages: 'fr' }), slotIn(1), { language: 'ln', now }).parts.language).toBe(0);
    expect(score(doctor({ languages: 'fr' }), slotIn(1), { now }).parts.language).toBe(0);
  });
});

describe('GET /api/recommendations/doctors', () => {
  test('reserve aux patients connectes', async () => {
    setup();
    expect((await request(app).get('/api/recommendations/doctors?specialtyId=4')).status).toBe(401);
    expect((await get({ specialtyId: 4 }, 'doctor')).status).toBe(403);
  });

  test('classe par score avec les raisons et ignore les medecins sans creneau', async () => {
    setup({
      candidates: [
        doctor({ doctor_id: 1, last_name: 'Loin', distance_km: '28' }),
        doctor({ doctor_id: 2, last_name: 'Suivi', distance_km: '5', past_visits: 1 }),
        doctor({ doctor_id: 3, last_name: 'Complet', distance_km: '1' }),
      ],
      slots: { 1: inHours(2), 2: inHours(72) },
    });
    const res = await get({ specialtyId: 4, lat: -11.66, lng: 27.48 });
    expect(res.status).toBe(200);
    expect(res.body.specialty).toEqual({ id: 4, name: 'Cardiologue' });
    expect(res.body.withoutSlot).toBe(1);
    expect(res.body.doctors.map((d) => d.doctorName)).toEqual(['Dr Paul Suivi', 'Dr Paul Loin']);
    expect(res.body.doctors[0]).toMatchObject({ rank: 1, distanceKm: 5, languages: ['fr'] });
    expect(res.body.doctors[0].reasons).toContain('Vous a déjà reçu en consultation');
    expect(res.body.criteria).toEqual({ position: true, city: null, language: null });
  });

  test('a score egal, le creneau le plus proche passe devant', async () => {
    setup({
      candidates: [doctor({ doctor_id: 1, last_name: 'Tard' }), doctor({ doctor_id: 2, last_name: 'Tot' })],
      slots: { 1: inHours(10), 2: inHours(1) },
    });
    const res = await get({ specialtyId: 4 });
    expect(res.body.doctors.map((d) => d.doctorId)).toEqual([2, 1]);
  });

  test('la position est transmise a la requete et l historique est limite aux profils du patient', async () => {
    setup();
    await get({ specialtyId: 4, lat: -11.66, lng: 27.48, city: 'Lubumbashi' });
    const [sql, params] = pool.query.mock.calls.find(([q]) => q.includes('FROM doctor_affiliations da'));
    expect(params).toEqual([4, 7, null, 'Lubumbashi', -11.66, 27.48]);
    expect(sql).toContain('guardian_user_id = $2');
    expect(sql).toContain("a.status = 'done'");
  });

  test('specialite inconnue : 404', async () => {
    setup({ specialty: null });
    expect((await get({ specialtyId: 99 })).status).toBe(404);
  });

  test('profil qui n appartient pas au patient : 404', async () => {
    setup({ ownProfile: false });
    expect((await get({ specialtyId: 4, profileId: 55 })).status).toBe(404);
  });

  test('parametres invalides refuses', async () => {
    setup();
    expect((await get({})).status).toBe(400);
    expect((await get({ specialtyId: 4, lat: 1 })).status).toBe(400);
    expect((await get({ specialtyId: 4, language: 'français' })).status).toBe(400);
    expect((await get({ specialtyId: 4, sort: 'x' })).status).toBe(400);
  });
});
