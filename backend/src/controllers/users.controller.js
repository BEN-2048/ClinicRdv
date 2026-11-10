const pool = require('../config/db');

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
