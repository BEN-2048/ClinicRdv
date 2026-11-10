const bcrypt = require('bcrypt');
const pool = require('../config/db');
const otp = require('./otp.controller');
const sessions = require('../services/session.service');
const phoneOtp = require('../services/phoneOtp.service');
const { normalizeDrcPhone, formatDrcPhone } = require('../utils/phone');

const invalidPhone = (res) =>
  res.status(400).json({ code: 'INVALID_PHONE', error: 'Numéro de téléphone congolais invalide (ex. 081 234 5678)' });

const publicUser = (user) => ({
  id: user.id,
  email: user.email,
  role: user.role,
  first_name: user.first_name,
  last_name: user.last_name,
  phone_e164: user.phone_e164 ?? null,
});

const deviceOf = (req) => ({ deviceLabel: req.get('x-device-name'), ip: req.ip });

exports.register = async (req, res, next) => {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    const { email, password, firstName, lastName } = req.body;
    const phone = normalizeDrcPhone(req.body.phone);
    if (!phone) return invalidPhone(res);

    const taken = await client.query(
      'SELECT 1 FROM users WHERE phone_e164 = $1 AND phone_verified_at IS NOT NULL',
      [phone]
    );
    if (taken.rowCount) {
      return res.status(409).json({ code: 'PHONE_TAKEN', error: 'Ce numéro est déjà associé à un compte' });
    }

    await client.query('BEGIN');
    transactionStarted = true;

    const hash = await bcrypt.hash(password, 10);

    const result = await client.query(
      `INSERT INTO users
        (email, pending_email, password_hash, role, first_name, last_name, phone, phone_e164, is_verified)
       VALUES (NULL, $1, $2, 'patient', $3, $4, $5, $6, FALSE)
       RETURNING id`,
      [email ? email.toLowerCase() : null, hash, firstName, lastName, formatDrcPhone(phone), phone]
    );

    const verification = await phoneOtp.sendCode(client, {
      userId: result.rows[0].id,
      phone,
      purpose: 'signup',
    });

    await client.query('COMMIT');
    transactionStarted = false;

    res.status(201).json({
      message: 'Compte créé. Saisissez le code reçu par SMS.',
      phone,
      verification: 'sms',
      expiresIn: verification.expiresIn,
    });
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK').catch(() => {});
    }

    if (error.code === '23505') {
      return res.status(409).json({ code: 'PHONE_TAKEN', error: 'Ce numéro est déjà associé à un compte' });
    }

    next(error);
  } finally {
    client.release();
  }
};

exports.login = async (req, res, next) => {
  try {
    const identifier = String(req.body.identifier ?? req.body.email).trim();
    const byEmail = identifier.includes('@');
    const phone = byEmail ? null : normalizeDrcPhone(identifier);

    if (!byEmail && !phone) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    const result = byEmail
      ? await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [identifier.toLowerCase()])
      : await pool.query(
        `SELECT * FROM users WHERE phone_e164 = $1
          ORDER BY (phone_verified_at IS NULL), created_at DESC LIMIT 5`,
        [phone]
      );

    let user = null;
    for (const candidate of result.rows) {
      if (await bcrypt.compare(req.body.password, candidate.password_hash)) {
        user = candidate;
        break;
      }
    }

    if (!user) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    if (!byEmail && !user.phone_verified_at) {
      return res.status(403).json({
        code: 'PHONE_NOT_VERIFIED',
        phone,
        error: 'Veuillez vérifier votre numéro de téléphone avant de vous connecter.',
      });
    }

    if (user.role === 'patient' && user.is_verified === false) {
      return res.status(403).json({
        code: 'EMAIL_NOT_VERIFIED',
        error: 'Veuillez verifier votre adresse e-mail avant de vous connecter.',
      });
    }

    res.json({
      user: publicUser(user),
      ...(await sessions.createSession(user, deviceOf(req))),
    });
  } catch (error) {
    next(error);
  }
};

exports.verifyEmail = async (req, res, next) => {
  try {
    const result = await otp.verifyCode(
      req.body.email.trim().toLowerCase(),
      req.body.code
    );

    if (!result.ok) {
      return res.status(400).json({ error: result.reason });
    }

    res.json({
      message: 'Adresse e-mail verifiee avec succes.',
      user: result.user,
      ...(await sessions.createSession(result.user, deviceOf(req))),
    });
  } catch (error) {
    next(error);
  }
};

exports.resendOtp = async (req, res, next) => {
  try {
    const result = await otp.resendCode(
      req.body.email.trim().toLowerCase()
    );

    if (!result.ok) {
      return res.status(result.waitSeconds ? 429 : 400).json({
        error: result.reason,
        waitSeconds: result.waitSeconds,
      });
    }

    res.json({
      message: 'Nouveau code envoye par e-mail.',
      expiresIn: result.expiresIn,
    });
  } catch (error) {
    next(error);
  }
};

exports.refresh = async (req, res, next) => {
  try {
    res.json(await sessions.refresh(req.body.refreshToken));
  } catch (error) {
    next(error);
  }
};

exports.logout = async (req, res, next) => {
  try {
    await sessions.revokeByRefreshToken(req.body.refreshToken);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
};

exports.logoutAll = async (req, res, next) => {
  try {
    const count = await sessions.revokeAll(req.user.id, 'logout_all');
    res.json({ revoked: count });
  } catch (error) {
    next(error);
  }
};

exports.listSessions = async (req, res, next) => {
  try {
    res.json(await sessions.list(req.user.id, req.user.sid ?? null));
  } catch (error) {
    next(error);
  }
};

exports.revokeSession = async (req, res, next) => {
  try {
    await sessions.revokeOne(req.user.id, req.params.sessionId);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
};

exports.upgradeSession = async (req, res, next) => {
  try {
    res.json(await sessions.upgradeLegacy(req.body.token, deviceOf(req)));
  } catch (error) {
    next(error);
  }
};

exports.verifyPhone = async (req, res, next) => {
  try {
    const phone = normalizeDrcPhone(req.body.phone);
    if (!phone) return invalidPhone(res);
    const user = await phoneOtp.verifySignup(phone, req.body.code);
    res.json({
      message: 'Numéro vérifié avec succès.',
      user: publicUser(user),
      ...(await sessions.createSession(user, deviceOf(req))),
    });
  } catch (error) {
    next(error);
  }
};

exports.resendPhoneOtp = async (req, res, next) => {
  try {
    const phone = normalizeDrcPhone(req.body.phone);
    if (!phone) return invalidPhone(res);
    const result = await phoneOtp.resendSignup(phone);
    res.json({ message: 'Nouveau code envoyé par SMS.', expiresIn: result.expiresIn });
  } catch (error) {
    next(error);
  }
};
