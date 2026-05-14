const { handleCors, hasSupabaseConfig, json, supabaseFetch } = require("./_utils");

const GEO_CONFIDENCE = {
  census_section: 0.9,
  neighbourhood: 0.8,
  zone: 0.8,
  district: 0.75,
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
    confidence_score: 0.8,
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
    .replace(/ñ/gi, "n")
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

function isZoneRecord(record) {
  return ["neighbourhood", "zone"].includes(record.geo_level);
}

function sortRecords(records) {
  return [...records].sort((a, b) => {
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
    const zoneMatch = candidates.find(
      (record) =>
        isZoneRecord(record) &&
        [record.zone_name, record.neighbourhood].some((name) => nameContains(query.zone, name))
    );
    if (zoneMatch) return zoneMatch;
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
      const key = `${row.source}|${row.operation}|${row.source_url}|${row.period_date}`;
      if (!seen.has(key)) {
        seen.add(key);
        rows.push(row);
      }
    }
  }

  if (query.municipality) {
    await addRows({ operation: query.operation, municipality: query.municipality }, 150);
  }
  if (query.province) {
    await addRows({ operation: query.operation, province: query.province }, 80);
  }
  if (query.autonomous_community) {
    await addRows({ operation: query.operation, autonomous_community: query.autonomous_community }, 80);
  }
  await addRows({ operation: query.operation, country: "ES" }, 20);

  return rows;
}

function calculateDifferencePct(listingPriceEurM2, marketPriceEurM2) {
  if (!listingPriceEurM2 || !marketPriceEurM2) return null;
  return roundTo(((listingPriceEurM2 - marketPriceEurM2) / marketPriceEurM2) * 100, 2);
}

function calculateMarketScore(differencePct, operation) {
  if (differencePct === null || differencePct === undefined) return null;

  let label = "en_mercado";
  let severity = "neutral";
  if (differencePct <= -15) {
    label = "oportunidad_fuerte";
    severity = "success";
  } else if (differencePct <= -5) {
    label = "por_debajo_de_mercado";
    severity = "success";
  } else if (differencePct <= 5) {
    label = "en_mercado";
    severity = "neutral";
  } else if (differencePct <= 15) {
    label = "algo_caro";
    severity = "warning";
  } else {
    label = "caro";
    severity = "danger";
  }

  const displayLabel = label.replace(/_/g, " ");
  const kind = operation === "rent" ? "alquiler" : "anuncio";
  const direction = differencePct >= 0 ? "por encima" : "por debajo";
  const percent = roundTo(Math.abs(differencePct), 1).toLocaleString("es-ES");

  return {
    label,
    display_label: displayLabel,
    message: `El ${kind} esta un ${percent} % ${direction} de la media estimada de la zona.`,
    severity
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
  const listingPriceTotal = asNumber(query.listing_price_total);
  const listingAreaM2 = asNumber(query.listing_area_m2);
  const listingPriceEurM2 = listingPriceTotal && listingAreaM2 ? roundTo(listingPriceTotal / listingAreaM2, 2) : null;

  if (!record) {
    return {
      ok: false,
      operation: query.operation,
      listing_price_total: listingPriceTotal,
      listing_area_m2: listingAreaM2,
      listing_price_eur_m2: listingPriceEurM2,
      error: "market_price_not_found"
    };
  }

  const marketPrice = asNumber(record.price_eur_m2);
  const differencePct = calculateDifferencePct(listingPriceEurM2, marketPrice);
  const score = calculateMarketScore(differencePct, query.operation);

  return {
    ok: true,
    operation: query.operation,
    listing_price_total: listingPriceTotal,
    listing_area_m2: listingAreaM2,
    listing_price_eur_m2: listingPriceEurM2,
    market_price_eur_m2: marketPrice,
    difference_pct: differencePct,
    geo_level: record.geo_level,
    geo_name: geoName(record),
    municipality: record.municipality || null,
    province: record.province || null,
    autonomous_community: record.autonomous_community || null,
    source: record.source,
    source_url: record.source_url,
    period_label: record.period_label || null,
    period_date: record.period_date || null,
    evolution_month_pct: asNumber(record.evolution_month_pct),
    evolution_quarter_pct: asNumber(record.evolution_quarter_pct),
    evolution_year_pct: asNumber(record.evolution_year_pct),
    confidence_score: asNumber(record.confidence_score) || GEO_CONFIDENCE[record.geo_level] || null,
    extracted_at: record.extracted_at || null,
    scoring: score?.display_label || null,
    score,
    market_score: score
  };
}

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== "GET") {
    json(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    const operation = parseOperation(req.query?.operation);
    if (!operation) {
      json(res, 400, { ok: false, error: "invalid_operation" });
      return;
    }

    const query = {
      operation,
      municipality: req.query?.municipality || "",
      province: req.query?.province || "",
      autonomous_community: req.query?.autonomous_community || "",
      zone: req.query?.zone || "",
      listing_price_total: req.query?.listing_price_total,
      listing_area_m2: req.query?.listing_area_m2
    };

    const record = await findMarketPrice(query);
    json(res, record ? 200 : 404, buildResponse(query, record));
  } catch (error) {
    console.error("[market-price]", error);
    json(res, 500, { ok: false, error: "market_price_failed" });
  }
};
