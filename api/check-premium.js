const {
  handleCors,
  hasSupabaseConfig,
  isEmail,
  isPremiumActive,
  json,
  normalizeEmail,
  readRawBody,
  supabaseFetch
} = require("./_utils");

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!["GET", "POST"].includes(req.method)) {
    json(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    let email = normalizeEmail(req.query?.email);
    if (!email && req.method === "POST") {
      const rawBody = await readRawBody(req);
      const body = rawBody ? JSON.parse(rawBody) : {};
      email = normalizeEmail(body.email);
    }

    if (!isEmail(email)) {
      json(res, 400, { ok: false, premium: false, error: "invalid_email" });
      return;
    }

    if (!hasSupabaseConfig()) {
      json(res, 200, {
        ok: true,
        premium: false,
        email,
        status: "not_configured",
        message: "Premium todavia no esta conectado."
      });
      return;
    }

    const rows = await supabaseFetch(
      `premium_subscriptions?email=eq.${encodeURIComponent(email)}&select=email,status,renews_at,ends_at,provider,provider_subscription_id,updated_at&limit=1`
    );
    const subscription = Array.isArray(rows) ? rows[0] : null;
    const premium = isPremiumActive(subscription);

    json(res, 200, {
      ok: true,
      premium,
      email,
      status: subscription?.status || "not_found",
      renews_at: subscription?.renews_at || null,
      ends_at: subscription?.ends_at || null,
      checked_at: new Date().toISOString()
    });
  } catch (error) {
    console.error("[check-premium]", error);
    json(res, 500, {
      ok: false,
      premium: false,
      error: "premium_check_failed"
    });
  }
};
