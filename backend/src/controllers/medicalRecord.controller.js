const pool = require('../config/db');

exports.mine = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT
          a.id AS appointment_id,
          a.starts_at,
          a.status,
          a.reason,
          u.first_name AS doctor_first_name,
          u.last_name AS doctor_last_name,
          s.name AS specialty,
          cn.id AS note_id,
          cn.notes,
          cn.prescription,
          cn.created_at AS note_created_at
        FROM appointments a
        JOIN doctors d ON d.id = a.doctor_id
        JOIN users u ON u.id = d.user_id
        JOIN specialties s ON s.id = d.specialty_id
        LEFT JOIN consultation_notes cn ON cn.appointment_id = a.id
        WHERE a.patient_id = $1
          AND (a.status = 'done' OR cn.id IS NOT NULL)
        ORDER BY a.starts_at DESC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
};
