const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildMarketRecords,
  parseMarketReportHtml,
  parseSpanishNumber,
  recordsToCsv
} = require("../scripts/import-market-public-reports");

test("parseSpanishNumber soporta formato español de miles y decimales", () => {
  assert.equal(parseSpanishNumber("4.707"), 4707);
  assert.equal(parseSpanishNumber("1.885,4"), 1885.4);
  assert.equal(parseSpanishNumber("18,2"), 18.2);
});

test("parseMarketReportHtml extrae filas con precio por metro cuadrado", () => {
  const html = `
    <table>
      <tr><th>Zona</th><th>Precio</th></tr>
      <tr><td>Chamartín</td><td>5.286 €/m²</td></tr>
      <tr><td>Tetuán</td><td>4.707 €/m2</td></tr>
    </table>
  `;

  const rows = parseMarketReportHtml(html);
  assert.deepEqual(rows, [
    { name: "Chamartín", price_eur_m2: 5286 },
    { name: "Tetuán", price_eur_m2: 4707 }
  ]);
});

test("buildMarketRecords crea filas compatibles con market_price_sources", () => {
  const records = buildMarketRecords(
    {
      source: "idealista_public_report",
      operation: "sale",
      country: "ES",
      autonomous_community: "Madrid",
      province: "Madrid",
      municipality: "Madrid",
      row_geo_level: "district",
      period_label: "abril 2026",
      period_date: "2026-04-01",
      url: "https://example.com/report"
    },
    [{ name: "Chamartín", price_eur_m2: 5286 }],
    "2026-05-18T10:00:00.000Z"
  );

  assert.equal(records.length, 1);
  assert.equal(records[0].district, "Chamartín");
  assert.equal(records[0].zone_name, "Chamartín");
  assert.equal(records[0].geo_level, "district");
  assert.equal(records[0].price_eur_m2, 5286);
  assert.equal(records[0].confidence_score, 0.78);
});

test("recordsToCsv mantiene cabeceras esperadas para Supabase", () => {
  const csv = recordsToCsv([
    {
      source: "idealista_public_report",
      operation: "sale",
      country: "ES",
      autonomous_community: "Madrid",
      province: "Madrid",
      municipality: "Madrid",
      district: "Chamartín",
      neighbourhood: "",
      zone_name: "Chamartín",
      geo_level: "district",
      geo_id: "",
      ine_municipality_code: "",
      ine_district_code: "",
      ine_section_code: "",
      price_eur_m2: 5286,
      evolution_month_pct: "",
      evolution_quarter_pct: "",
      evolution_year_pct: "",
      historic_max_price_eur_m2: "",
      historic_max_period: "",
      variation_from_historic_max_pct: "",
      period_label: "abril 2026",
      period_date: "2026-04-01",
      source_url: "https://example.com/report",
      sample_size: "",
      confidence_score: 0.78,
      extracted_at: "2026-05-18T10:00:00.000Z"
    }
  ]);

  assert.match(csv, /^source,operation,country,autonomous_community,province,municipality/);
  assert.match(csv, /idealista_public_report,sale,ES,Madrid,Madrid,Madrid,Chamartín/);
});
