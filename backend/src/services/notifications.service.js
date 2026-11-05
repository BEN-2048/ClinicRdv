
const pool = require('../config/db');

const httpError = (status, message) =>
  Object.assign(new Error(message), { status });

const NOTIFICATION_TYPES = [
  'general',
  'appointment_reminder',
  'waiting_list',
  'prescription',
  'appointment_confirmed',
  'appointment_cancelled',
];

exports.listForUser = async (userId, { type } = {}) => {
  if (type && type !== 'all' && !NOTIFICATION_TYPES.includes(type)) {
    throw httpError(400, 'Type de notification invalide');
  }

  const params = [userId];
  let typeCondition = '';

  if (type && type !== 'all') {
    params.push(type);
    typeCondition = `AND type = $${params.length}`;
  }

  const result = await pool.query(
    `SELECT id, user_id, title, body, type, appointment_id,
            read, read_at, send_at, created_at
       FROM notifications
      WHERE user_id = $1
        AND send_at <= now()
        ${typeCondition}
      ORDER BY created_at DESC`,
    params
  );

  const unread = await pool.query(
    `SELECT COUNT(*)::int AS count
       FROM notifications
      WHERE user_id = $1
        AND read = false
        AND send_at <= now()`,
    [userId]
  );

  return {
    items: result.rows,
    unreadCount: unread.rows[0].count,
  };
};

exports.markAsRead = async (notificationId, userId) => {
  const result = await pool.query(
    `UPDATE notifications
        SET read = true,
            read_at = COALESCE(read_at, now())
      WHERE id = $1
        AND user_id = $2
      RETURNING *`,
    [notificationId, userId]
  );

  if (!result.rowCount) {
    throw httpError(404, 'Notification introuvable');
  }

  return result.rows[0];
};

exports.markAllAsRead = async (userId) => {
  const result = await pool.query(
    `UPDATE notifications
        SET read = true,
            read_at = COALESCE(read_at, now())
      WHERE user_id = $1
        AND read = false
        AND send_at <= now()`,
    [userId]
  );

  return { updatedCount: result.rowCount };
};

exports.getPreferences = async (userId) => {
  const result = await pool.query(
    `SELECT sms_enabled, email_enabled, updated_at
       FROM notification_preferences
      WHERE user_id = $1`,
    [userId]
  );

  if (!result.rowCount) {
    return {
      sms_enabled: true,
      email_enabled: true,
    };
  }

  return result.rows[0];
};

exports.updatePreferences = async (
  userId,
  { smsEnabled, emailEnabled }
) => {
  const result = await pool.query(
    `INSERT INTO notification_preferences
       (user_id, sms_enabled, email_enabled, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (user_id)
     DO UPDATE SET
       sms_enabled = EXCLUDED.sms_enabled,
       email_enabled = EXCLUDED.email_enabled,
       updated_at = now()
     RETURNING sms_enabled, email_enabled, updated_at`,
    [userId, smsEnabled, emailEnabled]
  );

  return result.rows[0];
};

exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
