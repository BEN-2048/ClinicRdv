process.env.JWT_SECRET = 'test-secret';
process.env.OTP_SECRET = 'test-otp-secret';

jest.mock('../src/config/db', () => {
  const query = jest.fn();
  const client = { query, release: jest.fn() };
  return { query, connect: jest.fn(async () => client) };
});

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const request = require('supertest');
const pool = require('../src/config/db');
const env = require('../src/config/env');
const app = require('../src/app');
const { normalizeDrcPhone, formatDrcPhone } = require('../src/utils/phone');
const { getSmsDriver, toGsm7 } = require('../src/messaging');

const setup = (routes = []) => {
  pool.query.mockReset();
  pool.query.mockImplementation(async (sql, params) => {
    for (const [part, result] of routes) {
      if (sql.includes(part)) return typeof result === 'function' ? result(sql, params) : result;
    }
    return { rows: [], rowCount: 0 };
  });
};

const calls = (part) => pool.query.mock.calls.filter(([sql]) => sql.includes(part));

let logSpy;
let originalSmsDriver;

beforeEach(() => {
  originalSmsDriver = env.smsDriver;
  env.smsDriver = 'console';
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  env.smsDriver = originalSmsDriver;
  logSpy.mockRestore();
});

describe('Normalisation des numéros de RDC', () => {
  test.each([
    ['0812345678', '+243812345678'],
    ['081 234 5678', '+243812345678'],
    ['081-234-5678', '+243812345678'],
    ['(081) 234.5678', '+243812345678'],
    ['812345678', '+243812345678'],
    ['+243812345678', '+243812345678'],
    ['+243 81 234 5678', '+243812345678'],
    ['00243812345678', '+243812345678'],
    ['243812345678', '+243812345678'],
    ['0991234567', '+243991234567'],
    ['0971234567', '+243971234567'],
    ['0851234567', '+243851234567'],
    ['0901234567', '+243901234567'],
  ])('%s devient %s', (input, expected) => {
    expect(normalizeDrcPhone(input)).toBe(expected);
  });

  test.each([
    ['0712345678'],
    ['081234567'],
    ['08123456789'],
    ['+33612345678'],
    ['+2438123456789'],
    ['abc'],
    [''],
    ['081 234 567a'],
    [null],
  ])('refuse %p', (input) => {
    expect(normalizeDrcPhone(input)).toBeNull();
  });

  test('affiche le numero de facon lisible', () => {
    expect(formatDrcPhone('+243812345678')).toBe('+243 81 234 5678');
  });
});

describe('Envoi des SMS', () => {
  test('le texte est converti sans accents pour tenir en un seul SMS', () => {
    expect(toGsm7('Récupération du numéro’')).toBe("Recuperation du numero'");
  });

  test('le pilote de developpement est interdit en production', () => {
    const before = env.nodeEnv;
    env.nodeEnv = 'production';
    expect(() => getSmsDriver()).toThrow('interdit en production');
    env.nodeEnv = before;
  });

  test('SMSGate recoit le numero, le texte et l authentification attendus', async () => {
    const saved = { ...env };
    Object.assign(env, { smsDriver: 'smsgate', smsgateUrl: 'http://192.168.1.20:8080/', smsgateUsername: 'u', smsgatePassword: 'p' });
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200 });
    await getSmsDriver().send('+243812345678', 'Bonjour');
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://192.168.1.20:8080/message');
    expect(options.headers.Authorization).toBe(`Basic ${Buffer.from('u:p').toString('base64')}`);
    expect(JSON.parse(options.body)).toEqual({ textMessage: { text: 'Bonjour' }, phoneNumbers: ['+243812345678'] });
    fetchMock.mockRestore();
    Object.assign(env, saved);
  });

  test('SMSGate non configure echoue clairement', async () => {
    const saved = { ...env };
    Object.assign(env, { smsDriver: 'smsgate', smsgateUrl: undefined });
    await expect(getSmsDriver().send('+243812345678', 'x')).rejects.toThrow('SMSGate non configuré');
    Object.assign(env, saved);
  });
});

describe('Inscription par téléphone', () => {
  const body = { phone: '081 234 5678', password: 'motdepasse', firstName: 'Amina', lastName: 'Kabila' };

  test('cree le compte, envoie un code par SMS sans jamais le stocker en clair', async () => {
    setup([['INSERT INTO users', { rows: [{ id: 30 }], rowCount: 1 }]]);
    const res = await request(app).post('/api/auth/register').send({ ...body, email: 'Amina@Example.com' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ phone: '+243812345678', verification: 'sms' });
    const [, params] = calls('INSERT INTO users')[0];
    expect(params[0]).toBe('amina@example.com');
    expect(params[4]).toBe('+243 81 234 5678');
    expect(params[5]).toBe('+243812345678');
    const [, otpParams] = calls('INSERT INTO phone_verifications')[0];
    const sms = logSpy.mock.calls.map((c) => c.join(' ')).find((l) => l.includes('SMS de développement'));
    const code = /code est (\d{6})/.exec(sms)[1];
    expect(otpParams[3]).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(pool.query.mock.calls)).not.toContain(code);
    expect(sms).not.toContain('812345678');
    expect(calls("INSERT INTO sms_outbox (destination, purpose, driver, status) VALUES ($1, $2, $3, 'sent')")).toHaveLength(1);
    expect(calls('COMMIT')).toHaveLength(1);
  });

  test('l e-mail facultatif n est jamais utilise comme identifiant tant qu il n est pas verifie', async () => {
    setup([['INSERT INTO users', { rows: [{ id: 30 }], rowCount: 1 }]]);
    await request(app).post('/api/auth/register').send({ ...body, email: 'victime@example.com' });
    const [sql] = calls('INSERT INTO users')[0];
    expect(sql).toContain('VALUES (NULL, $1');
  });

  test('refuse un numero etranger ou mal forme', async () => {
    setup();
    const res = await request(app).post('/api/auth/register').send({ ...body, phone: '+33612345678' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PHONE');
    expect(calls('INSERT INTO users')).toHaveLength(0);
  });

  test('refuse un numero deja verifie sur un autre compte', async () => {
    setup([['phone_verified_at IS NOT NULL', { rows: [{ '?column?': 1 }], rowCount: 1 }]]);
    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PHONE_TAKEN');
  });

  test('un numero seulement reserve par un compte jamais verifie reste utilisable', async () => {
    setup([['INSERT INTO users', { rows: [{ id: 31 }], rowCount: 1 }]]);
    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBe(201);
  });

  test('plafond de 5 SMS par numero et par jour, sans creer le compte', async () => {
    setup([
      ['INSERT INTO users', { rows: [{ id: 30 }], rowCount: 1 }],
      ['AS per_number', { rows: [{ per_number: 5, global: 12 }], rowCount: 1 }],
    ]);
    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('SMS_NUMBER_LIMIT');
    expect(calls('ROLLBACK').length).toBeGreaterThan(0);
    expect(calls('COMMIT')).toHaveLength(0);
  });

  test('plafond quotidien global pour proteger la carte SIM', async () => {
    setup([
      ['INSERT INTO users', { rows: [{ id: 30 }], rowCount: 1 }],
      ['AS per_number', { rows: [{ per_number: 0, global: 200 }], rowCount: 1 }],
    ]);
    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('SMS_DAILY_LIMIT');
  });

  test('si l envoi du SMS echoue, le compte n est pas cree', async () => {
    setup([['INSERT INTO users', { rows: [{ id: 30 }], rowCount: 1 }]]);
    const saved = env.smsDriver;
    env.smsDriver = 'smsgate';
    const before = env.smsgateUrl;
    env.smsgateUrl = undefined;
    const res = await request(app).post('/api/auth/register').send(body);
    env.smsDriver = saved;
    env.smsgateUrl = before;
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('SMS_SEND_FAILED');
    expect(calls('COMMIT')).toHaveLength(0);
    expect(calls("'failed'")).toHaveLength(1);
  });
});

describe('Connexion par téléphone', () => {
  let hash;
  beforeAll(async () => {
    hash = await bcrypt.hash('motdepasse', 4);
  });

  const userRow = (extra = {}) => ({
    id: 30, email: null, role: 'patient', first_name: 'A', last_name: 'B',
    password_hash: hash, phone_e164: '+243812345678', phone_verified_at: new Date(), is_verified: true, ...extra,
  });

  test('connexion avec un numero ecrit librement', async () => {
    setup([['WHERE phone_e164 = $1', { rows: [userRow()], rowCount: 1 }]]);
    const res = await request(app).post('/api/auth/login').send({ identifier: '081 234 5678', password: 'motdepasse' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ refreshToken: expect.any(String), user: { phone_e164: '+243812345678' } });
    expect(calls('WHERE phone_e164 = $1')[0][1]).toEqual(['+243812345678']);
  });

  test('un numero non verifie renvoie vers la verification', async () => {
    setup([['WHERE phone_e164 = $1', { rows: [userRow({ phone_verified_at: null, is_verified: false })], rowCount: 1 }]]);
    const res = await request(app).post('/api/auth/login').send({ identifier: '0812345678', password: 'motdepasse' });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'PHONE_NOT_VERIFIED', phone: '+243812345678' });
  });

  test('mauvais mot de passe : meme reponse qu un numero inconnu', async () => {
    setup([['WHERE phone_e164 = $1', { rows: [userRow()], rowCount: 1 }]]);
    const wrong = await request(app).post('/api/auth/login').send({ identifier: '0812345678', password: 'faux' });
    setup();
    const unknown = await request(app).post('/api/auth/login').send({ identifier: '0899999999', password: 'faux' });
    expect([wrong.status, unknown.status]).toEqual([401, 401]);
    expect(wrong.body).toEqual(unknown.body);
  });

  test('la connexion par e-mail fonctionne toujours, y compris avec l ancien champ email', async () => {
    setup([['LOWER(email) = LOWER($1)', { rows: [userRow({ email: 'p@example.com' })], rowCount: 1 }]]);
    const res = await request(app).post('/api/auth/login').send({ email: 'p@example.com', password: 'motdepasse' });
    expect(res.status).toBe(200);
  });

  test.each([
    [{ phone: '0812345678', code: '12345' }],
    [{ phone: '0812345678', code: 'abcdef' }],
    [{ phone: '0812345678' }],
  ])('rejette une verification mal formee %j', async (payload) => {
    setup();
    const res = await request(app).post('/api/auth/verify-phone').send(payload);
    expect(res.status).toBe(400);
  });

  test('un code incorrect incremente le compteur d essais', async () => {
    setup([['FROM phone_verifications pv', {
      rows: [{ id: 3, user_id: 30, code_hash: 'a'.repeat(64), attempts: 0, expires_at: new Date(Date.now() + 60000), consumed_at: null }],
      rowCount: 1,
    }]]);
    const res = await request(app).post('/api/auth/verify-phone').send({ phone: '0812345678', code: '123456' });
    expect(res.status).toBe(400);
    expect(calls('SET attempts = attempts + 1')).toHaveLength(1);
  });
});

describe('Migration 016_phone_identity', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', '016_phone_identity.sql'), 'utf8');

  test('un numero n est unique que parmi les numeros verifies', () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX[^;]*users_verified_phone_unique[^;]*WHERE phone_verified_at IS NOT NULL/);
  });

  test('chaque compte garde au moins un identifiant de connexion', () => {
    expect(sql).toContain('CHECK (email IS NOT NULL OR phone_e164 IS NOT NULL)');
  });

  test('le journal des SMS ne contient jamais le code', () => {
    const outbox = sql.slice(sql.indexOf('CREATE TABLE IF NOT EXISTS sms_outbox'));
    expect(outbox.split(');')[0]).not.toMatch(/code/i);
  });

  test('ne supprime aucune donnee', () => {
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b|\bDELETE\s+FROM\b|\bTRUNCATE\b/i);
  });
});
