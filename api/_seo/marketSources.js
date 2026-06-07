const { hasSupabaseConfig, supabaseFetch } = require("../_utils");
const { normalizeText } = require("./text");

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
  "price_eur_m2",
  "period_label",
  "period_date",
  "source_url",
  "sample_size",
  "confidence_score",
  "extracted_at"
].join(",");

const GEO_PRIORITY_FOR_CITY = {
  municipality: 7,
  neighbourhood: 6,
  zone: 6,
  district: 5,
  province: 2,
  autonomous_community: 1,
  country: 0
};

const FALLBACK_MARKET_PRICE_SOURCES = [
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
  },
  {
    source: "idealista_public_report",
    operation: "sale",
    country: "ES",
    autonomous_community: "Andalucia",
    province: "Granada",
    municipality: "Granada",
    zone_name: "Granada",
    geo_level: "municipality",
    price_eur_m2: 2645,
    evolution_month_pct: 0.6,
    evolution_year_pct: 9.2,
    period_label: "mayo 2026",
    period_date: "2026-05-01",
    source_url: "https://www.idealista.com/sala-de-prensa/informes-precio-vivienda/venta/andalucia/granada-provincia/granada/",
    confidence_score: 0.75,
    extracted_at: "2026-06-07T10:00:00Z"
  },
  {
    source: "idealista_public_report",
    operation: "rent",
    country: "ES",
    autonomous_community: "Andalucia",
    province: "Granada",
    municipality: "Granada",
    zone_name: "Granada",
    geo_level: "municipality",
    price_eur_m2: 10.5,
    evolution_month_pct: 1.0,
    evolution_year_pct: 4.4,
    period_label: "abril 2026",
    period_date: "2026-04-01",
    source_url: "https://www.idealista.com/sala-de-prensa/informes-precio-vivienda/alquiler/andalucia/granada-provincia/granada/",
    confidence_score: 0.75,
    extracted_at: "2026-06-07T10:00:00Z"
  }
];

function buildNameCandidates(value) {
  const raw = String(value || "").trim();
  const normalized = normalizeText(raw);
  const candidates = new Set([raw]);
  if (normalized) {
    candidates.add(normalized.replace(/\b\w/g, (char) => char.toUpperCase()));
    candidates.add(normalized);
  }
  if (normalized === "logrono") candidates.add("Logrono");
  if (normalized === "malaga") candidates.add("Malaga");
  if (normalized === "a coruna") candidates.add("A Coruna");
  return [...candidates].filter(Boolean);
}

function sameName(left, right) {
  const a = normalizeText(left);
  const b = normalizeText(right);
  return Boolean(a && b && a === b);
}

function parseNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number.parseFloat(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function dateWeight(record) {
  return Date.parse(record.period_date || record.extracted_at || "") || 0;
}

function sanitizeRecord(record) {
  if (!record) return null;
  return {
    source: record.source,
    operation: record.operation,
    country: record.country || "ES",
    autonomous_community: record.autonomous_community || null,
    province: record.province || null,
    municipality: record.municipality || null,
    district: record.district || null,
    neighbourhood: record.neighbourhood || null,
    zone_name: record.zone_name || null,
    geo_level: record.geo_level || null,
    geo_id: record.geo_id || null,
    ine_municipality_code: record.ine_municipality_code || null,
    price_eur_m2: parseNumber(record.price_eur_m2),
    period_label: record.period_label || null,
    period_date: record.period_date || null,
    source_url: record.source_url || null,
    sample_size: record.sample_size || null,
    confidence_score: parseNumber(record.confidence_score),
    extracted_at: record.extracted_at || null
  };
}

function sortMarketRecords(records) {
  return [...records].sort((a, b) => {
    const geoA = GEO_PRIORITY_FOR_CITY[a.geo_level] ?? -1;
    const geoB = GEO_PRIORITY_FOR_CITY[b.geo_level] ?? -1;
    if (geoA !== geoB) return geoB - geoA;
    return dateWeight(b) - dateWeight(a);
  });
}

function findBestRecord(records, operation, city) {
  const candidates = sortMarketRecords(
    records.filter((record) => {
      if (record.operation !== operation) return false;
      if (!parseNumber(record.price_eur_m2)) return false;
      if (!record.source || !record.source_url) return false;
      if (!city) return true;
      return sameName(record.municipality, city) || sameName(record.zone_name, city);
    })
  );
  return candidates[0] || null;
}

async function fetchSupabaseRecords({ operation, city, province, autonomous_community }) {
  const rows = [];
  const seen = new Set();

  async function addRows(filters, limit = 80) {
    const params = new URLSearchParams({
      select: MARKET_SELECT,
      order: "period_date.desc.nullslast,extracted_at.desc",
      limit: String(limit)
    });
    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key, `eq.${value}`);
    }
    const result = await supabaseFetch(`market_price_sources?${params.toString()}`);
    for (const row of Array.isArray(result) ? result : []) {
      const key = `${row.source}|${row.operation}|${row.source_url}|${row.period_date}`;
      if (!seen.has(key)) {
        seen.add(key);
        rows.push(sanitizeRecord(row));
      }
    }
  }

  for (const candidate of buildNameCandidates(city)) {
    await addRows({ operation, municipality: candidate }, 120);
  }
  if (province) await addRows({ operation, province }, 50);
  if (autonomous_community) await addRows({ operation, autonomous_community }, 50);

  return rows;
}

function fallbackRecordsForOpportunity(opportunity) {
  return FALLBACK_MARKET_PRICE_SOURCES.filter((record) => sameName(record.municipality, opportunity.city)).map(sanitizeRecord);
}

function sourceSummary(records) {
  return records.map((record) => ({
    operation: record.operation,
    source: record.source,
    source_url: record.source_url,
    period_label: record.period_label,
    period_date: record.period_date,
    geo_level: record.geo_level,
    price_eur_m2: record.price_eur_m2
  }));
}

async function buildPriceCitySourceData(opportunity) {
  let records = [];
  let supabaseError = null;

  if (hasSupabaseConfig()) {
    try {
      const [saleRows, rentRows] = await Promise.all([
        fetchSupabaseRecords({ ...opportunity, operation: "sale" }),
        fetchSupabaseRecords({ ...opportunity, operation: "rent" })
      ]);
      records = [...saleRows, ...rentRows];
    } catch (error) {
      supabaseError = error.message;
    }
  }

  if (!records.length) {
    records = fallbackRecordsForOpportunity(opportunity);
  }

  const sale = findBestRecord(records, "sale", opportunity.city);
  const rent = findBestRecord(records, "rent", opportunity.city);
  const selectedRecords = [sale, rent].filter(Boolean);
  const hasProvincialOnly =
    selectedRecords.length > 0 && selectedRecords.every((record) => ["province", "autonomous_community", "country"].includes(record.geo_level));

  return {
    hasRealData: selectedRecords.length > 0,
    hasProvincialOnly,
    sale,
    rent,
    records: selectedRecords,
    all_records_found: records,
    sources: sourceSummary(selectedRecords),
    lookup_error: supabaseError
  };
}

module.exports = {
  buildPriceCitySourceData,
  buildNameCandidates,
  findBestRecord,
  sanitizeRecord
};
