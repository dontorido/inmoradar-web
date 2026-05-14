const { handleCors, json } = require("./_utils");
const { calculateParkingDifficulty } = require("./_parking/calculateParkingDifficulty");
const { getCachedParkingDifficulty, parkingCacheKey, setCachedParkingDifficulty } = require("./_parking/cache");
const { getMunicipalParkingSignals } = require("./_parking/municipalAdapters");
const { buildParkingExplanation, buildParkingSignals, confidenceFromSignals } = require("./_parking/parkingSignals");
const { fetchOverpassParking, mockOverpassParkingResponse } = require("./_parking/overpassClient");
const { parseOverpassParkingSignals } = require("./_parking/parseOverpassParkingSignals");

const DEFAULT_RADIUS_M = 500;

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

function validateRequest(query) {
  const lat = parseCoordinate(query.get("lat"));
  const lng = parseCoordinate(query.get("lng") || query.get("lon"));
  if (lat === null || lng === null) {
    return { ok: false, status: 400, error: "lat_and_lng_required" };
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { ok: false, status: 400, error: "invalid_lat_lng" };
  }
  return {
    ok: true,
    lat,
    lng,
    city: String(query.get("city") || "").trim(),
    radiusM: parseRadius(query.get("radius_m")),
    useMock: query.get("mock") === "1" || query.get("mock") === "true"
  };
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

async function buildParkingDifficultyResponse({ lat, lng, city, radiusM, useMock }) {
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
  const signals = buildParkingSignals({ osmSummary, municipalSignals, city });
  const scoring = calculateParkingDifficulty(signals);
  const confidenceScore = confidenceFromSignals({ signals, osmSummary, municipalSignals, usedMock, overpassOk });

  return {
    ok: true,
    score: scoring.score,
    label: scoring.label,
    confidence_score: confidenceScore,
    radius_m: radiusM,
    signals,
    explanation: buildParkingExplanation({ signals, overpassOk }),
    sources: sourceList({ overpassOk, usedMock, municipalSignals }),
    meta: {
      lat,
      lng,
      city: city || null,
      raw_score: scoring.raw_score,
      osm_relevant_elements: osmSummary.relevantElements,
      overpass_status: overpassOk ? "ok" : "failed",
      overpass_error: overpassOk ? null : overpassError
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

  const cacheKey = parkingCacheKey({
    lat: validation.lat,
    lng: validation.lng,
    city: validation.city,
    radiusM: validation.radiusM
  });

  if (!validation.useMock) {
    const cached = getCachedParkingDifficulty(cacheKey);
    if (cached) return json(res, 200, cached);
  }

  try {
    const payload = await buildParkingDifficultyResponse(validation);
    if (!validation.useMock) setCachedParkingDifficulty(cacheKey, payload);
    return json(res, 200, payload);
  } catch (error) {
    return json(res, 500, {
      ok: false,
      error: "parking_difficulty_failed",
      message: "No se pudo calcular la dificultad de aparcamiento ahora."
    });
  }
};
