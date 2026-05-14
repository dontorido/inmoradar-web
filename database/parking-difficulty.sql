CREATE TABLE IF NOT EXISTS parking_zones (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  city TEXT NOT NULL,
  zone_type TEXT,
  name TEXT,
  geometry_geojson JSONB,
  street_name TEXT,
  regulated_type TEXT,
  total_spaces INTEGER,
  resident_spaces INTEGER,
  rotation_spaces INTEGER,
  source_url TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  raw_payload JSONB
);

CREATE INDEX IF NOT EXISTS parking_zones_city_idx
ON parking_zones (city);

CREATE INDEX IF NOT EXISTS parking_zones_regulated_type_idx
ON parking_zones (regulated_type);

CREATE TABLE IF NOT EXISTS parking_difficulty_cache (
  id BIGSERIAL PRIMARY KEY,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  geohash TEXT NOT NULL,
  radius_m INTEGER NOT NULL DEFAULT 500,
  score INTEGER NOT NULL,
  label TEXT NOT NULL,
  confidence_score NUMERIC(4, 2) NOT NULL,
  signals_json JSONB NOT NULL,
  sources_json JSONB NOT NULL,
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS parking_difficulty_cache_geohash_idx
ON parking_difficulty_cache (geohash, radius_m, expires_at DESC);

CREATE INDEX IF NOT EXISTS parking_difficulty_cache_expires_at_idx
ON parking_difficulty_cache (expires_at);

COMMENT ON TABLE parking_zones IS
'Zonas municipales de aparcamiento regulado importadas desde datos abiertos o fuentes manuales auditables.';

COMMENT ON TABLE parking_difficulty_cache IS
'Cache persistente futura del Parking Difficulty Score. El MVP usa cache en memoria y esta tabla queda lista para Supabase/Postgres.';
