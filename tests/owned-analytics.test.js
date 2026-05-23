const assert = require("node:assert/strict");
const test = require("node:test");

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
  const metadata = sanitizeMetadata({
    email: "sergio@example.com",
    label: "Instalar gratis",
    price: 240000,
    listing_price_total: 240000,
    area_m2: 100,
    superficie_m2: 100,
    surface: 100,
    has_price: true,
    has_area: true,
    result_band: "above_market",
    nested: {
      token: "secret-token",
      comment: "texto util",
      price_m2: 2400,
      value: "hola@example.com"
    }
  });

  assert.equal(metadata.email, undefined);
  assert.equal(metadata.label, "Instalar gratis");
  assert.equal(metadata.price, undefined);
  assert.equal(metadata.listing_price_total, undefined);
  assert.equal(metadata.area_m2, undefined);
  assert.equal(metadata.superficie_m2, undefined);
  assert.equal(metadata.surface, undefined);
  assert.equal(metadata.has_price, true);
  assert.equal(metadata.has_area, true);
  assert.equal(metadata.result_band, "above_market");
  assert.equal(metadata.nested.token, undefined);
  assert.equal(metadata.nested.comment, "texto util");
  assert.equal(metadata.nested.price_m2, undefined);
  assert.equal(metadata.nested.value, undefined);
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
    { event_name: "page_view", page_path: "/guias/a", template_type: "editorial_guide", topic: "hipoteca" },
    { event_name: "calculator_used", page_path: "/guias/a", template_type: "editorial_guide", topic: "hipoteca" },
    { event_name: "calculator_completed", page_path: "/guias/a", template_type: "editorial_guide", topic: "hipoteca" },
    { event_name: "install_click", page_path: "/guias/a", template_type: "editorial_guide", topic: "hipoteca" },
    { event_name: "checkout_created", page_path: "/guias/a", template_type: "editorial_guide", topic: "hipoteca" },
    { event_name: "page_view", page_path: "/guias/b", template_type: "editorial_guide", topic: "barrios" }
  ];

  const pages = summarizePagePerformance(events);
  assert.equal(pages[0].page, "/guias/a");
  assert.ok(pages[0].performance_score > pages[1].performance_score);
  assert.equal(pages[0].install_rate, 100);
  assert.equal(pages[0].calculator_used_count, 1);
  assert.equal(pages[0].calculator_completed_count, 1);
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
    { event_name: "page_view", page_path: "/precio-metro-cuadrado/sevilla/", template_type: "price_city", city: "Sevilla" },
    { event_name: "calculator_used", page_path: "/precio-metro-cuadrado/sevilla/", template_type: "price_city", city: "Sevilla" },
    { event_name: "calculator_completed", page_path: "/precio-metro-cuadrado/sevilla/", template_type: "price_city", city: "Sevilla" },
    { event_name: "seo_cta_click", page_path: "/precio-metro-cuadrado/sevilla/", template_type: "price_city", city: "Sevilla" }
  ]);

  assert.equal(learning.pages[0].calculator_used_count, 1);
  assert.equal(learning.pages[0].calculator_completed_count, 1);
  assert.equal(learning.calculator_install_pages[0].page, "/precio-metro-cuadrado/sevilla/");
});
