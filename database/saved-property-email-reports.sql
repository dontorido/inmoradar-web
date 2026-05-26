CREATE TABLE IF NOT EXISTS saved_property_email_reports (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  properties_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'failed')),
  provider TEXT NOT NULL DEFAULT 'cloudflare_email_service',
  provider_response_json JSONB,
  error_text TEXT,
  access_token_hash TEXT,
  access_token_expires_at TIMESTAMPTZ,
  report_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE saved_property_email_reports
ADD COLUMN IF NOT EXISTS access_token_hash TEXT;

ALTER TABLE saved_property_email_reports
ADD COLUMN IF NOT EXISTS access_token_expires_at TIMESTAMPTZ;

ALTER TABLE saved_property_email_reports
ADD COLUMN IF NOT EXISTS report_json JSONB;

CREATE INDEX IF NOT EXISTS saved_property_email_reports_email_created_idx
ON saved_property_email_reports (email, created_at DESC);

CREATE INDEX IF NOT EXISTS saved_property_email_reports_status_idx
ON saved_property_email_reports (status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS saved_property_email_reports_access_token_hash_idx
ON saved_property_email_reports (access_token_hash)
WHERE access_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS saved_property_email_reports_access_expires_idx
ON saved_property_email_reports (access_token_expires_at)
WHERE access_token_hash IS NOT NULL;

ALTER TABLE saved_property_email_reports ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE saved_property_email_reports IS
'Auditoria, rate-limit y enlaces privados temporales de informes Premium de inmuebles guardados enviados por email.';
