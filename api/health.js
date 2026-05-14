const { json } = require("./_utils");

module.exports = function handler(req, res) {
  json(res, 200, {
    ok: true,
    service: "inmoradar-web",
    premium_api: true,
    supabase_configured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    lemonsqueezy_webhook_configured: Boolean(process.env.LEMONSQUEEZY_WEBHOOK_SECRET)
  });
};
