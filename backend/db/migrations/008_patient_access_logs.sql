CREATE TABLE IF NOT EXISTS patient_access_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  user_role VARCHAR(20) NOT NULL,
  patient_id INT NOT NULL REFERENCES patients(id),
  action VARCHAR(40) NOT NULL,
  granted BOOLEAN NOT NULL,
  basis VARCHAR(40),
  ip VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patient_access_logs_patient
  ON patient_access_logs (patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_patient_access_logs_user
  ON patient_access_logs (user_id, created_at DESC);
