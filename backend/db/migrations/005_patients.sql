CREATE SEQUENCE IF NOT EXISTS patient_number_seq START 1;

CREATE OR REPLACE FUNCTION next_patient_number() RETURNS TEXT
LANGUAGE sql VOLATILE AS $$
  SELECT 'CLRDV-P-' || lpad(n::text, GREATEST(6, length(n::text)), '0')
    FROM (SELECT nextval('patient_number_seq') AS n) s
$$;

CREATE TABLE IF NOT EXISTS patients (
  id SERIAL PRIMARY KEY,
  patient_number VARCHAR(20) NOT NULL DEFAULT next_patient_number(),
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  first_name VARCHAR(80) NOT NULL,
  last_name VARCHAR(80) NOT NULL,
  birth_date DATE,
  sex VARCHAR(10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT patients_patient_number_key UNIQUE (patient_number),
  CONSTRAINT patients_user_id_key UNIQUE (user_id),
  CONSTRAINT patients_patient_number_format CHECK (patient_number ~ '^CLRDV-P-[0-9]{6,}$'),
  CONSTRAINT patients_sex_check CHECK (sex IS NULL OR sex IN ('female', 'male')),
  CONSTRAINT patients_birth_date_check CHECK (birth_date IS NULL OR birth_date >= DATE '1900-01-01')
);

ALTER SEQUENCE patient_number_seq OWNED BY patients.patient_number;

CREATE INDEX IF NOT EXISTS idx_patients_identity
  ON patients (lower(last_name), lower(first_name), birth_date);

INSERT INTO patients (user_id, first_name, last_name, created_at)
SELECT u.id, u.first_name, u.last_name, u.created_at
  FROM users u
 WHERE u.role = 'patient'
   AND NOT EXISTS (SELECT 1 FROM patients p WHERE p.user_id = u.id)
 ORDER BY u.created_at, u.id;

CREATE OR REPLACE FUNCTION create_patient_for_user() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO patients (user_id, first_name, last_name)
  VALUES (NEW.id, NEW.first_name, NEW.last_name)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_users_create_patient ON users;
CREATE TRIGGER trg_users_create_patient
  AFTER INSERT ON users
  FOR EACH ROW
  WHEN (NEW.role = 'patient')
  EXECUTE FUNCTION create_patient_for_user();

CREATE OR REPLACE FUNCTION sync_patient_name_from_user() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE patients
     SET first_name = NEW.first_name,
         last_name = NEW.last_name,
         updated_at = now()
   WHERE user_id = NEW.id;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_users_sync_patient_name ON users;
CREATE TRIGGER trg_users_sync_patient_name
  AFTER UPDATE OF first_name, last_name ON users
  FOR EACH ROW
  WHEN (OLD.first_name IS DISTINCT FROM NEW.first_name
        OR OLD.last_name IS DISTINCT FROM NEW.last_name)
  EXECUTE FUNCTION sync_patient_name_from_user();
