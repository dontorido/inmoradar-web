const { assertAdmin, handleCors, hasSupabaseConfig, json, readRawBody, supabaseFetch } = require("./_utils");
const { runSeoLandingGeneration } = require("./_seo/generator");
const {
  KPI_SCHEMA_VERSION,
  KPI_SETTINGS_SCHEMA,
  coerceKpiSettings,
  defaultKpiSettings
} = require("./_kpi/settings");

const LANDING_SELECT =
  "id,opportunity_id,slug,title,meta_title,city,province,autonomous_community,template_type,status,index_status,quality_score,word_count,canonical_url,published_at,last_generated_at,created_at,updated_at";

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return req.body ? JSON.parse(req.body) : {};
  const raw = await readRawBody(req);
  if (!raw) return {};
  return JSON.parse(raw);
}

function clampLimit(value, fallback = 50, max = 100) {
  const parsed = Number.parseInt(String(value || fallback), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, parsed));
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = String(row[key] || "unknown");
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function normalizeSlug(slug) {
  return String(slug || "").trim().replace(/^\/+|\/+$/g, "");
}

function sanitizeSearch(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[%*,]/g, "")
    .slice(0, 80);
}

async function safeFetch(path, fallback = []) {
  try {
    const rows = await supabaseFetch(path);
    return Array.isArray(rows) ? rows : fallback;
  } catch (error) {
    return { error: error.message, rows: fallback };
  }
}

function routeFromRequest(req) {
  const url = new URL(req.url || "/", `https://${req.headers.host || "inmoradar.app"}`);
  const resource = url.searchParams.get("resource");
  if (resource) return { url, resource };

  const pathname = url.pathname.replace(/^\/api\/admin\/?/, "").replace(/\/+$/, "");
  return { url, resource: pathname || "summary" };
}

async function handleSummary() {
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

  return {
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
  };
}

async function handlePremiumSubscriptions(url) {
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
  return {
    ok: true,
    count: Array.isArray(rows) ? rows.length : 0,
    subscriptions: Array.isArray(rows) ? rows : []
  };
}

async function fetchLanding(slug) {
  const rows = await supabaseFetch(
    `seo_landings?slug=eq.${encodeURIComponent(slug)}&select=${LANDING_SELECT}&limit=1`
  );
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

async function handleSeoLandingAction(body) {
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
    const updated = await patchLanding(slug, { status: "noindex", index_status: "noindex" });
    return { status: 200, payload: { ok: true, action, landing: updated } };
  }

  if (action === "archive") {
    const updated = await patchLanding(slug, { status: "archived", index_status: "noindex" });
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

async function handleSeoLandings(req, url) {
  if (req.method === "POST") {
    return handleSeoLandingAction(await readJsonBody(req));
  }

  const limit = clampLimit(url.searchParams.get("limit"), 50, 100);
  const status = String(url.searchParams.get("status") || "").trim().toLowerCase();
  const params = new URLSearchParams({
    select: LANDING_SELECT,
    order: "updated_at.desc",
    limit: String(limit)
  });
  if (status && status !== "all") params.set("status", `eq.${status}`);

  const rows = await supabaseFetch(`seo_landings?${params.toString()}`);
  return {
    status: 200,
    payload: {
      ok: true,
      count: Array.isArray(rows) ? rows.length : 0,
      landings: Array.isArray(rows) ? rows : []
    }
  };
}

async function handleSeoGenerate(req) {
  if (req.method !== "POST") {
    return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
  }
  const body = await readJsonBody(req);
  const result = await runSeoLandingGeneration({
    mode: body.mode || "dry_run",
    limit: body.limit || 5,
    candidateLimit: body.candidateLimit,
    template_type: body.template_type || "random",
    autoPublish: body.autoPublish === true,
    includeExistingDrafts: body.includeExistingDrafts === true,
    publishFirstEligible: body.publishFirstEligible === true,
    dailyPublishLimit: typeof body.dailyPublishLimit === "number" ? body.dailyPublishLimit : undefined,
    maxPublishesPerRun: typeof body.maxPublishesPerRun === "number" ? body.maxPublishesPerRun : undefined
  });
  return { status: 200, payload: result };
}

async function readKpiSettings() {
  try {
    const rows = await supabaseFetch(
      "kpi_settings?id=eq.default&select=id,schema_version,settings_json,updated_at&limit=1"
    );
    const row = Array.isArray(rows) ? rows[0] || null : null;
    return {
      ok: true,
      row,
      settings: coerceKpiSettings(row?.settings_json || {}),
      updated_at: row?.updated_at || null,
      table_missing: false,
      error: null
    };
  } catch (error) {
    return {
      ok: false,
      row: null,
      settings: defaultKpiSettings(),
      updated_at: null,
      table_missing: /kpi_settings/.test(error.message),
      error: error.message
    };
  }
}

async function saveKpiSettings(body) {
  const settings = coerceKpiSettings(body.settings || body.values || {});
  const now = new Date().toISOString();
  const rows = await supabaseFetch("kpi_settings?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify([
      {
        id: "default",
        schema_version: KPI_SCHEMA_VERSION,
        settings_json: settings,
        updated_by: "backoffice",
        updated_at: now
      }
    ])
  });
  const row = Array.isArray(rows) ? rows[0] || null : null;
  return {
    ok: true,
    schema_version: KPI_SCHEMA_VERSION,
    schema: KPI_SETTINGS_SCHEMA,
    defaults: defaultKpiSettings(),
    settings: coerceKpiSettings(row?.settings_json || settings),
    updated_at: row?.updated_at || now
  };
}

async function handleKpiSettings(req) {
  if (req.method === "GET") {
    const result = await readKpiSettings();
    return {
      status: 200,
      payload: {
        ok: true,
        schema_version: KPI_SCHEMA_VERSION,
        schema: KPI_SETTINGS_SCHEMA,
        defaults: defaultKpiSettings(),
        settings: result.settings,
        updated_at: result.updated_at,
        table_missing: result.table_missing,
        error: result.error
      }
    };
  }

  if (req.method === "POST") {
    return { status: 200, payload: await saveKpiSettings(await readJsonBody(req)) };
  }

  return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
}

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!assertAdmin(req, res)) return;
  if (!hasSupabaseConfig()) {
    return json(res, 500, { ok: false, error: "supabase_not_configured" });
  }

  const { url, resource } = routeFromRequest(req);

  try {
    if (resource === "summary") {
      if (req.method !== "GET") return json(res, 405, { ok: false, error: "method_not_allowed" });
      return json(res, 200, await handleSummary());
    }
    if (resource === "premium/subscriptions") {
      if (req.method !== "GET") return json(res, 405, { ok: false, error: "method_not_allowed" });
      return json(res, 200, await handlePremiumSubscriptions(url));
    }
    if (resource === "seo/landings") {
      if (!["GET", "POST"].includes(req.method)) return json(res, 405, { ok: false, error: "method_not_allowed" });
      const result = await handleSeoLandings(req, url);
      return json(res, result.status, result.payload);
    }
    if (resource === "seo/generate-landings") {
      const result = await handleSeoGenerate(req);
      return json(res, result.status, result.payload);
    }
    if (resource === "kpis/settings") {
      const result = await handleKpiSettings(req);
      return json(res, result.status, result.payload);
    }

    return json(res, 404, { ok: false, error: "admin_resource_not_found", resource });
  } catch (error) {
    console.error("[admin]", resource, error);
    return json(res, 500, {
      ok: false,
      error: "admin_request_failed",
      message: error.message
    });
  }
};
