const pool = require('../config/db');

const httpError = (status, message) => Object.assign(new Error(message), { status });

const COLUMNS = `w.id, w.doctor_id, w.time_slots, w.weekdays, w.min_notice,
  w.notify_push, w.notify_sms, w.active, w.created_at, w.updated_at`;

const toAlert = (row) => row && {
  id: row.id,
  doctorId: row.doctor_id,
  timeSlots: row.time_slots,
  weekdays: row.weekdays.map(Number),
  minNotice: row.min_notice,
  notifyPush: row.notify_push,
  notifySms: row.notify_sms,
  active: row.active,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
};

async function queue(doctorId, patientId) {
  const r = await pool.query(
    `SELECT count(*)::int AS total,
            (SELECT count(*)::int FROM waiting_list o
              WHERE o.doctor_id = $1 AND o.active AND o.desired_date IS NULL
                AND o.created_at <= (SELECT created_at FROM waiting_list
                                      WHERE doctor_id = $1 AND patient_id = $2
                                        AND active AND desired_date IS NULL)) AS rank
       FROM waiting_list
      WHERE doctor_id = $1 AND active AND desired_date IS NULL`,
    [doctorId, patientId]);
  const { total, rank } = r.rows[0];
  return rank > 0 ? { position: rank, total } : { position: total + 1, total: total + 1 };
}

async function assertDoctor(doctorId) {
  const r = await pool.query('SELECT id FROM doctors WHERE id = $1 AND active', [doctorId]);
  if (!r.rowCount) throw httpError(404, 'Médecin introuvable');
}

exports.getForDoctor = async (patientId, doctorId) => {
  await assertDoctor(doctorId);
  const r = await pool.query(
    `SELECT ${COLUMNS} FROM waiting_list w
      WHERE w.patient_id = $1 AND w.doctor_id = $2 AND w.desired_date IS NULL`,
    [patientId, doctorId]);
  const alert = toAlert(r.rows[0]);
  return { alert: alert && alert.active ? alert : null, preferences: alert, ...(await queue(doctorId, patientId)) };
};

exports.upsert = async (patientId, doctorId, prefs) => {
  await assertDoctor(doctorId);
  await pool.query(
    `INSERT INTO waiting_list (patient_id, doctor_id, time_slots, weekdays, min_notice, notify_push, notify_sms)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (patient_id, doctor_id) WHERE desired_date IS NULL DO UPDATE SET
       time_slots = EXCLUDED.time_slots,
       weekdays = EXCLUDED.weekdays,
       min_notice = EXCLUDED.min_notice,
       notify_push = EXCLUDED.notify_push,
       notify_sms = EXCLUDED.notify_sms,
       created_at = CASE WHEN waiting_list.active THEN waiting_list.created_at ELSE now() END,
       active = true,
       notified = false,
       updated_at = now()`,
    [patientId, doctorId, prefs.timeSlots, prefs.weekdays, prefs.minNotice, prefs.notifyPush, prefs.notifySms]);
  return exports.getForDoctor(patientId, doctorId);
};

exports.deactivate = async (patientId, doctorId) => {
  const r = await pool.query(
    `UPDATE waiting_list SET active = false, updated_at = now()
      WHERE patient_id = $1 AND doctor_id = $2 AND desired_date IS NULL AND active`,
    [patientId, doctorId]);
  if (!r.rowCount) throw httpError(404, 'Aucune alerte active pour ce médecin');
  return { ok: true };
};

exports.listMine = async (patientId) => {
  const r = await pool.query(
    `SELECT ${COLUMNS}, u.first_name || ' ' || u.last_name AS doctor_name, s.name AS specialty
       FROM waiting_list w
       JOIN doctors d ON d.id = w.doctor_id
       JOIN users u ON u.id = d.user_id
       JOIN specialties s ON s.id = d.specialty_id
      WHERE w.patient_id = $1 AND w.active AND w.desired_date IS NULL
      ORDER BY w.created_at`,
    [patientId]);
  return Promise.all(r.rows.map(async (row) => ({
    ...toAlert(row),
    doctorName: row.doctor_name,
    specialty: row.specialty,
    ...(await queue(row.doctor_id, patientId)),
  })));
};
