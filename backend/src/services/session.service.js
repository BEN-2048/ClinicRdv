const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const env = require('../config/env');

const httpError = (status, message, code) =>
  Object.assign(new Error(message), { status, ...(code ? { code } : {}) });

const DAY_MS = 24 * 60 * 60 * 1000;
const GRACE_MS = 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');

const sameHash = (a, b) => {
  if (!a || !b) return false;
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

const newSecret = () => crypto.randomBytes(32).toString('base64url');

const parseRefreshToken = (token) => {
  const [sessionId, secret, extra] = String(token ?? '').split('.');
  if (!UUID.test(sessionId ?? '') || !secret || extra !== undefined || secret.length < 32) return null;
  return { sessionId, secret };
};

const signAccess = (user, sessionId) =>
  jwt.sign({ id: user.id, role: user.role, sid: sessionId }, env.jwtSecret, { expiresIn: env.accessTokenTtl });

const accessExpiresIn = (token) => {
  const decoded = jwt.decode(token);
  return decoded?.exp ? decoded.exp - Math.floor(Date.now() / 1000) : null;
};

const bundle = (user, sessionId, secret) => {
  const token = signAccess(user, sessionId);
  return {
    token,
    refreshToken: `${sessionId}.${secret}`,
    sessionId,
    expiresIn: accessExpiresIn(token),
  };
};

const cleanLabel = (label) => {
  const text = typeof label === 'string' ? label.replace(/[^\p{L}\p{N} .,'()-]/gu, '').trim() : '';
  return text ? text.slice(0, 100) : null;
};

exports.createSession = async (user, { deviceLabel, ip } = {}, db = pool) => {
  const sessionId = crypto.randomUUID();
  const secret = newSecret();
  const now = Date.now();
  await db.query(
    `INSERT INTO auth_sessions
       (id, user_id, device_label, token_hash, created_ip, expires_at, absolute_expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [sessionId, user.id, cleanLabel(deviceLabel), hash(secret), ip ?? null,
      new Date(now + env.refreshTokenDays * DAY_MS), new Date(now + env.sessionMaxDays * DAY_MS)]
  );
  return bundle(user, sessionId, secret);
};

const loadUser = async (db, userId) => {
  const r = await db.query('SELECT id, email, role, first_name, last_name, is_verified FROM users WHERE id = $1', [userId]);
  const user = r.rows[0];
  if (!user) throw httpError(401, 'Session expirée, reconnectez-vous', 'SESSION_INVALID');
  if (user.role === 'patient' && user.is_verified === false) {
    throw httpError(401, 'Session expirée, reconnectez-vous', 'SESSION_INVALID');
  }
  return user;
};

exports.refresh = async (refreshToken) => {
  const parsed = parseRefreshToken(refreshToken);
  if (!parsed) throw httpError(401, 'Session expirée, reconnectez-vous', 'SESSION_INVALID');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query('SELECT * FROM auth_sessions WHERE id = $1 FOR UPDATE', [parsed.sessionId]);
    const session = r.rows[0];
    const now = Date.now();

    const invalid = () => httpError(401, 'Session expirée, reconnectez-vous', 'SESSION_INVALID');
    if (!session || session.revoked_at) throw invalid();
    if (new Date(session.expires_at).getTime() <= now || new Date(session.absolute_expires_at).getTime() <= now) {
      throw invalid();
    }

    const presented = hash(parsed.secret);
    const isCurrent = sameHash(presented, session.token_hash);
    const isPrevious = sameHash(presented, session.previous_token_hash);
    const withinGrace = session.rotated_at && now - new Date(session.rotated_at).getTime() <= GRACE_MS;

    if (!isCurrent && !(isPrevious && withinGrace)) {
      if (isPrevious) {
        await client.query(
          "UPDATE auth_sessions SET revoked_at = now(), revoke_reason = 'reuse' WHERE id = $1",
          [session.id]
        );
        await client.query('COMMIT');
      }
      throw invalid();
    }

    const user = await loadUser(client, session.user_id);
    const secret = newSecret();
    const absolute = new Date(session.absolute_expires_at).getTime();
    await client.query(
      `UPDATE auth_sessions
          SET previous_token_hash = $2,
              token_hash = $3,
              rotated_at = now(),
              last_used_at = now(),
              expires_at = $4
        WHERE id = $1`,
      [session.id, isCurrent ? session.token_hash : session.previous_token_hash, hash(secret),
        new Date(Math.min(now + env.refreshTokenDays * DAY_MS, absolute))]
    );
    await client.query('COMMIT');
    return { ...bundle(user, session.id, secret), user: publicUser(user) };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const publicUser = (u) => ({ id: u.id, email: u.email, role: u.role, first_name: u.first_name, last_name: u.last_name });

exports.revokeByRefreshToken = async (refreshToken) => {
  const parsed = parseRefreshToken(refreshToken);
  if (!parsed) return false;
  const r = await pool.query('SELECT id, token_hash, previous_token_hash FROM auth_sessions WHERE id = $1 AND revoked_at IS NULL', [parsed.sessionId]);
  const session = r.rows[0];
  const presented = hash(parsed.secret);
  if (!session || !(sameHash(presented, session.token_hash) || sameHash(presented, session.previous_token_hash))) return false;
  await pool.query("UPDATE auth_sessions SET revoked_at = now(), revoke_reason = 'logout' WHERE id = $1 AND revoked_at IS NULL", [session.id]);
  return true;
};

exports.revokeAll = async (userId, reason = 'logout_all', exceptSessionId = null) => {
  const r = await pool.query(
    `UPDATE auth_sessions SET revoked_at = now(), revoke_reason = $2
      WHERE user_id = $1 AND revoked_at IS NULL AND ($3::uuid IS NULL OR id <> $3::uuid)`,
    [userId, reason, exceptSessionId]
  );
  return r.rowCount;
};

exports.revokeOne = async (userId, sessionId) => {
  if (!UUID.test(String(sessionId))) throw httpError(404, 'Appareil introuvable');
  const r = await pool.query(
    "UPDATE auth_sessions SET revoked_at = now(), revoke_reason = 'device_revoked' WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL",
    [sessionId, userId]
  );
  if (!r.rowCount) throw httpError(404, 'Appareil introuvable');
};

exports.list = async (userId, currentSessionId) => {
  const r = await pool.query(
    `SELECT id, device_label, created_at, last_used_at, expires_at
       FROM auth_sessions
      WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
      ORDER BY last_used_at DESC`,
    [userId]
  );
  return r.rows.map((s) => ({ ...s, current: s.id === currentSessionId }));
};

exports.upgradeLegacy = async (legacyToken, { deviceLabel, ip } = {}) => {
  let payload;
  try {
    payload = jwt.verify(String(legacyToken ?? ''), env.jwtSecret);
  } catch {
    throw httpError(401, 'Session expirée, reconnectez-vous', 'SESSION_INVALID');
  }
  if (payload.sid) throw httpError(400, 'Cette session est déjà au nouveau format');
  const user = await loadUser(pool, payload.id);
  return { ...(await exports.createSession(user, { deviceLabel, ip })), user: publicUser(user) };
};

exports.parseRefreshToken = parseRefreshToken;
exports.GRACE_MS = GRACE_MS;
