const test = require("node:test");
const assert = require("node:assert/strict");

const {
  KPI_SETTINGS_SCHEMA,
  coerceKpiSettings,
  defaultKpiSettings
} = require("../api/_kpi/settings");
const { _internal: marketPrice } = require("../api/market-price");

test("kpi settings expose editable groups and defaults", () => {
  const defaults = defaultKpiSettings();
  const fieldPaths = KPI_SETTINGS_SCHEMA.flatMap((group) => group.fields.map((field) => field.path));

  assert.ok(fieldPaths.includes("property_score.weights.price"));
  assert.ok(fieldPaths.includes("price_score.baseline"));
  assert.ok(fieldPaths.includes("zone_score.fallback_policy"));
  assert.ok(fieldPaths.includes("pros_cons.market.expensive_pct"));
  assert.ok(fieldPaths.includes("pros_cons.keywords.negative"));
  assert.ok(fieldPaths.includes("visibility.show_photo_analysis"));
  assert.ok(fieldPaths.includes("seo_autogeneration.max_per_day"));
  assert.ok(fieldPaths.includes("seo_autogeneration.max_per_week"));
  assert.ok(fieldPaths.includes("seo_autogeneration.max_per_run"));
  assert.ok(fieldPaths.includes("seo_autogeneration.min_score"));
  assert.equal(defaults.property_score.weights.price, 35);
  assert.equal(defaults.price_score.baseline, 6.4);
  assert.equal(defaults.zone_score.fallback_policy, "hide");
  assert.equal(defaults.pros_cons.max_good, 5);
  assert.equal(defaults.pros_cons.market.expensive_pct, 8);
  assert.equal(defaults.visibility.show_photo_analysis, false);
  assert.equal(defaults.seo_autogeneration.enabled, true);
  assert.equal(defaults.seo_autogeneration.max_per_day, 4);
  assert.equal(defaults.seo_autogeneration.max_per_week, 28);
  assert.equal(defaults.seo_autogeneration.max_per_run, 1);
  assert.equal(defaults.seo_autogeneration.min_score, 85);
});

test("kpi settings coercion clamps unsafe values", () => {
  const settings = coerceKpiSettings({
    model: {
      mode: "unknown",
      show_confidence: "false"
    },
    property_score: {
      max_without_market: "99",
      weights: {
        price: "999"
      }
    },
    zone_score: {
      fallback_policy: "show_warning"
    },
    visibility: {
      show_static_zone_score: "true"
    },
    pros_cons: {
      max_good: "99",
      market: {
        expensive_pct: "500"
      },
      fallback_policy: "invent"
    },
    seo_autogeneration: {
      enabled: "false",
      max_per_day: "999",
      max_per_week: "-1",
      max_per_run: "25",
      min_score: "101"
    }
  });

  assert.equal(settings.model.mode, "balanced");
  assert.equal(settings.model.show_confidence, false);
  assert.equal(settings.property_score.max_without_market, 10);
  assert.equal(settings.property_score.weights.price, 100);
  assert.equal(settings.zone_score.fallback_policy, "show_warning");
  assert.equal(settings.visibility.show_static_zone_score, true);
  assert.equal(settings.pros_cons.max_good, 8);
  assert.equal(settings.pros_cons.market.expensive_pct, 80);
  assert.equal(settings.pros_cons.fallback_policy, "neutral");
  assert.equal(settings.seo_autogeneration.enabled, false);
  assert.equal(settings.seo_autogeneration.max_per_day, 100);
  assert.equal(settings.seo_autogeneration.max_per_week, 0);
  assert.equal(settings.seo_autogeneration.max_per_run, 25);
  assert.equal(settings.seo_autogeneration.min_score, 100);
});

test("market scoring uses editable kpi thresholds", () => {
  const settings = coerceKpiSettings({
    market: {
      sale_thresholds: {
        very_good_pct: -20,
        good_pct: -8,
        market_pct: 2,
        expensive_pct: 6
      }
    }
  });

  assert.equal(marketPrice.classifyComparison(5, "sale").label, "en_mercado");
  assert.equal(marketPrice.classifyComparison(5, "sale", settings).label, "algo_caro");
});
