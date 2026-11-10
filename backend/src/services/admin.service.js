const bcrypt = require('bcrypt');
const pool = require('../config/db');
const { httpError } = require('./appointments.service');
const { resolveFacility } = require('./slots.service');
const scopes = require('./scope.service');

const localDate = (col) => `(${col} AT TIME ZONE f.timezone)::date`;
const todayLocal = '(now() AT TIME ZONE f.timezone)::date';
const inScopeSql = (col, param) => `(${param}::int[] IS NULL OR ${col} = ANY(${param}::int[]))`;

const requireScope = (scope) => {
  if (!scope) throw new Error('Périmètre du personnel requis');
};

exports.dashboard = async (scope) => {
  requireScope(scope);
  const facilities = scopes.scopeParam(scope);
  const [today, doctors, onLeave, next] = await Promise.all([
    pool.query(
      `SELECT a.status, count(*)::int AS count
         FROM appointments a JOIN facilities f ON f.id = a.facility_id
        WHERE ${localDate('a.starts_at')} = ${todayLocal}
          AND ${inScopeSql('a.facility_id', '$1')}
        GROUP BY a.status`, [facilities]),
    pool.query(
      `SELECT count(DISTINCT d.id)::int AS count
         FROM doctors d JOIN doctor_affiliations da ON da.doctor_id = d.id AND da.status = 'active'
        WHERE d.active AND ${inScopeSql('da.facility_id', '$1')}`, [facilities]),
    pool.query(
      `SELECT count(DISTINCT l.doctor_id)::int AS count
         FROM leaves l
         JOIN doctor_affiliations da ON da.doctor_id = l.doctor_id AND da.status = 'active'
         JOIN facilities f ON f.id = da.facility_id
        WHERE ${todayLocal} BETWEEN l.start_date AND l.end_date
          AND ${inScopeSql('da.facility_id', '$1')}`, [facilities]),
    pool.query(
      `SELECT a.id, a.starts_at, a.status, a.facility_id,
              f.name AS facility_name, f.timezone AS facility_timezone,
              du.first_name || ' ' || du.last_name AS doctor_name,
              pp.first_name || ' ' || pp.last_name AS patient_name
         FROM appointments a
         JOIN facilities f ON f.id = a.facility_id
         JOIN doctors d ON d.id=a.doctor_id JOIN users du ON du.id=d.user_id
         JOIN patients pp ON pp.id=a.patient_profile_id
        WHERE a.starts_at >= now() AND a.status IN ('pending','confirmed')
          AND ${inScopeSql('a.facility_id', '$1')}
        ORDER BY a.starts_at LIMIT 10`, [facilities]),
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

exports.stats = async (scope, { from, to } = {}) => {
  requireScope(scope);
  const params = [from || null, to || null, scopes.scopeParam(scope)];
  const range = `${localDate('a.starts_at')} BETWEEN COALESCE($1::date, ${todayLocal} - 30)
                                              AND COALESCE($2::date, ${todayLocal})`;
  const [byStatus, byDoctor, newPatients] = await Promise.all([
    pool.query(
      `SELECT a.status, count(*)::int AS count
         FROM appointments a JOIN facilities f ON f.id = a.facility_id
        WHERE ${range} AND ${inScopeSql('a.facility_id', '$3')}
        GROUP BY a.status`,
      params),
    pool.query(
      `SELECT d.id AS doctor_id, u.first_name || ' ' || u.last_name AS doctor_name,
              count(a.id)::int AS total,
              count(a.id) FILTER (WHERE a.status='cancelled')::int AS cancelled
         FROM doctors d JOIN users u ON u.id=d.user_id
         LEFT JOIN (appointments a JOIN facilities f ON f.id = a.facility_id)
           ON a.doctor_id=d.id AND ${range} AND ${inScopeSql('a.facility_id', '$3')}
        WHERE EXISTS (SELECT 1 FROM doctor_affiliations da
                       WHERE da.doctor_id = d.id AND ${inScopeSql('da.facility_id', '$3')})
        GROUP BY d.id, u.first_name, u.last_name ORDER BY total DESC`,
      params),
    pool.query(
      `SELECT count(*)::int AS count FROM (
         SELECT a.patient_profile_id, min(a.created_at) AS first_at, min(f.timezone) AS tz
           FROM appointments a JOIN facilities f ON f.id = a.facility_id
          WHERE ${inScopeSql('a.facility_id', '$3')}
          GROUP BY a.patient_profile_id
       ) firsts
       WHERE (first_at AT TIME ZONE tz)::date
             BETWEEN COALESCE($1::date, (now() AT TIME ZONE tz)::date - 30)
                 AND COALESCE($2::date, (now() AT TIME ZONE tz)::date)`,
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

exports.searchPatients = async (scope, { q } = {}) => {
  requireScope(scope);
  const term = q?.trim() || null;
  const r = await pool.query(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.phone,
            p.id AS patient_id, p.patient_number
       FROM users u
       LEFT JOIN patients p ON p.user_id = u.id
      WHERE u.role='patient'
        AND (
          p.patient_number = upper($1)
          OR lower(u.email) = lower($1)
          OR (length(regexp_replace($1, '[^0-9]', '', 'g')) >= 9
              AND regexp_replace(coalesce(u.phone, ''), '[^0-9]', '', 'g') = regexp_replace($1, '[^0-9]', '', 'g'))
          OR (
            ($1::text IS NULL OR u.last_name ILIKE '%'||$1||'%' OR u.first_name ILIKE '%'||$1||'%'
              OR u.email ILIKE '%'||$1||'%' OR u.phone ILIKE '%'||$1||'%')
            AND ($2::int[] IS NULL OR EXISTS (
              SELECT 1 FROM appointments a
               WHERE a.patient_profile_id = p.id AND a.facility_id = ANY($2::int[])))
          )
        )
      ORDER BY u.last_name, u.first_name LIMIT 50`, [term, scopes.scopeParam(scope)]);
  return r.rows;
};

exports.listSpecialties = async () =>
  (await pool.query('SELECT id, name FROM specialties ORDER BY name')).rows;

const DOCTOR_FACILITIES = `COALESCE((
  SELECT json_agg(json_build_object('id', f.id, 'name', f.name, 'status', da.status, 'fee', da.fee) ORDER BY f.name)
    FROM doctor_affiliations da JOIN facilities f ON f.id = da.facility_id
   WHERE da.doctor_id = d.id
), '[]'::json)`;

exports.listDoctors = async (scope) => {
  requireScope(scope);
  const r = await pool.query(
    `SELECT d.id, d.user_id, u.email, u.first_name, u.last_name, u.phone,
            d.specialty_id, s.name AS specialty, d.bio, d.fee, d.consultation_minutes,
            d.languages, d.active, d.professional_phone, ${DOCTOR_FACILITIES} AS facilities
       FROM doctors d JOIN users u ON u.id=d.user_id JOIN specialties s ON s.id=d.specialty_id
      WHERE $1::int[] IS NULL OR EXISTS (
        SELECT 1 FROM doctor_affiliations da WHERE da.doctor_id = d.id AND da.facility_id = ANY($1::int[]))
      ORDER BY d.active DESC, u.last_name`, [scopes.scopeParam(scope)]);
  return r.rows;
};

exports.createDoctor = async (scope, data) => {
  requireScope(scope);
  let facilityId = data.facilityId ?? null;
  if (facilityId) scopes.assertFacilityInScope(scope, facilityId);
  else if (!scope.all) {
    if (scope.facilityIds.length !== 1) throw httpError(400, 'Précisez l’établissement du médecin');
    facilityId = scope.facilityIds[0];
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const facility = await client.query(
      `SELECT id FROM facilities
        WHERE status <> 'suspended' AND (($1::int IS NULL AND is_default) OR id = $1)`,
      [facilityId]);
    if (!facility.rowCount) throw httpError(400, 'Établissement inconnu ou suspendu');
    const hash = await bcrypt.hash(data.password, 10);
    const u = await client.query(
      `INSERT INTO users(email,password_hash,role,first_name,last_name,phone)
       VALUES($1,$2,'doctor',$3,$4,$5) RETURNING id`,
      [data.email.toLowerCase(), hash, data.firstName, data.lastName, data.phone || null]);
    const d = await client.query(
      `INSERT INTO doctors(user_id,specialty_id,bio,fee,consultation_minutes,languages,professional_phone)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [u.rows[0].id, data.specialtyId, data.bio || null, data.fee ?? 0,
        data.consultationMinutes ?? 30, data.languages || 'fr', data.professionalPhone || null]);
    await client.query(
      'INSERT INTO doctor_affiliations(doctor_id, facility_id) VALUES($1, $2)',
      [d.rows[0].id, facility.rows[0].id]);
    await client.query(
      `INSERT INTO facility_specialties(facility_id, specialty_id) VALUES($1, $2)
       ON CONFLICT DO NOTHING`,
      [facility.rows[0].id, data.specialtyId]);
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
            d.languages, d.active, d.professional_phone, ${DOCTOR_FACILITIES} AS facilities
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
  professionalPhone: ['doctors', 'professional_phone'],
};

exports.updateDoctor = async (id, data, scope = null) => {
  if (scope && !scope.all) {
    const outside = (await scopes.doctorFacilityIds(id)).filter((f) => !scope.facilityIds.includes(f));
    if (outside.length) {
      throw httpError(403, 'Ce médecin exerce aussi dans d’autres établissements : seule la plateforme peut modifier son profil');
    }
  }
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

const resolveHoursFacility = async (doctorId, facilityId, scope) => {
  const wanted = scope ? await scopes.pickFacilityInScope(scope, doctorId, facilityId ?? null) : facilityId ?? null;
  const facility = await resolveFacility(doctorId, wanted);
  if (!facility) throw httpError(409, 'Ce médecin n’est rattaché à aucun établissement actif');
  return facility;
};

exports.getWorkingHours = async (doctorId, { facilityId } = {}, scope = null) => {
  const doc = await ensureDoctor(doctorId);
  const facility = await resolveHoursFacility(doctorId, facilityId, scope);
  const r = await pool.query(
    `SELECT weekday, to_char(start_time,'HH24:MI') AS "startTime", to_char(end_time,'HH24:MI') AS "endTime"
       FROM working_hours WHERE doctor_id=$1 AND facility_id=$2
      ORDER BY weekday, start_time`, [doctorId, facility.id]);
  return {
    consultationMinutes: doc.consultation_minutes,
    facilityId: facility.id,
    facilityName: facility.name,
    hours: r.rows,
  };
};

const overlaps = (a, b) => a.weekday === b.weekday && a.startTime < b.endTime && b.startTime < a.endTime;

exports.setWorkingHours = async (doctorId, { hours, consultationMinutes, facilityId }, scope = null) => {
  for (const h of hours)
    if (h.endTime <= h.startTime) throw httpError(400, 'L’heure de fin doit suivre l’heure de début');
  for (let i = 0; i < hours.length; i += 1)
    for (let j = i + 1; j < hours.length; j += 1)
      if (overlaps(hours[i], hours[j])) throw httpError(400, 'Deux plages horaires se chevauchent');
  const current = await ensureDoctor(doctorId);
  const facility = await resolveHoursFacility(doctorId, facilityId, scope);
  if (scope && !scope.all && consultationMinutes !== current.consultation_minutes) {
    const outside = (await scopes.doctorFacilityIds(doctorId)).filter((f) => !scope.facilityIds.includes(f));
    if (outside.length) {
      throw httpError(403, 'La durée de consultation est commune à tous les établissements du médecin');
    }
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM doctors WHERE id=$1 FOR UPDATE', [doctorId]);
    const elsewhere = await client.query(
      `SELECT w.weekday, to_char(w.start_time,'HH24:MI') AS "startTime",
              to_char(w.end_time,'HH24:MI') AS "endTime", f.name
         FROM working_hours w JOIN facilities f ON f.id = w.facility_id
        WHERE w.doctor_id=$1 AND w.facility_id <> $2`, [doctorId, facility.id]);
    const clash = elsewhere.rows.find((o) => hours.some((h) => overlaps(h, o)));
    if (clash) {
      throw httpError(409, `Chevauchement avec les horaires de ${clash.name}`);
    }
    await client.query('UPDATE doctors SET consultation_minutes=$2 WHERE id=$1', [doctorId, consultationMinutes]);
    await client.query('DELETE FROM working_hours WHERE doctor_id=$1 AND facility_id=$2', [doctorId, facility.id]);
    for (const h of hours)
      await client.query(
        `INSERT INTO working_hours(doctor_id,facility_id,weekday,start_time,end_time)
         VALUES($1,$2,$3,$4,$5)`,
        [doctorId, facility.id, h.weekday, h.startTime, h.endTime]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return exports.getWorkingHours(doctorId, { facilityId: facility.id });
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
