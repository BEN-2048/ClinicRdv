ALTER TABLE waiting_list ALTER COLUMN desired_date DROP NOT NULL;

ALTER TABLE waiting_list
  ADD COLUMN IF NOT EXISTS time_slots TEXT[] NOT NULL DEFAULT '{all_day}',
  ADD COLUMN IF NOT EXISTS weekdays SMALLINT[] NOT NULL DEFAULT '{1,2,3,4,5}',
  ADD COLUMN IF NOT EXISTS min_notice VARCHAR(8) NOT NULL DEFAULT '24h',
  ADD COLUMN IF NOT EXISTS notify_push BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_sms BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'waiting_list_min_notice_check') THEN
    ALTER TABLE waiting_list ADD CONSTRAINT waiting_list_min_notice_check CHECK (min_notice IN ('2h', '24h', 'any'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS waiting_list_alert_unique
  ON waiting_list (patient_id, doctor_id) WHERE desired_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_waiting_list_doctor_active
  ON waiting_list (doctor_id, created_at) WHERE active;
