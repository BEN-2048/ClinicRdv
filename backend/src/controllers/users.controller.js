const pool = require('../config/db');

exports.getMe = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, email, role, first_name, last_name, phone, created_at
       FROM users
       WHERE id = $1`,
      [req.user.id]
    );

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

    const result = await pool.query(
      `UPDATE users
       SET first_name = COALESCE($1, first_name),
           last_name = COALESCE($2, last_name),
           phone = CASE WHEN $3::boolean THEN $4 ELSE phone END
       WHERE id = $5
       RETURNING id, email, role, first_name, last_name, phone, created_at`,
      [
        firstName ?? null,
        lastName ?? null,
        Object.prototype.hasOwnProperty.call(req.body, 'phone'),
        phone ?? null,
        req.user.id,
      ]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }

    res.json({ message: 'Profil mis à jour', user: result.rows[0] });
  } catch (error) {
    next(error);
  }
};
