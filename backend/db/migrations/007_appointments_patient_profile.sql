ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS patient_profile_id INT REFERENCES patients(id);

UPDATE appointments a
   SET patient_profile_id = p.id
  FROM patients p
 WHERE p.user_id = a.patient_id
   AND a.patient_profile_id IS NULL;

INSERT INTO patients (user_id, first_name, last_name, created_at)
SELECT DISTINCT u.id, u.first_name, u.last_name, u.created_at
  FROM appointments a
  JOIN users u ON u.id = a.patient_id
 WHERE a.patient_profile_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM patients p WHERE p.user_id = u.id);

UPDATE appointments a
   SET patient_profile_id = p.id
  FROM patients p
 WHERE p.user_id = a.patient_id
   AND a.patient_profile_id IS NULL;

CREATE OR REPLACE FUNCTION default_appointment_patient_profile() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.patient_profile_id IS NULL THEN
    SELECT id INTO NEW.patient_profile_id FROM patients WHERE user_id = NEW.patient_id;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_appointments_default_patient_profile ON appointments;
CREATE TRIGGER trg_appointments_default_patient_profile
  BEFORE INSERT ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION default_appointment_patient_profile();

ALTER TABLE appointments ALTER COLUMN patient_profile_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_appt_patient_profile
  ON appointments (patient_profile_id, starts_at);
