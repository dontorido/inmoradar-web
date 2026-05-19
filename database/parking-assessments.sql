CREATE TABLE IF NOT EXISTS parking_assessments (
  id BIGSERIAL PRIMARY KEY,
  saved_listing_id BIGINT,
  source_url TEXT,
  address_text TEXT,
  street TEXT,
  street_number TEXT,
  zone_name TEXT,
  district TEXT,
  municipality TEXT,
  province TEXT,
  lat NUMERIC,
  lng NUMERIC,
  exact_location BOOLEAN DEFAULT false,
  profile TEXT DEFAULT 'general',
  overall_score NUMERIC(4,2),
  overall_label TEXT,
  overall_message TEXT,
  confidence_score NUMERIC(4,2),
  confidence_label TEXT,
  garage_json JSONB,
  street_parking_json JSONB,
  resident_parking_json JSONB,
  paid_parking_json JSONB,
  transport_offset_json JSONB,
  recommendations_json JSONB,
  sources_json JSONB,
  raw_signals_json JSONB,
  admin_override_json JSONB,
  admin_notes TEXT,
  status TEXT DEFAULT 'pending',
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parking_assessments_listing
ON parking_assessments(saved_listing_id);

CREATE INDEX IF NOT EXISTS idx_parking_assessments_location
ON parking_assessments(municipality, district, zone_name);

CREATE INDEX IF NOT EXISTS idx_parking_assessments_status
ON parking_assessments(status);

CREATE INDEX IF NOT EXISTS idx_parking_assessments_last_checked
ON parking_assessments(last_checked_at DESC);

ALTER TABLE saved_listings
  ADD COLUMN IF NOT EXISTS parking_assessment_json JSONB,
  ADD COLUMN IF NOT EXISTS parking_score NUMERIC(4,2),
  ADD COLUMN IF NOT EXISTS parking_label TEXT,
  ADD COLUMN IF NOT EXISTS parking_confidence_score NUMERIC(4,2),
  ADD COLUMN IF NOT EXISTS parking_last_checked_at TIMESTAMPTZ;
