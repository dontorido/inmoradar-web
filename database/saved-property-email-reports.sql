CREATE TABLE IF NOT EXISTS saved_property_email_reports (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  properties_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'failed')),
  provider TEXT NOT NULL DEFAULT 'cloudflare_email_service',
  provider_response_json JSONB,
  error_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS saved_property_email_reports_email_created_idx
ON saved_property_email_reports (email, created_at DESC);

CREATE INDEX IF NOT EXISTS saved_property_email_reports_status_idx
ON saved_property_email_reports (status, created_at DESC);

ALTER TABLE saved_property_email_reports ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE saved_property_email_reports IS
'Auditoria y rate-limit de informes Premium de inmuebles guardados enviados por email.';
