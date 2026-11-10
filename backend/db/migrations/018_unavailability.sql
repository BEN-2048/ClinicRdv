ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelled_by_role VARCHAR(20),
  ADD COLUMN IF NOT EXISTS cancel_reason VARCHAR(30),
  ADD COLUMN IF NOT EXISTS cancel_note VARCHAR(255),
  ADD COLUMN IF NOT EXISTS replaced_by_appointment_id INT REFERENCES appointments(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_cancelled_by_role_check') THEN
    ALTER TABLE appointments ADD CONSTRAINT appointments_cancelled_by_role_check
      CHECK (cancelled_by_role IS NULL OR cancelled_by_role IN ('patient', 'doctor', 'facility', 'system'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_cancel_reason_check') THEN
    ALTER TABLE appointments ADD CONSTRAINT appointments_cancel_reason_check
      CHECK (cancel_reason IS NULL OR cancel_reason IN (
        'patient_request', 'doctor_unavailable', 'service_unavailable', 'facility_closed', 'redirected', 'other'));
  END IF;
END $$;

ALTER TABLE waiting_list ADD COLUMN IF NOT EXISTS last_alert_at TIMESTAMPTZ;

ALTER TABLE facility_services
  ADD COLUMN IF NOT EXISTS unavailable_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unavailable_reason VARCHAR(255);
