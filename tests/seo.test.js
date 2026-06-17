const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { buildPriceCitySourceData, findBestRecord } = require("../api/_seo/marketSources");
const { buildPriceCityLanding } = require("../api/_seo/priceCity");
const {
  EDITORIAL_GUIDE_TOPICS,
  buildEditorialGuideLanding,
  buildEditorialGuideSourceData
} = require("../api/_seo/editorialGuides");
const { buildExpensiveListingCityLanding, buildRentCityLanding } = require("../lib/seo/cityGuideTemplates");

const { calculateSeoLandingQuality } = require("../api/_seo/quality");
const { canPublishNow, runSeoLandingGeneration } = require("../api/_seo/generator");
const {
  buildSeoContentPublicationConfig,
  getSeoContentPublicationDiagnostics,
  nextSeoPublishRun,
  runSeoContentPublication
} = require("../api/_seo/contentPublisher");
const { maybeSendSeoPublicationEmail } = require("../api/_seo/publicationEmail");
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

function stripTags(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function commercialGuideCtas(bodyHtml, position) {
  return [
    ...String(bodyHtml || "").matchAll(
      new RegExp(`<section\\b[^>]*data-guide-commercial-cta="${position}"[^>]*>[\\s\\S]*?<\\/section>`, "g")
    )
  ].map((match) => match[0]);
}

function hrefsFromHtml(html) {
  return [...String(html || "").matchAll(/\bhref="([^"]+)"/g)].map((match) => match[1]);
}

function assertCtaLinksAreValid(ctaHtml) {
  const knownInternalPaths = new Set(["/", "/que-analiza", "/premium", "/noticias"]);
  const links = hrefsFromHtml(ctaHtml);
  assert.ok(links.length > 0);
  for (const href of links) {
    const isChromeStore = /^https:\/\/chromewebstore\.google\.com\/detail\/inmoradar\/[a-z0-9]+$/i.test(href);
    const isKnownInternal = knownInternalPaths.has(href);
    assert.ok(isChromeStore || isKnownInternal, `CTA link should not be broken or invented: ${href}`);
  }
}

function qualityFixture(overrides = {}) {
  const repeatedCityCopy = "Madrid mercado vivienda precio barrio referencia comprador ".repeat(130);
  const bodyHtml = `
    <header data-city-specific="true"><h1>Precio del metro cuadrado en Madrid</h1></header>
    <section data-city-specific="true"><p>${repeatedCityCopy}</p><p><strong>Fuente y fecha del dato:</strong> <a href="https://example.com/mivau.csv">MIVAU</a>. <strong>Fecha del dato:</strong> 4T 2025.</p></section>
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

function marketSourceRecord(overrides = {}) {
  return {
    source: "idealista_public_report",
    operation: "sale",
    country: "ES",
    autonomous_community: "Comunidad Valenciana",
    province: "Alicante",
    municipality: "Alicante / Alacant",
    zone_name: "Alicante / Alacant",
    geo_level: "municipality",
    price_eur_m2: 2150,
    period_label: "mayo 2026",
    period_date: "2026-05-01",
    source_url: "https://example.com/alicante-venta.csv",
    confidence_score: 0.8,
    extracted_at: "2026-06-01T00:00:00.000Z",
    ...overrides
  };
}

function citySourceData(records) {
  const sale = records.find((record) => record.operation === "sale") || null;
  const rent = records.find((record) => record.operation === "rent") || null;
  return {
    hasRealData: records.length > 0,
    hasProvincialOnly:
      records.length > 0 && records.every((record) => ["province", "autonomous_community", "country"].includes(record.geo_level)),
    sale,
    rent,
    records,
    sources: records.map((record) => ({
      operation: record.operation,
      source: record.source,
      source_url: record.source_url,
      period_label: record.period_label,
      period_date: record.period_date,
      geo_level: record.geo_level,
      price_eur_m2: record.price_eur_m2
    }))
  };
}

function seoPublicationEmailEnv(overrides = {}) {
  return {
    SEO_PUBLICATION_EMAIL_ENABLED: "true",
    SEO_PUBLICATION_EMAIL_TO: "sergio.torio@gmail.com",
    SEO_PUBLICATION_EMAIL_FROM: "seo@inmoradar.app",
    PUBLIC_SITE_URL: "https://www.inmoradar.app",
    ...overrides
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

test("marketSources encuentra municipios con alias bilingues, coma-articulo y nombres oficiales", () => {
  const alicante = marketSourceRecord({ municipality: "Alicante / Alacant", zone_name: "Alicante / Alacant" });
  const coruna = marketSourceRecord({
    municipality: "Coru\u00f1a, A",
    zone_name: "Coru\u00f1a, A",
    province: "A Coru\u00f1a",
    source_url: "https://example.com/coruna-venta.csv",
    period_label: "abril 2026"
  });
  const donostia = marketSourceRecord({
    municipality: "Donostia-San Sebasti\u00e1n",
    zone_name: "Donostia-San Sebasti\u00e1n",
    province: "Gipuzkoa",
    source_url: "https://example.com/donostia-venta.csv",
    period_label: "marzo 2026"
  });

  assert.equal(findBestRecord([alicante], "sale", "Alicante"), alicante);
  assert.equal(findBestRecord([coruna], "sale", "A Coru\u00f1a"), coruna);
  assert.equal(findBestRecord([donostia], "sale", "San Sebasti\u00e1n"), donostia);
  assert.equal(findBestRecord([donostia], "sale", "Donostia"), donostia);
  assert.equal(findBestRecord([alicante], "sale", "Alicante")?.source_url, "https://example.com/alicante-venta.csv");
  assert.equal(findBestRecord([coruna], "sale", "A Coru\u00f1a")?.period_label, "abril 2026");
});

test("marketSources no confunde Las Palmas provincia con municipio", () => {
  const provinceOnly = marketSourceRecord({
    municipality: null,
    zone_name: null,
    province: "Las Palmas",
    geo_level: "province",
    source_url: "https://example.com/las-palmas-provincia.csv"
  });
  const cityRecord = marketSourceRecord({
    municipality: "Las Palmas",
    zone_name: "Las Palmas",
    province: "Las Palmas",
    geo_level: "municipality",
    source_url: "https://example.com/las-palmas-ciudad.csv"
  });

  assert.equal(findBestRecord([provinceOnly], "sale", "Las Palmas de Gran Canaria"), null);
  assert.equal(findBestRecord([provinceOnly, cityRecord], "sale", "Las Palmas de Gran Canaria"), cityRecord);
});

test("price_city con alias encontrado muestra fuente y fecha visibles y supera quality gate", () => {
  const sale = marketSourceRecord();
  const sourceData = citySourceData([sale]);
  const opportunity = {
    keyword: "precio metro cuadrado Alicante",
    city: "Alicante",
    province: "Alicante",
    autonomous_community: "Comunidad Valenciana",
    template_type: "price_city"
  };
  const landing = buildPriceCityLanding(opportunity, sourceData);
  const quality = calculateSeoLandingQuality(landing, { ...sourceData, faq: landing.faq });

  assert.ok(quality.score >= 75);
  assert.ok(quality.signals.includes("fuente y fecha visibles"));
  assert.equal(quality.penalties.includes("sin fuente visible"), false);
  assert.equal(quality.rejection_reasons.includes("source_not_visible"), false);
  assert.match(landing.body_html, /Fuente y fecha del dato:/);
  assert.match(landing.body_html, /https:\/\/example\.com\/alicante-venta\.csv/);
  assert.match(landing.body_html, /mayo 2026/);
  assert.match(landing.body_html, /Alicante \/ Alacant/);
});

test("rent_city con fuente y fecha visibles supera quality gate", () => {
  const rent = marketSourceRecord({
    source: "serpavi",
    operation: "rent",
    price_eur_m2: 11.4,
    period_label: "2024",
    period_date: "2024-01-01",
    source_url: "https://example.com/alicante-alquiler.csv"
  });
  const sourceData = citySourceData([rent]);
  const landing = buildRentCityLanding(
    {
      keyword: "precio alquiler metro cuadrado Alicante",
      city: "Alicante",
      province: "Alicante",
      autonomous_community: "Comunidad Valenciana",
      template_type: "rent_city"
    },
    sourceData
  );
  const quality = calculateSeoLandingQuality(landing, { ...sourceData, faq: landing.faq });

  assert.ok(quality.score >= 75);
  assert.ok(quality.signals.includes("fuente y fecha visibles"));
  assert.equal(quality.rejection_reasons.includes("source_not_visible"), false);
  assert.match(landing.body_html, /https:\/\/example\.com\/alicante-alquiler\.csv/);
  assert.match(landing.body_html, /2024/);
});

test("las landings SEO ciudad enlazan a la siguiente pagina relacionada", () => {
  const sale = marketSourceRecord({ operation: "sale" });
  const rent = marketSourceRecord({
    source: "serpavi",
    operation: "rent",
    price_eur_m2: 11.4,
    period_label: "2024",
    period_date: "2024-01-01",
    source_url: "https://example.com/alicante-alquiler.csv"
  });
  const sourceData = citySourceData([sale, rent]);
  const opportunity = {
    keyword: "precio Alicante",
    city: "Alicante",
    province: "Alicante",
    autonomous_community: "Comunidad Valenciana"
  };

  const priceLanding = buildPriceCityLanding({ ...opportunity, template_type: "price_city" }, sourceData);
  const rentLanding = buildRentCityLanding({ ...opportunity, template_type: "rent_city" }, sourceData);
  const expensiveLanding = buildExpensiveListingCityLanding({ ...opportunity, template_type: "expensive_listing_city" }, sourceData);

  assert.match(priceLanding.body_html, /href="\/saber-si-piso-esta-caro\/alicante\/"/);
  assert.match(rentLanding.body_html, /href="\/precio-metro-cuadrado\/alicante\/"/);
  assert.match(expensiveLanding.body_html, /href="\/guias\/errores-comprar-piso\/"/);
});

test("quality gate bloquea landings sin fuente o fecha visible", () => {
  const fixture = qualityFixture();
  const withoutSourceUrl = calculateSeoLandingQuality(
    {
      ...fixture.landing,
      body_html: fixture.landing.body_html.replace(/https:\/\/example\.com\/mivau\.csv/g, "")
    },
    fixture.sourceData
  );
  const withoutDate = calculateSeoLandingQuality(
    {
      ...fixture.landing,
      body_html: fixture.landing.body_html.replace(/4T 2025/g, "")
    },
    fixture.sourceData
  );
  const withoutMetadata = calculateSeoLandingQuality(fixture.landing, { ...fixture.sourceData, records: [], sources: [] });

  assert.ok(withoutSourceUrl.score < 75);
  assert.ok(withoutSourceUrl.penalties.includes("sin fuente visible"));
  assert.ok(withoutSourceUrl.rejection_reasons.includes("source_not_visible"));
  assert.ok(withoutDate.score < 75);
  assert.ok(withoutDate.penalties.includes("sin fecha visible"));
  assert.ok(withoutDate.rejection_reasons.includes("date_not_visible"));
  assert.ok(withoutMetadata.score < 75);
  assert.ok(withoutMetadata.rejection_reasons.includes("source_metadata_incomplete"));
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
  assert.ok(result.results[0].rejection_reasons.includes("source_metadata_incomplete"));
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

test("cada guia editorial indexable incluye CTAs comerciales prudentes y enlaces validos", () => {
  for (const topic of EDITORIAL_GUIDE_TOPICS) {
    const sourceData = buildEditorialGuideSourceData(
      { keyword: topic.keyword, city: "Espana", template_type: "editorial_guide" },
      "2026-06-01T00:00:00.000Z"
    );
    const landing = buildEditorialGuideLanding(
      { keyword: topic.keyword, city: "Espana", template_type: "editorial_guide" },
      sourceData
    );
    const quality = calculateSeoLandingQuality(landing, { ...sourceData, faq: landing.faq });
    assert.ok(quality.score >= 85, landing.slug);

    const intermediateCtas = commercialGuideCtas(landing.body_html, "intermediate");
    const finalCtas = commercialGuideCtas(landing.body_html, "final");
    assert.ok(intermediateCtas.length >= 1, landing.slug);
    assert.ok(finalCtas.length >= 1, landing.slug);

    const checklistIndex = landing.body_html.indexOf('id="checklist"');
    const intermediateIndex = landing.body_html.indexOf('data-guide-commercial-cta="intermediate"');
    const readingNumbersIndex = landing.body_html.indexOf('id="como-leer-numeros"');
    const finalIndex = landing.body_html.indexOf('data-guide-commercial-cta="final"');
    const sourceIndex = landing.body_html.indexOf("seo-disclaimer");
    assert.ok(checklistIndex >= 0 && intermediateIndex > checklistIndex, landing.slug);
    assert.ok(readingNumbersIndex > intermediateIndex, landing.slug);
    assert.ok(finalIndex > readingNumbersIndex, landing.slug);
    assert.ok(sourceIndex > finalIndex, landing.slug);

    for (const ctaHtml of [...intermediateCtas, ...finalCtas]) {
      const ctaText = stripTags(ctaHtml);
      assert.match(ctaText, /InmoRadar/);
      assert.match(ctaText, /Idealista/);
      assert.match(ctaText, /Fotocasa/);
      assert.match(ctaText, /independiente/i);
      assert.match(ctaText, /no est[aá] afiliada oficialmente/i);
      assert.doesNotMatch(ctaHtml, /<img\b|<picture\b|<source\b/i);
      assert.doesNotMatch(ctaHtml, /idealista[-_ ]?(logo|brand)|fotocasa[-_ ]?(logo|brand)/i);
      assert.doesNotMatch(ctaText, /partner oficial|colaboraci[oó]n oficial|integraci[oó]n oficial|aprobado por/i);
      assertCtaLinksAreValid(ctaHtml);
    }
  }
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

test("email SEO no se envia si esta desactivado, en dry-run o sin publicaciones", async () => {
  let calls = 0;
  const transport = async () => {
    calls += 1;
  };
  const enabledEnv = seoPublicationEmailEnv();
  const disabled = await maybeSendSeoPublicationEmail({
    summary: { published_count: 1, dry_run: false },
    env: seoPublicationEmailEnv({ SEO_PUBLICATION_EMAIL_ENABLED: "false" }),
    transport
  });
  const dryRun = await maybeSendSeoPublicationEmail({
    summary: { published_count: 1, dry_run: true },
    env: enabledEnv,
    transport
  });
  const noPublished = await maybeSendSeoPublicationEmail({
    summary: { published_count: 0, dry_run: false },
    env: enabledEnv,
    transport
  });

  assert.equal(disabled.enabled, false);
  assert.equal(disabled.attempted, false);
  assert.equal(disabled.reason, "email_disabled");
  assert.equal(dryRun.attempted, false);
  assert.equal(dryRun.reason, "dry_run");
  assert.equal(noPublished.attempted, false);
  assert.equal(noPublished.reason, "no_published_pages");
  assert.equal(calls, 0);
});

test("email SEO se envia desde runSeoContentPublication con resumen de paginas y totales", async () => {
  const sent = [];
  const storage = {
    async startRun() {
      return { persisted: false, acquired: true };
    },
    async finishRun() {},
    async fetchRecentPublishedRows() {
      return [];
    },
    async fetchSeoPublicationTotals() {
      return {
        total_landings: 12,
        published_landings: 7,
        indexable_landings: 6,
        drafts: 4,
        pending_review: 1
      };
    }
  };
  const result = await runSeoContentPublication({
    now: "2026-05-22T12:00:00.000Z",
    requestSource: "cron",
    storage,
    env: seoPublicationEmailEnv(),
    config: { enabled: true, dryRun: false },
    emailNotification: {
      transport: async (message) => {
        sent.push(message);
      }
    },
    runGeneration: async () => ({
      ok: true,
      mode: "publish",
      template_type: "landing_random",
      generated_count: 1,
      published_count: 1,
      results: [
        {
          slug: "precio-metro-cuadrado/sevilla",
          title: "Precio del metro cuadrado en Sevilla",
          city: "Sevilla",
          template_type: "price_city",
          quality_score: 93,
          final_score: 93,
          status: "published",
          index_status: "index"
        }
      ]
    })
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.email_notification, {
    enabled: true,
    attempted: true,
    sent: true,
    reason: null,
    recipient: "sergio.torio@gmail.com"
  });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].payload.to, "sergio.torio@gmail.com");
  assert.equal(sent[0].payload.from, "seo@inmoradar.app");
  assert.match(sent[0].payload.html, /Precio del metro cuadrado en Sevilla/);
  assert.match(sent[0].payload.html, /precio-metro-cuadrado\/sevilla/);
  assert.match(sent[0].payload.html, /Template: price_city/);
  assert.match(sent[0].payload.html, /Indexacion: index/);
  assert.match(sent[0].payload.html, /Total landings publicadas: 7/);
  assert.match(sent[0].payload.text, /total landings indexables: 6/);
});

test("fallo de email SEO no falla la publicacion ni expone tokens", async () => {
  const secret = "cloudflare-secret-token";
  const result = await runSeoContentPublication({
    now: "2026-05-22T12:00:00.000Z",
    requestSource: "cron",
    storage: {
      async startRun() {
        return { persisted: false, acquired: true };
      },
      async finishRun() {},
      async fetchRecentPublishedRows() {
        return [];
      },
      async fetchSeoPublicationTotals() {
        return { published_landings: 1, indexable_landings: 1, drafts: 0, pending_review: 0 };
      }
    },
    env: seoPublicationEmailEnv({ CLOUDFLARE_EMAIL_API_TOKEN: secret }),
    config: { enabled: true, dryRun: false },
    emailNotification: {
      transport: async () => {
        throw new Error(`cloudflare failed ${secret}`);
      }
    },
    runGeneration: async () => ({
      ok: true,
      mode: "publish",
      generated_count: 1,
      published_count: 1,
      results: [
        {
          slug: "guias/antes-de-llamar-por-un-piso",
          title: "Antes de llamar por un piso",
          template_type: "editorial_guide",
          quality_score: 94,
          status: "published",
          index_status: "index"
        }
      ]
    })
  });

  assert.equal(result.ok, true);
  assert.equal(result.published_count, 1);
  assert.equal(result.email_notification.enabled, true);
  assert.equal(result.email_notification.attempted, true);
  assert.equal(result.email_notification.sent, false);
  assert.doesNotMatch(result.email_notification.reason, new RegExp(secret));
  assert.match(result.email_notification.reason, /\[redacted\]/);
  assert.ok(result.warnings.some((warning) => warning.startsWith("seo_publication_email_")));
});

test("email SEO activado sin Cloudflare configurado no bloquea el cron", async () => {
  const result = await runSeoContentPublication({
    now: "2026-05-22T12:00:00.000Z",
    requestSource: "cron",
    storage: {
      async startRun() {
        return { persisted: false, acquired: true };
      },
      async finishRun() {},
      async fetchRecentPublishedRows() {
        return [];
      }
    },
    env: seoPublicationEmailEnv({
      CLOUDFLARE_ACCOUNT_ID: undefined,
      CLOUDFLARE_EMAIL_API_TOKEN: undefined
    }),
    config: { enabled: true, dryRun: false },
    runGeneration: async () => ({
      ok: true,
      mode: "publish",
      generated_count: 1,
      published_count: 1,
      results: [
        {
          slug: "precio-metro-cuadrado/granada",
          title: "Precio del metro cuadrado en Granada",
          template_type: "price_city",
          quality_score: 91,
          status: "published",
          index_status: "index"
        }
      ]
    })
  });

  assert.equal(result.ok, true);
  assert.equal(result.published_count, 1);
  assert.equal(result.email_notification.enabled, true);
  assert.equal(result.email_notification.attempted, false);
  assert.equal(result.email_notification.sent, false);
  assert.equal(result.email_notification.reason, "cloudflare_email_not_configured");
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
  assert.equal(result.reason, "daily_limit_reached");
  assert.equal(result.skipped_reason, "daily_limit_reached");
});

test("la publicacion SEO usa limite diario configurable", async () => {
  let received = null;
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
    config: { enabled: true, dryRun: false, maxPerDay: 10 },
    runGeneration: async (options) => {
      received = options;
      return { ok: true, generated_count: 1, published_count: 1, results: [] };
    }
  });

  assert.equal(result.config.max_per_day, 10);
  assert.equal(result.limits.max_per_day, 10);
  assert.equal(result.published_count, 1);
  assert.equal(received.dailyPublishLimit, 10);
});

test("la publicacion SEO bloquea por limite semanal configurable", async () => {
  let called = false;
  const rows = Array.from({ length: 28 }, (_, index) => ({
    template_type: index % 2 ? "editorial_guide" : "price_city",
    status: "published",
    published_at: new Date(Date.parse("2026-05-22T12:00:00.000Z") - index * 6 * 60 * 60 * 1000).toISOString()
  }));
  const result = await runSeoContentPublication({
    now: "2026-05-22T12:00:00.000Z",
    requestSource: "cron",
    storage: {
      async startRun() {
        return { persisted: false, acquired: true };
      },
      async finishRun() {},
      async fetchRecentPublishedRows() {
        return rows;
      }
    },
    config: { enabled: true, dryRun: false, maxPerDay: 100, maxPerWeek: 28 },
    runGeneration: async () => {
      called = true;
      return { ok: true, generated_count: 1, published_count: 1, results: [] };
    }
  });

  assert.equal(called, false);
  assert.equal(result.reason, "weekly_limit_reached");
  assert.equal(result.limits.max_per_week, 28);
});

test("la publicacion SEO pasa score minimo configurable al quality gate", async () => {
  let received = null;
  const result = await runSeoContentPublication({
    now: "2026-05-22T12:00:00.000Z",
    requestSource: "cron",
    storage: {
      async startRun() {
        return { persisted: false, acquired: true };
      },
      async finishRun() {},
      async fetchRecentPublishedRows() {
        return [];
      }
    },
    config: { enabled: true, dryRun: false, minScore: 95 },
    runGeneration: async (options) => {
      received = options;
      return { ok: true, generated_count: 1, published_count: 0, results: [{ quality_score: 90, status: "draft" }] };
    }
  });

  assert.equal(result.config.min_score, 95);
  assert.equal(received.minScore, 95);
});

function readyToPublishLanding(overrides = {}) {
  const slug = overrides.slug || "guias/comprar-para-alquilar-rentabilidad";
  const bodyHtml =
    overrides.body_html ||
    `<article>
      <section data-guide-specific="true"><p>${"comprar para alquilar rentabilidad alquiler gastos hipoteca impuestos comunidad vacancia riesgo ".repeat(90)}</p><a href="/datos">Datos</a></section>
      <section data-guide-specific="true"><p>${"calcular escenario conservador flujo caja reforma mantenimiento seguros ibi mercado barrio demanda ".repeat(85)}</p><a href="/metodologia">Metodologia</a></section>
      <section data-guide-specific="true"><p>Fuente: InmoRadar. Fecha del dato: 2026.</p></section>
    </article>`;
  const qualityScore = overrides.quality_score ?? 100;
  return {
    id: overrides.id || 1,
    slug,
    title: overrides.title || "Comprar para alquilar: rentabilidad real",
    meta_title: overrides.meta_title || "Comprar para alquilar: rentabilidad real",
    meta_description:
      overrides.meta_description ||
      "Guia para calcular la rentabilidad real de una vivienda antes de comprar para alquilar.",
    h1: overrides.h1 || "Comprar para alquilar: rentabilidad real",
    body_html: bodyHtml,
    city: overrides.city || "Espana",
    template_type: overrides.template_type || "editorial_guide",
    status: overrides.status || "ready_to_publish",
    index_status: overrides.index_status || "noindex",
    quality_score: qualityScore,
    word_count: overrides.word_count || 760,
    canonical_url: overrides.canonical_url || `https://inmoradar.app/${slug}/`,
    updated_at: overrides.updated_at || "2026-05-22T11:00:00.000Z",
    source_data_json: {
      quality: {
        score: qualityScore,
        word_count: overrides.word_count || 760,
        penalties: overrides.penalties || [],
        warnings: overrides.warnings || [],
        rejection_reasons: overrides.rejection_reasons || [],
        technical_indexability_status: overrides.technical_indexability_status || "ok",
        editorial_quality_status: overrides.editorial_quality_status || "pass"
      },
      sources: [],
      faq: [],
      ...(overrides.source_data_json || {})
    }
  };
}

function readyPublicationStorage(candidates, savedRows = []) {
  return {
    async startRun() {
      return { persisted: false, acquired: true };
    },
    async finishRun() {},
    async fetchRecentPublishedRows() {
      return [];
    },
    async fetchReadyToPublishLandings() {
      return candidates;
    },
    async publishReadyToPublishLanding(landing, patch) {
      const saved = { ...landing, ...patch };
      savedRows.push(saved);
      return saved;
    }
  };
}

async function sitemapXmlForLandings(landings) {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const previousFetch = global.fetch;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  global.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(landings)
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
    await sitemapHandler({ method: "GET", url: "/api/sitemap.xml", headers: { host: "inmoradar.app" } }, res);
  } finally {
    global.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }

  return { statusCode: res.statusCode, xml: chunks.join("") };
}

test("la publicacion SEO promociona READY_TO_PUBLISH con score suficiente", async () => {
  const saved = [];
  const candidate = readyToPublishLanding();
  let generationCalled = false;
  const result = await runSeoContentPublication({
    now: "2026-05-22T12:00:00.000Z",
    requestSource: "cron",
    env: {
      SEO_AUTOGENERATION_ENABLED: "true",
      SEO_AUTOGENERATION_DRY_RUN: "false"
    },
    conditions: {
      enabled: true,
      max_per_day: 8,
      max_per_week: 28,
      max_per_run: 1,
      min_score: 90
    },
    storage: readyPublicationStorage([candidate], saved),
    runGeneration: async () => {
      generationCalled = true;
      return { ok: true, generated_count: 0, published_count: 0, results: [] };
    }
  });

  assert.equal(generationCalled, false);
  assert.equal(result.published_count, 1);
  assert.equal(result.draft_count, 0);
  assert.equal(result.skipped_count, 0);
  assert.equal(result.results[0].status, "published");
  assert.equal(result.publication_diagnostics.evaluated_candidates[0].category, "published");
  assert.equal(saved.length, 1);
  assert.equal(saved[0].status, "published");
  assert.equal(saved[0].index_status, "index");
  assert.equal(saved[0].published_at, "2026-05-22T12:00:00.000Z");

  const html = renderLandingHtml(saved[0]);
  assert.match(html, /<meta name="robots" content="index,follow">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/inmoradar\.app\/guias\/comprar-para-alquilar-rentabilidad\/">/);
  assert.doesNotMatch(html, /noindex,follow/);

  const sitemap = await sitemapXmlForLandings(saved);
  assert.equal(sitemap.statusCode, 200);
  assert.match(sitemap.xml, /https:\/\/inmoradar\.app\/guias\/comprar-para-alquilar-rentabilidad\//);
  assert.match(sitemap.xml, /<lastmod>2026-05-22<\/lastmod>/);
});

test("la publicacion SEO bloquea el segundo READY_TO_PUBLISH por maximo de ejecucion", async () => {
  const saved = [];
  const result = await runSeoContentPublication({
    now: "2026-05-22T12:00:00.000Z",
    requestSource: "cron",
    env: {
      SEO_AUTOGENERATION_ENABLED: "true",
      SEO_AUTOGENERATION_DRY_RUN: "false"
    },
    conditions: {
      enabled: true,
      max_per_day: 8,
      max_per_week: 28,
      max_per_run: 1,
      min_score: 90
    },
    storage: readyPublicationStorage(
      [
        readyToPublishLanding({ id: 1, slug: "guias/comprar-para-alquilar-rentabilidad" }),
        readyToPublishLanding({ id: 2, slug: "guias/reforma-costes-ocultos", title: "Reforma: costes ocultos" })
      ],
      saved
    )
  });

  assert.equal(result.published_count, 1);
  assert.equal(result.skipped_count, 0);
  assert.equal(saved.length, 1);
  assert.equal(result.results[1].status, "blocked");
  assert.equal(result.results[1].reason, "execution_limit_reached");
  assert.equal(result.publication_diagnostics.evaluated_candidates[1].category, "blocked_by_limit");
});

test("la publicacion SEO no promociona READY_TO_PUBLISH por score bajo", async () => {
  const saved = [];
  const result = await runSeoContentPublication({
    now: "2026-05-22T12:00:00.000Z",
    requestSource: "cron",
    env: {
      SEO_AUTOGENERATION_ENABLED: "true",
      SEO_AUTOGENERATION_DRY_RUN: "false"
    },
    conditions: {
      enabled: true,
      max_per_day: 8,
      max_per_week: 28,
      max_per_run: 1,
      min_score: 90
    },
    storage: readyPublicationStorage([readyToPublishLanding({ quality_score: 80 })], saved)
  });

  assert.equal(result.published_count, 0);
  assert.equal(saved.length, 0);
  assert.equal(result.results[0].reason, "low_score");
  assert.equal(result.publication_diagnostics.evaluated_candidates[0].category, "low_score");
});

test("diagnostico read-only explica candidatos bajo score que no cuentan como skip", async () => {
  let startRunCalled = false;
  let finishRunCalled = false;
  let received = null;
  const result = await getSeoContentPublicationDiagnostics({
    now: "2026-05-22T12:00:00.000Z",
    conditions: {
      enabled: true,
      max_per_day: 8,
      max_per_week: 28,
      max_per_run: 1,
      min_score: 90
    },
    storage: {
      async startRun() {
        startRunCalled = true;
      },
      async finishRun() {
        finishRunCalled = true;
      },
      async fetchRecentRuns() {
        return [];
      },
      async fetchRecentPublishedRows() {
        return [];
      }
    },
    runGeneration: async (options) => {
      received = options;
      return {
        ok: true,
        mode: "dry_run",
        template_type: options.template_type,
        generated_count: 1,
        published_count: 0,
        results: [
          {
            slug: "guias/comparar-pisos",
            title: "Comparar pisos antes de llamar",
            template_type: "editorial_guide",
            status: "ready_to_publish",
            quality_score: 86,
            penalties: ["contenido_generico"],
            warnings: ["fuente_visible_debil"],
            rejection_reasons: [],
            indexability_reasons: ["quality_score_below_threshold"],
            sitemap_eligible: false
          }
        ]
      };
    }
  });

  const candidate = result.publication_diagnostics.evaluated_candidates[0];
  assert.equal(startRunCalled, false);
  assert.equal(finishRunCalled, false);
  assert.equal(result.read_only, true);
  assert.equal(result.writes_enabled, false);
  assert.equal(received.mode, "dry_run");
  assert.equal(received.minScore, 90);
  assert.equal(result.generation_summary.skipped_count, 0);
  assert.equal(result.counter_diagnosis.low_score_not_counted_as_skip, 1);
  assert.equal(candidate.reason, "score_below_publish_threshold");
  assert.equal(candidate.score, 86);
  assert.equal(candidate.meets_min_score, false);
  assert.equal(candidate.counted_as_skip, false);
  assert.equal(candidate.discarded_before_skip, true);
  assert.deepEqual(candidate.quality_penalties, ["contenido_generico"]);
  assert.deepEqual(candidate.quality_warnings, ["fuente_visible_debil"]);
});

test("la publicacion SEO no salta el kill switch aunque settings este activo", async () => {
  let called = false;
  const result = await runSeoContentPublication({
    now: "2026-05-22T12:00:00.000Z",
    requestSource: "cron",
    env: {
      SEO_AUTOGENERATION_ENABLED: "false",
      SEO_AUTOGENERATION_DRY_RUN: "false"
    },
    conditions: {
      enabled: true,
      max_per_day: 10,
      max_per_week: 70,
      max_per_run: 2,
      min_score: 80
    },
    storage: {
      async startRun() {
        return { persisted: false, acquired: true };
      },
      async finishRun() {},
      async fetchRecentPublishedRows() {
        return [];
      }
    },
    runGeneration: async () => {
      called = true;
      return { ok: true, generated_count: 1, published_count: 1, results: [] };
    }
  });

  assert.equal(called, false);
  assert.equal(result.enabled, false);
  assert.equal(result.config.environment_enabled, false);
  assert.equal(result.config.settings_enabled, true);
  assert.equal(result.reason, "autogeneration_disabled");
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
  assert.equal(canPublishNow({ ...base, minScore: 95, quality: { score: 94 } }), false);
  assert.equal(canPublishNow({ ...base, minScore: 95, quality: { score: 95 } }), true);
  assert.equal(canPublishNow({ ...base, quality: { score: 95, technical_indexability_status: "blocked" } }), false);
  assert.equal(canPublishNow({ ...base, quality: { score: 95, editorial_quality_status: "review" } }), false);
  assert.equal(canPublishNow({ ...base, quality: { score: 95, rejection_reasons: ["canonical_incoherent"] } }), false);
  assert.equal(canPublishNow({ ...base, quality: { score: 100 }, publishedToday: 4 }), false);
});

test("indexability respeta score minimo configurable en cero", () => {
  const result = evaluateLandingIndexability(
    {
      slug: "precio-metro-cuadrado/test-score-cero",
      title: "Precio del metro cuadrado en Test Score Cero",
      meta_title: "Precio m2 Test Score Cero",
      meta_description: "Referencia de precio por metro cuadrado con fuente y fecha para comparar anuncios.",
      h1: "Precio del metro cuadrado en Test Score Cero",
      status: "published",
      index_status: "index",
      quality_score: 0,
      word_count: 600,
      canonical_url: "https://inmoradar.app/precio-metro-cuadrado/test-score-cero/"
    },
    { minQualityScore: 0, requireInternalLinks: false }
  );

  assert.equal(result.min_quality_score, 0);
  assert.equal(result.can_publish, true);
  assert.equal(result.reasons.includes("quality_score_below_threshold"), false);
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
  const previousSupabaseUrl = process.env.SUPABASE_URL;
  const previousSupabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.PUBLIC_SITE_URL = "https://www.inmoradar.app";
  delete process.env.SITE_URL;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

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
    if (previousSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousSupabaseUrl;
    if (previousSupabaseKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousSupabaseKey;
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
  assert.match(xml, /<loc>https:\/\/inmoradar\.app\/precio-metro-cuadrado\/madrid\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/inmoradar\.app\/precio-alquiler\/madrid\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/inmoradar\.app\/precio-metro-cuadrado\/logrono\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/inmoradar\.app\/saber-si-piso-esta-caro\/granada\/<\/loc>/);
  assert.doesNotMatch(xml, /<loc>https:\/\/www\.inmoradar\.app\//);
  assert.doesNotMatch(xml, /<loc>http:\/\//);
  assert.doesNotMatch(xml, /body_html|seo-reading|Fuente:/);
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

test("fallback local sin Supabase cubre rutas de ciudad representativas", async () => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  async function request(url) {
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
    return { res, html: chunks.join("") };
  }

  try {
    const cases = [
      ["/precio-metro-cuadrado/madrid/", "https://inmoradar.app/precio-metro-cuadrado/madrid/", /Precio del metro cuadrado en Madrid/],
      ["/precio-alquiler/madrid/", "https://inmoradar.app/precio-alquiler/madrid/", /Precio del alquiler por metro cuadrado en Madrid/],
      ["/precio-metro-cuadrado/logrono/", "https://inmoradar.app/precio-metro-cuadrado/logrono/", /Precio del metro cuadrado en Logro/],
      ["/saber-si-piso-esta-caro/granada/", "https://inmoradar.app/saber-si-piso-esta-caro/granada/", /saber si un piso est/]
    ];

    for (const [url, canonical, heading] of cases) {
      const { res, html } = await request(url);
      assert.equal(res.statusCode, 200, url);
      assert.match(html, new RegExp(`<link rel="canonical" href="${canonical.replace(/\//g, "\\/")}">`));
      assert.match(html, /<meta name="robots" content="index,follow">/);
      assert.match(html, heading);
    }
  } finally {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
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

test("Vercel Cron publica SEO real cada cuatro horas sin cambiar limites", () => {
  const root = path.join(__dirname, "..");
  const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
  const seoCron = vercel.crons.find((cron) => cron.path === "/api/cron/seo-publish");
  const config = buildSeoContentPublicationConfig({}, { enabled: true, dryRun: false });

  assert.ok(Array.isArray(vercel.crons));
  assert.equal(fs.existsSync(path.join(root, "api", "cron", "seo-publish.js")), true);
  assert.deepEqual(seoCron, {
    path: "/api/cron/seo-publish",
    schedule: "0 */4 * * *"
  });
  assert.equal(config.schedule, "0 */4 * * *");
  assert.equal(config.max_per_run, 1);
  assert.equal(config.max_per_day, 4);
  assert.equal(config.max_per_week, 28);
  assert.equal(config.min_score, 85);
  assert.equal(nextSeoPublishRun(new Date("2026-05-22T10:30:00.000Z")), "2026-05-22T12:00:00.000Z");
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

test("las landings seed quedan publicadas e indexables", async () => {
  const slugs = [
    "precio-metro-cuadrado/logrono",
    "precio-metro-cuadrado/madrid",
    "precio-alquiler/madrid",
    "saber-si-piso-esta-caro/granada"
  ];

  for (const slug of slugs) {
    const landing = await getSeedPublishedLanding(slug);

    assert.equal(landing.status, "published", slug);
    assert.equal(landing.index_status, "index", slug);
    assert.ok(landing.quality_score >= 85, slug);
    assert.match(landing.canonical_url, new RegExp(`https:\\/\\/inmoradar\\.app\\/${slug.replace(/\//g, "\\/")}\\/`));
    assert.doesNotMatch(landing.canonical_url, /www\.inmoradar\.app/);
    assert.match(landing.body_html, /Fuente:/);
  }
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
