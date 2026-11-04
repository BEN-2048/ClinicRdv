-- ClinicRDV : schéma PostgreSQL (données fictives uniquement)
CREATE EXTENSION IF NOT EXISTS btree_gist;

DROP TABLE IF EXISTS notifications, waiting_list, consultation_notes, appointments,
  blocked_slots, leaves, working_hours, doctors, specialties, users CASCADE;
DROP TYPE IF EXISTS user_role, appt_status;

CREATE TYPE user_role AS ENUM ('patient', 'doctor', 'admin', 'secretary');
CREATE TYPE appt_status AS ENUM ('pending', 'confirmed', 'cancelled', 'done');

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  role user_role NOT NULL DEFAULT 'patient',
  first_name VARCHAR(80) NOT NULL,
  last_name VARCHAR(80) NOT NULL,
  phone VARCHAR(30),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE specialties (
  id SERIAL PRIMARY KEY,
  name VARCHAR(80) UNIQUE NOT NULL
);

CREATE TABLE doctors (
  id SERIAL PRIMARY KEY,
  user_id INT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  specialty_id INT NOT NULL REFERENCES specialties(id),
  bio TEXT,
  fee NUMERIC(10,2) DEFAULT 0,
  consultation_minutes INT NOT NULL DEFAULT 30 CHECK (consultation_minutes IN (15,30,45,60)),
  languages VARCHAR(100) DEFAULT 'fr',
  active BOOLEAN NOT NULL DEFAULT true
);

-- weekday : 0 = dimanche ... 6 = samedi
CREATE TABLE working_hours (
  id SERIAL PRIMARY KEY,
  doctor_id INT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  CHECK (end_time > start_time)
);

CREATE TABLE leaves (
  id SERIAL PRIMARY KEY,
  doctor_id INT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason VARCHAR(255),
  CHECK (end_date >= start_date)
);

CREATE TABLE blocked_slots (
  id SERIAL PRIMARY KEY,
  doctor_id INT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  reason VARCHAR(255),
  CHECK (ends_at > starts_at)
);

CREATE TABLE appointments (
  id SERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES users(id),
  doctor_id INT NOT NULL REFERENCES doctors(id),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status appt_status NOT NULL DEFAULT 'confirmed',
  reason VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  -- Anti double réservation : aucun chevauchement pour un même médecin
  CONSTRAINT no_double_booking EXCLUDE USING gist (
    doctor_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (status IN ('pending', 'confirmed'))
);
CREATE INDEX idx_appt_doctor_start ON appointments(doctor_id, starts_at);
CREATE INDEX idx_appt_patient ON appointments(patient_id, starts_at);

CREATE TABLE consultation_notes (
  id SERIAL PRIMARY KEY,
  appointment_id INT UNIQUE NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  notes TEXT,
  prescription TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE waiting_list (
  id SERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doctor_id INT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  desired_date DATE NOT NULL,
  notified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (patient_id, doctor_id, desired_date)
);

CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(150) NOT NULL,
  body VARCHAR(500),
  read BOOLEAN NOT NULL DEFAULT false,
  send_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
