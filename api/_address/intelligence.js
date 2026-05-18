const { hasSupabaseConfig, supabaseFetch } = require("../_utils");

const IDEALISTA_MAPS_BASE_URL = "https://www.idealista.com/maps";
const IDEALISTA_MAPS_SOURCE = "idealista_maps";
const DEFAULT_TTL_MS = 60 * 24 * 60 * 60 * 1000;
const DEFAULT_FETCH_TIMEOUT_MS = 10000;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 20;

const memoryCache = new Map();
const rateLimitBuckets = new Map();

function asNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let normalized = String(value).trim().replace(/\s/g, "");
  const hasComma = normalized.includes(",");
  const hasDot = normalized.includes(".");
  if (hasComma && hasDot) normalized = normalized.replace(/\./g, "").replace(",", ".");
  else if (hasComma) normalized = normalized.replace(",", ".");
  else if (hasDot) {
    const parts = normalized.split(".");
    if (parts.length > 1 && (parts.at(-1) || "").length === 3) normalized = normalized.replace(/\./g, "");
  }
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function slugifyIdealistaMapsPart(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ñ/g, "n")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ñ/gi, "n")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizedAddressKey(input = {}) {
  const address = input.address || [input.street, input.street_number, input.postal_code, input.municipality, input.province]
    .filter(Boolean)
    .join(" ");
  return normalizeText(address);
}

function splitStreetAndNumber(address = "") {
  const cleaned = String(address || "").replace(/\s+/g, " ").trim();
  const match = cleaned.match(/^(.+?)[,\s]+(\d+[a-zA-Z]?)\b/);
  if (!match) return { street: "", street_number: "" };
  return {
    street: match[1].replace(/,+$/g, "").trim(),
    street_number: match[2].trim()
  };
}

function buildIdealistaMapsUrl({ street, street_number, municipality, province }) {
  const municipalitySlug = slugifyIdealistaMapsPart(municipality);
  const provinceSlug = slugifyIdealistaMapsPart(province);
  const streetSlug = slugifyIdealistaMapsPart(street);
  const numberSlug = slugifyIdealistaMapsPart(street_number);
  if (!municipalitySlug || !provinceSlug || !streetSlug || !numberSlug) return null;
  return `${IDEALISTA_MAPS_BASE_URL}/${municipalitySlug}-${provinceSlug}/${streetSlug}/${numberSlug}/`;
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&aacute;/gi, "á")
    .replace(/&eacute;/gi, "é")
    .replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó")
    .replace(/&uacute;/gi, "ú")
    .replace(/&Aacute;/g, "Á")
    .replace(/&Eacute;/g, "É")
    .replace(/&Iacute;/g, "Í")
    .replace(/&Oacute;/g, "Ó")
    .replace(/&Uacute;/g, "Ú")
    .replace(/&ntilde;/gi, "ñ")
    .replace(/&Ntilde;/g, "Ñ")
    .replace(/&euro;/gi, "€");
}

function htmlToLines(html) {
  const text = decodeHtmlEntities(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(?:a|h1|h2|h3|h4|p|li|div|section|article|tr|td|dd|dt)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return text;
}

function firstMatch(lines, regex) {
  for (const line of lines) {
    const match = line.match(regex);
    if (match) return match;
  }
  return null;
}

function parseEuro(value) {
  const match = String(value || "").match(/(\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?|\d+(?:,\d+)?)\s*€/);
  return match ? asNumber(match[1]) : null;
}

function parseSurface(value) {
  const match = String(value || "").match(/(\d{1,4}(?:[.,]\d+)?)\s*m²/i);
  return match ? asNumber(match[1]) : null;
}

function parseAddress(lines, fallback = {}) {
  const heading = lines.find((line) => {
    const normalized = normalizeText(line);
    return normalized.includes(normalizeText(fallback.street)) && normalized.includes(normalizeText(fallback.municipality));
  });
  const postalLine = lines.find((line) => /\b\d{5}\b/.test(line));
  const postalMatch = postalLine?.match(/\b(\d{5})\b/);
  return {
    address_full: heading || fallback.address || [fallback.street, fallback.street_number, fallback.municipality].filter(Boolean).join(", ") || null,
    postal_code: fallback.postal_code || postalMatch?.[1] || null
  };
}

function parseUnits(lines) {
  const units = [];
  for (let index = 0; index < lines.length - 2; index += 1) {
    const label = lines[index];
    const useType = lines[index + 1];
    const detail = lines[index + 2];
    if (!/^(esc\.?|escalera|bajo|planta|portal)/i.test(label)) continue;
    if (!/(vivienda|comercio|local|garaje|oficina)/i.test(useType)) continue;
    const surfaceM2 = parseSurface(detail);
    const cadastralRef = detail.match(/\b([0-9A-Z]{14,20})\b/)?.[1] || null;
    if (!surfaceM2 && !cadastralRef) continue;
    units.push({
      label,
      use_type: useType,
      surface_m2: surfaceM2,
      cadastral_ref: cadastralRef
    });
  }
  return units;
}

function parseBuilding(lines) {
  const joined = lines.join("\n");
  const qualityMatch = joined.match(/calidad de construcci[oó]n\s+([a-záéíóúñ ]{3,30})/i);
  return {
    plot_surface_m2: parseSurface(firstMatch(lines, /m²\s+de parcela/i)?.[0]),
    year_built: asNumber(firstMatch(lines, /construido en\s+(\d{4})/i)?.[1]),
    construction_quality: qualityMatch ? qualityMatch[1].trim().toLowerCase() : null,
    floors: asNumber(firstMatch(lines, /edificio de\s+(\d+)\s+plantas?/i)?.[1]),
    neighbours_per_floor: asNumber(firstMatch(lines, /(\d+)\s+vecinos?\s+por planta/i)?.[1]),
    has_lift: /\bsin ascensor\b/i.test(joined) ? false : /\bcon ascensor\b/i.test(joined) ? true : null,
    homes_count: asNumber(firstMatch(lines, /(\d+)\s+viviendas?/i)?.[1]),
    commercial_units_count: asNumber(firstMatch(lines, /(\d+)\s+comercios?/i)?.[1])
  };
}

function parseValuation(lines) {
  const joined = lines.join("\n");
  const rangeMatch = joined.match(/(?:entre|desde)\s+(\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?)\s*€\s+(?:y|hasta)\s+(\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?)\s*€/i);
  if (rangeMatch) {
    return {
      min_price: asNumber(rangeMatch[1]),
      max_price: asNumber(rangeMatch[2])
    };
  }

  const markerIndex = lines.findIndex((line) => /cu[aá]nto vale|casa m[aá]s barata/i.test(line));
  const prices = [];
  for (let index = Math.max(0, markerIndex); index < lines.length && prices.length < 2; index += 1) {
    const price = parseEuro(lines[index]);
    if (price) prices.push(price);
  }
  return {
    min_price: prices[0] || null,
    max_price: prices[1] || null
  };
}

function parseListingHistory(lines) {
  const joined = lines.join("\n");
  const count = asNumber(joined.match(/han estado publicados?\s+(\d+)\s+anuncios?/i)?.[1]);
  const detailed = joined.match(/(\d+)\s+pisos?.*?\(en\s+(\d{4})\)\s*(\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?)\s*€/i);
  return {
    count,
    average_price: detailed ? asNumber(detailed[3]) : null,
    year: detailed ? asNumber(detailed[2]) : null
  };
}

function parseNearbyServices(lines) {
  const joined = lines.join("\n");
  const distanceM = joined.match(/(?:transporte|parada|metro|tren|bus).*?(\d{1,4})\s*m/i)?.[1];
  const count = (regex) => asNumber(joined.match(regex)?.[1]) || 0;
  return {
    transport_count: count(/(\d+)\s+(?:transportes?|paradas?)/i),
    nearest_transport_distance_km: distanceM ? Math.round((asNumber(distanceM) / 1000) * 100) / 100 : null,
    bus_stop_count: count(/(\d+)\s+(?:paradas?\s+de\s+bus|autobuses?)/i),
    metro_train_count: count(/(\d+)\s+(?:metro|tren|tranv[ií]a)/i),
    supermarket_count: count(/(\d+)\s+supermercados?/i),
    school_count: count(/(\d+)\s+(?:colegios?|escuelas?)/i),
    health_count: count(/(\d+)\s+(?:centros?\s+de\s+salud|hospitales?)/i),
    pharmacy_count: count(/(\d+)\s+farmacias?/i)
  };
}

function calculateIntelConfidence(intel) {
  let confidence = 0.35;
  if (intel.address_full) confidence += 0.08;
  if (intel.building?.year_built) confidence += 0.08;
  if (intel.building?.has_lift !== null && intel.building?.has_lift !== undefined) confidence += 0.07;
  if (intel.units?.length) confidence += 0.08;
  if (intel.valuation?.min_price && intel.valuation?.max_price) confidence += 0.04;
  if (intel.cadastre_source) confidence += 0.06;
  return Math.round(Math.min(0.85, confidence) * 100) / 100;
}

function parseIdealistaMapsHtml(html, context = {}) {
  const lines = htmlToLines(html);
  const address = parseAddress(lines, context);
  const building = parseBuilding(lines);
  const units = parseUnits(lines);
  const valuation = parseValuation(lines);
  const listingHistory = parseListingHistory(lines);
  const nearbyServices = parseNearbyServices(lines);
  const hasCadastre = lines.some((line) => /catastro/i.test(line));

  const intel = {
    source: IDEALISTA_MAPS_SOURCE,
    source_url: context.source_url || null,
    address_full: address.address_full,
    street: context.street || null,
    street_number: context.street_number || null,
    postal_code: address.postal_code,
    municipality: context.municipality || null,
    province: context.province || null,
    autonomous_community: context.autonomous_community || null,
    lat: context.lat || null,
    lng: context.lng || null,
    cadastre_source: hasCadastre ? "Dirección General de Catastro" : null,
    building_refs: units.map((unit) => unit.cadastral_ref).filter(Boolean),
    units,
    building,
    valuation,
    listing_history: listingHistory,
    nearby_services: nearbyServices,
    extracted_at: new Date().toISOString(),
    raw_payload: {
      parser: "idealista_maps_html_v1",
      line_count: lines.length,
      text_excerpt: lines.slice(0, 80).join("\n")
    }
  };
  intel.confidence_score = calculateIntelConfidence(intel);
  return intel;
}

function floorNumber(value) {
  const normalized = String(value || "").toLowerCase();
  if (/\b(bajo|bj|ground)\b/.test(normalized)) return 0;
  const match = normalized.match(/-?\d+/);
  return match ? Number.parseInt(match[0], 10) : null;
}

function compareAgainstValuation(listing = {}, addressIntel = {}) {
  const price = asNumber(listing.price_total || listing.listing_price_total);
  const surface = asNumber(listing.surface_m2 || listing.listing_area_m2);
  const minPrice = asNumber(addressIntel.valuation?.min_price);
  const maxPrice = asNumber(addressIntel.valuation?.max_price);
  if (!price || !minPrice || !maxPrice) return null;

  const comparableSurfaceFound = surface
    ? Boolean((addressIntel.units || []).some((unit) => {
        const unitSurface = asNumber(unit.surface_m2);
        if (!unitSurface) return false;
        return Math.abs(unitSurface - surface) / surface <= 0.18;
      }))
    : false;

  return {
    min_price: minPrice,
    max_price: maxPrice,
    relation: price < minPrice ? "below_range" : price > maxPrice ? "above_range" : "inside_range",
    comparable_surface_found: comparableSurfaceFound
  };
}

function calculateAddressPriceAdjustment(listing = {}, addressIntel = {}) {
  const caveats = [];
  const positive_signals = [];
  const warning_signals = [];
  const building = addressIntel.building || {};
  const nearby = addressIntel.nearby_services || {};
  const floor = floorNumber(listing.floor);

  if (building.has_lift === false && floor !== null && floor >= 3) {
    warning_signals.push("sin_ascensor_planta_alta");
    caveats.push("La finca figura sin ascensor y el anuncio parece estar en planta alta; conviene revisar si el precio lo compensa.");
  } else if (building.has_lift === false) {
    warning_signals.push("edificio_sin_ascensor");
    caveats.push("La finca figura sin ascensor.");
  }

  if (building.year_built && building.year_built < 1970) {
    warning_signals.push("edificio_antiguo");
    caveats.push("Edificio antiguo; revisa estado, instalaciones y posibles reformas.");
  }

  if (nearby.nearest_transport_distance_km !== null && nearby.nearest_transport_distance_km <= 0.2) {
    positive_signals.push("transporte_cercano");
  }
  if ((nearby.supermarket_count || 0) >= 3) {
    positive_signals.push("servicios_cercanos");
  }

  const valuationComparison = compareAgainstValuation(listing, addressIntel);
  if (valuationComparison?.relation === "above_range") {
    warning_signals.push("por_encima_rango_direccion");
    caveats.push("El precio queda por encima del rango orientativo detectado para la dirección; úsalo solo como contexto, no como tasación.");
  }
  if (valuationComparison?.relation === "below_range") {
    positive_signals.push("por_debajo_rango_direccion");
    caveats.push("El precio queda por debajo del rango orientativo detectado para la dirección, pero ese rango no sustituye una valoración profesional.");
  }
  if (valuationComparison && !valuationComparison.comparable_surface_found) {
    caveats.push("El rango de dirección puede corresponder a otras unidades del edificio, no necesariamente a esta vivienda concreta.");
  }

  return {
    caveats: [...new Set(caveats)],
    positive_signals,
    warning_signals,
    valuation_comparison: valuationComparison
  };
}

function publicIntelPayload(intel, cache = { hit: false }) {
  return {
    ok: true,
    ...intel,
    cache
  };
}

function rowToIntel(row) {
  if (!row) return null;
  return {
    source: row.source,
    source_url: row.source_url,
    normalized_address_key: row.normalized_address_key,
    address_full: row.address_full,
    street: row.street,
    street_number: row.street_number,
    postal_code: row.postal_code,
    municipality: row.municipality,
    province: row.province,
    autonomous_community: row.autonomous_community,
    lat: row.lat,
    lng: row.lng,
    cadastre_source: row.raw_payload?.cadastre_source || null,
    building_refs: row.raw_payload?.building_refs || [],
    units: row.units_json || [],
    building: {
      plot_surface_m2: row.plot_surface_m2,
      year_built: row.building_year,
      construction_quality: row.construction_quality,
      floors: row.floors,
      neighbours_per_floor: row.raw_payload?.building?.neighbours_per_floor ?? null,
      has_lift: row.has_lift,
      homes_count: row.homes_count,
      commercial_units_count: row.commercial_units_count
    },
    valuation: {
      min_price: row.valuation_min_price,
      max_price: row.valuation_max_price
    },
    listing_history: row.raw_payload?.listing_history || {},
    nearby_services: row.nearby_services_json || {},
    raw_payload: row.raw_payload,
    confidence_score: row.confidence_score,
    extracted_at: row.extracted_at
  };
}

function intelToRow(intel, key, expiresAt) {
  return {
    normalized_address_key: key,
    source: intel.source || IDEALISTA_MAPS_SOURCE,
    source_url: intel.source_url,
    address_full: intel.address_full,
    street: intel.street,
    street_number: intel.street_number,
    postal_code: intel.postal_code,
    municipality: intel.municipality,
    province: intel.province,
    autonomous_community: intel.autonomous_community,
    lat: intel.lat,
    lng: intel.lng,
    building_year: intel.building?.year_built,
    has_lift: intel.building?.has_lift,
    floors: intel.building?.floors,
    homes_count: intel.building?.homes_count,
    commercial_units_count: intel.building?.commercial_units_count,
    plot_surface_m2: intel.building?.plot_surface_m2,
    construction_quality: intel.building?.construction_quality,
    valuation_min_price: intel.valuation?.min_price,
    valuation_max_price: intel.valuation?.max_price,
    units_json: intel.units || [],
    nearby_services_json: intel.nearby_services || {},
    raw_payload: {
      ...(intel.raw_payload || {}),
      cadastre_source: intel.cadastre_source,
      building_refs: intel.building_refs,
      building: intel.building,
      listing_history: intel.listing_history
    },
    confidence_score: intel.confidence_score,
    extracted_at: intel.extracted_at,
    expires_at: expiresAt,
    updated_at: new Date().toISOString()
  };
}

function getMemoryCache(key) {
  const item = memoryCache.get(key);
  if (!item) return null;
  if (new Date(item.expires_at).getTime() <= Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  return item.value;
}

function setMemoryCache(key, value, ttlMs = DEFAULT_TTL_MS) {
  memoryCache.set(key, {
    value,
    expires_at: new Date(Date.now() + ttlMs).toISOString()
  });
}

async function getPersistentCache(key) {
  if (!hasSupabaseConfig()) return null;
  const params = new URLSearchParams({
    select: "*",
    normalized_address_key: `eq.${key}`,
    expires_at: `gt.${new Date().toISOString()}`,
    limit: "1"
  });
  const rows = await supabaseFetch(`address_intelligence_cache?${params.toString()}`);
  return rowToIntel(Array.isArray(rows) ? rows[0] : null);
}

async function setPersistentCache(key, intel, ttlMs = DEFAULT_TTL_MS) {
  if (!hasSupabaseConfig()) return;
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  await supabaseFetch("address_intelligence_cache?on_conflict=normalized_address_key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(intelToRow(intel, key, expiresAt))
  });
}

async function getCachedAddressIntel(key) {
  const memory = getMemoryCache(key);
  if (memory) return { value: memory, cache: { hit: true, layer: "memory" } };
  const persistent = await getPersistentCache(key).catch(() => null);
  if (persistent) {
    setMemoryCache(key, persistent);
    return { value: persistent, cache: { hit: true, layer: "supabase" } };
  }
  return null;
}

async function setCachedAddressIntel(key, intel, ttlMs = DEFAULT_TTL_MS) {
  setMemoryCache(key, intel, ttlMs);
  await setPersistentCache(key, intel, ttlMs).catch((error) => {
    console.warn("[address-intelligence] cache write failed", error.message);
  });
}

function clearAddressIntelCache() {
  memoryCache.clear();
  rateLimitBuckets.clear();
}

function checkAddressRateLimit(bucketKey, now = Date.now()) {
  const key = String(bucketKey || "anonymous");
  const bucket = rateLimitBuckets.get(key) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  if (bucket.resetAt <= now) {
    bucket.count = 0;
    bucket.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }
  bucket.count += 1;
  rateLimitBuckets.set(key, bucket);
  return {
    allowed: bucket.count <= RATE_LIMIT_MAX,
    remaining: Math.max(0, RATE_LIMIT_MAX - bucket.count),
    reset_at: new Date(bucket.resetAt).toISOString()
  };
}

function withTimeout(ms = DEFAULT_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    done: () => clearTimeout(timer)
  };
}

async function fetchIdealistaMapsHtml(sourceUrl, fetchImpl = fetch) {
  const timeout = withTimeout();
  try {
    const response = await fetchImpl(sourceUrl, {
      signal: timeout.signal,
      headers: {
        "user-agent": "InmoRadarAddressIntelligence/1.0 (+https://www.inmoradar.app)",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "es-ES,es;q=0.9,en;q=0.8"
      }
    });
    if (response.status === 404) return { ok: false, reason: "maps_not_found", status: 404 };
    if (!response.ok) return { ok: false, reason: "maps_fetch_failed", status: response.status };
    return { ok: true, html: await response.text() };
  } catch (error) {
    return { ok: false, reason: error?.name === "AbortError" ? "maps_timeout" : "maps_fetch_failed" };
  } finally {
    timeout.done();
  }
}

function normalizeInput(input = {}) {
  const split = splitStreetAndNumber(input.address);
  return {
    address: String(input.address || "").trim(),
    street: String(input.street || split.street || "").trim(),
    street_number: String(input.street_number || input.number || split.street_number || "").trim(),
    municipality: String(input.municipality || "").trim(),
    province: String(input.province || "").trim(),
    autonomous_community: String(input.autonomous_community || "").trim(),
    postal_code: String(input.postal_code || "").trim(),
    lat: input.lat || null,
    lng: input.lng || null
  };
}

function validateAddressInput(input) {
  if (!input.street || !input.street_number || !input.municipality || !input.province) {
    return {
      ok: false,
      reason: "insufficient_address_parts",
      message: "No se han detectado suficientes datos de dirección para consultar información del edificio."
    };
  }
  return { ok: true };
}

async function buildAddressIntelligenceResponse(rawInput = {}, options = {}) {
  const input = normalizeInput(rawInput);
  const validation = validateAddressInput(input);
  if (!validation.ok) {
    return { ok: false, ...validation, address_intelligence: null };
  }

  const key = normalizedAddressKey(input);
  const cached = options.skipCache ? null : await getCachedAddressIntel(key);
  if (cached) {
    return publicIntelPayload({ ...cached.value, normalized_address_key: key }, cached.cache);
  }

  const sourceUrl = options.sourceUrl || buildIdealistaMapsUrl(input);
  if (!sourceUrl) {
    return {
      ok: false,
      reason: "maps_url_not_buildable",
      message: "No se ha podido construir una URL probable de idealista/maps.",
      address_intelligence: null
    };
  }

  const fetched = options.html
    ? { ok: true, html: options.html }
    : await fetchIdealistaMapsHtml(sourceUrl, options.fetchImpl || fetch);
  if (!fetched.ok) {
    return {
      ok: false,
      reason: fetched.reason,
      status: fetched.status || null,
      message: "No se han podido obtener datos adicionales del edificio.",
      source_url: sourceUrl,
      address_intelligence: null
    };
  }

  const intel = parseIdealistaMapsHtml(fetched.html, { ...input, source_url: sourceUrl });
  if (!intel.address_full && !intel.units.length && !intel.building?.year_built) {
    return {
      ok: false,
      reason: "maps_parse_empty",
      message: "No se han podido interpretar datos útiles de idealista/maps.",
      source_url: sourceUrl,
      address_intelligence: null
    };
  }

  intel.normalized_address_key = key;
  await setCachedAddressIntel(key, intel, options.ttlMs || DEFAULT_TTL_MS);
  return publicIntelPayload(intel, { hit: false, layer: "network" });
}

module.exports = {
  DEFAULT_TTL_MS,
  buildAddressIntelligenceResponse,
  buildIdealistaMapsUrl,
  calculateAddressPriceAdjustment,
  checkAddressRateLimit,
  clearAddressIntelCache,
  fetchIdealistaMapsHtml,
  getCachedAddressIntel,
  normalizedAddressKey,
  parseIdealistaMapsHtml,
  setCachedAddressIntel,
  slugifyIdealistaMapsPart
};
