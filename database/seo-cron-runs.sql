CREATE TABLE IF NOT EXISTS seo_cron_runs (
  id BIGSERIAL PRIMARY KEY,
  run_key TEXT NOT NULL UNIQUE,
  job_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed', 'skipped')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  result_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_seo_cron_runs_job_started
  ON seo_cron_runs(job_name, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_seo_cron_runs_status
  ON seo_cron_runs(status, started_at DESC);
