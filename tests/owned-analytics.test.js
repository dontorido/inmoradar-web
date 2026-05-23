const assert = require("node:assert/strict");
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

test("buildOwnedAnalyticsLearning reconoce paginas con calculadora e instalacion", () => {
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

test("summarizePagePerformance calcula instalacion posterior a calculadora por sesion", () => {
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
