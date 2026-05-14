const { handleCors, json } = require("./_utils");
const { calculateParkingDifficulty } = require("./_parking/calculateParkingDifficulty");
const { getCachedParkingDifficulty, parkingCacheKey, setCachedParkingDifficulty } = require("./_parking/cache");
const { getMunicipalParkingSignals } = require("./_parking/municipalAdapters");
const { buildParkingExplanation, buildParkingSignals, confidenceFromSignals } = require("./_parking/parkingSignals");
const { fetchOverpassParking, mockOverpassParkingResponse } = require("./_parking/overpassClient");
const { parseOverpassParkingSignals } = require("./_parking/parseOverpassParkingSignals");

const DEFAULT_RADIUS_M = 500;
const NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/search";
const PHOTON_ENDPOINT = "https://photon.komoot.io/api/";

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
  const address = String(query.get("address") || "").trim();
  if (lat === null || lng === null) {
    if (!address) return { ok: false, status: 400, error: "lat_lng_or_address_required" };
    return {
      ok: true,
      lat: null,
      lng: null,
      address,
      city: String(query.get("city") || "").trim(),
      radiusM: parseRadius(query.get("radius_m")),
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
    radiusM: validation.radiusM
  });

  if (!validation.useMock) {
    const cached = getCachedParkingDifficulty(cacheKey);
    if (cached) return json(res, 200, cached);
  }

  try {
    const payload = await buildParkingDifficultyResponse(validation);
    if (geocodedLocation) {
      payload.location = geocodedLocation;
      payload.meta.address = validation.address;
    }
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
