const { assertAdmin, fetchWithTimeout, handleCors, hasSupabaseConfig, json, readRawBody, supabaseFetch } = require("./_utils");
const { runSeoLandingGeneration } = require("./_seo/generator");
const {
  KPI_SCHEMA_VERSION,
  KPI_SETTINGS_SCHEMA,
  coerceKpiSettings,
  defaultKpiSettings
} = require("./_kpi/settings");
const { generateSocialVideoProject, MUSIC_STYLES, seriesConfig, TOPICS, VISUAL_BACKDROPS } = require("../lib/social-video/generator");
const { getVideoBrandingConfig } = require("../lib/social-video/branding");
const {
  SOCIAL_VIDEO_PROJECT_STATUSES,
  normalizeProjectStatus,
  socialVideoProjectRow,
  socialVideoProjectSummary
} = require("../lib/social-video/projects");
const {
  RUNWAY_VIDEO_PRICING,
  buildRunwayTextToVideoRequest,
  createRunwayTextToVideo,
  estimateRunwayCost,
  getRunwayTask,
  runwayRequestSummary,
  runwaySettings
} = require("../lib/social-video/runway");
const { summarizeExtensionUsage } = require("../lib/extension-usage/metrics");
const { buildRevenueEventFromLemonPayload, summarizeMonthlyRevenue } = require("../lib/sales/revenue");
const {
  normalizeReleaseArtifactInput,
  normalizeReleaseTarget,
  releaseConnectors
} = require("../lib/operations/releases");
const {
  chromeWebStoreConfig,
  decodeInlineArtifactPayload,
  fetchChromeItemStatus,
  publishChromeItem,
  uploadChromePackage
} = require("../lib/operations/chromeWebStore");
const {
  DEFAULT_CONFIG: VIRALIZA_DEFAULT_CONFIG,
  generateDailyRoutine,
  generateContextualComments,
  generateOutreachMessage,
  generateVideoBriefFromHook,
  generateVideoBriefFromSavedVideo,
  normalizeRealCreator,
  generateDailyCreatorPlan,
  normalizeViralAction,
  recordAction,
  recordResult,
  analyzeWeeklyLearning,
  recommendNextActions
} = require("../lib/viraliza/engine");

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

function clampPage(value) {
  const parsed = Number.parseInt(String(value || 1), 10);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, parsed);
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = String(row[key] || "unknown");
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function average(rows, key) {
  const values = rows.map((row) => Number(row[key])).filter(Number.isFinite);
  if (!values.length) return 0;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

function normalizeSlug(slug) {
  return String(slug || "").trim().replace(/^\/+|\/+$/g, "");
}

function sanitizeSearch(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[%*,()]/g, "")
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

function safeRows(result) {
  return Array.isArray(result) ? result : result?.rows || [];
}

function safeFetchFailed(result) {
  return Boolean(result && !Array.isArray(result) && result.error);
}

function sortAlerts(alerts) {
  const rank = { critical: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9));
}

function recentSinceIso(hours = 24) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

async function handleAlerts() {
  const alerts = [];
  const generatedAt = new Date().toISOString();

  if (!process.env.CRON_SECRET) {
    alerts.push({
      id: "seo-cron-secret-missing",
      severity: "critical",
      title: "El cron SEO no puede ejecutarse",
      message: "Falta CRON_SECRET. GitHub Actions fallará antes de publicar landings/noticias.",
      action_label: "Ver guía",
      action_target: "#seo-cron-secret",
      dismissible: true,
      category: "seo"
    });
  }

  if (!hasSupabaseConfig()) {
    alerts.push({
      id: "supabase-config-missing",
      severity: "warning",
      title: "BackOffice con datos limitados",
      message: "Supabase no está configurado en este entorno. Algunas métricas y estados operativos no podrán cargarse.",
      action_label: "Ir al evento",
      action_target: "#admin-live-status",
      dismissible: true,
      category: "system"
    });
    return { ok: true, generated_at: generatedAt, alerts: sortAlerts(alerts) };
  }

  const since = recentSinceIso(24);
  const encodedSince = encodeURIComponent(since);
  const [recentSeoResult, recentWaitlistResult, recentRevenueResult, recentPremiumResult] = await Promise.all([
    safeFetch(
      `seo_landings?select=id,published_at&status=eq.published&index_status=eq.index&published_at=gte.${encodedSince}&order=published_at.desc&limit=1`
    ),
    safeFetch(
      `browser_waitlist_leads?select=id,email,browser,created_at&created_at=gte.${encodedSince}&order=created_at.desc&limit=5`
    ),
    safeFetch(
      `premium_revenue_events?select=id,amount_cents,currency,occurred_at&occurred_at=gte.${encodedSince}&order=occurred_at.desc&limit=1`
    ),
    safeFetch(
      `premium_subscriptions?select=id,status,created_at,updated_at&or=(created_at.gte.${encodedSince},updated_at.gte.${encodedSince})&order=updated_at.desc&limit=1`
    )
  ]);

  if (!safeFetchFailed(recentSeoResult) && !safeRows(recentSeoResult).length) {
    alerts.push({
      id: "seo-no-recent-publications",
      severity: "warning",
      title: "SEO sin publicaciones recientes",
      message: "No se han publicado páginas SEO indexables en las últimas 24h. Revisa el cron o publica una landing elegible.",
      action_label: "Ir al evento",
      action_target: "#seo-cron-secret",
      dismissible: true,
      category: "seo"
    });
  }

  const waitlistRows = safeRows(recentWaitlistResult);
  if (!safeFetchFailed(recentWaitlistResult) && waitlistRows.length) {
    alerts.push({
      id: "browser-waitlist-leads-recent",
      severity: "info",
      title: "Nuevos leads de navegador",
      message: `Hay ${waitlistRows.length} leads recientes de navegador pendientes de revisar.`,
      action_label: "Ir al evento",
      action_target: "#operaciones-extension",
      dismissible: true,
      category: "waitlist"
    });
  }

  if (
    (!safeFetchFailed(recentRevenueResult) && safeRows(recentRevenueResult).length) ||
    (!safeFetchFailed(recentPremiumResult) && safeRows(recentPremiumResult).length)
  ) {
    alerts.push({
      id: "premium-activity-recent",
      severity: "info",
      title: "Actividad Premium reciente",
      message: "Hay actividad Premium registrada en las últimas 24h.",
      action_label: "Ir al evento",
      action_target: "#ventas-premium",
      dismissible: true,
      category: "sales"
    });
  }

  return { ok: true, generated_at: generatedAt, alerts: sortAlerts(alerts) };
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

function routeFromRequest(req) {
  const url = new URL(req.url || "/", `https://${req.headers.host || "inmoradar.app"}`);
  const resource = url.searchParams.get("resource");
  if (resource) return { url, resource };

  const pathname = url.pathname.replace(/^\/api\/admin\/?/, "").replace(/\/+$/, "");
  return { url, resource: pathname || "summary" };
}

async function handleSummary() {
  const revenueSince = new Date();
  revenueSince.setUTCMonth(revenueSince.getUTCMonth() - 11);
  revenueSince.setUTCDate(1);
  revenueSince.setUTCHours(0, 0, 0, 0);

  const [
    premiumResult,
    recentPremiumResult,
    revenueResult,
    legacyRevenueResult,
    landingResult,
    recentLandingResult,
    opportunityResult,
    parkingResult
  ] = await Promise.all([
      safeFetch("premium_subscriptions?select=status,updated_at&limit=1000"),
      safeFetch(
        "premium_subscriptions?select=email,status,renews_at,ends_at,trial_ends_at,provider,provider_subscription_id,event_name,updated_at,created_at&order=updated_at.desc&limit=8"
      ),
      safeFetch(
        `premium_revenue_events?select=amount_cents,currency,occurred_at,event_name&occurred_at=gte.${revenueSince.toISOString()}&order=occurred_at.asc&limit=5000`
      ),
      safeFetch("premium_subscriptions?select=email,event_name,raw_event,created_at,updated_at&limit=1000"),
      safeFetch("seo_landings?select=status,index_status,quality_score,published_at&limit=1000"),
      safeFetch(
        "seo_landings?select=id,slug,title,city,template_type,status,index_status,quality_score,word_count,updated_at,published_at&order=updated_at.desc&limit=8"
      ),
      safeFetch("seo_landing_opportunities?select=status,template_type&limit=1000"),
      safeFetch("parking_difficulty_cache?select=score,label,confidence_score,perspective,expires_at&limit=1000")
    ]);

  const premiumRows = Array.isArray(premiumResult) ? premiumResult : premiumResult.rows;
  const revenueRows = Array.isArray(revenueResult) ? revenueResult : revenueResult.rows;
  const legacyRevenueRows = Array.isArray(legacyRevenueResult) ? legacyRevenueResult : legacyRevenueResult.rows;
  const legacyRevenueEvents = legacyRevenueRows
    .map((row) => buildRevenueEventFromLemonPayload(row.raw_event, row.event_name))
    .filter(Boolean);
  const useLegacyRevenue = !revenueRows.length && legacyRevenueEvents.length;
  const revenue = {
    ...summarizeMonthlyRevenue(useLegacyRevenue ? legacyRevenueEvents : revenueRows, { months: 12 }),
    source: useLegacyRevenue ? "premium_subscriptions.raw_event" : "premium_revenue_events",
    table_missing: !Array.isArray(revenueResult) && /premium_revenue_events/.test(revenueResult.error || ""),
    error: revenueResult.error || null
  };
  const landingRows = Array.isArray(landingResult) ? landingResult : landingResult.rows;
  const opportunityRows = Array.isArray(opportunityResult) ? opportunityResult : opportunityResult.rows;
  const parkingRows = Array.isArray(parkingResult) ? parkingResult : parkingResult.rows;
  const validParkingRows = parkingRows.filter((row) => !row.expires_at || new Date(row.expires_at).getTime() > Date.now());

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
      lemonsqueezy_test_mode: lemonTestMode(),
      lemonsqueezy_webhook_configured: Boolean(process.env.LEMONSQUEEZY_WEBHOOK_SECRET)
    },
    premium: {
      total: premiumRows.length,
      by_status: countBy(premiumRows, "status"),
      recent: Array.isArray(recentPremiumResult) ? recentPremiumResult : recentPremiumResult.rows,
      error: premiumResult.error || recentPremiumResult.error || null
    },
    revenue,
    seo: {
      total_landings: landingRows.length,
      by_status: countBy(landingRows, "status"),
      by_index_status: countBy(landingRows, "index_status"),
      published: landingRows.filter((row) => row.status === "published" && row.index_status === "index").length,
      ready_to_publish: landingRows.filter((row) => row.status === "ready_to_publish").length,
      opportunities_by_status: countBy(opportunityRows, "status"),
      recent_landings: Array.isArray(recentLandingResult) ? recentLandingResult : recentLandingResult.rows,
      error: landingResult.error || recentLandingResult.error || opportunityResult.error || null
    },
    parking: {
      total_cache_rows: parkingRows.length,
      valid_cache_rows: validParkingRows.length,
      average_score: average(validParkingRows, "score"),
      average_confidence: average(validParkingRows, "confidence_score"),
      by_label: countBy(validParkingRows, "label"),
      by_perspective: countBy(validParkingRows, "perspective"),
      error: parkingResult.error || null
    }
  };
}

async function handleParkingSummary() {
  const [result, assessmentResult] = await Promise.all([
    safeFetch(
      "parking_difficulty_cache?select=id,geohash,city,radius_m,perspective,score,label,confidence_score,calculated_at,expires_at&order=calculated_at.desc&limit=100"
    ),
    safeFetch(
      "parking_assessments?select=id,source_url,address_text,street,zone_name,district,municipality,profile,overall_score,overall_label,confidence_score,confidence_label,status,last_checked_at&order=last_checked_at.desc&limit=100"
    )
  ]);
  const rows = Array.isArray(result) ? result : result.rows;
  const assessmentRows = Array.isArray(assessmentResult) ? assessmentResult : assessmentResult.rows;
  const validRows = rows.filter((row) => !row.expires_at || new Date(row.expires_at).getTime() > Date.now());

  return {
    ok: true,
    generated_at: new Date().toISOString(),
    total_cache_rows: rows.length,
    valid_cache_rows: validRows.length,
    expired_cache_rows: rows.length - validRows.length,
    average_score: average(validRows, "score"),
    average_confidence: average(validRows, "confidence_score"),
    by_label: countBy(validRows, "label"),
    by_perspective: countBy(validRows, "perspective"),
    assessments_total: assessmentRows.length,
    assessments_recent: assessmentRows,
    recent: assessmentRows.length ? assessmentRows : rows,
    error: result.error || assessmentResult.error || null
  };
}

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
    ok: true,
    count: Array.isArray(rows) ? rows.length : 0,
    subscriptions: Array.isArray(rows) ? rows : []
  };
}

async function handleExtensionUsageSummary() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({
    select:
      "event_name,anonymous_id_hash,session_id_hash,browser_name,browser_version,platform,country,extension_version,duration_seconds,active_seconds,created_at",
    created_at: `gte.${since}`,
    order: "created_at.desc",
    limit: "5000"
  });

  try {
    const rows = await supabaseFetch(`extension_usage_events?${params.toString()}`);
    return {
      ok: true,
      generated_at: new Date().toISOString(),
      window_days: 30,
      ...summarizeExtensionUsage(Array.isArray(rows) ? rows : [])
    };
  } catch (error) {
    return {
      ok: false,
      generated_at: new Date().toISOString(),
      window_days: 30,
      total_events: 0,
      unique_users_30d: 0,
      active_users_7d: 0,
      active_users_24h: 0,
      sessions_30d: 0,
      active_seconds_30d: 0,
      average_session_seconds: 0,
      by_browser: [],
      by_country: [],
      by_extension_version: [],
      by_event_name: [],
      table_missing: /extension_usage_events/.test(error.message),
      error: error.message
    };
  }
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

async function handleReleaseArtifacts(req, url) {
  if (req.method === "GET") {
    const rawTarget = url.searchParams.get("target");
    const target = rawTarget ? normalizeReleaseTarget(rawTarget) : "";
    const limit = clampLimit(url.searchParams.get("limit"), 50, 100);
    const params = new URLSearchParams({
      select:
        "id,target,version,title,channel,status,artifact_kind,connector_target,file_name,mime_type,file_size_bytes,sha256,storage_path,notes,created_at,updated_at",
      order: "created_at.desc",
      limit: String(limit)
    });
    if (target) params.set("target", `eq.${target}`);
    const result = await safeFetch(`release_artifacts?${params.toString()}`);
    const rows = Array.isArray(result) ? result : result.rows;
    return {
      status: 200,
      payload: {
        ok: true,
        target: target || "all",
        artifacts: rows,
        connectors: releaseConnectors(),
        table_missing: !Array.isArray(result) && /release_artifacts/.test(result.error || ""),
        error: Array.isArray(result) ? null : result.error || null
      }
    };
  }

  if (req.method !== "POST") {
    return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
  }

  const input = await readJsonBody(req);
  const artifact = normalizeReleaseArtifactInput(input);
  const rows = await supabaseFetch("release_artifacts", {
    method: "POST",
    headers: {
      prefer: "return=representation"
    },
    body: JSON.stringify(artifact)
  });

  return {
    status: 200,
    payload: {
      ok: true,
      artifact: Array.isArray(rows) ? rows[0] : artifact,
      connectors: releaseConnectors()
    }
  };
}

function chromeFetch(url, options = {}) {
  return fetchWithTimeout(url, {
    ...options,
    timeoutMs: Number(process.env.CHROME_WEBSTORE_TIMEOUT_MS || 60000)
  });
}

function appendReleaseNote(existingNotes, note) {
  const stamp = new Date().toISOString();
  const notes = [existingNotes, `[${stamp}] ${note}`].filter(Boolean).join("\n");
  return notes.slice(-4000);
}

function summarizeChromeStatus(payload = {}) {
  const published = payload.publishedItemRevisionStatus?.state;
  const submitted = payload.submittedItemRevisionStatus?.state;
  const upload = payload.lastAsyncUploadState;
  return [
    published ? `publicado=${published}` : "",
    submitted ? `revision=${submitted}` : "",
    upload ? `upload=${upload}` : "",
    payload.takenDown ? "retirado=true" : "",
    payload.warned ? "aviso=true" : ""
  ]
    .filter(Boolean)
    .join(", ") || "estado recibido";
}

async function releaseArtifactById(id) {
  const cleanId = String(id || "").trim();
  if (!cleanId) return null;
  const params = new URLSearchParams({
    id: `eq.${cleanId}`,
    select: "*",
    limit: "1"
  });
  const rows = await supabaseFetch(`release_artifacts?${params.toString()}`);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function patchReleaseArtifact(id, patch) {
  const cleanId = String(id || "").trim();
  if (!cleanId) throw new Error("release_artifact_id_required");
  const rows = await supabaseFetch(`release_artifacts?id=eq.${encodeURIComponent(cleanId)}`, {
    method: "PATCH",
    headers: {
      prefer: "return=representation"
    },
    body: JSON.stringify({
      ...patch,
      updated_at: new Date().toISOString()
    })
  });
  return Array.isArray(rows) ? rows[0] : null;
}

function assertChromeReleaseArtifact(artifact) {
  if (!artifact) throw new Error("release_artifact_not_found");
  const connector = String(artifact.connector_target || "").toLowerCase();
  if (artifact.target !== "extension" || connector !== "chrome") {
    throw new Error("chrome_release_artifact_required");
  }
}

async function handleChromeOperation(req) {
  if (req.method !== "POST") {
    return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
  }

  const input = await readJsonBody(req);
  const action = String(input.action || "").trim().toLowerCase();
  const config = chromeWebStoreConfig();
  if (!config.configured) {
    return {
      status: 400,
      payload: {
        ok: false,
        error: "chrome_webstore_not_configured",
        message: `Faltan variables de entorno para Chrome Web Store: ${config.missing.join(", ")}`,
        missing: config.missing
      }
    };
  }

  const chromeOptions = { config, fetchImpl: chromeFetch };
  const artifact = input.artifact_id ? await releaseArtifactById(input.artifact_id) : null;

  if (action === "status") {
    const chromeStatus = await fetchChromeItemStatus(chromeOptions);
    let updated = null;
    if (artifact) {
      assertChromeReleaseArtifact(artifact);
      updated = await patchReleaseArtifact(artifact.id, {
        notes: appendReleaseNote(artifact.notes, `Chrome status: ${summarizeChromeStatus(chromeStatus)}`)
      });
    }
    return {
      status: 200,
      payload: {
        ok: true,
        action,
        message: `Estado de Chrome leido: ${summarizeChromeStatus(chromeStatus)}.`,
        artifact: updated,
        chrome_status: chromeStatus
      }
    };
  }

  if (!artifact) {
    return { status: 400, payload: { ok: false, error: "artifact_id_required", message: "Selecciona un artefacto de Chrome." } };
  }
  assertChromeReleaseArtifact(artifact);

  if (action === "upload") {
    const packageBuffer = decodeInlineArtifactPayload(artifact);
    const chromeUpload = await uploadChromePackage(packageBuffer, {
      ...chromeOptions,
      mimeType: artifact.mime_type || "application/zip"
    });
    const uploadState = chromeUpload.uploadState || "UPLOAD_SUBMITTED";
    const updated = await patchReleaseArtifact(artifact.id, {
      status: uploadState === "UPLOAD_FAILED" ? "failed" : "submitted",
      notes: appendReleaseNote(artifact.notes, `Chrome upload: ${uploadState}${chromeUpload.crxVersion ? ` version=${chromeUpload.crxVersion}` : ""}`)
    });
    return {
      status: 200,
      payload: {
        ok: true,
        action,
        message: `ZIP enviado a Chrome Web Store (${uploadState}). Comprueba el estado antes de enviarlo a revisión.`,
        artifact: updated,
        chrome_upload: chromeUpload
      }
    };
  }

  if (action === "publish") {
    const chromePublish = await publishChromeItem({
      ...chromeOptions,
      publishType: input.publish_type || input.publishType || "DEFAULT_PUBLISH",
      deployPercentage: input.deploy_percentage ?? input.deployPercentage,
      skipReview: input.skip_review === true || input.skipReview === true
    });
    const updated = await patchReleaseArtifact(artifact.id, {
      status: "submitted",
      notes: appendReleaseNote(artifact.notes, `Chrome publish: ${chromePublish.state || "submitted"}`)
    });
    return {
      status: 200,
      payload: {
        ok: true,
        action,
        message: "Extensión enviada a revisión/publicación en Chrome Web Store.",
        artifact: updated,
        chrome_publish: chromePublish
      }
    };
  }

  return {
    status: 400,
    payload: { ok: false, error: "unsupported_chrome_action", message: `Acción de Chrome no soportada: ${action || "-"}` }
  };
}

async function handleSeoLandings(req, url) {
  if (req.method === "POST") {
    return handleSeoLandingAction(await readJsonBody(req));
  }

  const pageSize = clampLimit(url.searchParams.get("limit"), 10, 50);
  const page = clampPage(url.searchParams.get("page"));
  const offset = (page - 1) * pageSize;
  const status = String(url.searchParams.get("status") || "").trim().toLowerCase();
  const params = new URLSearchParams({
    select: LANDING_SELECT,
    order: "updated_at.desc",
    limit: String(pageSize + 1),
    offset: String(offset)
  });
  if (status && status !== "all") params.set("status", `eq.${status}`);

  const summaryParams = new URLSearchParams({
    select: "status,index_status,quality_score,published_at,updated_at",
    limit: "5000"
  });
  const opportunitiesParams = new URLSearchParams({
    select: "status,template_type",
    limit: "5000"
  });
  const [rows, summaryRows, opportunityRows] = await Promise.all([
    supabaseFetch(`seo_landings?${params.toString()}`),
    safeFetch(`seo_landings?${summaryParams.toString()}`),
    safeFetch(`seo_landing_opportunities?${opportunitiesParams.toString()}`)
  ]);
  const allRows = Array.isArray(rows) ? rows : [];
  const hasNextPage = allRows.length > pageSize;
  const landings = allRows.slice(0, pageSize);
  const summary = buildSeoLandingsSummary(summaryRows, opportunityRows, status);
  return {
    status: 200,
    payload: {
      ok: true,
      count: landings.length,
      page,
      page_size: pageSize,
      has_next_page: hasNextPage,
      has_previous_page: page > 1,
      from: landings.length ? offset + 1 : 0,
      to: offset + landings.length,
      summary,
      landings
    }
  };
}

function buildSeoLandingsSummary(rows = [], opportunities = [], activeStatus = "all") {
  const landings = Array.isArray(rows) ? rows : [];
  const statusCounts = landings.reduce((acc, row) => {
    const key = String(row.status || "unknown").toLowerCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const indexCounts = landings.reduce((acc, row) => {
    const key = String(row.index_status || "unknown").toLowerCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const scores = landings
    .map((row) => Number(row.quality_score || 0))
    .filter((score) => Number.isFinite(score) && score > 0);
  const filteredTotal =
    activeStatus && activeStatus !== "all"
      ? landings.filter((row) => String(row.status || "").toLowerCase() === activeStatus).length
      : landings.length;
  const pendingLandings =
    (statusCounts.draft || 0) + (statusCounts.needs_review || 0) + (statusCounts.ready_to_publish || 0);
  const pendingOpportunities = (Array.isArray(opportunities) ? opportunities : []).filter((row) =>
    ["pending", "generating", "draft", "needs_review"].includes(String(row.status || "").toLowerCase())
  ).length;

  return {
    total_landings: landings.length,
    filtered_total: filteredTotal,
    published: statusCounts.published || 0,
    ready_to_publish: statusCounts.ready_to_publish || 0,
    needs_review: statusCounts.needs_review || 0,
    draft: statusCounts.draft || 0,
    noindex: landings.filter(
      (row) =>
        String(row.index_status || "").toLowerCase() === "noindex" ||
        String(row.status || "").toLowerCase() === "noindex"
    ).length,
    indexable: indexCounts.index || 0,
    pending_landings: pendingLandings,
    pending_opportunities: pendingOpportunities,
    average_quality_score: scores.length
      ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
      : 0
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

async function upsertSocialVideoProject(project, overrides = {}) {
  const row = socialVideoProjectRow(project, overrides);
  if (!row.id) throw new Error("social_video_project_id_required");
  const rows = await supabaseFetch("social_video_projects?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(row)
  });
  return Array.isArray(rows) ? rows[0] || null : rows;
}

async function patchSocialVideoProject(id, patch = {}) {
  const status = patch.status ? normalizeProjectStatus(patch.status) : undefined;
  const body = {
    ...patch,
    ...(status ? { status } : {}),
    updated_at: new Date().toISOString()
  };
  const rows = await supabaseFetch(`social_video_projects?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body)
  });
  return Array.isArray(rows) ? rows[0] || null : rows;
}

async function safePatchSocialVideoProject(id, patch = {}) {
  if (!id || !hasSupabaseConfig()) return null;
  try {
    return await patchSocialVideoProject(id, patch);
  } catch (error) {
    return null;
  }
}

async function handleSocialVideoProjects(req, url) {
  if (req.method === "GET") {
    const limit = clampLimit(url.searchParams.get("limit"), 12, 50);
    const status = normalizeProjectStatus(url.searchParams.get("status"), "");
    const params = new URLSearchParams({
      select:
        "id,title,city,topic,topic_label,platform,series_id,objective,status,duration_seconds,visual_style,music_style,cta,has_uploaded_clip,has_ai_clip,final_exported_at,last_job_id,failure,project_json,created_at,updated_at",
      order: "updated_at.desc",
      limit: String(limit)
    });
    if (status) params.set("status", `eq.${status}`);
    try {
      const rows = await supabaseFetch(`social_video_projects?${params.toString()}`);
      return {
        status: 200,
        payload: {
          ok: true,
          projects: (Array.isArray(rows) ? rows : []).map(socialVideoProjectSummary)
        }
      };
    } catch (error) {
      return {
        status: 200,
        payload: {
          ok: true,
          projects: [],
          storage_error: error.message
        }
      };
    }
  }

  if (req.method !== "POST") {
    return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
  }

  const body = await readJsonBody(req);
  const action = String(body.action || "").trim();
  if (action !== "update_status") {
    return { status: 400, payload: { ok: false, error: "unsupported_social_video_project_action" } };
  }
  const id = String(body.id || "").trim();
  if (!id) return { status: 400, payload: { ok: false, error: "project_id_required" } };
  const status = normalizeProjectStatus(body.status);
  if (!SOCIAL_VIDEO_PROJECT_STATUSES.includes(status)) {
    return { status: 400, payload: { ok: false, error: "invalid_project_status" } };
  }

  const patch = {
    status,
    has_uploaded_clip: body.has_uploaded_clip,
    has_ai_clip: body.has_ai_clip,
    final_exported_at: status === "final_exported" ? body.final_exported_at || new Date().toISOString() : body.final_exported_at,
    last_job_id: body.last_job_id || undefined,
    failure: body.failure || null
  };
  Object.keys(patch).forEach((key) => patch[key] === undefined && delete patch[key]);
  const row = await patchSocialVideoProject(id, patch);
  return {
    status: 200,
    payload: {
      ok: true,
      project: socialVideoProjectSummary(row || { id, status })
    }
  };
}

async function handleSocialVideoGenerate(req) {
  if (req.method === "GET") {
    return {
      status: 200,
      payload: {
        ok: true,
        branding: getVideoBrandingConfig(),
        series: Object.entries(seriesConfig).map(([value, config]) => ({
          value,
          label: config.name,
          objective: config.objective,
          duration_range: config.durationRange,
          best_for_platform: config.bestForPlatform,
          risk_level: config.riskLevel
        })),
        topics: Object.entries(TOPICS).map(([value, config]) => ({ value, label: config.label })),
        visual_backdrops: Object.entries(VISUAL_BACKDROPS).map(([value, config]) => ({ value, label: config.label })),
        music_styles: Object.entries(MUSIC_STYLES).map(([value, config]) => ({ value, label: config.label }))
      }
    };
  }

  if (req.method !== "POST") {
    return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
  }

  const body = await readJsonBody(req);
  const project = generateSocialVideoProject(body);
  try {
    const row = await upsertSocialVideoProject(project, {
      has_uploaded_clip: Boolean(body.has_uploaded_clip)
    });
    project.storage = {
      persisted: true,
      project: row ? socialVideoProjectSummary(row) : null
    };
  } catch (error) {
    project.storage = {
      persisted: false,
      error: error.message
    };
  }
  return {
    status: 200,
    payload: project
  };
}

function runwayPublicConfig() {
  const settings = runwaySettings();
  return {
    ok: true,
    provider: "runway",
    enabled: settings.enabled,
    api_secret_configured: settings.apiSecretConfigured,
    dry_run_only: settings.dryRunOnly,
    default_model: settings.model,
    default_duration_seconds: settings.durationSeconds,
    default_ratio: settings.ratio,
    max_cost_usd: settings.maxCostUsd,
    daily_budget_usd: settings.dailyBudgetUsd,
    credit_usd: 0.01,
    pricing: RUNWAY_VIDEO_PRICING
  };
}

async function readSocialVideoJob(id) {
  const params = new URLSearchParams({
    id: `eq.${id}`,
    select: "*",
    limit: "1"
  });
  const rows = await supabaseFetch(`social_video_jobs?${params.toString()}`);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function insertSocialVideoJob(job) {
  const rows = await supabaseFetch("social_video_jobs", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(job)
  });
  return Array.isArray(rows) ? rows[0] || null : rows;
}

async function patchSocialVideoJob(id, patch) {
  const rows = await supabaseFetch(`social_video_jobs?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      ...patch,
      updated_at: new Date().toISOString()
    })
  });
  return Array.isArray(rows) ? rows[0] || null : rows;
}

async function runwayCreditsSpentToday() {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const params = new URLSearchParams({
    select: "estimated_credits,status",
    provider: "eq.runway",
    created_at: `gte.${since.toISOString()}`
  });
  const rows = await supabaseFetch(`social_video_jobs?${params.toString()}`);
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => String(row.status || "").toLowerCase() !== "failed")
    .reduce((sum, row) => sum + Number(row.estimated_credits || 0), 0);
}

function socialVideoJobPayload(job, extra = {}) {
  return {
    ok: true,
    job: {
      id: job.id,
      project_id: job.project_id,
      provider: job.provider,
      provider_task_id: job.provider_task_id,
      status: job.status,
      model: job.model,
      duration_seconds: job.duration_seconds,
      ratio: job.ratio,
      estimated_credits: Number(job.estimated_credits || 0),
      estimated_cost_usd: Number(job.estimated_cost_usd || 0),
      result_url: job.result_url || null,
      failure: job.failure || null,
      created_at: job.created_at,
      updated_at: job.updated_at
    },
    ...extra
  };
}

function runwayOutputUrl(output) {
  const first = Array.isArray(output) ? output[0] : output;
  if (typeof first === "string") return first;
  if (first && typeof first === "object") return first.url || first.uri || first.download_url || null;
  return null;
}

async function handleSocialVideoRender(req, url) {
  const settings = runwaySettings();

  if (req.method === "GET") {
    const jobId = String(url.searchParams.get("job_id") || "").trim();
    if (!jobId) return { status: 400, payload: { ok: false, error: "job_id_required" } };
    const job = await readSocialVideoJob(jobId);
    if (!job) return { status: 404, payload: { ok: false, error: "social_video_job_not_found" } };
    if (!job.provider_task_id || ["succeeded", "failed"].includes(String(job.status || "").toLowerCase())) {
      return { status: 200, payload: socialVideoJobPayload(job) };
    }

    const task = await getRunwayTask({
      apiSecret: settings.apiSecret,
      taskId: job.provider_task_id,
      fetchImpl: fetchWithTimeout
    });
    const status = String(task.status || "").toLowerCase();
    const outputUrl = runwayOutputUrl(task.output);
    const failure = task.failure || task.error || null;
    const updated = await patchSocialVideoJob(job.id, {
      status,
      result_url: outputUrl || job.result_url || null,
      failure: failure ? String(failure) : null,
      raw_response: task
    });
    if (job.project_id && outputUrl) {
      await safePatchSocialVideoProject(job.project_id, {
        status: "ai_clip_ready",
        has_ai_clip: true,
        last_job_id: job.id,
        failure: null
      });
    } else if (job.project_id && failure) {
      await safePatchSocialVideoProject(job.project_id, {
        status: "failed",
        last_job_id: job.id,
        failure: String(failure)
      });
    }
    return { status: 200, payload: socialVideoJobPayload(updated || job, { runway_status: task.status || null }) };
  }

  if (req.method !== "POST") {
    return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
  }

  const body = await readJsonBody(req);
  const project = body.project || {};
  const model = body.model || settings.model;
  const durationSeconds = body.duration_seconds || settings.durationSeconds;
  const estimate = estimateRunwayCost({ model, durationSeconds });
  const request = buildRunwayTextToVideoRequest({
    project,
    model: estimate.model,
    durationSeconds: estimate.duration_seconds,
    ratio: body.ratio || settings.ratio,
    sceneIndex: body.scene_index || 0
  });
  const estimatePayload = {
    ok: true,
    dry_run: Boolean(body.dry_run),
    provider: "runway",
    request,
    estimate,
    max_cost_usd: settings.maxCostUsd,
    daily_budget_usd: settings.dailyBudgetUsd
  };

  if (body.dry_run) {
    return { status: 200, payload: estimatePayload };
  }
  if (!settings.enabled || settings.dryRunOnly) {
    return { status: 403, payload: { ...estimatePayload, ok: false, error: "runway_render_disabled" } };
  }
  if (!settings.apiSecretConfigured) {
    return { status: 500, payload: { ...estimatePayload, ok: false, error: "runway_api_secret_missing" } };
  }
  if (estimate.estimated_cost_usd > settings.maxCostUsd) {
    return { status: 400, payload: { ...estimatePayload, ok: false, error: "runway_estimate_above_max_cost" } };
  }
  if (Number(body.confirm_cost_usd || 0) < estimate.estimated_cost_usd) {
    return { status: 400, payload: { ...estimatePayload, ok: false, error: "runway_cost_confirmation_required" } };
  }

  let usedCredits = 0;
  try {
    usedCredits = await runwayCreditsSpentToday();
  } catch (error) {
    return {
      status: 500,
      payload: {
        ...estimatePayload,
        ok: false,
        error: "social_video_jobs_storage_missing",
        message: "Falta la tabla social_video_jobs en Supabase. Ejecuta database/social-video-jobs.sql antes de lanzar Runway.",
        details: error.message
      }
    };
  }
  const budgetCredits = Math.floor(settings.dailyBudgetUsd / 0.01);
  if (usedCredits + estimate.estimated_credits > budgetCredits) {
    return {
      status: 400,
      payload: {
        ...estimatePayload,
        ok: false,
        error: "runway_daily_budget_exceeded",
        used_credits_today: usedCredits,
        budget_credits: budgetCredits
      }
    };
  }

  let job = null;
  try {
    job = await insertSocialVideoJob({
      project_id: project.id || null,
      provider: "runway",
      status: "queued",
      model: request.model,
      duration_seconds: request.duration,
      ratio: request.ratio,
      prompt_text: request.promptText,
      estimated_credits: estimate.estimated_credits,
      estimated_cost_usd: estimate.estimated_cost_usd,
      raw_request: request
    });
  } catch (error) {
    return {
      status: 500,
      payload: {
        ...estimatePayload,
        ok: false,
        error: "social_video_jobs_storage_missing",
        message: "No puedo guardar el job de Runway. Ejecuta database/social-video-jobs.sql en Supabase y vuelve a intentarlo.",
        details: error.message
      }
    };
  }
  if (project.id && job?.id) {
    await safePatchSocialVideoProject(project.id, {
      status: "ai_clip_queued",
      last_job_id: job.id,
      failure: null
    });
  }

  try {
    const task = await createRunwayTextToVideo({
      apiSecret: settings.apiSecret,
      fetchImpl: fetchWithTimeout,
      request
    });
    const updated = await patchSocialVideoJob(job.id, {
      provider_task_id: task.id || task.task_id || null,
      status: String(task.status || "submitted").toLowerCase(),
      raw_response: task
    });
    return { status: 200, payload: socialVideoJobPayload(updated || job, { estimate }) };
  } catch (error) {
    await patchSocialVideoJob(job.id, {
      status: "failed",
      failure: error.message
    }).catch(() => {});
    if (project.id) {
      await safePatchSocialVideoProject(project.id, {
        status: "failed",
        last_job_id: job.id,
        failure: error.message
      });
    }
    console.error("Runway create failed", {
      status: error.status || null,
      message: error.message,
      payload: error.payload || null,
      model: request.model,
      ratio: request.ratio,
      duration: request.duration
    });
    const httpStatus = error.status && error.status >= 400 && error.status < 500 ? 400 : 502;
    return {
      status: httpStatus,
      payload: {
        ...estimatePayload,
        ok: false,
        error: "runway_create_failed",
        message: error.message,
        runway_status: error.status || null,
        runway_error: error.payload || null,
        runway_request_summary: runwayRequestSummary(request)
      }
    };
  }
}

async function handleSocialVideoRenderContent(req, res, url) {
  if (req.method !== "GET") return json(res, 405, { ok: false, error: "method_not_allowed" });
  const jobId = String(url.searchParams.get("job_id") || "").trim();
  if (!jobId) return json(res, 400, { ok: false, error: "job_id_required" });
  const job = await readSocialVideoJob(jobId);
  if (!job || !job.result_url) return json(res, 404, { ok: false, error: "runway_result_not_ready" });

  const response = await fetchWithTimeout(job.result_url, { timeoutMs: 30000 });
  if (!response.ok) return json(res, 502, { ok: false, error: "runway_result_fetch_failed", status: response.status });
  const contentType = response.headers.get("content-type") || "video/mp4";
  const buffer = Buffer.from(await response.arrayBuffer());
  res.statusCode = 200;
  res.setHeader("content-type", contentType);
  res.setHeader("cache-control", "no-store, max-age=0");
  res.setHeader("content-length", String(buffer.length));
  res.end(buffer);
}

function viralRoutineRow(routine) {
  return {
    id: routine.id,
    date: routine.date,
    theme: routine.theme,
    status: routine.status || "pending",
    completion_rate: Number(routine.completionRate || 0),
    daily_goal: routine.dailyGoal || "",
    notes: routine.notes || "",
    payload: routine,
    updated_at: new Date().toISOString()
  };
}

function viralKeywordRows(routine) {
  return (routine.keywords || []).map((keyword) => ({
    id: keyword.id,
    routine_id: routine.id,
    keyword: keyword.keyword,
    category: keyword.category,
    intent: keyword.intent,
    platform_priority: keyword.platformPriority || keyword.platforms || [],
    search_url_tiktok: keyword.searchUrls?.tiktok || null,
    search_url_instagram: keyword.searchUrls?.instagram || null,
    search_url_youtube: keyword.searchUrls?.youtube || null,
    search_url_google: keyword.searchUrls?.google || null,
    search_url_linkedin: keyword.searchUrls?.linkedin || null,
    search_url_x: keyword.searchUrls?.x || null,
    status: keyword.status || "pending",
    performance_score: Number(keyword.performanceScore || 0),
    notes: keyword.notes || "",
    payload: keyword,
    updated_at: new Date().toISOString()
  }));
}

function viralCreatorRows(routine) {
  return (routine.creators || []).map((creator) => ({
    id: creator.id,
    name: creator.name || null,
    handle: creator.handle || null,
    platform: creator.platform || null,
    url: creator.url || null,
    category: creator.category || null,
    city: creator.city || null,
    country: creator.country || null,
    followers: Number(creator.followers || 0),
    avg_views: Number(creator.avgViews || creator.avg_views || 0),
    avg_comments: Number(creator.avgComments || creator.avg_comments || 0),
    posting_frequency: creator.postingFrequency || creator.posting_frequency || null,
    topics: Array.isArray(creator.topics) ? creator.topics : [],
    creator_fit_score: Number(creator.creatorFitScore || creator.creator_fit_score || 0),
    outreach_score: Number(creator.outreachScore || creator.outreach_score || 0),
    why_relevant: creator.whyRelevant || creator.why_relevant || "",
    best_collab_idea: creator.bestCollabIdea || creator.best_collab_idea || "",
    recommended_action: creator.recommendedAction || creator.recommended_action || "",
    status: creator.status || "suggested",
    notes: creator.notes || "",
    payload: creator,
    updated_at: new Date().toISOString()
  }));
}


function viralRealCreatorRow(creator) {
  const normalized = normalizeRealCreator(creator);
  return {
    id: normalized.id,
    name: normalized.displayName || normalized.name || null,
    handle: normalized.handle || null,
    platform: normalized.platform || null,
    url: normalized.profileUrl || normalized.url || null,
    category: normalized.category || null,
    city: normalized.city || null,
    country: normalized.country || null,
    followers: Number(normalized.followers || 0),
    avg_views: Number(normalized.avgViews || 0),
    avg_comments: Number(normalized.avgComments || 0),
    posting_frequency: normalized.postingFrequency || null,
    topics: Array.isArray(normalized.topics) ? normalized.topics : [],
    creator_fit_score: Number(normalized.creatorFitScore || 0),
    outreach_score: Number(normalized.outreachScore || 0),
    why_relevant: normalized.whyRelevant || "",
    best_collab_idea: normalized.bestCollabIdea || "",
    recommended_action: normalized.recommendedAction || "review_profile",
    status: normalized.status || "reviewed",
    notes: normalized.notes || "",
    payload: normalized,
    updated_at: new Date().toISOString()
  };
}

function viralActionRow(action) {
  const normalized = normalizeViralAction(action);
  return {
    id: normalized.id,
    creator_id: normalized.creatorId,
    action_date: normalized.actionDate,
    platform: normalized.platform,
    action_type: normalized.actionType,
    target_url: normalized.targetUrl || null,
    suggested_comment: normalized.suggestedComment || null,
    used_comment: normalized.usedComment || null,
    suggested_dm: normalized.suggestedDm || null,
    used_dm: normalized.usedDm || null,
    status: normalized.status || "completed",
    likes_count: Number(normalized.likesCount || 0),
    replies_count: Number(normalized.repliesCount || 0),
    profile_visits: Number(normalized.profileVisits || 0),
    installs_attributed: Number(normalized.installsAttributed || 0),
    notes: normalized.notes || "",
    payload: normalized,
    updated_at: new Date().toISOString()
  };
}

function mapViralCreatorRow(row = {}) {
  return normalizeRealCreator({
    ...(row.payload || {}),
    id: row.id,
    platform: row.platform,
    handle: row.handle,
    displayName: row.name,
    profileUrl: row.url,
    category: row.category,
    city: row.city,
    country: row.country,
    topics: row.topics || row.payload?.topics || [],
    followers: row.followers,
    avgViews: row.avg_views,
    avgComments: row.avg_comments,
    postingFrequency: row.posting_frequency,
    creatorFitScore: row.creator_fit_score,
    outreachScore: row.outreach_score,
    whyRelevant: row.why_relevant,
    bestCollabIdea: row.best_collab_idea,
    recommendedAction: row.recommended_action,
    status: row.status,
    notes: row.notes
  });
}

function mapViralActionRow(row = {}) {
  return normalizeViralAction({
    ...(row.payload || {}),
    id: row.id,
    creatorId: row.creator_id,
    actionDate: row.action_date,
    platform: row.platform,
    actionType: row.action_type,
    targetUrl: row.target_url,
    suggestedComment: row.suggested_comment,
    usedComment: row.used_comment,
    suggestedDm: row.suggested_dm,
    usedDm: row.used_dm,
    status: row.status,
    likesCount: row.likes_count,
    repliesCount: row.replies_count,
    profileVisits: row.profile_visits,
    installsAttributed: row.installs_attributed,
    notes: row.notes
  });
}
function viralTaskRows(routine) {
  return (routine.tasks || []).map((task) => ({
    id: task.id,
    routine_id: routine.id,
    type: task.type,
    title: task.title,
    description: task.description || "",
    priority: task.priority || "medium",
    status: task.status || "pending",
    notes: task.notes || "",
    completed_at: task.completedAt || null,
    payload: task,
    updated_at: new Date().toISOString()
  }));
}

function viralCommentRows(routine) {
  return (routine.comments || []).map((comment) => ({
    id: comment.id,
    routine_id: routine.id,
    text: comment.text,
    type: comment.type,
    brand_mention: Boolean(comment.brandMention),
    best_for: comment.bestFor,
    status: comment.status || "pending",
    copied_at: comment.copiedAt || null,
    used_on_url: comment.usedOnUrl || null,
    result_likes: comment.result?.likes ?? comment.resultLikes ?? null,
    result_replies: comment.result?.replies ?? comment.resultReplies ?? null,
    payload: comment,
    updated_at: new Date().toISOString()
  }));
}

function viralHookRows(routine) {
  return (routine.hooks || []).map((hook) => ({
    id: hook.id,
    routine_id: routine.id,
    hook: hook.hook,
    category: hook.category,
    series: hook.series,
    suggested_duration: Number(hook.suggestedDuration || 0),
    suggested_cta: hook.suggestedCta || "",
    overlay_example: hook.overlayExample || "",
    script_preview: hook.scriptPreview || "",
    status: hook.status || "pending",
    performance_score: Number(hook.performanceScore || 0),
    payload: hook,
    updated_at: new Date().toISOString()
  }));
}

function viralFollowRows(routine) {
  return (routine.followQueue || []).map((creator) => ({
    id: creator.queueId || `follow_${creator.id}`,
    routine_id: routine.id,
    creator_id: creator.id,
    reason: creator.reason || creator.whyRelevant || "",
    suggested_comment: creator.suggestedComment || "",
    status: creator.status || "pending",
    followed_at: creator.followedAt || null,
    payload: creator,
    updated_at: new Date().toISOString()
  }));
}

function viralOutreachRows(routine) {
  if (!routine.outreachMessage) return [];
  return [
    {
      id: routine.outreachMessage.id,
      routine_id: routine.id,
      creator_id: routine.creatorToContact?.id || null,
      message_type: routine.outreachMessage.messageType || "dm",
      message_text: routine.outreachMessage.dm || routine.outreachMessage.medium || routine.outreachMessage.short || "",
      collaboration_idea: routine.outreachMessage.collaborationIdea || "",
      status: routine.outreachMessage.status || "pending",
      payload: routine.outreachMessage,
      updated_at: new Date().toISOString()
    }
  ];
}

function viralVideoBriefRows(routine) {
  if (!routine.videoBrief) return [];
  return [
    {
      id: routine.videoBrief.video_id || `${routine.id}_brief`,
      source_type: "routine",
      source_id: routine.id,
      title: routine.videoBrief.title || "",
      series: routine.videoBrief.series || "",
      platform: routine.videoBrief.platform || "",
      duration: Number(routine.videoBrief.duration || 0),
      hook: routine.videoBrief.hook || "",
      script: routine.videoBrief.script || "",
      overlays: routine.videoBrief.overlays || [],
      caption: routine.videoBrief.caption || "",
      hashtags: routine.videoBrief.hashtags || [],
      cta: routine.videoBrief.cta || "",
      disclaimer: routine.videoBrief.disclaimer || "",
      status: "draft",
      payload: routine.videoBrief,
      updated_at: new Date().toISOString()
    }
  ];
}

async function upsertRows(table, rows) {
  if (!rows.length) return [];
  return supabaseFetch(`${table}?on_conflict=id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows)
  });
}

async function saveViralRoutine(routine) {
  await upsertRows("viral_routines", [viralRoutineRow(routine)]);
  await Promise.all([
    upsertRows("viral_tasks", viralTaskRows(routine)),
    upsertRows("viral_keywords", viralKeywordRows(routine)),
    upsertRows("viral_creators", viralCreatorRows(routine)),
    upsertRows("viral_follow_queue", viralFollowRows(routine)),
    upsertRows("viral_comments", viralCommentRows(routine)),
    upsertRows("viral_outreach_messages", viralOutreachRows(routine)),
    upsertRows("viral_hooks", viralHookRows(routine)),
    upsertRows("viral_video_briefs", viralVideoBriefRows(routine))
  ]);
  return routine;
}

async function readViralRoutineByDate(date) {
  const params = new URLSearchParams({
    date: `eq.${date}`,
    select: "payload,updated_at",
    limit: "1"
  });
  const rows = await supabaseFetch(`viral_routines?${params.toString()}`);
  const row = Array.isArray(rows) ? rows[0] : null;
  return row?.payload ? { ...row.payload, updated_at: row.updated_at } : null;
}

async function readViralHistory() {
  const [keywords, creators, hooks] = await Promise.all([
    safeFetch("viral_keywords?select=keyword,performance_score,created_at&order=created_at.desc&limit=100"),
    safeFetch("viral_creators?select=handle,status,category,creator_fit_score&order=updated_at.desc&limit=100"),
    safeFetch("viral_hooks?select=hook,performance_score,category,series&order=updated_at.desc&limit=100")
  ]);
  return {
    keywords: Array.isArray(keywords) ? keywords : keywords.rows,
    creators: Array.isArray(creators) ? creators : creators.rows,
    hooks: Array.isArray(hooks) ? hooks : hooks.rows,
    followedCreators: (Array.isArray(creators) ? creators : creators.rows).filter((creator) => creator.status === "followed")
  };
}


function viralCreatorSelectPath(url) {
  const params = new URLSearchParams({
    select: "*",
    order: "creator_fit_score.desc",
    limit: String(clampLimit(url.searchParams.get("limit"), 100, 200))
  });
  const status = sanitizeSearch(url.searchParams.get("status"));
  const platform = sanitizeSearch(url.searchParams.get("platform"));
  if (status) params.set("status", `eq.${status}`);
  if (platform) params.set("platform", `eq.${platform}`);
  return `viral_creators?${params.toString()}`;
}

function viralActionSelectPath(url, fallbackLimit = 200) {
  const params = new URLSearchParams({
    select: "*",
    order: "action_date.desc",
    limit: String(clampLimit(url.searchParams.get("limit"), fallbackLimit, 500))
  });
  const creatorId = String(url.searchParams.get("creator_id") || url.searchParams.get("creatorId") || "").trim();
  const since = String(url.searchParams.get("since") || "").trim();
  if (creatorId) params.set("creator_id", `eq.${creatorId}`);
  if (since) params.set("action_date", `gte.${since.slice(0, 10)}`);
  return `viral_actions?${params.toString()}`;
}

async function handleViralizaCreators(req, url) {
  if (req.method === "GET") {
    const result = await safeFetch(viralCreatorSelectPath(url));
    const creators = safeRows(result).map(mapViralCreatorRow);
    return { status: 200, payload: { ok: true, creators, persisted: !safeFetchFailed(result), error: result?.error || null } };
  }

  if (req.method !== "POST") return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
  const body = await readJsonBody(req);
  const creator = normalizeRealCreator(body.creator || body);
  try {
    await upsertRows("viral_creators", [viralRealCreatorRow(creator)]);
    return { status: 200, payload: { ok: true, creator, persisted: true } };
  } catch (error) {
    return { status: 200, payload: { ok: true, creator, persisted: false, error: error.message } };
  }
}

async function handleViralizaCreatorsImport(req) {
  if (req.method !== "POST") return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
  const body = await readJsonBody(req);
  const input = Array.isArray(body.creators) ? body.creators : Array.isArray(body) ? body : [];
  const creators = input.slice(0, 200).map((creator, index) => normalizeRealCreator(creator, index));
  if (!creators.length) return { status: 400, payload: { ok: false, error: "viraliza_import_empty" } };
  try {
    await upsertRows("viral_creators", creators.map(viralRealCreatorRow));
    return { status: 200, payload: { ok: true, creators, count: creators.length, persisted: true } };
  } catch (error) {
    return { status: 200, payload: { ok: true, creators, count: creators.length, persisted: false, error: error.message } };
  }
}

async function handleViralizaDailyPlan(req, url) {
  if (req.method !== "GET") return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
  const today = new Date().toISOString().slice(0, 10);
  const date = String(url.searchParams.get("date") || today).slice(0, 10);
  const creatorsResult = await safeFetch(viralCreatorSelectPath(url));
  const actionsResult = await safeFetch(viralActionSelectPath(url));
  const creators = safeRows(creatorsResult).map(mapViralCreatorRow);
  const actions = safeRows(actionsResult).map(mapViralActionRow);
  const dailyCreatorPlan = generateDailyCreatorPlan(creators, actions, date, VIRALIZA_DEFAULT_CONFIG);
  return {
    status: 200,
    payload: {
      ok: true,
      date,
      dailyCreatorPlan,
      creators_count: creators.length,
      actions_count: actions.length,
      persisted: !safeFetchFailed(creatorsResult) && !safeFetchFailed(actionsResult),
      warnings: [creatorsResult?.error, actionsResult?.error].filter(Boolean)
    }
  };
}

async function handleViralizaAction(req) {
  if (req.method !== "POST") return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
  const body = await readJsonBody(req);
  const action = normalizeViralAction(body.record || body.action || body);
  try {
    await upsertRows("viral_actions", [viralActionRow(action)]);
    return { status: 200, payload: { ok: true, action, persisted: true } };
  } catch (error) {
    return { status: 200, payload: { ok: true, action, persisted: false, error: error.message } };
  }
}
async function handleViraliza(req, url) {
  const today = new Date().toISOString().slice(0, 10);
  const date = String(url.searchParams.get("date") || today).slice(0, 10);

  if (req.method === "GET") {
    try {
      const routine = await readViralRoutineByDate(date);
      if (routine) return { status: 200, payload: { ok: true, routine, config: VIRALIZA_DEFAULT_CONFIG, persisted: true } };
    } catch (error) {
      const routine = generateDailyRoutine(date, VIRALIZA_DEFAULT_CONFIG, {});
      return { status: 200, payload: { ok: true, routine, config: VIRALIZA_DEFAULT_CONFIG, persisted: false, table_missing: true, error: error.message } };
    }
    return {
      status: 200,
      payload: {
        ok: true,
        routine: generateDailyRoutine(date, VIRALIZA_DEFAULT_CONFIG, {}),
        config: VIRALIZA_DEFAULT_CONFIG,
        persisted: false
      }
    };
  }

  if (req.method !== "POST") return { status: 405, payload: { ok: false, error: "method_not_allowed" } };

  const body = await readJsonBody(req);
  const action = String(body.action || "generate");
  if (action === "generate") {
    const history = await readViralHistory().catch(() => ({}));
    const routine = generateDailyRoutine(body.date || date, body.config || VIRALIZA_DEFAULT_CONFIG, history);
    try {
      await saveViralRoutine(routine);
      return { status: 200, payload: { ok: true, routine, persisted: true } };
    } catch (error) {
      return { status: 200, payload: { ok: true, routine, persisted: false, table_missing: true, error: error.message } };
    }
  }

  if (action === "contextual_comments") {
    return { status: 200, payload: { ok: true, result: generateContextualComments(body.context || body.videoContext || {}) } };
  }

  if (action === "outreach") {
    return { status: 200, payload: { ok: true, message: generateOutreachMessage(body.creator || {}, body.messageType || "dm") } };
  }

  if (action === "brief_from_hook") {
    return { status: 200, payload: { ok: true, brief: generateVideoBriefFromHook(body.hook || {}) } };
  }

  if (action === "brief_from_saved_video") {
    return { status: 200, payload: { ok: true, brief: generateVideoBriefFromSavedVideo(body.video || {}) } };
  }

  if (action === "record_action") {
    const recorded = recordAction(body.record || body);
    return { status: 200, payload: { ok: true, action: recorded } };
  }

  if (action === "record_result") {
    const results = recordResult(body.entity || {}, body.metrics || {});
    try {
      await upsertRows(
        "viral_results",
        results.map((item) => ({
          id: item.id,
          entity_type: item.entityType,
          entity_id: item.entityId,
          metric_name: item.metricName,
          metric_value: item.metricValue,
          recorded_at: item.recordedAt,
          payload: item
        }))
      );
    } catch (error) {
      return { status: 200, payload: { ok: true, results, persisted: false, error: error.message } };
    }
    return { status: 200, payload: { ok: true, results, persisted: true } };
  }

  if (action === "weekly_learning") {
    const report = analyzeWeeklyLearning(body.dateRange || {}, body.data || {});
    return { status: 200, payload: { ok: true, report, next_actions: recommendNextActions(report) } };
  }

  return { status: 400, payload: { ok: false, error: "viraliza_unknown_action" } };
}

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!assertAdmin(req, res)) return;

  const { url, resource } = routeFromRequest(req);

  try {
    if (resource === "alerts") {
      if (req.method !== "GET") return json(res, 405, { ok: false, error: "method_not_allowed" });
      return json(res, 200, await handleAlerts());
    }
    if (!hasSupabaseConfig()) {
      return json(res, 500, { ok: false, error: "supabase_not_configured" });
    }
    if (resource === "summary") {
      if (req.method !== "GET") return json(res, 405, { ok: false, error: "method_not_allowed" });
      return json(res, 200, await handleSummary());
    }
    if (resource === "premium/subscriptions") {
      if (req.method !== "GET") return json(res, 405, { ok: false, error: "method_not_allowed" });
      return json(res, 200, await handlePremiumSubscriptions(url));
    }
    if (resource === "extension/usage") {
      if (req.method !== "GET") return json(res, 405, { ok: false, error: "method_not_allowed" });
      return json(res, 200, await handleExtensionUsageSummary());
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
    if (resource === "parking/summary") {
      if (req.method !== "GET") return json(res, 405, { ok: false, error: "method_not_allowed" });
      return json(res, 200, await handleParkingSummary());
    }
    if (resource === "operations/releases") {
      const result = await handleReleaseArtifacts(req, url);
      return json(res, result.status, result.payload);
    }
    if (resource === "operations/chrome") {
      const result = await handleChromeOperation(req);
      return json(res, result.status, result.payload);
    }
    if (resource === "social-video/generate") {
      const result = await handleSocialVideoGenerate(req);
      return json(res, result.status, result.payload);
    }
    if (resource === "social-video/projects") {
      const result = await handleSocialVideoProjects(req, url);
      return json(res, result.status, result.payload);
    }
    if (resource === "viraliza/creators") {
      const result = await handleViralizaCreators(req, url);
      return json(res, result.status, result.payload);
    }
    if (resource === "viraliza/creators/import") {
      const result = await handleViralizaCreatorsImport(req);
      return json(res, result.status, result.payload);
    }
    if (resource === "viraliza/daily-plan") {
      const result = await handleViralizaDailyPlan(req, url);
      return json(res, result.status, result.payload);
    }
    if (resource === "viraliza/actions") {
      const result = await handleViralizaAction(req);
      return json(res, result.status, result.payload);
    }
    if (resource === "viraliza") {
      const result = await handleViraliza(req, url);
      return json(res, result.status, result.payload);
    }
    if (resource === "social-video/runway-config") {
      if (req.method !== "GET") return json(res, 405, { ok: false, error: "method_not_allowed" });
      return json(res, 200, runwayPublicConfig());
    }
    if (resource === "social-video/render") {
      const result = await handleSocialVideoRender(req, url);
      return json(res, result.status, result.payload);
    }
    if (resource === "social-video/render-content") {
      return handleSocialVideoRenderContent(req, res, url);
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
