const { hasSupabaseConfig, json, supabaseFetch } = require("./_utils");

function safeError(error) {
  return String(error?.message || error || "unknown_error")
    .replace(/eyJ[a-zA-Z0-9._-]+/g, "[redacted-jwt]")
    .replace(/sb_secret_[a-zA-Z0-9._-]+/g, "[redacted-secret]")
    .slice(0, 240);
}

function isProductionRuntime() {
  const runtime = String(process.env.VERCEL_ENV || process.env.NODE_ENV || "").toLowerCase();
  return runtime === "production";
}

function lemonTestMode() {
  const explicit = process.env.LEMONSQUEEZY_TEST_MODE;
  if (explicit !== undefined && explicit !== "") {
    return String(explicit).toLowerCase() !== "false";
  }
  return !isProductionRuntime();
}

async function checkSupabaseTable(path) {
  try {
    const rows = await supabaseFetch(path, { timeoutMs: 4000 });
    return {
      ok: Array.isArray(rows),
      error: null
    };
  } catch (error) {
    return {
      ok: false,
      error: safeError(error)
    };
  }
}

module.exports = async function handler(req, res) {
  const supabaseConfigured = hasSupabaseConfig();
  const supabaseChecks = {};

  if (supabaseConfigured) {
    const checks = await Promise.all([
      ["market_price_sources", "market_price_sources?select=id&limit=1"],
      ["seo_landings", "seo_landings?select=id&limit=1"],
      ["kpi_settings", "kpi_settings?select=id&limit=1"],
      ["premium_subscriptions", "premium_subscriptions?select=id&limit=1"],
      ["premium_revenue_events", "premium_revenue_events?select=id&limit=1"],
      ["release_artifacts", "release_artifacts?select=id&limit=1"],
      ["extension_usage_events", "extension_usage_events?select=id&limit=1"],
      ["photo_condition_analysis_cache", "photo_condition_analysis_cache?select=id&limit=1"],
      ["address_intelligence_cache", "address_intelligence_cache?select=id&limit=1"],
      ["parking_difficulty_cache", "parking_difficulty_cache?select=id&limit=1"],
      ["saved_property_email_reports", "saved_property_email_reports?select=id&limit=1"],
      ["customer_portal_access_tokens", "customer_portal_access_tokens?select=id&limit=1"],
      ["contact_messages", "contact_messages?select=id&limit=1"]
    ].map(async ([name, path]) => [name, await checkSupabaseTable(path)]));

    for (const [name, result] of checks) {
      supabaseChecks[name] = result;
    }
  }

  json(res, 200, {
    ok: true,
    message: "InmoRadar API",
    status: "ok",
    service: "inmoradar-web",
    generated_at: new Date().toISOString(),
    premium_api: true,
    supabase_configured: supabaseConfigured,
    supabase_checks: supabaseChecks,
    supabase_market_prices_readable: Boolean(supabaseChecks.market_price_sources?.ok),
    supabase_market_prices_error: supabaseChecks.market_price_sources?.error || null,
    lemonsqueezy_checkout_configured: Boolean(
      process.env.LEMONSQUEEZY_API_KEY &&
        process.env.LEMONSQUEEZY_STORE_ID &&
        process.env.LEMONSQUEEZY_VARIANT_ID
    ),
    lemonsqueezy_test_mode: lemonTestMode(),
    lemonsqueezy_webhook_configured: Boolean(process.env.LEMONSQUEEZY_WEBHOOK_SECRET),
    cloudflare_email_configured: Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_EMAIL_API_TOKEN)
  });
};
