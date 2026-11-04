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

exports.dashboard = async (req, res, next) => {
  try {
    // Récupérer le médecin associé au compte connecté
    const doctorResult = await pool.query(
      `SELECT
          d.id,
          d.user_id,
          u.first_name,
          u.last_name,
          u.email,
          s.name AS specialty,
          d.fee,
          d.active
       FROM doctors d
       JOIN users u ON u.id = d.user_id
       JOIN specialties s ON s.id = d.specialty_id
       WHERE d.user_id = $1`,
      [req.user.id]
    );

    if (!doctorResult.rowCount) {
      return res.status(404).json({
        error: 'Profil médecin introuvable',
      });
    }

    const doctor = doctorResult.rows[0];

    // Récupérer les rendez-vous et les informations des patients
    const appointmentsResult = await pool.query(
      `SELECT
          a.id,
          a.starts_at,
          a.ends_at,
          a.status,
          a.reason,
          a.patient_id,
          p.first_name AS patient_first_name,
          p.last_name AS patient_last_name
       FROM appointments a
       JOIN users p ON p.id = a.patient_id
       WHERE a.doctor_id = $1
       ORDER BY a.starts_at ASC`,
      [doctor.id]
    );

    // Renvoyer les données du tableau de bord
    res.json({
      doctor,
      appointments: appointmentsResult.rows,
    });

  } catch (e) {
    next(e);
  }
};

