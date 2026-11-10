process.env.JWT_SECRET = 'test-secret';
process.env.OTP_SECRET = 'test-otp-secret';
process.env.EMAIL_DRIVER = 'console';
process.env.SMS_DRIVER = 'console';

jest.mock('../src/config/db', () => {
  const query = jest.fn();
  const client = { query, release: jest.fn() };
  return { query, connect: jest.fn(async () => client) };
});

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const pool = require('../src/config/db');
const env = require('../src/config/env');
const app = require('../src/app');
const { hashCode } = require('../src/controllers/otp.controller');
const { getEmailDriver } = require('../src/messaging/email');

const SID = '11111111-2222-4333-8444-555555555555';
const token = jwt.sign({ id: 7, role: 'patient', sid: SID }, 'test-secret');
const bearer = { Authorization: `Bearer ${token}` };
const PHONE = '+243812345678';
const NEW_PHONE = '+243998877665';

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
const one = (row) => ({ rows: [row], rowCount: 1 });
const logs = () => logSpy.mock.calls.map((c) => c.join(' '));
const smsTo = (masked) => logs().filter((l) => l.includes('SMS de développement') && l.includes(masked));
const codeIn = (pattern) => {
  const line = logs().find((l) => pattern.test(l));
  return line ? pattern.exec(line)[1] : null;
};

const future = () => new Date(Date.now() + 5 * 60 * 1000).toISOString();
const past = () => new Date(Date.now() - 60 * 1000).toISOString();
const longAgo = () => new Date(Date.now() - 10 * 60 * 1000).toISOString();

let logSpy;
let warnSpy;
let errorSpy;
let oldHash;
beforeAll(async () => {
  oldHash = await bcrypt.hash('ancienmotdepasse', 4);
});
beforeEach(() => {
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  logSpy.mockRestore();
  warnSpy.mockRestore();
  errorSpy.mockRestore();
});

const PHONE_LOOKUP = "LEFT JOIN phone_verifications pv ON pv.user_id = u.id AND pv.purpose = 'recovery'";
const EMAIL_LOOKUP = "LEFT JOIN email_codes ec ON ec.user_id = u.id AND ec.purpose = 'recovery'";

describe('Mot de passe oublié : demande de code', () => {
  test('envoie un code par SMS au numero verifie, sans le stocker en clair', async () => {
    setup([[PHONE_LOOKUP, one({ id: 7, last_sent_at: null })]]);
    const res = await request(app).post('/api/auth/forgot-password').send({ identifier: '081 234 5678' });

    expect(res.status).toBe(200);
    const code = codeIn(/code de recuperation (\d{6})/);
    expect(code).toMatch(/^\d{6}$/);
    const [, params] = calls('INSERT INTO phone_verifications')[0];
    expect(params.slice(0, 3)).toEqual([7, PHONE, 'recovery']);
    expect(params[3]).toBe(hashCode(code));
    expect(JSON.stringify(pool.query.mock.calls)).not.toContain(code);
    expect(calls('COMMIT')).toHaveLength(1);
  });

  test('la recherche ne retient que les numeros verifies', async () => {
    setup();
    await request(app).post('/api/auth/forgot-password').send({ identifier: '0812345678' });
    const [sql, params] = calls(PHONE_LOOKUP)[0];
    expect(sql).toContain('phone_verified_at IS NOT NULL');
    expect(params).toEqual([PHONE]);
  });

  test('un numero inconnu recoit exactement la meme reponse, sans aucun SMS', async () => {
    setup([[PHONE_LOOKUP, one({ id: 7, last_sent_at: null })]]);
    const known = await request(app).post('/api/auth/forgot-password').send({ identifier: '0812345678' });
    setup();
    logSpy.mockClear();
    const unknown = await request(app).post('/api/auth/forgot-password').send({ identifier: '0812345679' });

    expect(unknown.status).toBe(known.status);
    expect(unknown.body).toEqual(known.body);
    expect(calls('INSERT INTO phone_verifications')).toHaveLength(0);
    expect(logs().some((l) => l.includes('SMS de développement'))).toBe(false);
  });

  test('par e-mail, le code part a l adresse du compte', async () => {
    setup([[EMAIL_LOOKUP, one({ id: 7, last_sent_at: null })]]);
    const res = await request(app).post('/api/auth/forgot-password').send({ identifier: 'Amina@Example.com' });

    expect(res.status).toBe(200);
    const code = codeIn(/code de récupération ClinicRDV est (\d{6})/);
    expect(code).toMatch(/^\d{6}$/);
    const [sql, params] = calls(EMAIL_LOOKUP)[0];
    expect(sql).toContain("u.role <> 'patient' OR u.is_verified");
    expect(params).toEqual(['amina@example.com']);
    const [, insert] = calls('INSERT INTO email_codes')[0];
    expect(insert.slice(0, 3)).toEqual([7, 'amina@example.com', 'recovery']);
    expect(insert[3]).toBe(hashCode(code));
    expect(logs().find((l) => l.includes('E-mail de développement'))).toContain('a•••@example.com');
  });

  test('refuse un identifiant qui n est ni un numero congolais ni un e-mail', async () => {
    setup();
    const res = await request(app).post('/api/auth/forgot-password').send({ identifier: '+33612345678' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_IDENTIFIER');
  });

  test('pendant le delai entre deux envois, rien n est envoye mais la reponse reste identique', async () => {
    setup([[PHONE_LOOKUP, one({ id: 7, last_sent_at: new Date().toISOString() })]]);
    const res = await request(app).post('/api/auth/forgot-password').send({ identifier: '0812345678' });
    expect(res.status).toBe(200);
    expect(calls('INSERT INTO phone_verifications')).toHaveLength(0);
  });

  test('un echec d envoi ou le plafond par numero ne revele pas l existence du compte', async () => {
    setup([
      [PHONE_LOOKUP, one({ id: 7, last_sent_at: null })],
      ['AS per_number', one({ per_number: 5, global: 3 })],
    ]);
    const res = await request(app).post('/api/auth/forgot-password').send({ identifier: '0812345678' });
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('Si un compte correspond');
    expect(calls('ROLLBACK').length).toBeGreaterThan(0);
  });

  test('le plafond global du service SMS reste signale', async () => {
    setup([
      [PHONE_LOOKUP, one({ id: 7, last_sent_at: null })],
      ['AS per_number', one({ per_number: 0, global: 200 })],
    ]);
    const res = await request(app).post('/api/auth/forgot-password').send({ identifier: '0812345678' });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('SMS_DAILY_LIMIT');
  });
});

describe('Mot de passe oublié : nouveau mot de passe', () => {
  const PHONE_ROW = "WHERE pv.phone_e164 = $1 AND pv.purpose = 'recovery'";
  const row = (over = {}) => ({
    id: 3, user_id: 7, code_hash: hashCode('123456'), attempts: 0, expires_at: future(), consumed_at: null,
    phone_e164: PHONE, phone_verified_at: longAgo(), ...over,
  });
  const body = { identifier: '081 234 5678', code: '123456', newPassword: 'nouveaumotdepasse' };

  test('avec le bon code : mot de passe change, code consomme, toutes les sessions fermees, SMS d avertissement', async () => {
    setup([[PHONE_ROW, one(row())]]);
    const res = await request(app).post('/api/auth/reset-password').send(body);

    expect(res.status).toBe(200);
    const [, update] = calls('UPDATE users SET password_hash')[0];
    expect(await bcrypt.compare('nouveaumotdepasse', update[0])).toBe(true);
    expect(update[1]).toBe(7);
    expect(calls('SET consumed_at = now()')[0][1]).toEqual([3]);
    const [, revoke] = calls('UPDATE auth_sessions')[0];
    expect(revoke).toEqual([7, 'password_reset', null]);
    expect(calls('COMMIT')).toHaveLength(1);
    expect(smsTo('+24381•••78').some((l) => l.includes('mot de passe de votre compte vient d\'etre modifie'))).toBe(true);
    expect(calls("'notice'")).toHaveLength(1);
  });

  test('un code faux compte une tentative, est enregistre et ne change rien', async () => {
    setup([[PHONE_ROW, one(row())]]);
    const res = await request(app).post('/api/auth/reset-password').send({ ...body, code: '654321' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OTP_WRONG');
    expect(calls('SET attempts = attempts + 1')).toHaveLength(1);
    expect(calls('COMMIT')).toHaveLength(1);
    expect(calls('UPDATE users SET password_hash')).toHaveLength(0);
    expect(calls('UPDATE auth_sessions')).toHaveLength(0);
  });

  test.each([
    ['expire', { expires_at: past() }, 'OTP_EXPIRED'],
    ['bloque apres 5 essais', { attempts: 5 }, 'OTP_LOCKED'],
    ['deja utilise', { consumed_at: past() }, 'OTP_INVALID'],
  ])('code %s : refuse', async (label, over, code) => {
    setup([[PHONE_ROW, one(row(over))]]);
    const res = await request(app).post('/api/auth/reset-password').send(body);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(code);
    expect(calls('UPDATE users SET password_hash')).toHaveLength(0);
  });

  test('sans demande en cours : code invalide', async () => {
    setup();
    const res = await request(app).post('/api/auth/reset-password').send(body);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OTP_INVALID');
  });

  test('par e-mail, le code doit correspondre a l adresse actuelle du compte', async () => {
    setup([["WHERE LOWER(ec.email) = $1 AND ec.purpose = 'recovery'", one(row({ phone_verified_at: null }))]]);
    const res = await request(app).post('/api/auth/reset-password').send({ ...body, identifier: 'Amina@Example.com' });
    expect(res.status).toBe(200);
    const [sql, params] = calls("ec.purpose = 'recovery'")[0];
    expect(sql).toContain('LOWER(u.email) = $1');
    expect(params).toEqual(['amina@example.com']);
    expect(calls("'notice'")).toHaveLength(0);
  });

  test('refuse un mot de passe trop court', async () => {
    setup();
    const res = await request(app).post('/api/auth/reset-password').send({ ...body, newPassword: 'court' });
    expect(res.status).toBe(400);
  });
});

describe('Changer son mot de passe une fois connecté', () => {
  const USER = 'SELECT password_hash, phone_e164, phone_verified_at FROM users';

  test('exige une session', async () => {
    const res = await request(app).post('/api/users/me/password').send({ currentPassword: 'x', newPassword: 'nouveaumotdepasse' });
    expect(res.status).toBe(401);
  });

  test('refuse si le mot de passe actuel est faux, sans renvoyer 401', async () => {
    setup([[USER, one({ password_hash: oldHash, phone_e164: PHONE, phone_verified_at: longAgo() })]]);
    const res = await request(app).post('/api/users/me/password').set(bearer)
      .send({ currentPassword: 'mauvais', newPassword: 'nouveaumotdepasse' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('WRONG_PASSWORD');
    expect(calls('UPDATE users SET password_hash')).toHaveLength(0);
  });

  test('refuse un nouveau mot de passe identique', async () => {
    setup([[USER, one({ password_hash: oldHash, phone_e164: PHONE, phone_verified_at: longAgo() })]]);
    const res = await request(app).post('/api/users/me/password').set(bearer)
      .send({ currentPassword: 'ancienmotdepasse', newPassword: 'ancienmotdepasse' });
    expect(res.body.code).toBe('SAME_PASSWORD');
  });

  test('change le mot de passe et deconnecte les autres appareils seulement', async () => {
    setup([[USER, one({ password_hash: oldHash, phone_e164: PHONE, phone_verified_at: longAgo() })]]);
    const res = await request(app).post('/api/users/me/password').set(bearer)
      .send({ currentPassword: 'ancienmotdepasse', newPassword: 'nouveaumotdepasse' });

    expect(res.status).toBe(200);
    const [, update] = calls('UPDATE users SET password_hash')[0];
    expect(await bcrypt.compare('nouveaumotdepasse', update[0])).toBe(true);
    expect(calls('UPDATE auth_sessions')[0][1]).toEqual([7, 'password_change', SID]);
    expect(calls("'notice'")).toHaveLength(1);
  });
});

describe('Changer de numéro', () => {
  const REQUEST = "LEFT JOIN phone_verifications pv ON pv.user_id = u.id AND pv.purpose = 'phone_change'";
  const TAKEN = 'phone_verified_at IS NOT NULL AND id <> $2';
  const CONFIRM = "WHERE pv.user_id = $1 AND pv.purpose = 'phone_change'";
  const current = (over = {}) => one({ password_hash: oldHash, phone_e164: PHONE, phone_verified_at: longAgo(), last_sent_at: null, ...over });
  const body = { phone: '099 887 7665', password: 'ancienmotdepasse' };

  test('envoie le code au nouveau numero apres verification du mot de passe', async () => {
    setup([[REQUEST, current()]]);
    const res = await request(app).post('/api/users/me/phone').set(bearer).send(body);

    expect(res.status).toBe(200);
    expect(res.body.phone).toBe(NEW_PHONE);
    const [, params] = calls('INSERT INTO phone_verifications')[0];
    expect(params.slice(0, 3)).toEqual([7, NEW_PHONE, 'phone_change']);
    expect(smsTo('+24399•••65').some((l) => /nouveau numero \d{6}/.test(l))).toBe(true);
    expect(calls('UPDATE users SET phone_e164')).toHaveLength(0);
  });

  test('mot de passe faux : aucun SMS', async () => {
    setup([[REQUEST, current()]]);
    const res = await request(app).post('/api/users/me/phone').set(bearer).send({ ...body, password: 'mauvais' });
    expect(res.body.code).toBe('WRONG_PASSWORD');
    expect(calls('INSERT INTO phone_verifications')).toHaveLength(0);
  });

  test('refuse un numero deja verifie sur un autre compte', async () => {
    setup([[REQUEST, current()], [TAKEN, one({ '?column?': 1 })]]);
    const res = await request(app).post('/api/users/me/phone').set(bearer).send(body);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PHONE_TAKEN');
  });

  test('refuse le numero actuel', async () => {
    setup([[REQUEST, current()]]);
    const res = await request(app).post('/api/users/me/phone').set(bearer).send({ ...body, phone: '0812345678' });
    expect(res.body.code).toBe('SAME_PHONE');
  });

  test('impose un delai entre deux envois', async () => {
    setup([[REQUEST, current({ last_sent_at: new Date().toISOString() })]]);
    const res = await request(app).post('/api/users/me/phone').set(bearer).send(body);
    expect(res.status).toBe(429);
    expect(res.body.waitSeconds).toBeGreaterThan(0);
  });

  test('confirmation : numero remplace, ancien numero prevenu, autres appareils deconnectes', async () => {
    setup([[CONFIRM, one({
      id: 9, new_phone: NEW_PHONE, code_hash: hashCode('123456'), attempts: 0, expires_at: future(), consumed_at: null,
      old_phone: PHONE, phone_verified_at: longAgo(),
    })]]);
    const res = await request(app).post('/api/users/me/phone/confirm').set(bearer).send({ code: '123456' });

    expect(res.status).toBe(200);
    expect(calls('UPDATE users SET phone_e164')[0][1]).toEqual([NEW_PHONE, '+243 99 887 7665', 7]);
    expect(calls("purpose = 'recovery'")).toHaveLength(1);
    expect(calls('UPDATE auth_sessions')[0][1]).toEqual([7, 'phone_change', SID]);
    const notice = smsTo('+24381•••78').find((l) => l.includes('remplace par'));
    expect(notice).toContain('+24399***65');
    expect(calls('LEFT JOIN patients p')).toHaveLength(1);
  });

  test('confirmation : si le numero a ete pris entre-temps, rien n est change', async () => {
    setup([
      [CONFIRM, one({
        id: 9, new_phone: NEW_PHONE, code_hash: hashCode('123456'), attempts: 0, expires_at: future(), consumed_at: null,
        old_phone: PHONE, phone_verified_at: longAgo(),
      })],
      ['UPDATE users SET phone_e164', () => { throw Object.assign(new Error('dup'), { code: '23505' }); }],
    ]);
    const res = await request(app).post('/api/users/me/phone/confirm').set(bearer).send({ code: '123456' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PHONE_TAKEN');
    expect(calls('COMMIT')).toHaveLength(0);
    expect(calls('UPDATE auth_sessions')).toHaveLength(0);
  });

  test('renvoi sans changement en cours', async () => {
    setup();
    const res = await request(app).post('/api/users/me/phone/resend').set(bearer).send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NO_PENDING_CHANGE');
  });

  test('le profil ne permet plus de modifier un numero verifie sans confirmation', async () => {
    setup([['SELECT phone, phone_verified_at FROM users', one({ phone: '+243 81 234 5678', phone_verified_at: longAgo() })]]);
    const res = await request(app).patch('/api/users/me').set(bearer).send({ phone: '0998877665' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PHONE_CHANGE_REQUIRED');
    expect(calls('UPDATE users')).toHaveLength(0);
  });

  test('le profil accepte le meme numero, et les comptes sans numero verifie', async () => {
    setup([
      ['SELECT phone, phone_verified_at FROM users', one({ phone: '+243 81 234 5678', phone_verified_at: longAgo() })],
      ['RETURNING id', one({ id: 7 })],
    ]);
    const same = await request(app).patch('/api/users/me').set(bearer).send({ phone: '+243 81 234 5678', firstName: 'Amina' });
    expect(same.status).toBe(200);

    setup([
      ['SELECT phone, phone_verified_at FROM users', one({ phone: null, phone_verified_at: null })],
      ['RETURNING id', one({ id: 7 })],
    ]);
    const staff = await request(app).patch('/api/users/me').set(bearer).send({ phone: '0998877665' });
    expect(staff.status).toBe(200);
  });
});

describe('Ajouter ou changer son e-mail', () => {
  const REQUEST = "LEFT JOIN email_codes ec ON ec.user_id = u.id AND ec.purpose = 'email_change'";
  const CONFIRM = "WHERE ec.user_id = $1 AND ec.purpose = 'email_change'";
  const body = { email: 'Amina@Example.com', password: 'ancienmotdepasse' };

  test('enregistre l adresse en attente et envoie un code par e-mail', async () => {
    setup([[REQUEST, one({ password_hash: oldHash, email: null, last_sent_at: null })]]);
    const res = await request(app).post('/api/users/me/email').set(bearer).send(body);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe('amina@example.com');
    expect(calls('SET pending_email = $1')[0][1]).toEqual(['amina@example.com', 7]);
    const code = codeIn(/confirmation ClinicRDV est (\d{6})/);
    expect(calls('INSERT INTO email_codes')[0][1][3]).toBe(hashCode(code));
    expect(calls('UPDATE users SET email')).toHaveLength(0);
  });

  test('mot de passe exige', async () => {
    setup([[REQUEST, one({ password_hash: oldHash, email: null, last_sent_at: null })]]);
    const res = await request(app).post('/api/users/me/email').set(bearer).send({ ...body, password: 'mauvais' });
    expect(res.body.code).toBe('WRONG_PASSWORD');
    expect(calls('INSERT INTO email_codes')).toHaveLength(0);
  });

  test('refuse une adresse deja utilisee', async () => {
    setup([
      [REQUEST, one({ password_hash: oldHash, email: null, last_sent_at: null })],
      ['WHERE LOWER(email) = $1 AND id <> $2', one({ '?column?': 1 })],
    ]);
    const res = await request(app).post('/api/users/me/email').set(bearer).send(body);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_TAKEN');
  });

  test('si l e-mail ne part pas, rien n est enregistre', async () => {
    setup([[REQUEST, one({ password_hash: oldHash, email: null, last_sent_at: null })]]);
    const saved = env.emailDriver;
    env.emailDriver = 'brevo';
    const key = env.brevoApiKey;
    env.brevoApiKey = undefined;
    const res = await request(app).post('/api/users/me/email').set(bearer).send(body);
    env.emailDriver = saved;
    env.brevoApiKey = key;
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('EMAIL_SEND_FAILED');
    expect(calls('COMMIT')).toHaveLength(0);
  });

  test('confirmation : l adresse devient l e-mail du compte, le titulaire est prevenu par SMS et sur l ancienne adresse', async () => {
    setup([[CONFIRM, one({
      id: 4, new_email: 'amina@example.com', code_hash: hashCode('123456'), attempts: 0, expires_at: future(), consumed_at: null,
      old_email: 'ancienne@example.com', phone_e164: PHONE, phone_verified_at: longAgo(),
    })]]);
    const res = await request(app).post('/api/users/me/email/confirm').set(bearer).send({ code: '123456' });

    expect(res.status).toBe(200);
    expect(calls('UPDATE users SET email = $1, pending_email = NULL')[0][1]).toEqual(['amina@example.com', 7]);
    expect(calls("purpose = 'recovery'")).toHaveLength(1);
    expect(smsTo('+24381•••78').find((l) => l.includes('est maintenant liee'))).toContain('a***@example.com');
    expect(logs().find((l) => l.includes('Adresse e-mail modifiée'))).toContain('a•••@example.com');
  });

  test('code faux : tentative comptee, adresse inchangee', async () => {
    setup([[CONFIRM, one({
      id: 4, new_email: 'amina@example.com', code_hash: hashCode('123456'), attempts: 0, expires_at: future(), consumed_at: null,
      old_email: null, phone_e164: PHONE, phone_verified_at: longAgo(),
    })]]);
    const res = await request(app).post('/api/users/me/email/confirm').set(bearer).send({ code: '000000' });
    expect(res.body.code).toBe('OTP_WRONG');
    expect(calls('UPDATE email_codes SET attempts')).toHaveLength(1);
    expect(calls('UPDATE users SET email')).toHaveLength(0);
  });
});

describe('Pilotes et avertissements', () => {
  test('le pilote e-mail de developpement est interdit en production', () => {
    const saved = { nodeEnv: env.nodeEnv, emailDriver: env.emailDriver, brevoApiKey: env.brevoApiKey };
    Object.assign(env, { nodeEnv: 'production', emailDriver: undefined, brevoApiKey: undefined });
    expect(() => getEmailDriver()).toThrow('interdit en production');
    Object.assign(env, { brevoApiKey: 'cle' });
    expect(getEmailDriver().name).toBe('brevo');
    Object.assign(env, saved);
  });

  test('un SMS d avertissement bloque par le plafond ne fait pas echouer l operation', async () => {
    setup([
      ['SELECT password_hash, phone_e164, phone_verified_at FROM users', one({ password_hash: oldHash, phone_e164: PHONE, phone_verified_at: longAgo() })],
      ['AS per_number', one({ per_number: 5, global: 0 })],
    ]);
    const res = await request(app).post('/api/users/me/password').set(bearer)
      .send({ currentPassword: 'ancienmotdepasse', newPassword: 'nouveaumotdepasse' });
    expect(res.status).toBe(200);
    expect(calls("'notice', $2, 'failed'")).toHaveLength(1);
  });
});
