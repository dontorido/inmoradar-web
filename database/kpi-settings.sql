CREATE TABLE IF NOT EXISTS kpi_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  schema_version INTEGER NOT NULL DEFAULT 1,
  settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS kpi_settings_updated_at_idx
ON kpi_settings (updated_at DESC);

ALTER TABLE kpi_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO kpi_settings (id, schema_version, settings_json)
VALUES ('default', 1, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE kpi_settings IS
'Configuracion administrable de reglas, pesos, umbrales y visibilidad de KPIs de InmoRadar.';
