const bcrypt = require('bcrypt');
const pool = require('../config/db');
const otp = require('./otp.controller');
const sessions = require('../services/session.service');

const deviceOf = (req) => ({ deviceLabel: req.get('x-device-name'), ip: req.ip });

exports.register = async (req, res, next) => {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    const { email, password, firstName, lastName, phone } = req.body;
    const normalizedEmail = email.trim().toLowerCase();

    await client.query('BEGIN');
    transactionStarted = true;

    const hash = await bcrypt.hash(password, 10);

    const result = await client.query(
      `INSERT INTO users
        (email, password_hash, role, first_name, last_name, phone, is_verified)
       VALUES ($1, $2, 'patient', $3, $4, $5, FALSE)
       RETURNING id, email, role, first_name, last_name`,
      [normalizedEmail, hash, firstName, lastName, phone || null]
    );

    const user = result.rows[0];

    const verification = await otp.createVerification(
      client,
      user.id,
      user.email
    );

    await client.query('COMMIT');
    transactionStarted = false;

    res.status(201).json({
      message: 'Compte cree. Verifiez votre adresse e-mail.',
      email: user.email,
      expiresIn: verification.expiresIn,
    });
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK').catch(() => {});
    }

    if (error.code === '23505') {
      return res.status(409).json({ error: 'E-mail deja utilise' });
    }

    next(error);
  } finally {
    client.release();
  }
};

exports.login = async (req, res, next) => {
  try {
    const email = req.body.email.trim().toLowerCase();

    const result = await pool.query(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );

    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(req.body.password, user.password_hash))) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    if (user.role === 'patient' && user.is_verified === false) {
      return res.status(403).json({
        code: 'EMAIL_NOT_VERIFIED',
        error: 'Veuillez verifier votre adresse e-mail avant de vous connecter.',
      });
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        first_name: user.first_name,
        last_name: user.last_name,
      },
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
