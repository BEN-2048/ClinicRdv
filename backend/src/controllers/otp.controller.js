const crypto = require('crypto');
const pool = require('../config/db');
const env = require('../config/env');
const { BrevoClient } = require('@getbrevo/brevo');

const generateCode = () =>
  crypto.randomInt(0, 1000000).toString().padStart(6, '0');

const hashCode = (code) => {
  if (!env.otpSecret) throw new Error('OTP_SECRET non configure');
  return crypto.createHmac('sha256', env.otpSecret).update(code).digest('hex');
};

const sendEmail = async (email, code) => {
  if (!env.brevoApiKey || !env.brevoSenderEmail) {
    throw new Error('Configuration Brevo incomplete');
  }

  const client = new BrevoClient({ apiKey: env.brevoApiKey });

  return client.transactionalEmails.sendTransacEmail({
    sender: {
      name: 'ClinicRDV',
      email: env.brevoSenderEmail,
    },
    to: [{ email }],
    subject: 'ClinicRDV - Verification de votre adresse e-mail',
    htmlContent: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto">
        <h2>Bienvenue sur ClinicRDV</h2>
        <p>Voici votre code de verification :</p>
        <h1 style="letter-spacing:8px;color:#2563eb">${code}</h1>
        <p>Ce code expire dans ${env.otpExpiresMinutes} minutes.</p>
        <p>Si vous n'etes pas a l'origine de cette inscription, ignorez ce message.</p>
      </div>
    `,
  });
};

const createVerification = async (client, userId, email) => {
  const code = generateCode();
  const codeHash = hashCode(code);

  await client.query(
    `INSERT INTO email_verifications
      (user_id, code_hash, attempts, expires_at, last_sent_at, consumed_at)
     VALUES ($1, $2, 0, NOW() + ($3 * INTERVAL '1 minute'), NOW(), NULL)
     ON CONFLICT (user_id)
     DO UPDATE SET
       code_hash = EXCLUDED.code_hash,
       attempts = 0,
       expires_at = EXCLUDED.expires_at,
       last_sent_at = NOW(),
       consumed_at = NULL`,
    [userId, codeHash, env.otpExpiresMinutes]
  );

  await sendEmail(email, code);

  return { expiresIn: env.otpExpiresMinutes * 60 };
};

const verifyCode = async (email, code) => {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
    return { ok: false, reason: 'Code invalide.' };
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `SELECT u.id AS user_id, u.email, u.role,
              u.first_name, u.last_name, u.is_verified,
              ev.code_hash, ev.attempts, ev.expires_at, ev.consumed_at
       FROM users u
       JOIN email_verifications ev ON ev.user_id = u.id
       WHERE LOWER(u.email) = LOWER($1)
       FOR UPDATE OF u, ev`,
      [email]
    );

    if (!result.rows.length) {
      await client.query('COMMIT');
      return { ok: false, reason: 'Code invalide ou introuvable.' };
    }

    const verification = result.rows[0];

    if (verification.is_verified) {
      await client.query('COMMIT');
      return { ok: false, reason: 'Ce compte est deja verifie.' };
    }

    if (verification.consumed_at) {
      await client.query('COMMIT');
      return { ok: false, reason: 'Ce code a deja ete utilise.' };
    }

    if (new Date(verification.expires_at) <= new Date()) {
      await client.query('COMMIT');
      return { ok: false, reason: 'Le code a expire.' };
    }

    if (verification.attempts >= env.otpMaxAttempts) {
      await client.query('COMMIT');
      return { ok: false, reason: 'Nombre maximal de tentatives atteint.' };
    }

    const expected = Buffer.from(verification.code_hash, 'hex');
    const received = Buffer.from(hashCode(code), 'hex');

    const valid = expected.length === received.length &&
      crypto.timingSafeEqual(expected, received);

    if (!valid) {
      await client.query(
        'UPDATE email_verifications SET attempts = attempts + 1 WHERE user_id = $1',
        [verification.user_id]
      );
      await client.query('COMMIT');
      return { ok: false, reason: 'Code incorrect.' };
    }

    await client.query(
      'UPDATE users SET is_verified = TRUE WHERE id = $1',
      [verification.user_id]
    );

    await client.query(
      'UPDATE email_verifications SET consumed_at = NOW() WHERE user_id = $1',
      [verification.user_id]
    );

    await client.query('COMMIT');

    return {
      ok: true,
      user: {
        id: verification.user_id,
        email: verification.email,
        role: verification.role,
        first_name: verification.first_name,
        last_name: verification.last_name,
      },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const resendCode = async (email) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `SELECT u.id AS user_id, u.email, u.is_verified,
              ev.last_sent_at
       FROM users u
       JOIN email_verifications ev ON ev.user_id = u.id
       WHERE LOWER(u.email) = LOWER($1)
       FOR UPDATE OF u, ev`,
      [email]
    );

    if (!result.rows.length) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'Demande de verification introuvable.' };
    }

    const user = result.rows[0];

    if (user.is_verified) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'Ce compte est deja verifie.' };
    }

    const remaining = await client.query(
      `SELECT GREATEST(0, CEIL(EXTRACT(EPOCH FROM (
        $1::timestamptz + ($2 * INTERVAL '1 second') - NOW()
      ))))::INTEGER AS seconds`,
      [user.last_sent_at, env.otpResendCooldownSeconds]
    );

    if (remaining.rows[0].seconds > 0) {
      await client.query('ROLLBACK');
      return {
        ok: false,
        reason: 'Veuillez patienter avant de demander un nouveau code.',
        waitSeconds: remaining.rows[0].seconds,
      };
    }

    const code = generateCode();
    const codeHash = hashCode(code);

    await client.query(
      `UPDATE email_verifications
       SET code_hash = $1,
           attempts = 0,
           expires_at = NOW() + ($2 * INTERVAL '1 minute'),
           last_sent_at = NOW(),
           consumed_at = NULL
       WHERE user_id = $3`,
      [codeHash, env.otpExpiresMinutes, user.user_id]
    );

    await sendEmail(user.email, code);

    await client.query('COMMIT');

    return {
      ok: true,
      expiresIn: env.otpExpiresMinutes * 60,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  generateCode,
  hashCode,
  createVerification,
  verifyCode,
  resendCode,
};
