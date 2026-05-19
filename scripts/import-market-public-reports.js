const fs = require("node:fs/promises");
const path = require("node:path");

const CSV_COLUMNS = [
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
];

const GEO_CONFIDENCE = {
  neighbourhood: 0.85,
  district: 0.78,
  municipality: 0.65,
  province: 0.45,
  autonomous_community: 0.35,
  country: 0.25
};

function parseArgs(argv) {
  const args = {
    config: path.join(process.cwd(), "data", "market-price-report-sources.json"),
    out: path.join(process.cwd(), "market-price-public-reports.csv"),
    dryRun: false
  };

  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--config=")) args.config = path.resolve(arg.slice("--config=".length));
    else if (arg.startsWith("--out=")) args.out = path.resolve(arg.slice("--out=".length));
  }

  return args;
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

function htmlToText(html) {
  return decodeHtmlEntities(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSpanishNumber(value) {
  if (value === null || value === undefined || value === "") return null;
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

function extractPrice(text) {
  const match = String(text || "").match(/(\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?|\d+(?:,\d+)?)\s*(?:€|eur)\s*\/?\s*(?:m²|m2|m\b)/i);
  return match ? parseSpanishNumber(match[1]) : null;
}

function normalizeName(value) {
  return String(value || "")
    .replace(/\s*[-–—|·]\s*\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?\s*(?:€|eur)\s*\/?\s*(?:m²|m2|m\b).*/i, "")
    .replace(/\b(precio|venta|alquiler|euros?|m2|m²)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function comparableName(value) {
  return normalizeName(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function rowCells(rowHtml) {
  return [...String(rowHtml || "").matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
    .map((match) => htmlToText(match[1]))
    .filter(Boolean);
}

function parseMarketReportHtml(html) {
  const records = [];
  const seen = new Set();

  for (const match of String(html || "").matchAll(/<tr[\s\S]*?<\/tr>/gi)) {
    const cells = rowCells(match[0]);
    if (cells.length < 2) continue;
    const rowText = cells.join(" ");
    const price = extractPrice(rowText);
    if (!price) continue;
    const nameCell = cells.find((cell) => !extractPrice(cell) && normalizeName(cell).length > 1) || cells[0];
    const name = normalizeName(nameCell);
    if (!name) continue;
    const key = `${name}|${price}`;
    if (!seen.has(key)) {
      seen.add(key);
      records.push({ name, price_eur_m2: price });
    }
  }

  const text = htmlToText(html);
  const linePattern = /([A-ZÁÉÍÓÚÜÑa-záéíóúüñ][A-ZÁÉÍÓÚÜÑa-záéíóúüñ0-9 .,'’()/+-]{2,80}?)\s+(\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?|\d+(?:,\d+)?)\s*(?:€|eur)\s*\/?\s*(?:m²|m2|m\b)/gi;
  for (const match of text.matchAll(linePattern)) {
    const name = normalizeName(match[1]);
    const price = parseSpanishNumber(match[2]);
    if (!name || !price) continue;
    const duplicateFromTable = records.some((record) => {
      const existing = comparableName(record.name);
      const current = comparableName(name);
      return record.price_eur_m2 === price && existing && current && (existing.includes(current) || current.includes(existing));
    });
    if (duplicateFromTable) continue;
    const key = `${name}|${price}`;
    if (!seen.has(key)) {
      seen.add(key);
      records.push({ name, price_eur_m2: price });
    }
  }

  return records;
}

function levelField(level) {
  if (level === "neighbourhood") return "neighbourhood";
  if (level === "district") return "district";
  if (level === "municipality") return "municipality";
  if (level === "province") return "province";
  if (level === "autonomous_community") return "autonomous_community";
  return "country";
}

function buildMarketRecords(sourceConfig, parsedRows, extractedAt = new Date().toISOString()) {
  const rowGeoLevel = sourceConfig.row_geo_level || sourceConfig.geo_level || "municipality";
  const field = levelField(rowGeoLevel);

  return parsedRows.map((row) => {
    const record = {};
    for (const column of CSV_COLUMNS) record[column] = "";

    record.source = sourceConfig.source;
    record.operation = sourceConfig.operation;
    record.country = sourceConfig.country || "ES";
    record.autonomous_community = sourceConfig.autonomous_community || "";
    record.province = sourceConfig.province || "";
    record.municipality = sourceConfig.municipality || "";
    record.district = sourceConfig.district || "";
    record.neighbourhood = sourceConfig.neighbourhood || "";
    record.zone_name = sourceConfig.zone_name || "";
    record.geo_level = rowGeoLevel;
    record[field] = row.name;
    if (["neighbourhood", "district"].includes(rowGeoLevel)) record.zone_name = row.name;
    record.price_eur_m2 = row.price_eur_m2;
    record.period_label = sourceConfig.period_label || "";
    record.period_date = sourceConfig.period_date || "";
    record.source_url = sourceConfig.url || sourceConfig.source_url || "";
    record.sample_size = sourceConfig.sample_size || "";
    record.confidence_score = sourceConfig.confidence_score || GEO_CONFIDENCE[rowGeoLevel] || 0.35;
    record.extracted_at = extractedAt;
    return record;
  });
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function recordsToCsv(records) {
  const lines = [CSV_COLUMNS.join(",")];
  for (const record of records) {
    lines.push(CSV_COLUMNS.map((column) => csvEscape(record[column])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

async function loadHtml(sourceConfig, configDir) {
  if (sourceConfig.file) {
    return fs.readFile(path.resolve(configDir, sourceConfig.file), "utf8");
  }
  if (!sourceConfig.url) throw new Error(`La fuente ${sourceConfig.source} no tiene url ni file`);
  const response = await fetch(sourceConfig.url, {
    cache: "no-store",
    headers: {
      "User-Agent":
        sourceConfig.user_agent ||
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
      Referer: "https://www.google.com/"
    }
  });
  if (!response.ok) {
    throw new Error(
      `No se pudo descargar ${sourceConfig.url}: ${response.status}. ` +
        `Si el sitio bloquea descargas automáticas, abre la URL en Chrome, guarda la página como HTML dentro de data/ y usa "file" en la configuración.`
    );
  }
  return response.text();
}

async function run(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const configDir = path.dirname(args.config);
  const configText = await fs.readFile(args.config, "utf8");
  const sources = JSON.parse(configText).filter((source) => !source.disabled);
  const allRecords = [];

  for (const source of sources) {
    const html = await loadHtml(source, configDir);
    const parsed = parseMarketReportHtml(html);
    allRecords.push(...buildMarketRecords(source, parsed));
    console.log(`[market-import] ${source.source}: ${parsed.length} referencias`);
  }

  if (args.dryRun) {
    console.log(JSON.stringify({ count: allRecords.length, sample: allRecords.slice(0, 3) }, null, 2));
    return allRecords;
  }

  await fs.writeFile(args.out, recordsToCsv(allRecords), "utf8");
  console.log(`[market-import] CSV escrito: ${args.out} (${allRecords.length} filas)`);
  return allRecords;
}

if (require.main === module) {
  run().catch((error) => {
    console.error("[market-import]", error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  buildMarketRecords,
  parseMarketReportHtml,
  parseSpanishNumber,
  recordsToCsv,
  run
};
