const bcrypt = require('bcrypt');
const pool = require('../config/db');
const env = require('../config/env');
const { generateCode, hashCode } = require('../controllers/otp.controller');
const phoneOtp = require('./phoneOtp.service');
const { getEmailDriver, maskEmail } = require('../messaging/email');
const { normalizeDrcPhone, formatDrcPhone, maskPhone } = require('../utils/phone');

const { httpError, sameHash } = phoneOtp;

const GENERIC_RECOVERY = 'Si un compte correspond à cet identifiant, un code de récupération vient d’être envoyé.';
const CONTACT_US = 'Si ce n’est pas vous, contactez votre établissement de santé.';

const NOTICES = {
  passwordChanged: () => `ClinicRDV: le mot de passe de votre compte vient d'etre modifie. ${CONTACT_US}`,
  phoneChanged: (phone) => `ClinicRDV: le numero de votre compte a ete remplace par ${maskPhone(phone)}. ${CONTACT_US}`,
  emailChanged: (email) => `ClinicRDV: l'adresse e-mail ${maskEmail(email)} est maintenant liee a votre compte. ${CONTACT_US}`,
};

const EMAILS = {
  recovery: (code) => ({
    subject: 'ClinicRDV - Récupération de votre compte',
    text: `Votre code de récupération ClinicRDV est ${code}. Il est valable ${env.otpExpiresMinutes} minutes.\nSi vous n’êtes pas à l’origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.`,
  }),
  email_change: (code) => ({
    subject: 'ClinicRDV - Confirmation de votre adresse e-mail',
    text: `Votre code de confirmation ClinicRDV est ${code}. Il est valable ${env.otpExpiresMinutes} minutes.\nSi vous n’êtes pas à l’origine de cette demande, ignorez ce message.`,
  }),
  replaced: (email) => ({
    subject: 'ClinicRDV - Adresse e-mail modifiée',
    text: `L’adresse e-mail de votre compte ClinicRDV a été remplacée par ${maskEmail(email)}. ${CONTACT_US}`,
  }),
};

const withTx = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query(error.commit ? 'COMMIT' : 'ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const secondsToWait = (lastSentAt) =>
  lastSentAt
    ? Math.ceil((new Date(lastSentAt).getTime() + env.otpResendCooldownSeconds * 1000 - Date.now()) / 1000)
    : 0;

const assertCooldown = (row) => {
  const wait = secondsToWait(row?.last_sent_at);
  if (wait > 0) {
    throw Object.assign(httpError(429, 'Veuillez patienter avant de demander un nouveau code.'), { waitSeconds: wait });
  }
};

const consumeCode = async (client, table, row, code) => {
  if (!row || row.consumed_at) throw httpError(400, 'Code invalide ou expiré. Demandez un nouveau code.', 'OTP_INVALID');
  if (new Date(row.expires_at) <= new Date()) throw httpError(400, 'Le code a expiré. Demandez un nouveau code.', 'OTP_EXPIRED');
  if (row.attempts >= env.otpMaxAttempts) {
    throw httpError(400, 'Nombre maximal de tentatives atteint. Demandez un nouveau code.', 'OTP_LOCKED');
  }
  if (!sameHash(row.code_hash, hashCode(code))) {
    await client.query(`UPDATE ${table} SET attempts = attempts + 1 WHERE id = $1`, [row.id]);
    throw Object.assign(httpError(400, 'Code incorrect.', 'OTP_WRONG'), { commit: true });
  }
  await client.query(`UPDATE ${table} SET consumed_at = now() WHERE id = $1`, [row.id]);
};

const sendEmailCode = async (db, { userId, email, purpose }) => {
  const driver = getEmailDriver();
  const code = generateCode();
  await db.query(
    `INSERT INTO email_codes (user_id, email, purpose, code_hash, attempts, expires_at, last_sent_at, consumed_at)
     VALUES ($1, $2, $3, $4, 0, now() + ($5 * interval '1 minute'), now(), NULL)
     ON CONFLICT (user_id, purpose)
     DO UPDATE SET email = EXCLUDED.email, code_hash = EXCLUDED.code_hash, attempts = 0,
                   expires_at = EXCLUDED.expires_at, last_sent_at = now(), consumed_at = NULL`,
    [userId, email, purpose, hashCode(code), env.otpExpiresMinutes]
  );
  const { subject, text } = EMAILS[purpose](code);
  try {
    await driver.send(email, subject, text);
  } catch (error) {
    console.error('Envoi d’e-mail impossible :', error.message);
    throw httpError(503, 'Envoi de l’e-mail impossible pour le moment. Réessayez dans quelques minutes.', 'EMAIL_SEND_FAILED');
  }
  return { expiresIn: env.otpExpiresMinutes * 60 };
};

const notifyEmail = async (email, message) => {
  try {
    await getEmailDriver().send(email, message.subject, message.text);
  } catch (error) {
    console.error('Avis par e-mail non envoyé :', error.message);
  }
};

const parseIdentifier = (identifier) => {
  const value = String(identifier ?? '').trim();
  if (value.includes('@')) return { email: value.toLowerCase() };
  const phone = normalizeDrcPhone(value);
  return phone ? { phone } : null;
};

const revokeSessions = (client, userId, reason, exceptSessionId = null) =>
  client.query(
    `UPDATE auth_sessions SET revoked_at = now(), revoke_reason = $2
      WHERE user_id = $1 AND revoked_at IS NULL AND ($3::uuid IS NULL OR id <> $3::uuid)`,
    [userId, reason, exceptSessionId]
  );

const checkPassword = async (password, hash) => {
  if (!(await bcrypt.compare(password, hash))) {
    throw httpError(400, 'Mot de passe incorrect.', 'WRONG_PASSWORD');
  }
};

exports.requestRecovery = async (identifier) => {
  const target = parseIdentifier(identifier);
  if (!target) {
    throw httpError(400, 'Saisissez un numéro congolais (ex. 081 234 5678) ou une adresse e-mail.', 'INVALID_IDENTIFIER');
  }

  try {
    await withTx(async (client) => {
      const user = target.email
        ? (await client.query(
          `SELECT u.id, ec.last_sent_at
             FROM users u
             LEFT JOIN email_codes ec ON ec.user_id = u.id AND ec.purpose = 'recovery'
            WHERE LOWER(u.email) = $1 AND (u.role <> 'patient' OR u.is_verified)
            FOR UPDATE OF u`,
          [target.email]
        )).rows[0]
        : (await client.query(
          `SELECT u.id, pv.last_sent_at
             FROM users u
             LEFT JOIN phone_verifications pv ON pv.user_id = u.id AND pv.purpose = 'recovery'
            WHERE u.phone_e164 = $1 AND u.phone_verified_at IS NOT NULL
            FOR UPDATE OF u`,
          [target.phone]
        )).rows[0];

      if (!user || secondsToWait(user.last_sent_at) > 0) return;

      if (target.email) await sendEmailCode(client, { userId: user.id, email: target.email, purpose: 'recovery' });
      else await phoneOtp.sendCode(client, { userId: user.id, phone: target.phone, purpose: 'recovery' });
    });
  } catch (error) {
    if (!error.expose || error.code === 'SMS_DAILY_LIMIT') throw error;
    console.warn(`Récupération de compte : code non envoyé (${error.code})`);
  }

  return { message: GENERIC_RECOVERY, expiresIn: env.otpExpiresMinutes * 60 };
};

exports.resetPassword = async ({ identifier, code, newPassword }) => {
  const target = parseIdentifier(identifier);
  if (!target) throw httpError(400, 'Code invalide ou expiré. Demandez un nouveau code.', 'OTP_INVALID');
  const hash = await bcrypt.hash(newPassword, 10);

  const user = await withTx(async (client) => {
    const table = target.email ? 'email_codes' : 'phone_verifications';
    const row = target.email
      ? (await client.query(
        `SELECT ec.id, ec.user_id, ec.code_hash, ec.attempts, ec.expires_at, ec.consumed_at,
                u.phone_e164, u.phone_verified_at
           FROM email_codes ec
           JOIN users u ON u.id = ec.user_id
          WHERE LOWER(ec.email) = $1 AND ec.purpose = 'recovery' AND LOWER(u.email) = $1
          FOR UPDATE OF ec, u`,
        [target.email]
      )).rows[0]
      : (await client.query(
        `SELECT pv.id, pv.user_id, pv.code_hash, pv.attempts, pv.expires_at, pv.consumed_at,
                u.phone_e164, u.phone_verified_at
           FROM phone_verifications pv
           JOIN users u ON u.id = pv.user_id
          WHERE pv.phone_e164 = $1 AND pv.purpose = 'recovery'
            AND u.phone_e164 = $1 AND u.phone_verified_at IS NOT NULL
          FOR UPDATE OF pv, u`,
        [target.phone]
      )).rows[0];

    await consumeCode(client, table, row, code);
    await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, row.user_id]);
    await revokeSessions(client, row.user_id, 'password_reset');
    return row;
  });

  if (user.phone_verified_at) await phoneOtp.notify(user.phone_e164, NOTICES.passwordChanged());
  return { message: 'Mot de passe modifié. Connectez-vous avec votre nouveau mot de passe.' };
};

exports.changePassword = async (auth, { currentPassword, newPassword }) => {
  const user = (await pool.query(
    'SELECT password_hash, phone_e164, phone_verified_at FROM users WHERE id = $1',
    [auth.id]
  )).rows[0];
  if (!user) throw httpError(404, 'Utilisateur introuvable');
  await checkPassword(currentPassword, user.password_hash);
  if (await bcrypt.compare(newPassword, user.password_hash)) {
    throw httpError(400, 'Le nouveau mot de passe doit être différent de l’actuel.', 'SAME_PASSWORD');
  }

  const hash = await bcrypt.hash(newPassword, 10);
  await withTx(async (client) => {
    await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, auth.id]);
    await revokeSessions(client, auth.id, 'password_change', auth.sid ?? null);
  });

  if (user.phone_verified_at) await phoneOtp.notify(user.phone_e164, NOTICES.passwordChanged());
  return { message: 'Mot de passe modifié. Vos autres appareils ont été déconnectés.' };
};

exports.requestPhoneChange = async (auth, { phone: raw, password }) => {
  const phone = normalizeDrcPhone(raw);
  if (!phone) throw httpError(400, 'Numéro de téléphone congolais invalide (ex. 081 234 5678)', 'INVALID_PHONE');

  return withTx(async (client) => {
    const user = (await client.query(
      `SELECT u.password_hash, u.phone_e164, u.phone_verified_at, pv.last_sent_at
         FROM users u
         LEFT JOIN phone_verifications pv ON pv.user_id = u.id AND pv.purpose = 'phone_change'
        WHERE u.id = $1
        FOR UPDATE OF u`,
      [auth.id]
    )).rows[0];
    if (!user) throw httpError(404, 'Utilisateur introuvable');
    await checkPassword(password, user.password_hash);
    if (user.phone_verified_at && user.phone_e164 === phone) {
      throw httpError(400, 'C’est déjà le numéro de votre compte.', 'SAME_PHONE');
    }
    const taken = await client.query(
      'SELECT 1 FROM users WHERE phone_e164 = $1 AND phone_verified_at IS NOT NULL AND id <> $2',
      [phone, auth.id]
    );
    if (taken.rowCount) throw httpError(409, 'Ce numéro est déjà associé à un autre compte.', 'PHONE_TAKEN');
    assertCooldown(user);

    const sent = await phoneOtp.sendCode(client, { userId: auth.id, phone, purpose: 'phone_change' });
    return { phone, ...sent };
  });
};

exports.resendPhoneChange = (auth) =>
  withTx(async (client) => {
    const pending = (await client.query(
      `SELECT phone_e164, last_sent_at, consumed_at FROM phone_verifications
        WHERE user_id = $1 AND purpose = 'phone_change' FOR UPDATE`,
      [auth.id]
    )).rows[0];
    if (!pending || pending.consumed_at) throw httpError(400, 'Aucun changement de numéro en cours.', 'NO_PENDING_CHANGE');
    assertCooldown(pending);
    const sent = await phoneOtp.sendCode(client, { userId: auth.id, phone: pending.phone_e164, purpose: 'phone_change' });
    return { phone: pending.phone_e164, ...sent };
  });

exports.confirmPhoneChange = async (auth, code) => {
  const change = await withTx(async (client) => {
    const row = (await client.query(
      `SELECT pv.id, pv.phone_e164 AS new_phone, pv.code_hash, pv.attempts, pv.expires_at, pv.consumed_at,
              u.phone_e164 AS old_phone, u.phone_verified_at
         FROM phone_verifications pv
         JOIN users u ON u.id = pv.user_id
        WHERE pv.user_id = $1 AND pv.purpose = 'phone_change'
        FOR UPDATE OF pv, u`,
      [auth.id]
    )).rows[0];

    await consumeCode(client, 'phone_verifications', row, code);
    try {
      await client.query(
        'UPDATE users SET phone_e164 = $1, phone = $2, phone_verified_at = now() WHERE id = $3',
        [row.new_phone, formatDrcPhone(row.new_phone), auth.id]
      );
    } catch (error) {
      if (error.code === '23505') throw httpError(409, 'Ce numéro est déjà associé à un autre compte.', 'PHONE_TAKEN');
      throw error;
    }
    await client.query("DELETE FROM phone_verifications WHERE user_id = $1 AND purpose = 'recovery'", [auth.id]);
    await revokeSessions(client, auth.id, 'phone_change', auth.sid ?? null);
    return row;
  });

  if (change.phone_verified_at && change.old_phone && change.old_phone !== change.new_phone) {
    await phoneOtp.notify(change.old_phone, NOTICES.phoneChanged(change.new_phone));
  }
  return { phone: change.new_phone };
};

exports.requestEmailChange = async (auth, { email: raw, password }) => {
  const email = raw.trim().toLowerCase();

  return withTx(async (client) => {
    const user = (await client.query(
      `SELECT u.password_hash, u.email, ec.last_sent_at
         FROM users u
         LEFT JOIN email_codes ec ON ec.user_id = u.id AND ec.purpose = 'email_change'
        WHERE u.id = $1
        FOR UPDATE OF u`,
      [auth.id]
    )).rows[0];
    if (!user) throw httpError(404, 'Utilisateur introuvable');
    await checkPassword(password, user.password_hash);
    if (user.email && user.email.toLowerCase() === email) {
      throw httpError(400, 'C’est déjà l’adresse e-mail de votre compte.', 'SAME_EMAIL');
    }
    const taken = await client.query('SELECT 1 FROM users WHERE LOWER(email) = $1 AND id <> $2', [email, auth.id]);
    if (taken.rowCount) throw httpError(409, 'Cette adresse e-mail est déjà utilisée par un autre compte.', 'EMAIL_TAKEN');
    assertCooldown(user);

    await client.query('UPDATE users SET pending_email = $1 WHERE id = $2', [email, auth.id]);
    const sent = await sendEmailCode(client, { userId: auth.id, email, purpose: 'email_change' });
    return { email, ...sent };
  });
};

exports.resendEmailChange = (auth) =>
  withTx(async (client) => {
    const pending = (await client.query(
      `SELECT email, last_sent_at, consumed_at FROM email_codes
        WHERE user_id = $1 AND purpose = 'email_change' FOR UPDATE`,
      [auth.id]
    )).rows[0];
    if (!pending || pending.consumed_at) throw httpError(400, 'Aucune adresse e-mail en attente de confirmation.', 'NO_PENDING_CHANGE');
    assertCooldown(pending);
    const sent = await sendEmailCode(client, { userId: auth.id, email: pending.email, purpose: 'email_change' });
    return { email: pending.email, ...sent };
  });

exports.confirmEmailChange = async (auth, code) => {
  const change = await withTx(async (client) => {
    const row = (await client.query(
      `SELECT ec.id, ec.email AS new_email, ec.code_hash, ec.attempts, ec.expires_at, ec.consumed_at,
              u.email AS old_email, u.phone_e164, u.phone_verified_at
         FROM email_codes ec
         JOIN users u ON u.id = ec.user_id
        WHERE ec.user_id = $1 AND ec.purpose = 'email_change'
        FOR UPDATE OF ec, u`,
      [auth.id]
    )).rows[0];

    await consumeCode(client, 'email_codes', row, code);
    try {
      await client.query('UPDATE users SET email = $1, pending_email = NULL WHERE id = $2', [row.new_email, auth.id]);
    } catch (error) {
      if (error.code === '23505') throw httpError(409, 'Cette adresse e-mail est déjà utilisée par un autre compte.', 'EMAIL_TAKEN');
      throw error;
    }
    await client.query("DELETE FROM email_codes WHERE user_id = $1 AND purpose = 'recovery'", [auth.id]);
    return row;
  });

  if (change.phone_verified_at) await phoneOtp.notify(change.phone_e164, NOTICES.emailChanged(change.new_email));
  if (change.old_email && change.old_email.toLowerCase() !== change.new_email) {
    await notifyEmail(change.old_email, EMAILS.replaced(change.new_email));
  }
  return { email: change.new_email };
};
