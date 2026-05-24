CREATE TABLE IF NOT EXISTS seo_keyword_backlog (
  id BIGSERIAL PRIMARY KEY,
  keyword TEXT NOT NULL CHECK (char_length(btrim(keyword)) >= 3),
  intent TEXT NOT NULL DEFAULT 'analizar_anuncio_inmobiliario' CHECK (
    intent IN (
      'saber_si_piso_esta_caro',
      'precio_metro_cuadrado_vivienda',
      'analizar_anuncio_inmobiliario',
      'analizar_piso_antes_de_comprar',
      'comparar_pisos_online',
      'negociar_precio_vivienda',
      'preguntas_antes_de_contactar',
      'extension_chrome_inmobiliaria'
    )
  ),
  page_type TEXT NOT NULL DEFAULT 'editorial_guide' CHECK (
    page_type IN (
      'expensive_listing_city',
      'price_city',
      'editorial_guide',
      'chrome_extension_landing',
      'comparison_guide'
    )
  ),
  city TEXT NOT NULL DEFAULT '',
  province TEXT NOT NULL DEFAULT '',
  priority INTEGER NOT NULL DEFAULT 50 CHECK (priority >= 0 AND priority <= 100),
  manual_difficulty TEXT NOT NULL DEFAULT 'media' CHECK (manual_difficulty IN ('baja', 'media', 'alta')),
  status TEXT NOT NULL DEFAULT 'idea' CHECK (
    status IN (
      'idea',
      'brief_ready',
      'draft',
      'quality_review',
      'approved',
      'rejected',
      'published'
    )
  ),
  suggested_landing TEXT NOT NULL CHECK (suggested_landing LIKE '/%'),
  recommended_cta TEXT NOT NULL DEFAULT 'Analiza pisos antes de contactar',
  risk_level TEXT NOT NULL DEFAULT 'media' CHECK (risk_level IN ('baja', 'media', 'alta')),
  risk_notes TEXT NOT NULL DEFAULT '',
  brief_json JSONB,
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_seo_keyword_backlog_unique
ON seo_keyword_backlog (lower(keyword), suggested_landing);

CREATE INDEX IF NOT EXISTS idx_seo_keyword_backlog_queue
ON seo_keyword_backlog (status, priority DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_seo_keyword_backlog_intent
ON seo_keyword_backlog (intent, page_type);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_seo_keyword_backlog_updated_at ON seo_keyword_backlog;
CREATE TRIGGER set_seo_keyword_backlog_updated_at
BEFORE UPDATE ON seo_keyword_backlog
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
