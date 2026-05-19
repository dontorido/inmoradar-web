const crypto = require("node:crypto");
const { fetchWithTimeout, handleCors, hasSupabaseConfig, json, readRawBody, supabaseFetch } = require("./_utils");
const { coerceKpiSettings, defaultKpiSettings } = require("./_kpi/settings");
const {
  buildAddressIntelligenceResponse,
  calculateAddressPriceAdjustment,
  checkAddressRateLimit
} = require("./_address/intelligence");
const { calculateParkingAssessment, parkingAssessmentPayload } = require("./_parking/intelligence");

const GEO_CONFIDENCE = {
  neighbourhood: 0.85,
  zone: 0.85,
  district: 0.78,
  municipality: 0.65,
  province: 0.45,
  autonomous_community: 0.35,
  country: 0.25
};

const GEO_CONFIDENCE_CAP = {
  neighbourhood: 0.95,
  district: 0.9,
  municipality: 0.78,
  province: 0.58,
  autonomous_community: 0.48,
  country: 0.38
};

const SOURCE_WEIGHTS = {
  idealista_public_report: 1,
  fotocasa_index: 0.95,
  fotocasa_public_report: 0.95,
  serpavi: 0.8,
  mivau_appraisal: 0.7,
  mivau: 0.7
};

const MARKET_SELECT = [
  "source",
  "operation",
  "country",
  "autonomous_community",
  "province",
  "municipality",
  "district",
  "neighbourhood",
  "zone_name",
  "geo_level",
  "geo_id",
  "ine_municipality_code",
  "ine_district_code",
  "ine_section_code",
  "price_eur_m2",
  "evolution_month_pct",
  "evolution_quarter_pct",
  "evolution_year_pct",
  "historic_max_price_eur_m2",
  "historic_max_period",
  "variation_from_historic_max_pct",
  "period_label",
  "period_date",
  "source_url",
  "sample_size",
  "confidence_score",
  "extracted_at"
].join(",");

const DISCLAIMER =
  "Referencia orientativa basada en datos agregados de mercado. No sustituye una valoración profesional.";
const CONTACT_TO_EMAIL = "hola@inmoradar.app";

const FALLBACK_STEPS = [
  "neighbourhood_with_district",
  "neighbourhood_without_district",
  "district",
  "municipality",
  "province",
  "autonomous_community",
  "country"
];

let kpiSettingsCache = {
  expiresAt: 0,
  value: defaultKpiSettings()
};

const FALLBACK_MARKET_PRICES = [
  {
    source: "idealista_public_report",
    operation: "sale",
    country: "ES",
    autonomous_community: "Madrid Comunidad",
    province: "Madrid",
    municipality: "Madrid",
    district: "Puente de Vallecas",
    neighbourhood: "Portazgo",
    zone_name: "Portazgo",
    geo_level: "neighbourhood",
    price_eur_m2: 3290,
    evolution_month_pct: -3.0,
    evolution_quarter_pct: -0.1,
    evolution_year_pct: 27.3,
    historic_max_price_eur_m2: 3392,
    historic_max_period: "mar 2026",
    variation_from_historic_max_pct: -3.0,
    period_label: "abril 2026",
    period_date: "2026-04-01",
    source_url: "https://www.idealista.com/sala-de-prensa/informes-precio-vivienda/venta/madrid-comunidad/madrid-provincia/madrid/puente-de-vallecas/",
    confidence_score: 0.82,
    extracted_at: "2026-05-19T10:00:00Z"
  },
  {
    source: "idealista_public_report",
    operation: "sale",
    country: "ES",
    autonomous_community: "Madrid Comunidad",
    province: "Madrid",
    municipality: "Madrid",
    district: "Puente de Vallecas",
    geo_level: "district",
    price_eur_m2: 3325,
    period_label: "abril 2026",
    period_date: "2026-04-01",
    source_url: "https://www.idealista.com/sala-de-prensa/informes-precio-vivienda/venta/madrid-comunidad/madrid-provincia/madrid/puente-de-vallecas/",
    confidence_score: 0.78,
    extracted_at: "2026-05-19T10:00:00Z"
  },
  {
    source: "idealista_public_report",
    operation: "sale",
    country: "ES",
    autonomous_community: "La Rioja",
    province: "La Rioja",
    municipality: "Logrono",
    neighbourhood: "Casco Antiguo",
    zone_name: "Casco Antiguo",
    geo_level: "neighbourhood",
    price_eur_m2: 1885,
    evolution_month_pct: -4.6,
    evolution_quarter_pct: null,
    evolution_year_pct: 13.8,
    period_label: "abril 2026",
    period_date: "2026-04-01",
    source_url: "https://www.idealista.com/sala-de-prensa/informes-precio-vivienda/venta/la-rioja/la-rioja/logrono/casco-antiguo/",
    confidence_score: 0.85,
    extracted_at: "2026-05-14T10:00:00Z"
  },
  {
    source: "mivau_appraisal",
    operation: "sale",
    country: "ES",
    province: "La Rioja",
    municipality: "Logrono",
    zone_name: "Logrono",
    geo_level: "municipality",
    price_eur_m2: 1769,
    period_label: "4T 2025",
    period_date: "2025-10-01",
    source_url: "https://apps.fomento.gob.es/BoletinOnline2/sedal/35103500.XLS",
    sample_size: null,
    confidence_score: 0.65,
    extracted_at: "2026-05-14T17:00:00Z"
  },
  {
    source: "serpavi",
    operation: "rent",
    country: "ES",
    province: "Rioja, La",
    municipality: "Logrono",
    zone_name: "Logrono",
    geo_level: "municipality",
    geo_id: "26089",
    ine_municipality_code: "26089",
    price_eur_m2: 6.11,
    period_label: "2024",
    period_date: "2024-01-01",
    source_url: "https://cdn.mivau.gob.es/portal-web-mivau/Datos_MIVAU/CSV/VDP001_01.csv#municipality=26089&year=2024&tipo_vivienda=COLECTIVA&tipo_medida=MEDIANA&elemento=PRECIO",
    sample_size: 10342,
    confidence_score: 0.65,
    extracted_at: "2026-05-14T17:04:12.681Z"
  }
];

function roundTo(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function asNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  let normalized = String(value).trim();
  const hasComma = normalized.includes(",");
  const hasDot = normalized.includes(".");
  if (hasComma && hasDot) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    normalized = normalized.replace(",", ".");
  } else if (hasDot) {
    const parts = normalized.split(".");
    const last = parts.at(-1) || "";
    if (parts.length > 1 && last.length === 3) {
      normalized = normalized.replace(/\./g, "");
    }
  }
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function settingNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function loadKpiSettings() {
  if (kpiSettingsCache.expiresAt > Date.now()) return kpiSettingsCache.value;
  if (!hasSupabaseConfig()) return kpiSettingsCache.value;

  try {
    const rows = await supabaseFetch(
      "kpi_settings?id=eq.default&select=settings_json&limit=1",
      { timeoutMs: 2500 }
    );
    const row = Array.isArray(rows) ? rows[0] || null : null;
    kpiSettingsCache = {
      expiresAt: Date.now() + 5 * 60 * 1000,
      value: coerceKpiSettings(row?.settings_json || {})
    };
  } catch {
    kpiSettingsCache = {
      expiresAt: Date.now() + 60 * 1000,
      value: defaultKpiSettings()
    };
  }

  return kpiSettingsCache.value;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/Ã±/gi, "n")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sameName(left, right) {
  const a = normalizeText(left);
  const b = normalizeText(right);
  return Boolean(a && b && a === b);
}

function nameContains(left, right) {
  const a = normalizeText(left);
  const b = normalizeText(right);
  return Boolean(a && b && (a.includes(b) || b.includes(a)));
}

function parseOperation(value) {
  const normalized = normalizeText(value);
  if (["sale", "venta", "compra"].includes(normalized)) return "sale";
  if (["rent", "alquiler"].includes(normalized)) return "rent";
  return null;
}

function geoName(record) {
  return (
    record.zone_name ||
    record.neighbourhood ||
    record.district ||
    record.municipality ||
    record.province ||
    record.autonomous_community ||
    record.country ||
    null
  );
}

function canonicalGeoLevel(record) {
  if (record.geo_level === "zone") return "neighbourhood";
  return record.geo_level || "country";
}

function isZoneRecord(record) {
  return ["neighbourhood", "zone"].includes(record.geo_level);
}

function sourceWeight(record = {}) {
  const source = normalizeText(record.source).replace(/\s+/g, "_");
  if (SOURCE_WEIGHTS[source]) return SOURCE_WEIGHTS[source];
  if (source.includes("idealista")) return 1;
  if (source.includes("fotocasa")) return 0.95;
  if (source.includes("serpavi")) return 0.8;
  if (source.includes("mivau") || source.includes("fomento")) return 0.7;
  return 0.6;
}

function recordGeoValue(record, level = canonicalGeoLevel(record)) {
  if (level === "neighbourhood") return record.zone_name || record.neighbourhood || null;
  if (level === "district") return record.district || record.zone_name || null;
  if (level === "municipality") return record.municipality || record.zone_name || null;
  if (level === "province") return record.province || null;
  if (level === "autonomous_community") return record.autonomous_community || null;
  if (level === "country") return record.country || null;
  return geoName(record);
}

function sameGeoBucket(record, selected) {
  const level = canonicalGeoLevel(selected);
  if (canonicalGeoLevel(record) !== level) return false;

  const selectedName = recordGeoValue(selected, level);
  const recordName = recordGeoValue(record, level);
  if (level === "country") return sameName(recordName || selectedName, selectedName || recordName);
  return sameName(recordName, selectedName);
}

function sortRecords(records) {
  return [...records].sort((a, b) => {
    const confidenceA = confidenceFromRecord(a);
    const confidenceB = confidenceFromRecord(b);
    if (confidenceA !== confidenceB) return confidenceB - confidenceA;

    const dateA = Date.parse(a.period_date || a.extracted_at || "") || 0;
    const dateB = Date.parse(b.period_date || b.extracted_at || "") || 0;
    return dateB - dateA;
  });
}

function recordMatchesBase(record, query) {
  if (record.operation !== query.operation) return false;
  if (query.municipality && record.municipality && !sameName(record.municipality, query.municipality)) return false;
  if (query.province && record.province && !sameName(record.province, query.province)) return false;
  if (
    query.autonomous_community &&
    record.autonomous_community &&
    !sameName(record.autonomous_community, query.autonomous_community)
  ) {
    return false;
  }
  return true;
}

function findBestCandidateFromCandidates(candidates, query) {
  if (query.zone) {
    const zoneCandidates = candidates.filter(
      (record) =>
        isZoneRecord(record) &&
        [record.zone_name, record.neighbourhood].some((name) => sameName(query.zone, name))
    );

    if (query.district) {
      const exactZoneWithDistrict = zoneCandidates.find((record) => sameName(record.district, query.district));
      if (exactZoneWithDistrict) return exactZoneWithDistrict;
    }

    if (zoneCandidates.length) return zoneCandidates[0];

    const exactZone = candidates.find(
      (record) =>
        isZoneRecord(record) &&
        [record.zone_name, record.neighbourhood].some((name) => sameName(query.zone, name))
    );
    if (exactZone) return exactZone;

    const looseZone = candidates.find(
      (record) =>
        isZoneRecord(record) &&
        [record.zone_name, record.neighbourhood].some((name) => nameContains(query.zone, name))
    );
    if (looseZone) return looseZone;
  }

  if (query.district) {
    const district = candidates.find(
      (record) => canonicalGeoLevel(record) === "district" && sameName(record.district, query.district)
    );
    if (district) return district;
  }

  if (query.municipality) {
    const municipality = candidates.find(
      (record) => canonicalGeoLevel(record) === "municipality" && sameName(record.municipality, query.municipality)
    );
    if (municipality) return municipality;
  }

  if (query.province) {
    const province = candidates.find((record) => canonicalGeoLevel(record) === "province" && sameName(record.province, query.province));
    if (province) return province;
  }

  if (query.autonomous_community) {
    const autonomous = candidates.find(
      (record) =>
        canonicalGeoLevel(record) === "autonomous_community" &&
        sameName(record.autonomous_community, query.autonomous_community)
    );
    if (autonomous) return autonomous;
  }

  return candidates.find((record) => record.geo_level === "country" && record.country === "ES") || null;
}

function findBestGroupFromRecords(records, query) {
  const candidates = sortRecords(records.filter((record) => recordMatchesBase(record, query)));
  const selected = findBestCandidateFromCandidates(candidates, query);
  if (!selected) return null;

  const group = candidates.filter((record) => sameGeoBucket(record, selected));
  return sortRecords(group.length ? group : [selected]);
}

function findBestFromRecords(records, query) {
  const group = findBestGroupFromRecords(records, query);
  return group?.[0] || null;
}

function matchedByForRecord(record, query) {
  const level = canonicalGeoLevel(record || {});

  if (level === "neighbourhood") {
    const hasDistrictMatch = query.district && sameName(record.district, query.district);
    if (query.municipality && hasDistrictMatch && query.zone) return "municipality+district+zone_name";
    if (query.municipality && query.zone) return "municipality+zone_name";
    if (query.zone) return "zone_name";
    return "neighbourhood";
  }

  if (level === "district") {
    if (query.municipality && query.district) return "municipality+district";
    if (query.district) return "district";
  }

  if (level === "municipality") return query.province ? "municipality+province" : "municipality";
  if (level === "province") return "province";
  if (level === "autonomous_community") return "autonomous_community";
  if (level === "country") return "country";
  return "unknown";
}

function fallbackInfoForRecord(record, query) {
  if (!record) {
    return {
      matched_by: null,
      matched_level: null,
      steps_tried: FALLBACK_STEPS
    };
  }

  return {
    matched_by: matchedByForRecord(record, query),
    matched_level: canonicalGeoLevel(record),
    steps_tried: FALLBACK_STEPS
  };
}

async function fetchSupabaseCandidates(query) {
  const rows = [];
  const seen = new Set();

  async function addRows(filters, limit = 100) {
    const params = new URLSearchParams({
      select: MARKET_SELECT,
      order: "period_date.desc.nullslast,extracted_at.desc",
      limit: String(limit)
    });

    for (const [key, value] of Object.entries(filters)) {
      if (value !== null && value !== undefined && value !== "") {
        params.set(key, `eq.${value}`);
      }
    }

    const result = await supabaseFetch(`market_price_sources?${params.toString()}`);
    for (const row of Array.isArray(result) ? result : []) {
      const key = `${row.source}|${row.operation}|${row.geo_level}|${geoName(row)}|${row.source_url}|${row.period_date}`;
      if (!seen.has(key)) {
        seen.add(key);
        rows.push(row);
      }
    }
  }

  if (query.municipality) {
    await addRows({ operation: query.operation, municipality: query.municipality }, 200);
  }
  if (query.province) {
    await addRows({ operation: query.operation, province: query.province }, 150);
  }
  if (query.autonomous_community) {
    await addRows({ operation: query.operation, autonomous_community: query.autonomous_community }, 120);
  }
  await addRows({ operation: query.operation, country: "ES" }, 40);

  return rows;
}

function calculateListingPriceEurM2(priceTotal, surfaceM2) {
  const total = asNumber(priceTotal);
  const area = asNumber(surfaceM2);
  if (!total || !area || area <= 0) return null;
  return roundTo(total / area, 2);
}

function calculateDifferencePct(listingPriceEurM2, marketPriceEurM2) {
  if (!listingPriceEurM2 || !marketPriceEurM2) return null;
  return roundTo(((listingPriceEurM2 - marketPriceEurM2) / marketPriceEurM2) * 100, 2);
}

function geoPrecisionWeight(geoLevel) {
  const level = canonicalGeoLevel({ geo_level: geoLevel });
  if (level === "neighbourhood") return 1;
  if (level === "district") return 0.85;
  if (level === "municipality") return 0.55;
  if (level === "province") return 0.3;
  if (level === "autonomous_community") return 0.22;
  if (level === "country") return 0.18;
  return 0.35;
}

function scoreCapForGeoLevel(geoLevel, kpiSettings = defaultKpiSettings()) {
  const level = canonicalGeoLevel({ geo_level: geoLevel });
  const caps = kpiSettings.property_score?.geo_caps || {};
  if (level === "neighbourhood") return settingNumber(caps.neighbourhood, 9.2);
  if (level === "district") return settingNumber(caps.district, 8.4);
  if (level === "municipality") return settingNumber(caps.municipality, 7.8);
  if (level === "province") return settingNumber(caps.province, 7);
  if (level === "autonomous_community") return settingNumber(caps.autonomous_community, 6.7);
  if (level === "country") return settingNumber(caps.country, 6.5);
  return settingNumber(caps.unknown, 6.5);
}

function priceScoreFromDifference(differencePct, operation, geoLevel = "country", confidenceScore = 0.35, kpiSettings = defaultKpiSettings()) {
  if (differencePct === null || differencePct === undefined) return null;
  const priceSettings = kpiSettings.price_score || {};
  const affordableCap = operation === "rent" ? priceSettings.rent_affordable_cap_pct : priceSettings.sale_affordable_cap_pct;
  const expensiveCap = operation === "rent" ? priceSettings.rent_expensive_cap_pct : priceSettings.sale_expensive_cap_pct;
  const affordableSide = differencePct < 0 ? Math.min(Math.abs(differencePct), settingNumber(affordableCap, 18)) : 0;
  const expensiveSide = differencePct > 0 ? Math.min(differencePct, settingNumber(expensiveCap, 18)) : 0;
  const reliability = geoPrecisionWeight(geoLevel) * clamp(settingNumber(confidenceScore, 0.35), 0.2, 0.95);
  const baseline = settingNumber(priceSettings.baseline, 6.4);
  const affordableMultiplier = settingNumber(priceSettings.affordable_multiplier, 0.14);
  const expensiveMultiplier = settingNumber(priceSettings.expensive_multiplier, 0.16);
  const rawScore = baseline + affordableSide * affordableMultiplier * reliability - expensiveSide * expensiveMultiplier;
  return roundTo(clamp(rawScore, 1, scoreCapForGeoLevel(geoLevel, kpiSettings)), 1);
}

function classifySale(differencePct, kpiSettings = defaultKpiSettings()) {
  const thresholds = kpiSettings.market?.sale_thresholds || {};
  if (differencePct <= settingNumber(thresholds.very_good_pct, -15)) {
    return {
      label: "muy_buen_precio",
      severity: "success",
      message:
        "El anuncio está claramente por debajo de la referencia de mercado disponible. Puede ser una buena oportunidad si el estado y la ubicación concreta acompañan."
    };
  }
  if (differencePct <= settingNumber(thresholds.good_pct, -5)) {
    return {
      label: "buen_precio",
      severity: "success",
      message: "El precio está por debajo de la referencia de mercado disponible."
    };
  }
  if (differencePct <= settingNumber(thresholds.market_pct, 5)) {
    return {
      label: "en_mercado",
      severity: "neutral",
      message: "El precio está alineado con la referencia de mercado disponible."
    };
  }
  if (differencePct <= settingNumber(thresholds.expensive_pct, 15)) {
    return {
      label: "algo_caro",
      severity: "warning",
      message:
        "El precio está algo por encima de la referencia de mercado. Puede estar justificado si el inmueble tiene mejores características que la media."
    };
  }
  return {
    label: "caro",
    severity: "danger",
    message:
      "El precio está claramente por encima de la referencia disponible. Conviene revisar si las características justifican la diferencia."
  };
}

function classifyRent(differencePct, kpiSettings = defaultKpiSettings()) {
  const thresholds = kpiSettings.market?.rent_thresholds || {};
  if (differencePct <= settingNumber(thresholds.very_good_pct, -10)) {
    return {
      label: "muy_buen_precio",
      severity: "success",
      message:
        "El alquiler está claramente por debajo de la referencia de mercado disponible. Puede ser una buena oportunidad si el estado y la ubicación concreta acompañan."
    };
  }
  if (differencePct <= settingNumber(thresholds.good_pct, -3)) {
    return {
      label: "buen_precio",
      severity: "success",
      message: "El alquiler está por debajo de la referencia de mercado disponible."
    };
  }
  if (differencePct <= settingNumber(thresholds.market_pct, 5)) {
    return {
      label: "en_mercado",
      severity: "neutral",
      message: "El alquiler está alineado con la referencia de mercado disponible."
    };
  }
  if (differencePct <= settingNumber(thresholds.expensive_pct, 12)) {
    return {
      label: "algo_caro",
      severity: "warning",
      message:
        "El alquiler está algo por encima de la referencia de mercado. Puede estar justificado si el inmueble tiene mejores características que la media."
    };
  }
  return {
    label: "caro",
    severity: "danger",
    message:
      "El alquiler está claramente por encima de la referencia disponible. Conviene revisar si las características justifican la diferencia."
  };
}

function classifyComparison(differencePct, operation, kpiSettings = defaultKpiSettings()) {
  if (differencePct === null || differencePct === undefined) return null;
  const classification = operation === "rent" ? classifyRent(differencePct, kpiSettings) : classifySale(differencePct, kpiSettings);
  return {
    difference_pct: differencePct,
    ...classification,
    price_score: priceScoreFromDifference(differencePct, operation, "country", 0.35, kpiSettings)
  };
}

function adjustComparisonForPrecision(comparison, operation, geoLevel, confidenceScore, kpiSettings = defaultKpiSettings()) {
  if (!comparison) return null;
  const level = canonicalGeoLevel({ geo_level: geoLevel });
  const broadReference = !["neighbourhood", "district"].includes(level);
  const veryGoodThreshold = operation === "rent"
    ? kpiSettings.market?.rent_thresholds?.very_good_pct
    : kpiSettings.market?.sale_thresholds?.very_good_pct;
  const veryCheap = comparison.difference_pct <= settingNumber(veryGoodThreshold, -15);

  if (!broadReference || !veryCheap) {
    return {
      ...comparison,
      price_score: priceScoreFromDifference(comparison.difference_pct, operation, geoLevel, confidenceScore, kpiSettings),
      confidence_adjusted: false
    };
  }

  return {
    ...comparison,
    raw_label: comparison.label,
    label: "buen_precio",
    severity: "success",
    message:
      "El anuncio está por debajo de la referencia disponible, pero la referencia no es de barrio. Trátalo como señal positiva a validar con comparables cercanos, no como oportunidad cerrada.",
    price_score: priceScoreFromDifference(comparison.difference_pct, operation, geoLevel, confidenceScore, kpiSettings),
    confidence_adjusted: true
  };
}

function precisionLabel(geoLevel) {
  const level = canonicalGeoLevel({ geo_level: geoLevel });
  if (level === "neighbourhood") return "Referencia de zona";
  if (level === "district") return "Referencia de distrito";
  if (level === "municipality") return "Referencia municipal";
  if (level === "province") return "Referencia provincial";
  if (level === "autonomous_community") return "Referencia autonómica";
  if (level === "country") return "Referencia nacional";
  return "Referencia de mercado";
}

function monthsSince(value) {
  const date = Date.parse(value || "");
  if (!date) return null;
  return Math.max(0, (Date.now() - date) / (1000 * 60 * 60 * 24 * 30.4375));
}

function confidenceFromRecord(record = {}) {
  if (record.source === "market_consensus" && record.confidence_score !== null && record.confidence_score !== undefined) {
    return roundTo(clamp(asNumber(record.confidence_score), 0.15, 0.95), 2);
  }

  const level = canonicalGeoLevel(record);
  const explicit = asNumber(record.confidence_score);
  const base = explicit || GEO_CONFIDENCE[level] || 0.35;
  const sampleSize = asNumber(record.sample_size);
  const ageMonths = monthsSince(record.period_date || record.extracted_at);

  let confidence = base;
  if (sampleSize >= 2000) confidence += 0.08;
  else if (sampleSize >= 500) confidence += 0.05;
  else if (sampleSize > 0 && sampleSize < 40) confidence -= 0.08;

  if (ageMonths !== null && ageMonths > 18) confidence -= 0.12;
  if (["province", "autonomous_community", "country"].includes(level)) confidence -= 0.03;

  return roundTo(clamp(confidence, 0.15, 0.95), 2);
}

function median(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function latestValue(records, field) {
  return sortRecords(records).find((record) => record[field])?.[field] || null;
}

function marketSourceSummary(record) {
  return {
    source: record.source || null,
    price_eur_m2: asNumber(record.price_eur_m2),
    period_label: record.period_label || null,
    period_date: record.period_date || null,
    source_url: record.source_url || null,
    sample_size: asNumber(record.sample_size),
    confidence_score: confidenceFromRecord(record)
  };
}

function removePriceOutliers(records) {
  const valid = records.filter((record) => asNumber(record.price_eur_m2));
  if (valid.length < 3) return valid;

  const medianPrice = median(valid.map((record) => asNumber(record.price_eur_m2)));
  if (!medianPrice) return valid;

  const filtered = valid.filter((record) => {
    const price = asNumber(record.price_eur_m2);
    return Math.abs(((price - medianPrice) / medianPrice) * 100) <= 35;
  });

  return filtered.length >= 2 ? filtered : valid;
}

function consensusWeight(record) {
  const confidence = confidenceFromRecord(record);
  return Math.max(0.05, confidence * sourceWeight(record));
}

function buildConsensusRecord(records) {
  const valid = sortRecords((records || []).filter((record) => asNumber(record.price_eur_m2)));
  if (!valid.length) return null;

  const filtered = removePriceOutliers(valid);
  const base = sortRecords(filtered)[0];
  const level = canonicalGeoLevel(base);
  const prices = filtered.map((record) => asNumber(record.price_eur_m2));
  const totalWeight = filtered.reduce((sum, record) => sum + consensusWeight(record), 0);
  const weightedPrice = filtered.reduce((sum, record) => {
    return sum + asNumber(record.price_eur_m2) * consensusWeight(record);
  }, 0);
  const distinctSources = new Set(filtered.map((record) => normalizeText(record.source))).size;
  const bestConfidence = Math.max(...filtered.map((record) => confidenceFromRecord(record)));
  const boost = distinctSources >= 3 ? 0.08 : distinctSources === 2 ? 0.05 : 0;
  const confidenceCap = GEO_CONFIDENCE_CAP[level] || 0.65;
  const confidenceScore = roundTo(clamp(bestConfidence + boost, 0.15, confidenceCap), 2);

  if (filtered.length === 1) {
    return {
      ...base,
      source_count: 1,
      source_provider_count: distinctSources,
      sources: filtered.map(marketSourceSummary),
      price_range_eur_m2: {
        min: prices[0],
        max: prices[0]
      }
    };
  }

  return {
    ...base,
    source: "market_consensus",
    source_url: null,
    price_eur_m2: roundTo(weightedPrice / totalWeight, 2),
    period_label: latestValue(filtered, "period_label"),
    period_date: latestValue(filtered, "period_date"),
    confidence_score: confidenceScore,
    source_count: filtered.length,
    source_provider_count: distinctSources,
    sources: filtered.map(marketSourceSummary),
    price_range_eur_m2: {
      min: Math.min(...prices),
      max: Math.max(...prices)
    },
    discarded_outlier_count: valid.length - filtered.length
  };
}

function hasFeatureCaveat(query) {
  return [
    query.property_type,
    query.rooms,
    query.bathrooms,
    query.floor,
    query.has_lift,
    query.has_parking,
    query.has_terrace,
    query.condition
  ].some((value) => String(value || "").trim());
}

function buildCaveats(query, record, confidenceScore, differencePct) {
  const caveats = [];
  const level = canonicalGeoLevel(record || {});

  if (!query.municipality) {
    caveats.push("No se ha detectado el municipio; el análisis usa la mejor referencia disponible con menor precisión.");
  }
  if (level === "municipality") {
    caveats.push("La referencia usada es municipal, por lo que puede no reflejar diferencias importantes entre barrios.");
  }
  if (level === "province") {
    caveats.push("La referencia usada es provincial y debe interpretarse con baja precisión.");
  }
  if (["autonomous_community", "country"].includes(level)) {
    caveats.push("La referencia usada es amplia y debe interpretarse solo como orientación general.");
  }
  if (confidenceScore < 0.5) {
    caveats.push("La confianza del dato es limitada. Úsalo solo como orientación.");
  }
  if (asNumber(record?.source_count) > 1) {
    caveats.push("La referencia combina varias fuentes públicas del mismo nivel geográfico para evitar depender de una sola serie.");
  }
  if (asNumber(record?.discarded_outlier_count) > 0) {
    caveats.push("Se han descartado referencias atípicas antes de calcular el consenso de mercado.");
  }
  if (Math.abs(Number(differencePct)) > 25 && !["neighbourhood", "district"].includes(level)) {
    caveats.push("La diferencia frente a mercado es muy alta para una referencia amplia; conviene contrastarla con anuncios comparables del mismo barrio.");
  }
  if (hasFeatureCaveat(query)) {
    caveats.push("Algunas características del inmueble pueden justificar diferencias frente a la media.");
  }

  return [...new Set(caveats)];
}

function buildListing(query) {
  const priceTotal = asNumber(query.listing_price_total);
  const surfaceM2 = asNumber(query.listing_area_m2);
  return {
    price_total: priceTotal,
    surface_m2: surfaceM2,
    price_eur_m2: calculateListingPriceEurM2(priceTotal, surfaceM2)
  };
}

function noDataResponse(query, error, message, extra = {}) {
  return {
    ok: false,
    operation: query.operation || null,
    listing: buildListing(query),
    market: null,
    comparison: null,
    caveats: extra.caveats || [],
    disclaimer: DISCLAIMER,
    error,
    message,
    listing_price_total: asNumber(query.listing_price_total),
    listing_area_m2: asNumber(query.listing_area_m2),
    listing_price_eur_m2: calculateListingPriceEurM2(query.listing_price_total, query.listing_area_m2)
  };
}

function formatSignedPct(value) {
  const rounded = roundTo(Math.abs(Number(value)), 1);
  return String(rounded).replace(".", ",");
}

function comparisonMessageForMarket(comparison, differencePct, record) {
  if (!comparison || differencePct === null || differencePct === undefined) return comparison?.message || "";
  const geo = geoName(record) || "la referencia disponible";
  const pct = formatSignedPct(differencePct);

  if (differencePct > 0) {
    return `El anuncio est\u00e1 un ${pct} % por encima de la referencia de mercado de ${geo}.`;
  }
  if (differencePct < 0) {
    return `El anuncio est\u00e1 un ${pct} % por debajo de la referencia de mercado de ${geo}.`;
  }
  return `El anuncio est\u00e1 alineado con la referencia de mercado de ${geo}.`;
}

function queryFromRequest(req) {
  if (req.query) return req.query;
  const url = new URL(req.url || "/", `https://${req.headers?.host || "www.inmoradar.app"}`);
  return Object.fromEntries(url.searchParams.entries());
}

function clientKey(req) {
  return (
    req.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.headers?.["x-real-ip"] ||
    req.headers?.["cf-connecting-ip"] ||
    "anonymous"
  );
}

async function photoConditionAnalysisPayload() {
  return {
    status: 410,
    body: {
      ok: false,
      error: "photo_analysis_disabled",
      message: "El análisis visual de fotos está desactivado temporalmente."
    }
  };
}

async function findMarketPrice(query) {
  if (hasSupabaseConfig()) {
    try {
      const records = await fetchSupabaseCandidates(query);
      const group = findBestGroupFromRecords(records, query);
      const match = buildConsensusRecord(group);
      const fallbackMatch = buildConsensusRecord(findBestGroupFromRecords(FALLBACK_MARKET_PRICES, query));
      if (
        fallbackMatch &&
        (!match || geoPrecisionWeight(canonicalGeoLevel(fallbackMatch)) > geoPrecisionWeight(canonicalGeoLevel(match)))
      ) {
        return fallbackMatch;
      }
      if (match) return match;
    } catch (error) {
      console.warn("[market-price] Supabase lookup failed, using fallback seed", error.message);
    }
  }

  return buildConsensusRecord(findBestGroupFromRecords(FALLBACK_MARKET_PRICES, query));
}

function buildResponse(query, record, kpiSettings = defaultKpiSettings()) {
  const listing = buildListing(query);

  if (!record) {
    return noDataResponse(
      query,
      "market_price_not_found",
      "No tenemos una referencia de mercado suficiente para esta ubicación."
    );
  }

  const marketPrice = asNumber(record.price_eur_m2);
  const differencePct = calculateDifferencePct(listing.price_eur_m2, marketPrice);
  const geoLevel = canonicalGeoLevel(record);
  const confidenceScore = confidenceFromRecord(record);
  const comparison = adjustComparisonForPrecision(
    classifyComparison(differencePct, query.operation, kpiSettings),
    query.operation,
    geoLevel,
    confidenceScore,
    kpiSettings
  );
  if (comparison && ["neighbourhood", "district"].includes(geoLevel)) {
    comparison.message = comparisonMessageForMarket(comparison, differencePct, record);
  }
  const caveats = buildCaveats(query, record, confidenceScore, differencePct);
  const market = {
    price_eur_m2: marketPrice,
    geo_level: geoLevel,
    geo_name: geoName(record),
    zone_name: record.zone_name || null,
    neighbourhood: record.neighbourhood || null,
    district: record.district || null,
    municipality: record.municipality || null,
    province: record.province || null,
    autonomous_community: record.autonomous_community || null,
    source: record.source || null,
    period_label: record.period_label || null,
    period_date: record.period_date || null,
    confidence_score: confidenceScore,
    source_url: record.source_url || null,
    precision_label: precisionLabel(geoLevel),
    sources: Array.isArray(record.sources) ? record.sources : [marketSourceSummary(record)],
    source_count: asNumber(record.source_count) || 1,
    source_provider_count: asNumber(record.source_provider_count) || 1,
    price_range_eur_m2: record.price_range_eur_m2 || {
      min: marketPrice,
      max: marketPrice
    }
  };

  return {
    ok: true,
    operation: query.operation,
    listing,
    market,
    comparison,
    caveats,
    disclaimer: DISCLAIMER,

    // Legacy fields kept intentionally so older extension builds keep working.
    listing_price_total: listing.price_total,
    listing_area_m2: listing.surface_m2,
    listing_price_eur_m2: listing.price_eur_m2,
    market_price_eur_m2: market.price_eur_m2,
    difference_pct: comparison?.difference_pct ?? null,
    geo_level: market.geo_level,
    geo_name: market.geo_name,
    municipality: market.municipality,
    province: market.province,
    autonomous_community: market.autonomous_community,
    source: market.source,
    source_url: market.source_url,
    sources: market.sources,
    source_count: market.source_count,
    price_range_eur_m2: market.price_range_eur_m2,
    period_label: market.period_label,
    period_date: market.period_date,
    evolution_month_pct: asNumber(record.evolution_month_pct),
    evolution_quarter_pct: asNumber(record.evolution_quarter_pct),
    evolution_year_pct: asNumber(record.evolution_year_pct),
    confidence_score: market.confidence_score,
    extracted_at: record.extracted_at || null,
    scoring: comparison?.label || null,
    score: comparison,
    market_score: comparison,
    zone_name: market.zone_name,
    neighbourhood: market.neighbourhood,
    district: market.district,
    fallback: fallbackInfoForRecord(record, query)
  };
}

function buildBaseQuery(params = {}) {
  const zone = params.zone || params.zone_name || params.neighbourhood || "";
  return {
    operation: parseOperation(params.operation),
    municipality: params.municipality || "",
    province: params.province || "",
    autonomous_community: params.autonomous_community || "",
    district: params.district || "",
    zone,
    zone_name: params.zone_name || zone,
    neighbourhood: params.neighbourhood || zone,
    listing_price_total: params.listing_price_total,
    listing_area_m2: params.listing_area_m2,
    property_type: params.property_type || "",
    rooms: params.rooms || "",
    bathrooms: params.bathrooms || "",
    floor: params.floor || "",
    has_lift: params.has_lift || "",
    has_parking: params.has_parking || "",
    has_terrace: params.has_terrace || "",
    condition: params.condition || ""
  };
}

async function marketPricePayload(params = {}) {
  const baseQuery = buildBaseQuery(params);

  if (!baseQuery.operation) {
    return {
      status: 400,
      body: noDataResponse(baseQuery, "invalid_operation", "No se ha podido comparar el precio porque no se ha detectado si es venta o alquiler.")
    };
  }

  if (!asNumber(baseQuery.listing_price_total)) {
    return {
      status: 400,
      body: noDataResponse(baseQuery, "missing_price", "No se ha podido calcular €/m² porque no se ha detectado el precio.")
    };
  }

  const area = asNumber(baseQuery.listing_area_m2);
  if (!area || area <= 0) {
    return {
      status: 400,
      body: noDataResponse(baseQuery, "missing_surface", "No se ha podido calcular €/m² porque no se ha detectado la superficie.")
    };
  }

  if (!baseQuery.municipality && !baseQuery.province && !baseQuery.autonomous_community) {
    return {
      status: 400,
      body: noDataResponse(baseQuery, "missing_location", "No se ha podido buscar referencia de mercado porque no se ha detectado el municipio.")
    };
  }

  const [record, kpiSettings] = await Promise.all([
    findMarketPrice(baseQuery),
    loadKpiSettings()
  ]);
  return {
    status: record ? 200 : 404,
    body: buildResponse(baseQuery, record, kpiSettings)
  };
}

function mergePropertyAssessmentComparison(marketAssessment, addressAssessment) {
  const comparison = marketAssessment.comparison
    ? { ...marketAssessment.comparison }
    : { difference_pct: null, label: null, severity: "neutral", message: "" };
  const addressCaveats = addressAssessment?.caveats || [];
  const caveats = [...new Set([...(marketAssessment.caveats || []), ...addressCaveats])];
  const strongLiftCaveat = addressCaveats.find((text) => /sin ascensor/i.test(text));

  if (comparison.message && strongLiftCaveat) {
    comparison.message = `${comparison.message} Además, ${strongLiftCaveat.charAt(0).toLowerCase()}${strongLiftCaveat.slice(1)}`;
  }

  comparison.caveats = caveats;
  comparison.address_signals = {
    positive: addressAssessment?.positive_signals || [],
    warning: addressAssessment?.warning_signals || []
  };
  comparison.address_valuation = addressAssessment?.valuation_comparison || null;
  return comparison;
}

async function addressIntelligencePayload(params = {}, req = { headers: {} }) {
  const rate = checkAddressRateLimit(clientKey(req));
  if (!rate.allowed) {
    return {
      status: 429,
      body: {
        ok: false,
        error: "rate_limited",
        message: "Demasiadas consultas de dirección en poco tiempo.",
        rate_limit: rate
      }
    };
  }

  const result = await buildAddressIntelligenceResponse(params);
  return {
    status: result.ok ? 200 : result.reason === "insufficient_address_parts" ? 400 : 404,
    body: result
  };
}

async function propertyAssessmentPayload(params = {}) {
  const market = await marketPricePayload(params);
  const addressIntel = await buildAddressIntelligenceResponse(params).catch((error) => ({
    ok: false,
    reason: error?.message || "address_intelligence_failed",
    message: "No se han podido obtener datos adicionales del edificio.",
    address_intelligence: null
  }));

  const addressPayload = addressIntel.ok ? addressIntel : null;
  const addressAssessment = addressPayload
    ? calculateAddressPriceAdjustment(
        {
          price_total: params.listing_price_total,
          surface_m2: params.listing_area_m2,
          floor: params.floor
        },
        addressPayload
      )
    : null;

  return {
    status: market.body?.ok ? 200 : market.status || 207,
    body: {
      ok: Boolean(market.body?.ok || addressIntel.ok),
      listing: market.body?.listing || null,
      market: market.body?.market || null,
      address_intelligence: addressPayload,
      address_intelligence_status: addressIntel.ok
        ? { ok: true, cache: addressIntel.cache || null }
        : {
            ok: false,
            reason: addressIntel.reason || addressIntel.error || "address_intelligence_unavailable",
            message: addressIntel.message || "No se han podido obtener datos adicionales del edificio."
          },
      comparison: mergePropertyAssessmentComparison(market.body || {}, addressAssessment),
      disclaimer:
        "Estimación orientativa. Los datos de edificio se usan como contexto y no sustituyen una tasación ni confirman el precio exacto de una vivienda."
    }
  };
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function escapeEmailHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function cloudflareContactEmailConfig() {
  return {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_EMAIL_API_TOKEN,
    from: process.env.CLOUDFLARE_EMAIL_FROM || CONTACT_TO_EMAIL,
    to: CONTACT_TO_EMAIL
  };
}

function buildContactEmailPayload(item) {
  const topic = item.topic || "general";
  const subject = `Nuevo mensaje InmoRadar · ${topic}`;
  const lines = [
    "Nuevo mensaje desde el formulario de InmoRadar",
    "",
    `Nombre: ${item.name}`,
    `Email: ${item.email}`,
    `Tema: ${topic}`,
    `Fecha: ${item.created_at}`,
    "",
    item.message
  ];

  return {
    to: cloudflareContactEmailConfig().to,
    from: cloudflareContactEmailConfig().from,
    subject,
    text: lines.join("\n"),
    html: `<!doctype html>
<html lang="es">
<body style="margin:0;background:#FAFAFA;color:#09090B;font-family:Arial,Helvetica,sans-serif;">
  <main style="max-width:680px;margin:0 auto;padding:32px 18px;">
    <p style="margin:0 0 10px;color:#FF4500;font-size:11px;letter-spacing:.18em;text-transform:uppercase;font-weight:700;">INMORADAR · CONTACTO</p>
    <h1 style="margin:0 0 20px;color:#09090B;font-size:32px;line-height:1.05;letter-spacing:-.04em;">Nuevo mensaje</h1>
    <section style="background:#FFFFFF;border:1px solid #E4E4E7;border-radius:20px;padding:22px;">
      <p><strong>Nombre:</strong> ${escapeEmailHtml(item.name)}</p>
      <p><strong>Email:</strong> <a href="mailto:${escapeEmailHtml(item.email)}">${escapeEmailHtml(item.email)}</a></p>
      <p><strong>Tema:</strong> ${escapeEmailHtml(topic)}</p>
      <p><strong>Fecha:</strong> ${escapeEmailHtml(item.created_at)}</p>
      <hr style="border:0;border-top:1px solid #E4E4E7;margin:20px 0;">
      <p style="white-space:pre-wrap;line-height:1.55;">${escapeEmailHtml(item.message)}</p>
    </section>
  </main>
</body>
</html>`,
    reply_to: item.email,
    headers: {
      "Reply-To": item.email,
      "X-InmoRadar-Contact": "website"
    }
  };
}

async function sendContactEmail(item) {
  const config = cloudflareContactEmailConfig();
  if (!config.accountId || !config.apiToken) {
    return { ok: false, skipped: true, reason: "cloudflare_email_not_configured" };
  }

  const payload = buildContactEmailPayload(item);
  const response = await fetchWithTimeout(
    `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/email/sending/send`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(payload),
      timeoutMs: 12000
    }
  );
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.success === false) {
    return {
      ok: false,
      skipped: false,
      reason: body?.errors?.[0]?.message || `cloudflare_email_http_${response.status}`,
      status: response.status
    };
  }

  return { ok: true, provider: "cloudflare_email_service", response: body };
}

async function contactPayload(req) {
  let payload = {};
  try {
    const raw = await readRawBody(req);
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    return {
      status: 400,
      body: { ok: false, error: "invalid_json", message: "No se ha podido leer el mensaje." }
    };
  }

  const name = String(payload.name || "").trim().slice(0, 120);
  const email = String(payload.email || "").trim().toLowerCase().slice(0, 180);
  const topic = String(payload.topic || "general").trim().slice(0, 60);
  const message = String(payload.message || "").trim().slice(0, 4000);

  if (!name || !isEmail(email) || message.length < 4) {
    return {
      status: 400,
      body: { ok: false, error: "invalid_contact_payload", message: "Revisa los campos del formulario." }
    };
  }

  const item = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name,
    email,
    topic,
    message,
    created_at: new Date().toISOString()
  };

  if (hasSupabaseConfig()) {
    try {
      await supabaseFetch("contact_messages", {
        method: "POST",
        headers: { prefer: "return=minimal" },
        body: JSON.stringify(item),
        timeoutMs: 3500
      });
    } catch (error) {
      console.warn("[contact] Supabase insert failed", error.message);
    }
  }

  let emailNotification = { ok: false, skipped: true, reason: "not_attempted" };
  try {
    emailNotification = await sendContactEmail(item);
    if (!emailNotification.ok && !emailNotification.skipped) {
      console.warn("[contact] Email notification failed", emailNotification.reason || "unknown_error");
    }
  } catch (error) {
    emailNotification = { ok: false, skipped: false, reason: error.message || "email_send_failed" };
    console.warn("[contact] Email notification failed", error.message);
  }

  return {
    status: 200,
    body: {
      ok: true,
      ...item,
      notification_email: CONTACT_TO_EMAIL,
      email_notification: {
        ok: Boolean(emailNotification.ok),
        skipped: Boolean(emailNotification.skipped),
        reason: emailNotification.ok ? null : emailNotification.reason || null
      }
    }
  };
}

async function handler(req, res) {
  if (handleCors(req, res)) return;

  try {
    const params = queryFromRequest(req);
    const resource = params.resource || params.endpoint || "";

    if (resource === "photo-condition-analysis") {
      if (req.method !== "POST") {
        json(res, 405, { ok: false, error: "method_not_allowed" });
        return;
      }
      const result = await photoConditionAnalysisPayload(req);
      json(res, result.status, result.body);
      return;
    }

    if (resource === "contact") {
      if (req.method !== "POST") {
        json(res, 405, { ok: false, error: "method_not_allowed" });
        return;
      }
      const result = await contactPayload(req);
      json(res, result.status, result.body);
      return;
    }

    if (req.method !== "GET") {
      json(res, 405, { ok: false, error: "method_not_allowed" });
      return;
    }

    if (resource === "kpi-settings") {
      json(res, 200, { ok: true, settings: await loadKpiSettings() });
      return;
    }

    if (resource === "address-intelligence") {
      const result = await addressIntelligencePayload(params, req);
      json(res, result.status, result.body);
      return;
    }

    if (resource === "property-assessment") {
      const result = await propertyAssessmentPayload(params);
      json(res, result.status, result.body);
      return;
    }

    if (resource === "parking-assessment") {
      const result = await parkingAssessmentPayload(params);
      json(res, result.status, result.body);
      return;
    }

    const result = await marketPricePayload(params);
    json(res, result.status, result.body);
  } catch (error) {
    console.error("[market-price]", error);
    json(res, 500, { ok: false, error: "market_price_failed", disclaimer: DISCLAIMER });
  }
}

module.exports = handler;
module.exports._internal = {
  calculateDifferencePct,
  calculateListingPriceEurM2,
  buildConsensusRecord,
  buildContactEmailPayload,
  classifyComparison,
  confidenceFromRecord,
  findBestGroupFromRecords,
  findBestFromRecords,
  calculateParkingAssessment,
  contactPayload,
  marketPricePayload,
  propertyAssessmentPayload,
  parkingAssessmentPayload,
  precisionLabel
};
