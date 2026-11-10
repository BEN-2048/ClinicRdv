CREATE TABLE IF NOT EXISTS prescriptions (
  id SERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES patients(id),
  appointment_id INT NOT NULL REFERENCES appointments(id),
  facility_id INT NOT NULL REFERENCES facilities(id),
  doctor_id INT NOT NULL REFERENCES doctors(id),
  prescriber_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  notes TEXT,
  confidential BOOLEAN NOT NULL DEFAULT false,
  issued_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by INT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT prescriptions_status_check CHECK (status IN ('draft', 'issued', 'cancelled')),
  CONSTRAINT prescriptions_issued_check CHECK (status = 'draft' OR issued_at IS NOT NULL OR status = 'cancelled'),
  CONSTRAINT prescriptions_cancel_check CHECK (status <> 'cancelled' OR (cancelled_at IS NOT NULL AND cancel_reason IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON prescriptions (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prescriptions_appointment ON prescriptions (appointment_id);

CREATE TABLE IF NOT EXISTS prescription_items (
  id SERIAL PRIMARY KEY,
  prescription_id INT NOT NULL REFERENCES prescriptions(id),
  position SMALLINT NOT NULL,
  medication_name VARCHAR(200) NOT NULL,
  dosage VARCHAR(100),
  route VARCHAR(50),
  frequency VARCHAR(100),
  duration VARCHAR(100),
  quantity VARCHAR(50),
  instructions VARCHAR(500),
  CONSTRAINT prescription_items_position_unique UNIQUE (prescription_id, position)
);

ALTER TABLE patient_medications
  ADD COLUMN IF NOT EXISTS prescription_item_id INT REFERENCES prescription_items(id);

CREATE TABLE IF NOT EXISTS consultation_addenda (
  id SERIAL PRIMARY KEY,
  appointment_id INT NOT NULL REFERENCES appointments(id),
  author_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  content TEXT NOT NULL CHECK (length(trim(content)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consultation_addenda_appointment ON consultation_addenda (appointment_id, created_at);

CREATE OR REPLACE FUNCTION guard_issued_prescription() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'draft' THEN
    IF NEW.status = 'cancelled' AND OLD.status = 'issued'
       AND NEW.patient_id = OLD.patient_id AND NEW.appointment_id = OLD.appointment_id
       AND NEW.notes IS NOT DISTINCT FROM OLD.notes AND NEW.issued_at = OLD.issued_at THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'Une ordonnance emise ou annulee ne peut plus etre modifiee' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  INSERT INTO record_revisions (table_name, row_id, previous, changed_by)
  VALUES (TG_TABLE_NAME, OLD.id, to_jsonb(OLD), NEW.updated_by);
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION guard_prescription_items() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  current_status TEXT;
BEGIN
  SELECT status INTO current_status FROM prescriptions
   WHERE id = COALESCE(NEW.prescription_id, OLD.prescription_id);
  IF current_status <> 'draft' THEN
    RAISE EXCEPTION 'Les lignes d''une ordonnance emise ne peuvent plus etre modifiees' USING ERRCODE = 'P0001';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$$;

CREATE OR REPLACE FUNCTION forbid_change() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Modification interdite sur %', TG_TABLE_NAME USING ERRCODE = 'P0001';
END
$$;

DROP TRIGGER IF EXISTS trg_prescriptions_guard ON prescriptions;
CREATE TRIGGER trg_prescriptions_guard
  BEFORE UPDATE ON prescriptions
  FOR EACH ROW EXECUTE FUNCTION guard_issued_prescription();

DROP TRIGGER IF EXISTS trg_prescriptions_no_delete ON prescriptions;
CREATE TRIGGER trg_prescriptions_no_delete
  BEFORE DELETE ON prescriptions
  FOR EACH ROW EXECUTE FUNCTION forbid_record_delete();

DROP TRIGGER IF EXISTS trg_prescription_items_guard ON prescription_items;
CREATE TRIGGER trg_prescription_items_guard
  BEFORE INSERT OR UPDATE OR DELETE ON prescription_items
  FOR EACH ROW EXECUTE FUNCTION guard_prescription_items();

DROP TRIGGER IF EXISTS trg_consultation_addenda_immutable ON consultation_addenda;
CREATE TRIGGER trg_consultation_addenda_immutable
  BEFORE UPDATE OR DELETE ON consultation_addenda
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
