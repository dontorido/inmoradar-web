CREATE TABLE IF NOT EXISTS market_price_sources (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('sale', 'rent')),
  country TEXT DEFAULT 'ES',
  autonomous_community TEXT,
  province TEXT,
  municipality TEXT,
  district TEXT,
  neighbourhood TEXT,
  zone_name TEXT,
  geo_level TEXT NOT NULL,
  geo_id TEXT,
  ine_municipality_code TEXT,
  ine_district_code TEXT,
  ine_section_code TEXT,
  price_eur_m2 NUMERIC(10,2),
  evolution_month_pct NUMERIC(8,2),
  evolution_quarter_pct NUMERIC(8,2),
  evolution_year_pct NUMERIC(8,2),
  historic_max_price_eur_m2 NUMERIC(10,2),
  historic_max_period TEXT,
  variation_from_historic_max_pct NUMERIC(8,2),
  period_label TEXT,
  period_date DATE,
  source_url TEXT NOT NULL,
  sample_size INTEGER,
  confidence_score NUMERIC(4,2),
  raw_payload JSONB,
  extracted_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP INDEX IF EXISTS idx_market_price_unique_source_url_period;

CREATE UNIQUE INDEX IF NOT EXISTS idx_market_price_unique_source_operation_url_period
ON market_price_sources(
  source,
  operation,
  source_url,
  period_date,
  COALESCE(zone_name, ''),
  COALESCE(district, ''),
  COALESCE(municipality, '')
);

CREATE INDEX IF NOT EXISTS idx_market_price_lookup
ON market_price_sources(operation, municipality, province, autonomous_community, geo_level);

CREATE INDEX IF NOT EXISTS idx_market_price_lookup_zone
ON market_price_sources(operation, municipality, district, zone_name, geo_level);

CREATE INDEX IF NOT EXISTS idx_market_price_lookup_neighbourhood
ON market_price_sources(operation, municipality, district, neighbourhood, geo_level);

CREATE INDEX IF NOT EXISTS idx_market_price_lookup_municipality
ON market_price_sources(operation, municipality, province, autonomous_community, geo_level);

CREATE INDEX IF NOT EXISTS idx_market_price_source_url
ON market_price_sources(source_url);

CREATE INDEX IF NOT EXISTS idx_market_price_ine_section
ON market_price_sources(operation, ine_section_code);

CREATE INDEX IF NOT EXISTS idx_market_price_period
ON market_price_sources(period_date DESC);

INSERT INTO market_price_sources (
  source,
  operation,
  country,
  autonomous_community,
  province,
  municipality,
  district,
  neighbourhood,
  zone_name,
  geo_level,
  price_eur_m2,
  evolution_month_pct,
  evolution_quarter_pct,
  evolution_year_pct,
  historic_max_price_eur_m2,
  historic_max_period,
  variation_from_historic_max_pct,
  period_label,
  period_date,
  source_url,
  confidence_score,
  raw_payload
) VALUES (
  'idealista_public_report',
  'sale',
  'ES',
  'Madrid Comunidad',
  'Madrid',
  'Madrid',
  'Puente de Vallecas',
  'Portazgo',
  'Portazgo',
  'neighbourhood',
  3290,
  -3.0,
  -0.1,
  27.3,
  3392,
  'mar 2026',
  -3.0,
  'abril 2026',
  '2026-04-01',
  'https://www.idealista.com/sala-de-prensa/informes-precio-vivienda/venta/madrid-comunidad/madrid-provincia/madrid/puente-de-vallecas/',
  0.82,
  '{"note":"idealista_public_report is used as experimental/prototype aggregated public market reference. Review licensing before intensive commercial use."}'::jsonb
)
ON CONFLICT DO NOTHING;

INSERT INTO market_price_sources (
  source,
  operation,
  country,
  autonomous_community,
  province,
  municipality,
  district,
  geo_level,
  price_eur_m2,
  period_label,
  period_date,
  source_url,
  confidence_score,
  raw_payload
) VALUES (
  'idealista_public_report',
  'sale',
  'ES',
  'Madrid Comunidad',
  'Madrid',
  'Madrid',
  'Puente de Vallecas',
  'district',
  3325,
  'abril 2026',
  '2026-04-01',
  'https://www.idealista.com/sala-de-prensa/informes-precio-vivienda/venta/madrid-comunidad/madrid-provincia/madrid/puente-de-vallecas/',
  0.78,
  '{"note":"idealista_public_report is used as experimental/prototype aggregated public market reference. Review licensing before intensive commercial use."}'::jsonb
)
ON CONFLICT DO NOTHING;

INSERT INTO market_price_sources (
  source,
  operation,
  country,
  autonomous_community,
  province,
  municipality,
  neighbourhood,
  zone_name,
  geo_level,
  price_eur_m2,
  evolution_month_pct,
  evolution_year_pct,
  period_label,
  period_date,
  source_url,
  confidence_score,
  raw_payload
) VALUES (
  'idealista_public_report',
  'sale',
  'ES',
  'La Rioja',
  'La Rioja',
  'Logrono',
  'Casco Antiguo',
  'Casco Antiguo',
  'neighbourhood',
  1885,
  -4.6,
  13.8,
  'abril 2026',
  '2026-04-01',
  'https://www.idealista.com/sala-de-prensa/informes-precio-vivienda/venta/la-rioja/la-rioja/logrono/casco-antiguo/',
  0.80,
  '{"note":"Idealista Public Reports es una fuente experimental/prototipo; revisar licencia antes de uso comercial intensivo."}'::jsonb
) ON CONFLICT DO NOTHING;

