ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS created_by_user_id INT REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS patient_guardians (
  id SERIAL PRIMARY KEY,
  guardian_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  patient_id INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  relationship VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  status_reason VARCHAR(255),
  reviewed_by INT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT patient_guardians_unique UNIQUE (guardian_user_id, patient_id),
  CONSTRAINT patient_guardians_relationship_check
    CHECK (relationship IN ('parent', 'legal_guardian')),
  CONSTRAINT patient_guardians_status_check
    CHECK (status IN ('pending', 'verified', 'rejected', 'revoked')),
  CONSTRAINT patient_guardians_review_check
    CHECK (status = 'pending' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_patient_guardians_guardian
  ON patient_guardians (guardian_user_id) WHERE status IN ('pending', 'verified');

CREATE INDEX IF NOT EXISTS idx_patient_guardians_pending
  ON patient_guardians (created_at) WHERE status = 'pending';
