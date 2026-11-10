const bcrypt = require('bcrypt');
const pool = require('../config/db');
const { httpError } = require('./appointments.service');

const TZ = 'Africa/Lubumbashi';
const todayClinic = `(now() AT TIME ZONE '${TZ}')::date`;
const localDate = (col) => `(${col} AT TIME ZONE '${TZ}')::date`;

exports.dashboard = async () => {
  const [today, doctors, onLeave, next] = await Promise.all([
    pool.query(
      `SELECT status, count(*)::int AS count FROM appointments
        WHERE ${localDate('starts_at')} = ${todayClinic} GROUP BY status`),
    pool.query('SELECT count(*)::int AS count FROM doctors WHERE active'),
    pool.query(
      `SELECT count(DISTINCT doctor_id)::int AS count FROM leaves
        WHERE ${todayClinic} BETWEEN start_date AND end_date`),
    pool.query(
      `SELECT a.id, a.starts_at, a.status,
              du.first_name || ' ' || du.last_name AS doctor_name,
              pp.first_name || ' ' || pp.last_name AS patient_name
         FROM appointments a
         JOIN doctors d ON d.id=a.doctor_id JOIN users du ON du.id=d.user_id
         JOIN patients pp ON pp.id=a.patient_profile_id
        WHERE a.starts_at >= now() AND a.status IN ('pending','confirmed')
        ORDER BY a.starts_at LIMIT 10`),
  ]);
  const byStatus = Object.fromEntries(today.rows.map((r) => [r.status, r.count]));
  return {
    today: {
      total: today.rows.reduce((n, r) => n + r.count, 0),
      confirmed: byStatus.confirmed || 0,
      pending: byStatus.pending || 0,
      cancelled: byStatus.cancelled || 0,
      done: byStatus.done || 0,
    },
    activeDoctors: doctors.rows[0].count,
    doctorsOnLeaveToday: onLeave.rows[0].count,
    upcoming: next.rows,
  };
};

exports.stats = async ({ from, to }) => {
  const params = [from || null, to || null];
  const range = `${localDate('a.starts_at')} BETWEEN COALESCE($1::date, ${todayClinic} - 30)
                                              AND COALESCE($2::date, ${todayClinic})`;
  const [byStatus, byDoctor, newPatients] = await Promise.all([
    pool.query(
      `SELECT a.status, count(*)::int AS count FROM appointments a WHERE ${range} GROUP BY a.status`,
      params),
    pool.query(
      `SELECT d.id AS doctor_id, u.first_name || ' ' || u.last_name AS doctor_name,
              count(a.id)::int AS total,
              count(a.id) FILTER (WHERE a.status='cancelled')::int AS cancelled
         FROM doctors d JOIN users u ON u.id=d.user_id
         LEFT JOIN appointments a ON a.doctor_id=d.id AND ${range}
        GROUP BY d.id, u.first_name, u.last_name ORDER BY total DESC`,
      params),
    pool.query(
      `SELECT count(*)::int AS count FROM users
        WHERE role='patient'
          AND ${localDate('created_at')} BETWEEN COALESCE($1::date, ${todayClinic} - 30)
                                             AND COALESCE($2::date, ${todayClinic})`,
      params),
  ]);
  const statusMap = Object.fromEntries(byStatus.rows.map((r) => [r.status, r.count]));
  const total = byStatus.rows.reduce((n, r) => n + r.count, 0);
  return {
    total,
    byStatus: statusMap,
    cancellationRate: total ? Math.round(((statusMap.cancelled || 0) / total) * 1000) / 10 : 0,
    newPatients: newPatients.rows[0].count,
    byDoctor: byDoctor.rows,
  };
};

exports.searchPatients = async ({ q }) => {
  const r = await pool.query(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.phone,
            p.id AS patient_id, p.patient_number
       FROM users u
       LEFT JOIN patients p ON p.user_id = u.id
      WHERE u.role='patient'
        AND ($1::text IS NULL OR u.last_name ILIKE '%'||$1||'%' OR u.first_name ILIKE '%'||$1||'%'
             OR u.email ILIKE '%'||$1||'%' OR u.phone ILIKE '%'||$1||'%'
             OR p.patient_number = upper($1))
      ORDER BY u.last_name, u.first_name LIMIT 50`, [q?.trim() || null]);
  return r.rows;
};

exports.listSpecialties = async () =>
  (await pool.query('SELECT id, name FROM specialties ORDER BY name')).rows;

exports.listDoctors = async () => {
  const r = await pool.query(
    `SELECT d.id, d.user_id, u.email, u.first_name, u.last_name, u.phone,
            d.specialty_id, s.name AS specialty, d.bio, d.fee, d.consultation_minutes,
            d.languages, d.active
       FROM doctors d JOIN users u ON u.id=d.user_id JOIN specialties s ON s.id=d.specialty_id
      ORDER BY d.active DESC, u.last_name`);
  return r.rows;
};

exports.createDoctor = async (data) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const hash = await bcrypt.hash(data.password, 10);
    const u = await client.query(
      `INSERT INTO users(email,password_hash,role,first_name,last_name,phone)
       VALUES($1,$2,'doctor',$3,$4,$5) RETURNING id`,
      [data.email.toLowerCase(), hash, data.firstName, data.lastName, data.phone || null]);
    const d = await client.query(
      `INSERT INTO doctors(user_id,specialty_id,bio,fee,consultation_minutes,languages)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
      [u.rows[0].id, data.specialtyId, data.bio || null, data.fee ?? 0,
        data.consultationMinutes ?? 30, data.languages || 'fr']);
    await client.query('COMMIT');
    return exports.getDoctor(d.rows[0].id);
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') throw httpError(409, 'E-mail déjà utilisé');
    if (e.code === '23503') throw httpError(400, 'Spécialité inconnue');
    throw e;
  } finally {
    client.release();
  }
};

exports.getDoctor = async (id) => {
  const r = await pool.query(
    `SELECT d.id, d.user_id, u.email, u.first_name, u.last_name, u.phone,
            d.specialty_id, s.name AS specialty, d.bio, d.fee, d.consultation_minutes,
            d.languages, d.active
       FROM doctors d JOIN users u ON u.id=d.user_id JOIN specialties s ON s.id=d.specialty_id
      WHERE d.id=$1`, [id]);
  if (!r.rowCount) throw httpError(404, 'Médecin introuvable');
  return r.rows[0];
};

const DOCTOR_FIELDS = {
  specialtyId: ['doctors', 'specialty_id'],
  bio: ['doctors', 'bio'],
  fee: ['doctors', 'fee'],
  consultationMinutes: ['doctors', 'consultation_minutes'],
  languages: ['doctors', 'languages'],
  active: ['doctors', 'active'],
  firstName: ['users', 'first_name'],
  lastName: ['users', 'last_name'],
  phone: ['users', 'phone'],
};

exports.updateDoctor = async (id, data) => {
  const sets = { doctors: [], users: [] };
  const values = { doctors: [], users: [] };
  for (const [key, [table, col]] of Object.entries(DOCTOR_FIELDS)) {
    if (data[key] === undefined) continue;
    values[table].push(data[key]);
    sets[table].push(`${col}=$${values[table].length + 1}`);
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query('SELECT user_id FROM doctors WHERE id=$1 FOR UPDATE', [id]);
    if (!cur.rowCount) throw httpError(404, 'Médecin introuvable');
    if (sets.doctors.length)
      await client.query(`UPDATE doctors SET ${sets.doctors.join(',')} WHERE id=$1`, [id, ...values.doctors]);
    if (sets.users.length)
      await client.query(`UPDATE users SET ${sets.users.join(',')} WHERE id=$1`,
        [cur.rows[0].user_id, ...values.users]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23503') throw httpError(400, 'Spécialité inconnue');
    throw e;
  } finally {
    client.release();
  }
  return exports.getDoctor(id);
};

const ensureDoctor = async (id) => {
  const r = await pool.query('SELECT consultation_minutes FROM doctors WHERE id=$1', [id]);
  if (!r.rowCount) throw httpError(404, 'Médecin introuvable');
  return r.rows[0];
};

exports.getWorkingHours = async (doctorId) => {
  const doc = await ensureDoctor(doctorId);
  const r = await pool.query(
    `SELECT weekday, to_char(start_time,'HH24:MI') AS "startTime", to_char(end_time,'HH24:MI') AS "endTime"
       FROM working_hours WHERE doctor_id=$1 ORDER BY weekday, start_time`, [doctorId]);
  return { consultationMinutes: doc.consultation_minutes, hours: r.rows };
};

exports.setWorkingHours = async (doctorId, { hours, consultationMinutes }) => {
  for (const h of hours)
    if (h.endTime <= h.startTime) throw httpError(400, 'L’heure de fin doit suivre l’heure de début');
  await ensureDoctor(doctorId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE doctors SET consultation_minutes=$2 WHERE id=$1', [doctorId, consultationMinutes]);
    await client.query('DELETE FROM working_hours WHERE doctor_id=$1', [doctorId]);
    for (const h of hours)
      await client.query(
        'INSERT INTO working_hours(doctor_id,weekday,start_time,end_time) VALUES($1,$2,$3,$4)',
        [doctorId, h.weekday, h.startTime, h.endTime]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return exports.getWorkingHours(doctorId);
};

exports.listLeaves = async (doctorId) => {
  await ensureDoctor(doctorId);
  return (await pool.query(
    `SELECT id, to_char(start_date,'YYYY-MM-DD') AS "startDate", to_char(end_date,'YYYY-MM-DD') AS "endDate", reason
       FROM leaves WHERE doctor_id=$1 ORDER BY start_date DESC`, [doctorId])).rows;
};

exports.addLeave = async (doctorId, { startDate, endDate, reason }) => {
  await ensureDoctor(doctorId);
  if (endDate < startDate) throw httpError(400, 'La date de fin doit suivre la date de début');
  const r = await pool.query(
    'INSERT INTO leaves(doctor_id,start_date,end_date,reason) VALUES($1,$2,$3,$4) RETURNING id',
    [doctorId, startDate, endDate, reason || null]);
  return { id: r.rows[0].id, startDate, endDate, reason: reason || null };
};

exports.deleteLeave = async (doctorId, leaveId) => {
  const r = await pool.query('DELETE FROM leaves WHERE id=$1 AND doctor_id=$2', [leaveId, doctorId]);
  if (!r.rowCount) throw httpError(404, 'Congé introuvable');
};

exports.listBlocks = async (doctorId) => {
  await ensureDoctor(doctorId);
  return (await pool.query(
    `SELECT id, starts_at AS "startsAt", ends_at AS "endsAt", reason
       FROM blocked_slots WHERE doctor_id=$1 AND ends_at >= now() ORDER BY starts_at`, [doctorId])).rows;
};

exports.addBlock = async (doctorId, { startsAt, endsAt, reason }) => {
  await ensureDoctor(doctorId);
  if (new Date(endsAt) <= new Date(startsAt)) throw httpError(400, 'La fin doit suivre le début');
  const r = await pool.query(
    `INSERT INTO blocked_slots(doctor_id,starts_at,ends_at,reason) VALUES($1,$2,$3,$4)
     RETURNING id, starts_at AS "startsAt", ends_at AS "endsAt", reason`,
    [doctorId, startsAt, endsAt, reason || null]);
  return r.rows[0];
};

exports.deleteBlock = async (doctorId, blockId) => {
  const r = await pool.query('DELETE FROM blocked_slots WHERE id=$1 AND doctor_id=$2', [blockId, doctorId]);
  if (!r.rowCount) throw httpError(404, 'Créneau bloqué introuvable');
};
