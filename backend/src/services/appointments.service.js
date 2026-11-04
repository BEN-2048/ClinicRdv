const pool = require('../config/db');
const { getAvailableSlots } = require('./slots.service');
const { isStaff } = require('../middleware/auth');

const httpError = (status, message) => Object.assign(new Error(message), { status });

const clinicDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Lubumbashi',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const getClinicDate = (date) => {
  const parts = clinicDateFormatter.formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

exports.book = async (patientId, { doctorId, startsAt, reason }) => {
  const iso = new Date(startsAt).toISOString();
  const slots = await getAvailableSlots(doctorId, getClinicDate(new Date(iso)));
  if (!slots) throw httpError(404, 'Médecin introuvable');
  const slot = slots.find((s) => s.startsAt === iso);
  if (!slot || !slot.available) throw httpError(409, 'Créneau indisponible');

  try {
    const r = await pool.query(
      `INSERT INTO appointments(patient_id,doctor_id,starts_at,ends_at,status,reason)
       VALUES($1,$2,$3,$4,'confirmed',$5) RETURNING *`,
      [patientId, doctorId, slot.startsAt, slot.endsAt, reason || null]);
    return r.rows[0];
  } catch (e) {
    // 23P01 = violation de la contrainte d'exclusion (réservation simultanée)
    if (e.code === '23P01') throw httpError(409, "Ce créneau vient d'être réservé");
    throw e;
  }
};

exports.cancel = async (id, user) => {
  const r = await pool.query(
    `UPDATE appointments SET status='cancelled'
      WHERE id=$1 AND status IN ('pending','confirmed')
        AND ($2::boolean OR patient_id=$3
             OR doctor_id=(SELECT id FROM doctors WHERE user_id=$3))
      RETURNING *`, [id, isStaff(user.role), user.id]);
  if (!r.rowCount) throw httpError(404, 'Rendez-vous introuvable');
  // TODO : notifier les patients de la liste d'attente (waiting_list)
  return r.rows[0];
};

exports.reschedule = async (id, user, startsAt) => {
  const cur = await pool.query(
    `SELECT * FROM appointments
      WHERE id=$1 AND ($3::boolean OR patient_id=$2) AND status IN ('pending','confirmed')`,
    [id, user.id, isStaff(user.role)]);
  if (!cur.rowCount) throw httpError(404, 'Rendez-vous introuvable');
  const a = cur.rows[0];
  await exports.cancel(id, user);
  try {
    return await exports.book(a.patient_id, { doctorId: a.doctor_id, startsAt, reason: a.reason });
  } catch (e) {
    await pool.query("UPDATE appointments SET status='confirmed' WHERE id=$1", [id]); // restaure l'ancien RDV
    throw e;
  }
};

exports.listForUser = async (user, { scope }) => {
  const base = user.role === 'doctor'
    ? 'a.doctor_id=(SELECT id FROM doctors WHERE user_id=$1)'
    : 'a.patient_id=$1';
  const time = scope === 'past' ? 'a.starts_at < now()' : scope === 'upcoming' ? 'a.starts_at >= now()' : 'true';
  const r = await pool.query(
    `SELECT a.*, u.first_name || ' ' || u.last_name AS doctor_name, s.name AS specialty
       FROM appointments a
       JOIN doctors d ON d.id=a.doctor_id JOIN users u ON u.id=d.user_id
       JOIN specialties s ON s.id=d.specialty_id
      WHERE ${base} AND ${time} ORDER BY a.starts_at`, [user.id]);
  return r.rows;
};

exports.listAll = async ({ date, doctorId, status, patientId } = {}) => {
  const r = await pool.query(
    `SELECT a.*,
            du.first_name || ' ' || du.last_name AS doctor_name, s.name AS specialty,
            pu.first_name || ' ' || pu.last_name AS patient_name, pu.phone AS patient_phone
       FROM appointments a
       JOIN doctors d ON d.id=a.doctor_id JOIN users du ON du.id=d.user_id
       JOIN specialties s ON s.id=d.specialty_id
       JOIN users pu ON pu.id=a.patient_id
      WHERE ($1::date IS NULL OR (a.starts_at AT TIME ZONE 'Africa/Lubumbashi')::date = $1::date)
        AND ($2::int IS NULL OR a.doctor_id=$2)
        AND ($3::appt_status IS NULL OR a.status=$3)
        AND ($4::int IS NULL OR a.patient_id=$4)
      ORDER BY a.starts_at`,
    [date || null, doctorId || null, status || null, patientId || null]);
  return r.rows;
};

exports.bookFor = async ({ patientId, ...data }) => {
  const p = await pool.query("SELECT 1 FROM users WHERE id=$1 AND role='patient'", [patientId]);
  if (!p.rowCount) throw httpError(404, 'Patient introuvable');
  return exports.book(patientId, data);
};

exports.httpError = httpError;
