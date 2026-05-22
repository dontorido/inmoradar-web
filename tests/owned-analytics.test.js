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
});

test("sanitizeMetadata elimina emails y claves sensibles", () => {
  const metadata = sanitizeMetadata({
    email: "sergio@example.com",
    label: "Instalar gratis",
    nested: {
      token: "secret-token",
      comment: "texto util",
      value: "hola@example.com"
    }
  });

  assert.equal(metadata.email, undefined);
  assert.equal(metadata.label, "Instalar gratis");
  assert.equal(metadata.nested.token, undefined);
  assert.equal(metadata.nested.comment, "texto util");
  assert.equal(metadata.nested.value, undefined);
});

test("summarizeOwnedAnalytics calcula ratios de conversion", () => {
  const events = [
    { event_name: "page_view", page_path: "/" },
    { event_name: "page_view", page_path: "/" },
    { event_name: "install_click", page_path: "/" },
    { event_name: "chrome_store_click", page_path: "/" },
    { event_name: "checkout_start", page_path: "/premium" },
    { event_name: "checkout_created", page_path: "/premium" }
  ];

  const summary = summarizeOwnedAnalytics(events);
  assert.equal(summary.total_events, 6);
  assert.equal(summary.page_views, 2);
  assert.equal(summary.install_click_rate, 100);
  assert.equal(summary.checkout_created_rate, 100);
});

test("summarizePagePerformance ordena paginas por resultado", () => {
  const events = [
    { event_name: "page_view", page_path: "/guias/a", template_type: "editorial_guide", topic: "hipoteca" },
    { event_name: "install_click", page_path: "/guias/a", template_type: "editorial_guide", topic: "hipoteca" },
    { event_name: "checkout_created", page_path: "/guias/a", template_type: "editorial_guide", topic: "hipoteca" },
    { event_name: "page_view", page_path: "/guias/b", template_type: "editorial_guide", topic: "barrios" }
  ];

  const pages = summarizePagePerformance(events);
  assert.equal(pages[0].page, "/guias/a");
  assert.ok(pages[0].performance_score > pages[1].performance_score);
  assert.equal(pages[0].install_rate, 100);
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
    }
  ];

  const actions = recommendFutureContent(pages).map((item) => item.action);
  assert.ok(actions.includes("create_related_content"));
  assert.ok(actions.includes("improve_cta"));
});

test("buildOwnedAnalyticsLearning funciona sin datos", () => {
  const learning = buildOwnedAnalyticsLearning([]);
  assert.equal(learning.summary.total_events, 0);
  assert.equal(learning.pages.length, 0);
  assert.equal(learning.recommendations[0].action, "collect_more_data");
});