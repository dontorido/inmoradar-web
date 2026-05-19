const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildCloudflareEmailPayload,
  buildSavedPropertiesCsv,
  buildSavedPropertiesEmail,
  normalizeReportProperties
} = require("../api/_reports/savedPropertiesEmail");

const properties = [
  {
    address: "Calle Mayor 1, Madrid",
    municipality: "Madrid",
    portal: "Idealista",
    price: 210000,
    surfaceM2: 100,
    rooms: 3,
    propertyScore: 8.2,
    zoneScore: 7.1,
    mortgageMonthly: 726,
    market: {
      reference: 2300,
      differencePct: -8.7,
      label: "BUEN PRECIO"
    },
    url: "https://example.com/inmueble/1",
    savedAt: "2026-05-19T10:00:00.000Z"
  }
];

test("normalizeReportProperties prepara columnas clave para email", () => {
  const rows = normalizeReportProperties(properties);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "Calle Mayor 1, Madrid");
  assert.equal(rows[0].eurM2, 2100);
  assert.equal(rows[0].reference, 2300);
  assert.equal(rows[0].differencePct, -8.7);
});

test("buildSavedPropertiesEmail genera HTML, texto y resumen", () => {
  const report = buildSavedPropertiesEmail({ email: "premium@inmoradar.app", properties });
  assert.equal(report.summary.count, 1);
  assert.match(report.subject, /Comparativa/);
  assert.match(report.html, /Calle Mayor 1/);
  assert.match(report.text, /BUEN PRECIO|Calle Mayor 1/);
});

test("buildCloudflareEmailPayload adjunta CSV en base64", () => {
  const report = buildSavedPropertiesEmail({ email: "premium@inmoradar.app", properties });
  const payload = buildCloudflareEmailPayload({
    email: "premium@inmoradar.app",
    from: "hola@inmoradar.app",
    report
  });
  assert.equal(payload.to, "premium@inmoradar.app");
  assert.equal(payload.from, "hola@inmoradar.app");
  assert.equal(payload.attachments[0].filename, "inmoradar-inmuebles-guardados.csv");
  const csv = Buffer.from(payload.attachments[0].content, "base64").toString("utf8");
  assert.match(csv, /referencia_mercado_eur_m2/);
  assert.match(buildSavedPropertiesCsv(report.rows), /Calle Mayor 1/);
});
