const { handleCors, hasSupabaseConfig, json, supabaseFetch } = require("./_utils");
const { calculateParkingDifficulty } = require("./_parking/calculateParkingDifficulty");
const {
  DEFAULT_TTL_MS,
  getCachedParkingDifficulty,
  parkingCacheKey,
  parkingGeohash,
  setCachedParkingDifficulty
} = require("./_parking/cache");
const { getMunicipalParkingSignals } = require("./_parking/municipalAdapters");
const {
  buildParkingExplanation,
  buildParkingSignals,
  confidenceFromSignals,
  normalizePerspective
} = require("./_parking/parkingSignals");
const { fetchOverpassParking, mockOverpassParkingResponse } = require("./_parking/overpassClient");
const { parseOverpassParkingSignals } = require("./_parking/parseOverpassParkingSignals");

const DEFAULT_RADIUS_M = 500;
const NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/search";
const PHOTON_ENDPOINT = "https://photon.komoot.io/api/";
const PARKING_DISCLAIMER =
  "Estimaci\u00f3n orientativa. La dificultad real puede variar seg\u00fan hora, d\u00eda, eventos y disponibilidad puntual.";

function parseCoordinate(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number.parseFloat(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRadius(value) {
  const parsed = Number.parseInt(String(value || DEFAULT_RADIUS_M), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_RADIUS_M;
  return Math.max(100, Math.min(1500, parsed));
}

function parseRequestedAt(value) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function validateRequest(query) {
  const lat = parseCoordinate(query.get("lat"));
  const lng = parseCoordinate(query.get("lng") || query.get("lon"));
  const address = String(query.get("address") || "").trim();
  const perspective = normalizePerspective(String(query.get("perspective") || "visitor"));
  const requestedAt = parseRequestedAt(query.get("at") || query.get("datetime"));
  if (lat === null || lng === null) {
    if (!address) return { ok: false, status: 400, error: "lat_lng_or_address_required" };
    return {
      ok: true,
      lat: null,
      lng: null,
      address,
      city: String(query.get("city") || "").trim(),
      radiusM: parseRadius(query.get("radius_m")),
      perspective,
      requestedAt,
      useMock: query.get("mock") === "1" || query.get("mock") === "true"
    };
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { ok: false, status: 400, error: "invalid_lat_lng" };
  }
  return {
    ok: true,
    lat,
    lng,
    address,
    city: String(query.get("city") || "").trim(),
    radiusM: parseRadius(query.get("radius_m")),
    perspective,
    requestedAt,
    useMock: query.get("mock") === "1" || query.get("mock") === "true"
  };
}

function withTimeout(ms = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    done: () => clearTimeout(timer)
  };
}

function normalizeAddressCandidate(address, city) {
  const raw = [address, city].filter(Boolean).join(", ");
  return raw
    .replace(/\s+/g, " ")
    .replace(/,+/g, ",")
    .replace(/^,|,$/g, "")
    .trim();
}

function buildAddressCandidates(address, city) {
  const candidates = new Set();
  const add = (value) => {
    const cleaned = normalizeAddressCandidate(value, "");
    if (cleaned.length >= 3) candidates.add(cleaned);
  };

  add(address);
  if (city && !String(address).toLowerCase().includes(String(city).toLowerCase())) add(`${address}, ${city}`);
  if (!/\bEspa(?:ñ|n)a\b/i.test(address)) add(`${address}, España`);
  if (city) add(`${address}, ${city}, España`);
  return [...candidates].slice(0, 6);
}

async function geocodeWithNominatim(candidate) {
  const url = new URL(NOMINATIM_ENDPOINT);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "es");
  url.searchParams.set("q", candidate);
  const timeout = withTimeout();
  try {
    const response = await fetch(url, {
      signal: timeout.signal,
      headers: { "user-agent": "InmoRadar/parking-difficulty" }
    });
    if (!response.ok) return null;
    const results = await response.json();
    const first = results?.[0];
    if (!first?.lat || !first?.lon) return null;
    return {
      lat: Number(first.lat),
      lng: Number(first.lon),
      precision: first.type || first.class || "unknown",
      provider: "Nominatim/OpenStreetMap",
      queryUsed: candidate
    };
  } finally {
    timeout.done();
  }
}

async function geocodeWithPhoton(candidate) {
  const url = new URL(PHOTON_ENDPOINT);
  url.searchParams.set("q", candidate.replace(/\bEspa(?:ñ|n)a\b/gi, "").replace(/,+/g, " "));
  url.searchParams.set("limit", "1");
  url.searchParams.set("lang", "es");
  const timeout = withTimeout();
  try {
    const response = await fetch(url, { signal: timeout.signal });
    if (!response.ok) return null;
    const payload = await response.json();
    const feature = payload?.features?.[0];
    const coordinates = feature?.geometry?.coordinates;
    if (!coordinates) return null;
    return {
      lat: Number(coordinates[1]),
      lng: Number(coordinates[0]),
      precision: feature.properties?.osm_key || "unknown",
      provider: "Photon/OpenStreetMap",
      queryUsed: candidate
    };
  } finally {
    timeout.done();
  }
}

async function geocodeAddress(address, city) {
  for (const candidate of buildAddressCandidates(address, city)) {
    const nominatim = await geocodeWithNominatim(candidate).catch(() => null);
    if (nominatim?.lat && nominatim?.lng) return nominatim;
    const photon = await geocodeWithPhoton(candidate).catch(() => null);
    if (photon?.lat && photon?.lng) return photon;
  }
  return null;
}

function sourceList({ overpassOk, usedMock, municipalSignals }) {
  const sources = [];
  if (usedMock) {
    sources.push({ name: "InmoRadar mock Overpass response", type: "mock" });
  } else if (overpassOk) {
    sources.push({
      name: "OpenStreetMap / Overpass API",
      url: "https://www.openstreetmap.org/",
      type: "osm"
    });
  }

  for (const source of municipalSignals?.sources || []) {
    sources.push(source);
  }

  if (!sources.length) {
    sources.push({ name: "Heurística urbana InmoRadar", type: "manual" });
  }

  return sources;
}

function cacheTtlMsForSources(sources) {
  const hasOsm = sources.some((source) => source.type === "osm" || source.type === "mock");
  const hasMunicipal = sources.some((source) => source.type === "municipal_open_data");
  if (hasMunicipal && !hasOsm) return 30 * 24 * 60 * 60 * 1000;
  return DEFAULT_TTL_MS;
}

function cachedPayloadFromRow(row) {
  const signals = row.signals_json || {};
  const perspective = normalizePerspective(row.perspective || signals.perspective);
  return {
    ok: true,
    score: Number(row.score),
    label: row.label,
    confidence_score: Number(row.confidence_score),
    radius_m: Number(row.radius_m || DEFAULT_RADIUS_M),
    perspective,
    signals,
    explanation: buildParkingExplanation({ signals, overpassOk: true, perspective }),
    sources: Array.isArray(row.sources_json) ? row.sources_json : [],
    disclaimer: PARKING_DISCLAIMER,
    meta: {
      lat: row.lat,
      lng: row.lng,
      city: row.city || null,
      persistent_cache: true,
      calculated_at: row.calculated_at
    },
    cache: {
      hit: true,
      layer: "supabase",
      geohash: row.geohash,
      expires_at: row.expires_at
    }
  };
}

async function getPersistentParkingDifficulty({ lat, lng, radiusM, perspective }) {
  if (!hasSupabaseConfig()) return null;
  const geohash = parkingGeohash({ lat, lng });
  const params = new URLSearchParams({
    select:
      "id,geohash,lat,lng,city,radius_m,perspective,score,label,confidence_score,signals_json,sources_json,calculated_at,expires_at",
    geohash: `eq.${geohash}`,
    radius_m: `eq.${radiusM}`,
    perspective: `eq.${normalizePerspective(perspective)}`,
    expires_at: `gt.${new Date().toISOString()}`,
    order: "calculated_at.desc",
    limit: "1"
  });
  try {
    const rows = await supabaseFetch(`parking_difficulty_cache?${params.toString()}`, { timeoutMs: 2500 });
    const row = Array.isArray(rows) ? rows[0] || null : null;
    return row ? cachedPayloadFromRow(row) : null;
  } catch (error) {
    return null;
  }
}

async function setPersistentParkingDifficulty({ lat, lng, city, radiusM, perspective, payload, ttlMs }) {
  if (!hasSupabaseConfig()) return false;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
  const row = {
    geohash: parkingGeohash({ lat, lng }),
    lat,
    lng,
    city: city || null,
    radius_m: radiusM,
    perspective: normalizePerspective(perspective),
    score: payload.score,
    label: payload.label,
    confidence_score: payload.confidence_score,
    signals_json: payload.signals || {},
    sources_json: payload.sources || [],
    calculated_at: now.toISOString(),
    expires_at: expiresAt
  };

  try {
    await supabaseFetch("parking_difficulty_cache?on_conflict=geohash,radius_m,perspective", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify([row]),
      timeoutMs: 2500
    });
    return true;
  } catch (error) {
    return false;
  }
}

async function buildParkingDifficultyResponse({ lat, lng, city, radiusM, perspective, requestedAt, useMock }) {
  let overpassPayload = null;
  let overpassOk = false;
  let overpassError = null;
  let usedMock = false;

  try {
    overpassPayload = useMock ? mockOverpassParkingResponse() : await fetchOverpassParking({ lat, lng, radiusM });
    overpassOk = true;
    usedMock = Boolean(useMock);
  } catch (error) {
    overpassError = error?.message || "overpass_failed";
    overpassPayload = { elements: [] };
  }

  const osmSummary = parseOverpassParkingSignals(overpassPayload);
  const municipalSignals = await getMunicipalParkingSignals({ city, lat, lng });
  const signals = buildParkingSignals({ osmSummary, municipalSignals, city, perspective, requestedAt });
  const scoring = calculateParkingDifficulty(signals);
  const confidenceScore = confidenceFromSignals({ signals, osmSummary, municipalSignals, usedMock, overpassOk });
  const sources = sourceList({ overpassOk, usedMock, municipalSignals });

  return {
    ok: true,
    score: scoring.score,
    label: scoring.label,
    confidence_score: confidenceScore,
    radius_m: radiusM,
    perspective: normalizePerspective(perspective),
    signals,
    explanation: buildParkingExplanation({ signals, overpassOk, perspective }),
    sources,
    disclaimer: PARKING_DISCLAIMER,
    meta: {
      lat,
      lng,
      city: city || null,
      raw_score: scoring.raw_score,
      osm_relevant_elements: osmSummary.relevantElements,
      overpass_status: overpassOk ? "ok" : "failed",
      overpass_error: overpassOk ? null : overpassError,
      requested_at: requestedAt || null,
      ttl_ms: cacheTtlMsForSources(sources)
    },
    cache: {
      hit: false
    }
  };
}

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== "GET") {
    return json(res, 405, { ok: false, error: "method_not_allowed" });
  }

  const url = new URL(req.url, `https://${req.headers.host || "www.inmoradar.app"}`);
  const validation = validateRequest(url.searchParams);
  if (!validation.ok) {
    return json(res, validation.status, { ok: false, error: validation.error });
  }

  let geocodedLocation = null;
  if ((validation.lat === null || validation.lng === null) && validation.address) {
    geocodedLocation = await geocodeAddress(validation.address, validation.city);
    if (!geocodedLocation) {
      return json(res, 422, {
        ok: false,
        error: "geocoding_failed",
        message: "No se pudo localizar la dirección indicada."
      });
    }
    validation.lat = geocodedLocation.lat;
    validation.lng = geocodedLocation.lng;
  }

  const cacheKey = parkingCacheKey({
    lat: validation.lat,
    lng: validation.lng,
    city: validation.city,
    radiusM: validation.radiusM,
    perspective: validation.perspective
  });

  if (!validation.useMock) {
    const cached = getCachedParkingDifficulty(cacheKey);
    if (cached) return json(res, 200, cached);
    const persistentCached = await getPersistentParkingDifficulty(validation);
    if (persistentCached) {
      setCachedParkingDifficulty(cacheKey, persistentCached);
      if (geocodedLocation) {
        persistentCached.location = geocodedLocation;
        persistentCached.meta.address = validation.address;
      }
      return json(res, 200, persistentCached);
    }
  }

  try {
    const payload = await buildParkingDifficultyResponse(validation);
    if (geocodedLocation) {
      payload.location = geocodedLocation;
      payload.meta.address = validation.address;
    }
    if (!validation.useMock) {
      const ttlMs = payload.meta?.ttl_ms || DEFAULT_TTL_MS;
      setCachedParkingDifficulty(cacheKey, payload, ttlMs);
      await setPersistentParkingDifficulty({
        lat: validation.lat,
        lng: validation.lng,
        city: validation.city,
        radiusM: validation.radiusM,
        perspective: validation.perspective,
        payload,
        ttlMs
      });
    }
    return json(res, 200, payload);
  } catch (error) {
    return json(res, 500, {
      ok: false,
      error: "parking_difficulty_failed",
      message: "No se pudo calcular la dificultad de aparcamiento ahora."
    });
  }
};
