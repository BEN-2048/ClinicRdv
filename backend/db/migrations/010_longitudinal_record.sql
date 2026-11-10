CREATE TABLE IF NOT EXISTS patient_allergies (
  id SERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES patients(id),
  facility_id INT REFERENCES facilities(id),
  substance VARCHAR(150) NOT NULL,
  reaction VARCHAR(500),
  severity VARCHAR(20) NOT NULL DEFAULT 'unknown',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  noted_on DATE,
  notes TEXT,
  source VARCHAR(20) NOT NULL,
  confidential BOOLEAN NOT NULL DEFAULT false,
  recorded_by INT REFERENCES users(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by INT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  entered_in_error BOOLEAN NOT NULL DEFAULT false,
  error_reason VARCHAR(255),
  CONSTRAINT patient_allergies_severity_check CHECK (severity IN ('mild', 'moderate', 'severe', 'unknown')),
  CONSTRAINT patient_allergies_status_check CHECK (status IN ('active', 'resolved')),
  CONSTRAINT patient_allergies_source_check CHECK (source IN ('clinician', 'patient')),
  CONSTRAINT patient_allergies_origin_check CHECK ((source = 'patient') = (facility_id IS NULL)),
  CONSTRAINT patient_allergies_error_check CHECK (NOT entered_in_error OR error_reason IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS patient_conditions (
  id SERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES patients(id),
  facility_id INT REFERENCES facilities(id),
  label VARCHAR(200) NOT NULL,
  icd10_code VARCHAR(10),
  onset_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  notes TEXT,
  source VARCHAR(20) NOT NULL DEFAULT 'clinician',
  confidential BOOLEAN NOT NULL DEFAULT false,
  recorded_by INT REFERENCES users(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by INT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  entered_in_error BOOLEAN NOT NULL DEFAULT false,
  error_reason VARCHAR(255),
  CONSTRAINT patient_conditions_status_check CHECK (status IN ('active', 'resolved')),
  CONSTRAINT patient_conditions_icd10_check CHECK (icd10_code IS NULL OR icd10_code ~ '^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$'),
  CONSTRAINT patient_conditions_source_check CHECK (source = 'clinician' AND facility_id IS NOT NULL),
  CONSTRAINT patient_conditions_error_check CHECK (NOT entered_in_error OR error_reason IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS patient_medications (
  id SERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES patients(id),
  facility_id INT REFERENCES facilities(id),
  name VARCHAR(200) NOT NULL,
  dosage VARCHAR(100),
  frequency VARCHAR(100),
  start_date DATE,
  end_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  notes TEXT,
  source VARCHAR(20) NOT NULL DEFAULT 'clinician',
  confidential BOOLEAN NOT NULL DEFAULT false,
  recorded_by INT REFERENCES users(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by INT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  entered_in_error BOOLEAN NOT NULL DEFAULT false,
  error_reason VARCHAR(255),
  CONSTRAINT patient_medications_status_check CHECK (status IN ('active', 'stopped')),
  CONSTRAINT patient_medications_dates_check CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
  CONSTRAINT patient_medications_source_check CHECK (source = 'clinician' AND facility_id IS NOT NULL),
  CONSTRAINT patient_medications_error_check CHECK (NOT entered_in_error OR error_reason IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS immunizations (
  id SERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES patients(id),
  facility_id INT REFERENCES facilities(id),
  vaccine VARCHAR(150) NOT NULL,
  dose_label VARCHAR(50),
  administered_on DATE NOT NULL,
  lot_number VARCHAR(50),
  notes TEXT,
  source VARCHAR(20) NOT NULL DEFAULT 'clinician',
  confidential BOOLEAN NOT NULL DEFAULT false,
  recorded_by INT REFERENCES users(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by INT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  entered_in_error BOOLEAN NOT NULL DEFAULT false,
  error_reason VARCHAR(255),
  CONSTRAINT immunizations_source_check CHECK (source = 'clinician' AND facility_id IS NOT NULL),
  CONSTRAINT immunizations_error_check CHECK (NOT entered_in_error OR error_reason IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_patient_allergies_patient ON patient_allergies (patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_conditions_patient ON patient_conditions (patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_medications_patient ON patient_medications (patient_id);
CREATE INDEX IF NOT EXISTS idx_immunizations_patient ON immunizations (patient_id);

CREATE TABLE IF NOT EXISTS record_revisions (
  id BIGSERIAL PRIMARY KEY,
  table_name VARCHAR(40) NOT NULL,
  row_id INT NOT NULL,
  previous JSONB NOT NULL,
  changed_by INT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_record_revisions_row ON record_revisions (table_name, row_id, changed_at DESC);

CREATE OR REPLACE FUNCTION keep_record_revision() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO record_revisions (table_name, row_id, previous, changed_by)
  VALUES (TG_TABLE_NAME, OLD.id, to_jsonb(OLD), NEW.updated_by);
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION forbid_record_delete() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Suppression interdite : marquer l''information comme saisie erronee'
    USING ERRCODE = 'P0001';
END
$$;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['patient_allergies', 'patient_conditions', 'patient_medications', 'immunizations'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_revision ON %I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_revision BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION keep_record_revision()', t, t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_no_delete ON %I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_no_delete BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION forbid_record_delete()', t, t);
  END LOOP;
END $$;

ALTER TABLE patient_access_logs
  ADD COLUMN IF NOT EXISTS resource VARCHAR(40),
  ADD COLUMN IF NOT EXISTS resource_id INT;
