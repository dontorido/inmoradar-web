CREATE TABLE IF NOT EXISTS seo_landing_opportunities (
  id BIGSERIAL PRIMARY KEY,
  keyword TEXT NOT NULL,
  city TEXT NOT NULL,
  province TEXT,
  autonomous_community TEXT,
  intent TEXT NOT NULL DEFAULT 'informational',
  template_type TEXT NOT NULL,
  search_priority INTEGER NOT NULL DEFAULT 0,
  data_available BOOLEAN NOT NULL DEFAULT FALSE,
  quality_score NUMERIC(5,2),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN (
      'pending',
      'generating',
      'draft',
      'needs_review',
      'ready_to_publish',
      'published',
      'noindex',
      'archived'
    )
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS seo_landings (
  id BIGSERIAL PRIMARY KEY,
  opportunity_id BIGINT REFERENCES seo_landing_opportunities(id) ON DELETE SET NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  meta_title TEXT NOT NULL,
  meta_description TEXT NOT NULL,
  h1 TEXT NOT NULL,
  body_html TEXT NOT NULL,
  city TEXT NOT NULL,
  province TEXT,
  autonomous_community TEXT,
  template_type TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  index_status TEXT NOT NULL DEFAULT 'noindex' CHECK (index_status IN ('index', 'noindex')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN (
      'pending',
      'generating',
      'draft',
      'needs_review',
      'ready_to_publish',
      'published',
      'noindex',
      'archived'
    )
  ),
  quality_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  word_count INTEGER NOT NULL DEFAULT 0,
  source_data_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_at TIMESTAMPTZ,
  last_generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_seo_landing_opportunities_unique
ON seo_landing_opportunities(keyword, city, template_type);

CREATE INDEX IF NOT EXISTS idx_seo_landing_opportunities_queue
ON seo_landing_opportunities(status, template_type, search_priority DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_seo_landings_slug
ON seo_landings(slug);

CREATE UNIQUE INDEX IF NOT EXISTS idx_seo_landings_title
ON seo_landings(title);

CREATE UNIQUE INDEX IF NOT EXISTS idx_seo_landings_meta_title
ON seo_landings(meta_title);

CREATE UNIQUE INDEX IF NOT EXISTS idx_seo_landings_h1
ON seo_landings(h1);

CREATE INDEX IF NOT EXISTS idx_seo_landings_sitemap
ON seo_landings(index_status, status, published_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_seo_landing_opportunities_updated_at ON seo_landing_opportunities;
CREATE TRIGGER set_seo_landing_opportunities_updated_at
BEFORE UPDATE ON seo_landing_opportunities
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_seo_landings_updated_at ON seo_landings;
CREATE TRIGGER set_seo_landings_updated_at
BEFORE UPDATE ON seo_landings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO seo_landing_opportunities (
  keyword,
  city,
  province,
  autonomous_community,
  intent,
  template_type,
  search_priority,
  data_available,
  status
) VALUES
  (
    'precio metro cuadrado Madrid',
    'Madrid',
    'Madrid',
    'Comunidad de Madrid',
    'informational',
    'price_city',
    100,
    FALSE,
    'pending'
  ),
  (
    'precio metro cuadrado Barcelona',
    'Barcelona',
    'Barcelona',
    'Cataluña',
    'informational',
    'price_city',
    95,
    FALSE,
    'pending'
  ),
  (
    'precio metro cuadrado Valencia',
    'Valencia',
    'Valencia',
    'Comunidad Valenciana',
    'informational',
    'price_city',
    90,
    FALSE,
    'pending'
  ),
  (
    'precio metro cuadrado Logroño',
    'Logroño',
    'La Rioja',
    'La Rioja',
    'informational',
    'price_city',
    85,
    FALSE,
    'pending'
  ),
  (
    'precio metro cuadrado Málaga',
    'Málaga',
    'Málaga',
    'Andalucía',
    'informational',
    'price_city',
    80,
    FALSE,
    'pending'
  )
ON CONFLICT (keyword, city, template_type) DO UPDATE SET
  province = EXCLUDED.province,
  autonomous_community = EXCLUDED.autonomous_community,
  intent = EXCLUDED.intent,
  search_priority = EXCLUDED.search_priority,
  updated_at = NOW();
