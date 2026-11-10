CREATE TABLE IF NOT EXISTS medical_documents (
  id SERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES patients(id),
  facility_id INT REFERENCES facilities(id),
  appointment_id INT REFERENCES appointments(id),
  category VARCHAR(30) NOT NULL,
  title VARCHAR(150) NOT NULL,
  description VARCHAR(1000),
  document_date DATE,
  storage_driver VARCHAR(20) NOT NULL,
  storage_key VARCHAR(255) NOT NULL,
  mime_type VARCHAR(50) NOT NULL,
  size_bytes INT NOT NULL,
  sha256 CHAR(64) NOT NULL,
  source VARCHAR(20) NOT NULL,
  confidential BOOLEAN NOT NULL DEFAULT false,
  released_at TIMESTAMPTZ,
  uploaded_by INT REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by INT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  entered_in_error BOOLEAN NOT NULL DEFAULT false,
  error_reason VARCHAR(255),
  CONSTRAINT medical_documents_storage_key_unique UNIQUE (storage_key),
  CONSTRAINT medical_documents_category_check CHECK (category IN (
    'prescription', 'lab_result', 'imaging_report', 'medical_report',
    'certificate', 'vaccination_card', 'other')),
  CONSTRAINT medical_documents_mime_check CHECK (mime_type IN ('application/pdf', 'image/jpeg', 'image/png')),
  CONSTRAINT medical_documents_size_check CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  CONSTRAINT medical_documents_sha_check CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT medical_documents_source_check CHECK (source IN ('clinician', 'patient')),
  CONSTRAINT medical_documents_origin_check CHECK ((source = 'patient') = (facility_id IS NULL)),
  CONSTRAINT medical_documents_patient_release_check CHECK (source = 'clinician' OR released_at IS NOT NULL),
  CONSTRAINT medical_documents_error_check CHECK (NOT entered_in_error OR error_reason IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_medical_documents_patient
  ON medical_documents (patient_id, uploaded_at DESC);

DROP TRIGGER IF EXISTS trg_medical_documents_revision ON medical_documents;
CREATE TRIGGER trg_medical_documents_revision
  BEFORE UPDATE ON medical_documents
  FOR EACH ROW EXECUTE FUNCTION keep_record_revision();

DROP TRIGGER IF EXISTS trg_medical_documents_no_delete ON medical_documents;
CREATE TRIGGER trg_medical_documents_no_delete
  BEFORE DELETE ON medical_documents
  FOR EACH ROW EXECUTE FUNCTION forbid_record_delete();

CREATE OR REPLACE FUNCTION guard_document_storage() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.storage_key <> OLD.storage_key OR NEW.sha256 <> OLD.sha256
     OR NEW.size_bytes <> OLD.size_bytes OR NEW.mime_type <> OLD.mime_type
     OR NEW.patient_id <> OLD.patient_id OR NEW.source <> OLD.source
     OR NEW.facility_id IS DISTINCT FROM OLD.facility_id THEN
    RAISE EXCEPTION 'Le fichier et le patient d''un document ne peuvent pas etre modifies' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_medical_documents_guard ON medical_documents;
CREATE TRIGGER trg_medical_documents_guard
  BEFORE UPDATE ON medical_documents
  FOR EACH ROW EXECUTE FUNCTION guard_document_storage();
