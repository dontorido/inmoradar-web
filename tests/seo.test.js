const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { buildPriceCitySourceData } = require("../api/_seo/marketSources");
const { buildPriceCityLanding } = require("../api/_seo/priceCity");
const { calculateSeoLandingQuality } = require("../api/_seo/quality");
const { runSeoLandingGeneration } = require("../api/_seo/generator");
const { buildSeoDailyPolicySnapshot, selectNextSeoContentType } = require("../api/_seo/publishingPolicy");
const { getSeedPublishedLanding } = require("../api/_seo/seedPublished");
const sitemapHandler = require("../api/sitemap");
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
  assert.match(landing.body_html, /data-sale-reference/);
  assert.match(landing.body_html, /data-seo-calc-price/);
  assert.match(landing.body_html, /data-seo-calc-area/);
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

test("el generador SEO soporta contenidos aleatorios controlados de alquiler y analisis de precio", async () => {
  const base = {
    city: "Logroño",
    province: "La Rioja",
    autonomous_community: "La Rioja",
    intent: "informational",
    search_priority: 80
  };
  const rent = await runSeoLandingGeneration({
    mode: "dry_run",
    limit: 1,
    template_type: "rent_city",
    opportunities: [{ ...base, keyword: "precio alquiler metro cuadrado Logroño", template_type: "rent_city" }]
  });
  const expensive = await runSeoLandingGeneration({
    mode: "dry_run",
    limit: 1,
    template_type: "expensive_listing_city",
    opportunities: [{ ...base, keyword: "saber si un piso esta caro en Logroño", template_type: "expensive_listing_city" }]
  });

  assert.equal(rent.results[0].slug, "precio-alquiler/logrono");
  assert.equal(expensive.results[0].slug, "saber-si-piso-esta-caro/logrono");
  assert.ok(rent.results[0].quality_score >= 75);
  assert.ok(expensive.results[0].quality_score >= 75);
  assert.equal(rent.results[0].saved, false);
  assert.equal(expensive.results[0].saved, false);
});


test("la politica SEO 2+2 prioriza el tipo con cuota pendiente", () => {
  const rows = [
    { template_type: "price_city", status: "published", published_at: "2026-05-22T08:00:00.000Z" },
    { template_type: "rent_city", status: "published", published_at: "2026-05-22T09:00:00.000Z" },
    { template_type: "editorial_guide", status: "published", published_at: "2026-05-22T10:00:00.000Z" }
  ];
  const snapshot = buildSeoDailyPolicySnapshot(rows, { now: "2026-05-22T12:00:00.000Z" });

  assert.equal(snapshot.published_landings_today, 2);
  assert.equal(snapshot.published_news_today, 1);
  assert.equal(snapshot.selected_content_type, "news");
  assert.equal(snapshot.target_landings_per_day, 2);
  assert.equal(snapshot.target_news_per_day, 2);
});

test("la politica SEO 2+2 salta cuando ya se llenaron landings y guias", () => {
  const selection = selectNextSeoContentType({
    published_landings_today: 2,
    published_news_today: 2,
    published_total_today: 4
  });

  assert.equal(selection.selected_content_type, null);
  assert.equal(selection.skipped_reason, "daily_total_quota_reached");
});

test("el generador SEO crea guias editoriales indexables cuando alcanzan calidad", async () => {
  const result = await runSeoLandingGeneration({
    mode: "dry_run",
    limit: 1,
    template_type: "editorial_guide",
    opportunities: [
      {
        keyword: "que mirar antes de llamar por un piso",
        city: "Espana",
        template_type: "editorial_guide",
        search_priority: 90
      }
    ]
  });

  const guide = result.results[0];
  assert.equal(result.content_type, "news");
  assert.equal(guide.template_type, "editorial_guide");
  assert.equal(guide.slug, "guias/antes-de-llamar-por-un-piso");
  assert.ok(guide.quality_score >= 85);
  assert.ok(guide.word_count >= 700);
});
test("las landings publicas cargan analitica solo tras consentimiento", () => {
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

  assert.match(html, /\/assets\/consent\.js/);
  assert.doesNotMatch(html, /googletagmanager\.com\/gtm\.js/);
  assert.doesNotMatch(html, /googletagmanager\.com\/ns\.html/);
  assert.match(html, /\/api\/og\/price-city/);
});


test("price_city render publico aplica plantilla global desde fuentes guardadas", () => {
  const html = renderLandingHtml({
    slug: "precio-metro-cuadrado/sevilla",
    title: "Precio del metro cuadrado en Sevilla",
    meta_title: "Precio m² en Sevilla",
    meta_description: "Referencia de precio por metro cuadrado en Sevilla.",
    body_html: "<article><h1>Plantilla antigua</h1></article>",
    canonical_url: "https://inmoradar.app/precio-metro-cuadrado/sevilla/",
    city: "Sevilla",
    template_type: "price_city",
    index_status: "index",
    status: "published",
    quality_score: 100,
    source_data_json: {
      sources: [
        {
          operation: "sale",
          source: "mivau_appraisal",
          source_url: "https://example.com/venta.csv",
          period_label: "4T 2025",
          period_date: "2025-10-01",
          geo_level: "municipality",
          price_eur_m2: 2140
        },
        {
          operation: "rent",
          source: "serpavi",
          source_url: "https://example.com/alquiler.csv",
          period_label: "2024",
          period_date: "2024-01-01",
          geo_level: "municipality",
          price_eur_m2: 9.42
        }
      ],
      faq: []
    }
  });

  assert.match(html, /seo-primary-cards/);
  assert.match(html, /seo-hero-badges/);
  assert.match(html, /PRECIO M²/);
  assert.match(html, /COMPRUEBA UN ANUNCIO/);
  assert.match(html, /data-section-id="faq"/);
  assert.doesNotMatch(html, /Plantilla antigua/);
});

test("expensive_listing_city render publico regenera textos visibles con tildes", () => {
  const html = renderLandingHtml({
    slug: "saber-si-piso-esta-caro/granada",
    title: "Como saber si un piso esta caro en Granada",
    meta_title: "Como saber si un piso esta caro en Granada",
    meta_description: "Guia sin acentos antigua",
    h1: "Como saber si un piso esta caro en Granada",
    body_html: "<article><h1>Plantilla antigua sin tildes</h1></article>",
    canonical_url: "https://inmoradar.app/saber-si-piso-esta-caro/granada/",
    city: "Granada",
    template_type: "expensive_listing_city",
    index_status: "index",
    status: "published",
    quality_score: 100,
    source_data_json: {
      sources: [
        {
          operation: "sale",
          source: "mivau_appraisal",
          source_url: "https://example.com/venta.csv",
          period_label: "4T 2025",
          period_date: "2025-10-01",
          geo_level: "municipality",
          price_eur_m2: 2200
        },
        {
          operation: "rent",
          source: "serpavi",
          source_url: "https://example.com/alquiler.csv",
          period_label: "2024",
          period_date: "2024-01-01",
          geo_level: "municipality",
          price_eur_m2: 10.12
        }
      ],
      faq: []
    }
  });

  assert.match(html, /Cómo saber si un piso está caro en Granada/);
  assert.match(html, /Guía práctica para comparar el precio/);
  assert.match(html, /Señales que conviene revisar/);
  assert.match(html, /index,follow/);
  assert.match(html, /@media \(max-width: 560px\)/);
  assert.match(html, /overflow-x: hidden/);
  assert.doesNotMatch(html, /Plantilla antigua sin tildes/);
});

test("sitemap consulta solo landings publicadas indexables y con quality_score suficiente", async () => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const previousFetch = global.fetch;
  let requestedUrl = "";

  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";
  global.fetch = async (url) => {
    requestedUrl = String(url);
    return {
      ok: true,
      status: 200,
      text: async () => "[]"
    };
  };

  const req = {
    method: "GET",
    url: "/api/sitemap.xml",
    headers: { host: "inmoradar.app" }
  };
  const res = {
    statusCode: 0,
    headers: {},
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end() {}
  };

  try {
    await sitemapHandler(req, res);
  } finally {
    global.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }

  const params = new URL(requestedUrl).searchParams;
  assert.equal(params.get("status"), "eq.published");
  assert.equal(params.get("index_status"), "eq.index");
  assert.equal(params.get("quality_score"), "gte.75");
});

test("la home tiene seccion Noticias con enlaces a publicaciones", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

  assert.match(html, /id="noticias"/);
  assert.match(html, /data-news-list/);
  assert.match(html, /data-news-archive/);
  assert.match(html, /data-news-track/);
  assert.match(html, /Noticias/);
  assert.match(html, /data-articles-grid/);

  const script = fs.readFileSync(path.join(__dirname, "..", "assets", "app.js"), "utf8");
  assert.match(script, /precio-metro-cuadrado-madrid/);
  assert.match(script, /articleCard/);
});

test("el endpoint de noticias publica landings publicadas e indexables", async () => {
  const req = {
    method: "GET",
    url: "/api/sitemap?format=news",
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

  await sitemapHandler(req, res);

  const payload = JSON.parse(chunks.join(""));
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["content-type"], "application/json; charset=utf-8");
  assert.equal(payload.ok, true);
  assert.equal(payload.latest_limit, 5);
  assert.equal(payload.news.some((item) => item.slug === "precio-metro-cuadrado/logrono"), true);
});

test("las rutas SEO publicas cubren precio, alquiler y analisis de anuncio", () => {
  const vercel = fs.readFileSync(path.join(__dirname, "..", "vercel.json"), "utf8");
  const redirects = fs.readFileSync(path.join(__dirname, "..", "_redirects"), "utf8");
  const localServer = fs.readFileSync(path.join(__dirname, "..", "scripts", "serve-static.js"), "utf8");

  assert.match(vercel, /precio-alquiler\/:city/);
  assert.match(vercel, /saber-si-piso-esta-caro\/:city/);
  assert.match(vercel, /guias\/:slug/);
  assert.match(vercel, /"source": "\/datos"/);
  assert.match(vercel, /"source": "\/noticias\/:slug"/);
  assert.match(redirects, /precio-alquiler\/:city/);
  assert.match(redirects, /saber-si-piso-esta-caro\/:city/);
  assert.match(redirects, /guias\/:slug/);
  assert.match(redirects, /\/datos \/datos\.html/);
  assert.match(redirects, /\/noticias\/:slug \/article\.html/);
  assert.match(localServer, /precio-alquiler/);
  assert.match(localServer, /saber-si-piso-esta-caro/);
  assert.match(localServer, /guias/);
  assert.match(localServer, /\/datos\.html/);
  assert.match(localServer, /article\.html/);
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
