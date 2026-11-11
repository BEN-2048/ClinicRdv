process.env.JWT_SECRET = 'test-secret';

jest.mock('../src/config/db', () => {
  const query = jest.fn();
  return { query, connect: jest.fn(async () => ({ query, release: jest.fn() })) };
});

const request = require('supertest');
const pool = require('../src/config/db');
const app = require('../src/app');

const SPECIALTIES = [
  { id: 1, name: 'Généraliste' },
  { id: 2, name: 'Pédiatre' },
  { id: 3, name: 'Dentiste' },
  { id: 4, name: 'Cardiologue' },
  { id: 5, name: 'Dermatologue' },
];

const setup = (available = SPECIALTIES) => {
  pool.query.mockReset();
  pool.query.mockImplementation(async (sql, params) => {
    if (sql.includes('FROM specialties')) {
      const rows = available.filter((s) => params[0].includes(s.name));
      return { rows, rowCount: rows.length };
    }
    return { rows: [], rowCount: 0 };
  });
};

const orient = (body) => request(app).post('/api/triage').send(body);

describe('Orientation par symptomes', () => {
  beforeEach(() => setup());

  test('le catalogue est public et contient les signes d alerte', async () => {
    const res = await request(app).get('/api/triage/symptoms');
    expect(res.status).toBe(200);
    expect(res.body.disclaimer).toContain('ne remplace pas un avis médical');
    expect(res.body.redFlags.map((f) => f.code)).toContain('chest_pain');
    expect(res.body.symptoms.length).toBeGreaterThan(10);
    expect(res.body.symptoms[0]).not.toHaveProperty('weights');
  });

  test('un signe grave renvoie vers l urgence sans suggestion ni requete', async () => {
    const res = await orient({ symptoms: ['cough', 'chest_pain'] });
    expect(res.status).toBe(200);
    expect(res.body.urgent).toBe(true);
    expect(res.body.suggestions).toEqual([]);
    expect(res.body.redFlags).toEqual([{ code: 'chest_pain', label: expect.any(String) }]);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('mal de dents oriente vers le dentiste avec une confiance forte', async () => {
    const res = await orient({ symptoms: ['toothache', 'gums'], age: 30 });
    expect(res.body.urgent).toBe(false);
    expect(res.body.suggestions[0]).toMatchObject({ specialtyId: 3, name: 'Dentiste', confidence: 'forte' });
    expect(res.body.suggestions[0].reasons).toEqual(['Mal de dents', 'Gencives qui saignent ou gonflées']);
  });

  test('palpitations et essoufflement placent le cardiologue avant le generaliste', async () => {
    const res = await orient({ symptoms: ['palpitations', 'breathless_effort'], age: 55 });
    expect(res.body.suggestions.map((s) => s.name)).toEqual(['Cardiologue', 'Généraliste']);
  });

  test('un enfant est oriente vers le pediatre', async () => {
    const res = await orient({ symptoms: ['fever', 'cough'], age: 4 });
    expect(res.body.suggestions[0]).toMatchObject({ name: 'Pédiatre', confidence: 'forte' });
    expect(res.body.suggestions[0].reasons).toContain('Patient de moins de 15 ans');
  });

  test('un adulte n est jamais oriente vers le pediatre', async () => {
    const res = await orient({ symptoms: ['fever', 'rash'], age: 40 });
    expect(res.body.suggestions.map((s) => s.name)).not.toContain('Pédiatre');
  });

  test('sans age, le suivi d enfant reste oriente vers le pediatre', async () => {
    const res = await orient({ symptoms: ['child_growth'] });
    expect(res.body.suggestions[0].name).toBe('Pédiatre');
  });

  test('une specialite absente de l etablissement est ignoree, repli sur le generaliste', async () => {
    setup(SPECIALTIES.filter((s) => s.name !== 'Dentiste'));
    const res = await orient({ symptoms: ['toothache'], age: 30 });
    expect(res.body.suggestions).toEqual([
      { specialtyId: 1, name: 'Généraliste', confidence: 'forte', reasons: ['Premier recours pour toute question de santé'] },
    ]);
  });

  test('au plus trois suggestions', async () => {
    const res = await orient({ symptoms: ['fatigue', 'rash', 'toothache', 'palpitations'], age: 30 });
    expect(res.body.suggestions.length).toBeLessThanOrEqual(3);
  });

  test('un code inconnu est refuse', async () => {
    const res = await orient({ symptoms: ['magic'] });
    expect(res.status).toBe(400);
  });

  test('la liste vide et les champs en trop sont refuses', async () => {
    expect((await orient({ symptoms: [] })).status).toBe(400);
    expect((await orient({ symptoms: ['fever'], name: 'x' })).status).toBe(400);
  });
});
