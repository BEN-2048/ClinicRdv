const pool = require('../config/db');
const { getAvailableSlots } = require('../services/slots.service');

exports.list = async (req, res, next) => {
  try {
    const { q, specialtyId } = req.query;
    const r = await pool.query(
      `SELECT d.id, u.first_name, u.last_name, s.name AS specialty, d.fee, d.consultation_minutes, d.languages
         FROM doctors d JOIN users u ON u.id=d.user_id JOIN specialties s ON s.id=d.specialty_id
        WHERE d.active
          AND ($1::text IS NULL OR u.last_name ILIKE '%'||$1||'%' OR s.name ILIKE '%'||$1||'%')
          AND ($2::int IS NULL OR d.specialty_id=$2)
        ORDER BY u.last_name`, [q || null, specialtyId ? +specialtyId : null]);
    res.json(r.rows);
  } catch (e) { next(e); }
};

exports.get = async (req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT d.*, u.first_name, u.last_name, s.name AS specialty
         FROM doctors d JOIN users u ON u.id=d.user_id JOIN specialties s ON s.id=d.specialty_id
        WHERE d.id=$1`, [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Médecin introuvable' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
};

exports.slots = async (req, res, next) => {
  try {
    const slots = await getAvailableSlots(+req.params.id, req.query.date);
    if (!slots) return res.status(404).json({ error: 'Médecin introuvable' });
    res.json(slots);
  } catch (e) { next(e); }
};
