const pool = require('../config/db');
const phoneOtp = require('./phoneOtp.service');
const { getAvailableSlots } = require('./slots.service');
const { localDateString } = require('../utils/timezone');

const httpError = (status, message, code) =>
  Object.assign(new Error(message), { status, expose: true, ...(code ? { code } : {}) });

const REASON_LABELS = {
  patient_request: 'annulé à votre demande',
  doctor_unavailable: 'le médecin est indisponible',
  service_unavailable: 'le service est momentanément indisponible',
  facility_closed: 'l’établissement est fermé',
  redirected: 'remplacé par le rendez-vous que vous avez choisi',
  other: null,
};

const STAFF_REASONS = ['doctor_unavailable', 'service_unavailable', 'facility_closed', 'other'];

const WAITING_LIST_BATCH = 10;

const formatWhen = (iso, timeZone) =>
  new Intl.DateTimeFormat('fr-FR', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));

const localMinutes = (iso, timeZone) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value])
  );
  return Number(parts.hour) * 60 + Number(parts.minute);
};

const isoWeekday = (dateStr) => {
  const day = new Date(`${dateStr}T12:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
};

const TIME_SLOTS = {
  all_day: () => true,
  morning: (m) => m >= 8 * 60 && m < 12 * 60,
  afternoon: (m) => m >= 14 * 60 && m < 18 * 60,
  evening: (m) => m >= 17 * 60,
};

const NOTICE_HOURS = { '2h': 2, '24h': 24, any: 0 };

exports.matchesWaitingPreferences = ({ time_slots: slots, min_notice: notice }, { minutes, hoursAhead }) =>
  (slots ?? ['all_day']).some((slot) => TIME_SLOTS[slot]?.(minutes)) &&
  hoursAhead >= (NOTICE_HOURS[notice] ?? 24);

exports.actorRole = (role) => {
  if (role === 'patient') return 'patient';
  if (role === 'doctor') return 'doctor';
  return 'facility';
};

exports.resolveReason = (role, reason) => {
  if (role === 'patient') return 'patient_request';
  return STAFF_REASONS.includes(reason) ? reason : 'other';
};

const CONFLICTS = `
  SELECT a.id, a.starts_at, a.ends_at, a.status, a.facility_id,
         f.name AS facility_name, f.timezone,
         pp.first_name || ' ' || pp.last_name AS patient_name, pp.patient_number,
         CASE WHEN l.id IS NOT NULL THEN 'leave' ELSE 'block' END AS cause,
         COALESCE(l.reason, b.reason) AS cause_reason
    FROM appointments a
    JOIN facilities f ON f.id = a.facility_id
    JOIN patients pp ON pp.id = a.patient_profile_id
    LEFT JOIN LATERAL (
      SELECT id, reason FROM leaves
       WHERE doctor_id = a.doctor_id
         AND (a.starts_at AT TIME ZONE f.timezone)::date BETWEEN start_date AND end_date
       ORDER BY id LIMIT 1) l ON true
    LEFT JOIN LATERAL (
      SELECT id, reason FROM blocked_slots
       WHERE doctor_id = a.doctor_id AND starts_at < a.ends_at AND ends_at > a.starts_at
       ORDER BY id LIMIT 1) b ON true
   WHERE a.doctor_id = $1
     AND a.status IN ('pending', 'confirmed')
     AND a.starts_at > now()
     AND (l.id IS NOT NULL OR b.id IS NOT NULL)
     AND ($2::int[] IS NULL OR a.facility_id = ANY($2::int[]))`;

exports.listConflicts = async (doctorId, facilityIds = null) =>
  (await pool.query(`${CONFLICTS} ORDER BY a.starts_at`, [doctorId, facilityIds])).rows;

exports.cancelConflicts = async (doctorId, { appointmentIds, note }, user, facilityIds = null) => {
  const client = await pool.connect();
  let cancelled;
  try {
    await client.query('BEGIN');
    const rows = (await client.query(
      `${CONFLICTS} AND a.id = ANY($3::int[]) FOR UPDATE OF a`,
      [doctorId, facilityIds, appointmentIds]
    )).rows;
    const ids = rows.map((r) => r.id);
    cancelled = ids.length
      ? (await client.query(
        `UPDATE appointments
            SET status = 'cancelled', cancelled_at = now(), cancelled_by_user_id = $2,
                cancelled_by_role = $3, cancel_reason = 'doctor_unavailable', cancel_note = $4
          WHERE id = ANY($1::int[])
          RETURNING id`,
        [ids, user.id, exports.actorRole(user.role), note?.trim() || null]
      )).rows.map((r) => r.id)
      : [];
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  await exports.notifyCancellation(cancelled);
  return { cancelled: cancelled.length, skipped: appointmentIds.length - cancelled.length };
};

const holderName = (row) => row.profile_first_name || 'votre proche';

exports.notifyCancellation = async (appointmentIds) => {
  if (!appointmentIds.length) return;
  const rows = (await pool.query(
    `SELECT a.id, a.patient_id, a.starts_at, a.cancel_reason, a.cancel_note, a.cancelled_by_role,
            f.name AS facility_name, f.timezone,
            du.last_name AS doctor_last_name,
            pp.first_name AS profile_first_name, pp.user_id AS profile_user_id,
            pu.phone_e164, pu.phone_verified_at, COALESCE(np.sms_enabled, true) AS sms_enabled
       FROM appointments a
       JOIN facilities f ON f.id = a.facility_id
       JOIN doctors d ON d.id = a.doctor_id
       JOIN users du ON du.id = d.user_id
       JOIN patients pp ON pp.id = a.patient_profile_id
       JOIN users pu ON pu.id = a.patient_id
       LEFT JOIN notification_preferences np ON np.user_id = a.patient_id
      WHERE a.id = ANY($1::int[])`,
    [appointmentIds]
  )).rows;

  for (const row of rows) {
    const when = formatWhen(row.starts_at, row.timezone);
    const label = REASON_LABELS[row.cancel_reason] ?? null;
    const self = row.profile_user_id === row.patient_id;
    const subject = self ? 'Votre rendez-vous' : `Le rendez-vous de ${holderName(row)}`;
    const byPatient = row.cancelled_by_role === 'patient';
    const body = [
      `${subject} du ${when} avec le Dr ${row.doctor_last_name} (${row.facility_name}) est annulé${label && !byPatient ? ` : ${label}` : ''}.`,
      row.cancel_note ? `Message de l’établissement : ${row.cancel_note}${/[.!?]$/.test(row.cancel_note) ? '' : '.'}` : null,
      byPatient ? null : 'Ouvrez ClinicRDV pour choisir un autre créneau ou un autre médecin.',
    ].filter(Boolean).join(' ');

    try {
      await pool.query(
        `INSERT INTO notifications (user_id, appointment_id, title, body, type)
         VALUES ($1, $2, $3, $4, 'appointment_cancelled')`,
        [row.patient_id, row.id, 'Rendez-vous annulé', body]
      );
    } catch (error) {
      console.error('Notification d’annulation non créée :', error.message);
    }

    if (!byPatient && row.sms_enabled && row.phone_verified_at && row.phone_e164) {
      const who = self ? 'votre RDV' : `le RDV de ${holderName(row)}`;
      await phoneOtp.notify(
        row.phone_e164,
        `ClinicRDV: ${who} du ${when} avec le Dr ${row.doctor_last_name} est annule${label ? ` (${label})` : ''}. Ouvrez l'application pour choisir un autre creneau.`
      );
    }
  }
};

exports.dispatchFreedSlot = async (appointment) => {
  try {
    const startsAt = new Date(appointment.starts_at);
    if (startsAt.getTime() <= Date.now()) return 0;

    const facility = (await pool.query(
      'SELECT id, name, timezone FROM facilities WHERE id = $1',
      [appointment.facility_id]
    )).rows[0];
    if (!facility) return 0;

    const date = localDateString(startsAt, facility.timezone);
    const iso = startsAt.toISOString();
    const slots = await getAvailableSlots(appointment.doctor_id, date, pool, null, facility.id);
    if (!(slots ?? []).some((s) => s.startsAt === iso && s.available)) return 0;

    const minutes = localMinutes(iso, facility.timezone);
    const hoursAhead = (startsAt.getTime() - Date.now()) / 3600000;
    const candidates = (await pool.query(
      `SELECT w.id, w.patient_id, w.time_slots, w.min_notice, w.notify_push, w.notify_sms,
              u.phone_e164, u.phone_verified_at, COALESCE(np.sms_enabled, true) AS sms_enabled
         FROM waiting_list w
         JOIN users u ON u.id = w.patient_id
         LEFT JOIN notification_preferences np ON np.user_id = w.patient_id
        WHERE w.doctor_id = $1 AND w.active AND w.desired_date IS NULL AND w.patient_id <> $2
          AND $3 = ANY(w.weekdays)
          AND (w.last_alert_at IS NULL OR w.last_alert_at < now() - interval '30 minutes')
        ORDER BY w.created_at
        LIMIT 50`,
      [appointment.doctor_id, appointment.patient_id, isoWeekday(date)]
    )).rows.filter((w) => exports.matchesWaitingPreferences(w, { minutes, hoursAhead }));
    if (!candidates.length) return 0;

    const doctor = (await pool.query(
      'SELECT u.last_name FROM doctors d JOIN users u ON u.id = d.user_id WHERE d.id = $1',
      [appointment.doctor_id]
    )).rows[0];
    const when = formatWhen(iso, facility.timezone);

    let sent = 0;
    for (const w of candidates) {
      if (sent >= WAITING_LIST_BATCH) break;
      const claimed = await pool.query(
        `UPDATE waiting_list SET last_alert_at = now()
          WHERE id = $1 AND (last_alert_at IS NULL OR last_alert_at < now() - interval '30 minutes')
          RETURNING id`,
        [w.id]
      );
      if (!claimed.rowCount) continue;
      sent += 1;

      if (w.notify_push) {
        await pool.query(
          `INSERT INTO notifications (user_id, title, body, type) VALUES ($1, $2, $3, 'waiting_list')`,
          [w.patient_id, 'Un créneau s’est libéré',
            `Un créneau est disponible avec le Dr ${doctor?.last_name ?? ''} le ${when} (${facility.name}). Premier arrivé, premier servi : réservez dans ClinicRDV.`]
        );
      }
      if (w.notify_sms && w.sms_enabled && w.phone_verified_at && w.phone_e164) {
        await phoneOtp.notify(
          w.phone_e164,
          `ClinicRDV: un creneau s'est libere avec le Dr ${doctor?.last_name ?? ''} le ${when}. Reservez vite dans l'application.`
        );
      }
    }
    return sent;
  } catch (error) {
    console.error('Liste d’attente : alerte non envoyée :', error.message);
    return 0;
  }
};

exports.httpError = httpError;
