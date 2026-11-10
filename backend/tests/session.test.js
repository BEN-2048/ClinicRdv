process.env.JWT_SECRET = 'test-secret';

jest.mock('../src/config/db', () => {
  const query = jest.fn();
  const client = { query, release: jest.fn() };
  return { query, connect: jest.fn(async () => client) };
});

const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const pool = require('../src/config/db');
const app = require('../src/app');
const sessions = require('../src/services/session.service');

let table;
let users;

const install = () => {
  table = new Map();
  users = new Map([[7, { id: 7, email: 'p@example.com', role: 'patient', first_name: 'A', last_name: 'B', is_verified: true }]]);
  pool.query.mockReset();
  pool.query.mockImplementation(async (sql, params = []) => {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.startsWith('INSERT INTO auth_sessions')) {
      const [id, user_id, device_label, token_hash, created_ip, expires_at, absolute_expires_at] = params;
      table.set(id, { id, user_id, device_label, token_hash, previous_token_hash: null, rotated_at: null, created_ip, expires_at, absolute_expires_at, revoked_at: null, revoke_reason: null, last_used_at: new Date() });
      return { rows: [], rowCount: 1 };
    }
    if (s.startsWith('SELECT * FROM auth_sessions WHERE id = $1')) {
      const row = table.get(params[0]);
      return { rows: row ? [{ ...row }] : [], rowCount: row ? 1 : 0 };
    }
    if (s.startsWith('SELECT id, token_hash, previous_token_hash FROM auth_sessions')) {
      const row = table.get(params[0]);
      return { rows: row && !row.revoked_at ? [row] : [], rowCount: row && !row.revoked_at ? 1 : 0 };
    }
    if (s.startsWith('UPDATE auth_sessions SET previous_token_hash')) {
      const row = table.get(params[0]);
      Object.assign(row, { previous_token_hash: params[1], token_hash: params[2], rotated_at: new Date(), expires_at: params[3] });
      return { rows: [], rowCount: 1 };
    }
    if (s.startsWith("UPDATE auth_sessions SET revoked_at = now(), revoke_reason = 'reuse'")) {
      Object.assign(table.get(params[0]), { revoked_at: new Date(), revoke_reason: 'reuse' });
      return { rows: [], rowCount: 1 };
    }
    if (s.startsWith("UPDATE auth_sessions SET revoked_at = now(), revoke_reason = 'logout'")) {
      Object.assign(table.get(params[0]), { revoked_at: new Date(), revoke_reason: 'logout' });
      return { rows: [], rowCount: 1 };
    }
    if (s.startsWith('UPDATE auth_sessions SET revoked_at = now(), revoke_reason = $2')) {
      let n = 0;
      for (const row of table.values()) {
        if (row.user_id === params[0] && !row.revoked_at && row.id !== params[2]) {
          Object.assign(row, { revoked_at: new Date(), revoke_reason: params[1] });
          n += 1;
        }
      }
      return { rows: [], rowCount: n };
    }
    if (s.startsWith('SELECT id, email, role, first_name, last_name, is_verified FROM users')) {
      const u = users.get(params[0]);
      return { rows: u ? [u] : [], rowCount: u ? 1 : 0 };
    }
    return { rows: [], rowCount: 0 };
  });
};

beforeEach(install);

const user = () => users.get(7);

describe('Création et renouvellement', () => {
  test('la session cree un jeton d acces de 15 minutes et un jeton de renouvellement opaque', async () => {
    const s = await sessions.createSession(user(), { deviceLabel: 'iPhone de Marie<script>', ip: '1.2.3.4' });
    const payload = jwt.verify(s.token, 'test-secret');
    expect(payload).toMatchObject({ id: 7, role: 'patient', sid: s.sessionId });
    expect(payload.exp - payload.iat).toBe(15 * 60);
    expect(s.refreshToken.startsWith(`${s.sessionId}.`)).toBe(true);
    const row = table.get(s.sessionId);
    expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain(s.refreshToken.split('.')[1]);
    expect(row.device_label).toBe('iPhone de Mariescript');
  });

  test('le renouvellement remplace le jeton et relit le role en base', async () => {
    const s = await sessions.createSession(user());
    users.get(7).role = 'secretary';
    const r = await sessions.refresh(s.refreshToken);
    expect(r.refreshToken).not.toBe(s.refreshToken);
    expect(r.sessionId).toBe(s.sessionId);
    expect(jwt.decode(r.token).role).toBe('secretary');
  });

  test('l ancien jeton reste accepte 60 secondes apres un renouvellement (enregistrement rate)', async () => {
    const s = await sessions.createSession(user());
    await sessions.refresh(s.refreshToken);
    const again = await sessions.refresh(s.refreshToken);
    expect(again.sessionId).toBe(s.sessionId);
    expect(table.get(s.sessionId).revoked_at).toBeNull();
  });

  test('la reutilisation d un ancien jeton apres le delai revoque toute la session', async () => {
    const s = await sessions.createSession(user());
    const r = await sessions.refresh(s.refreshToken);
    table.get(s.sessionId).rotated_at = new Date(Date.now() - 2 * 60 * 1000);
    await expect(sessions.refresh(s.refreshToken)).rejects.toMatchObject({ status: 401, code: 'SESSION_INVALID' });
    expect(table.get(s.sessionId).revoke_reason).toBe('reuse');
    await expect(sessions.refresh(r.refreshToken)).rejects.toMatchObject({ status: 401 });
  });

  test.each([
    ['inconnu', () => `${crypto.randomUUID()}.${'a'.repeat(43)}`],
    ['mal forme', () => 'pas-un-jeton'],
    ['falsifie', (s) => `${s.sessionId}.${'b'.repeat(43)}`],
  ])('refuse un jeton %s', async (_label, make) => {
    const s = await sessions.createSession(user());
    await expect(sessions.refresh(make(s))).rejects.toMatchObject({ status: 401 });
    expect(table.get(s.sessionId).revoked_at).toBeNull();
  });

  test('refuse une session expiree ou arrivee a sa duree maximale', async () => {
    const a = await sessions.createSession(user());
    table.get(a.sessionId).expires_at = new Date(Date.now() - 1000);
    await expect(sessions.refresh(a.refreshToken)).rejects.toMatchObject({ status: 401 });
    const b = await sessions.createSession(user());
    table.get(b.sessionId).absolute_expires_at = new Date(Date.now() - 1000);
    await expect(sessions.refresh(b.refreshToken)).rejects.toMatchObject({ status: 401 });
  });

  test('un renouvellement ne depasse jamais la duree maximale de 90 jours', async () => {
    const s = await sessions.createSession(user());
    const limit = new Date(Date.now() + 5 * 24 * 3600 * 1000);
    table.get(s.sessionId).absolute_expires_at = limit;
    await sessions.refresh(s.refreshToken);
    expect(table.get(s.sessionId).expires_at.getTime()).toBeLessThanOrEqual(limit.getTime());
  });

  test('un compte supprime ne peut plus renouveler', async () => {
    const s = await sessions.createSession(user());
    users.delete(7);
    await expect(sessions.refresh(s.refreshToken)).rejects.toMatchObject({ status: 401 });
  });
});

describe('Routes de session', () => {
  test('la connexion renvoie le jeton de renouvellement', async () => {
    const bcrypt = require('bcrypt');
    const hash = await bcrypt.hash('motdepasse123', 4);
    const base = pool.query.getMockImplementation();
    pool.query.mockImplementation(async (sql, params) => (sql.includes('FROM users WHERE LOWER(email)')
      ? { rows: [{ ...user(), password_hash: hash }], rowCount: 1 }
      : base(sql, params)));
    const res = await request(app).post('/api/auth/login').set('X-Device-Name', 'iPhone 15').send({ email: 'p@example.com', password: 'motdepasse123' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ token: expect.any(String), refreshToken: expect.any(String), sessionId: expect.any(String), expiresIn: 900 });
    expect(table.get(res.body.sessionId).device_label).toBe('iPhone 15');
  });

  test('un jeton d acces expire est signale comme tel', async () => {
    const expired = jwt.sign({ id: 7, role: 'patient', exp: Math.floor(Date.now() / 1000) - 10 }, 'test-secret');
    const res = await request(app).get('/api/users/me').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_EXPIRED');
  });

  test('POST /auth/refresh renvoie une nouvelle paire, et un code clair en cas de refus', async () => {
    const s = await sessions.createSession(user());
    const ok = await request(app).post('/api/auth/refresh').send({ refreshToken: s.refreshToken });
    expect(ok.status).toBe(200);
    expect(ok.body.user).toMatchObject({ id: 7 });
    const ko = await request(app).post('/api/auth/refresh').send({ refreshToken: `${crypto.randomUUID()}.${'c'.repeat(43)}` });
    expect(ko.status).toBe(401);
    expect(ko.body.code).toBe('SESSION_INVALID');
  });

  test('la deconnexion revoque la session, meme avec un jeton d acces expire', async () => {
    const s = await sessions.createSession(user());
    const res = await request(app).post('/api/auth/logout').send({ refreshToken: s.refreshToken });
    expect(res.status).toBe(204);
    expect(table.get(s.sessionId).revoke_reason).toBe('logout');
    await expect(sessions.refresh(s.refreshToken)).rejects.toMatchObject({ status: 401 });
  });

  test('deconnecter tous les appareils revoque toutes les sessions de l utilisateur', async () => {
    const a = await sessions.createSession(user());
    const b = await sessions.createSession(user());
    const res = await request(app).post('/api/auth/logout-all').set('Authorization', `Bearer ${a.token}`);
    expect(res.body.revoked).toBe(2);
    expect(table.get(b.sessionId).revoke_reason).toBe('logout_all');
  });

  test('une ancienne session de 7 jours est convertie sans deconnexion', async () => {
    const legacy = jwt.sign({ id: 7, role: 'patient' }, 'test-secret', { expiresIn: '7d' });
    const res = await request(app).post('/api/auth/upgrade-session').send({ token: legacy });
    expect(res.status).toBe(200);
    expect(res.body.refreshToken).toBeTruthy();
    const modern = (await sessions.createSession(user())).token;
    const again = await request(app).post('/api/auth/upgrade-session').send({ token: modern });
    expect(again.status).toBe(400);
  });

  test('un jeton ancien format expire ne peut pas etre converti', async () => {
    const old = jwt.sign({ id: 7, role: 'patient', exp: Math.floor(Date.now() / 1000) - 10 }, 'test-secret');
    const res = await request(app).post('/api/auth/upgrade-session').send({ token: old });
    expect(res.status).toBe(401);
  });
});

describe('Migration 015_auth_sessions', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', '015_auth_sessions.sql'), 'utf8');

  test('ne stocke que des empreintes et borne la duree des sessions', () => {
    expect(sql).toContain("CHECK (token_hash ~ '^[0-9a-f]{64}$')");
    expect(sql).toContain('CHECK (expires_at <= absolute_expires_at)');
    expect(sql).not.toMatch(/refresh_token\s+(TEXT|VARCHAR)/i);
  });
});

const crypto = require('crypto');
