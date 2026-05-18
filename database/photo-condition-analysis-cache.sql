CREATE TABLE IF NOT EXISTS photo_condition_analysis_cache (
  id BIGSERIAL PRIMARY KEY,
  listing_url_hash TEXT NOT NULL,
  image_urls_hash TEXT NOT NULL,
  portal TEXT,
  listing_url TEXT,
  source TEXT DEFAULT 'vision_model',
  access_level TEXT DEFAULT 'free',
  images_analyzed INTEGER,
  condition_label TEXT,
  condition_label_es TEXT,
  condition_score NUMERIC(5,2),
  renovation_probability TEXT,
  renovation_probability_es TEXT,
  renovation_type TEXT,
  renovation_type_es TEXT,
  estimated_scope_json JSONB,
  signals_json JSONB,
  confidence_score NUMERIC(4,2),
  price_interpretation_json JSONB,
  caveats_json JSONB,
  raw_response_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_photo_condition_cache_unique
ON photo_condition_analysis_cache(listing_url_hash, image_urls_hash);

CREATE INDEX IF NOT EXISTS idx_photo_condition_cache_expires
ON photo_condition_analysis_cache(expires_at);
