const pool = require('../config/db');
const { localToUtc } = require('../utils/timezone');

const MINUTE_MS = 60000;

const httpError = (status, message) =>
  Object.assign(new Error(message), { status });

const toMin = (t) => {
  const [h, m] = t.split(':');
  return Number(h) * 60 + Number(m);
};

function parseCalendarDate(dateStr) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);

  if (!match) {
    throw new Error('Date invalide. Format attendu : AAAA-MM-JJ');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));

  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  ) {
    throw new Error('Date de calendrier invalide');
  }

  return { year, month, day, weekday: calendarDate.getUTCDay() };
}

const listFacilities = async (doctorId, facilityId = null, db = pool) => {
  const r = await db.query(
    `SELECT f.id, f.timezone, f.name
       FROM doctor_affiliations a
       JOIN facilities f ON f.id = a.facility_id
      WHERE a.doctor_id = $1
        AND a.status = 'active'
        AND f.status = 'active'
        AND ($2::int IS NULL OR f.id = $2)
      ORDER BY f.id`,
    [doctorId, facilityId]
  );

  if (!r.rowCount && facilityId) {
    throw httpError(404, 'Ce médecin ne consulte pas dans cet établissement');
  }
  return r.rows;
};

exports.resolveFacility = async (doctorId, facilityId = null, db = pool) => {
  const rows = await listFacilities(doctorId, facilityId, db);
  if (!rows.length) return null;
  if (rows.length > 1) {
    throw httpError(400, 'Ce médecin consulte dans plusieurs établissements : précisez l’établissement');
  }
  return rows[0];
};

exports.getAvailableSlots = async (
  doctorId,
  dateStr,
  db = pool,
  excludeAppointmentId = null,
  facilityId = null
) => {
  const { year, month, day, weekday } = parseCalendarDate(dateStr);

  const doc = await db.query(
    'SELECT consultation_minutes FROM doctors WHERE id=$1 AND active',
    [doctorId]
  );

  if (!doc.rowCount) return null;

  const facilities = await listFacilities(doctorId, facilityId, db);
  if (!facilities.length) return [];

  const onLeave = await db.query(
    'SELECT 1 FROM leaves WHERE doctor_id=$1 AND $2::date BETWEEN start_date AND end_date',
    [doctorId, dateStr]
  );

  if (onLeave.rowCount) return [];

  const slots = [];
  for (const facility of facilities) {
    slots.push(...await slotsForFacility({
      db, doctorId, facility, excludeAppointmentId,
      duration: doc.rows[0].consultation_minutes,
      date: { year, month, day, weekday },
    }));
  }

  return slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
};

async function slotsForFacility({ db, doctorId, facility, excludeAppointmentId, duration, date }) {
  const { year, month, day, weekday } = date;
  const dayStart = localToUtc(year, month, day, 0, facility.timezone);
  const dayEnd = localToUtc(year, month, day, 24 * 60, facility.timezone);

  const wh = await db.query(
    `SELECT start_time, end_time FROM working_hours
      WHERE doctor_id=$1 AND facility_id=$2 AND weekday=$3`,
    [doctorId, facility.id, weekday]
  );

  const busy = await db.query(
    `SELECT starts_at, ends_at FROM appointments
       WHERE doctor_id=$1 AND status IN ('pending','confirmed')
         AND starts_at < $3 AND ends_at > $2 AND ($4::int IS NULL OR id <> $4)
     UNION ALL
     SELECT starts_at, ends_at FROM blocked_slots
       WHERE doctor_id=$1 AND starts_at < $3 AND ends_at > $2`,
    [doctorId, dayStart, dayEnd, excludeAppointmentId]
  );

  const now = Date.now();
  const slots = [];

  for (const row of wh.rows) {
    for (
      let minutes = toMin(row.start_time);
      minutes + duration <= toMin(row.end_time);
      minutes += duration
    ) {
      const startsAt = localToUtc(year, month, day, minutes, facility.timezone);
      const endsAt = new Date(startsAt.getTime() + duration * MINUTE_MS);

      const taken = busy.rows.some((booking) =>
        startsAt < new Date(booking.ends_at) && endsAt > new Date(booking.starts_at)
      );

      slots.push({
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        available: !taken && startsAt.getTime() > now,
        facilityId: facility.id,
        facilityName: facility.name,
        timezone: facility.timezone,
      });
    }
  }

  return slots;
}
