const crypto = require('crypto');
const pool = require('../config/db');
const env = require('../config/env');
const { generateCode, hashCode } = require('../controllers/otp.controller');
const { getSmsDriver, toGsm7 } = require('../messaging');

const httpError = (status, message, code) =>
  Object.assign(new Error(message), { status, expose: true, ...(code ? { code } : {}) });

const MESSAGES = {
  signup: (code) => `ClinicRDV: votre code est ${code} (valable ${env.otpExpiresMinutes} min). Ne le partagez avec personne.`,
  recovery: (code) => `ClinicRDV: code de recuperation ${code} (valable ${env.otpExpiresMinutes} min). Si ce n'est pas vous, ignorez ce message.`,
  phone_change: (code) => `ClinicRDV: code de confirmation du nouveau numero ${code} (valable ${env.otpExpiresMinutes} min).`,
};

const assertCaps = async (db, phone) => {
  const r = await db.query(
    `SELECT
       (SELECT count(*)::int FROM sms_outbox
         WHERE destination = $1 AND status = 'sent' AND created_at > now() - interval '24 hours') AS per_number,
       (SELECT count(*)::int FROM sms_outbox
         WHERE status = 'sent' AND created_at > now() - interval '24 hours') AS global`,
    [phone]
  );
  const counts = r.rows[0] ?? { per_number: 0, global: 0 };
  if (counts.per_number >= env.smsPerNumberDaily) {
    throw httpError(429, 'Trop de codes envoyés à ce numéro aujourd’hui. Réessayez demain.', 'SMS_NUMBER_LIMIT');
  }
  if (counts.global >= env.smsDailyCap) {
    throw httpError(503, 'Le service SMS a atteint sa limite quotidienne. Réessayez plus tard.', 'SMS_DAILY_LIMIT');
  }
};

exports.sendCode = async (db, { userId, phone, purpose }) => {
  await assertCaps(db, phone);
  const driver = getSmsDriver();
  const code = generateCode();

  await db.query(
    `INSERT INTO phone_verifications (user_id, phone_e164, purpose, code_hash, attempts, expires_at, last_sent_at, consumed_at)
     VALUES ($1, $2, $3, $4, 0, now() + ($5 * interval '1 minute'), now(), NULL)
     ON CONFLICT (user_id, purpose)
     DO UPDATE SET phone_e164 = EXCLUDED.phone_e164, code_hash = EXCLUDED.code_hash, attempts = 0,
                   expires_at = EXCLUDED.expires_at, last_sent_at = now(), consumed_at = NULL`,
    [userId, phone, purpose, hashCode(code), env.otpExpiresMinutes]
  );

  try {
    await driver.send(phone, toGsm7(MESSAGES[purpose](code)));
  } catch (error) {
    await pool.query(
      `INSERT INTO sms_outbox (destination, purpose, driver, status, error) VALUES ($1, $2, $3, 'failed', $4)`,
      [phone, purpose, driver.name, String(error.message).slice(0, 255)]
    ).catch(() => {});
    throw httpError(503, 'Envoi du SMS impossible pour le moment. Réessayez dans quelques minutes.', 'SMS_SEND_FAILED');
  }

  await db.query(
    `INSERT INTO sms_outbox (destination, purpose, driver, status) VALUES ($1, $2, $3, 'sent')`,
    [phone, purpose, driver.name]
  );
  return { expiresIn: env.otpExpiresMinutes * 60 };
};

const sameHash = (a, b) => {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

const PENDING_SIGNUP = `
  SELECT pv.id, pv.user_id, pv.code_hash, pv.attempts, pv.expires_at, pv.consumed_at, pv.last_sent_at,
         u.email, u.role, u.first_name, u.last_name, u.phone_e164
    FROM phone_verifications pv
    JOIN users u ON u.id = pv.user_id
   WHERE pv.phone_e164 = $1 AND pv.purpose = 'signup' AND u.phone_verified_at IS NULL
   ORDER BY pv.last_sent_at DESC
   LIMIT 1
   FOR UPDATE OF pv, u`;

exports.verifySignup = async (phone, code) => {
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query('BEGIN');
    const row = (await client.query(PENDING_SIGNUP, [phone])).rows[0];
    const fail = async (status, message, errCode) => {
      await client.query('COMMIT');
      committed = true;
      throw httpError(status, message, errCode);
    };

    if (!row) return await fail(400, 'Code invalide ou introuvable.');
    if (row.consumed_at) return await fail(400, 'Ce code a déjà été utilisé.');
    if (new Date(row.expires_at) <= new Date()) return await fail(400, 'Le code a expiré.', 'OTP_EXPIRED');
    if (row.attempts >= env.otpMaxAttempts) return await fail(400, 'Nombre maximal de tentatives atteint.', 'OTP_LOCKED');

    if (!sameHash(row.code_hash, hashCode(code))) {
      await client.query('UPDATE phone_verifications SET attempts = attempts + 1 WHERE id = $1', [row.id]);
      return await fail(400, 'Code incorrect.');
    }

    try {
      await client.query('SAVEPOINT verify_phone');
      await client.query('UPDATE users SET phone_verified_at = now(), is_verified = TRUE WHERE id = $1', [row.user_id]);
    } catch (error) {
      if (error.code !== '23505') throw error;
      await client.query('ROLLBACK TO SAVEPOINT verify_phone');
      return await fail(409, 'Ce numéro est déjà associé à un compte vérifié.', 'PHONE_TAKEN');
    }
    await client.query('UPDATE phone_verifications SET consumed_at = now() WHERE id = $1', [row.id]);
    await client.query('COMMIT');
    committed = true;

    return {
      id: row.user_id,
      email: row.email,
      role: row.role,
      first_name: row.first_name,
      last_name: row.last_name,
      phone_e164: row.phone_e164,
    };
  } catch (error) {
    if (!committed) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

exports.resendSignup = async (phone) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const row = (await client.query(PENDING_SIGNUP, [phone])).rows[0];
    if (!row) throw httpError(400, 'Demande de vérification introuvable.');

    const wait = Math.ceil((new Date(row.last_sent_at).getTime() + env.otpResendCooldownSeconds * 1000 - Date.now()) / 1000);
    if (wait > 0) {
      throw Object.assign(httpError(429, 'Veuillez patienter avant de demander un nouveau code.'), { waitSeconds: wait });
    }

    const result = await exports.sendCode(client, { userId: row.user_id, phone, purpose: 'signup' });
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

exports.notify = async (phone, text) => {
  let driverName = env.smsDriver;
  try {
    await assertCaps(pool, phone);
    const driver = getSmsDriver();
    driverName = driver.name;
    await driver.send(phone, toGsm7(text));
    await pool.query(
      `INSERT INTO sms_outbox (destination, purpose, driver, status) VALUES ($1, 'notice', $2, 'sent')`,
      [phone, driverName]
    );
    return true;
  } catch (error) {
    await pool.query(
      `INSERT INTO sms_outbox (destination, purpose, driver, status, error) VALUES ($1, 'notice', $2, 'failed', $3)`,
      [phone, String(driverName).slice(0, 20), String(error.message).slice(0, 255)]
    ).catch(() => {});
    return false;
  }
};

exports.httpError = httpError;
exports.sameHash = sameHash;
