
-- Migration 001 : amélioration du système de notifications
-- Migration additive : ne supprime aucune donnée existante.

ALTER TABLE notifications
ADD COLUMN IF NOT EXISTS type VARCHAR(40) NOT NULL DEFAULT 'general';

ALTER TABLE notifications
ADD COLUMN IF NOT EXISTS appointment_id INTEGER
REFERENCES appointments(id) ON DELETE SET NULL;

ALTER TABLE notifications
ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
ON notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
ON notifications(user_id, read)
WHERE read = false;

-- Préférences de réception des notifications
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id INTEGER PRIMARY KEY
    REFERENCES users(id) ON DELETE CASCADE,
  sms_enabled BOOLEAN NOT NULL DEFAULT true,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
