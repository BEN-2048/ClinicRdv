const pool = require('../config/db');
const phoneOtp = require('./phoneOtp.service');

const MINUTE = 60000;

const KINDS = [
  { kind: '24h', within: 24 * 60, after: 2 * 60, freshMinutes: 60, sms: true },
  { kind: '2h', within: 2 * 60, after: 0, freshMinutes: 30, sms: false },
];

const formatWhen = (date, timeZone, kind) => {
  const time = new Intl.DateTimeFormat('fr-FR', { timeZone, hour: '2-digit', minute: '2-digit' }).format(date);
  if (kind === '2h') return `aujourd’hui à ${time}`;
  const day = new Intl.DateTimeFormat('fr-FR', { timeZone, weekday: 'long', day: 'numeric', month: 'long' }).format(date);
  return `le ${day} à ${time}`;
};

const doctorLabel = (lastName) => `Dr ${String(lastName || '').replace(/^dr\.?\s+/i, '')}`.trim();

exports.message = (row, kind) => {
  const when = formatWhen(new Date(row.starts_at), row.timezone || 'Africa/Kinshasa', kind);
  const forWhom = row.relationship && row.relationship !== 'self' && row.profile_first_name
    ? ` pour ${row.profile_first_name}`
    : '';
  const place = row.facility_name ? ` (${row.facility_name})` : '';
  return {
    title: kind === '2h' ? 'Votre rendez-vous approche' : 'Rappel de rendez-vous',
    body: `Rendez-vous${forWhom} avec le ${doctorLabel(row.doctor_last_name)} ${when}${place}. En cas d’empêchement, annulez-le dans l’application pour libérer le créneau.`,
    sms: `ClinicRDV : rappel, RDV${forWhom} avec le ${doctorLabel(row.doctor_last_name)} ${when}${place}. Annulez dans l'app si vous ne pouvez pas venir.`,
  };
};

const due = (db, { kind, within, after, freshMinutes }, now) =>
  db.query(
    `SELECT a.id, a.patient_id, a.starts_at,
            to_char(a.starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') AS starts_at_exact,
            du.last_name AS doctor_last_name,
            f.name AS facility_name, f.timezone,
            p.first_name AS profile_first_name,
            CASE WHEN p.user_id = a.patient_id THEN 'self' ELSE 'dependent' END AS relationship,
            u.phone_e164, u.phone_verified_at,
            COALESCE(np.sms_enabled, true) AS sms_enabled
       FROM appointments a
       JOIN users u ON u.id = a.patient_id
       JOIN doctors d ON d.id = a.doctor_id
       JOIN users du ON du.id = d.user_id
       LEFT JOIN facilities f ON f.id = a.facility_id
       LEFT JOIN patients p ON p.id = a.patient_profile_id
       LEFT JOIN notification_preferences np ON np.user_id = a.patient_id
      WHERE a.status IN ('pending', 'confirmed')
        AND a.starts_at > $1::timestamptz + make_interval(mins => $2)
        AND a.starts_at <= $1::timestamptz + make_interval(mins => $3)
        AND a.created_at <= $1::timestamptz - make_interval(mins => $4)
        AND NOT EXISTS (
          SELECT 1 FROM appointment_reminders r
           WHERE r.appointment_id = a.id AND r.kind = $5
             AND date_trunc('milliseconds', r.starts_at) = date_trunc('milliseconds', a.starts_at))
      ORDER BY a.starts_at
      LIMIT 200`,
    [now.toISOString(), after, within, freshMinutes, kind]
  );

const sendOne = async (row, spec) => {
  const client = await pool.connect();
  let text;
  let claimed = false;
  let claimedStartsAt;
  try {
    await client.query('BEGIN');
    const claim = await client.query(
      `INSERT INTO appointment_reminders (appointment_id, kind, starts_at)
       SELECT a.id, $2, a.starts_at
       FROM (SELECT id, starts_at FROM appointments WHERE id = $1 AND status IN ('pending', 'confirmed') AND starts_at = ($3::timestamp AT TIME ZONE 'UTC') FOR UPDATE) a
       ON CONFLICT DO NOTHING RETURNING appointment_id, to_char(starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') AS starts_at_exact`,
      [row.id, spec.kind, row.starts_at_exact]
    );
    if (claim.rowCount) {
      claimed = true;
      claimedStartsAt = claim.rows[0].starts_at_exact;
      text = exports.message(row, spec.kind);
      const notification = await client.query(
        `INSERT INTO notifications (user_id, appointment_id, title, body, type)
         VALUES ($1, $2, $3, $4, 'appointment_reminder') RETURNING id`,
        [row.patient_id, row.id, text.title, text.body]
      );
      await client.query(
        `UPDATE appointment_reminders SET notification_id = $3 WHERE appointment_id = $1 AND kind = $2
         AND starts_at = ($4::timestamp AT TIME ZONE 'UTC')`,
        [row.id, spec.kind, notification.rows[0].id, claimedStartsAt]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  if (!claimed) return { created: false, sms: 'none' };

  let sms = 'none';
  if (spec.sms && row.sms_enabled && row.phone_e164 && row.phone_verified_at) {
    const validity = await pool.query(
      `SELECT EXISTS (
         SELECT 1 FROM appointments
         WHERE id = $1 AND status IN ('pending', 'confirmed')
           AND starts_at = ($2::timestamp AT TIME ZONE 'UTC')
       ) AS valid`,
      [row.id, claimedStartsAt]
    );
    if (!validity.rows[0]?.valid) return { created: true, sms: 'none' };
    sms = await phoneOtp.notify(row.phone_e164, text.sms);
    await pool.query(
      `UPDATE appointment_reminders SET sms_status = $3 WHERE appointment_id = $1 AND kind = $2
         AND starts_at = ($4::timestamp AT TIME ZONE 'UTC')`,
      [row.id, spec.kind, sms, claimedStartsAt]
    ).catch(() => {});
  }
  return { created: true, sms };
};

exports.runOnce = async (now = new Date()) => {
  const summary = { created: 0, sms: 0, failed: 0 };
  for (const spec of KINDS) {
    const { rows } = await due(pool, spec, now);
    for (const row of rows) {
      try {
        const r = await sendOne(row, spec);
        if (r.created) summary.created += 1;
        if (r.sms === 'sent') summary.sms += 1;
        if (r.sms === 'failed') summary.failed += 1;
      } catch (error) {
        summary.failed += 1;
        console.error(`Rappel ${spec.kind} du RDV ${row.id} non créé :`, error.message);
      }
    }
  }
  return summary;
};

exports.start = ({ intervalMinutes = 5 } = {}) => {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await exports.runOnce();
      if (r.created) console.log(`Rappels de RDV : ${r.created} créé(s), ${r.sms} SMS envoyé(s), ${r.failed} échec(s)`);
    } catch (error) {
      console.error('Tâche des rappels de RDV :', error.message);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, intervalMinutes * MINUTE);
  timer.unref?.();
  setTimeout(tick, 10000).unref?.();
  return () => clearInterval(timer);
};

exports.KINDS = KINDS;
