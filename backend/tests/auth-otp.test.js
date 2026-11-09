process.env.JWT_SECRET = 'test-secret';
process.env.OTP_SECRET = 'test-otp-secret';

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

const email = 'patient@example.com';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Authentification HTTP avec OTP', () => {
  test('refuse la connexion d un patient non verifie', async () => {
    const password_hash = await bcrypt.hash('motdepasse123', 4);

    pool.query.mockResolvedValueOnce({
      rows: [{
        id: 1,
        email,
        password_hash,
        role: 'patient',
        is_verified: false,
      }],
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'motdepasse123' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
    expect(res.body.token).toBeUndefined();
  });

  test('refuse un code OTP incorrect', async () => {
    otp.verifyCode.mockResolvedValueOnce({
      ok: false,
      reason: 'Code incorrect.',
    });

    const res = await request(app)
      .post('/api/auth/verify-email')
      .send({ email, code: '123456' });

    expect(res.status).toBe(400);
    expect(res.body.token).toBeUndefined();
  });

  test('delivre un JWT apres verification reussie', async () => {
    const user = {
      id: 1,
      email,
      role: 'patient',
      first_name: 'Jean',
      last_name: 'Test',
    };

    otp.verifyCode.mockResolvedValueOnce({
      ok: true,
      user,
    });

    const res = await request(app)
      .post('/api/auth/verify-email')
      .send({ email, code: '123456' });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email);
    expect(typeof res.body.token).toBe('string');

    const payload = jwt.verify(res.body.token, 'test-secret');

    expect(payload.id).toBe(1);
    expect(payload.role).toBe('patient');
  });

  test('refuse un code OTP de format invalide', async () => {
    const res = await request(app)
      .post('/api/auth/verify-email')
      .send({ email, code: '12345' });

    expect(res.status).toBe(400);
    expect(otp.verifyCode).not.toHaveBeenCalled();
  });

  test('retourne HTTP 429 pendant le delai de renvoi', async () => {
    otp.resendCode.mockResolvedValueOnce({
      ok: false,
      reason: 'Veuillez patienter avant de demander un nouveau code.',
      waitSeconds: 30,
    });

    const res = await request(app)
      .post('/api/auth/resend-otp')
      .send({ email });

    expect(res.status).toBe(429);
    expect(res.body.waitSeconds).toBe(30);
  });

  test('confirme un renvoi OTP autorise', async () => {
    otp.resendCode.mockResolvedValueOnce({
      ok: true,
      expiresIn: 600,
    });

    const res = await request(app)
      .post('/api/auth/resend-otp')
      .send({ email });

    expect(res.status).toBe(200);
    expect(res.body.expiresIn).toBe(600);
  });
});
