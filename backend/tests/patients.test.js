process.env.JWT_SECRET = 'test-secret';

jest.mock('../src/config/db', () => ({
  query: jest.fn(),
  connect: jest.fn(),
}));

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const pool = require('../src/config/db');
const app = require('../src/app');

const auth = (role, id = 1) =>
  'Bearer ' + jwt.sign({ id, role }, 'test-secret');

const profile = {
  id: 7,
  email: 'patient@example.com',
  role: 'patient',
  first_name: 'Amina',
  last_name: 'Kabila',
  phone: null,
  created_at: '2026-11-01T00:00:00.000Z',
  patient_id: 3,
  patient_number: 'CLRDV-P-000003',
};

beforeEach(() => {
  pool.query.mockReset();
  pool.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('Numero patient dans le profil', () => {
  test('GET /users/me renvoie le numero patient', async () => {
    pool.query.mockResolvedValueOnce({ rows: [profile] });

    const res = await request(app)
      .get('/api/users/me')
      .set('Authorization', auth('patient', 7));

    expect(res.status).toBe(200);
    expect(res.body.user.patient_number).toBe('CLRDV-P-000003');
    expect(pool.query.mock.calls[0][0]).toContain('LEFT JOIN patients p ON p.user_id = u.id');
    expect(pool.query.mock.calls[0][1]).toEqual([7]);
  });

  test('PATCH /users/me conserve le numero patient dans la reponse', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 7 }] })
      .mockResolvedValueOnce({ rows: [{ ...profile, first_name: 'Grace' }] });

    const res = await request(app)
      .patch('/api/users/me')
      .set('Authorization', auth('patient', 7))
      .send({ firstName: 'Grace' });

    expect(res.status).toBe(200);
    expect(res.body.user.first_name).toBe('Grace');
    expect(res.body.user.patient_number).toBe('CLRDV-P-000003');
  });

  test('le numero patient ne peut pas etre modifie par le patient', async () => {
    const res = await request(app)
      .patch('/api/users/me')
      .set('Authorization', auth('patient', 7))
      .send({ patient_number: 'CLRDV-P-000001' });

    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe('Recherche de patients par le personnel', () => {
  test('cherche le numero patient par correspondance exacte, insensible a la casse', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Etablissement principal', city: 'Lubumbashi', status: 'active', role: 'secretary' }], rowCount: 1 });
    const res = await request(app)
      .get('/api/admin/patients')
      .query({ q: ' clrdv-p-000003 ' })
      .set('Authorization', auth('secretary'));

    expect(res.status).toBe(200);
    const [sql, params] = pool.query.mock.calls[1];
    expect(sql).toContain('p.patient_number = upper($1)');
    expect(params).toEqual(['clrdv-p-000003', [1]]);
  });

  test('un patient ne peut pas rechercher d autres patients', async () => {
    const res = await request(app)
      .get('/api/admin/patients')
      .query({ q: 'CLRDV-P-000001' })
      .set('Authorization', auth('patient', 7));

    expect(res.status).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe('Migration 005_patients', () => {
  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'db', 'migrations', '005_patients.sql'),
    'utf8'
  );

  test('garantit l unicite et le format du numero en base', () => {
    expect(sql).toContain('UNIQUE (patient_number)');
    expect(sql).toContain("CHECK (patient_number ~ '^CLRDV-P-[0-9]{6,}$')");
    expect(sql).toContain('UNIQUE (user_id)');
  });

  test('ne tronque pas les numeros au-dela de 999999', () => {
    expect(sql).toContain('lpad(n::text, GREATEST(6, length(n::text)), \'0\')');
  });

  test('cree automatiquement la fiche des nouveaux comptes patients', () => {
    expect(sql).toMatch(/AFTER INSERT ON users[\s\S]*WHEN \(NEW\.role = 'patient'\)/);
  });

  test('ne supprime aucune donnee', () => {
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b|\bDELETE\s+FROM\b|\bTRUNCATE\b/i);
  });
});
