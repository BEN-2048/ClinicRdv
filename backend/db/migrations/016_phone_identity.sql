ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone_e164 VARCHAR(16),
  ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pending_email VARCHAR(255);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_phone_e164_format') THEN
    ALTER TABLE users ADD CONSTRAINT users_phone_e164_format
      CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+[1-9][0-9]{7,14}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_login_identifier') THEN
    ALTER TABLE users ADD CONSTRAINT users_login_identifier
      CHECK (email IS NOT NULL OR phone_e164 IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_phone_verified_needs_phone') THEN
    ALTER TABLE users ADD CONSTRAINT users_phone_verified_needs_phone
      CHECK (phone_verified_at IS NULL OR phone_e164 IS NOT NULL);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS users_verified_phone_unique
  ON users (phone_e164) WHERE phone_verified_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_phone_e164 ON users (phone_e164);

CREATE TABLE IF NOT EXISTS phone_verifications (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone_e164 VARCHAR(16) NOT NULL,
  purpose VARCHAR(20) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  attempts INT NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  expires_at TIMESTAMPTZ NOT NULL,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT phone_verifications_purpose_check CHECK (purpose IN ('signup', 'recovery', 'phone_change')),
  CONSTRAINT phone_verifications_unique UNIQUE (user_id, purpose)
);

CREATE INDEX IF NOT EXISTS idx_phone_verifications_phone ON phone_verifications (phone_e164, purpose);

CREATE TABLE IF NOT EXISTS sms_outbox (
  id BIGSERIAL PRIMARY KEY,
  destination VARCHAR(16) NOT NULL,
  purpose VARCHAR(20) NOT NULL,
  driver VARCHAR(20) NOT NULL,
  status VARCHAR(10) NOT NULL,
  error VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sms_outbox_status_check CHECK (status IN ('sent', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_sms_outbox_destination ON sms_outbox (destination, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_outbox_created ON sms_outbox (created_at DESC);
