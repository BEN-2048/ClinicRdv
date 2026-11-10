const pool = require('../config/db');
const { assertAccess } = require('../services/access.service');

const RECORD_SQL = `SELECT
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
  LEFT JOIN consultation_notes cn
    ON cn.appointment_id = a.id
   AND cn.status = 'completed'
  WHERE a.patient_profile_id = $1
    AND (a.status = 'done' OR cn.id IS NOT NULL)
  ORDER BY a.starts_at DESC`;

const loadRecord = async (req, patientId) => {
  await assertAccess(req.user, patientId, 'view_record', { ip: req.ip, audit: true });

  const [patient, consultations] = await Promise.all([
    pool.query(
      `SELECT id, patient_number, first_name, last_name, birth_date, sex
         FROM patients WHERE id = $1`,
      [patientId]
    ),
    pool.query(RECORD_SQL, [patientId]),
  ]);

  return { patient: patient.rows[0], consultations: consultations.rows };
};

exports.mine = async (req, res, next) => {
  try {
    const self = await pool.query(
      'SELECT id FROM patients WHERE user_id = $1',
      [req.user.id]
    );
    if (!self.rowCount) return res.json([]);

    const record = await loadRecord(req, self.rows[0].id);
    res.json(record.consultations);
  } catch (error) {
    next(error);
  }
};

exports.forPatient = async (req, res, next) => {
  try {
    const patientId = Number.parseInt(req.params.patientId, 10);
    if (!Number.isInteger(patientId) || patientId <= 0) {
      return res.status(400).json({ error: 'Identifiant patient invalide' });
    }
    res.json(await loadRecord(req, patientId));
  } catch (error) {
    next(error);
  }
};
