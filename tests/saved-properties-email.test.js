const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  buildCloudflareEmailPayload,
  buildSavedPropertiesCsv,
  buildSavedPropertiesEmail,
  normalizeReportProperties,
  PREHEADER
} = require("../api/_reports/savedPropertiesEmail");
const checkPremiumHandler = require("../api/check-premium");

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
    decisionStatus: "favorite",
    notes: "Llamar despues de comparar colegios.",
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
  assert.equal(rows[0].decisionStatusLabel, "Favorito");
  assert.equal(rows[0].notes, "Llamar despues de comparar colegios.");
});

test("buildSavedPropertiesEmail genera HTML, texto y resumen", () => {
  const report = buildSavedPropertiesEmail({
    email: "premium@inmoradar.app",
    properties,
    reportUrl: "https://www.inmoradar.app/inmuebles-guardados?token=imr_test"
  });
  assert.equal(report.summary.count, 1);
  assert.match(report.subject, /Comparativa/);
  assert.match(report.html, new RegExp(PREHEADER));
  assert.match(report.html, /INMORADAR · COMPARATIVA/);
  assert.match(report.html, /Compara lo que/);
  assert.match(report.html, /Calle Mayor 1/);
  assert.match(report.html, /Abrir InmoRadar/);
  assert.match(report.html, /Ver inmuebles guardados/);
  assert.match(report.html, /LECTURA RÁPIDA/);
  assert.match(report.html, /LO QUE EL ANUNCIO NO TE CUENTA/);
  assert.match(report.html, /No es una tasación\. Es una capa de criterio\./);
  assert.doesNotMatch(report.html, /dashboard negro/i);
  assert.match(report.text, /BUEN PRECIO|Calle Mayor 1/);
  assert.match(report.text, /Ver inmuebles guardados/);
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
  assert.match(csv, /notas/);
  assert.match(buildSavedPropertiesCsv(report.rows), /Calle Mayor 1/);
});

test("pagina privada de inmuebles guardados renderiza la comparativa como tabla", () => {
  const root = path.join(__dirname, "..");
  const page = fs.readFileSync(path.join(root, "inmuebles-guardados.html"), "utf8");
  const styles = fs.readFileSync(path.join(root, "assets", "styles.css"), "utf8");

  assert.match(page, /<table class="saved-report-table">/);
  assert.match(page, /<th>Mercado<\/th>/);
  assert.match(page, /data-label="Mercado"/);
  assert.match(page, /data-label="Coste\/mes"/);
  assert.match(page, /data-report-share-toggle/);
  assert.match(page, /\/api\/saved-properties\/share/);
  assert.doesNotMatch(page, /saved-report-card/);
  assert.match(styles, /\.saved-report-table-wrap/);
  assert.match(styles, /\.saved-report-share-card/);
  assert.match(styles, /@media \(max-width: 760px\)/);
});

test("share de inmuebles guardados crea nuevo informe y envia email al destinatario", async () => {
  const previousFetch = global.fetch;
  const previousEnv = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_EMAIL_API_TOKEN: process.env.CLOUDFLARE_EMAIL_API_TOKEN,
    CLOUDFLARE_EMAIL_FROM: process.env.CLOUDFLARE_EMAIL_FROM
  };
  const sourceReport = buildSavedPropertiesEmail({
    email: "owner@inmoradar.app",
    properties,
    reportUrl: "https://www.inmoradar.app/inmuebles-guardados?token=imr_source"
  });
  const calls = [];
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
  process.env.CLOUDFLARE_ACCOUNT_ID = "account-test";
  process.env.CLOUDFLARE_EMAIL_API_TOKEN = "cloudflare-test";
  process.env.CLOUDFLARE_EMAIL_FROM = "hola@inmoradar.app";
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("/rest/v1/saved_property_email_reports?access_token_hash=")) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify([
            {
              email: "owner@inmoradar.app",
              properties_count: sourceReport.summary.count,
              provider: "cloudflare_email_service",
              status: "sent",
              created_at: sourceReport.generatedAt,
              access_token_expires_at: new Date(Date.now() + 86400000).toISOString(),
              report_json: {
                generated_at: sourceReport.generatedAt,
                summary: sourceReport.summary,
                rows: sourceReport.rows,
                report_url: sourceReport.reportUrl
              }
            }
          ])
      };
    }
    if (String(url).includes("/rest/v1/saved_property_email_reports")) {
      return { ok: true, status: 204, text: async () => "" };
    }
    if (String(url).includes("/email/sending/send")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, result: { delivered: ["friend@example.com"], queued: [] } })
      };
    }
    throw new Error(`unexpected_fetch_${url}`);
  };

  try {
    const chunks = [];
    const res = {
      statusCode: 0,
      headers: {},
      setHeader(name, value) {
        this.headers[name.toLowerCase()] = value;
      },
      end(chunk) {
        if (chunk) chunks.push(String(chunk));
      }
    };
    await checkPremiumHandler(
      {
        method: "POST",
        url: "/api/check-premium?resource=saved-properties-share",
        headers: { host: "www.inmoradar.app" },
        body: { token: `imr_${"a".repeat(40)}`, email: "friend@example.com" }
      },
      res
    );
    const payload = JSON.parse(chunks.join("") || "{}");
    const insertCall = calls.find((call) => call.options?.method === "POST" && call.url.includes("saved_property_email_reports"));
    const emailCall = calls.find((call) => call.url.includes("/email/sending/send"));
    const insertedRows = JSON.parse(insertCall.options.body);
    const emailPayload = JSON.parse(emailCall.options.body);

    assert.equal(res.statusCode, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.shared, true);
    assert.equal(payload.email, "friend@example.com");
    assert.equal(payload.provider, "cloudflare_email_service_share");
    assert.equal(insertedRows[0].provider, "cloudflare_email_service_share");
    assert.equal(insertedRows[0].email, "friend@example.com");
    assert.equal(emailPayload.to, "friend@example.com");
    assert.match(emailPayload.html, /Calle Mayor 1/);
  } finally {
    global.fetch = previousFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
