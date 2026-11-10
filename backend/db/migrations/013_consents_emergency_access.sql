CREATE TABLE IF NOT EXISTS record_consents (
  id SERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES patients(id),
  facility_id INT NOT NULL REFERENCES facilities(id),
  scope VARCHAR(20) NOT NULL,
  granted_by INT REFERENCES users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_by INT REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT record_consents_scope_check CHECK (scope IN ('summary', 'full')),
  CONSTRAINT record_consents_expiry_check CHECK (expires_at IS NULL OR expires_at > granted_at),
  CONSTRAINT record_consents_revoke_check CHECK ((revoked_at IS NULL) = (revoked_by IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS record_consents_one_open
  ON record_consents (patient_id, facility_id) WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_record_consents_patient
  ON record_consents (patient_id, granted_at DESC);

CREATE TABLE IF NOT EXISTS emergency_access_sessions (
  id SERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES patients(id),
  doctor_user_id INT NOT NULL REFERENCES users(id),
  facility_id INT NOT NULL REFERENCES facilities(id),
  reason TEXT NOT NULL CHECK (length(trim(reason)) >= 15),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT emergency_access_duration_check
    CHECK (expires_at > started_at AND expires_at <= started_at + interval '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_emergency_access_active
  ON emergency_access_sessions (patient_id, doctor_user_id, expires_at);

CREATE OR REPLACE FUNCTION guard_consent_update() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Un consentement revoque ne peut plus etre modifie' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.patient_id <> OLD.patient_id OR NEW.facility_id <> OLD.facility_id
     OR NEW.scope <> OLD.scope OR NEW.granted_at <> OLD.granted_at
     OR NEW.granted_by IS DISTINCT FROM OLD.granted_by
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    RAISE EXCEPTION 'Seule la revocation d''un consentement est possible' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_record_consents_guard ON record_consents;
CREATE TRIGGER trg_record_consents_guard
  BEFORE UPDATE ON record_consents
  FOR EACH ROW EXECUTE FUNCTION guard_consent_update();

DROP TRIGGER IF EXISTS trg_record_consents_no_delete ON record_consents;
CREATE TRIGGER trg_record_consents_no_delete
  BEFORE DELETE ON record_consents
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

DROP TRIGGER IF EXISTS trg_emergency_access_immutable ON emergency_access_sessions;
CREATE TRIGGER trg_emergency_access_immutable
  BEFORE UPDATE OR DELETE ON emergency_access_sessions
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
