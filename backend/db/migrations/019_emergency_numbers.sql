CREATE TABLE IF NOT EXISTS emergency_numbers (
  id SERIAL PRIMARY KEY,
  label VARCHAR(120) NOT NULL,
  number VARCHAR(30) NOT NULL,
  province VARCHAR(80),
  source VARCHAR(255) NOT NULL,
  verified_at DATE NOT NULL,
  verified_by INT REFERENCES users(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT emergency_numbers_number_check CHECK (number ~ '^\+?[0-9][0-9 ]{1,19}$'),
  CONSTRAINT emergency_numbers_source_check CHECK (length(trim(source)) >= 3)
);

CREATE INDEX IF NOT EXISTS idx_emergency_numbers_active ON emergency_numbers (sort_order, id) WHERE active;
