CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_label VARCHAR(100),
  token_hash CHAR(64) NOT NULL,
  previous_token_hash CHAR(64),
  rotated_at TIMESTAMPTZ,
  created_ip VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  absolute_expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoke_reason VARCHAR(30),
  CONSTRAINT auth_sessions_token_hash_check CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT auth_sessions_expiry_check CHECK (expires_at <= absolute_expires_at),
  CONSTRAINT auth_sessions_revoke_check CHECK ((revoked_at IS NULL) = (revoke_reason IS NULL)),
  CONSTRAINT auth_sessions_reason_check CHECK (revoke_reason IS NULL OR revoke_reason IN (
    'logout', 'logout_all', 'reuse', 'password_change', 'admin', 'device_revoked'))
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_active
  ON auth_sessions (user_id) WHERE revoked_at IS NULL;
