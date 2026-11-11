CREATE TABLE IF NOT EXISTS appointment_reminders (
  appointment_id INT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  kind VARCHAR(5) NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  notification_id INT REFERENCES notifications(id) ON DELETE SET NULL,
  sms_status VARCHAR(10) NOT NULL DEFAULT 'none',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (appointment_id, kind, starts_at),
  CONSTRAINT appointment_reminders_kind_check CHECK (kind IN ('24h', '2h')),
  CONSTRAINT appointment_reminders_sms_check CHECK (sms_status IN ('none', 'sent', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_appt_active_starts
  ON appointments (starts_at) WHERE status IN ('pending', 'confirmed');
