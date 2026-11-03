const pool = require('../config/db');

// Fuseau horaire de la clinique : Lubumbashi (UTC+2).
const UTC_OFFSET_MINUTES = 120;
const MINUTE_MS = 60000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const toMin = (t) => {
  const [h, m] = t.split(':');
  return Number(h) * 60 + Number(m);
};

function getLocalDay(dateStr) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);

  if (!match) {
    throw new Error('Date invalide. Format attendu : AAAA-MM-JJ');
  }

  const [, y, mo, d] = match;
  const year = Number(y);
  const month = Number(mo);
  const dayOfMonth = Number(d);

  const calendarDate = new Date(Date.UTC(year, month - 1, dayOfMonth));

  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== dayOfMonth
  ) {
    throw new Error('Date de calendrier invalide');
  }

  const localMidnightUTC =
    Date.UTC(year, month - 1, dayOfMonth) -
    UTC_OFFSET_MINUTES * MINUTE_MS;

  return {
    start: new Date(localMidnightUTC),
    end: new Date(localMidnightUTC + DAY_MS),
    weekday: calendarDate.getUTCDay(),
    year,
    month,
    dayOfMonth,
  };
}

/**
 * Calcule les créneaux selon les horaires locaux de Lubumbashi.
 * Les instants sont convertis en UTC pour PostgreSQL.
 */
exports.getAvailableSlots = async (doctorId, dateStr) => {
  const localDay = getLocalDay(dateStr);
  const { start, end, weekday, year, month, dayOfMonth } = localDay;

  const doc = await pool.query(
    'SELECT consultation_minutes FROM doctors WHERE id=$1 AND active',
    [doctorId]
  );

  if (!doc.rowCount) return null;

  const duration = doc.rows[0].consultation_minutes;

  const onLeave = await pool.query(
    'SELECT 1 FROM leaves WHERE doctor_id=$1 AND $2::date BETWEEN start_date AND end_date',
    [doctorId, dateStr]
  );

  if (onLeave.rowCount) return [];

  const wh = await pool.query(
    'SELECT start_time, end_time FROM working_hours WHERE doctor_id=$1 AND weekday=$2',
    [doctorId, weekday]
  );

  const busy = await pool.query(
    `SELECT starts_at, ends_at FROM appointments
       WHERE doctor_id=$1 AND status IN ('pending','confirmed')
         AND starts_at < $3 AND ends_at > $2
     UNION ALL
     SELECT starts_at, ends_at FROM blocked_slots
       WHERE doctor_id=$1 AND starts_at < $3 AND ends_at > $2`,
    [doctorId, start, end]
  );

  const now = Date.now();
  const slots = [];

  // Chaque horaire de travail est interprété en heure locale UTC+2.
  for (const row of wh.rows) {
    for (
      let minutes = toMin(row.start_time);
      minutes + duration <= toMin(row.end_time);
      minutes += duration
    ) {
      const startsAt = new Date(
        Date.UTC(year, month - 1, dayOfMonth, 0, minutes) -
        UTC_OFFSET_MINUTES * MINUTE_MS
      );

      const endsAt = new Date(startsAt.getTime() + duration * MINUTE_MS);

      const taken = busy.rows.some((booking) => {
        const busyStart = new Date(booking.starts_at);
        const busyEnd = new Date(booking.ends_at);

        return startsAt < busyEnd && endsAt > busyStart;
      });

      slots.push({
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        available: !taken && startsAt.getTime() > now,
      });
    }
  }

  return slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
};