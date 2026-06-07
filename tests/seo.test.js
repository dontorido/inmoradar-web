const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { buildPriceCitySourceData } = require("../api/_seo/marketSources");
const { buildPriceCityLanding } = require("../api/_seo/priceCity");
const { calculateSeoLandingQuality } = require("../api/_seo/quality");
const { canPublishNow, runSeoLandingGeneration } = require("../api/_seo/generator");
const { runSeoContentPublication } = require("../api/_seo/contentPublisher");
const { evaluateLandingIndexability, evaluateSitemapEligibility } = require("../api/_seo/indexability");
const { buildSeoDailyPolicySnapshot, selectNextSeoContentType } = require("../api/_seo/publishingPolicy");
const { getSeedPublishedLanding } = require("../api/_seo/seedPublished");
const { siteUrl } = require("../api/_seo/text");
const sitemapHandler = require("../api/sitemap");
const seoPageHandler = require("../api/seo-page");
const { renderLandingHtml } = require("../api/seo-page");

function extractJsonLd(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => JSON.parse(match[1]));
}

function qualityFixture(overrides = {}) {
  const repeatedCityCopy = "Madrid mercado vivienda precio barrio referencia comprador ".repeat(130);
  const bodyHtml = `
    <header data-city-specific="true"><h1>Precio del metro cuadrado en Madrid</h1></header>
    <section data-city-specific="true"><p>${repeatedCityCopy}</p><p><strong>Fuente:</strong> MIVAU. <strong>Fecha del dato:</strong> 4T 2025.</p></section>
    <section data-city-specific="true"><p>${repeatedCityCopy}</p><a href="/datos">Datos</a><a href="/metodologia">Metodologia</a></section>
    <section data-city-specific="true"><button>EMPEZAR GRATIS</button></section>
  `;
  const landing = {
    slug: "precio-metro-cuadrado/madrid",
    title: "Precio del metro cuadrado en Madrid",
    meta_title: "Precio m2 en Madrid con fuente actualizada",
    meta_description: "Consulta una referencia de precio por metro cuadrado en Madrid, con fuente, fecha y pautas para comparar anuncios.",
    h1: "Precio del metro cuadrado en Madrid",
    body_html: bodyHtml,
    city: "Madrid",
    template_type: "price_city",
    canonical_url: "https://inmoradar.app/precio-metro-cuadrado/madrid/",
    ...overrides
  };
  const sourceData = {
    hasRealData: true,
    hasProvincialOnly: false,
    records: [
      {
        source: "mivau_appraisal",
        source_url: "https://example.com/mivau.csv",
        period_label: "4T 2025",
        geo_level: "municipality"
      }
    ],
    faq: [
      { question: "Uno", answer: "Uno" },
      { question: "Dos", answer: "Dos" },
      { question: "Tres", answer: "Tres" },
      { question: "Cuatro", answer: "Cuatro" }
    ]
  };
  return { landing, sourceData };
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

test("quality gate acepta CTA actual EMPEZAR GRATIS", () => {
  const { landing, sourceData } = qualityFixture();
  const quality = calculateSeoLandingQuality(landing, sourceData);

  assert.ok(quality.score >= 75);
  assert.ok(quality.signals.includes("CTA claro"));
  assert.equal(quality.editorial_quality_status, "pass");
});

test("quality gate penaliza mojibake claro", () => {
  const fixture = qualityFixture();
  const quality = calculateSeoLandingQuality(
    {
      ...fixture.landing,
      body_html: `${fixture.landing.body_html}<p>Texto roto \u00c3\u00a1 \u00c3\u00b1 \u00c2\u00a0</p>`
    },
    fixture.sourceData
  );

  assert.ok(quality.penalties.includes("posible mojibake o caracteres rotos"));
  assert.ok(quality.warnings.some((warning) => /encoding/.test(warning)));
  assert.equal(quality.technical_indexability_status, "blocked");
});

test("quality gate penaliza canonical externo o incoherente", () => {
  const { landing, sourceData } = qualityFixture({
    canonical_url: "https://example.com/precio-metro-cuadrado/madrid/"
  });
  const quality = calculateSeoLandingQuality(landing, sourceData);

  assert.ok(quality.penalties.includes("canonical externo o dominio no canonico"));
  assert.ok(quality.rejection_reasons.includes("canonical_incoherent"));
  assert.equal(quality.technical_indexability_status, "blocked");
});

test("quality gate permite menciones descriptivas a portales de terceros", () => {
  const { landing, sourceData } = qualityFixture();
  const quality = calculateSeoLandingQuality(
    {
      ...landing,
      body_html: `${landing.body_html}<p>Tambien sirve para comparar anuncios publicados en Idealista, Fotocasa, Habitaclia y Pisos.com.</p>`
    },
    sourceData
  );

  assert.equal(quality.penalties.includes("uso potencialmente arriesgado de marca de tercero"), false);
  assert.equal(quality.editorial_quality_status, "pass");
});

test("quality gate marca riesgo cuando una marca de tercero sugiere oficialidad", () => {
  const { landing, sourceData } = qualityFixture();
  const quality = calculateSeoLandingQuality(
    {
      ...landing,
      body_html: `${landing.body_html}<p>InmoRadar es partner oficial de Idealista para analizar anuncios.</p>`
    },
    sourceData
  );

  assert.ok(quality.penalties.includes("uso potencialmente arriesgado de marca de tercero"));
  assert.equal(quality.editorial_quality_status, "review");
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

test("la publicacion SEO operativa selecciona guias cuando falta cuota editorial", async () => {
  const calls = [];
  const storage = {
    async startRun() {
      return { persisted: false, acquired: true };
    },
    async finishRun() {},
    async fetchRecentPublishedRows() {
      return [
        { template_type: "price_city", status: "published", published_at: "2026-05-22T08:00:00.000Z" },
        { template_type: "rent_city", status: "published", published_at: "2026-05-22T09:00:00.000Z" },
        { template_type: "editorial_guide", status: "published", published_at: "2026-05-22T10:00:00.000Z" }
      ];
    }
  };
  const result = await runSeoContentPublication({
    now: "2026-05-22T12:00:00.000Z",
    requestSource: "cron",
    storage,
    config: { enabled: true, dryRun: false },
    runGeneration: async (options) => {
      calls.push(options);
      return {
        ok: true,
        mode: "publish",
        template_type: options.template_type,
        content_type: "news",
        generated_count: 1,
        published_count: 1,
        results: [
          {
            slug: "guias/antes-de-llamar-por-un-piso",
            template_type: "editorial_guide",
            quality_score: 94,
            status: "published",
            index_status: "index"
          }
        ]
      };
    }
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].template_type, "editorial_guide");
  assert.equal(calls[0].dailyPublishLimit, 4);
  assert.equal(calls[0].maxPublishesPerRun, 1);
  assert.equal(result.selected_content_type, "news");
  assert.equal(result.published_news_today, 2);
  assert.equal(result.published_landings_today, 2);
  assert.equal(result.results[0].target_path, "/guias/antes-de-llamar-por-un-piso/");
});

test("la publicacion SEO operativa respeta el cupo diario 2 landings + 2 guias", async () => {
  let called = false;
  const result = await runSeoContentPublication({
    now: "2026-05-22T12:00:00.000Z",
    requestSource: "cron",
    storage: {
      async startRun() {
        return { persisted: false, acquired: true };
      },
      async finishRun() {},
      async fetchRecentPublishedRows() {
        return [
          { template_type: "price_city", status: "published", published_at: "2026-05-22T08:00:00.000Z" },
          { template_type: "rent_city", status: "published", published_at: "2026-05-22T09:00:00.000Z" },
          { template_type: "editorial_guide", status: "published", published_at: "2026-05-22T10:00:00.000Z" },
          { template_type: "editorial_guide", status: "published", published_at: "2026-05-22T11:00:00.000Z" }
        ];
      }
    },
    config: { enabled: true, dryRun: false },
    runGeneration: async () => {
      called = true;
      return { ok: true, generated_count: 1, published_count: 1, results: [] };
    }
  });

  assert.equal(called, false);
  assert.equal(result.published_count, 0);
  assert.equal(result.reason, "daily_total_quota_reached");
  assert.equal(result.skipped_reason, "daily_total_quota_reached");
});

test("la publicacion SEO exige score editorial minimo antes de publicar", () => {
  const base = {
    mode: "publish",
    autoPublish: true,
    publishedToday: 0,
    publishedThisRun: 0,
    dailyPublishLimit: 4,
    maxPublishesPerRun: 1
  };

  assert.equal(canPublishNow({ ...base, quality: { score: 84 } }), false);
  assert.equal(canPublishNow({ ...base, quality: { score: 85 } }), true);
  assert.equal(canPublishNow({ ...base, quality: { score: 95, technical_indexability_status: "blocked" } }), false);
  assert.equal(canPublishNow({ ...base, quality: { score: 95, rejection_reasons: ["canonical_incoherent"] } }), false);
  assert.equal(canPublishNow({ ...base, quality: { score: 100 }, publishedToday: 4 }), false);
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
  assert.match(html, /<link rel="canonical" href="https:\/\/inmoradar\.app\/saber-si-piso-esta-caro\/granada\/">/);
  assert.match(html, /"@type":"BreadcrumbList"/);
  assert.doesNotMatch(html, /position":4/);
  assert.doesNotMatch(html, /<link rel="canonical" href="https:\/\/www\.inmoradar\.app\//);
  assert.match(html, /@media \(max-width: 560px\)/);
  assert.match(html, /overflow-x: hidden/);
  assert.doesNotMatch(html, /Plantilla antigua sin tildes/);
});

test("expensive_listing_city genera breadcrumbs JSON-LD sin items intermedios huerfanos", () => {
  for (const city of ["Granada", "Madrid"]) {
    const slugCity = city.toLowerCase();
    const canonical = `https://inmoradar.app/saber-si-piso-esta-caro/${slugCity}/`;
    const html = renderLandingHtml({
      slug: `saber-si-piso-esta-caro/${slugCity}`,
      title: `Como saber si un piso esta caro en ${city}`,
      meta_title: `Como saber si un piso esta caro en ${city}`,
      meta_description: "Guia para comparar el precio de un piso antes de contactar.",
      h1: `Como saber si un piso esta caro en ${city}`,
      body_html: "<article><h1>Plantilla antigua sin tildes</h1></article>",
      canonical_url: canonical,
      city,
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
          }
        ],
        faq: []
      }
    });

    const breadcrumb = extractJsonLd(html).find((entry) => entry["@type"] === "BreadcrumbList");
    assert.ok(breadcrumb, `BreadcrumbList no encontrado para ${city}`);
    assert.deepEqual(
      breadcrumb.itemListElement.map((item) => item.position),
      [1, 2, 3]
    );
    assert.deepEqual(
      breadcrumb.itemListElement.map((item) => item.name),
      ["Inicio", "Saber si un piso esta caro", city]
    );

    for (const item of breadcrumb.itemListElement) {
      assert.equal(typeof item.item, "string", `Falta item en breadcrumb position ${item.position} para ${city}`);
      assert.match(item.item, /^https:\/\/inmoradar\.app\//);
      assert.notEqual(item.name, "Espa\u00f1a");
    }
  }
});

test("siteUrl normaliza www al dominio canonico sin www", () => {
  const previousUrl = process.env.PUBLIC_SITE_URL;
  const previousSiteUrl = process.env.SITE_URL;
  process.env.PUBLIC_SITE_URL = "https://www.inmoradar.app";
  delete process.env.SITE_URL;

  try {
    assert.equal(siteUrl(), "https://inmoradar.app");
  } finally {
    if (previousUrl === undefined) delete process.env.PUBLIC_SITE_URL;
    else process.env.PUBLIC_SITE_URL = previousUrl;
    if (previousSiteUrl === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = previousSiteUrl;
  }
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
  assert.match(params.get("select"), /body_html/);
  assert.equal(params.get("status"), "eq.published");
  assert.equal(params.get("index_status"), "eq.index");
  assert.equal(params.get("quality_score"), "gte.75");
});

test("sitemap publica solo URLs canonicas sin www e incluye hubs SEO indexables", async () => {
  const previousUrl = process.env.PUBLIC_SITE_URL;
  const previousSiteUrl = process.env.SITE_URL;
  process.env.PUBLIC_SITE_URL = "https://www.inmoradar.app";
  delete process.env.SITE_URL;

  const req = {
    method: "GET",
    url: "/api/sitemap.xml",
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
    await sitemapHandler(req, res);
  } finally {
    if (previousUrl === undefined) delete process.env.PUBLIC_SITE_URL;
    else process.env.PUBLIC_SITE_URL = previousUrl;
    if (previousSiteUrl === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = previousSiteUrl;
  }

  const xml = chunks.join("");
  assert.equal(res.statusCode, 200);
  assert.match(xml, /<loc>https:\/\/inmoradar\.app\/precio-metro-cuadrado\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/inmoradar\.app\/precio-alquiler\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/inmoradar\.app\/saber-si-piso-esta-caro\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/inmoradar\.app\/premium<\/loc>/);
  assert.match(xml, /<loc>https:\/\/inmoradar\.app\/terminos<\/loc>/);
  assert.match(xml, /<loc>https:\/\/inmoradar\.app\/privacidad<\/loc>/);
  assert.match(xml, /<loc>https:\/\/inmoradar\.app\/que-analiza<\/loc>/);
  assert.doesNotMatch(xml, /<loc>https:\/\/www\.inmoradar\.app\//);
  assert.doesNotMatch(xml, /<loc>http:\/\//);
});

test("sitemap excluye drafts, noindex, score bajo, canonical incoherente y contenido pobre", async () => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const previousFetch = global.fetch;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";
  const richBodyHtml = `
    <section data-city-specific="true"><p>${"Madrid precio vivienda referencia fuente fecha anuncio ".repeat(120)}</p></section>
    <section data-city-specific="true"><p>Fuente: MIVAU. Fecha del dato: 4T 2025.</p><a href="/datos">Datos</a></section>
    <section data-city-specific="true"><p>${"Comparar superficie estado zona precio metro cuadrado ".repeat(80)}</p><a href="/metodologia">Metodologia</a></section>
  `;
  const base = {
    title: "Precio del metro cuadrado en Madrid",
    meta_title: "Precio m2 en Madrid - InmoRadar",
    meta_description: "Consulta una referencia de precio por metro cuadrado en Madrid con fuente, fecha y pautas para comparar anuncios.",
    h1: "Precio del metro cuadrado en Madrid",
    body_html: richBodyHtml,
    city: "Madrid",
    template_type: "price_city",
    status: "published",
    index_status: "index",
    quality_score: 90,
    word_count: 800,
    source_data_json: { quality: { signals: [], penalties: [], warnings: [], rejection_reasons: [] } },
    published_at: "2026-06-07T00:00:00.000Z"
  };
  global.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify([
        { ...base, slug: "precio-metro-cuadrado/madrid", canonical_url: "https://inmoradar.app/precio-metro-cuadrado/madrid/" },
        { ...base, slug: "precio-metro-cuadrado/draft", status: "draft", canonical_url: "https://inmoradar.app/precio-metro-cuadrado/draft/" },
        { ...base, slug: "precio-metro-cuadrado/noindex", index_status: "noindex", canonical_url: "https://inmoradar.app/precio-metro-cuadrado/noindex/" },
        { ...base, slug: "precio-metro-cuadrado/low", quality_score: 60, canonical_url: "https://inmoradar.app/precio-metro-cuadrado/low/" },
        { ...base, slug: "precio-metro-cuadrado/canonical", canonical_url: "https://www.inmoradar.app/precio-metro-cuadrado/canonical/" },
        { ...base, slug: "precio-metro-cuadrado/empty", word_count: 120, canonical_url: "https://inmoradar.app/precio-metro-cuadrado/empty/" },
        { ...base, slug: "precio-metro-cuadrado/contentless", body_html: "", canonical_url: "https://inmoradar.app/precio-metro-cuadrado/contentless/" }
      ])
  });

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
    await sitemapHandler({ method: "GET", url: "/api/sitemap", headers: { host: "inmoradar.app" } }, res);
  } finally {
    global.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }

  const xml = chunks.join("");
  assert.match(xml, /https:\/\/inmoradar\.app\/precio-metro-cuadrado\/madrid\//);
  assert.doesNotMatch(xml, /precio-metro-cuadrado\/draft\//);
  assert.doesNotMatch(xml, /precio-metro-cuadrado\/noindex\//);
  assert.doesNotMatch(xml, /precio-metro-cuadrado\/low\//);
  assert.doesNotMatch(xml, /precio-metro-cuadrado\/canonical\//);
  assert.doesNotMatch(xml, /precio-metro-cuadrado\/empty\//);
  assert.doesNotMatch(xml, /precio-metro-cuadrado\/contentless\//);
});

test("indexability gate devuelve motivos visibles para exclusion de sitemap", () => {
  const result = evaluateSitemapEligibility({
    slug: "precio-metro-cuadrado/madrid",
    title: "Precio del metro cuadrado en Madrid",
    meta_title: "Precio m2 Madrid",
    meta_description: "Referencia de precio por metro cuadrado en Madrid con fuente y fecha para comparar anuncios.",
    h1: "Precio del metro cuadrado en Madrid",
    status: "published",
    index_status: "index",
    quality_score: 90,
    word_count: 120,
    canonical_url: "https://www.inmoradar.app/precio-metro-cuadrado/madrid/"
  });

  assert.equal(result.sitemap_eligible, false);
  assert.equal(result.can_publish, false);
  assert.equal(result.can_index, false);
  assert.ok(result.reasons.includes("canonical_host_mismatch"));
  assert.ok(result.reasons.includes("content_missing"));
  assert.ok(result.reasons.includes("low_content"));
  assert.equal(result.sitemap_status, "excluded");

  const blocked = evaluateSitemapEligibility(
    {
      slug: "precio-metro-cuadrado/valencia",
      title: "Precio m2 Valencia estÃ¡ revisado",
      meta_title: "Precio m2 Valencia",
      meta_description: "Referencia de precio por metro cuadrado en Valencia con fuente y fecha para comparar anuncios.",
      h1: "Precio del metro cuadrado en Valencia",
      status: "noindex",
      index_status: "noindex",
      quality_score: 70,
      word_count: 120,
      body_html: "<p>Contenido insuficiente pendiente de revision editorial.</p>",
      canonical_url: "https://inmoradar.app/precio-metro-cuadrado/valencia/"
    },
    { quality: { technical_indexability_status: "blocked", rejection_reasons: ["quality_score_below_75"] } }
  );

  assert.ok(blocked.reasons.includes("noindex"));
  assert.ok(blocked.reasons.includes("quality_score_below_threshold"));
  assert.ok(blocked.reasons.includes("low_content"));
  assert.ok(blocked.reasons.includes("mojibake_detected"));
  assert.ok(blocked.reasons.includes("no_internal_links"));
  assert.ok(blocked.reasons.includes("technical_rejection"));

  const missingCanonical = evaluateSitemapEligibility({
    slug: "precio-metro-cuadrado/zaragoza",
    title: "Precio del metro cuadrado en Zaragoza",
    meta_description: "Referencia de precio por metro cuadrado en Zaragoza con fuente y fecha para comparar anuncios.",
    h1: "Precio del metro cuadrado en Zaragoza",
    status: "published",
    index_status: "index",
    quality_score: 90,
    word_count: 600
  });

  assert.ok(missingCanonical.reasons.includes("canonical_missing"));
});

test("sitemap y landings SEO aceptan HEAD para comprobaciones HTTP", async () => {
  const sitemapReq = {
    method: "HEAD",
    url: "/api/sitemap.xml",
    headers: { host: "inmoradar.app" }
  };
  const sitemapChunks = [];
  const sitemapRes = {
    statusCode: 0,
    headers: {},
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(chunk) {
      if (chunk) sitemapChunks.push(String(chunk));
    }
  };

  await sitemapHandler(sitemapReq, sitemapRes);
  assert.equal(sitemapRes.statusCode, 200);
  assert.equal(sitemapChunks.join(""), "");

  const pageReq = {
    method: "HEAD",
    url: "/api/seo-page?slug=precio-metro-cuadrado/logrono",
    headers: { host: "inmoradar.app" }
  };
  const pageChunks = [];
  const pageRes = {
    statusCode: 0,
    headers: {},
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(chunk) {
      if (chunk) pageChunks.push(String(chunk));
    }
  };

  await seoPageHandler(pageReq, pageRes);
  assert.equal(pageRes.statusCode, 200);
  assert.equal(pageChunks.join(""), "");
});

test("la home tiene seccion Noticias con enlaces a publicaciones", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

  assert.match(html, /id="noticias"/);
  assert.match(html, /data-news-list/);
  assert.match(html, /data-news-archive/);
  assert.match(html, /data-news-track/);
  assert.match(html, /Noticias/);
  assert.match(html, /data-articles-grid/);
  assert.match(html, /id="guias-precio-ciudad"/);
  assert.match(html, /\/saber-si-piso-esta-caro\/madrid\//);
  assert.match(html, /\/saber-si-piso-esta-caro\/granada\//);

  const script = fs.readFileSync(path.join(__dirname, "..", "assets", "app.js"), "utf8");
  assert.match(script, /precio-metro-cuadrado-madrid/);
  assert.match(script, /articleCard/);
});

test("la pagina indice de saber si un piso esta caro es indexable y enlaza ciudades", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "saber-si-piso-esta-caro.html"), "utf8");

  assert.match(html, /<meta name="robots" content="index,follow">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/inmoradar\.app\/saber-si-piso-esta-caro\/">/);
  assert.match(html, /\/saber-si-piso-esta-caro\/madrid\//);
  assert.match(html, /\/saber-si-piso-esta-caro\/barcelona\//);
  assert.match(html, /\/saber-si-piso-esta-caro\/valencia\//);
  assert.match(html, /\/saber-si-piso-esta-caro\/sevilla\//);
  assert.match(html, /\/saber-si-piso-esta-caro\/granada\//);
});

test("los hubs SEO son indexables, tienen texto util y enlazan ciudades publicas", () => {
  const hubs = [
    {
      file: "precio-metro-cuadrado.html",
      canonical: "https://inmoradar.app/precio-metro-cuadrado/",
      links: ["/precio-metro-cuadrado/madrid/", "/precio-metro-cuadrado/barcelona/", "/precio-metro-cuadrado/logrono/"],
      text: /El precio por metro cuadrado ayuda a leer anuncios/
    },
    {
      file: "precio-alquiler.html",
      canonical: "https://inmoradar.app/precio-alquiler/",
      links: ["/precio-alquiler/madrid/", "/precio-alquiler/malaga/", "/precio-alquiler/sevilla/"],
      text: /Dos alquileres con la misma renta mensual/
    },
    {
      file: "saber-si-piso-esta-caro.html",
      canonical: "https://inmoradar.app/saber-si-piso-esta-caro/",
      links: ["/saber-si-piso-esta-caro/madrid/", "/saber-si-piso-esta-caro/barcelona/", "/saber-si-piso-esta-caro/granada/"],
      text: /El precio de un anuncio no se entiende solo con el total/
    }
  ];

  for (const hub of hubs) {
    const html = fs.readFileSync(path.join(__dirname, "..", hub.file), "utf8");
    assert.match(html, /<meta name="robots" content="index,follow">/);
    assert.match(html, new RegExp(`<link rel="canonical" href="${hub.canonical.replace(/\//g, "\\/")}">`));
    assert.match(html, /<h1[\s\S]*<\/h1>/);
    assert.match(html, hub.text);
    for (const link of hub.links) assert.match(html, new RegExp(`href="${link.replace(/\//g, "\\/")}"`));
    assert.match(html, /data-install-button/);
  }
});

test("las paginas estaticas del sitemap tienen canonical explicito sin www, robots y H1", () => {
  const pages = [
    ["index.html", "https://inmoradar.app/"],
    ["que-analiza.html", "https://inmoradar.app/que-analiza"],
    ["datos.html", "https://inmoradar.app/datos"],
    ["metodologia.html", "https://inmoradar.app/metodologia"],
    ["noticias.html", "https://inmoradar.app/noticias"],
    ["precio-metro-cuadrado.html", "https://inmoradar.app/precio-metro-cuadrado/"],
    ["precio-alquiler.html", "https://inmoradar.app/precio-alquiler/"],
    ["premium.html", "https://inmoradar.app/premium"],
    ["clientes.html", "https://inmoradar.app/clientes"],
    ["faq.html", "https://inmoradar.app/faq"],
    ["contacto.html", "https://inmoradar.app/contacto"],
    ["privacidad.html", "https://inmoradar.app/privacidad"],
    ["terminos.html", "https://inmoradar.app/terminos"],
    ["saber-si-piso-esta-caro.html", "https://inmoradar.app/saber-si-piso-esta-caro/"]
  ];

  for (const [file, canonical] of pages) {
    const html = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    assert.match(html, new RegExp(`<link rel="canonical" href="${canonical.replace(/\//g, "\\/")}">`));
    assert.match(html, /<meta name="robots" content="index,follow">/);
    assert.match(html, /<h1[\s\S]*<\/h1>/);
    assert.doesNotMatch(html, /https:\/\/www\.inmoradar\.app/);
  }
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

  assert.match(vercel, /"source": "\/precio-metro-cuadrado\/?"/);
  assert.match(vercel, /precio-alquiler\/:city/);
  assert.match(vercel, /"source": "\/precio-alquiler\/?"/);
  assert.match(vercel, /"source": "\/saber-si-piso-esta-caro\/?"/);
  assert.match(vercel, /saber-si-piso-esta-caro\/:city/);
  assert.match(vercel, /guias\/:slug/);
  assert.match(vercel, /"source": "\/datos"/);
  assert.match(vercel, /"source": "\/noticias\/:slug"/);
  assert.match(redirects, /\/precio-metro-cuadrado \/precio-metro-cuadrado\.html/);
  assert.match(redirects, /precio-alquiler\/:city/);
  assert.match(redirects, /\/precio-alquiler \/precio-alquiler\.html/);
  assert.match(redirects, /\/saber-si-piso-esta-caro \/saber-si-piso-esta-caro\.html/);
  assert.match(redirects, /saber-si-piso-esta-caro\/:city/);
  assert.match(redirects, /guias\/:slug/);
  assert.match(redirects, /\/datos \/datos\.html/);
  assert.match(redirects, /\/noticias\/:slug \/article\.html/);
  assert.match(localServer, /precio-metro-cuadrado\.html/);
  assert.match(localServer, /precio-alquiler/);
  assert.match(localServer, /precio-alquiler\.html/);
  assert.match(localServer, /saber-si-piso-esta-caro\.html/);
  assert.match(localServer, /saber-si-piso-esta-caro/);
  assert.match(localServer, /guias/);
  assert.match(localServer, /\/datos\.html/);
  assert.match(localServer, /article\.html/);
});

test("las landings SEO normalizan trailing slash al mismo canonical absoluto", async () => {
  const request = async (url) => {
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
    await seoPageHandler({ method: "GET", url, headers: { host: "inmoradar.app" } }, res);
    return chunks.join("");
  };
  const withoutSlash = await request("/precio-metro-cuadrado/logrono");
  const withSlash = await request("/precio-metro-cuadrado/logrono/");

  assert.match(withoutSlash, /<link rel="canonical" href="https:\/\/inmoradar\.app\/precio-metro-cuadrado\/logrono\/">/);
  assert.match(withSlash, /<link rel="canonical" href="https:\/\/inmoradar\.app\/precio-metro-cuadrado\/logrono\/">/);
  assert.match(withoutSlash, /index,follow/);
  assert.match(withSlash, /index,follow/);
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
