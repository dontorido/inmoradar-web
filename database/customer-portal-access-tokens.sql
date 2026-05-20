CREATE TABLE IF NOT EXISTS customer_portal_access_tokens (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL DEFAULT 'customer_portal',
  request_ip_hash TEXT,
  user_agent TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_portal_access_tokens_email_idx
ON customer_portal_access_tokens (email, created_at DESC);

CREATE INDEX IF NOT EXISTS customer_portal_access_tokens_expires_idx
ON customer_portal_access_tokens (expires_at);

CREATE INDEX IF NOT EXISTS customer_portal_access_tokens_used_idx
ON customer_portal_access_tokens (used_at);

ALTER TABLE customer_portal_access_tokens ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE customer_portal_access_tokens IS
'Temporary one-use magic links for secure InmoRadar customer portal access. Tokens are stored only as SHA-256 hashes.';
