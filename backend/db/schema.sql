
-- ClinicRDV : schéma PostgreSQL
-- Données fictives uniquement

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ATTENTION :
-- Ces commandes suppriment toutes les anciennes tables et leurs données.
-- Ne pas exécuter ce fichier sur une base contenant des données à conserver.

DROP TABLE IF EXISTS notifications, waiting_list, consultation_notes, appointments,
  blocked_slots, leaves, working_hours, doctors, specialties, users CASCADE;

DROP TYPE IF EXISTS user_role, appt_status;

CREATE TYPE user_role AS ENUM ('patient', 'doctor', 'admin', 'secretary');
CREATE TYPE appt_status AS ENUM ('pending', 'confirmed', 'cancelled', 'done');


-- =========================================
-- 1. UTILISATEURS
-- =========================================

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


-- =========================================
-- 2. SPÉCIALITÉS
-- =========================================

CREATE TABLE specialties (
  id SERIAL PRIMARY KEY,
  name VARCHAR(80) UNIQUE NOT NULL
);


-- =========================================
-- 3. MÉDECINS
-- =========================================

CREATE TABLE doctors (
  id SERIAL PRIMARY KEY,
  user_id INT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  specialty_id INT NOT NULL REFERENCES specialties(id),
  bio TEXT,
  fee NUMERIC(10,2) DEFAULT 0,
  consultation_minutes INT NOT NULL DEFAULT 30
    CHECK (consultation_minutes IN (15,30,45,60)),
  languages VARCHAR(100) DEFAULT 'fr',
  active BOOLEAN NOT NULL DEFAULT true
);


-- =========================================
-- 4. HORAIRES DE TRAVAIL
-- weekday : 0 = dimanche ... 6 = samedi
-- =========================================

CREATE TABLE working_hours (
  id SERIAL PRIMARY KEY,
  doctor_id INT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  CHECK (end_time > start_time)
);


-- =========================================
-- 5. CONGÉS DES MÉDECINS
-- =========================================

CREATE TABLE leaves (
  id SERIAL PRIMARY KEY,
  doctor_id INT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason VARCHAR(255),
  CHECK (end_date >= start_date)
);


-- =========================================
-- 6. CRÉNEAUX BLOQUÉS
-- =========================================

CREATE TABLE blocked_slots (
  id SERIAL PRIMARY KEY,
  doctor_id INT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  reason VARCHAR(255),
  CHECK (ends_at > starts_at)
);


-- =========================================
-- 7. RENDEZ-VOUS
-- =========================================

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

  -- Anti double réservation :
  -- aucun chevauchement pour un même médecin
  CONSTRAINT no_double_booking EXCLUDE USING gist (
    doctor_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (status IN ('pending', 'confirmed'))
);

CREATE INDEX idx_appt_doctor_start
ON appointments(doctor_id, starts_at);

CREATE INDEX idx_appt_patient
ON appointments(patient_id, starts_at);


-- =========================================
-- 8. FICHES DE CONSULTATION ET EXAMENS CLINIQUES
-- =========================================

CREATE TABLE consultation_notes (
  id SERIAL PRIMARY KEY,

  appointment_id INT UNIQUE NOT NULL
    REFERENCES appointments(id) ON DELETE CASCADE,

  -- Motif et observations générales
  chief_complaint TEXT,
  notes TEXT,

  -- Constantes vitales
  blood_pressure VARCHAR(20),
  heart_rate NUMERIC(5,1),
  temperature NUMERIC(4,1),
  oxygen_saturation NUMERIC(5,2),
  weight NUMERIC(6,2),
  height NUMERIC(6,2),

  -- Informations médicales
  medical_history TEXT,
  current_treatments TEXT,

  -- Examen et diagnostic
  clinical_examination TEXT,
  diagnosis TEXT,

  -- Prescription médicale
  prescription TEXT,

  -- État de la fiche
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'completed')),

  -- Dates de suivi
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);


-- =========================================
-- 9. LISTE D'ATTENTE
-- =========================================

CREATE TABLE waiting_list (
  id SERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doctor_id INT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  desired_date DATE,
  notified BOOLEAN NOT NULL DEFAULT false,
  time_slots TEXT[] NOT NULL DEFAULT '{all_day}',
  weekdays SMALLINT[] NOT NULL DEFAULT '{1,2,3,4,5}',
  min_notice VARCHAR(8) NOT NULL DEFAULT '24h' CONSTRAINT waiting_list_min_notice_check CHECK (min_notice IN ('2h', '24h', 'any')),
  notify_push BOOLEAN NOT NULL DEFAULT true,
  notify_sms BOOLEAN NOT NULL DEFAULT true,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (patient_id, doctor_id, desired_date)
);
CREATE UNIQUE INDEX waiting_list_alert_unique ON waiting_list (patient_id, doctor_id) WHERE desired_date IS NULL;
CREATE INDEX idx_waiting_list_doctor_active ON waiting_list (doctor_id, created_at) WHERE active;


-- =========================================
-- 10. NOTIFICATIONS
-- =========================================

CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(150) NOT NULL,
  body VARCHAR(500),
  read BOOLEAN NOT NULL DEFAULT false,
  send_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
