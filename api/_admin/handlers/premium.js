function createPremiumHandlers({ clampLimit, sanitizeSearch, supabaseFetch } = {}) {
  if (typeof clampLimit !== "function") throw new Error("admin_premium_clamp_limit_required");
  if (typeof sanitizeSearch !== "function") throw new Error("admin_premium_sanitize_search_required");
  if (typeof supabaseFetch !== "function") throw new Error("admin_premium_supabase_fetch_required");

  async function handlePremiumSubscriptions(url) {
    const limit = clampLimit(url.searchParams.get("limit"), 50, 100);
    const status = String(url.searchParams.get("status") || "").trim().toLowerCase();
    const q = sanitizeSearch(url.searchParams.get("q"));
    const provider = sanitizeSearch(url.searchParams.get("provider"));
    const eventName = sanitizeSearch(url.searchParams.get("event_name"));
    const params = new URLSearchParams({
      select:
        "email,status,renews_at,ends_at,trial_ends_at,provider,provider_customer_id,provider_subscription_id,provider_order_id,product_id,variant_id,event_name,created_at,updated_at",
      order: "updated_at.desc",
      limit: String(limit)
    });

    if (status && status !== "all") params.set("status", `eq.${status}`);
    if (provider) params.set("provider", `ilike.*${provider}*`);
    if (eventName) params.set("event_name", `ilike.*${eventName}*`);
    if (q) {
      params.set(
        "or",
        `(${[
          `email.ilike.*${q}*`,
          `status.ilike.*${q}*`,
          `provider.ilike.*${q}*`,
          `provider_customer_id.ilike.*${q}*`,
          `provider_subscription_id.ilike.*${q}*`,
          `provider_order_id.ilike.*${q}*`,
          `product_id.ilike.*${q}*`,
          `variant_id.ilike.*${q}*`,
          `event_name.ilike.*${q}*`
        ].join(",")})`
      );
    }

    const rows = await supabaseFetch(`premium_subscriptions?${params.toString()}`);
    return {
      status: 200,
      payload: {
        ok: true,
        count: Array.isArray(rows) ? rows.length : 0,
        subscriptions: Array.isArray(rows) ? rows : []
      }
    };
  }

  return {
    handlePremiumSubscriptions
  };
}

module.exports = {
  createPremiumHandlers
};
