process.env.JWT_SECRET = 'test-secret';
process.env.OTP_SECRET = 'test-otp-secret';
process.env.RATE_LIMIT_ENABLED = 'true';

jest.mock('../src/config/db', () => ({
  query: jest.fn(),
  connect: jest.fn(),
}));

jest.mock('../src/controllers/otp.controller', () => ({
  verifyCode: jest.fn(),
  resendCode: jest.fn(),
  createVerification: jest.fn(),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const pool = require('../src/config/db');
const otp = require('../src/controllers/otp.controller');
const app = require('../src/app');

let passwordHash;

beforeAll(async () => {
  passwordHash = await bcrypt.hash('motdepasse123', 4);
});

beforeEach(() => {
  jest.clearAllMocks();
});

const login = (email, password) =>
  request(app).post('/api/auth/login').send({ email, password });

describe('Limitation des tentatives de connexion', () => {
  test('bloque un compte apres 5 echecs et repond 429', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    for (let i = 0; i < 5; i += 1) {
      const res = await login('victime@example.com', 'mauvais-mot');
      expect(res.status).toBe(401);
    }

    const blocked = await login('victime@example.com', 'mauvais-mot');
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('TOO_MANY_REQUESTS');
    expect(blocked.headers['ratelimit-policy']).toBeDefined();
  });

  test('le blocage ignore la casse et les espaces de l email', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    const variants = ['CASSE@example.com', 'Casse@Example.com', 'casse@EXAMPLE.COM'];
    for (let i = 0; i < 5; i += 1) {
      await login(variants[i % variants.length], 'x');
    }

    const res = await login('casse@example.com', 'x');
    expect(res.status).toBe(429);
  });

  test('ne bloque pas un autre compte depuis la meme adresse', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    const res = await login('autre@example.com', 'mauvais-mot');
    expect(res.status).toBe(401);
  });

  test('les connexions reussies ne sont pas comptees comme des echecs', async () => {
    pool.query.mockResolvedValue({
      rows: [{
        id: 3,
        email: 'medecin@example.com',
        password_hash: passwordHash,
        role: 'doctor',
        first_name: 'A',
        last_name: 'B',
      }],
    });

    for (let i = 0; i < 7; i += 1) {
      const res = await login('medecin@example.com', 'motdepasse123');
      expect(res.status).toBe(200);
    }
  });
});

describe('Limitation des codes OTP', () => {
  test('bloque la verification apres 10 essais pour un meme email', async () => {
    otp.verifyCode.mockResolvedValue({ ok: false, reason: 'Code incorrect.' });

    for (let i = 0; i < 10; i += 1) {
      const res = await request(app)
        .post('/api/auth/verify-email')
        .send({ email: 'otp@example.com', code: String(100000 + i) });
      expect(res.status).toBe(400);
    }

    const blocked = await request(app)
      .post('/api/auth/verify-email')
      .send({ email: 'otp@example.com', code: '999999' });

    expect(blocked.status).toBe(429);
    expect(otp.verifyCode).toHaveBeenCalledTimes(10);
  });

  test('limite les renvois de code a 3 par heure pour un meme email', async () => {
    otp.resendCode.mockResolvedValue({ ok: true, expiresIn: 600 });

    for (let i = 0; i < 3; i += 1) {
      const res = await request(app)
        .post('/api/auth/resend-otp')
        .send({ email: 'renvoi@example.com' });
      expect(res.status).toBe(200);
    }

    const blocked = await request(app)
      .post('/api/auth/resend-otp')
      .send({ email: 'renvoi@example.com' });

    expect(blocked.status).toBe(429);
    expect(otp.resendCode).toHaveBeenCalledTimes(3);
  });
});

describe('Gestion des erreurs', () => {
  test('ne divulgue pas le message interne d une erreur serveur', async () => {
    pool.query.mockRejectedValueOnce(
      new Error('connect ECONNREFUSED ep-secret-host.neon.tech:5432')
    );

    const res = await request(app)
      .get('/api/users/me')
      .set('Authorization', 'Bearer ' + jwt.sign({ id: 1, role: 'patient' }, 'test-secret'));

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Erreur serveur' });
  });

  test('repond 400 avec un message clair pour un JSON invalide', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .set('Content-Type', 'application/json')
      .send('{"email":');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Corps de requete JSON invalide' });
  });

  test('conserve le message des erreurs metier', async () => {
    const res = await request(app).get('/api/route-inexistante');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Route introuvable');
  });
});
