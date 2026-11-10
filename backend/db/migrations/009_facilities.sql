CREATE SEQUENCE IF NOT EXISTS facility_code_seq START 1;

CREATE OR REPLACE FUNCTION next_facility_code() RETURNS TEXT
LANGUAGE sql VOLATILE AS $$
  SELECT 'CLRDV-E-' || lpad(n::text, GREATEST(4, length(n::text)), '0')
    FROM (SELECT nextval('facility_code_seq') AS n) s
$$;

CREATE TABLE IF NOT EXISTS facilities (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) NOT NULL DEFAULT next_facility_code(),
  name VARCHAR(150) NOT NULL,
  type VARCHAR(30) NOT NULL DEFAULT 'clinic',
  description TEXT,
  address VARCHAR(255),
  city VARCHAR(80),
  province VARCHAR(80),
  country CHAR(2) NOT NULL DEFAULT 'CD',
  latitude NUMERIC(9,6),
  longitude NUMERIC(9,6),
  phone VARCHAR(30),
  emergency_phone VARCHAR(30),
  email VARCHAR(255),
  timezone VARCHAR(40) NOT NULL DEFAULT 'Africa/Lubumbashi',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT facilities_code_key UNIQUE (code),
  CONSTRAINT facilities_code_format CHECK (code ~ '^CLRDV-E-[0-9]{4,}$'),
  CONSTRAINT facilities_type_check
    CHECK (type IN ('hospital', 'clinic', 'medical_center', 'health_center')),
  CONSTRAINT facilities_status_check
    CHECK (status IN ('pending', 'active', 'suspended')),
  CONSTRAINT facilities_timezone_check
    CHECK (timezone IN ('Africa/Kinshasa', 'Africa/Lubumbashi')),
  CONSTRAINT facilities_coordinates_check CHECK (
    (latitude IS NULL AND longitude IS NULL) OR
    (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
  )
);

ALTER SEQUENCE facility_code_seq OWNED BY facilities.code;

CREATE UNIQUE INDEX IF NOT EXISTS facilities_single_default
  ON facilities (is_default) WHERE is_default;

CREATE INDEX IF NOT EXISTS idx_facilities_city
  ON facilities (lower(city)) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS facility_opening_hours (
  id SERIAL PRIMARY KEY,
  facility_id INT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  opens_at TIME NOT NULL,
  closes_at TIME NOT NULL,
  CHECK (closes_at > opens_at)
);

CREATE TABLE IF NOT EXISTS health_services (
  code VARCHAR(30) PRIMARY KEY,
  name VARCHAR(80) NOT NULL
);

INSERT INTO health_services (code, name) VALUES
  ('emergency', 'Urgences'),
  ('consultation', 'Consultations'),
  ('laboratory', 'Laboratoire'),
  ('imaging', 'Imagerie médicale'),
  ('maternity', 'Maternité'),
  ('pediatrics', 'Pédiatrie'),
  ('surgery', 'Chirurgie'),
  ('hospitalization', 'Hospitalisation'),
  ('pharmacy', 'Pharmacie'),
  ('vaccination', 'Vaccination')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS facility_services (
  facility_id INT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  service_code VARCHAR(30) NOT NULL REFERENCES health_services(code),
  available_24h BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (facility_id, service_code)
);

CREATE TABLE IF NOT EXISTS facility_specialties (
  facility_id INT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  specialty_id INT NOT NULL REFERENCES specialties(id),
  PRIMARY KEY (facility_id, specialty_id)
);

CREATE TABLE IF NOT EXISTS facility_members (
  id SERIAL PRIMARY KEY,
  facility_id INT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT facility_members_unique UNIQUE (facility_id, user_id),
  CONSTRAINT facility_members_role_check CHECK (role IN ('facility_admin', 'secretary')),
  CONSTRAINT facility_members_status_check CHECK (status IN ('active', 'revoked'))
);

CREATE INDEX IF NOT EXISTS idx_facility_members_user
  ON facility_members (user_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS doctor_affiliations (
  id SERIAL PRIMARY KEY,
  doctor_id INT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  facility_id INT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  fee NUMERIC(10,2) CHECK (fee IS NULL OR fee >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT doctor_affiliations_unique UNIQUE (doctor_id, facility_id),
  CONSTRAINT doctor_affiliations_status_check CHECK (status IN ('active', 'inactive'))
);

CREATE INDEX IF NOT EXISTS idx_doctor_affiliations_facility
  ON doctor_affiliations (facility_id) WHERE status = 'active';

INSERT INTO facilities (name, type, city, province, timezone, status, is_default)
SELECT 'Établissement principal', 'clinic', 'Lubumbashi', 'Haut-Katanga',
       'Africa/Lubumbashi', 'active', true
 WHERE NOT EXISTS (SELECT 1 FROM facilities WHERE is_default);

INSERT INTO doctor_affiliations (doctor_id, facility_id)
SELECT d.id, f.id
  FROM doctors d
 CROSS JOIN facilities f
 WHERE f.is_default
ON CONFLICT (doctor_id, facility_id) DO NOTHING;

INSERT INTO facility_specialties (facility_id, specialty_id)
SELECT DISTINCT f.id, d.specialty_id
  FROM doctors d
 CROSS JOIN facilities f
 WHERE f.is_default
ON CONFLICT DO NOTHING;

INSERT INTO facility_services (facility_id, service_code)
SELECT f.id, 'consultation' FROM facilities f WHERE f.is_default
ON CONFLICT DO NOTHING;

INSERT INTO facility_members (facility_id, user_id, role)
SELECT f.id, u.id, 'secretary'
  FROM users u
 CROSS JOIN facilities f
 WHERE f.is_default AND u.role = 'secretary'
ON CONFLICT (facility_id, user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION default_doctor_facility() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  only_facility INT;
BEGIN
  IF NEW.facility_id IS NULL THEN
    SELECT min(facility_id) INTO only_facility
      FROM doctor_affiliations
     WHERE doctor_id = NEW.doctor_id AND status = 'active'
    HAVING count(*) = 1;
    NEW.facility_id := only_facility;
  END IF;
  RETURN NEW;
END
$$;

ALTER TABLE working_hours
  ADD COLUMN IF NOT EXISTS facility_id INT;

UPDATE working_hours w
   SET facility_id = f.id
  FROM facilities f
 WHERE f.is_default AND w.facility_id IS NULL;

ALTER TABLE working_hours ALTER COLUMN facility_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'working_hours_affiliation_fk') THEN
    ALTER TABLE working_hours
      ADD CONSTRAINT working_hours_affiliation_fk
      FOREIGN KEY (doctor_id, facility_id)
      REFERENCES doctor_affiliations (doctor_id, facility_id) ON DELETE CASCADE;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_working_hours_default_facility ON working_hours;
CREATE TRIGGER trg_working_hours_default_facility
  BEFORE INSERT ON working_hours
  FOR EACH ROW EXECUTE FUNCTION default_doctor_facility();

CREATE INDEX IF NOT EXISTS idx_working_hours_doctor_facility
  ON working_hours (doctor_id, facility_id, weekday);

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS facility_id INT;

UPDATE appointments a
   SET facility_id = f.id
  FROM facilities f
 WHERE f.is_default AND a.facility_id IS NULL;

ALTER TABLE appointments ALTER COLUMN facility_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_facility_fk') THEN
    ALTER TABLE appointments
      ADD CONSTRAINT appointments_facility_fk
      FOREIGN KEY (facility_id) REFERENCES facilities(id);
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_appointments_default_facility ON appointments;
CREATE TRIGGER trg_appointments_default_facility
  BEFORE INSERT ON appointments
  FOR EACH ROW EXECUTE FUNCTION default_doctor_facility();

CREATE INDEX IF NOT EXISTS idx_appt_facility_start
  ON appointments (facility_id, starts_at);
