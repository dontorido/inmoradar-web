const { hasSupabaseConfig, json, supabaseFetch } = require("./_utils");

function safeError(error) {
  return String(error?.message || error || "unknown_error")
    .replace(/eyJ[a-zA-Z0-9._-]+/g, "[redacted-jwt]")
    .replace(/sb_secret_[a-zA-Z0-9._-]+/g, "[redacted-secret]")
    .slice(0, 240);
}

module.exports = async function handler(req, res) {
  const supabaseConfigured = hasSupabaseConfig();
  let marketPricesReadable = false;
  let marketPricesError = null;

  if (supabaseConfigured) {
    try {
      const rows = await supabaseFetch("market_price_sources?select=id&limit=1");
      marketPricesReadable = Array.isArray(rows);
    } catch (error) {
      marketPricesError = safeError(error);
    }
  }

  json(res, 200, {
    ok: true,
    service: "inmoradar-web",
    premium_api: true,
    supabase_configured: supabaseConfigured,
    supabase_market_prices_readable: marketPricesReadable,
    supabase_market_prices_error: marketPricesError,
    lemonsqueezy_webhook_configured: Boolean(process.env.LEMONSQUEEZY_WEBHOOK_SECRET)
  });
};