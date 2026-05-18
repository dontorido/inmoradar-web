const { handleCors, hasSupabaseConfig, json, supabaseFetch } = require("./_utils");

const GEO_CONFIDENCE = {
  neighbourhood: 0.85,
  zone: 0.85,
  district: 0.78,
  municipality: 0.65,
  province: 0.45,
  autonomous_community: 0.35,
  country: 0.25
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
  "Estimación orientativa basada en la referencia de mercado disponible. No sustituye una valoración profesional ni refleja el precio exacto de una calle o portal.";

const FALLBACK_MARKET_PRICES = [
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

function findBestFromRecords(records, query) {
  const candidates = sortRecords(records.filter((record) => recordMatchesBase(record, query)));

  if (query.zone) {
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
      (record) => record.geo_level === "district" && sameName(record.district, query.district)
    );
    if (district) return district;
  }

  if (query.municipality) {
    const municipality = candidates.find(
      (record) => record.geo_level === "municipality" && sameName(record.municipality, query.municipality)
    );
    if (municipality) return municipality;
  }

  if (query.province) {
    const province = candidates.find((record) => record.geo_level === "province" && sameName(record.province, query.province));
    if (province) return province;
  }

  if (query.autonomous_community) {
    const autonomous = candidates.find(
      (record) =>
        record.geo_level === "autonomous_community" &&
        sameName(record.autonomous_community, query.autonomous_community)
    );
    if (autonomous) return autonomous;
  }

  return candidates.find((record) => record.geo_level === "country" && record.country === "ES") || null;
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

function scoreCapForGeoLevel(geoLevel) {
  const level = canonicalGeoLevel({ geo_level: geoLevel });
  if (level === "neighbourhood") return 9.4;
  if (level === "district") return 8.8;
  if (level === "municipality") return 8.2;
  if (level === "province") return 7.2;
  if (level === "autonomous_community") return 6.8;
  if (level === "country") return 6.5;
  return 7;
}

function priceScoreFromDifference(differencePct, operation, geoLevel = "country", confidenceScore = 0.35) {
  if (differencePct === null || differencePct === undefined) return null;
  const affordableSide = differencePct < 0 ? Math.min(Math.abs(differencePct), operation === "rent" ? 18 : 25) : 0;
  const expensiveSide = differencePct > 0 ? Math.min(differencePct, operation === "rent" ? 18 : 25) : 0;
  const reliability = geoPrecisionWeight(geoLevel) * clamp(Number(confidenceScore) || 0.35, 0.2, 0.95);
  const rawScore = 6.4 + affordableSide * 0.14 * reliability - expensiveSide * 0.16;
  return roundTo(clamp(rawScore, 1, scoreCapForGeoLevel(geoLevel)), 1);
}

function classifySale(differencePct) {
  if (differencePct <= -15) {
    return {
      label: "muy_buen_precio",
      severity: "success",
      message:
        "El anuncio está claramente por debajo de la referencia de mercado disponible. Puede ser una buena oportunidad si el estado y la ubicación concreta acompañan."
    };
  }
  if (differencePct <= -5) {
    return {
      label: "buen_precio",
      severity: "success",
      message: "El precio está por debajo de la referencia de mercado disponible."
    };
  }
  if (differencePct <= 5) {
    return {
      label: "en_mercado",
      severity: "neutral",
      message: "El precio está alineado con la referencia de mercado disponible."
    };
  }
  if (differencePct <= 15) {
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

function classifyRent(differencePct) {
  if (differencePct <= -10) {
    return {
      label: "muy_buen_precio",
      severity: "success",
      message:
        "El alquiler está claramente por debajo de la referencia de mercado disponible. Puede ser una buena oportunidad si el estado y la ubicación concreta acompañan."
    };
  }
  if (differencePct <= -3) {
    return {
      label: "buen_precio",
      severity: "success",
      message: "El alquiler está por debajo de la referencia de mercado disponible."
    };
  }
  if (differencePct <= 5) {
    return {
      label: "en_mercado",
      severity: "neutral",
      message: "El alquiler está alineado con la referencia de mercado disponible."
    };
  }
  if (differencePct <= 12) {
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

function classifyComparison(differencePct, operation) {
  if (differencePct === null || differencePct === undefined) return null;
  const classification = operation === "rent" ? classifyRent(differencePct) : classifySale(differencePct);
  return {
    difference_pct: differencePct,
    ...classification,
    price_score: priceScoreFromDifference(differencePct, operation)
  };
}

function adjustComparisonForPrecision(comparison, operation, geoLevel, confidenceScore) {
  if (!comparison) return null;
  const level = canonicalGeoLevel({ geo_level: geoLevel });
  const broadReference = !["neighbourhood", "district"].includes(level);
  const veryCheap = comparison.difference_pct <= -15;

  if (!broadReference || !veryCheap) {
    return {
      ...comparison,
      price_score: priceScoreFromDifference(comparison.difference_pct, operation, geoLevel, confidenceScore),
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
    price_score: priceScoreFromDifference(comparison.difference_pct, operation, geoLevel, confidenceScore),
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

async function findMarketPrice(query) {
  if (hasSupabaseConfig()) {
    try {
      const records = await fetchSupabaseCandidates(query);
      const match = findBestFromRecords(records, query);
      if (match) return match;
    } catch (error) {
      console.warn("[market-price] Supabase lookup failed, using fallback seed", error.message);
    }
  }

  return findBestFromRecords(FALLBACK_MARKET_PRICES, query);
}

function buildResponse(query, record) {
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
  const comparison = adjustComparisonForPrecision(classifyComparison(differencePct, query.operation), query.operation, geoLevel, confidenceScore);
  const caveats = buildCaveats(query, record, confidenceScore, differencePct);
  const market = {
    price_eur_m2: marketPrice,
    geo_level: geoLevel,
    geo_name: geoName(record),
    municipality: record.municipality || null,
    province: record.province || null,
    autonomous_community: record.autonomous_community || null,
    source: record.source || null,
    period_label: record.period_label || null,
    period_date: record.period_date || null,
    confidence_score: confidenceScore,
    source_url: record.source_url || null,
    precision_label: precisionLabel(geoLevel)
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
    period_label: market.period_label,
    period_date: market.period_date,
    evolution_month_pct: asNumber(record.evolution_month_pct),
    evolution_quarter_pct: asNumber(record.evolution_quarter_pct),
    evolution_year_pct: asNumber(record.evolution_year_pct),
    confidence_score: market.confidence_score,
    extracted_at: record.extracted_at || null,
    scoring: comparison?.label || null,
    score: comparison,
    market_score: comparison
  };
}

async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== "GET") {
    json(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    const operation = parseOperation(req.query?.operation);
    const baseQuery = {
      operation,
      municipality: req.query?.municipality || "",
      province: req.query?.province || "",
      autonomous_community: req.query?.autonomous_community || "",
      district: req.query?.district || "",
      zone: req.query?.zone || "",
      listing_price_total: req.query?.listing_price_total,
      listing_area_m2: req.query?.listing_area_m2,
      property_type: req.query?.property_type || "",
      rooms: req.query?.rooms || "",
      bathrooms: req.query?.bathrooms || "",
      floor: req.query?.floor || "",
      has_lift: req.query?.has_lift || "",
      has_parking: req.query?.has_parking || "",
      has_terrace: req.query?.has_terrace || "",
      condition: req.query?.condition || ""
    };

    if (!operation) {
      json(res, 400, noDataResponse(baseQuery, "invalid_operation", "No se ha podido comparar el precio porque no se ha detectado si es venta o alquiler."));
      return;
    }

    if (!asNumber(baseQuery.listing_price_total)) {
      json(res, 400, noDataResponse(baseQuery, "missing_price", "No se ha podido calcular €/m² porque no se ha detectado el precio."));
      return;
    }

    const area = asNumber(baseQuery.listing_area_m2);
    if (!area || area <= 0) {
      json(res, 400, noDataResponse(baseQuery, "missing_surface", "No se ha podido calcular €/m² porque no se ha detectado la superficie."));
      return;
    }

    if (!baseQuery.municipality && !baseQuery.province && !baseQuery.autonomous_community) {
      json(
        res,
        400,
        noDataResponse(baseQuery, "missing_location", "No se ha podido buscar referencia de mercado porque no se ha detectado el municipio.")
      );
      return;
    }

    const record = await findMarketPrice(baseQuery);
    json(res, record ? 200 : 404, buildResponse(baseQuery, record));
  } catch (error) {
    console.error("[market-price]", error);
    json(res, 500, { ok: false, error: "market_price_failed", disclaimer: DISCLAIMER });
  }
}

module.exports = handler;
module.exports._internal = {
  calculateDifferencePct,
  calculateListingPriceEurM2,
  classifyComparison,
  confidenceFromRecord,
  findBestFromRecords,
  precisionLabel
};
