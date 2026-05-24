const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { buildPriceCitySourceData } = require("../api/_seo/marketSources");
const { buildPriceCityLanding } = require("../api/_seo/priceCity");
const { SEO_INDEX_MIN_SCORE, calculateSeoLandingQuality, evaluateSeoQualityGate } = require("../api/_seo/quality");
const { runSeoLandingGeneration } = require("../api/_seo/generator");
const { buildSeoDailyPolicySnapshot, selectNextSeoContentType } = require("../api/_seo/publishingPolicy");
const { getSeedPublishedLanding } = require("../api/_seo/seedPublished");
const { SEO_KEYWORD_BACKLOG_SEEDS, buildSeoKeywordBrief } = require("../lib/seo/keywordBacklog");
const adminHandler = require("../api/admin");
const sitemapHandler = require("../api/sitemap");
const seoPageHandler = require("../api/seo-page");
const { renderLandingHtml } = require("../api/seo-page");

function createJsonResponse() {
  const chunks = [];
  const res = {
    statusCode: 0,
    headers: {},
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
    end(chunk) {
      if (chunk) chunks.push(String(chunk));
    }
  };
  return {
    res,
    payload() {
      return JSON.parse(chunks.join("") || "{}");
    }
  };
}

async function withEnv(patch, callback) {
  const previous = new Map();
  for (const key of Object.keys(patch)) {
    previous.set(key, process.env[key]);
    if (patch[key] === undefined) delete process.env[key];
    else process.env[key] = patch[key];
  }
  try {
    return await callback();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function supabaseJson(payload) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(payload)
  };
}

async function buildReadySeoDraftFixture(overrides = {}) {
  const opportunity = {
    keyword: "precio metro cuadrado Logrono",
    city: "Logrono",
    province: "La Rioja",
    autonomous_community: "La Rioja",
    template_type: "price_city"
  };
  const sourceData = await buildPriceCitySourceData(opportunity);
  const landing = buildPriceCityLanding(opportunity, sourceData);
  const quality = calculateSeoLandingQuality(landing, { ...sourceData, faq: landing.faq });
  const qualityGate = evaluateSeoQualityGate({ landing, sourceData: { ...sourceData, faq: landing.faq }, quality });
  return {
    landing,
    sourceData,
    storedLanding: {
      id: 200,
      opportunity_id: null,
      slug: landing.slug,
      title: landing.title,
      meta_title: landing.meta_title,
      meta_description: landing.meta_description,
      h1: landing.h1,
      body_html: landing.body_html,
      city: landing.city,
      province: landing.province,
      autonomous_community: landing.autonomous_community,
      template_type: landing.template_type,
      status: "ready_to_publish",
      index_status: "noindex",
      quality_score: quality.score,
      word_count: quality.word_count,
      canonical_url: landing.canonical_url,
      published_at: null,
      last_generated_at: "2026-05-24T09:00:00.000Z",
      created_at: "2026-05-24T09:00:00.000Z",
      updated_at: "2026-05-24T09:00:00.000Z",
      source_data_json: {
        generated_by: "seo_keyword_backlog_approved_brief",
        seo_keyword_backlog_id: "45",
        keyword_backlog: { id: "45", keyword: "precio metro cuadrado Logrono" },
        sources: sourceData.sources,
        records: sourceData.records,
        faq: landing.faq,
        hasRealData: sourceData.hasRealData,
        quality,
        quality_gate: qualityGate,
        quality_gate_summary: {
          quality_gate_status: qualityGate.can_publish ? "passed" : "failed",
          failed_checks: [],
          exclusion_reason: null,
          sitemap_status: "excluded"
        }
      },
      ...overrides
    }
  };
}

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

test("quality gate exige CTA medible, canonical, prudencia y fuente visible", async () => {
  const opportunity = {
    keyword: "precio metro cuadrado Logrono",
    city: "Logrono",
    province: "La Rioja",
    autonomous_community: "La Rioja",
    template_type: "price_city"
  };
  const sourceData = await buildPriceCitySourceData(opportunity);
  const landing = buildPriceCityLanding(opportunity, sourceData);
  const gate = evaluateSeoQualityGate({ landing, sourceData: { ...sourceData, faq: landing.faq } });
  const withoutTrackedCta = evaluateSeoQualityGate({
    landing: {
      ...landing,
      body_html: landing.body_html.replace(/data-install-button/g, "data-install-disabled")
    },
    sourceData: { ...sourceData, faq: landing.faq }
  });
  const badCanonical = evaluateSeoQualityGate({
    landing: { ...landing, canonical_url: "https://example.com/precio-metro-cuadrado/logrono/" },
    sourceData: { ...sourceData, faq: landing.faq }
  });

  assert.equal(gate.can_publish, true);
  assert.equal(gate.can_index, true);
  assert.equal(withoutTrackedCta.can_publish, false);
  assert.equal(withoutTrackedCta.reasons.includes("measurable_cta"), true);
  assert.equal(badCanonical.reasons.includes("canonical_valid"), true);
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

test("render publico deja noindex si score o quality gate no permiten indexar", () => {
  const base = {
    slug: "precio-metro-cuadrado/test",
    title: "Precio del metro cuadrado en Test",
    meta_title: "Precio m² en Test",
    meta_description: "Referencia de precio por metro cuadrado en Test.",
    body_html: "<main><h1>Precio del metro cuadrado en Test</h1></main>",
    canonical_url: "https://inmoradar.app/precio-metro-cuadrado/test/",
    index_status: "index",
    status: "published",
    source_data_json: { faq: [] }
  };

  const lowScore = renderLandingHtml({ ...base, quality_score: SEO_INDEX_MIN_SCORE - 1 });
  const gateBlocked = renderLandingHtml({
    ...base,
    quality_score: SEO_INDEX_MIN_SCORE,
    source_data_json: { quality_gate: { can_index: false, reasons: ["measurable_cta"] } }
  });

  assert.match(lowScore, /noindex,follow/);
  assert.match(gateBlocked, /noindex,follow/);
});

test("las landings publicas usan header y footer globales sin Premium en cabecera", () => {
  const html = renderLandingHtml({
    slug: "precio-metro-cuadrado/talavera-de-la-reina",
    title: "Precio del metro cuadrado en Talavera de la Reina",
    meta_title: "Precio m² en Talavera de la Reina",
    meta_description: "Referencia de precio por metro cuadrado en Talavera de la Reina.",
    body_html: "<main><h1>Precio del metro cuadrado en Talavera de la Reina</h1></main>",
    canonical_url: "https://inmoradar.app/precio-metro-cuadrado/talavera-de-la-reina/",
    city: "Talavera de la Reina",
    template_type: "price_city",
    index_status: "index",
    status: "published",
    quality_score: 100,
    source_data_json: { faq: [] }
  });

  const header = html.match(/<header class="site-header"[\s\S]*?<\/header>/)?.[0] || "";
  const footer = html.match(/<footer class="site-footer"[\s\S]*?<\/footer>/)?.[0] || "";

  assert.match(header, /data-site-header/);
  assert.match(header, /class="nav container"/);
  assert.match(header, /data-mobile-toggle/);
  assert.match(header, /data-mobile-panel/);
  assert.match(header, /Empezar gratis/);
  assert.doesNotMatch(header, />Premium</);
  assert.match(footer, /footer-top/);
  assert.match(footer, /footer-word/);
  assert.match(footer, /data-footer-social/);
  assert.doesNotMatch(html, /seo-global-footer/);
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
  assert.equal(params.get("quality_score"), `gte.${SEO_INDEX_MIN_SCORE}`);
});

test("admin SEO landings devuelve estado y motivos del quality gate", async () => {
  const rows = [
    {
      id: 1,
      slug: "precio-metro-cuadrado/madrid",
      title: "Precio metro cuadrado Madrid",
      city: "Madrid",
      status: "published",
      index_status: "index",
      quality_score: 92,
      word_count: 1200,
      updated_at: "2026-05-24T10:00:00.000Z",
      source_data_json: {
        quality_gate: {
          passed: true,
          can_publish: true,
          can_index: true,
          checks: [{ id: "canonical_valid", ok: true, severity: "blocker", message: "OK" }]
        }
      }
    },
    {
      id: 2,
      slug: "precio-metro-cuadrado/test",
      title: "Precio metro cuadrado Test",
      city: "Test",
      status: "published",
      index_status: "index",
      quality_score: 86,
      word_count: 900,
      updated_at: "2026-05-24T10:00:00.000Z",
      source_data_json: {
        quality_gate: {
          passed: false,
          can_publish: false,
          can_index: false,
          reasons: ["measurable_cta"],
          checks: [{ id: "measurable_cta", ok: false, severity: "blocker", message: "Debe existir CTA SEO medible." }]
        }
      }
    },
    {
      id: 3,
      slug: "precio-metro-cuadrado/legacy",
      title: "Precio metro cuadrado Legacy",
      city: "Legacy",
      status: "published",
      index_status: "index",
      quality_score: 88,
      word_count: 1000,
      updated_at: "2026-05-24T10:00:00.000Z",
      source_data_json: {}
    }
  ];
  const previousFetch = global.fetch;

  await withEnv(
    {
      ADMIN_IMPORT_TOKEN: "admin-test-token",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test"
    },
    async () => {
      global.fetch = async (url) => {
        const requestUrl = String(url);
        if (requestUrl.includes("/rest/v1/seo_landing_opportunities?")) return supabaseJson([]);
        if (requestUrl.includes("/rest/v1/seo_landings?")) return supabaseJson(rows);
        throw new Error(`Unexpected fetch ${requestUrl}`);
      };
      const { res, payload } = createJsonResponse();
      const req = {
        method: "GET",
        url: "/api/admin?resource=seo/landings&limit=10&page=1",
        headers: { authorization: "Bearer admin-test-token", host: "inmoradar.app" }
      };

      try {
        await adminHandler(req, res);
      } finally {
        global.fetch = previousFetch;
      }

      const body = payload();
      const passed = body.landings.find((row) => row.slug.endsWith("/madrid"));
      const failed = body.landings.find((row) => row.slug.endsWith("/test"));
      const legacy = body.landings.find((row) => row.slug.endsWith("/legacy"));

      assert.equal(res.statusCode, 200);
      assert.equal(passed.quality_gate_status, "passed");
      assert.equal(passed.sitemap_status, "included");
      assert.equal(failed.quality_gate_status, "failed");
      assert.equal(failed.failed_checks[0].id, "measurable_cta");
      assert.equal(failed.exclusion_reason, "measurable_cta");
      assert.equal(legacy.quality_gate_status, "not_calculated");
      assert.equal(legacy.needs_quality_gate_recalc, true);
      assert.equal(legacy.sitemap_status, "legacy_compatible");
      assert.equal(body.summary.quality_gate.passed, 1);
      assert.equal(body.summary.quality_gate.failed, 1);
      assert.equal(body.summary.quality_gate.not_calculated, 1);
    }
  );
});

test("admin SEO recalcula quality_gate legacy sin cambiar publicacion ni indexacion", async () => {
  const opportunity = {
    keyword: "precio metro cuadrado Logrono",
    city: "Logrono",
    province: "La Rioja",
    autonomous_community: "La Rioja",
    template_type: "price_city"
  };
  const sourceData = await buildPriceCitySourceData(opportunity);
  const landing = buildPriceCityLanding(opportunity, sourceData);
  const storedLanding = {
    id: 99,
    opportunity_id: null,
    slug: landing.slug,
    title: landing.title,
    meta_title: landing.meta_title,
    meta_description: landing.meta_description,
    h1: landing.h1,
    body_html: landing.body_html,
    city: landing.city,
    province: landing.province,
    autonomous_community: landing.autonomous_community,
    template_type: landing.template_type,
    status: "published",
    index_status: "index",
    quality_score: 0,
    word_count: 0,
    canonical_url: landing.canonical_url,
    published_at: "2026-05-24T10:00:00.000Z",
    last_generated_at: "2026-05-24T10:00:00.000Z",
    created_at: "2026-05-24T10:00:00.000Z",
    updated_at: "2026-05-24T10:00:00.000Z",
    source_data_json: {
      template_type: landing.template_type,
      sources: sourceData.sources,
      faq: landing.faq,
      hasRealData: sourceData.hasRealData
    }
  };
  const previousFetch = global.fetch;
  const seenUrls = [];
  let patchBody = null;

  await withEnv(
    {
      ADMIN_IMPORT_TOKEN: "admin-test-token",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test"
    },
    async () => {
      global.fetch = async (url, options = {}) => {
        const requestUrl = String(url);
        seenUrls.push(requestUrl);
        if (options.method === "PATCH" && requestUrl.includes("/rest/v1/seo_landings?slug=eq.")) {
          patchBody = JSON.parse(options.body);
          return supabaseJson([{ ...storedLanding, ...patchBody }]);
        }
        if (requestUrl.includes("/rest/v1/seo_landings?slug=eq.")) return supabaseJson([storedLanding]);
        throw new Error(`Unexpected fetch ${requestUrl}`);
      };
      const { res, payload } = createJsonResponse();
      const req = {
        method: "POST",
        url: "/api/admin?resource=seo/landings",
        headers: { authorization: "Bearer admin-test-token", host: "inmoradar.app" },
        body: { action: "recalculate_quality_gate", slug: storedLanding.slug }
      };

      try {
        await adminHandler(req, res);
      } finally {
        global.fetch = previousFetch;
      }

      const body = payload();
      assert.equal(res.statusCode, 200);
      assert.equal(body.action, "recalculate_quality_gate");
      assert.equal(body.before.status, "published");
      assert.equal(body.before.index_status, "index");
      assert.equal(body.landing.status, "published");
      assert.equal(body.landing.index_status, "index");
      assert.equal(body.landing.quality_gate_status, "passed");
      assert.equal(body.landing.needs_quality_gate_recalc, false);
      assert.ok(body.landing.quality_score >= SEO_INDEX_MIN_SCORE);
      assert.ok(patchBody.source_data_json.quality_gate.can_publish);
      assert.ok(patchBody.source_data_json.quality);
      assert.equal(patchBody.source_data_json.quality_gate_summary.quality_gate_status, "passed");
      assert.equal(Object.hasOwn(patchBody, "status"), false);
      assert.equal(Object.hasOwn(patchBody, "index_status"), false);
      assert.equal(Object.hasOwn(patchBody, "published_at"), false);
      assert.equal(Object.hasOwn(patchBody, "canonical_url"), false);
      assert.equal(seenUrls.some((url) => url.includes("sitemap")), false);
    }
  );
});

test("admin SEO recalcula quality_gate fallido usando las reglas actuales", async () => {
  const opportunity = {
    keyword: "precio metro cuadrado Logrono",
    city: "Logrono",
    province: "La Rioja",
    autonomous_community: "La Rioja",
    template_type: "price_city"
  };
  const sourceData = await buildPriceCitySourceData(opportunity);
  const landing = buildPriceCityLanding(opportunity, sourceData);
  const storedLanding = {
    id: 100,
    slug: landing.slug,
    title: landing.title,
    meta_title: landing.meta_title,
    meta_description: landing.meta_description,
    h1: landing.h1,
    body_html: landing.body_html.replace(/data-install-button/g, "data-install-disabled"),
    city: landing.city,
    province: landing.province,
    autonomous_community: landing.autonomous_community,
    template_type: landing.template_type,
    status: "draft",
    index_status: "noindex",
    quality_score: 88,
    word_count: landing.word_count,
    canonical_url: landing.canonical_url,
    source_data_json: {
      sources: sourceData.sources,
      faq: landing.faq,
      hasRealData: sourceData.hasRealData,
      quality_gate: { passed: true, can_publish: true, can_index: true }
    }
  };
  const previousFetch = global.fetch;
  let patchBody = null;

  await withEnv(
    {
      ADMIN_IMPORT_TOKEN: "admin-test-token",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test"
    },
    async () => {
      global.fetch = async (url, options = {}) => {
        const requestUrl = String(url);
        if (options.method === "PATCH" && requestUrl.includes("/rest/v1/seo_landings?id=eq.100")) {
          patchBody = JSON.parse(options.body);
          return supabaseJson([{ ...storedLanding, ...patchBody }]);
        }
        if (requestUrl.includes("/rest/v1/seo_landings?id=eq.100")) return supabaseJson([storedLanding]);
        throw new Error(`Unexpected fetch ${requestUrl}`);
      };
      const { res, payload } = createJsonResponse();
      const req = {
        method: "POST",
        url: "/api/admin?resource=seo/landings",
        headers: { authorization: "Bearer admin-test-token", host: "inmoradar.app" },
        body: { action: "recalculate_quality_gate", id: 100 }
      };

      try {
        await adminHandler(req, res);
      } finally {
        global.fetch = previousFetch;
      }

      const body = payload();
      assert.equal(res.statusCode, 200);
      assert.equal(body.before.had_quality_gate, true);
      assert.equal(body.landing.status, "draft");
      assert.equal(body.landing.index_status, "noindex");
      assert.equal(body.landing.quality_gate_status, "failed");
      assert.equal(body.landing.failed_checks.some((check) => check.id === "measurable_cta"), true);
      assert.equal(patchBody.source_data_json.quality_gate.can_publish, false);
      assert.equal(patchBody.source_data_json.quality_gate_summary.failed_checks[0].id, "measurable_cta");
      assert.equal(Object.hasOwn(patchBody, "status"), false);
      assert.equal(Object.hasOwn(patchBody, "index_status"), false);
    }
  );
});

test("admin SEO edita draft y recalcula quality_gate sin publicar ni indexar", async () => {
  const opportunity = {
    keyword: "precio metro cuadrado Logrono",
    city: "Logrono",
    province: "La Rioja",
    autonomous_community: "La Rioja",
    template_type: "price_city"
  };
  const sourceData = await buildPriceCitySourceData(opportunity);
  const landing = buildPriceCityLanding(opportunity, sourceData);
  const storedLanding = {
    id: 101,
    slug: landing.slug,
    title: landing.title,
    meta_title: landing.meta_title,
    meta_description: landing.meta_description,
    h1: landing.h1,
    body_html: landing.body_html,
    city: landing.city,
    province: landing.province,
    autonomous_community: landing.autonomous_community,
    template_type: landing.template_type,
    status: "needs_review",
    index_status: "noindex",
    quality_score: 80,
    word_count: landing.word_count,
    canonical_url: landing.canonical_url,
    published_at: null,
    source_data_json: {
      sources: sourceData.sources,
      records: sourceData.records,
      faq: landing.faq,
      hasRealData: sourceData.hasRealData
    }
  };
  const previousFetch = global.fetch;
  const seenUrls = [];
  let patchBody = null;

  await withEnv(
    {
      ADMIN_IMPORT_TOKEN: "admin-test-token",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test"
    },
    async () => {
      global.fetch = async (url, options = {}) => {
        const requestUrl = String(url);
        seenUrls.push(requestUrl);
        if (options.method === "PATCH" && requestUrl.includes("/rest/v1/seo_landings?slug=eq.")) {
          patchBody = JSON.parse(options.body);
          return supabaseJson([{ ...storedLanding, ...patchBody }]);
        }
        if (requestUrl.includes("/rest/v1/seo_landings?slug=eq.")) return supabaseJson([storedLanding]);
        throw new Error(`Unexpected fetch ${requestUrl}`);
      };
      const { res, payload } = createJsonResponse();
      const req = {
        method: "POST",
        url: "/api/admin?resource=seo/landings",
        headers: { authorization: "Bearer admin-test-token", host: "inmoradar.app" },
        body: {
          action: "update_draft",
          slug: storedLanding.slug,
          patch: {
            h1: `${landing.h1} revisado`,
            meta_title: landing.meta_title,
            meta_description: landing.meta_description,
            body_html: landing.body_html,
            editorial_notes: "Revision editorial sin publicar."
          }
        }
      };

      try {
        await adminHandler(req, res);
      } finally {
        global.fetch = previousFetch;
      }

      const body = payload();
      assert.equal(res.statusCode, 200);
      assert.equal(body.action, "update_draft");
      assert.equal(body.published, false);
      assert.equal(body.indexed, false);
      assert.equal(body.touched_sitemap, false);
      assert.equal(body.landing.status, "needs_review");
      assert.equal(body.landing.index_status, "noindex");
      assert.equal(body.landing.published_at, null);
      assert.equal(body.landing.quality_gate_status, "passed");
      assert.ok(body.landing.quality_score >= SEO_INDEX_MIN_SCORE);
      assert.equal(patchBody.index_status, "noindex");
      assert.equal(patchBody.published_at, null);
      assert.equal(patchBody.h1, `${landing.h1} revisado`);
      assert.equal(patchBody.source_data_json.editorial_review.notes, "Revision editorial sin publicar.");
      assert.equal(patchBody.source_data_json.quality_gate.can_publish, true);
      assert.equal(seenUrls.some((requestUrl) => requestUrl.includes("sitemap")), false);
    }
  );
});

test("admin SEO no aprueba draft si falla quality_gate", async () => {
  const opportunity = {
    keyword: "precio metro cuadrado Logrono",
    city: "Logrono",
    province: "La Rioja",
    autonomous_community: "La Rioja",
    template_type: "price_city"
  };
  const sourceData = await buildPriceCitySourceData(opportunity);
  const landing = buildPriceCityLanding(opportunity, sourceData);
  const storedLanding = {
    id: 102,
    slug: landing.slug,
    title: landing.title,
    meta_title: landing.meta_title,
    meta_description: landing.meta_description,
    h1: landing.h1,
    body_html: landing.body_html.replace(/data-install-button/g, "data-install-disabled"),
    city: landing.city,
    province: landing.province,
    autonomous_community: landing.autonomous_community,
    template_type: landing.template_type,
    status: "needs_review",
    index_status: "noindex",
    quality_score: 80,
    word_count: landing.word_count,
    canonical_url: landing.canonical_url,
    published_at: null,
    source_data_json: {
      sources: sourceData.sources,
      records: sourceData.records,
      faq: landing.faq,
      hasRealData: sourceData.hasRealData
    }
  };
  const previousFetch = global.fetch;

  await withEnv(
    {
      ADMIN_IMPORT_TOKEN: "admin-test-token",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test"
    },
    async () => {
      global.fetch = async (url, options = {}) => {
        assert.notEqual(options.method, "PATCH");
        if (String(url).includes("/rest/v1/seo_landings?slug=eq.")) return supabaseJson([storedLanding]);
        throw new Error(`Unexpected fetch ${String(url)}`);
      };
      const { res, payload } = createJsonResponse();
      const req = {
        method: "POST",
        url: "/api/admin?resource=seo/landings",
        headers: { authorization: "Bearer admin-test-token", host: "inmoradar.app" },
        body: { action: "approve_draft_for_publish", slug: storedLanding.slug }
      };

      try {
        await adminHandler(req, res);
      } finally {
        global.fetch = previousFetch;
      }

      const body = payload();
      assert.equal(res.statusCode, 409);
      assert.equal(body.error, "quality_gate_failed");
      assert.equal(body.published, false);
      assert.equal(body.indexed, false);
      assert.equal(body.touched_sitemap, false);
      assert.equal(body.quality_gate.can_publish, false);
    }
  );
});

test("admin SEO aprueba draft para publicacion futura sin publicar ni indexar", async () => {
  const opportunity = {
    keyword: "precio metro cuadrado Logrono",
    city: "Logrono",
    province: "La Rioja",
    autonomous_community: "La Rioja",
    template_type: "price_city"
  };
  const sourceData = await buildPriceCitySourceData(opportunity);
  const landing = buildPriceCityLanding(opportunity, sourceData);
  const storedLanding = {
    id: 103,
    slug: landing.slug,
    title: landing.title,
    meta_title: landing.meta_title,
    meta_description: landing.meta_description,
    h1: landing.h1,
    body_html: landing.body_html,
    city: landing.city,
    province: landing.province,
    autonomous_community: landing.autonomous_community,
    template_type: landing.template_type,
    status: "needs_review",
    index_status: "noindex",
    quality_score: 90,
    word_count: landing.word_count,
    canonical_url: landing.canonical_url,
    published_at: null,
    source_data_json: {
      sources: sourceData.sources,
      records: sourceData.records,
      faq: landing.faq,
      hasRealData: sourceData.hasRealData
    }
  };
  const previousFetch = global.fetch;
  const seenUrls = [];
  let patchBody = null;

  await withEnv(
    {
      ADMIN_IMPORT_TOKEN: "admin-test-token",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test"
    },
    async () => {
      global.fetch = async (url, options = {}) => {
        const requestUrl = String(url);
        seenUrls.push(requestUrl);
        if (options.method === "PATCH" && requestUrl.includes("/rest/v1/seo_landings?slug=eq.")) {
          patchBody = JSON.parse(options.body);
          return supabaseJson([{ ...storedLanding, ...patchBody }]);
        }
        if (requestUrl.includes("/rest/v1/seo_landings?slug=eq.")) return supabaseJson([storedLanding]);
        throw new Error(`Unexpected fetch ${requestUrl}`);
      };
      const { res, payload } = createJsonResponse();
      const req = {
        method: "POST",
        url: "/api/admin?resource=seo/landings",
        headers: { authorization: "Bearer admin-test-token", host: "inmoradar.app" },
        body: { action: "approve_draft_for_publish", slug: storedLanding.slug }
      };

      try {
        await adminHandler(req, res);
      } finally {
        global.fetch = previousFetch;
      }

      const body = payload();
      assert.equal(res.statusCode, 200);
      assert.equal(body.action, "approve_draft_for_publish");
      assert.equal(body.published, false);
      assert.equal(body.indexed, false);
      assert.equal(body.touched_sitemap, false);
      assert.equal(body.landing.status, "ready_to_publish");
      assert.equal(body.landing.index_status, "noindex");
      assert.equal(body.landing.published_at, null);
      assert.equal(body.landing.quality_gate_status, "passed");
      assert.equal(patchBody.status, "ready_to_publish");
      assert.equal(patchBody.index_status, "noindex");
      assert.equal(patchBody.published_at, null);
      assert.equal(patchBody.source_data_json.editorial_review.last_review_action, "approved_for_publish");
      assert.equal(patchBody.source_data_json.quality_gate.can_publish, true);
      assert.equal(seenUrls.some((requestUrl) => requestUrl.includes("sitemap")), false);
    }
  );
});

test("admin SEO no publica ready draft sin confirmacion explicita", async () => {
  const { storedLanding } = await buildReadySeoDraftFixture({ id: 201 });
  const previousFetch = global.fetch;

  await withEnv(
    {
      ADMIN_IMPORT_TOKEN: "admin-test-token",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test"
    },
    async () => {
      global.fetch = async (url, options = {}) => {
        assert.notEqual(options.method, "PATCH");
        if (String(url).includes("/rest/v1/seo_landings?slug=eq.")) return supabaseJson([storedLanding]);
        throw new Error(`Unexpected fetch ${String(url)}`);
      };
      const { res, payload } = createJsonResponse();
      const req = {
        method: "POST",
        url: "/api/admin?resource=seo/landings",
        headers: { authorization: "Bearer admin-test-token", host: "inmoradar.app" },
        body: { action: "publish_ready_draft", slug: storedLanding.slug }
      };

      try {
        await adminHandler(req, res);
      } finally {
        global.fetch = previousFetch;
      }

      const body = payload();
      assert.equal(res.statusCode, 400);
      assert.equal(body.error, "publish_confirmation_required");
      assert.equal(body.published, false);
      assert.equal(body.indexed, false);
      assert.equal(body.touched_sitemap, false);
    }
  );
});

test("admin SEO no publica si el draft no esta ready_to_publish", async () => {
  const { storedLanding } = await buildReadySeoDraftFixture({ id: 202, status: "needs_review" });
  const previousFetch = global.fetch;

  await withEnv(
    {
      ADMIN_IMPORT_TOKEN: "admin-test-token",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test"
    },
    async () => {
      global.fetch = async (url, options = {}) => {
        assert.notEqual(options.method, "PATCH");
        if (String(url).includes("/rest/v1/seo_landings?slug=eq.")) return supabaseJson([storedLanding]);
        throw new Error(`Unexpected fetch ${String(url)}`);
      };
      const { res, payload } = createJsonResponse();
      const req = {
        method: "POST",
        url: "/api/admin?resource=seo/landings",
        headers: { authorization: "Bearer admin-test-token", host: "inmoradar.app" },
        body: { action: "publish_ready_draft", slug: storedLanding.slug, confirm: true }
      };

      try {
        await adminHandler(req, res);
      } finally {
        global.fetch = previousFetch;
      }

      const body = payload();
      assert.equal(res.statusCode, 409);
      assert.equal(body.error, "not_ready_to_publish");
      assert.equal(body.published, false);
      assert.equal(body.touched_sitemap, false);
    }
  );
});

test("admin SEO no publica ready draft si el ultimo quality_gate falla", async () => {
  const fixture = await buildReadySeoDraftFixture({ id: 203 });
  const storedLanding = {
    ...fixture.storedLanding,
    body_html: fixture.storedLanding.body_html.replace(/data-install-button/g, "data-install-disabled")
  };
  const previousFetch = global.fetch;

  await withEnv(
    {
      ADMIN_IMPORT_TOKEN: "admin-test-token",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test"
    },
    async () => {
      global.fetch = async (url, options = {}) => {
        assert.notEqual(options.method, "PATCH");
        if (String(url).includes("/rest/v1/seo_landings?slug=eq.")) return supabaseJson([storedLanding]);
        throw new Error(`Unexpected fetch ${String(url)}`);
      };
      const { res, payload } = createJsonResponse();
      const req = {
        method: "POST",
        url: "/api/admin?resource=seo/landings",
        headers: { authorization: "Bearer admin-test-token", host: "inmoradar.app" },
        body: { action: "publish_ready_draft", slug: storedLanding.slug, confirm: true }
      };

      try {
        await adminHandler(req, res);
      } finally {
        global.fetch = previousFetch;
      }

      const body = payload();
      assert.equal(res.statusCode, 409);
      assert.equal(body.error, "quality_gate_failed");
      assert.equal(body.published, false);
      assert.equal(body.indexed, false);
      assert.equal(body.touched_sitemap, false);
      assert.equal(body.quality_gate.can_publish, false);
      assert.equal(body.quality_gate.reasons.includes("measurable_cta"), true);
    }
  );
});

test("admin SEO no publica ready draft si el score recalculado queda por debajo de 80", async () => {
  const fixture = await buildReadySeoDraftFixture({ id: 205 });
  const storedLanding = {
    ...fixture.storedLanding,
    body_html: `
      <article>
        <h1>${fixture.storedLanding.h1}</h1>
        <p>Fuente: prueba editorial. Fecha del dato: 2026-05-24.</p>
        <p>Referencia orientativa; no es una tasacion y no garantiza el precio real.</p>
        <button data-install-button data-install-source="seo_test">Instalar InmoRadar</button>
        <a href="/">Inicio</a>
        <a href="/analizar-anuncio-inmobiliario/">Analizar anuncio</a>
      </article>`
  };
  const previousFetch = global.fetch;

  await withEnv(
    {
      ADMIN_IMPORT_TOKEN: "admin-test-token",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test"
    },
    async () => {
      global.fetch = async (url, options = {}) => {
        assert.notEqual(options.method, "PATCH");
        if (String(url).includes("/rest/v1/seo_landings?slug=eq.")) return supabaseJson([storedLanding]);
        throw new Error(`Unexpected fetch ${String(url)}`);
      };
      const { res, payload } = createJsonResponse();
      const req = {
        method: "POST",
        url: "/api/admin?resource=seo/landings",
        headers: { authorization: "Bearer admin-test-token", host: "inmoradar.app" },
        body: { action: "publish_ready_draft", slug: storedLanding.slug, confirm: true }
      };

      try {
        await adminHandler(req, res);
      } finally {
        global.fetch = previousFetch;
      }

      const body = payload();
      assert.equal(res.statusCode, 409);
      assert.equal(body.error, "quality_gate_failed");
      assert.ok(body.quality_gate.quality_score < SEO_INDEX_MIN_SCORE);
      assert.equal(body.published, false);
      assert.equal(body.touched_sitemap, false);
    }
  );
});

test("admin SEO publica ready draft con auditoria y sin tocar sitemap directamente", async () => {
  const { storedLanding } = await buildReadySeoDraftFixture({ id: 206 });
  const previousFetch = global.fetch;
  const seenUrls = [];
  let patchBody = null;

  await withEnv(
    {
      ADMIN_IMPORT_TOKEN: "admin-test-token",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test"
    },
    async () => {
      global.fetch = async (url, options = {}) => {
        const requestUrl = String(url);
        seenUrls.push(requestUrl);
        if (options.method === "PATCH" && requestUrl.includes("/rest/v1/seo_landings?slug=eq.")) {
          patchBody = JSON.parse(options.body);
          return supabaseJson([{ ...storedLanding, ...patchBody }]);
        }
        if (requestUrl.includes("/rest/v1/seo_landings?slug=eq.")) return supabaseJson([storedLanding]);
        throw new Error(`Unexpected fetch ${requestUrl}`);
      };
      const { res, payload } = createJsonResponse();
      const req = {
        method: "POST",
        url: "/api/admin?resource=seo/landings",
        headers: { authorization: "Bearer admin-test-token", host: "inmoradar.app" },
        body: { action: "publish_ready_draft", slug: storedLanding.slug, confirm: true, published_by: "editorial-test" }
      };

      try {
        await adminHandler(req, res);
      } finally {
        global.fetch = previousFetch;
      }

      const body = payload();
      assert.equal(res.statusCode, 200);
      assert.equal(body.action, "publish_ready_draft");
      assert.equal(body.published, true);
      assert.equal(body.indexed, true);
      assert.equal(body.touched_sitemap, false);
      assert.equal(body.landing.status, "published");
      assert.equal(body.landing.index_status, "index");
      assert.ok(body.landing.published_at);
      assert.equal(patchBody.status, "published");
      assert.equal(patchBody.index_status, "index");
      assert.ok(patchBody.published_at);
      assert.equal(patchBody.source_data_json.manual_publish_audit.published_from_state, "ready_to_publish");
      assert.equal(patchBody.source_data_json.manual_publish_audit.previous_status, "ready_to_publish");
      assert.equal(patchBody.source_data_json.manual_publish_audit.confirm, true);
      assert.equal(patchBody.source_data_json.manual_publish_audit.published_by, "editorial-test");
      assert.equal(patchBody.source_data_json.manual_publish_audit.seo_keyword_backlog_id, "45");
      assert.ok(patchBody.source_data_json.manual_publish_audit.quality_score_at_publish >= SEO_INDEX_MIN_SCORE);
      assert.equal(patchBody.source_data_json.manual_publish_audit.quality_gate_at_publish.can_publish, true);
      assert.equal(patchBody.source_data_json.quality_gate_snapshot.can_index, true);
      assert.equal(body.lastmod_source, "published_at");
      assert.equal(seenUrls.some((requestUrl) => requestUrl.includes("sitemap")), false);
    }
  );
});

test("admin SEO no permite publicar ready drafts en batch", async () => {
  const previousFetch = global.fetch;

  await withEnv(
    {
      ADMIN_IMPORT_TOKEN: "admin-test-token",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test"
    },
    async () => {
      global.fetch = async () => {
        throw new Error("Batch publish should not fetch Supabase");
      };
      const { res, payload } = createJsonResponse();
      const req = {
        method: "POST",
        url: "/api/admin?resource=seo/landings",
        headers: { authorization: "Bearer admin-test-token", host: "inmoradar.app" },
        body: { action: "publish_ready_draft", ids: [1, 2], confirm: true }
      };

      try {
        await adminHandler(req, res);
      } finally {
        global.fetch = previousFetch;
      }

      const body = payload();
      assert.equal(res.statusCode, 400);
      assert.equal(body.error, "batch_publish_not_allowed");
      assert.equal(body.published, false);
      assert.equal(body.touched_sitemap, false);
    }
  );
});

test("admin SEO bloquea la accion publish legacy para publicacion manual", async () => {
  const { storedLanding } = await buildReadySeoDraftFixture({ id: 207 });
  const previousFetch = global.fetch;

  await withEnv(
    {
      ADMIN_IMPORT_TOKEN: "admin-test-token",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test"
    },
    async () => {
      global.fetch = async (url, options = {}) => {
        assert.notEqual(options.method, "PATCH");
        if (String(url).includes("/rest/v1/seo_landings?slug=eq.")) return supabaseJson([storedLanding]);
        throw new Error(`Unexpected fetch ${String(url)}`);
      };
      const { res, payload } = createJsonResponse();
      const req = {
        method: "POST",
        url: "/api/admin?resource=seo/landings",
        headers: { authorization: "Bearer admin-test-token", host: "inmoradar.app" },
        body: { action: "publish", slug: storedLanding.slug, confirm: true }
      };

      try {
        await adminHandler(req, res);
      } finally {
        global.fetch = previousFetch;
      }

      const body = payload();
      assert.equal(res.statusCode, 400);
      assert.equal(body.error, "use_publish_ready_draft");
      assert.equal(body.published, false);
      assert.equal(body.touched_sitemap, false);
    }
  );
});

test("admin SEO auto_publish_ready_drafts dry-run no publica", async () => {
  const { storedLanding } = await buildReadySeoDraftFixture({ id: 208 });
  const previousFetch = global.fetch;
  let patchCount = 0;

  await withEnv(
    {
      ADMIN_IMPORT_TOKEN: "admin-test-token",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
      SEO_READY_DRAFT_AUTO_PUBLISH_ENABLED: undefined
    },
    async () => {
      global.fetch = async (url, options = {}) => {
        const requestUrl = String(url);
        if (options.method === "PATCH") patchCount += 1;
        if (requestUrl.includes("status=eq.published") && requestUrl.includes("published_at=gte.")) return supabaseJson([]);
        if (requestUrl.includes("status=eq.ready_to_publish")) return supabaseJson([storedLanding]);
        throw new Error(`Unexpected fetch ${requestUrl}`);
      };
      const { res, payload } = createJsonResponse();
      const req = {
        method: "POST",
        url: "/api/admin?resource=seo/landings",
        headers: { authorization: "Bearer admin-test-token", host: "inmoradar.app" },
        body: { action: "auto_publish_ready_drafts", limit: 3 }
      };

      try {
        await adminHandler(req, res);
      } finally {
        global.fetch = previousFetch;
      }

      const body = payload();
      assert.equal(res.statusCode, 200);
      assert.equal(body.status, "dry_run");
      assert.equal(body.published_count, 0);
      assert.equal(body.would_publish_count, 1);
      assert.equal(body.results[0].status, "would_publish");
      assert.equal(body.touched_sitemap, false);
      assert.equal(patchCount, 0);
    }
  );
});

test("admin SEO auto_publish_ready_drafts exige confirmacion para ejecucion real", async () => {
  await withEnv(
    {
      ADMIN_IMPORT_TOKEN: "admin-test-token",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
      SEO_READY_DRAFT_AUTO_PUBLISH_ENABLED: "true"
    },
    async () => {
      const { res, payload } = createJsonResponse();
      const req = {
        method: "POST",
        url: "/api/admin?resource=seo/landings",
        headers: { authorization: "Bearer admin-test-token", host: "inmoradar.app" },
        body: { action: "auto_publish_ready_drafts", dry_run: false, limit: 1 }
      };

      await adminHandler(req, res);

      const body = payload();
      assert.equal(res.statusCode, 400);
      assert.equal(body.error, "auto_publish_confirmation_required");
      assert.equal(body.published_count, 0);
      assert.equal(body.touched_sitemap, false);
    }
  );
});

test("admin SEO auto_publish_ready_drafts respeta kill switch", async () => {
  await withEnv(
    {
      ADMIN_IMPORT_TOKEN: "admin-test-token",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
      SEO_READY_DRAFT_AUTO_PUBLISH_ENABLED: "false"
    },
    async () => {
      const { res, payload } = createJsonResponse();
      const req = {
        method: "POST",
        url: "/api/admin?resource=seo/landings",
        headers: { authorization: "Bearer admin-test-token", host: "inmoradar.app" },
        body: { action: "auto_publish_ready_drafts", dry_run: false, confirm: true, confirmation: "auto_publish_ready_drafts" }
      };

      await adminHandler(req, res);

      const body = payload();
      assert.equal(res.statusCode, 403);
      assert.equal(body.error, "auto_publish_disabled");
      assert.equal(body.published_count, 0);
    }
  );
});

test("admin SEO auto_publish_ready_drafts omite no ready, score bajo, gate fallido y legacy sin gate", async () => {
  const base = await buildReadySeoDraftFixture({ id: 209 });
  const notReady = { ...base.storedLanding, id: 210, slug: "no-ready", status: "needs_review" };
  const lowScore = {
    ...base.storedLanding,
    id: 211,
    slug: "low-score",
    canonical_url: "https://inmoradar.app/low-score/",
    body_html: "<article><h1>Low score</h1><p>Fuente: test. Fecha del dato: 2026-05-24.</p></article>"
  };
  const gateFailed = {
    ...base.storedLanding,
    id: 212,
    slug: "gate-failed",
    canonical_url: "https://inmoradar.app/gate-failed/",
    body_html: base.storedLanding.body_html.replace(/data-install-button/g, "data-install-disabled")
  };
  const legacyNoGate = {
    ...base.storedLanding,
    id: 213,
    slug: "legacy-no-gate",
    canonical_url: "https://inmoradar.app/legacy-no-gate/",
    source_data_json: { ...base.storedLanding.source_data_json, quality_gate: null }
  };
  const previousFetch = global.fetch;
  let patchCount = 0;

  await withEnv(
    {
      ADMIN_IMPORT_TOKEN: "admin-test-token",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
      SEO_READY_DRAFT_AUTO_PUBLISH_ENABLED: "true"
    },
    async () => {
      global.fetch = async (url, options = {}) => {
        const requestUrl = String(url);
        if (options.method === "PATCH") patchCount += 1;
        if (requestUrl.includes("status=eq.published") && requestUrl.includes("published_at=gte.")) return supabaseJson([]);
        if (requestUrl.includes("status=eq.ready_to_publish")) return supabaseJson([notReady, lowScore, gateFailed, legacyNoGate]);
        throw new Error(`Unexpected fetch ${requestUrl}`);
      };
      const { res, payload } = createJsonResponse();
      const req = {
        method: "POST",
        url: "/api/admin?resource=seo/landings",
        headers: { authorization: "Bearer admin-test-token", host: "inmoradar.app" },
        body: { action: "auto_publish_ready_drafts", dry_run: false, confirm: true, confirmation: "auto_publish_ready_drafts", limit: 3 }
      };

      try {
        await adminHandler(req, res);
      } finally {
        global.fetch = previousFetch;
      }

      const body = payload();
      assert.equal(res.statusCode, 200);
      assert.equal(body.published_count, 0);
      assert.equal(body.skipped_count, 4);
      assert.equal(patchCount, 0);
      assert.deepEqual(
        body.results.map((result) => result.reason),
        ["not_ready_to_publish", "quality_score_below_80", "measurable_cta", "quality_gate_not_calculated"]
      );
      assert.equal(body.touched_sitemap, false);
    }
  );
});

test("admin SEO auto_publish_ready_drafts publica hasta el limite duro y guarda auditoria", async () => {
  const base = await buildReadySeoDraftFixture({ id: 214 });
  const candidates = Array.from({ length: 4 }, (_, index) => ({
    ...base.storedLanding,
    id: 214 + index,
    slug: `ready-auto-${index + 1}`,
    canonical_url: `https://inmoradar.app/ready-auto-${index + 1}/`
  }));
  const previousFetch = global.fetch;
  const patches = [];
  const seenUrls = [];

  await withEnv(
    {
      ADMIN_IMPORT_TOKEN: "admin-test-token",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
      SEO_READY_DRAFT_AUTO_PUBLISH_ENABLED: "true",
      SEO_READY_DRAFT_AUTO_PUBLISH_MAX_PER_DAY: "5"
    },
    async () => {
      global.fetch = async (url, options = {}) => {
        const requestUrl = String(url);
        seenUrls.push(requestUrl);
        if (requestUrl.includes("status=eq.published") && requestUrl.includes("published_at=gte.")) return supabaseJson([]);
        if (requestUrl.includes("status=eq.ready_to_publish")) return supabaseJson(candidates);
        if (options.method === "PATCH" && requestUrl.includes("/rest/v1/seo_landings?slug=eq.")) {
          const patchBody = JSON.parse(options.body);
          patches.push(patchBody);
          const slug = decodeURIComponent(requestUrl.match(/slug=eq\.([^&]+)/)?.[1] || "");
          const original = candidates.find((candidate) => candidate.slug === slug) || candidates[0];
          return supabaseJson([{ ...original, ...patchBody }]);
        }
        throw new Error(`Unexpected fetch ${requestUrl}`);
      };
      const { res, payload } = createJsonResponse();
      const req = {
        method: "POST",
        url: "/api/admin?resource=seo/landings",
        headers: { authorization: "Bearer admin-test-token", host: "inmoradar.app" },
        body: { action: "auto_publish_ready_drafts", dry_run: false, confirm: true, confirmation: "auto_publish_ready_drafts", limit: 10 }
      };

      try {
        await adminHandler(req, res);
      } finally {
        global.fetch = previousFetch;
      }

      const body = payload();
      assert.equal(res.statusCode, 200);
      assert.equal(body.config.limit, 3);
      assert.equal(body.config.hard_limit, 3);
      assert.equal(body.published_count, 3);
      assert.equal(body.results.filter((result) => result.status === "published").length, 3);
      assert.equal(patches.length, 3);
      assert.equal(patches.every((patch) => patch.status === "published"), true);
      assert.equal(patches.every((patch) => patch.index_status === "index"), true);
      assert.equal(patches.every((patch) => patch.source_data_json.auto_publish_audit.source === "auto_publish_ready_drafts"), true);
      assert.equal(patches.every((patch) => patch.source_data_json.auto_publish_audit.dry_run === false), true);
      assert.equal(patches.every((patch) => patch.source_data_json.auto_publish_audit.confirm === true), true);
      assert.equal(patches.every((patch) => patch.source_data_json.quality_gate_snapshot.can_index === true), true);
      assert.equal(body.touched_sitemap, false);
      assert.equal(seenUrls.some((requestUrl) => requestUrl.includes("sitemap")), false);
    }
  );
});

test("admin SEO auto_publish_ready_drafts respeta limite diario", async () => {
  const { storedLanding } = await buildReadySeoDraftFixture({ id: 220 });
  const previousFetch = global.fetch;

  await withEnv(
    {
      ADMIN_IMPORT_TOKEN: "admin-test-token",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
      SEO_READY_DRAFT_AUTO_PUBLISH_ENABLED: "true",
      SEO_READY_DRAFT_AUTO_PUBLISH_MAX_PER_DAY: "1"
    },
    async () => {
      global.fetch = async (url, options = {}) => {
        const requestUrl = String(url);
        assert.notEqual(options.method, "PATCH");
        if (requestUrl.includes("status=eq.published") && requestUrl.includes("published_at=gte.")) {
          return supabaseJson([{ id: 1, published_at: new Date().toISOString(), source_data_json: { auto_publish_audit: { source: "auto_publish_ready_drafts" } } }]);
        }
        if (requestUrl.includes("status=eq.ready_to_publish")) return supabaseJson([storedLanding]);
        throw new Error(`Unexpected fetch ${requestUrl}`);
      };
      const { res, payload } = createJsonResponse();
      const req = {
        method: "POST",
        url: "/api/admin?resource=seo/landings",
        headers: { authorization: "Bearer admin-test-token", host: "inmoradar.app" },
        body: { action: "auto_publish_ready_drafts", dry_run: false, confirm: true, confirmation: "auto_publish_ready_drafts", limit: 1 }
      };

      try {
        await adminHandler(req, res);
      } finally {
        global.fetch = previousFetch;
      }

      const body = payload();
      assert.equal(res.statusCode, 200);
      assert.equal(body.status, "skipped");
      assert.equal(body.reason, "daily_limit_reached");
      assert.equal(body.published_count, 0);
      assert.equal(body.touched_sitemap, false);
    }
  );
});

test("admin SEO auto_publish_ready_drafts no permite ids en lote", async () => {
  await withEnv(
    {
      ADMIN_IMPORT_TOKEN: "admin-test-token",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test"
    },
    async () => {
      const { res, payload } = createJsonResponse();
      const req = {
        method: "POST",
        url: "/api/admin?resource=seo/landings",
        headers: { authorization: "Bearer admin-test-token", host: "inmoradar.app" },
        body: { action: "auto_publish_ready_drafts", ids: [1, 2], dry_run: false, confirm: true }
      };

      await adminHandler(req, res);

      const body = payload();
      assert.equal(res.statusCode, 400);
      assert.equal(body.error, "batch_publish_not_allowed");
      assert.equal(body.published, false);
    }
  );
});

test("admin SEO autonomous pipeline exige confirmacion para ejecucion real", async () => {
  await withEnv(
    {
      ADMIN_IMPORT_TOKEN: "admin-test-token",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
      SEO_AUTONOMOUS_PIPELINE_ENABLED: "true"
    },
    async () => {
      const { res, payload } = createJsonResponse();
      const req = {
        method: "POST",
        url: "/api/admin?resource=seo/automation",
        headers: { authorization: "Bearer admin-test-token", host: "inmoradar.app" },
        body: { action: "run_autonomous_cycle", dry_run: false }
      };

      await adminHandler(req, res);

      const body = payload();
      assert.equal(res.statusCode, 400);
      assert.equal(body.error, "autonomous_pipeline_confirmation_required");
      assert.equal(body.touched_sitemap, false);
    }
  );
});

test("admin SEO autonomous pipeline respeta kill switch principal", async () => {
  await withEnv(
    {
      ADMIN_IMPORT_TOKEN: "admin-test-token",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
      SEO_AUTONOMOUS_PIPELINE_ENABLED: "false"
    },
    async () => {
      const { res, payload } = createJsonResponse();
      const req = {
        method: "POST",
        url: "/api/admin?resource=seo/automation",
        headers: { authorization: "Bearer admin-test-token", host: "inmoradar.app" },
        body: { action: "run_autonomous_cycle", dry_run: false, confirm: true, confirmation: "run_autonomous_cycle" }
      };

      await adminHandler(req, res);

      const body = payload();
      assert.equal(res.statusCode, 403);
      assert.equal(body.error, "autonomous_pipeline_disabled");
      assert.equal(body.touched_sitemap, false);
    }
  );
});

test("admin SEO autonomous pipeline dry-run no persiste contenido y guarda run log", async () => {
  const idea = { ...SEO_KEYWORD_BACKLOG_SEEDS[3], id: 301, status: "idea", risk_level: "baja" };
  const highRisk = { ...SEO_KEYWORD_BACKLOG_SEEDS[9], id: 302, status: "idea", risk_level: "alta" };
  const briefReady = {
    ...SEO_KEYWORD_BACKLOG_SEEDS[7],
    id: 303,
    status: "brief_ready",
    brief_json: buildSeoKeywordBrief({ ...SEO_KEYWORD_BACKLOG_SEEDS[7], id: 303 })
  };
  const approvalBase = await buildReadySeoDraftFixture({ id: 304 });
  const approvalDraft = {
    ...approvalBase.storedLanding,
    status: "needs_review",
    slug: "autonomous-approval-dry-run",
    canonical_url: "https://inmoradar.app/autonomous-approval-dry-run/"
  };
  const readyBase = await buildReadySeoDraftFixture({ id: 305 });
  const readyDraft = {
    ...readyBase.storedLanding,
    slug: "autonomous-ready-dry-run",
    canonical_url: "https://inmoradar.app/autonomous-ready-dry-run/"
  };
  const previousFetch = global.fetch;
  const contentWrites = [];
  const runLogs = [];

  await withEnv(
    {
      ADMIN_IMPORT_TOKEN: "admin-test-token",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
      SEO_AUTONOMOUS_PIPELINE_ENABLED: undefined,
      SEO_READY_DRAFT_AUTO_PUBLISH_ENABLED: undefined
    },
    async () => {
      global.fetch = async (url, options = {}) => {
        const requestUrl = String(url);
        const method = String(options.method || "GET").toUpperCase();
        if (method === "POST" && requestUrl.endsWith("/rest/v1/seo_autonomous_pipeline_runs")) {
          const runBody = JSON.parse(options.body);
          runLogs.push(runBody);
          return supabaseJson([{ ...runBody, id: "run-dry" }]);
        }
        if (["PATCH", "POST", "DELETE"].includes(method)) contentWrites.push(requestUrl);
        if (requestUrl.includes("seo_keyword_backlog") && requestUrl.includes("status=eq.idea")) return supabaseJson([highRisk, idea]);
        if (requestUrl.includes("seo_keyword_backlog") && requestUrl.includes("status=eq.brief_ready")) return supabaseJson([briefReady]);
        if (requestUrl.includes("/rest/v1/seo_landings?slug=eq.")) return supabaseJson([]);
        if (requestUrl.includes("seo_landings") && requestUrl.includes("status=in.")) return supabaseJson([approvalDraft]);
        if (requestUrl.includes("status=eq.published") && requestUrl.includes("published_at=gte.")) return supabaseJson([]);
        if (requestUrl.includes("status=eq.ready_to_publish")) return supabaseJson([readyDraft]);
        throw new Error(`Unexpected fetch ${requestUrl}`);
      };

      const { res, payload } = createJsonResponse();
      const req = {
        method: "POST",
        url: "/api/admin?resource=seo/automation",
        headers: { authorization: "Bearer admin-test-token", host: "inmoradar.app" },
        body: { action: "run_autonomous_cycle" }
      };

      try {
        await adminHandler(req, res);
      } finally {
        global.fetch = previousFetch;
      }

      const body = payload();
      assert.equal(res.statusCode, 200);
      assert.equal(body.dry_run, true);
      assert.equal(body.phases.auto_generate_briefs.changed_count, 1);
      assert.equal(body.phases.auto_generate_briefs.items.some((item) => item.reason === "risk_level_high"), true);
      assert.equal(body.phases.auto_create_drafts.changed_count, 1);
      assert.equal(body.phases.auto_approve_high_quality_drafts.changed_count, 1);
      assert.equal(body.summary.would_publish_count, 1);
      assert.equal(body.touched_sitemap, false);
      assert.equal(contentWrites.length, 0);
      assert.equal(runLogs.length, 1);
      assert.equal(runLogs[0].dry_run, true);
      assert.equal(runLogs[0].status, "dry_run");
      assert.equal(runLogs[0].published_count, 0);
      assert.equal(runLogs[0].would_publish_count, 1);
      assert.equal(runLogs[0].touched_sitemap, false);
      assert.equal(runLogs[0].skipped_items_json.some((item) => item.reason === "risk_level_high"), true);
      assert.equal(body.run_log.persisted, true);
    }
  );
});

test("admin SEO autonomous pipeline real crea, autoaprueba y autopublica con auditoria limitada", async () => {
  const idea = { ...SEO_KEYWORD_BACKLOG_SEEDS[3], id: 401, status: "idea", risk_level: "baja" };
  const briefReady = {
    ...SEO_KEYWORD_BACKLOG_SEEDS[7],
    id: 402,
    status: "brief_ready",
    brief_json: buildSeoKeywordBrief({ ...SEO_KEYWORD_BACKLOG_SEEDS[7], id: 402 })
  };
  const approvalBase = await buildReadySeoDraftFixture({ id: 403 });
  const approvalDraft = {
    ...approvalBase.storedLanding,
    status: "needs_review",
    slug: "autonomous-approval-real",
    canonical_url: "https://inmoradar.app/autonomous-approval-real/"
  };
  const publishBase = await buildReadySeoDraftFixture({ id: 404 });
  const publishDraft = {
    ...publishBase.storedLanding,
    slug: "autonomous-publish-real",
    canonical_url: "https://inmoradar.app/autonomous-publish-real/"
  };
  const previousFetch = global.fetch;
  const keywordPatches = [];
  const landingPosts = [];
  const landingPatches = [];
  const runLogs = [];

  await withEnv(
    {
      ADMIN_IMPORT_TOKEN: "admin-test-token",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
      SEO_AUTONOMOUS_PIPELINE_ENABLED: "true",
      SEO_READY_DRAFT_AUTO_PUBLISH_ENABLED: "true",
      SEO_READY_DRAFT_AUTO_PUBLISH_MAX_PER_DAY: "5"
    },
    async () => {
      global.fetch = async (url, options = {}) => {
        const requestUrl = String(url);
        const method = String(options.method || "GET").toUpperCase();
        if (requestUrl.includes("seo_keyword_backlog") && requestUrl.includes("status=eq.idea")) return supabaseJson([idea]);
        if (requestUrl.includes("seo_keyword_backlog") && requestUrl.includes("status=eq.brief_ready")) return supabaseJson([briefReady]);
        if (method === "PATCH" && requestUrl.includes("seo_keyword_backlog?id=eq.")) {
          const patchBody = JSON.parse(options.body);
          keywordPatches.push(patchBody);
          const source = requestUrl.includes("401") ? idea : briefReady;
          return supabaseJson([{ ...source, ...patchBody }]);
        }
        if (method === "POST" && requestUrl.endsWith("/rest/v1/seo_landings")) {
          const postBody = JSON.parse(options.body);
          landingPosts.push(postBody);
          return supabaseJson([{ ...postBody, id: 500 }]);
        }
        if (method === "POST" && requestUrl.endsWith("/rest/v1/seo_autonomous_pipeline_runs")) {
          const runBody = JSON.parse(options.body);
          runLogs.push(runBody);
          return supabaseJson([{ ...runBody, id: "run-real" }]);
        }
        if (requestUrl.includes("/rest/v1/seo_landings?slug=eq.")) {
          if (method === "PATCH") {
            const patchBody = JSON.parse(options.body);
            landingPatches.push(patchBody);
            const original = patchBody.status === "published" ? publishDraft : approvalDraft;
            return supabaseJson([{ ...original, ...patchBody }]);
          }
          return supabaseJson([]);
        }
        if (requestUrl.includes("seo_landings") && requestUrl.includes("status=in.")) return supabaseJson([approvalDraft]);
        if (requestUrl.includes("status=eq.published") && requestUrl.includes("published_at=gte.")) return supabaseJson([]);
        if (requestUrl.includes("status=eq.ready_to_publish")) return supabaseJson([publishDraft]);
        throw new Error(`Unexpected fetch ${requestUrl}`);
      };

      const { res, payload } = createJsonResponse();
      const req = {
        method: "POST",
        url: "/api/admin?resource=seo/automation",
        headers: { authorization: "Bearer admin-test-token", host: "inmoradar.app" },
        body: {
          action: "run_autonomous_cycle",
          dry_run: false,
          confirm: true,
          confirmation: "run_autonomous_cycle",
          brief_limit: 5,
          draft_limit: 3,
          approval_limit: 3,
          publish_limit: 1
        }
      };

      try {
        await adminHandler(req, res);
      } finally {
        global.fetch = previousFetch;
      }

      const body = payload();
      assert.equal(res.statusCode, 200);
      assert.equal(body.dry_run, false);
      assert.equal(body.phases.auto_generate_briefs.changed_count, 1);
      assert.equal(body.phases.auto_create_drafts.changed_count, 1);
      assert.equal(body.phases.auto_approve_high_quality_drafts.changed_count, 1);
      assert.equal(body.summary.published_count, 1);
      assert.equal(body.touched_sitemap, false);
      assert.equal(keywordPatches.some((patch) => patch.status === "brief_ready" && patch.brief_json), true);
      assert.equal(keywordPatches.some((patch) => patch.status === "draft"), true);
      assert.equal(landingPosts.length, 1);
      assert.equal(landingPosts[0].published_at, null);
      assert.equal(landingPosts[0].index_status, "noindex");
      assert.equal(landingPosts[0].source_data_json.autonomous_pipeline.source, "run_autonomous_cycle");
      assert.equal(landingPatches.some((patch) => patch.status === "ready_to_publish" && patch.source_data_json.auto_approval_audit), true);
      assert.equal(landingPatches.some((patch) => patch.status === "published" && patch.source_data_json.auto_publish_audit), true);
      assert.equal(landingPatches.some((patch) => patch.source_data_json.quality_gate_snapshot?.can_index === true), true);
      assert.equal(runLogs.length, 1);
      assert.equal(runLogs[0].dry_run, false);
      assert.equal(runLogs[0].status, "published");
      assert.equal(runLogs[0].briefs_generated_count, 1);
      assert.equal(runLogs[0].drafts_created_count, 1);
      assert.equal(runLogs[0].auto_approved_count, 1);
      assert.equal(runLogs[0].published_count, 1);
      assert.deepEqual(runLogs[0].published_slugs, ["autonomous-publish-real"]);
      assert.equal(runLogs[0].phases_json.auto_publish_ready_drafts.items[0].landing, undefined);
      assert.equal(body.run_log.persisted, true);
    }
  );
});

test("admin SEO autonomous pipeline no autoaprueba score menor de 90", async () => {
  const lowBase = await buildReadySeoDraftFixture({ id: 405 });
  const lowDraft = {
    ...lowBase.storedLanding,
    status: "needs_review",
    slug: "autonomous-low-score",
    canonical_url: "https://inmoradar.app/autonomous-low-score/",
    body_html:
      "<article><h1>Low score</h1><p>Fuente: test. Fecha del dato: 2026-05-24.</p><p>Referencia orientativa, no es una tasacion y no garantiza el precio real.</p><button data-install-button data-install-source=\"seo_test\">Instalar InmoRadar</button><a href=\"/\">Inicio</a><a href=\"/analizar-anuncio-inmobiliario/\">Analizar anuncio</a></article>"
  };
  const previousFetch = global.fetch;
  let patchCount = 0;

  await withEnv(
    {
      ADMIN_IMPORT_TOKEN: "admin-test-token",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test"
    },
    async () => {
      global.fetch = async (url, options = {}) => {
        const requestUrl = String(url);
        if (String(options.method || "GET").toUpperCase() === "POST" && requestUrl.endsWith("/rest/v1/seo_autonomous_pipeline_runs")) {
          return supabaseJson([{ execution_id: "run-low-score" }]);
        }
        if (options.method === "PATCH") patchCount += 1;
        if (requestUrl.includes("seo_keyword_backlog") && requestUrl.includes("status=eq.idea")) return supabaseJson([]);
        if (requestUrl.includes("seo_keyword_backlog") && requestUrl.includes("status=eq.brief_ready")) return supabaseJson([]);
        if (requestUrl.includes("seo_landings") && requestUrl.includes("status=in.")) return supabaseJson([lowDraft]);
        if (requestUrl.includes("status=eq.published") && requestUrl.includes("published_at=gte.")) return supabaseJson([]);
        if (requestUrl.includes("status=eq.ready_to_publish")) return supabaseJson([]);
        throw new Error(`Unexpected fetch ${requestUrl}`);
      };

      const { res, payload } = createJsonResponse();
      const req = {
        method: "POST",
        url: "/api/admin?resource=seo/automation",
        headers: { authorization: "Bearer admin-test-token", host: "inmoradar.app" },
        body: { action: "run_autonomous_cycle" }
      };

      try {
        await adminHandler(req, res);
      } finally {
        global.fetch = previousFetch;
      }

      const body = payload();
      assert.equal(res.statusCode, 200);
      assert.equal(body.phases.auto_approve_high_quality_drafts.items[0].reason, "quality_score_below_90");
      assert.equal(body.phases.auto_approve_high_quality_drafts.changed_count, 0);
      assert.equal(patchCount, 0);
      assert.equal(body.touched_sitemap, false);
    }
  );
});

test("admin SEO autonomous pipeline lista runs persistidos para BackOffice", async () => {
  const previousFetch = global.fetch;
  const storedRun = {
    id: "run-1",
    execution_id: "seo_auto_cycle_test",
    started_at: "2026-05-24T10:00:00.000Z",
    finished_at: "2026-05-24T10:00:10.000Z",
    status: "published",
    dry_run: false,
    briefs_generated_count: 1,
    drafts_created_count: 1,
    auto_approved_count: 1,
    published_count: 1,
    skipped_count: 2,
    failed_count: 0,
    touched_sitemap: false,
    published_slugs: ["autonomous-publish-real"],
    skipped_items_json: [{ slug: "legacy", reason: "quality_gate_not_calculated" }],
    failed_items_json: [],
    phases_json: { auto_publish_ready_drafts: { items: [{ slug: "autonomous-publish-real", status: "published" }] } },
    summary_json: { published_count: 1, skipped_count: 2, touched_sitemap: false }
  };

  await withEnv(
    {
      ADMIN_IMPORT_TOKEN: "admin-test-token",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test"
    },
    async () => {
      global.fetch = async (url, options = {}) => {
        const requestUrl = String(url);
        assert.notEqual(options.method, "POST");
        if (requestUrl.includes("seo_autonomous_pipeline_runs?select=*&order=started_at.desc")) return supabaseJson([storedRun]);
        throw new Error(`Unexpected fetch ${requestUrl}`);
      };

      const { res, payload } = createJsonResponse();
      const req = {
        method: "GET",
        url: "/api/admin?resource=seo/automation",
        headers: { authorization: "Bearer admin-test-token", host: "inmoradar.app" }
      };

      try {
        await adminHandler(req, res);
      } finally {
        global.fetch = previousFetch;
      }

      const body = payload();
      assert.equal(res.statusCode, 200);
      assert.equal(body.ok, true);
      assert.equal(body.runs.length, 1);
      assert.equal(body.runs[0].execution_id, "seo_auto_cycle_test");
      assert.equal(body.runs[0].published_slugs[0], "autonomous-publish-real");
      assert.equal(body.storage.runs_table_missing, false);
    }
  );
});

test("admin SEO protege landings legacy publicadas del flujo de review de drafts", async () => {
  const storedLanding = {
    id: 104,
    slug: "landing-publicada",
    title: "Landing publicada",
    meta_title: "Landing publicada | InmoRadar",
    meta_description: "Landing publicada que no debe editarse desde el flujo de drafts.",
    h1: "Landing publicada",
    body_html: "<p>Contenido publicado.</p>",
    city: "Madrid",
    template_type: "editorial_guide",
    status: "published",
    index_status: "index",
    quality_score: 90,
    word_count: 900,
    canonical_url: "https://inmoradar.app/landing-publicada/",
    published_at: "2026-05-24T10:00:00.000Z",
    source_data_json: {}
  };
  const previousFetch = global.fetch;

  await withEnv(
    {
      ADMIN_IMPORT_TOKEN: "admin-test-token",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test"
    },
    async () => {
      global.fetch = async (url, options = {}) => {
        assert.notEqual(options.method, "PATCH");
        if (String(url).includes("/rest/v1/seo_landings?slug=eq.")) return supabaseJson([storedLanding]);
        throw new Error(`Unexpected fetch ${String(url)}`);
      };
      const { res, payload } = createJsonResponse();
      const req = {
        method: "POST",
        url: "/api/admin?resource=seo/landings",
        headers: { authorization: "Bearer admin-test-token", host: "inmoradar.app" },
        body: { action: "update_draft", slug: storedLanding.slug, patch: { h1: "Cambio no permitido" } }
      };

      try {
        await adminHandler(req, res);
      } finally {
        global.fetch = previousFetch;
      }

      const body = payload();
      assert.equal(res.statusCode, 409);
      assert.equal(body.error, "not_reviewable_draft_status");
      assert.equal(body.published, false);
      assert.equal(body.indexed, false);
      assert.equal(body.touched_sitemap, false);
    }
  );
});

test("admin SEO recalculo de quality_gate falla seguro si la landing no existe", async () => {
  const previousFetch = global.fetch;

  await withEnv(
    {
      ADMIN_IMPORT_TOKEN: "admin-test-token",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test"
    },
    async () => {
      global.fetch = async (url, options = {}) => {
        assert.notEqual(options.method, "PATCH");
        if (String(url).includes("/rest/v1/seo_landings?slug=eq.no-existe")) return supabaseJson([]);
        throw new Error(`Unexpected fetch ${String(url)}`);
      };
      const { res, payload } = createJsonResponse();
      const req = {
        method: "POST",
        url: "/api/admin?resource=seo/landings",
        headers: { authorization: "Bearer admin-test-token", host: "inmoradar.app" },
        body: { action: "recalculate_quality_gate", slug: "no-existe" }
      };

      try {
        await adminHandler(req, res);
      } finally {
        global.fetch = previousFetch;
      }

      assert.equal(res.statusCode, 404);
      assert.equal(payload().error, "landing_not_found");
    }
  );
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
