CREATE TABLE IF NOT EXISTS address_intelligence_cache (
  id BIGSERIAL PRIMARY KEY,
  normalized_address_key TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,
  source_url TEXT NOT NULL,
  address_full TEXT,
  street TEXT,
  street_number TEXT,
  postal_code TEXT,
  municipality TEXT,
  province TEXT,
  autonomous_community TEXT,
  lat NUMERIC(10,7),
  lng NUMERIC(10,7),
  building_year INTEGER,
  has_lift BOOLEAN,
  floors INTEGER,
  homes_count INTEGER,
  commercial_units_count INTEGER,
  plot_surface_m2 NUMERIC(10,2),
  construction_quality TEXT,
  valuation_min_price NUMERIC(12,2),
  valuation_max_price NUMERIC(12,2),
  units_json JSONB DEFAULT '[]'::jsonb,
  nearby_services_json JSONB DEFAULT '{}'::jsonb,
  raw_payload JSONB DEFAULT '{}'::jsonb,
  confidence_score NUMERIC(4,2),
  extracted_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_address_intelligence_cache_lookup
ON address_intelligence_cache(normalized_address_key, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_address_intelligence_cache_location
ON address_intelligence_cache(municipality, province, street, street_number);

CREATE INDEX IF NOT EXISTS idx_address_intelligence_cache_expiry
ON address_intelligence_cache(expires_at);
