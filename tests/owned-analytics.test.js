const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const adminHandler = require("../api/admin");
const {
  buildOwnedAnalyticsEvent,
  cleanEventName,
  sanitizeMetadata
} = require("../lib/analytics/ownedEvents");
const {
  buildOwnedAnalyticsLearning,
  recommendFutureContent,
  summarizeOwnedAnalytics,
  summarizePagePerformance
} = require("../lib/analytics/learning");

function at(minutes) {
  return new Date(Date.UTC(2026, 4, 23, 10, minutes, 0)).toISOString();
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

function createJsonResponse() {
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
  return {
    res,
    payload() {
      return JSON.parse(chunks.join("") || "{}");
    }
  };
}

async function callAdminAnalyticsResource(resource, query = "") {
  return withEnv(
    {
      ADMIN_IMPORT_TOKEN: "admin-test-token",
      SUPABASE_URL: undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined
    },
    async () => {
      const { res, payload } = createJsonResponse();
      const req = {
        method: "GET",
        url: `/api/admin?resource=${resource}${query ? `&${query}` : ""}`,
        headers: { authorization: "Bearer admin-test-token", host: "inmoradar.app" }
      };
      await adminHandler(req, res);
      return { statusCode: res.statusCode, payload: payload() };
    }
  );
}

test("buildOwnedAnalyticsEvent acepta solo eventos permitidos", () => {
  const valid = buildOwnedAnalyticsEvent({
    event_name: "install_click",
    anonymous_session_id: "anon-123",
    page_path: "/precio-metro-cuadrado/madrid/",
    browser: "chrome"
  });

  assert.equal(valid.event.event_name, "install_click");
  assert.equal(valid.event.page_path, "/precio-metro-cuadrado/madrid/");
  assert.equal(cleanEventName("not_allowed"), "");

  const invalid = buildOwnedAnalyticsEvent({ event_name: "not_allowed" });
  assert.equal(invalid.error.error, "INVALID_EVENT_NAME");

  assert.equal(buildOwnedAnalyticsEvent({ event_name: "calculator_used" }).event.event_name, "calculator_used");
  assert.equal(buildOwnedAnalyticsEvent({ event_name: "calculator_completed" }).event.event_name, "calculator_completed");
  assert.equal(buildOwnedAnalyticsEvent({ event_name: "seo_internal_link_click" }).event.event_name, "seo_internal_link_click");
  assert.equal(buildOwnedAnalyticsEvent({ event_name: "seo_scroll_depth" }).event.event_name, "seo_scroll_depth");
});

test("sanitizeMetadata elimina emails, claves sensibles y valores exactos de calculadora", () => {
  const redactedKeys = [
    "price",
    "price_m2",
    "priceM2",
    "priceTotal",
    "totalPrice",
    "listingPrice",
    "listing_price_total",
    "rentPrice",
    "salePrice",
    "monthlyRent",
    "area",
    "area_m2",
    "areaM2",
    "surface",
    "surface_m2",
    "surfaceM2",
    "superficie",
    "superficie_m2",
    "superficieM2",
    "sqm",
    "squareMeters",
    "square_meters",
    "m2"
  ];

  redactedKeys.forEach((key) => {
    const metadata = sanitizeMetadata({
      [key]: 240000,
      calculator_type: "price_city"
    });
    const safeKey = key.toLowerCase().replace(/[^a-z0-9._:/-]+/g, "_").replace(/^_+|_+$/g, "");
    assert.equal(metadata[safeKey], undefined);
    assert.equal(metadata.calculator_type, "price_city");
  });

  const metadata = sanitizeMetadata({
    email: "sergio@example.com",
    label: "Instalar gratis",
    page_type: "seo",
    city: "Sevilla",
    path: "/precio-metro-cuadrado/sevilla/",
    event_source: "calculator",
    calculator_type: "price_city",
    link_context: "seo_content",
    scroll_depth: 90,
    seo_origin_session_id: "anon-123",
    has_price: true,
    has_area: true,
    result_band: "above_market",
    nested: {
      token: "secret-token",
      comment: "texto util",
      price_m2: 2400,
      priceM2: 2400,
      listingPrice: 240000,
      areaM2: 100,
      surfaceM2: 100,
      superficieM2: 100,
      value: "hola@example.com"
    },
    array: [
      { label: "ok", priceM2: 2400 },
      { link_context: "related_content", areaM2: 100 }
    ]
  });

  assert.equal(metadata.email, undefined);
  assert.equal(metadata.label, "Instalar gratis");
  assert.equal(metadata.page_type, "seo");
  assert.equal(metadata.city, "Sevilla");
  assert.equal(metadata.path, "/precio-metro-cuadrado/sevilla/");
  assert.equal(metadata.event_source, "calculator");
  assert.equal(metadata.calculator_type, "price_city");
  assert.equal(metadata.link_context, "seo_content");
  assert.equal(metadata.scroll_depth, 90);
  assert.equal(metadata.seo_origin_session_id, "anon-123");
  assert.equal(metadata.has_price, true);
  assert.equal(metadata.has_area, true);
  assert.equal(metadata.result_band, "above_market");
  assert.equal(metadata.nested.token, undefined);
  assert.equal(metadata.nested.comment, "texto util");
  assert.equal(metadata.nested.price_m2, undefined);
  assert.equal(metadata.nested.pricem2, undefined);
  assert.equal(metadata.nested.listingprice, undefined);
  assert.equal(metadata.nested.aream2, undefined);
  assert.equal(metadata.nested.surfacem2, undefined);
  assert.equal(metadata.nested.superficiem2, undefined);
  assert.equal(metadata.nested.value, undefined);
  assert.deepEqual(metadata.array, [{ label: "ok" }, { link_context: "related_content" }]);
});

test("owned analytics conserva atribucion web-store no sensible", () => {
  const result = buildOwnedAnalyticsEvent({
    event_name: "chrome_store_click",
    anonymous_session_id: "anon-store",
    page_path: "/analizar-anuncio-inmobiliario/",
    page_url: "https://www.inmoradar.app/analizar-anuncio-inmobiliario/?utm_source=google&utm_campaign=chrome_extension",
    source: "hero_install",
    utm: {
      source: "google",
      medium: "cpc",
      campaign: "chrome_extension"
    },
    metadata: {
      attribution_id: "attr_123_safe",
      install_source: "hero_install",
      landing_path: "https://www.inmoradar.app/analizar-anuncio-inmobiliario/?email=sergio@example.com",
      click_timestamp: "2026-05-24T08:30:00.000Z",
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "chrome_extension",
      store: "chrome_web_store",
      full_url: "https://www.inmoradar.app/analizar?email=sergio@example.com",
      listing_url: "https://www.idealista.com/inmueble/123456789/",
      note: "visita https://example.com/piso/123456789 o llama 600 000 000"
    }
  });

  assert.equal(result.event.utm.source, "google");
  assert.equal(result.event.utm.medium, "cpc");
  assert.equal(result.event.utm.campaign, "chrome_extension");
  assert.equal(result.event.metadata.attribution_id, "attr_123_safe");
  assert.equal(result.event.metadata.install_source, "hero_install");
  assert.equal(result.event.metadata.landing_path, "/analizar-anuncio-inmobiliario/");
  assert.equal(result.event.metadata.click_timestamp, "2026-05-24T08:30:00.000Z");
  assert.equal(result.event.metadata.utm_source, "google");
  assert.equal(result.event.metadata.utm_campaign, "chrome_extension");
  assert.equal(result.event.metadata.store, "chrome_web_store");
  assert.equal(result.event.metadata.full_url, undefined);
  assert.equal(result.event.metadata.listing_url, undefined);
  assert.equal(JSON.stringify(result.event.metadata).includes("https://"), false);
  assert.equal(JSON.stringify(result.event.metadata).includes("123456789"), false);
  assert.equal(JSON.stringify(result.event.metadata).includes("600"), false);
});

test("app.js genera attribution_id para install_click y chrome_store_click", () => {
  const script = fs.readFileSync(path.join(__dirname, "..", "assets", "app.js"), "utf8");

  assert.match(script, /INSTALL_ATTRIBUTION_STORAGE_KEY/);
  assert.match(script, /function createInstallAttribution/);
  assert.match(script, /attribution_id/);
  assert.match(script, /landing_path/);
  assert.match(script, /utm_campaign/);
  assert.match(script, /trackOwnedEvent\(installCtaEventName\(source\)/);
  assert.match(script, /trackOwnedEvent\("chrome_store_click"/);
});

test("summarizeOwnedAnalytics calcula ratios de conversion", () => {
  const events = [
    { event_name: "page_view", page_path: "/" },
    { event_name: "page_view", page_path: "/" },
    { event_name: "install_click", page_path: "/" },
    { event_name: "chrome_store_click", page_path: "/" },
    { event_name: "calculator_used", page_path: "/" },
    { event_name: "calculator_completed", page_path: "/" },
    { event_name: "seo_scroll_depth", page_path: "/", metadata: { depth: 50 } },
    { event_name: "seo_scroll_depth", page_path: "/", metadata: { depth: 90 } },
    { event_name: "checkout_start", page_path: "/premium" },
    { event_name: "checkout_created", page_path: "/premium" }
  ];

  const summary = summarizeOwnedAnalytics(events);
  assert.equal(summary.total_events, 10);
  assert.equal(summary.page_views, 2);
  assert.equal(summary.calculator_used, 1);
  assert.equal(summary.calculator_completed, 1);
  assert.equal(summary.scroll_depth_50, 1);
  assert.equal(summary.scroll_depth_90, 1);
  assert.equal(summary.install_click_rate, 100);
  assert.equal(summary.checkout_created_rate, 100);
});

test("summarizePagePerformance ordena paginas por resultado", () => {
  const events = [
    { event_name: "page_view", page_path: "/guias/a", template_type: "editorial_guide", topic: "hipoteca", anonymous_session_id: "s1", created_at: at(0) },
    { event_name: "calculator_used", page_path: "/guias/a", template_type: "editorial_guide", topic: "hipoteca", anonymous_session_id: "s1", created_at: at(1) },
    { event_name: "calculator_completed", page_path: "/guias/a", template_type: "editorial_guide", topic: "hipoteca", anonymous_session_id: "s1", created_at: at(2) },
    { event_name: "install_click", page_path: "/guias/a", template_type: "editorial_guide", topic: "hipoteca", anonymous_session_id: "s1", created_at: at(3) },
    { event_name: "checkout_created", page_path: "/guias/a", template_type: "editorial_guide", topic: "hipoteca", anonymous_session_id: "s1", created_at: at(4) },
    { event_name: "page_view", page_path: "/guias/b", template_type: "editorial_guide", topic: "barrios" }
  ];

  const pages = summarizePagePerformance(events);
  assert.equal(pages[0].page, "/guias/a");
  assert.ok(pages[0].performance_score > pages[1].performance_score);
  assert.equal(pages[0].install_rate, 100);
  assert.equal(pages[0].calculator_used_count, 1);
  assert.equal(pages[0].calculator_completed_count, 1);
  assert.equal(pages[0].sessions_with_calculator, 1);
  assert.equal(pages[0].sessions_with_calculator_then_install, 1);
  assert.equal(pages[0].calculator_to_install_rate, 100);
});

test("recommendFutureContent propone repetir ganadores y mejorar CTAs flojos", () => {
  const pages = [
    {
      page: "/guias/ganadora",
      topic: "primera vivienda",
      city: "Madrid",
      visits: 20,
      install_rate: 12,
      checkout_created_count: 1,
      performance_score: 50
    },
    {
      page: "/precio/floja",
      topic: "precio alquiler",
      city: "Valencia",
      visits: 12,
      install_rate: 0,
      checkout_starts: 0,
      performance_score: 1
    },
    {
      page: "/precio/calculadora",
      topic: "precio metro cuadrado",
      city: "Sevilla",
      visits: 20,
      install_rate: 0,
      install_intent: 0,
      checkout_starts: 0,
      calculator_used_count: 8,
      sessions_with_calculator: 8,
      sessions_with_calculator_then_install: 0,
      calculator_to_install_rate: 0,
      interaction_count: 10,
      scroll_depth_90_count: 2,
      performance_score: 12
    }
  ];

  const actions = recommendFutureContent(pages).map((item) => item.action);
  assert.ok(actions.includes("create_related_content"));
  assert.ok(actions.includes("improve_cta"));
  assert.ok(actions.includes("review_calculator_cta"));
});

test("buildOwnedAnalyticsLearning funciona sin datos", () => {
  const learning = buildOwnedAnalyticsLearning([]);
  assert.equal(learning.summary.total_events, 0);
  assert.equal(learning.summary.calculator_used, 0);
  assert.equal(learning.summary.scroll_depth_90, 0);
  assert.equal(learning.pages.length, 0);
  assert.equal(learning.recommendations[0].action, "collect_more_data");
});

test("buildOwnedAnalyticsLearning reconoce paginas con calculadora e intencion", () => {
  const learning = buildOwnedAnalyticsLearning([
    { event_name: "page_view", page_path: "/precio-metro-cuadrado/sevilla/", template_type: "price_city", city: "Sevilla", anonymous_session_id: "s1", created_at: at(0) },
    { event_name: "calculator_used", page_path: "/precio-metro-cuadrado/sevilla/", template_type: "price_city", city: "Sevilla", anonymous_session_id: "s1", created_at: at(1) },
    { event_name: "calculator_completed", page_path: "/precio-metro-cuadrado/sevilla/", template_type: "price_city", city: "Sevilla", anonymous_session_id: "s1", created_at: at(2) },
    { event_name: "seo_cta_click", page_path: "/precio-metro-cuadrado/sevilla/", template_type: "price_city", city: "Sevilla", anonymous_session_id: "s1", created_at: at(3) }
  ]);

  assert.equal(learning.pages[0].calculator_used_count, 1);
  assert.equal(learning.pages[0].calculator_completed_count, 1);
  assert.equal(learning.pages[0].sessions_with_calculator, 1);
  assert.equal(learning.pages[0].sessions_with_calculator_then_install, 1);
  assert.equal(learning.calculator_install_pages[0].page, "/precio-metro-cuadrado/sevilla/");
});

test("summarizePagePerformance calcula intencion posterior a calculadora por sesion", () => {
  const pagePath = "/precio-metro-cuadrado/sevilla/";
  const events = [
    { event_name: "calculator_used", page_path: pagePath, anonymous_session_id: "same-after", created_at: at(1) },
    { event_name: "seo_cta_click", page_path: pagePath, anonymous_session_id: "same-after", created_at: at(2) },
    { event_name: "chrome_store_click", page_path: pagePath, anonymous_session_id: "same-after", created_at: at(3) },
    { event_name: "install_click", page_path: pagePath, anonymous_session_id: "before", created_at: at(4) },
    { event_name: "calculator_used", page_path: pagePath, anonymous_session_id: "before", created_at: at(5) },
    { event_name: "calculator_used", page_path: pagePath, anonymous_session_id: "other-calc", created_at: at(6) },
    { event_name: "install_click", page_path: pagePath, anonymous_session_id: "other-install", created_at: at(7) },
    { event_name: "calculator_used", page_path: pagePath, anonymous_session_id: "no-install", created_at: at(8) }
  ];

  const [page] = summarizePagePerformance(events);

  assert.equal(page.calculator_used_count, 4);
  assert.equal(page.install_intent, 4);
  assert.equal(page.sessions_with_calculator, 4);
  assert.equal(page.sessions_with_calculator_then_install, 1);
  assert.equal(page.calculator_to_install_rate, 25);
});

test("summarizePagePerformance no genera tasas superiores al 100%", () => {
  const pagePath = "/precio-metro-cuadrado/granada/";
  const events = [
    { event_name: "calculator_used", page_path: pagePath, anonymous_session_id: "s1", created_at: at(1) },
    { event_name: "seo_cta_click", page_path: pagePath, anonymous_session_id: "s1", created_at: at(2) },
    { event_name: "chrome_store_click", page_path: pagePath, anonymous_session_id: "s1", created_at: at(3) },
    { event_name: "install_click", page_path: pagePath, anonymous_session_id: "s1", created_at: at(4) }
  ];

  const [page] = summarizePagePerformance(events);

  assert.equal(page.install_intent, 3);
  assert.equal(page.sessions_with_calculator, 1);
  assert.equal(page.sessions_with_calculator_then_install, 1);
  assert.equal(page.calculator_to_install_rate, 100);
});

test("summarizePagePerformance maneja paginas sin calculator_used", () => {
  const [page] = summarizePagePerformance([
    { event_name: "page_view", page_path: "/guias/sin-calculadora", anonymous_session_id: "s1", created_at: at(1) },
    { event_name: "install_click", page_path: "/guias/sin-calculadora", anonymous_session_id: "s1", created_at: at(2) }
  ]);

  assert.equal(page.calculator_used_count, 0);
  assert.equal(page.sessions_with_calculator, 0);
  assert.equal(page.sessions_with_calculator_then_install, 0);
  assert.equal(page.calculator_to_install_rate, 0);
});

test("admin analytics summary acepta rangos permitidos de dias", async () => {
  const oneDay = await callAdminAnalyticsResource("analytics/summary", "days=1");
  const ninetyDays = await callAdminAnalyticsResource("analytics/summary", "days=90");

  assert.equal(oneDay.statusCode, 200);
  assert.equal(oneDay.payload.window_days, 1);
  assert.equal(oneDay.payload.window_hours, 24);
  assert.equal(ninetyDays.statusCode, 200);
  assert.equal(ninetyDays.payload.window_days, 90);
  assert.equal(ninetyDays.payload.window_hours, 2160);
});

test("admin analytics resources aceptan rango explicito desde hasta", async () => {
  const summary = await callAdminAnalyticsResource("analytics/summary", "from=2026-05-01&to=2026-05-10");
  const pages = await callAdminAnalyticsResource("analytics/pages", "from=2026-05-01T00%3A00%3A00.000Z&to=2026-05-10T23%3A59%3A59.999Z");

  assert.equal(summary.statusCode, 200);
  assert.equal(summary.payload.window_mode, "date_range");
  assert.equal(summary.payload.window_from_date, "2026-05-01");
  assert.equal(summary.payload.window_to_date, "2026-05-10");
  assert.equal(summary.payload.window_days, 10);
  assert.equal(summary.payload.window_hours, 240);
  assert.equal(pages.statusCode, 200);
  assert.equal(pages.payload.window_mode, "date_range");
  assert.equal(pages.payload.window_from_date, "2026-05-01");
  assert.equal(pages.payload.window_to_date, "2026-05-10");
});

test("admin analytics aplica el rango explicito al filtro de Supabase", async () => {
  const previousFetch = global.fetch;
  let requestedUrl = "";

  await withEnv(
    {
      ADMIN_IMPORT_TOKEN: "admin-test-token",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test"
    },
    async () => {
      global.fetch = async (url) => {
        requestedUrl = String(url);
        return {
          ok: true,
          status: 200,
          json: async () => [],
          text: async () => ""
        };
      };

      try {
        const { res, payload } = createJsonResponse();
        const req = {
          method: "GET",
          url: "/api/admin?resource=analytics/summary&from=2026-05-01&to=2026-05-10",
          headers: { authorization: "Bearer admin-test-token", host: "inmoradar.app" }
        };
        await adminHandler(req, res);
        assert.equal(res.statusCode, 200);
        assert.equal(payload().window_mode, "date_range");
      } finally {
        global.fetch = previousFetch;
      }
    }
  );

  const filters = new URL(requestedUrl).searchParams.getAll("occurred_at");
  assert.deepEqual(filters, ["gte.2026-05-01T00:00:00.000Z", "lte.2026-05-10T23:59:59.999Z"]);
});

test("admin analytics/funnel agrega intencion web y activacion extension", async () => {
  const previousFetch = global.fetch;
  const webRows = [
    {
      event_name: "chrome_store_click",
      occurred_at: "2026-05-01T10:00:00.000Z",
      page_path: "/analizar-anuncio-inmobiliario/",
      source: "hero",
      utm: { source: "google", medium: "cpc", campaign: "cpc_madrid" },
      metadata: {
        landing_path: "https://www.inmoradar.app/analizar-anuncio-inmobiliario/?email=sergio@example.com",
        attribution_id: "attr_1"
      }
    },
    {
      event_name: "install_click",
      occurred_at: "2026-05-01T10:01:00.000Z",
      page_path: "/analizar-anuncio-inmobiliario/",
      source: "hero",
      utm: { source: "google", medium: "cpc", campaign: "cpc_madrid" },
      metadata: { landing_path: "/analizar-anuncio-inmobiliario/?utm_campaign=cpc_madrid" }
    },
    {
      event_name: "chrome_store_click",
      occurred_at: "2026-05-02T10:00:00.000Z",
      page_path: "/",
      source: "social",
      utm: { source: "instagram", medium: "social", campaign: "ig_launch" },
      metadata: { landing_path: "/" }
    },
    { event_name: "page_view", occurred_at: "2026-05-02T11:00:00.000Z", page_path: "/" }
  ];
  const extensionRows = [
    { event_name: "extension_opened", occurred_at: "2026-05-01T11:00:00.000Z", anonymous_id_hash: "u1", page_domain: "idealista.com" },
    { event_name: "listing_detected", occurred_at: "2026-05-01T11:01:00.000Z", anonymous_id_hash: "u1", page_domain: "idealista.com" },
    { event_name: "analysis_started", occurred_at: "2026-05-01T11:02:00.000Z", anonymous_id_hash: "u1", page_domain: "idealista.com" },
    { event_name: "analysis_completed", occurred_at: "2026-05-01T11:03:00.000Z", anonymous_id_hash: "u1", page_domain: "idealista.com" },
    { event_name: "first_listing_analysis", occurred_at: "2026-05-02T11:03:00.000Z", anonymous_id_hash: "u1", page_domain: "idealista.com" }
  ];

  await withEnv(
    {
      ADMIN_IMPORT_TOKEN: "admin-test-token",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test"
    },
    async () => {
      global.fetch = async (url) => {
        const href = String(url);
        const rows = href.includes("extension_usage_events") ? extensionRows : webRows;
        return {
          ok: true,
          status: 200,
          json: async () => rows,
          text: async () => JSON.stringify(rows)
        };
      };

      try {
        const { res, payload } = createJsonResponse();
        const req = {
          method: "GET",
          url: "/api/admin?resource=analytics/funnel&from=2026-05-01&to=2026-05-07",
          headers: { authorization: "Bearer admin-test-token", host: "inmoradar.app" }
        };
        await adminHandler(req, res);
        const body = payload();

        assert.equal(res.statusCode, 200);
        assert.equal(body.attribution_mode, "aggregate_window");
        assert.match(body.attribution_note, /agregada/);
        assert.equal(body.summary.chrome_store_clicks, 2);
        assert.equal(body.summary.install_clicks, 1);
        assert.equal(body.summary.first_listing_analysis, 1);
        assert.equal(body.summary.analysis_completed, 1);
        assert.equal(body.summary.aggregate_chrome_store_to_first_listing_analysis_rate, 50);
        assert.equal(body.summary.aggregate_extension_opened_to_first_listing_analysis_rate, 100);
        assert.equal(body.by_day.find((item) => item.label === "2026-05-01").analysis_completed, 1);
        assert.equal(body.by_day.find((item) => item.label === "2026-05-02").first_listing_analysis, 1);
        assert.equal(body.by_utm_source[0].label, "google");
        assert.equal(body.by_utm_campaign.find((item) => item.label === "cpc_madrid").chrome_store_clicks, 1);
        assert.equal(body.by_landing_path.find((item) => item.label === "/analizar-anuncio-inmobiliario/").web_intent_events, 2);
        assert.equal(body.by_page_domain[0].label, "idealista.com");
        assert.equal(body.by_page_domain[0].analysis_completed, 1);
        assert.equal(JSON.stringify(body).includes("sergio@example.com"), false);
        assert.equal(JSON.stringify(body).includes("?email="), false);
      } finally {
        global.fetch = previousFetch;
      }
    }
  );
});

test("admin analytics/funnel maneja eventos legacy y divisiones por cero", async () => {
  const previousFetch = global.fetch;

  await withEnv(
    {
      ADMIN_IMPORT_TOKEN: "admin-test-token",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test"
    },
    async () => {
      global.fetch = async (url) => {
        const href = String(url);
        const rows = href.includes("extension_usage_events")
          ? [{ event_name: "analysis_completed", created_at: "2026-05-03T09:00:00.000Z" }]
          : [{ event_name: "chrome_store_click", created_at: "2026-05-03T08:00:00.000Z" }];
        return {
          ok: true,
          status: 200,
          json: async () => rows,
          text: async () => JSON.stringify(rows)
        };
      };

      try {
        const { res, payload } = createJsonResponse();
        const req = {
          method: "GET",
          url: "/api/admin?resource=analytics/funnel&from=2026-05-01&to=2026-05-07",
          headers: { authorization: "Bearer admin-test-token", host: "inmoradar.app" }
        };
        await adminHandler(req, res);
        const body = payload();

        assert.equal(res.statusCode, 200);
        assert.equal(body.summary.chrome_store_clicks, 1);
        assert.equal(body.summary.analysis_completed, 1);
        assert.equal(body.summary.first_listing_analysis, 0);
        assert.equal(body.summary.aggregate_extension_opened_to_first_listing_analysis_rate, 0);
        assert.equal(body.summary.analysis_started_to_completed_rate, 0);
        assert.equal(body.by_page_domain[0].label, "unknown");
      } finally {
        global.fetch = previousFetch;
      }
    }
  );
});

test("admin analytics limita rangos explicitos a 90 dias", async () => {
  const summary = await callAdminAnalyticsResource("analytics/summary", "from=2026-01-01&to=2026-05-23");

  assert.equal(summary.statusCode, 200);
  assert.equal(summary.payload.window_mode, "date_range");
  assert.equal(summary.payload.window_clamped, true);
  assert.equal(summary.payload.window_from_date, "2026-02-23");
  assert.equal(summary.payload.window_to_date, "2026-05-23");
  assert.equal(summary.payload.window_days, 90);
});

test("admin analytics resources usan 7 dias por defecto si el rango no es valido", async () => {
  const summary = await callAdminAnalyticsResource("analytics/summary", "days=2");
  const pages = await callAdminAnalyticsResource("analytics/pages", "days=abc");
  const learning = await callAdminAnalyticsResource("analytics/learning", "days=365");

  assert.equal(summary.statusCode, 200);
  assert.equal(summary.payload.window_days, 7);
  assert.equal(summary.payload.window_hours, 168);
  assert.equal(pages.statusCode, 200);
  assert.equal(pages.payload.window_days, 7);
  assert.equal(learning.statusCode, 200);
  assert.equal(learning.payload.window_days, 7);
});

test("BackOffice presenta intencion de instalacion y score interno sin prometer instalacion real", () => {
  const script = fs.readFileSync(path.join(__dirname, "..", "assets", "admin.js"), "utf8");
  const html = fs.readFileSync(path.join(__dirname, "..", "admin.html"), "utf8");

  assert.match(script, /Intención instalación/);
  assert.match(script, /Chrome Store/);
  assert.match(script, /Índice interno/);
  assert.match(script, /No confirma instalación real/);
  assert.match(script, /No es una nota SEO sobre 100/);
  assert.match(script, /Ver p&aacute;gina/);
  assert.match(script, /analytics\/funnel/);
  assert.match(script, /Ratio agregado Store -> analisis/);
  assert.match(html, /IntenciÃ³n web vs activaciÃ³n extensiÃ³n/);
  assert.match(html, /No es atribuciÃ³n determinÃ­stica por usuario/);
  assert.doesNotMatch(script, /stat\("Instalacion"/);
  assert.doesNotMatch(script, /<dt>Score<\/dt>/);
});
