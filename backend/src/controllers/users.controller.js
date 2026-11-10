const pool = require('../config/db');
const account = require('../services/account.service');

const PROFILE_SELECT = `
  SELECT u.id, u.email, u.role, u.first_name, u.last_name, u.phone, u.created_at,
         u.phone_e164, u.phone_verified_at, u.pending_email,
         p.id AS patient_id, p.patient_number
    FROM users u
    LEFT JOIN patients p ON p.user_id = u.id
   WHERE u.id = $1`;

exports.getMe = async (req, res, next) => {
  try {
    const result = await pool.query(PROFILE_SELECT, [req.user.id]);

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

exports.updateMe = async (req, res, next) => {
  try {
    const { firstName, lastName, phone } = req.body;

    if (Object.prototype.hasOwnProperty.call(req.body, 'phone')) {
      const current = (await pool.query('SELECT phone, phone_verified_at FROM users WHERE id = $1', [req.user.id])).rows[0];
      if (current?.phone_verified_at && (phone ?? null) !== current.phone) {
        return res.status(400).json({
          code: 'PHONE_CHANGE_REQUIRED',
          error: 'Pour changer de numéro, utilisez « Changer de numéro » : le nouveau numéro doit être confirmé par SMS.',
        });
      }
    }

    const updated = await pool.query(
      `UPDATE users
       SET first_name = COALESCE($1, first_name),
           last_name = COALESCE($2, last_name),
           phone = CASE WHEN $3::boolean THEN $4 ELSE phone END
       WHERE id = $5
       RETURNING id`,
      [
        firstName ?? null,
        lastName ?? null,
        Object.prototype.hasOwnProperty.call(req.body, 'phone'),
        phone ?? null,
        req.user.id,
      ]
    );

    if (!updated.rows[0]) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }

    const result = await pool.query(PROFILE_SELECT, [req.user.id]);

    res.json({ message: 'Profil mis à jour', user: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

const respond = (action, status = 200) => async (req, res, next) => {
  try {
    res.status(status).json(await action(req));
  } catch (error) {
    next(error);
  }
};

const withProfile = async (req, result, message) => ({
  message,
  ...result,
  user: (await pool.query(PROFILE_SELECT, [req.user.id])).rows[0],
});

exports.changePassword = respond((req) => account.changePassword(req.user, req.body));

exports.requestPhoneChange = respond(async (req) => ({
  message: 'Un code de confirmation a été envoyé par SMS au nouveau numéro.',
  ...(await account.requestPhoneChange(req.user, req.body)),
}));

exports.resendPhoneChange = respond(async (req) => ({
  message: 'Nouveau code envoyé par SMS.',
  ...(await account.resendPhoneChange(req.user)),
}));

exports.confirmPhoneChange = respond(async (req) =>
  withProfile(req, await account.confirmPhoneChange(req.user, req.body.code), 'Numéro de téléphone modifié. Vos autres appareils ont été déconnectés.'));

exports.requestEmailChange = respond(async (req) => ({
  message: 'Un code de confirmation a été envoyé à cette adresse e-mail.',
  ...(await account.requestEmailChange(req.user, req.body)),
}));

exports.resendEmailChange = respond(async (req) => ({
  message: 'Nouveau code envoyé par e-mail.',
  ...(await account.resendEmailChange(req.user)),
}));

exports.confirmEmailChange = respond(async (req) =>
  withProfile(req, await account.confirmEmailChange(req.user, req.body.code), 'Adresse e-mail confirmée.'));
