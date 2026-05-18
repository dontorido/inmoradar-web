const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { buildPriceCitySourceData } = require("../api/_seo/marketSources");
const { buildPriceCityLanding } = require("../api/_seo/priceCity");
const { calculateSeoLandingQuality } = require("../api/_seo/quality");
const { runSeoLandingGeneration } = require("../api/_seo/generator");
const { getSeedPublishedLanding } = require("../api/_seo/seedPublished");
const seoPageHandler = require("../api/seo-page");
const { renderLandingHtml } = require("../api/seo-page");

test("price_city genera una landing de alta calidad cuando hay datos reales, fuente y fecha", async () => {
  const opportunity = {
    keyword: "precio metro cuadrado Logroño",
    city: "Logroño",
    province: "La Rioja",
    autonomous_community: "La Rioja",
    template_type: "price_city"
  };
  const sourceData = await buildPriceCitySourceData(opportunity);
  const landing = buildPriceCityLanding(opportunity, sourceData);
  const quality = calculateSeoLandingQuality(landing, { ...sourceData, faq: landing.faq });

  assert.equal(sourceData.hasRealData, true);
  assert.ok(landing.word_count >= 700);
  assert.ok(quality.score >= 75);
  assert.match(landing.body_html, /referencia municipal/);
  assert.doesNotMatch(landing.body_html, /precio exacto de calle/i);
});

test("price_city queda por debajo de publicación si no hay fuente real", async () => {
  const result = await runSeoLandingGeneration({
    mode: "dry_run",
    limit: 1,
    opportunities: [
      {
        keyword: "precio metro cuadrado Ciudad Sin Datos",
        city: "Ciudad Sin Datos",
        province: "Provincia Sin Datos",
        autonomous_community: "Comunidad Sin Datos",
        template_type: "price_city"
      }
    ]
  });

  assert.equal(result.results[0].data_available, false);
  assert.equal(result.results[0].index_status, "noindex");
  assert.ok(result.results[0].quality_score < 75);
});

test("dry_run usa la semilla de 5 oportunidades y no guarda cambios", async () => {
  const result = await runSeoLandingGeneration({ mode: "dry_run", limit: 5 });

  assert.equal(result.dry_run, true);
  assert.equal(result.generated_count, 5);
  assert.equal(result.results.some((landing) => landing.slug === "precio-metro-cuadrado/logrono"), true);
  assert.equal(result.results.every((landing) => landing.saved === false), true);
});

test("las landings publicas incluyen Google Tag Manager", () => {
  const html = renderLandingHtml({
    slug: "precio-metro-cuadrado/logrono",
    title: "Precio del metro cuadrado en Logroño",
    meta_title: "Precio m² en Logroño",
    meta_description: "Referencia de precio por metro cuadrado en Logroño.",
    body_html: "<main><h1>Precio del metro cuadrado en Logroño</h1></main>",
    canonical_url: "https://inmoradar.app/precio-metro-cuadrado/logrono/",
    index_status: "noindex",
    status: "ready_to_publish",
    quality_score: 100,
    source_data_json: { faq: [] }
  });

  assert.match(html, /GTM-NWHKRNMD/);
  assert.match(html, /googletagmanager\.com\/gtm\.js/);
  assert.match(html, /googletagmanager\.com\/ns\.html/);
  assert.match(html, /\/api\/og\/price-city/);
});

test("la home tiene seccion Noticias con enlaces a publicaciones", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

  assert.match(html, /id="noticias"/);
  assert.match(html, /Noticias/);
  assert.match(html, /\/precio-metro-cuadrado\/logrono\//);
});

test("la primera landing seed queda publicada e indexable", async () => {
  const landing = await getSeedPublishedLanding("precio-metro-cuadrado/logrono");

  assert.equal(landing.status, "published");
  assert.equal(landing.index_status, "index");
  assert.ok(landing.quality_score >= 85);
  assert.match(landing.body_html, /Fuente:/);
});

test("el render publico usa fallback si Supabase esta configurado pero falla", async () => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";

  const req = {
    method: "GET",
    url: "/api/seo-page?slug=precio-metro-cuadrado/logrono",
    headers: { host: "inmoradar.app" }
  };
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

  try {
    await seoPageHandler(req, res);
  } finally {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }

  const html = chunks.join("");
  assert.equal(res.statusCode, 200);
  assert.match(html, /Precio del metro cuadrado en Logro/);
  assert.match(html, /index,follow/);
});
