CREATE TABLE IF NOT EXISTS email_codes (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  purpose VARCHAR(20) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  attempts INT NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  expires_at TIMESTAMPTZ NOT NULL,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT email_codes_purpose_check CHECK (purpose IN ('recovery', 'email_change')),
  CONSTRAINT email_codes_unique UNIQUE (user_id, purpose)
);

CREATE INDEX IF NOT EXISTS idx_email_codes_email ON email_codes (lower(email), purpose);

ALTER TABLE auth_sessions DROP CONSTRAINT IF EXISTS auth_sessions_reason_check;
ALTER TABLE auth_sessions ADD CONSTRAINT auth_sessions_reason_check CHECK (revoke_reason IS NULL OR revoke_reason IN (
  'logout', 'logout_all', 'reuse', 'password_change', 'admin', 'device_revoked', 'password_reset', 'phone_change'));
