process.env.JWT_SECRET = 'test-secret';

jest.mock('../src/config/db', () => {
  const query = jest.fn();
  const client = { query, release: jest.fn() };
  return { query, connect: jest.fn(async () => client) };
});

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const pool = require('../src/config/db');
const app = require('../src/app');

const token = (role, id = 7) => `Bearer ${jwt.sign({ id, role }, 'test-secret')}`;

beforeEach(() => {
  pool.query.mockReset();
  pool.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('Coordonnées pour le hors ligne', () => {
  test('les rendez-vous du patient incluent les contacts de l etablissement et du cabinet', async () => {
    await request(app).get('/api/appointments/mine').set('Authorization', token('patient'));
    const sql = pool.query.mock.calls[0][0];
    for (const column of ['f.phone AS facility_phone', 'f.emergency_phone AS facility_emergency_phone', 'd.professional_phone AS doctor_phone']) {
      expect(sql).toContain(column);
    }
    expect(sql).not.toMatch(/u\.phone/);
  });

  test('la liste publique des medecins donne le numero professionnel, jamais le numero personnel', async () => {
    await request(app).get('/api/doctors').set('Authorization', token('patient'));
    const sql = pool.query.mock.calls[0][0];
    expect(sql).toContain('d.professional_phone');
    expect(sql).not.toMatch(/u\.phone/);
  });

  test('la fiche publique d un medecin ne contient pas son numero personnel', async () => {
    await request(app).get('/api/doctors/3').set('Authorization', token('patient'));
    const sql = pool.query.mock.calls[0][0];
    expect(sql).not.toMatch(/u\.phone/);
  });
});

describe('Numéro professionnel des médecins', () => {
  const update = (body) => request(app).patch('/api/admin/doctors/3').set('Authorization', token('admin', 1)).send(body);

  test.each([['+243 81 234 5678'], ['0812345678']])('accepte %s', async (professionalPhone) => {
    const res = await update({ professionalPhone });
    expect(res.status).not.toBe(400);
  });

  test.each([['appelez-moi'], ['12'], ['+243<script>']])('refuse %s', async (professionalPhone) => {
    const res = await update({ professionalPhone });
    expect(res.status).toBe(400);
  });

  test('la base refuse aussi un numero mal forme', () => {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', '014_doctor_professional_phone.sql'), 'utf8');
    expect(sql).toContain("professional_phone ~ '^\\+?[0-9 ]{6,20}$'");
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b|\bDELETE\s+FROM\b/i);
  });
});
