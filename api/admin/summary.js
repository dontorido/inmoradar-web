const { assertAdmin, handleCors, hasSupabaseConfig, json, supabaseFetch } = require("../_utils");
const { countBy } = require("./_helpers");

async function safeFetch(path, fallback = []) {
  try {
    const rows = await supabaseFetch(path);
    return Array.isArray(rows) ? rows : fallback;
  } catch (error) {
    return { error: error.message, rows: fallback };
  }
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

  const [premiumResult, recentPremiumResult, landingResult, recentLandingResult, opportunityResult] =
    await Promise.all([
      safeFetch("premium_subscriptions?select=status,updated_at&limit=1000"),
      safeFetch(
        "premium_subscriptions?select=email,status,renews_at,ends_at,trial_ends_at,provider,provider_subscription_id,event_name,updated_at,created_at&order=updated_at.desc&limit=8"
      ),
      safeFetch("seo_landings?select=status,index_status,quality_score,published_at&limit=1000"),
      safeFetch(
        "seo_landings?select=id,slug,title,city,template_type,status,index_status,quality_score,word_count,updated_at,published_at&order=updated_at.desc&limit=8"
      ),
      safeFetch("seo_landing_opportunities?select=status,template_type&limit=1000")
    ]);

  const premiumRows = Array.isArray(premiumResult) ? premiumResult : premiumResult.rows;
  const landingRows = Array.isArray(landingResult) ? landingResult : landingResult.rows;
  const opportunityRows = Array.isArray(opportunityResult) ? opportunityResult : opportunityResult.rows;

  return json(res, 200, {
    ok: true,
    generated_at: new Date().toISOString(),
    env: {
      supabase_configured: true,
      lemonsqueezy_checkout_configured: Boolean(
        process.env.LEMONSQUEEZY_API_KEY &&
          process.env.LEMONSQUEEZY_STORE_ID &&
          process.env.LEMONSQUEEZY_VARIANT_ID
      ),
      lemonsqueezy_test_mode: String(process.env.LEMONSQUEEZY_TEST_MODE || "true").toLowerCase() !== "false",
      lemonsqueezy_webhook_configured: Boolean(process.env.LEMONSQUEEZY_WEBHOOK_SECRET)
    },
    premium: {
      total: premiumRows.length,
      by_status: countBy(premiumRows, "status"),
      recent: Array.isArray(recentPremiumResult) ? recentPremiumResult : recentPremiumResult.rows,
      error: premiumResult.error || recentPremiumResult.error || null
    },
    seo: {
      total_landings: landingRows.length,
      by_status: countBy(landingRows, "status"),
      by_index_status: countBy(landingRows, "index_status"),
      published: landingRows.filter((row) => row.status === "published" && row.index_status === "index").length,
      ready_to_publish: landingRows.filter((row) => row.status === "ready_to_publish").length,
      opportunities_by_status: countBy(opportunityRows, "status"),
      recent_landings: Array.isArray(recentLandingResult) ? recentLandingResult : recentLandingResult.rows,
      error: landingResult.error || recentLandingResult.error || opportunityResult.error || null
    }
  });
};
