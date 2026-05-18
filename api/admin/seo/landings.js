const { assertAdmin, handleCors, hasSupabaseConfig, json, supabaseFetch } = require("../../_utils");
const { runSeoLandingGeneration } = require("../../_seo/generator");
const { clampLimit, normalizeSlug, readJsonBody } = require("../_helpers");

const LANDING_SELECT =
  "id,opportunity_id,slug,title,meta_title,city,province,autonomous_community,template_type,status,index_status,quality_score,word_count,canonical_url,published_at,last_generated_at,created_at,updated_at";

function landingQuery(slug) {
  return `seo_landings?slug=eq.${encodeURIComponent(slug)}&select=${LANDING_SELECT}&limit=1`;
}

async function fetchLanding(slug) {
  const rows = await supabaseFetch(landingQuery(slug));
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function patchLanding(slug, patch) {
  const rows = await supabaseFetch(`seo_landings?slug=eq.${encodeURIComponent(slug)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(patch)
  });
  return Array.isArray(rows) ? rows[0] || null : rows;
}

function opportunityFromLanding(landing) {
  return {
    id: landing.opportunity_id || null,
    keyword: landing.title || `precio metro cuadrado ${landing.city}`,
    city: landing.city,
    province: landing.province,
    autonomous_community: landing.autonomous_community,
    intent: "informational",
    template_type: landing.template_type,
    search_priority: Number(landing.quality_score) || 0,
    status: landing.status,
    existing_landing_id: landing.id,
    existing_landing_slug: landing.slug,
    existing_landing_status: landing.status,
    existing_landing_quality_score: Number(landing.quality_score) || 0
  };
}

async function handleAction(body) {
  const action = String(body.action || "").trim();
  const slug = normalizeSlug(body.slug);
  if (!slug) return { status: 400, payload: { ok: false, error: "slug_required" } };
  if (!["publish", "noindex", "archive", "regenerate"].includes(action)) {
    return { status: 400, payload: { ok: false, error: "invalid_action" } };
  }

  const landing = await fetchLanding(slug);
  if (!landing) return { status: 404, payload: { ok: false, error: "landing_not_found" } };

  if (action === "publish") {
    const score = Number(landing.quality_score) || 0;
    if (score < 75) {
      return {
        status: 409,
        payload: { ok: false, error: "quality_too_low", message: "Quality score must be at least 75." }
      };
    }
    const updated = await patchLanding(slug, {
      status: "published",
      index_status: "index",
      published_at: landing.published_at || new Date().toISOString()
    });
    return { status: 200, payload: { ok: true, action, landing: updated } };
  }

  if (action === "noindex") {
    const updated = await patchLanding(slug, {
      status: "noindex",
      index_status: "noindex"
    });
    return { status: 200, payload: { ok: true, action, landing: updated } };
  }

  if (action === "archive") {
    const updated = await patchLanding(slug, {
      status: "archived",
      index_status: "noindex"
    });
    return { status: 200, payload: { ok: true, action, landing: updated } };
  }

  const result = await runSeoLandingGeneration({
    mode: "generate",
    limit: 1,
    template_type: landing.template_type,
    opportunities: [opportunityFromLanding(landing)],
    autoPublish: false
  });
  return { status: 200, payload: { ok: true, action, result } };
}

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!["GET", "POST"].includes(req.method)) {
    return json(res, 405, { ok: false, error: "method_not_allowed" });
  }
  if (!assertAdmin(req, res)) return;
  if (!hasSupabaseConfig()) {
    return json(res, 500, { ok: false, error: "supabase_not_configured" });
  }

  try {
    if (req.method === "POST") {
      const body = await readJsonBody(req);
      const result = await handleAction(body);
      return json(res, result.status, result.payload);
    }

    const url = new URL(req.url || "/", `https://${req.headers.host || "inmoradar.app"}`);
    const limit = clampLimit(url.searchParams.get("limit"), 50, 100);
    const status = String(url.searchParams.get("status") || "").trim().toLowerCase();
    const params = new URLSearchParams({
      select: LANDING_SELECT,
      order: "updated_at.desc",
      limit: String(limit)
    });
    if (status && status !== "all") params.set("status", `eq.${status}`);

    const rows = await supabaseFetch(`seo_landings?${params.toString()}`);
    return json(res, 200, {
      ok: true,
      count: Array.isArray(rows) ? rows.length : 0,
      landings: Array.isArray(rows) ? rows : []
    });
  } catch (error) {
    console.error("[admin/seo/landings]", error);
    return json(res, 500, {
      ok: false,
      error: "seo_landings_failed",
      message: error.message
    });
  }
};
