const pool = require('../config/db');
const { getAvailableSlots, resolveFacility } = require('./slots.service');
const { localDateString } = require('../utils/timezone');
const { accessibleProfilesSql } = require('./patients.service');
const unavailability = require('./unavailability.service');

const httpError = (status, message, code) =>
  Object.assign(new Error(message), { status, expose: true, ...(code ? { code } : {}) });

const HORIZON_DAYS = 14;
const SLOTS_PER_OPTION = 3;
const SAME_DOCTOR_SLOTS = 5;
const SAME_FACILITY_LIMIT = 5;
const OTHER_FACILITY_LIMIT = 8;
const DAY_MS = 86400000;
const DAYS_PER_BATCH = 4;

const distanceSql = (lat, lng) => `(6371 * acos(LEAST(1, GREATEST(-1,
  cos(radians(${lat})) * cos(radians(f.latitude)) * cos(radians(f.longitude) - radians(${lng}))
  + sin(radians(${lat})) * sin(radians(f.latitude))))))`;

exports.nextSlots = async (doctorId, facility, { count = SLOTS_PER_OPTION, skip = null, db = pool } = {}) => {
  const workdays = new Set((await db.query(
    'SELECT DISTINCT weekday FROM working_hours WHERE doctor_id = $1 AND facility_id = $2',
    [doctorId, facility.id]
  )).rows.map((r) => Number(r.weekday)));
  if (!workdays.size) return [];

  const days = [];
  for (let i = 0; i < HORIZON_DAYS; i++) {
    const date = localDateString(new Date(Date.now() + i * DAY_MS), facility.timezone);
    if (workdays.has(new Date(`${date}T12:00:00Z`).getUTCDay()) && !days.includes(date)) days.push(date);
  }

  const found = [];
  for (let i = 0; i < days.length && found.length < count; i += DAYS_PER_BATCH) {
    const batch = await Promise.all(
      days.slice(i, i + DAYS_PER_BATCH).map((date) => getAvailableSlots(doctorId, date, db, null, facility.id))
    );
    for (const slot of batch.flat()) {
      if (found.length >= count) break;
      if (slot?.available && slot.startsAt !== skip) found.push({ startsAt: slot.startsAt, endsAt: slot.endsAt });
    }
  }
  return found;
};

const loadOrigin = async (doctorId, facilityId) => {
  const r = await pool.query(
    `SELECT d.id AS doctor_id, d.specialty_id, u.first_name, u.last_name, s.name AS specialty,
            f.id AS facility_id, f.name AS facility_name, f.city, f.timezone, f.latitude, f.longitude
       FROM doctors d
       JOIN users u ON u.id = d.user_id
       JOIN specialties s ON s.id = d.specialty_id
       JOIN facilities f ON f.id = $2
      WHERE d.id = $1`,
    [doctorId, facilityId]
  );
  if (!r.rowCount) throw httpError(404, 'Médecin introuvable');
  return r.rows[0];
};

const candidates = async (origin, { lat, lng }) => {
  const hasPosition = lat !== undefined && lng !== undefined;
  const refLat = hasPosition ? lat : origin.latitude;
  const refLng = hasPosition ? lng : origin.longitude;
  const hasRef = refLat !== null && refLat !== undefined && refLng !== null && refLng !== undefined;
  const distance = hasRef
    ? `CASE WHEN f.latitude IS NULL THEN NULL ELSE round((${distanceSql('$5', '$6')})::numeric, 1) END`
    : 'NULL::numeric';

  return (await pool.query(
    `SELECT d.id AS doctor_id, u.first_name, u.last_name, s.name AS specialty,
            COALESCE(da.fee, d.fee) AS fee,
            f.id AS facility_id, f.name AS facility_name, f.city, f.address, f.timezone, f.phone,
            ${distance} AS distance_km,
            (f.id = $3) AS same_facility,
            (lower(coalesce(f.city, '')) = lower(coalesce($4, ''))) AS same_city
       FROM doctor_affiliations da
       JOIN doctors d ON d.id = da.doctor_id
       JOIN users u ON u.id = d.user_id
       JOIN specialties s ON s.id = d.specialty_id
       JOIN facilities f ON f.id = da.facility_id
      WHERE da.status = 'active' AND d.active AND f.status = 'active'
        AND d.specialty_id = $1
        AND NOT (d.id = $2 AND f.id = $3)
      ORDER BY same_facility DESC, distance_km NULLS LAST, same_city DESC, f.name, u.last_name
      LIMIT 60`,
    [origin.specialty_id, origin.doctor_id, origin.facility_id, origin.city, ...(hasRef ? [refLat, refLng] : [])]
  )).rows;
};

const doctorName = (row) =>
  `Dr ${[row.first_name, row.last_name].filter(Boolean).join(' ').replace(/^dr\.?\s+/i, '')}`;

const explain = (row, origin) => {
  if (row.doctor_id === origin.doctor_id) return 'Même médecin, dans un autre établissement';
  if (row.same_facility) return `Même spécialité (${row.specialty}), même établissement`;
  if (row.distance_km !== null && row.distance_km !== undefined) return `Même spécialité, à ${row.distance_km} km`;
  if (row.same_city) return `Même spécialité, dans la même ville (${row.city})`;
  return `Même spécialité, à ${row.city || 'une autre ville'}`;
};

const option = (row, kind, reason, slots) => ({
  kind,
  reason,
  doctorId: row.doctor_id,
  doctorName: doctorName(row),
  specialty: row.specialty,
  fee: row.fee ?? null,
  facilityId: row.facility_id,
  facilityName: row.facility_name,
  city: row.city ?? null,
  address: row.address ?? null,
  distanceKm: row.distance_km === null || row.distance_km === undefined ? null : Number(row.distance_km),
  timezone: row.timezone,
  slots,
});

exports.find = async ({ doctorId, facilityId, skipSlot = null, lat, lng }) => {
  const origin = await loadOrigin(doctorId, facilityId);

  const [sameDoctorSlots, rows] = await Promise.all([
    exports.nextSlots(doctorId, { id: origin.facility_id, timezone: origin.timezone }, {
      count: SAME_DOCTOR_SLOTS,
      skip: skipSlot,
    }),
    candidates(origin, { lat, lng }),
  ]);
  const sameFacility = rows.filter((r) => r.same_facility).slice(0, SAME_FACILITY_LIMIT);
  const others = rows.filter((r) => !r.same_facility).slice(0, OTHER_FACILITY_LIMIT);

  const withSlots = await Promise.all([...sameFacility, ...others].map(async (row) => ({
    row,
    slots: await exports.nextSlots(row.doctor_id, { id: row.facility_id, timezone: row.timezone }),
  })));

  const options = [
    ...(sameDoctorSlots.length
      ? [option({ ...origin, same_facility: true }, 'same_doctor', 'Même médecin, même établissement', sameDoctorSlots)]
      : []),
    ...withSlots
      .filter(({ slots }) => slots.length)
      .map(({ row, slots }) => option(row, row.same_facility ? 'same_facility' : 'other_facility', explain(row, origin), slots)),
  ];

  return {
    origin: {
      doctorId: origin.doctor_id,
      doctorName: doctorName(origin),
      specialty: origin.specialty,
      facilityId: origin.facility_id,
      facilityName: origin.facility_name,
      city: origin.city,
      timezone: origin.timezone,
    },
    horizonDays: HORIZON_DAYS,
    options,
  };
};

const loadOwnAppointment = async (db, id, user, lock = false) =>
  (await db.query(
    `SELECT * FROM appointments
      WHERE id = $1 AND patient_profile_id IN ${accessibleProfilesSql('$2')}
      ${lock ? 'FOR UPDATE' : ''}`,
    [id, user.id]
  )).rows[0];

const isActive = (a) => a.status === 'pending' || a.status === 'confirmed';

exports.forAppointment = async (id, user, position = {}) => {
  const appointment = await loadOwnAppointment(pool, id, user);
  if (!appointment) throw httpError(404, 'Rendez-vous introuvable');
  if (appointment.status === 'done') throw httpError(409, 'Ce rendez-vous a déjà eu lieu.', 'APPOINTMENT_DONE');
  if (appointment.replaced_by_appointment_id) {
    throw httpError(409, 'Ce rendez-vous a déjà été remplacé.', 'ALREADY_REPLACED');
  }
  const result = await exports.find({
    doctorId: appointment.doctor_id,
    facilityId: appointment.facility_id,
    skipSlot: isActive(appointment) ? new Date(appointment.starts_at).toISOString() : null,
    ...position,
  });
  return {
    ...result,
    origin: {
      ...result.origin,
      appointmentId: appointment.id,
      startsAt: appointment.starts_at,
      status: appointment.status,
      cancelReason: appointment.cancel_reason ?? null,
    },
  };
};

exports.forDoctor = async (doctorId, { facilityId, ...position } = {}) => {
  const facility = await resolveFacility(doctorId, facilityId ?? null);
  if (!facility) throw httpError(404, 'Médecin introuvable');
  return exports.find({ doctorId, facilityId: facility.id, ...position });
};

exports.redirect = async (id, user, { doctorId, startsAt, facilityId }) => {
  const date = new Date(startsAt);
  if (!Number.isFinite(date.getTime())) throw httpError(400, 'Date de rendez-vous invalide');
  const iso = date.toISOString();

  const client = await pool.connect();
  let original;
  let created;
  let facility;
  try {
    await client.query('BEGIN');
    original = await loadOwnAppointment(client, id, user, true);
    if (!original) throw httpError(404, 'Rendez-vous introuvable');
    if (original.status === 'done') throw httpError(409, 'Ce rendez-vous a déjà eu lieu.', 'APPOINTMENT_DONE');
    if (original.replaced_by_appointment_id) {
      throw httpError(409, 'Ce rendez-vous a déjà été remplacé.', 'ALREADY_REPLACED');
    }

    if (isActive(original)) {
      await client.query(
        `UPDATE appointments
            SET status = 'cancelled', cancelled_at = now(), cancelled_by_user_id = $2,
                cancelled_by_role = 'patient', cancel_reason = 'redirected', cancel_note = NULL
          WHERE id = $1`,
        [original.id, user.id]
      );
    }

    facility = await resolveFacility(doctorId, facilityId ?? null, client);
    if (!facility) throw httpError(404, 'Médecin introuvable');
    const slots = await getAvailableSlots(doctorId, localDateString(date, facility.timezone), client, null, facility.id);
    const slot = (slots ?? []).find((s) => s.startsAt === iso);
    if (!slot || !slot.available) throw httpError(409, 'Ce créneau n’est plus disponible. Choisissez-en un autre.', 'SLOT_TAKEN');

    created = (await client.query(
      `INSERT INTO appointments
        (patient_id, patient_profile_id, doctor_id, facility_id, starts_at, ends_at, status, reason)
       VALUES ($1, $2, $3, $4, $5, $6, 'confirmed', $7)
       RETURNING *`,
      [original.patient_id, original.patient_profile_id, doctorId, facility.id, slot.startsAt, slot.endsAt, original.reason]
    )).rows[0];

    await client.query('UPDATE appointments SET replaced_by_appointment_id = $2 WHERE id = $1', [original.id, created.id]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error.code === '23P01') throw httpError(409, 'Ce créneau vient d’être réservé. Choisissez-en un autre.', 'SLOT_TAKEN');
    throw error;
  } finally {
    client.release();
  }

  const details = (await pool.query(
    `SELECT u.last_name AS doctor_last_name, f.name AS facility_name, f.timezone,
            (SELECT scope FROM record_consents c
              WHERE c.patient_id = $3 AND c.facility_id = f.id AND c.revoked_at IS NULL
                AND (c.expires_at IS NULL OR c.expires_at > now())
              ORDER BY c.granted_at DESC LIMIT 1) AS consent_scope
       FROM doctors d JOIN users u ON u.id = d.user_id, facilities f
      WHERE d.id = $1 AND f.id = $2`,
    [doctorId, facility.id, original.patient_profile_id]
  )).rows[0] ?? {};

  const when = new Intl.DateTimeFormat('fr-FR', {
    timeZone: facility.timezone, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  }).format(new Date(created.starts_at));
  await pool.query(
    `INSERT INTO notifications (user_id, appointment_id, title, body, type)
     VALUES ($1, $2, 'Nouveau rendez-vous confirmé', $3, 'appointment_confirmed')`,
    [original.patient_id, created.id,
      `Votre nouveau rendez-vous avec le Dr ${details.doctor_last_name ?? ''} le ${when} (${details.facility_name ?? facility.name}) est confirmé. L’ancien rendez-vous est annulé.`]
  ).catch((error) => console.error('Notification de redirection non créée :', error.message));

  if (isActive(original)) await unavailability.dispatchFreedSlot(original);

  return {
    appointment: created,
    replaced: original.id,
    recordSharing: {
      facilityId: facility.id,
      facilityName: details.facility_name ?? facility.name,
      sameFacility: facility.id === original.facility_id,
      consentScope: details.consent_scope ?? null,
    },
  };
};
