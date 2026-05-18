const { assertAdmin, handleCors, hasSupabaseConfig, json, supabaseFetch } = require("../../_utils");
const { clampLimit } = require("../_helpers");

function sanitizeSearch(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[%*,]/g, "")
    .slice(0, 80);
}

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== "GET") {
    return json(res, 405, { ok: false, error: "method_not_allowed" });
  }
  if (!assertAdmin(req, res)) return;
  if (!hasSupabaseConfig()) {
    return json(res, 500, { ok: false, error: "supabase_not_configured" });
  }

  try {
    const url = new URL(req.url || "/", `https://${req.headers.host || "inmoradar.app"}`);
    const limit = clampLimit(url.searchParams.get("limit"), 50, 100);
    const status = String(url.searchParams.get("status") || "").trim().toLowerCase();
    const q = sanitizeSearch(url.searchParams.get("q"));
    const params = new URLSearchParams({
      select:
        "email,status,renews_at,ends_at,trial_ends_at,provider,provider_customer_id,provider_subscription_id,provider_order_id,product_id,variant_id,event_name,created_at,updated_at",
      order: "updated_at.desc",
      limit: String(limit)
    });

    if (status && status !== "all") params.set("status", `eq.${status}`);
    if (q) params.set("email", `ilike.*${q}*`);

    const rows = await supabaseFetch(`premium_subscriptions?${params.toString()}`);
    return json(res, 200, {
      ok: true,
      count: Array.isArray(rows) ? rows.length : 0,
      subscriptions: Array.isArray(rows) ? rows : []
    });
  } catch (error) {
    console.error("[admin/premium/subscriptions]", error);
    return json(res, 500, {
      ok: false,
      error: "premium_subscriptions_failed",
      message: error.message
    });
  }
};
