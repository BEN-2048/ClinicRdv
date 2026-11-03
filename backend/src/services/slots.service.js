const pool = require('../config/db');

const toMin = (t) => { const [h, m] = t.split(':'); return +h * 60 + +m; };

/**
 * Calcule les créneaux d'un médecin pour une date (AAAA-MM-JJ).
 * Créneaux = horaires de travail découpés selon la durée de consultation,
 * moins congés, créneaux bloqués, RDV existants et créneaux passés.
 * NB : calcul en UTC pour simplifier (à documenter / adapter au fuseau de la clinique).
 */
exports.getAvailableSlots = async (doctorId, dateStr) => {
  const day = new Date(`${dateStr}T00:00:00Z`);
  const dayEnd = new Date(day.getTime() + 86400000);

  const doc = await pool.query(
    'SELECT consultation_minutes FROM doctors WHERE id=$1 AND active', [doctorId]);
  if (!doc.rowCount) return null;
  const duration = doc.rows[0].consultation_minutes;

  const onLeave = await pool.query(
    'SELECT 1 FROM leaves WHERE doctor_id=$1 AND $2::date BETWEEN start_date AND end_date',
    [doctorId, dateStr]);
  if (onLeave.rowCount) return [];

  const wh = await pool.query(
    'SELECT start_time, end_time FROM working_hours WHERE doctor_id=$1 AND weekday=$2',
    [doctorId, day.getUTCDay()]);

  const busy = await pool.query(
    `SELECT starts_at, ends_at FROM appointments
       WHERE doctor_id=$1 AND status IN ('pending','confirmed')
         AND starts_at < $3 AND ends_at > $2
     UNION ALL
     SELECT starts_at, ends_at FROM blocked_slots
       WHERE doctor_id=$1 AND starts_at < $3 AND ends_at > $2`,
    [doctorId, day, dayEnd]);

  const now = Date.now();
  const slots = [];
  for (const row of wh.rows) {
    for (let m = toMin(row.start_time); m + duration <= toMin(row.end_time); m += duration) {
      const start = new Date(day.getTime() + m * 60000);
      const end = new Date(start.getTime() + duration * 60000);
      const taken = busy.rows.some((b) => start < b.ends_at && end > b.starts_at);
      slots.push({ startsAt: start.toISOString(), endsAt: end.toISOString(),
                   available: !taken && start.getTime() > now });
    }
  }
  return slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
};
