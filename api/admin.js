const crypto = require("node:crypto");
const { assertAdmin, fetchWithTimeout, handleCors, hasSupabaseConfig, json, readRawBody, sanitizeErrorMessage, supabaseFetch } = require("./_utils");
const { createAdminRouter, dispatchAdminRoute } = require("./_admin/router");
const { createAnalyticsHandlers } = require("./_admin/handlers/analytics");
const { createCoreHandlers } = require("./_admin/handlers/core");
const { createExtensionUsageHandlers } = require("./_admin/handlers/extension-usage");
const { createSeoHandlers } = require("./_admin/handlers/seo");
const {
  buildSeoAutogenerationOperationalAlerts
} = require("./_seo/autogeneration");
const { getSeoContentPublicationStatus, runSeoContentPublication } = require("./_seo/contentPublisher");
const { runSeoLandingGeneration } = require("./_seo/generator");
const { evaluateLandingIndexability } = require("./_seo/indexability");
const { SEO_DAILY_TARGETS, buildSeoDailyPolicySnapshot } = require("./_seo/publishingPolicy");
const { createKpiSettingsHandler } = require("./_admin/handlers/kpis");
const { createOperationsReleaseHandler } = require("./_admin/handlers/operations");
const { createPremiumHandlers } = require("./_admin/handlers/premium");
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
const { buildRevenueEventFromLemonPayload, summarizeMonthlyRevenue } = require("../lib/sales/revenue");
const { loadNightlyMaintenanceAlerts } = require("../lib/operations/nightlyMaintenanceAlerts");
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
  buildViralizaPerformanceReport,
  analyzeViralizaLearning,
  recordAction,
  recordResult,
  analyzeWeeklyLearning,
  recommendNextActions
} = require("../lib/viraliza/engine");
const {
  MANUAL_MODE_NOTICE,
  LINKEDIN_COMPANY_URL,
  buildAuthorizationUrl,
  buildLinkedInPostText,
  decryptToken,
  defaultSettings: defaultLinkedInSettings,
  encryptToken,
  exchangeAuthorizationCode,
  generateLinkedInImage,
  generateLinkedInPost,
  linkedinEnvStatus,
  linkedinConfig,
  nextScheduledAt,
  normalizeHashtags,
  normalizeHiddenCosts,
  normalizeOrganizationUrn,
  normalizeSettings: normalizeLinkedInSettings,
  publishPost: publishLinkedInPost,
  refreshAccessToken,
  shouldRunAutopublisher,
  summarizeConnection,
  validatePublishInput
} = require("../lib/linkedin/services");
const {
  META_MANUAL_MODE_NOTICE,
  META_PLATFORMS,
  buildOrganicAuthorizationUrl,
  buildMetaPost,
  decryptToken: decryptMetaToken,
  defaultSettings: defaultMetaSettings,
  diffInstagramAuthorizationUrls,
  encryptToken: encryptMetaToken,
  exchangeAuthorizationCode: exchangeMetaAuthorizationCode,
  exchangeInstagramAuthorizationCode,
  fetchManagedPages,
  generateMetaImageSvg,
  imageUrlForLanding,
  metaConfig,
  metaEnvStatus,
  nextScheduledAt: nextMetaScheduledAt,
  normalizeSettings: normalizeMetaSettings,
  pickNextLanding,
  publishToPlatform: publishMetaToPlatform,
  redactInstagramAuthorizationUrl,
  sanitizeSecretText: sanitizeMetaSecretText,
  sanitizeMetaPayload,
  sanitizePage,
  selectManagedPage,
  shouldRunAutopublisher: shouldRunMetaAutopublisher,
  summarizeInstagramAuthorizationUrl,
  summarizeConnection: summarizeMetaConnection,
  validatePublishInput: validateMetaPublishInput,
  withUtm
} = require("../lib/meta/services");
const {
  META_ORGANIC_SOURCE_TYPE,
  buildFacebookOrganicTestPost,
  buildInstagramOrganicTestPost,
  decodeOrganicOAuthState,
  encodeOrganicOAuthState,
  metaOrganicOAuthScopes,
  normalizeOAuthTarget,
  validateMetaOrganicEnv
} = require("../lib/meta/organic");
const { logRequestMetric } = require("../lib/observability/request-metrics");
const LANDING_SELECT =
  "id,opportunity_id,slug,title,meta_title,meta_description,h1,body_html,city,province,autonomous_community,template_type,status,index_status,quality_score,word_count,canonical_url,published_at,last_generated_at,created_at,updated_at,source_data_json";
const META_OAUTH_STATE_COOKIE = "inmoradar_meta_oauth_state";
const SOCIAL_POST_PLATFORMS = ["instagram", "facebook", "linkedin", "tiktok"];
const SOCIAL_POST_FORMATS = ["image", "carousel", "reel", "video", "link", "text"];
const SOCIAL_POST_STATUSES = ["draft", "needs_review", "approved", "scheduled", "publishing", "published", "failed", "rejected", "cancelled"];
const SOCIAL_MANUAL_PUBLISH_STATUSES = ["approved", "scheduled"];
const SOCIAL_POST_QUEUE_SQL = "database/social-post-queue.sql";
const SOCIAL_ASSET_PROVIDERS = ["manual", "runway", "external", "future_stock"];
const SOCIAL_ASSET_MEDIA_TYPES = ["image", "video"];
const SOCIAL_ASSET_STATUSES = ["draft", "processing", "ready", "failed", "archived"];
const SOCIAL_ASSET_LICENSE_STATUSES = ["internal", "licensed", "unknown", "restricted"];
const SOCIAL_MEDIA_ASSETS_SQL = "database/social-media-assets.sql";
const SOCIAL_ASSETS_STORAGE_SQL = "database/social-assets-storage.sql";
const SOCIAL_ASSETS_STORAGE_BUCKET = "social-assets";
const SOCIAL_ASSET_ALLOWED_MIME_TYPES = {
  "image/jpeg": { media_type: "image", extension: "jpg" },
  "image/png": { media_type: "image", extension: "png" },
  "image/webp": { media_type: "image", extension: "webp" },
  "video/mp4": { media_type: "video", extension: "mp4" },
  "video/webm": { media_type: "video", extension: "webm" }
};
const SOCIAL_INSTAGRAM_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const SOCIAL_INSTAGRAM_VIDEO_MIME_TYPES = new Set(["video/mp4"]);

function requestHeader(req, name) {
  const headers = req.headers || {};
  if (headers[name] !== undefined) return headers[name];
  const lowerName = String(name).toLowerCase();
  const entry = Object.entries(headers).find(([key]) => String(key).toLowerCase() === lowerName);
  return entry ? entry[1] : "";
}

function responseHeaderValue(res, name) {
  const lowerName = String(name || "").toLowerCase();
  if (typeof res.getHeader === "function") return res.getHeader(name) || res.getHeader(lowerName);
  return res.headers?.[lowerName] || res.headers?.[name];
}

function appendResponseHeader(res, name, value) {
  const current = responseHeaderValue(res, name);
  if (!current) return res.setHeader(name, value);
  const next = Array.isArray(current) ? [...current, value] : [current, value];
  return res.setHeader(name, next);
}

function parseCookieHeader(value) {
  return String(value || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const index = part.indexOf("=");
      const key = index >= 0 ? part.slice(0, index).trim() : part;
      const rawValue = index >= 0 ? part.slice(index + 1) : "";
      if (key) {
        try {
          acc[key] = decodeURIComponent(rawValue || "");
        } catch (error) {
          acc[key] = rawValue || "";
        }
      }
      return acc;
    }, {});
}

function cleanRequestToken(value) {
  if (Array.isArray(value)) return cleanRequestToken(value[0]);
  return String(value || "").trim();
}

function adminOrCronTokensFromRequest(req) {
  const tokens = [];
  const authorization = cleanRequestToken(requestHeader(req, "authorization"));
  if (authorization.toLowerCase().startsWith("bearer ")) {
    tokens.push(authorization.slice(7).trim());
  }
  for (const header of ["x-cron-secret", "x-admin-token"]) {
    const token = cleanRequestToken(requestHeader(req, header));
    if (token) tokens.push(token);
  }
  return tokens.filter(Boolean);
}

function isAdminTokenRequest(req) {
  return Boolean(process.env.ADMIN_IMPORT_TOKEN && adminOrCronTokensFromRequest(req).includes(process.env.ADMIN_IMPORT_TOKEN));
}

function isCronTokenRequest(req) {
  return Boolean(process.env.CRON_SECRET && adminOrCronTokensFromRequest(req).includes(process.env.CRON_SECRET));
}

function assertAdminOrCron(req, res) {
  const allowedTokens = [process.env.CRON_SECRET, process.env.ADMIN_IMPORT_TOKEN].filter(Boolean);
  if (!allowedTokens.length) {
    json(res, 500, { ok: false, error: "admin_or_cron_token_not_configured" });
    return false;
  }
  if (!adminOrCronTokensFromRequest(req).some((token) => allowedTokens.includes(token))) {
    json(res, 401, { ok: false, error: "unauthorized" });
    return false;
  }
  return true;
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return req.body ? JSON.parse(req.body) : {};
  const raw = await readRawBody(req);
  if (!raw) return {};
  return JSON.parse(raw);
}

const handleKpiSettings = createKpiSettingsHandler({ readJsonBody, supabaseFetch });

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
    return { error: sanitizeErrorMessage(error), rows: fallback };
  }
}

const handleReleaseArtifacts = createOperationsReleaseHandler({
  clampLimit,
  readJsonBody,
  safeFetch,
  supabaseFetch
});
const {
  handleOwnedAnalyticsLearning,
  handleOwnedAnalyticsPages,
  handleOwnedAnalyticsSummary
} = createAnalyticsHandlers({
  clampLimit,
  hasSupabaseConfig,
  supabaseFetch
});
const { handlePremiumSubscriptions } = createPremiumHandlers({
  clampLimit,
  sanitizeSearch,
  supabaseFetch
});
const { handleParkingSummary } = createCoreHandlers({
  average,
  countBy,
  safeFetch
});
const { handleExtensionUsageSummary } = createExtensionUsageHandlers({
  clampLimit,
  supabaseFetch
});
const { handleSeoLandings: handleSeoLandingsReadOnly } = createSeoHandlers({
  buildSeoDailyPolicySnapshot,
  clampLimit,
  clampPage,
  landingSelect: LANDING_SELECT,
  safeFetch,
  seoDailyTargets: SEO_DAILY_TARGETS,
  supabaseFetch
});

function safeRows(result) {
  return Array.isArray(result) ? result : result?.rows || [];
}

function safeFetchFailed(result) {
  return Boolean(result && !Array.isArray(result) && result.error);
}

function sortAlerts(alerts) {
  const rank = { critical: 0, error: 0, warning: 1, info: 2, success: 3 };
  return alerts.sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9));
}

function recentSinceIso(hours = 24) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

async function handleAlerts() {
  const alerts = [];
  const generatedAt = new Date().toISOString();

  alerts.push(...loadNightlyMaintenanceAlerts({ now: generatedAt }));

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
  const viralSince = recentSinceIso(168);
  const encodedViralSince = encodeURIComponent(viralSince);
  try {
    const seoAutogenerationStatus = await getSeoContentPublicationStatus();
    alerts.push(...buildSeoAutogenerationOperationalAlerts(seoAutogenerationStatus, { now: generatedAt }));
  } catch (error) {
    alerts.push({
      id: "seo-autogeneration-status-error",
      severity: "critical",
      title: "La autogeneracion SEO no responde",
      message: "No se pudo leer el estado de autogeneracion SEO. Revisa el ultimo run y la configuracion del backend.",
      action_label: "Ir al evento",
      action_target: "#seo-autogeneration",
      dismissible: true,
      category: "seo"
    });
  }
  const [recentSeoResult, recentWaitlistResult, recentRevenueResult, recentPremiumResult, recentViralResult] = await Promise.all([
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
    ),
    safeFetch(
      `viral_actions?select=id,action_type,status,likes_count,replies_count,profile_visits,installs_attributed,updated_at&updated_at=gte.${encodedViralSince}&order=updated_at.desc&limit=25`
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

  const viralRows = safeRows(recentViralResult);
  if (!safeFetchFailed(recentViralResult) && !viralRows.length) {
    alerts.push({
      id: "viraliza-no-recent-results",
      severity: "info",
      title: "Viraliza sin resultados recientes",
      message: "No se han registrado resultados de Viraliza en 7 dias. El aprendizaje necesita likes, respuestas, visitas o installs manuales.",
      action_label: "Ir al evento",
      action_target: "#marketing-viraliza-learning",
      dismissible: true,
      category: "viraliza"
    });
  }
  const pendingViralRows = viralRows.filter((row) => /commented|dm_sent/i.test(String(row.action_type || "")) && !Number(row.likes_count || 0) && !Number(row.replies_count || 0) && !Number(row.profile_visits || 0) && !Number(row.installs_attributed || 0));
  if (!safeFetchFailed(recentViralResult) && pendingViralRows.length) {
    alerts.push({
      id: "viraliza-pending-results",
      severity: "info",
      title: "Acciones Viraliza pendientes de medir",
      message: `Hay ${pendingViralRows.length} acciones recientes sin resultado registrado. Revisa likes, respuestas, visitas e instalaciones.`,
      action_label: "Ir al evento",
      action_target: "#marketing-viraliza-learning",
      dismissible: true,
      category: "viraliza"
    });
  }
  const strongViralRow = viralRows.find((row) => Number(row.installs_attributed || 0) > 0 || Number(row.replies_count || 0) >= 3);
  if (!safeFetchFailed(recentViralResult) && strongViralRow) {
    alerts.push({
      id: "viraliza-high-performance-week",
      severity: "info",
      title: "Viraliza detecta una senal fuerte",
      message: "Hay una accion Viraliza con respuestas o instalaciones esta semana. Revisa el aprendizaje para repetir el formato.",
      action_label: "Ir al evento",
      action_target: "#marketing-viraliza-learning",
      dismissible: true,
      category: "viraliza"
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

function redirect(res, target, status = 302) {
  res.statusCode = status;
  res.setHeader("location", target);
  res.setHeader("cache-control", "no-store, max-age=0");
  res.end("");
}

function setMetaOAuthStateCookie(res, state) {
  appendResponseHeader(
    res,
    "set-cookie",
    `${META_OAUTH_STATE_COOKIE}=${encodeURIComponent(state)}; Path=/api/meta/oauth/callback; Max-Age=1800; HttpOnly; Secure; SameSite=Lax`
  );
}

function clearMetaOAuthStateCookie(res) {
  appendResponseHeader(
    res,
    "set-cookie",
    `${META_OAUTH_STATE_COOKIE}=; Path=/api/meta/oauth/callback; Max-Age=0; HttpOnly; Secure; SameSite=Lax`
  );
}

function readMetaOAuthStateCookie(req) {
  return parseCookieHeader(requestHeader(req, "cookie"))[META_OAUTH_STATE_COOKIE] || "";
}

function relativeWithQuery(path, params = {}) {
  const target = new URL(path, "https://www.inmoradar.app");
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") target.searchParams.set(key, String(value));
  });
  return `${target.pathname}${target.search}${target.hash}`;
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
    parkingResult,
    savedReportSharesResult
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
      safeFetch("parking_difficulty_cache?select=score,label,confidence_score,perspective,expires_at&limit=1000"),
      safeFetch(
        "saved_property_email_reports?provider=eq.cloudflare_email_service_share&status=eq.sent&select=id,created_at&limit=1000"
      )
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
  const savedReportShareRows = Array.isArray(savedReportSharesResult) ? savedReportSharesResult : savedReportSharesResult.rows;
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
      saved_report_shares: savedReportShareRows.length,
      recent: Array.isArray(recentPremiumResult) ? recentPremiumResult : recentPremiumResult.rows,
      error: premiumResult.error || recentPremiumResult.error || savedReportSharesResult.error || null
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
    const indexability = evaluateLandingIndexability({
      ...landing,
      status: "published",
      index_status: "index"
    });
    if (!indexability.sitemap_eligible) {
      return {
        status: 409,
        payload: {
          ok: false,
          error: "indexability_gate_failed",
          message: "La landing no cumple el gate de indexabilidad.",
          reasons: indexability.reasons
        }
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

  return handleSeoLandingsReadOnly(url);
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

function dryRunOverrideFromRequest(req, url, body) {
  if (!isAdminTokenRequest(req)) return undefined;
  if (typeof body?.dry_run === "boolean") return body.dry_run;
  if (typeof body?.dryRun === "boolean") return body.dryRun;
  const value = url.searchParams.get("dry_run") || url.searchParams.get("dryRun");
  if (value === null) return undefined;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

async function handleSeoAutogeneration(req, url) {
  if (req.method === "GET" && isAdminTokenRequest(req) && url.searchParams.get("run") !== "1") {
    return { status: 200, payload: await getSeoContentPublicationStatus() };
  }
  if (!["GET", "POST"].includes(req.method)) {
    return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
  }

  const body = req.method === "POST" ? await readJsonBody(req) : {};
  const dryRun = dryRunOverrideFromRequest(req, url, body);
  const config = {};
  if (typeof dryRun === "boolean") config.dryRun = dryRun;
  const requestSource = isCronTokenRequest(req) && !isAdminTokenRequest(req) ? "cron" : "admin";
  const result = await runSeoContentPublication({ requestSource, config });
  return { status: result.ok === false ? 500 : 200, payload: result };
}

function parseJsonMaybe(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function normalizeLinkedInPostRow(row = {}) {
  const hiddenCosts = normalizeHiddenCosts(parseJsonMaybe(row.hidden_costs, row.hidden_costs || []));
  return {
    ...row,
    post_type: row.post_type || row.source_reference || "precio_sexy_coste_oculto",
    headline: row.headline || row.hook || "",
    copy: row.copy || row.body || "",
    hidden_costs: hiddenCosts,
    linkedin_company_url: row.linkedin_company_url || process.env.LINKEDIN_COMPANY_URL || LINKEDIN_COMPANY_URL,
    organization_urn: normalizeOrganizationUrn(row.organization_urn || process.env.LINKEDIN_ORGANIZATION_URN),
    hashtags: normalizeHashtags(parseJsonMaybe(row.hashtags, row.hashtags || [])),
    linkedin_response: parseJsonMaybe(row.linkedin_response, row.linkedin_response || null),
    text: buildLinkedInPostText({
      hook: row.hook,
      body: row.body,
      cta: row.cta,
      hashtags: parseJsonMaybe(row.hashtags, row.hashtags || [])
    })
  };
}

async function readLinkedInConnection() {
  const result = await readLinkedInConnectionState();
  return result.connection;
}

async function readLinkedInConnectionState() {
  try {
    const rows = await supabaseFetch(
      "marketing_linkedin_connections?provider=eq.linkedin&select=*&limit=1"
    );
    return { connection: Array.isArray(rows) ? rows[0] || null : null, table_missing: false, error: null };
  } catch (error) {
    if (/marketing_linkedin_connections/.test(error.message)) {
      return { connection: null, table_missing: true, error: error.message };
    }
    throw error;
  }
}

async function saveLinkedInConnection(patch = {}) {
  const config = linkedinConfig(process.env);
  const organizationUrn = normalizeOrganizationUrn(patch.organization_urn || config.organizationUrn);
  const body = {
    provider: "linkedin",
    ...patch,
    linkedin_company_url: patch.linkedin_company_url || config.companyUrl,
    organization_urn: organizationUrn,
    organization_id: patch.organization_id || (organizationUrn ? organizationUrn.replace(/^urn:li:organization:/, "") : config.organizationId),
    updated_at: new Date().toISOString()
  };
  const rows = await supabaseFetch("marketing_linkedin_connections?on_conflict=provider", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify([body])
  });
  return Array.isArray(rows) ? rows[0] || null : rows;
}

async function readLinkedInSettings() {
  try {
    const rows = await supabaseFetch("marketing_linkedin_settings?select=*&order=created_at.asc&limit=1");
    const row = Array.isArray(rows) ? rows[0] || null : null;
    return {
      row,
      settings: normalizeLinkedInSettings(row || defaultLinkedInSettings()),
      table_missing: false,
      error: null
    };
  } catch (error) {
    return {
      row: null,
      settings: defaultLinkedInSettings(),
      table_missing: /marketing_linkedin_settings/.test(error.message),
      error: error.message
    };
  }
}

async function saveLinkedInSettings(input = {}) {
  const current = await readLinkedInSettings();
  const settings = normalizeLinkedInSettings({ ...current.settings, ...input });
  const body = {
    ...settings,
    default_hashtags: settings.default_hashtags,
    updated_at: new Date().toISOString()
  };
  const path = current.row?.id
    ? `marketing_linkedin_settings?id=eq.${encodeURIComponent(current.row.id)}`
    : "marketing_linkedin_settings";
  const rows = await supabaseFetch(path, {
    method: current.row?.id ? "PATCH" : "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(current.row?.id ? body : [body])
  });
  const row = Array.isArray(rows) ? rows[0] || null : rows;
  return { row, settings: normalizeLinkedInSettings(row || settings) };
}

async function listLinkedInPosts(url, limitOverride) {
  const pageSize = clampLimit(limitOverride || url.searchParams.get("limit"), 10, 50);
  const status = String(url.searchParams.get("status") || "all").toLowerCase();
  const params = new URLSearchParams({
    select: "*",
    order: "created_at.desc",
    limit: String(pageSize)
  });
  if (status && status !== "all") params.set("status", `eq.${status}`);
  try {
    const rows = await supabaseFetch(`marketing_linkedin_posts?${params.toString()}`);
    return {
      posts: (Array.isArray(rows) ? rows : []).map(normalizeLinkedInPostRow),
      error: null,
      table_missing: false
    };
  } catch (error) {
    return {
      posts: [],
      error: error.message,
      table_missing: /marketing_linkedin_posts/.test(error.message)
    };
  }
}

function linkedInPostsSummary(posts = []) {
  const rows = Array.isArray(posts) ? posts : [];
  const counts = countBy(rows, "status");
  return {
    total: rows.length,
    draft: counts.draft || 0,
    image_pending: counts.image_pending || 0,
    ready: counts.ready || 0,
    pending_review: counts.pending_review || 0,
    scheduled: counts.scheduled || 0,
    published: counts.published || 0,
    manually_published: counts.manually_published || 0,
    failed: counts.failed || 0,
    skipped: counts.skipped || 0,
    needs_connection: counts.needs_connection || 0,
    cancelled: counts.cancelled || 0,
    ready_for_manual: rows.filter((row) => ["draft", "ready", "image_pending", "pending_review", "scheduled", "failed", "needs_connection"].includes(row.status)).length
  };
}

async function listLinkedInRuns(limit = 5) {
  try {
    const rows = await supabaseFetch(`linkedin_autopublisher_runs?select=*&order=started_at.desc&limit=${encodeURIComponent(String(limit))}`);
    return { runs: Array.isArray(rows) ? rows : [], table_missing: false, error: null };
  } catch (error) {
    return { runs: [], table_missing: /linkedin_autopublisher_runs/.test(error.message), error: error.message };
  }
}

async function createLinkedInRun(status = "running") {
  try {
    const rows = await supabaseFetch("linkedin_autopublisher_runs", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify([{ started_at: new Date().toISOString(), status }])
    });
    return Array.isArray(rows) ? rows[0] || null : rows;
  } catch (error) {
    return null;
  }
}

async function finishLinkedInRun(run, patch = {}) {
  if (!run?.id) return null;
  try {
    const rows = await supabaseFetch(`linkedin_autopublisher_runs?id=eq.${encodeURIComponent(run.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ finished_at: new Date().toISOString(), ...patch })
    });
    return Array.isArray(rows) ? rows[0] || null : rows;
  } catch (error) {
    return null;
  }
}

async function createLinkedInPost(input = {}, settings = null) {
  const normalizedSettings = settings || (await readLinkedInSettings()).settings;
  const generated = generateLinkedInPost(input, normalizedSettings);
  const body = {
    post_type: generated.post_type,
    title: generated.title,
    headline: generated.headline,
    price_display: generated.price_display,
    hidden_costs: generated.hidden_costs,
    hook: generated.hook,
    copy: generated.copy,
    body: generated.body,
    cta: generated.cta,
    hashtags: generated.hashtags,
    image_path: generated.image_path,
    image_url: generated.image_url,
    image_prompt: generated.image_prompt,
    linkedin_company_url: generated.linkedin_company_url,
    organization_urn: generated.organization_urn,
    city: generated.city,
    source_type: input.source_type || generated.source_type || "auto",
    source_reference: input.source_reference || generated.source_reference || null,
    scheduled_at: input.scheduled_at || generated.scheduled_at || null,
    status: input.status || generated.status || "pending_review",
    approval_required: generated.approval_required === false ? false : true
  };
  const rows = await supabaseFetch("marketing_linkedin_posts", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([body])
  });
  return normalizeLinkedInPostRow(Array.isArray(rows) ? rows[0] || null : rows);
}

async function readLinkedInPost(id) {
  const rows = await supabaseFetch(`marketing_linkedin_posts?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
  return normalizeLinkedInPostRow(Array.isArray(rows) ? rows[0] || null : rows);
}

async function patchLinkedInPost(id, patch = {}) {
  const rows = await supabaseFetch(`marketing_linkedin_posts?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() })
  });
  return normalizeLinkedInPostRow(Array.isArray(rows) ? rows[0] || null : rows);
}

async function loadLinkedInAccessToken(connection) {
  const accessToken = decryptToken(connection?.access_token_encrypted || "");
  if (!accessToken) throw new Error("linkedin_access_token_missing");
  const expiresAt = connection?.token_expires_at ? new Date(connection.token_expires_at).getTime() : null;
  if (!expiresAt || expiresAt > Date.now() + 120000) return { accessToken, connection };

  const refreshToken = decryptToken(connection?.refresh_token_encrypted || "");
  if (!refreshToken) throw new Error("linkedin_token_expired");
  const refreshed = await refreshAccessToken({ refreshToken });
  const updated = await saveLinkedInConnection({
    status: "connected",
    access_token_encrypted: encryptToken(refreshed.access_token),
    refresh_token_encrypted: refreshed.refresh_token ? encryptToken(refreshed.refresh_token) : connection.refresh_token_encrypted,
    token_expires_at: refreshed.token_expires_at,
    refresh_token_expires_at: refreshed.refresh_token_expires_at || connection.refresh_token_expires_at,
    scopes: refreshed.scopes?.length ? refreshed.scopes : connection.scopes,
    last_error: null
  });
  return { accessToken: refreshed.access_token, connection: updated };
}

async function publishLinkedInPostById(id) {
  const [post, connection, settingsState] = await Promise.all([readLinkedInPost(id), readLinkedInConnection(), readLinkedInSettings()]);
  const settings = settingsState.settings;
  try {
    validatePublishInput({ post, connection, settings });
  } catch (error) {
    const message = String(error.message || "linkedin_needs_connection").slice(0, 800);
    const nextStatus = /connection|organization_urn|token/.test(message) ? "needs_connection" : "skipped";
    return await patchLinkedInPost(id, { status: nextStatus, error_message: message });
  }
  let tokenState;
  try {
    tokenState = await loadLinkedInAccessToken(connection);
  } catch (error) {
    return await patchLinkedInPost(id, { status: "needs_connection", error_message: String(error.message || "linkedin_access_token_missing").slice(0, 800) });
  }
  const { accessToken, connection: freshConnection } = tokenState;
  const ownerUrn = normalizeOrganizationUrn(post.organization_urn || freshConnection.organization_urn || process.env.LINKEDIN_ORGANIZATION_URN);
  if (!ownerUrn) return await patchLinkedInPost(id, { status: "needs_connection", error_message: "linkedin_organization_urn_missing" });
  await patchLinkedInPost(id, { status: "publishing", error_message: null });
  try {
    const result = await publishLinkedInPost({ accessToken, post, ownerUrn });
    return await patchLinkedInPost(id, {
      status: "published",
      published_at: new Date().toISOString(),
      linkedin_image_urn: result.linkedin_image_urn,
      linkedin_post_urn: result.linkedin_post_urn,
      linkedin_post_id: result.linkedin_post_urn,
      linkedin_response: result.linkedin_response,
      error_message: null
    });
  } catch (error) {
    const message = String(error.message || "linkedin_publish_failed").slice(0, 800);
    await saveLinkedInConnection({ status: "error", mode: "manual", last_error: message });
    return await patchLinkedInPost(id, { status: "failed", error_message: message });
  }
}

async function generateDailyLinkedInDraft({ publishIfAllowed = false } = {}) {
  const settingsState = await readLinkedInSettings();
  if (settingsState.table_missing) {
    return {
      ok: true,
      skipped: true,
      reason: "table_missing",
      table: "marketing_linkedin_settings",
      pending_sql: "database/marketing-linkedin.sql",
      manual_mode_available: true
    };
  }
  const settings = settingsState.settings;
  if (!settings.daily_generation_enabled) {
    return { ok: true, skipped: true, reason: "daily_generation_disabled" };
  }
  const recent = await listLinkedInPosts(new URL("https://admin.local/?limit=100"), 100);
  if (recent.table_missing) {
    return {
      ok: true,
      skipped: true,
      reason: "table_missing",
      table: "marketing_linkedin_posts",
      pending_sql: "database/marketing-linkedin.sql",
      manual_mode_available: true
    };
  }
  if (recent.error) {
    return { ok: false, skipped: true, reason: "storage_error", error: recent.error };
  }
  const scheduledAt = nextScheduledAt(settings);
  const post = await createLinkedInPost({
    post_type: settings.active_post_type || "precio_sexy_coste_oculto",
    content_mode: settings.active_post_type || "precio_sexy_coste_oculto",
    source_type: "auto",
    source_reference: "manual_now",
    scheduled_at: scheduledAt,
    status: "ready"
  }, settings);
  if (publishIfAllowed && settings.autopost_enabled && !settings.approval_required) {
    const published = await publishLinkedInPostById(post.id);
    return { ok: true, skipped: false, post: published, published: published.status === "published" };
  }
  return { ok: true, skipped: false, post, published: false };
}

async function runLinkedInAutopublisherScheduler() {
  const run = await createLinkedInRun("running");
  const finish = (patch) => finishLinkedInRun(run, patch).then(() => patch);
  if (!hasSupabaseConfig()) {
    return finish({ status: "skipped", skipped_count: 1, generated_count: 0, published_count: 0, error_message: "supabase_not_configured" });
  }
  const [settingsState, connectionState, recent] = await Promise.all([
    readLinkedInSettings(),
    readLinkedInConnectionState(),
    listLinkedInPosts(new URL("https://admin.local/?limit=100"), 100)
  ]);
  if (settingsState.table_missing || recent.table_missing) {
    return finish({ status: "skipped", skipped_count: 1, generated_count: 0, published_count: 0, error_message: "table_missing" });
  }
  if (settingsState.error || recent.error || connectionState.error) {
    return finish({ status: "failed", skipped_count: 1, generated_count: 0, published_count: 0, error_message: settingsState.error || recent.error || connectionState.error });
  }

  const settings = settingsState.settings;
  const decision = shouldRunAutopublisher({ posts: recent.posts, settings, connection: connectionState.connection, now: new Date() });
  if (!decision.ok) {
    return finish({ status: "skipped", skipped_count: 1, generated_count: 0, published_count: 0, error_message: decision.reason });
  }

  const scheduledAt = nextScheduledAt(settings);
  const post = await createLinkedInPost({
    post_type: settings.active_post_type || "precio_sexy_coste_oculto",
    content_mode: settings.active_post_type || "precio_sexy_coste_oculto",
    source_type: "auto",
    source_reference: "autopublisher",
    scheduled_at: scheduledAt,
    status: "scheduled"
  }, settings);

  const published = await publishLinkedInPostById(post.id);
  const ok = published.status === "published";
  return finish({
    status: ok ? "published" : published.status || "failed",
    generated_count: 1,
    published_count: ok ? 1 : 0,
    skipped_count: ok ? 0 : 1,
    error_message: ok ? null : published.error_message || published.status
  }).then((result) => ({ ...result, post: published }));
}

async function handleLinkedInDaily(req) {
  if (req.method !== "POST") return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
  const result = await runLinkedInAutopublisherScheduler();
  return {
    status: result.status === "failed" ? 500 : 200,
    payload: {
      ok: result.status !== "failed",
      skipped: result.status === "skipped",
      reason: result.error_message || result.status,
      ...result
    }
  };
}

async function handleLinkedInDashboard(url) {
  const [connectionState, settingsState, postsState, runsState] = await Promise.all([
    readLinkedInConnectionState(),
    readLinkedInSettings(),
    listLinkedInPosts(url, 10),
    listLinkedInRuns(5)
  ]);
  const settings = settingsState.settings;
  const connection = connectionState.connection;
  const connectionSummary = summarizeConnection(connection, process.env);
  const lastPublication = postsState.posts.find((post) => post.published_at || post.manually_published_at) || null;
  const decision = shouldRunAutopublisher({ posts: postsState.posts, settings, connection, now: new Date() });
  const config = linkedinConfig(process.env);
  return {
    status: 200,
    payload: {
      ok: true,
      connection: connectionSummary,
      settings,
      posts: postsState.posts,
      runs: runsState.runs,
      summary: linkedInPostsSummary(postsState.posts),
      last_publication: lastPublication,
      next_publication: nextScheduledAt(settings),
      autopublisher: {
        company_url: settings.linkedin_company_url || config.companyUrl || LINKEDIN_COMPANY_URL,
        enabled: settings.autopost_enabled === true && config.autopostEnabled,
        frequency: settings.frequency || "every_2_days",
        frequency_days: settings.frequency_days || 2,
        max_posts_per_day: settings.max_posts_per_day || 1,
        active_post_type: settings.active_post_type || "precio_sexy_coste_oculto",
        next_publication: nextScheduledAt(settings),
        decision
      },
      env: linkedinEnvStatus(process.env),
      manual_mode_notice: MANUAL_MODE_NOTICE,
      storage: {
        connection_table_missing: connectionState.table_missing,
        settings_table_missing: settingsState.table_missing,
        posts_table_missing: postsState.table_missing,
        runs_table_missing: runsState.table_missing,
        connection_error: connectionState.error,
        settings_error: settingsState.error,
        posts_error: postsState.error,
        runs_error: runsState.error
      }
    }
  };
}

async function handleLinkedInConnect(req, url) {
  if (req.method !== "GET") return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
  const scopes = String(url.searchParams.get("scopes") || "")
    .split(/[\s,]+/)
    .filter(Boolean);
  const result = buildAuthorizationUrl({ scopes: scopes.length ? scopes : undefined });
  return { status: 200, payload: { ok: true, ...result } };
}

async function handleLinkedInCallback(req) {
  if (req.method !== "POST") return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
  const body = await readJsonBody(req);
  if (!body.code) return { status: 400, payload: { ok: false, error: "linkedin_code_required" } };
  const token = await exchangeAuthorizationCode({ code: body.code });
  const config = linkedinConfig(process.env);
  const connection = await saveLinkedInConnection({
    status: "connected",
    mode: config.autopostEnabled ? "automatic" : "manual",
    linkedin_company_url: config.companyUrl,
    organization_id: config.organizationId,
    organization_urn: config.organizationUrn,
    access_token_encrypted: encryptToken(token.access_token),
    refresh_token_encrypted: token.refresh_token ? encryptToken(token.refresh_token) : null,
    token_expires_at: token.token_expires_at,
    refresh_token_expires_at: token.refresh_token_expires_at,
    scopes: token.scopes,
    connected_by_user_id: "backoffice",
    last_error: null
  });
  return { status: 200, payload: { ok: true, connection: summarizeConnection(connection, process.env) } };
}

async function handleLinkedInDisconnect(req) {
  if (req.method !== "POST") return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
  const connection = await saveLinkedInConnection({
    status: "disconnected",
    mode: "manual",
    access_token_encrypted: null,
    refresh_token_encrypted: null,
    token_expires_at: null,
    refresh_token_expires_at: null,
    last_error: null
  });
  return { status: 200, payload: { ok: true, connection: summarizeConnection(connection, process.env) } };
}

async function handleLinkedInTestConnection(req) {
  if (req.method !== "POST") return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
  const connectionState = await readLinkedInConnectionState();
  const summary = summarizeConnection(connectionState.connection, process.env);
  return {
    status: 200,
    payload: {
      ok: true,
      connection: summary,
      table_missing: connectionState.table_missing,
      error: connectionState.error,
      automatic_available: summary.automatic_available,
      message: summary.automatic_available ? "LinkedIn automático disponible." : MANUAL_MODE_NOTICE
    }
  };
}

async function handleLinkedInSettings(req) {
  if (req.method === "GET") {
    const result = await readLinkedInSettings();
    return { status: 200, payload: { ok: true, settings: result.settings, updated_at: result.row?.updated_at || null, table_missing: result.table_missing, error: result.error } };
  }
  if (req.method === "POST") {
    const body = await readJsonBody(req);
    const result = await saveLinkedInSettings(body.settings || body);
    return { status: 200, payload: { ok: true, settings: result.settings, updated_at: result.row?.updated_at || new Date().toISOString() } };
  }
  return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
}

async function handleLinkedInPosts(req, url) {
  if (req.method === "GET") {
    const posts = await listLinkedInPosts(url);
    return { status: 200, payload: { ok: true, posts: posts.posts, summary: linkedInPostsSummary(posts.posts), table_missing: posts.table_missing, error: posts.error } };
  }
  if (req.method === "POST") {
    const body = await readJsonBody(req);
    if (body.action) return handleLinkedInPostAction(body);
    const settings = (await readLinkedInSettings()).settings;
    const post = await createLinkedInPost({ ...body, source_type: body.source_type || "manual", status: body.status || "draft" }, settings);
    return { status: 200, payload: { ok: true, post } };
  }
  if (req.method === "PUT") {
    const body = await readJsonBody(req);
    if (!body.id) return { status: 400, payload: { ok: false, error: "linkedin_post_id_required" } };
    const patch = {
      post_type: cleanNullable(body.post_type),
      title: cleanNullable(body.title),
      headline: cleanNullable(body.headline || body.hook),
      price_display: cleanNullable(body.price_display),
      hidden_costs: normalizeHiddenCosts(body.hidden_costs),
      hook: cleanNullable(body.hook),
      copy: String(body.copy || body.body || "").trim(),
      body: String(body.body || "").trim(),
      cta: cleanNullable(body.cta),
      hashtags: normalizeHashtags(body.hashtags),
      image_url: cleanNullable(body.image_url),
      image_path: cleanNullable(body.image_path),
      image_prompt: cleanNullable(body.image_prompt),
      linkedin_company_url: cleanNullable(body.linkedin_company_url),
      organization_urn: normalizeOrganizationUrn(body.organization_urn || process.env.LINKEDIN_ORGANIZATION_URN),
      city: cleanNullable(body.city),
      scheduled_at: cleanNullable(body.scheduled_at),
      status: body.status || "draft",
      source_type: body.source_type || "manual",
      source_reference: cleanNullable(body.source_reference)
    };
    const post = await patchLinkedInPost(body.id, patch);
    return { status: 200, payload: { ok: true, post } };
  }
  return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
}

function cleanNullable(value) {
  const text = String(value || "").trim();
  return text || null;
}

function normalizeSocialPlatform(value) {
  const platform = String(value || "instagram").trim().toLowerCase();
  return SOCIAL_POST_PLATFORMS.includes(platform) ? platform : "instagram";
}

function normalizeSocialFormat(value) {
  const format = String(value || "image").trim().toLowerCase();
  return SOCIAL_POST_FORMATS.includes(format) ? format : "image";
}

function normalizeSocialPostStatus(value, fallback = "draft") {
  const status = String(value || fallback).trim().toLowerCase();
  return SOCIAL_POST_STATUSES.includes(status) ? status : fallback;
}

function normalizeSocialAssetProvider(value, fallback = "manual") {
  const provider = String(value || fallback).trim().toLowerCase();
  return SOCIAL_ASSET_PROVIDERS.includes(provider) ? provider : fallback;
}

function normalizeSocialAssetMediaType(value, fallback = "") {
  const type = String(value || fallback).trim().toLowerCase();
  return SOCIAL_ASSET_MEDIA_TYPES.includes(type) ? type : "";
}

function normalizeSocialAssetStatus(value, fallback = "draft") {
  const status = String(value || fallback).trim().toLowerCase();
  return SOCIAL_ASSET_STATUSES.includes(status) ? status : fallback;
}

function normalizeSocialAssetLicenseStatus(value, fallback = "internal") {
  const status = String(value || fallback).trim().toLowerCase();
  return SOCIAL_ASSET_LICENSE_STATUSES.includes(status) ? status : fallback;
}

function socialOptionalNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function socialOptionalInteger(value) {
  const number = socialOptionalNumber(value);
  return number === null ? null : Math.round(number);
}

function normalizeSocialAssetMetadata(value) {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return sanitizeMetaPayload(JSON.parse(value));
    } catch (error) {
      return { note: sanitizeMetaSecretText(value, 1000) };
    }
  }
  if (typeof value === "object") return sanitizeMetaPayload(value);
  return null;
}

function normalizeSocialAssetRow(row = {}) {
  if (!row) return null;
  const asset = {
    id: row.id || null,
    provider: normalizeSocialAssetProvider(row.provider),
    provider_asset_id: row.provider_asset_id ? socialSafeText(row.provider_asset_id, 220) : null,
    provider_job_id: row.provider_job_id ? socialSafeText(row.provider_job_id, 220) : null,
    media_type: normalizeSocialAssetMediaType(row.media_type),
    status: normalizeSocialAssetStatus(row.status),
    title: row.title ? socialSafeText(row.title, 180) : null,
    description: row.description ? socialSafeText(row.description, 500) : null,
    public_url: row.public_url ? socialSafeText(row.public_url, 1000) : null,
    thumbnail_url: row.thumbnail_url ? socialSafeText(row.thumbnail_url, 1000) : null,
    duration_seconds: socialOptionalNumber(row.duration_seconds),
    width: socialOptionalInteger(row.width),
    height: socialOptionalInteger(row.height),
    ratio: row.ratio ? socialSafeText(row.ratio, 40) : null,
    mime_type: row.mime_type ? socialSafeText(row.mime_type, 120) : null,
    file_size_bytes: socialOptionalInteger(row.file_size_bytes),
    license_status: normalizeSocialAssetLicenseStatus(row.license_status),
    usage_notes: row.usage_notes ? socialSafeText(row.usage_notes, 500) : null,
    source_prompt: row.source_prompt ? socialSafeText(row.source_prompt, 1200) : null,
    metadata: normalizeSocialAssetMetadata(row.metadata),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  };
  return {
    ...asset,
    compatibility: buildSocialAssetCompatibility(asset)
  };
}

function socialAssetsTableMissing(error) {
  return /social_media_assets/i.test(String(error?.message || error || ""));
}

function normalizeSocialAssetInput(input = {}, current = {}) {
  const mediaType = normalizeSocialAssetMediaType(input.media_type ?? current.media_type);
  return {
    provider: normalizeSocialAssetProvider(input.provider ?? current.provider ?? "manual"),
    provider_asset_id: cleanNullable(input.provider_asset_id ?? current.provider_asset_id ?? null),
    provider_job_id: cleanNullable(input.provider_job_id ?? current.provider_job_id ?? null),
    media_type: mediaType,
    status: normalizeSocialAssetStatus(input.status ?? current.status ?? "draft"),
    title: cleanNullable(input.title ?? current.title ?? null),
    description: cleanNullable(input.description ?? current.description ?? null),
    public_url: cleanNullable(input.public_url ?? current.public_url ?? null),
    thumbnail_url: cleanNullable(input.thumbnail_url ?? current.thumbnail_url ?? null),
    duration_seconds: socialOptionalNumber(input.duration_seconds ?? current.duration_seconds ?? null),
    width: socialOptionalInteger(input.width ?? current.width ?? null),
    height: socialOptionalInteger(input.height ?? current.height ?? null),
    ratio: cleanNullable(input.ratio ?? current.ratio ?? null),
    mime_type: cleanNullable(input.mime_type ?? current.mime_type ?? null),
    file_size_bytes: socialOptionalInteger(input.file_size_bytes ?? current.file_size_bytes ?? null),
    license_status: normalizeSocialAssetLicenseStatus(input.license_status ?? current.license_status ?? "internal"),
    usage_notes: cleanNullable(input.usage_notes ?? current.usage_notes ?? null),
    source_prompt: cleanNullable(input.source_prompt ?? current.source_prompt ?? null),
    metadata: normalizeSocialAssetMetadata(input.metadata ?? current.metadata ?? null)
  };
}

function validateSocialAssetInput(input = {}) {
  if (!input.media_type) return "social_asset_media_type_required";
  if (input.status === "ready" && !publicHttpsMediaUrl(input.public_url)) return "social_asset_public_https_url_required";
  if (input.public_url && !publicHttpsMediaUrl(input.public_url)) return "social_asset_public_url_must_be_https";
  if (input.thumbnail_url && !publicHttpsMediaUrl(input.thumbnail_url)) return "social_asset_thumbnail_url_must_be_https";
  return null;
}

function socialAssetUploadLimitBytes(mediaType, env = process.env) {
  const envKey = mediaType === "video" ? "SOCIAL_ASSET_MAX_VIDEO_MB" : "SOCIAL_ASSET_MAX_IMAGE_MB";
  const fallbackMb = mediaType === "video" ? 100 : 10;
  const parsed = Number.parseFloat(String(env[envKey] || fallbackMb));
  const megabytes = Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMb;
  return Math.floor(megabytes * 1024 * 1024);
}

function safeSocialAssetFilename(filename = "", mimeType = "application/octet-stream") {
  const mime = SOCIAL_ASSET_ALLOWED_MIME_TYPES[mimeType] || {};
  const fallbackExt = mime.extension || "bin";
  const withoutPath = String(filename || `asset.${fallbackExt}`).split(/[\\/]/).pop() || `asset.${fallbackExt}`;
  const clean = withoutPath
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 120);
  const hasExtension = /\.[a-z0-9]{2,8}$/i.test(clean);
  return hasExtension ? clean : `${clean || "asset"}.${fallbackExt}`;
}

function socialAssetStorageObjectPath(filename, now = new Date(), prefix = "") {
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const cleanPrefix = String(prefix || "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => safeSocialAssetFilename(part, "application/octet-stream").replace(/\.[a-z0-9]{2,8}$/i, ""))
    .filter(Boolean)
    .join("/");
  const path = `${yyyy}/${mm}/${crypto.randomUUID()}-${filename}`;
  return cleanPrefix ? `${cleanPrefix}/${path}` : path;
}

function encodedStoragePath(path) {
  return String(path || "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function supabaseStorageBaseUrl(env = process.env) {
  return String(env.SUPABASE_URL || "").replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
}

function supabaseStorageObjectPublicUrl(bucket, objectPath, env = process.env) {
  return `${supabaseStorageBaseUrl(env)}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodedStoragePath(objectPath)}`;
}

function supabaseStorageHeaders(contentType, env = process.env) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY || "";
  const headers = {
    apikey: key,
    "content-type": contentType,
    "cache-control": "31536000"
  };
  if (!String(key).startsWith("sb_secret_") && !String(key).startsWith("sb_publishable_")) {
    headers.authorization = `Bearer ${key}`;
  }
  return headers;
}

function parseSocialUploadBase64(body = {}) {
  const dataUrl = String(body.data_url || body.file_data_url || "");
  if (dataUrl) {
    const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/i);
    if (!match) return { error: "social_asset_upload_data_url_invalid" };
    return { mime_type: match[1].toLowerCase(), content_base64: match[2] };
  }
  return {
    mime_type: String(body.mime_type || body.content_type || "").trim().toLowerCase(),
    content_base64: String(body.content_base64 || body.base64 || "").trim()
  };
}

function normalizeSocialAssetUploadInput(body = {}, env = process.env) {
  const parsed = parseSocialUploadBase64(body);
  if (parsed.error) return { error: parsed.error };
  const mimeConfig = SOCIAL_ASSET_ALLOWED_MIME_TYPES[parsed.mime_type];
  if (!mimeConfig) return { error: "social_asset_upload_mime_not_allowed" };
  if (!parsed.content_base64) return { error: "social_asset_upload_content_required" };
  let buffer;
  try {
    buffer = Buffer.from(parsed.content_base64, "base64");
  } catch (error) {
    return { error: "social_asset_upload_base64_invalid" };
  }
  if (!buffer.length || buffer.toString("base64").replace(/=+$/, "") !== parsed.content_base64.replace(/\s/g, "").replace(/=+$/, "")) {
    return { error: "social_asset_upload_base64_invalid" };
  }
  const limitBytes = socialAssetUploadLimitBytes(mimeConfig.media_type, env);
  if (buffer.length > limitBytes) {
    return {
      error: "social_asset_upload_too_large",
      limit_bytes: limitBytes,
      file_size_bytes: buffer.length
    };
  }
  const filename = safeSocialAssetFilename(body.filename || body.name || "", parsed.mime_type);
  return {
    buffer,
    filename,
    mime_type: parsed.mime_type,
    media_type: mimeConfig.media_type,
    file_size_bytes: buffer.length,
    title: socialSafeText(body.title || filename, 180),
    description: cleanNullable(body.description),
    usage_notes: cleanNullable(body.usage_notes),
    metadata: normalizeSocialAssetMetadata({
      ...(body.metadata && typeof body.metadata === "object" ? body.metadata : {}),
      original_filename: filename,
      uploaded_via: "backoffice",
      storage_bucket: SOCIAL_ASSETS_STORAGE_BUCKET
    })
  };
}

async function uploadSocialAssetBufferToStorage(input, env = process.env, fetchImpl = fetchWithTimeout) {
  const objectPath = socialAssetStorageObjectPath(input.filename, new Date(), input.storage_prefix || "");
  const url = `${supabaseStorageBaseUrl(env)}/storage/v1/object/${encodeURIComponent(SOCIAL_ASSETS_STORAGE_BUCKET)}/${encodedStoragePath(objectPath)}`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      ...supabaseStorageHeaders(input.mime_type, env),
      "x-upsert": "false"
    },
    body: input.buffer,
    timeoutMs: Number(env.SOCIAL_ASSET_STORAGE_TIMEOUT_MS || 30000)
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch (error) {
    payload = { raw_response: sanitizeMetaSecretText(text || "", 600) };
  }
  if (!response.ok) {
    throw new Error(sanitizeMetaSecretText(`Supabase Storage ${response.status}: ${JSON.stringify(payload)}`, 800));
  }
  return {
    bucket: SOCIAL_ASSETS_STORAGE_BUCKET,
    object_path: objectPath,
    storage_path: `${SOCIAL_ASSETS_STORAGE_BUCKET}/${objectPath}`,
    public_url: supabaseStorageObjectPublicUrl(SOCIAL_ASSETS_STORAGE_BUCKET, objectPath, env),
    storage_response: sanitizeMetaPayload(payload)
  };
}

async function uploadSocialAsset(body = {}, env = process.env) {
  const input = normalizeSocialAssetUploadInput(body, env);
  if (input.error) return { status: 400, payload: { ok: false, error: input.error, limit_bytes: input.limit_bytes, file_size_bytes: input.file_size_bytes } };
  try {
    const storage = await uploadSocialAssetBufferToStorage(input, env);
    const result = await createSocialAsset({
      provider: "manual",
      media_type: input.media_type,
      status: "ready",
      title: input.title,
      description: input.description,
      public_url: storage.public_url,
      thumbnail_url: input.media_type === "image" ? storage.public_url : null,
      mime_type: input.mime_type,
      file_size_bytes: input.file_size_bytes,
      license_status: "internal",
      usage_notes: input.usage_notes,
      metadata: {
        ...input.metadata,
        storage_bucket: storage.bucket,
        storage_path: storage.storage_path,
        storage_object_path: storage.object_path,
        storage_response: storage.storage_response
      }
    });
    if (result.status) return { status: result.status, payload: { ok: false, error: result.error } };
    if (result.table_missing) return { status: 503, payload: { ok: false, error: "social_media_assets_table_missing", pending_sql: SOCIAL_MEDIA_ASSETS_SQL } };
    if (result.error) return { status: 500, payload: { ok: false, error: result.error } };
    return { status: 201, payload: { ok: true, asset: result.asset, storage: { bucket: storage.bucket, path: storage.storage_path, public_url: storage.public_url } } };
  } catch (error) {
    return { status: 500, payload: { ok: false, error: "social_asset_upload_failed", message: sanitizeMetaSecretText(error.message || "social_asset_upload_failed", 800) } };
  }
}

function normalizeResponseMimeType(value = "", fallbackUrl = "") {
  const contentType = String(value || "").split(";")[0].trim().toLowerCase();
  if (SOCIAL_ASSET_ALLOWED_MIME_TYPES[contentType]) return contentType;
  const pathname = (() => {
    try {
      return new URL(String(fallbackUrl || "")).pathname.toLowerCase();
    } catch {
      return String(fallbackUrl || "").toLowerCase();
    }
  })();
  if (pathname.endsWith(".webm")) return "video/webm";
  return "video/mp4";
}

function runwayJobCompleted(status) {
  return ["succeeded", "success", "completed", "complete"].includes(String(status || "").trim().toLowerCase());
}

function sanitizeRunwayOutputUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return `${url.origin}${url.pathname}`;
  } catch {
    return "";
  }
}

async function responseBufferWithLimit(response, limitBytes) {
  if (response.body && typeof response.body.getReader === "function") {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      total += chunk.length;
      if (total > limitBytes) throw new Error("social_asset_upload_too_large");
      chunks.push(chunk);
    }
    return Buffer.concat(chunks, total);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > limitBytes) throw new Error("social_asset_upload_too_large");
  return buffer;
}

async function copyRunwayOutputToSocialAssetStorage(job, env = process.env, fetchImpl = fetchWithTimeout) {
  const resultUrl = String(job?.result_url || "").trim();
  if (!publicHttpsMediaUrl(resultUrl)) throw new Error("runway_output_https_url_required");
  const response = await fetchImpl(resultUrl, {
    timeoutMs: Number(env.SOCIAL_ASSET_RUNWAY_COPY_TIMEOUT_MS || 60000)
  });
  if (!response.ok) {
    throw new Error(`runway_output_fetch_failed_${response.status || "unknown"}`);
  }
  const mimeType = normalizeResponseMimeType(response.headers?.get?.("content-type") || "", resultUrl);
  const mimeConfig = SOCIAL_ASSET_ALLOWED_MIME_TYPES[mimeType];
  if (!mimeConfig || mimeConfig.media_type !== "video") throw new Error("runway_output_mime_not_allowed");
  const limitBytes = socialAssetUploadLimitBytes("video", env);
  const contentLength = Number(response.headers?.get?.("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > limitBytes) {
    throw new Error("social_asset_upload_too_large");
  }
  const buffer = await responseBufferWithLimit(response, limitBytes);
  const extension = SOCIAL_ASSET_ALLOWED_MIME_TYPES[mimeType]?.extension || "mp4";
  const storage = await uploadSocialAssetBufferToStorage(
    {
      buffer,
      filename: safeSocialAssetFilename(`runway-${job.id || job.provider_task_id || "output"}.${extension}`, mimeType),
      mime_type: mimeType,
      storage_prefix: "runway"
    },
    env,
    fetchImpl
  );
  return {
    ...storage,
    mime_type: mimeType,
    file_size_bytes: buffer.length
  };
}

async function resolveRunwayJobForAsset(body = {}) {
  const jobId = String(body.job_id || body.provider_job_id || "").trim();
  const projectId = String(body.project_id || "").trim();
  let project = null;
  let job = null;
  if (jobId) {
    job = await readSocialVideoJob(jobId);
  }
  if (!job && projectId) {
    project = await readSocialVideoProject(projectId);
    if (project?.last_job_id) job = await readSocialVideoJob(project.last_job_id);
  } else if (job?.project_id) {
    project = await readSocialVideoProject(job.project_id).catch(() => null);
  }
  return { job, project };
}

function runwayAssetMetadata(job = {}, project = {}, storage = null, copyError = null) {
  return normalizeSocialAssetMetadata({
    source: "social_video_studio",
    provider: "runway",
    project_id: job.project_id || project?.id || null,
    runway_job_id: job.id || null,
    provider_task_id: job.provider_task_id || null,
    runway_status: job.status || null,
    model: job.model || null,
    ratio: job.ratio || null,
    estimated_credits: job.estimated_credits || null,
    estimated_cost_usd: job.estimated_cost_usd || null,
    copied_to_storage: Boolean(storage?.public_url),
    storage_bucket: storage?.bucket || null,
    storage_path: storage?.storage_path || null,
    runway_result_url_hint: sanitizeRunwayOutputUrl(job.result_url),
    copy_error: copyError ? sanitizeMetaSecretText(copyError, 240) : null
  });
}

async function createSocialAssetFromRunway(body = {}, env = process.env) {
  const { job, project } = await resolveRunwayJobForAsset(body);
  if (!job?.id) return { status: 404, payload: { ok: false, error: "social_video_job_not_found" } };
  if (!runwayJobCompleted(job.status)) {
    return {
      status: 400,
      payload: {
        ok: false,
        error: "runway_job_not_completed",
        job: socialVideoJobPayload(job).job
      }
    };
  }

  let storage = null;
  let copyError = null;
  if (job.result_url) {
    try {
      storage = await copyRunwayOutputToSocialAssetStorage(job, env);
    } catch (error) {
      copyError = error.message || "runway_output_copy_failed";
    }
  } else {
    copyError = "runway_output_public_url_missing";
  }

  const title = socialSafeText(body.title || project?.title || `Runway ${job.id}`, 180);
  const result = await createSocialAsset({
    provider: "runway",
    provider_job_id: job.id,
    provider_asset_id: job.provider_task_id || null,
    media_type: "video",
    status: storage?.public_url ? "ready" : "processing",
    title,
    description: cleanNullable(body.description || project?.topic_label || null),
    public_url: storage?.public_url || null,
    thumbnail_url: null,
    duration_seconds: socialOptionalNumber(body.duration_seconds || job.duration_seconds),
    ratio: cleanNullable(job.ratio || project?.project_json?.format?.aspect_ratio || null),
    mime_type: storage?.mime_type || "video/mp4",
    file_size_bytes: storage?.file_size_bytes || null,
    license_status: "internal",
    usage_notes: cleanNullable(body.usage_notes || "Output Runway importado desde Social Video Studio"),
    source_prompt: cleanNullable(body.source_prompt || job.prompt_text || project?.project_json?.global_ai_prompt || null),
    metadata: runwayAssetMetadata(job, project, storage, copyError)
  });
  if (result.status) return { status: result.status, payload: { ok: false, error: result.error } };
  if (result.table_missing) return { status: 503, payload: { ok: false, error: "social_media_assets_table_missing", pending_sql: SOCIAL_MEDIA_ASSETS_SQL } };
  if (result.error) return { status: 500, payload: { ok: false, error: result.error } };
  if (job.project_id) {
    await safePatchSocialVideoProject(job.project_id, {
      status: result.asset?.status === "ready" ? "ai_clip_ready" : "ai_clip_queued",
      has_ai_clip: Boolean(job.result_url),
      last_job_id: job.id,
      failure: copyError || null
    }).catch(() => null);
  }
  return {
    status: 201,
    payload: {
      ok: true,
      asset: result.asset,
      storage: storage ? { bucket: storage.bucket, path: storage.storage_path, public_url: storage.public_url } : null,
      copied_to_storage: Boolean(storage?.public_url),
      warning: storage ? null : sanitizeMetaSecretText(copyError || "runway_output_not_copied", 240)
    }
  };
}

async function listSocialAssets(url = new URL("https://admin.local/?limit=50"), limitOverride) {
  const params = new URLSearchParams({
    select: "*",
    order: "created_at.desc",
    limit: String(clampLimit(limitOverride || url.searchParams.get("limit") || 50, 50, 100))
  });
  const provider = String(url.searchParams.get("provider") || "").trim().toLowerCase();
  const mediaType = String(url.searchParams.get("media_type") || url.searchParams.get("type") || "").trim().toLowerCase();
  const status = String(url.searchParams.get("status") || "").trim().toLowerCase();
  if (SOCIAL_ASSET_PROVIDERS.includes(provider)) params.set("provider", `eq.${provider}`);
  if (SOCIAL_ASSET_MEDIA_TYPES.includes(mediaType)) params.set("media_type", `eq.${mediaType}`);
  if (SOCIAL_ASSET_STATUSES.includes(status)) params.set("status", `eq.${status}`);
  try {
    const rows = await supabaseFetch(`social_media_assets?${params.toString()}`);
    return { assets: (Array.isArray(rows) ? rows : []).map(normalizeSocialAssetRow).filter(Boolean), table_missing: false, error: null };
  } catch (error) {
    return { assets: [], table_missing: socialAssetsTableMissing(error), error: sanitizeMetaSecretText(error.message || "social_assets_lookup_failed") };
  }
}

async function readSocialAsset(id) {
  if (!id) return null;
  const rows = await supabaseFetch(`social_media_assets?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
  return normalizeSocialAssetRow(Array.isArray(rows) ? rows[0] || null : rows);
}

async function createSocialAsset(input = {}) {
  const now = new Date().toISOString();
  const body = {
    ...normalizeSocialAssetInput(input),
    created_at: now,
    updated_at: now
  };
  const validationError = validateSocialAssetInput(body);
  if (validationError) return { asset: null, status: 400, error: validationError };
  try {
    const rows = await supabaseFetch("social_media_assets", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify([body])
    });
    return { asset: normalizeSocialAssetRow(Array.isArray(rows) ? rows[0] || null : rows), table_missing: false, error: null };
  } catch (error) {
    return { asset: null, table_missing: socialAssetsTableMissing(error), error: sanitizeMetaSecretText(error.message || "social_asset_create_failed") };
  }
}

async function patchSocialAsset(id, patch = {}) {
  const rows = await supabaseFetch(`social_media_assets?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() })
  });
  return normalizeSocialAssetRow(Array.isArray(rows) ? rows[0] || null : rows);
}

async function updateSocialAsset(id, input = {}) {
  const current = await readSocialAsset(id);
  if (!current?.id) return { status: 404, payload: { ok: false, error: "social_asset_not_found" } };
  const patch = normalizeSocialAssetInput(input, current);
  const validationError = validateSocialAssetInput(patch);
  if (validationError) return { status: 400, payload: { ok: false, error: validationError, asset: current } };
  const asset = await patchSocialAsset(id, patch);
  return { status: 200, payload: { ok: true, asset } };
}

async function transitionSocialAsset(id, action) {
  const asset = await readSocialAsset(id);
  if (!asset?.id) return { status: 404, payload: { ok: false, error: "social_asset_not_found" } };
  if (action === "archive") {
    const updated = await patchSocialAsset(id, { status: "archived" });
    return { status: 200, payload: { ok: true, asset: updated } };
  }
  if (action === "validate" || action === "ready") {
    const validationError = validateSocialAssetInput({ ...asset, status: "ready" });
    if (validationError) return { status: 400, payload: { ok: false, error: validationError, asset } };
    const updated = await patchSocialAsset(id, { status: "ready" });
    return { status: 200, payload: { ok: true, asset: updated } };
  }
  return { status: 400, payload: { ok: false, error: "social_asset_action_not_supported" } };
}

function normalizeSocialPostRow(row = {}) {
  if (!row) return null;
  const platform = normalizeSocialPlatform(row.platform);
  const metaResponse = sanitizeMetaPayload(row.meta_response || {});
  const mediaAsset = row.media_asset || row.social_media_assets || null;
  return {
    id: row.id || null,
    platform,
    channel: platform,
    format: normalizeSocialFormat(row.format),
    status: normalizeSocialPostStatus(row.status),
    source: socialSafeText(row.source || "manual", 120),
    topic: socialSafeText(row.topic || "", 180),
    caption: socialSafeText(row.caption || "", 2200),
    media_url: row.media_url ? socialSafeText(row.media_url, 1000) : "",
    image_url: row.media_url ? socialSafeText(row.media_url, 1000) : "",
    media_asset_id: row.media_asset_id || null,
    media_asset: mediaAsset ? normalizeSocialAssetRow(mediaAsset) : null,
    target_url: row.target_url ? socialSafeText(row.target_url, 1000) : "",
    source_url: row.target_url ? socialSafeText(row.target_url, 1000) : "",
    utm_source: socialSafeText(row.utm_source || platform, 120),
    utm_campaign: socialSafeText(row.utm_campaign || "organic_social", 120),
    scheduled_at: row.scheduled_at || null,
    published_at: row.published_at || null,
    published_media_id: row.published_media_id || metaResponse.published_media_id || metaResponse.id || null,
    error_message: row.error_message ? socialSafeText(row.error_message, 500) : null,
    meta_response: metaResponse,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    approved_at: row.approved_at || null,
    approved_by: row.approved_by || null
  };
}

function socialPostsTableMissing(error) {
  return /social_posts/i.test(String(error?.message || error || ""));
}

async function listSocialPosts(url = new URL("https://admin.local/?limit=50"), limitOverride) {
  const params = new URLSearchParams({
    select: "*",
    order: "created_at.desc",
    limit: String(clampLimit(limitOverride || url.searchParams.get("limit") || 50, 50, 100))
  });
  const platform = String(url.searchParams.get("platform") || "").trim().toLowerCase();
  const status = String(url.searchParams.get("status") || "").trim().toLowerCase();
  if (SOCIAL_POST_PLATFORMS.includes(platform)) params.set("platform", `eq.${platform}`);
  if (SOCIAL_POST_STATUSES.includes(status)) params.set("status", `eq.${status}`);
  try {
    const rows = await supabaseFetch(`social_posts?${params.toString()}`);
    return { posts: (Array.isArray(rows) ? rows : []).map(normalizeSocialPostRow).filter(Boolean), table_missing: false, error: null };
  } catch (error) {
    return { posts: [], table_missing: socialPostsTableMissing(error), error: sanitizeMetaSecretText(error.message || "social_posts_lookup_failed") };
  }
}

function normalizeSocialPostInput(input = {}, current = {}) {
  const platform = normalizeSocialPlatform(input.platform ?? current.platform);
  const format = normalizeSocialFormat(input.format ?? current.format);
  return {
    platform,
    format,
    source: socialSafeText(input.source ?? current.source ?? "manual", 120) || "manual",
    topic: socialSafeText(input.topic ?? current.topic ?? "", 180),
    caption: socialSafeText(input.caption ?? current.caption ?? "", 2200),
    media_url: cleanNullable(input.media_url ?? current.media_url ?? ""),
    media_asset_id: cleanNullable(input.media_asset_id ?? current.media_asset_id ?? null),
    target_url: cleanNullable(input.target_url ?? current.target_url ?? ""),
    utm_source: socialSafeText(input.utm_source ?? current.utm_source ?? platform, 120) || platform,
    utm_campaign: socialSafeText(input.utm_campaign ?? current.utm_campaign ?? "organic_social", 120) || "organic_social",
    scheduled_at: cleanNullable(input.scheduled_at ?? current.scheduled_at ?? null)
  };
}

async function createSocialPost(input = {}) {
  const now = new Date().toISOString();
  const body = {
    ...normalizeSocialPostInput(input),
    status: "draft",
    created_at: now,
    updated_at: now
  };
  try {
    const rows = await supabaseFetch("social_posts", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify([body])
    });
    return { post: normalizeSocialPostRow(Array.isArray(rows) ? rows[0] || null : rows), table_missing: false, error: null };
  } catch (error) {
    return { post: null, table_missing: socialPostsTableMissing(error), error: sanitizeMetaSecretText(error.message || "social_post_create_failed") };
  }
}

async function readSocialPost(id) {
  const rows = await supabaseFetch(`social_posts?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
  return normalizeSocialPostRow(Array.isArray(rows) ? rows[0] || null : rows);
}

async function patchSocialPost(id, patch = {}) {
  const rows = await supabaseFetch(`social_posts?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() })
  });
  return normalizeSocialPostRow(Array.isArray(rows) ? rows[0] || null : rows);
}

async function updateSocialPost(id, input = {}) {
  const current = await readSocialPost(id);
  if (!current?.id) return { status: 404, payload: { ok: false, error: "social_post_not_found" } };
  const patch = normalizeSocialPostInput(input, current);
  const post = await patchSocialPost(id, patch);
  return { status: 200, payload: { ok: true, post } };
}

function publicHttpsMediaUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && !/\.vercel\.app$/i.test(url.hostname);
  } catch (error) {
    return false;
  }
}

function normalizedSocialMimeType(value) {
  return String(value || "").split(";")[0].trim().toLowerCase();
}

function inferSocialMimeTypeFromUrl(value) {
  try {
    const pathname = new URL(String(value || "")).pathname.toLowerCase();
    if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
    if (pathname.endsWith(".png")) return "image/png";
    if (pathname.endsWith(".webp")) return "image/webp";
    if (pathname.endsWith(".mp4")) return "video/mp4";
    if (pathname.endsWith(".webm")) return "video/webm";
  } catch (error) {
    return "";
  }
  return "";
}

function socialAssetMimeType(asset = {}) {
  return normalizedSocialMimeType(asset.mime_type) || inferSocialMimeTypeFromUrl(asset.public_url);
}

function socialAssetCompatibilityBase(asset = {}) {
  const mimeType = socialAssetMimeType(asset);
  return {
    asset_id: asset?.id || null,
    media_type: asset?.media_type || "",
    status: asset?.status || "",
    public_url_https: publicHttpsMediaUrl(asset?.public_url),
    mime_type: mimeType || null,
    duration_seconds: socialOptionalNumber(asset?.duration_seconds),
    ratio: asset?.ratio || null
  };
}

function socialAssetCompatibilityResult(channel, status, publishable, reason, checks = {}) {
  return {
    channel,
    status,
    publishable,
    reason,
    checks
  };
}

function evaluateSocialAssetCompatibility(asset = {}, channelInput = "instagram") {
  const channel = normalizeSocialPlatform(channelInput);
  const checks = socialAssetCompatibilityBase(asset);
  if (channel === "facebook") {
    return socialAssetCompatibilityResult(channel, "pending_page_permissions", false, "pending_page_permissions", checks);
  }
  if (channel === "linkedin" || channel === "tiktok") {
    return socialAssetCompatibilityResult(channel, "pending_integration", false, "pending_integration", checks);
  }
  if (!asset?.id) {
    return socialAssetCompatibilityResult(channel, "incompatible", false, "social_media_asset_not_found", checks);
  }
  if (asset.status !== "ready") {
    return socialAssetCompatibilityResult(channel, "incompatible", false, "social_media_asset_not_ready", checks);
  }
  if (!checks.public_url_https) {
    return socialAssetCompatibilityResult(channel, "incompatible", false, "social_media_asset_public_url_required", checks);
  }
  if (asset.media_type === "image") {
    if (!checks.mime_type) {
      return socialAssetCompatibilityResult(channel, "incompatible", false, "social_instagram_mime_type_required", checks);
    }
    if (!SOCIAL_INSTAGRAM_IMAGE_MIME_TYPES.has(checks.mime_type)) {
      return socialAssetCompatibilityResult(channel, "incompatible", false, "social_instagram_image_mime_not_supported", checks);
    }
    return socialAssetCompatibilityResult(channel, "compatible", true, "social_instagram_image_compatible", checks);
  }
  if (asset.media_type === "video") {
    if (!checks.mime_type) {
      return socialAssetCompatibilityResult(channel, "incompatible", false, "social_instagram_mime_type_required", checks);
    }
    if (!SOCIAL_INSTAGRAM_VIDEO_MIME_TYPES.has(checks.mime_type)) {
      return socialAssetCompatibilityResult(channel, "incompatible", false, "social_instagram_video_mime_not_supported", checks);
    }
    if (!checks.duration_seconds) {
      return socialAssetCompatibilityResult(channel, "incompatible", false, "social_instagram_video_duration_required", checks);
    }
    return socialAssetCompatibilityResult(channel, "compatible_pending_video_publish_support", false, "compatible_pending_video_publish_support", checks);
  }
  return socialAssetCompatibilityResult(channel, "incompatible", false, "social_instagram_media_type_not_supported", checks);
}

function buildSocialAssetCompatibility(asset = {}) {
  return Object.fromEntries(
    SOCIAL_POST_PLATFORMS.map((channel) => [channel, evaluateSocialAssetCompatibility(asset, channel)])
  );
}

async function resolveSocialPostMedia(post = {}) {
  const mediaAssetId = post.media_asset_id || post.media_asset?.id || "";
  if (!mediaAssetId) {
    return { ok: true, post, asset: null, media_url: post.media_url || "" };
  }
  let asset = post.media_asset || null;
  if (!asset?.id) {
    try {
      asset = await readSocialAsset(mediaAssetId);
    } catch (error) {
      return { ok: false, reason: socialAssetsTableMissing(error) ? "social_media_assets_table_missing" : "social_media_asset_not_found", post };
    }
  }
  if (!asset?.id) return { ok: false, reason: "social_media_asset_not_found", post };
  asset = normalizeSocialAssetRow(asset);
  const compatibility = evaluateSocialAssetCompatibility(asset, post.platform);
  if (!compatibility.publishable) {
    return {
      ok: false,
      reason: compatibility.reason,
      post: { ...post, media_asset: asset, asset_compatibility: compatibility },
      asset,
      compatibility
    };
  }
  return {
    ok: true,
    asset,
    media_url: asset.public_url,
    post: {
      ...post,
      media_url: asset.public_url,
      image_url: asset.public_url,
      media_asset: asset,
      asset_compatibility: compatibility
    }
  };
}

async function readSocialPublishingChannels() {
  const [metaConnectionState, metaLastAttemptState, linkedinConnectionState, linkedinSettingsState, linkedinPostsState] = await Promise.all([
    readMetaConnectionState(),
    latestMetaOrganicPost(),
    readLinkedInConnectionState(),
    readLinkedInSettings(),
    listLinkedInPosts(new URL("https://admin.local/?limit=1"), 1)
  ]);
  const metaOrganic = metaOrganicStatusPayload(metaConnectionState, metaLastAttemptState);
  return {
    metaConnectionState,
    metaOrganic,
    channels: {
      instagram: buildInstagramSocialChannel(metaOrganic),
      facebook: buildFacebookSocialChannel(metaOrganic),
      linkedin: buildLinkedInSocialChannel(linkedinConnectionState, linkedinSettingsState, linkedinPostsState),
      tiktok: buildTikTokSocialChannel()
    }
  };
}

function socialChannelBlockReason(post, channels = {}) {
  const platform = normalizeSocialPlatform(post?.platform);
  const channel = channels[platform] || {};
  if (platform === "facebook") return "pending_page_permissions";
  if (platform === "linkedin") return "pending_integration";
  if (platform === "tiktok") return "pending_integration";
  if (!(channel.status === "validated" || channel.publishing === "validated")) return "instagram_not_validated";
  return null;
}

function socialManualPublishValidation(post, channels = {}) {
  if (!post?.id) return { ok: false, reason: "social_post_not_found" };
  const status = normalizeSocialPostStatus(post.status);
  if (["cancelled", "rejected", "published", "publishing"].includes(status)) {
    return { ok: false, reason: `social_post_${status}` };
  }
  if (!SOCIAL_MANUAL_PUBLISH_STATUSES.includes(status)) return { ok: false, reason: "social_post_status_not_publishable" };
  if (!String(post.caption || "").trim()) return { ok: false, reason: "social_caption_required" };
  if (!publicHttpsMediaUrl(post.media_url)) return { ok: false, reason: "social_public_https_media_url_required" };
  const channelReason = socialChannelBlockReason(post, channels);
  if (channelReason) return { ok: false, reason: channelReason };
  return { ok: true, reason: null };
}

async function transitionSocialPost(id, action, body = {}) {
  const post = await readSocialPost(id);
  if (!post?.id) return { status: 404, payload: { ok: false, error: "social_post_not_found" } };
  if (action === "needs-review" || action === "needs_review" || action === "request_review") {
    const updated = await patchSocialPost(id, { status: "needs_review", error_message: null });
    return { status: 200, payload: { ok: true, post: updated } };
  }
  if (action === "approve") {
    const nextStatus = post.scheduled_at ? "scheduled" : "approved";
    const updated = await patchSocialPost(id, {
      status: nextStatus,
      approved_at: new Date().toISOString(),
      approved_by: socialSafeText(body.approved_by || "backoffice", 120),
      error_message: null
    });
    return { status: 200, payload: { ok: true, post: updated } };
  }
  if (action === "reject") {
    const updated = await patchSocialPost(id, {
      status: "rejected",
      error_message: socialSafeText(body.reason || "rejected_by_backoffice", 300)
    });
    return { status: 200, payload: { ok: true, post: updated } };
  }
  if (action === "cancel") {
    const updated = await patchSocialPost(id, {
      status: "cancelled",
      error_message: socialSafeText(body.reason || "cancelled_by_backoffice", 300)
    });
    return { status: 200, payload: { ok: true, post: updated } };
  }
  return { status: 400, payload: { ok: false, error: "social_action_not_supported" } };
}

async function publishSocialPostNow(id) {
  const post = await readSocialPost(id);
  if (!post?.id) return { status: 404, payload: { ok: false, error: "social_post_not_found" } };
  const { channels, metaConnectionState } = await readSocialPublishingChannels();
  const mediaResolution = await resolveSocialPostMedia(post);
  if (!mediaResolution.ok) {
    return { status: 400, payload: { ok: false, error: mediaResolution.reason, post: mediaResolution.post || post } };
  }
  const publishablePost = mediaResolution.post;
  const validation = socialManualPublishValidation(publishablePost, channels);
  if (!validation.ok) {
    return { status: 400, payload: { ok: false, error: validation.reason, post: publishablePost } };
  }
  if (publishablePost.platform !== "instagram") {
    return { status: 400, payload: { ok: false, error: socialChannelBlockReason(publishablePost, channels) || "social_channel_not_validated", post: publishablePost } };
  }
  const connection = metaConnectionState.connection;
  let accessToken;
  try {
    accessToken = await loadMetaInstagramAccessToken(connection);
  } catch (error) {
    return { status: 400, payload: { ok: false, error: sanitizeMetaSecretText(error.message || "meta_instagram_access_token_missing"), post: publishablePost } };
  }
  await patchSocialPost(id, { status: "publishing", error_message: null });
  try {
    const config = metaConfig(process.env);
    const result = await publishMetaToPlatform({
      platform: "instagram",
      accessToken,
      instagramBusinessAccountId: connection.instagram_business_account_id || config.instagramBusinessAccountId || config.instagramPublishAccountId,
      caption: publishablePost.caption,
      imageUrl: publishablePost.media_url,
      link: publishablePost.target_url || "",
      env: process.env
    });
    const updated = await patchSocialPost(id, {
      status: "published",
      published_at: new Date().toISOString(),
      published_media_id: result.external_post_id || result.meta_response?.published_media_id || null,
      meta_response: result.meta_response,
      error_message: null
    });
    return { status: 200, payload: { ok: true, post: updated, result: sanitizeMetaPayload(result) } };
  } catch (error) {
    const message = sanitizeMetaSecretText(error.message || "social_instagram_publish_failed");
    const updated = await patchSocialPost(id, {
      status: "failed",
      error_message: message,
      meta_response: sanitizeMetaPayload(error.meta_response || error.payload || {})
    });
    return { status: 400, payload: { ok: false, error: message, post: updated } };
  }
}

async function handleSocialPosts(req, url) {
  if (req.method === "GET") {
    const result = await listSocialPosts(url);
    return {
      status: result.table_missing ? 200 : 200,
      payload: {
        ok: !result.error || result.table_missing,
        posts: result.posts,
        table_missing: result.table_missing,
        pending_sql: result.table_missing ? SOCIAL_POST_QUEUE_SQL : null,
        error: result.table_missing ? "social_posts_table_missing" : result.error
      }
    };
  }
  if (req.method === "POST") {
    const body = await readJsonBody(req);
    const action = String(url.searchParams.get("action") || body.action || "").trim();
    const id = String(url.searchParams.get("id") || body.id || "").trim();
    if (action) {
      if (!id) return { status: 400, payload: { ok: false, error: "social_post_id_required" } };
      if (action === "publish-now" || action === "publish_now") return publishSocialPostNow(id);
      return transitionSocialPost(id, action, body);
    }
    const result = await createSocialPost(body);
    if (result.table_missing) return { status: 503, payload: { ok: false, error: "social_posts_table_missing", pending_sql: SOCIAL_POST_QUEUE_SQL } };
    if (result.error) return { status: 500, payload: { ok: false, error: result.error } };
    return { status: 201, payload: { ok: true, post: result.post } };
  }
  if (req.method === "PATCH") {
    const id = String(url.searchParams.get("id") || "").trim();
    if (!id) return { status: 400, payload: { ok: false, error: "social_post_id_required" } };
    return updateSocialPost(id, await readJsonBody(req));
  }
  return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
}

async function handleSocialAssets(req, url) {
  if (req.method === "GET") {
    const result = await listSocialAssets(url);
    return {
      status: 200,
      payload: {
        ok: !result.error || result.table_missing,
        assets: result.assets,
        table_missing: result.table_missing,
        pending_sql: result.table_missing ? SOCIAL_MEDIA_ASSETS_SQL : null,
        error: result.table_missing ? "social_media_assets_table_missing" : result.error
      }
    };
  }
  if (req.method === "POST") {
    const body = await readJsonBody(req);
    const action = String(url.searchParams.get("action") || body.action || "").trim();
    const id = String(url.searchParams.get("id") || body.id || "").trim();
    if (action) {
      if (!id) return { status: 400, payload: { ok: false, error: "social_asset_id_required" } };
      return transitionSocialAsset(id, action);
    }
    const result = await createSocialAsset(body);
    if (result.status) return { status: result.status, payload: { ok: false, error: result.error } };
    if (result.table_missing) return { status: 503, payload: { ok: false, error: "social_media_assets_table_missing", pending_sql: SOCIAL_MEDIA_ASSETS_SQL } };
    if (result.error) return { status: 500, payload: { ok: false, error: result.error } };
    return { status: 201, payload: { ok: true, asset: result.asset } };
  }
  if (req.method === "PATCH") {
    const id = String(url.searchParams.get("id") || "").trim();
    if (!id) return { status: 400, payload: { ok: false, error: "social_asset_id_required" } };
    return updateSocialAsset(id, await readJsonBody(req));
  }
  return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
}

async function handleSocialAssetUpload(req) {
  if (req.method !== "POST") return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
  return uploadSocialAsset(await readJsonBody(req));
}

async function handleSocialAssetFromRunway(req) {
  if (req.method !== "POST") return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
  return createSocialAssetFromRunway(await readJsonBody(req));
}

async function handleLinkedInPostAction(body = {}) {
  const id = body.id;
  const action = String(body.action || "").trim();
  if (!id && action !== "generate_daily") return { status: 400, payload: { ok: false, error: "linkedin_post_id_required" } };

  if (action === "generate_daily") {
    const result = await generateDailyLinkedInDraft({ publishIfAllowed: body.publishIfAllowed === true });
    return { status: 200, payload: result };
  }
  if (action === "generate_image") {
    const post = await readLinkedInPost(id);
    const image_url = generateLinkedInImage(post);
    const updated = await patchLinkedInPost(id, { image_url, image_path: `linkedin/${id}.svg`, error_message: null });
    return { status: 200, payload: { ok: true, post: updated } };
  }
  if (action === "regenerate_copy") {
    const settings = (await readLinkedInSettings()).settings;
    const generated = generateLinkedInPost({ post_type: settings.active_post_type, content_mode: body.content_mode || settings.content_mode, source_type: "manual" }, settings, new Date(Date.now() + 86400000));
    const updated = await patchLinkedInPost(id, {
      post_type: generated.post_type,
      title: generated.title,
      headline: generated.headline,
      price_display: generated.price_display,
      hidden_costs: generated.hidden_costs,
      hook: generated.hook,
      copy: generated.copy,
      body: generated.body,
      cta: generated.cta,
      hashtags: generated.hashtags,
      image_url: generated.image_url,
      image_prompt: generated.image_prompt,
      linkedin_company_url: generated.linkedin_company_url,
      organization_urn: generated.organization_urn,
      city: generated.city,
      source_reference: generated.source_reference,
      status: "ready",
      error_message: null
    });
    return { status: 200, payload: { ok: true, post: updated } };
  }
  if (action === "approve") {
    const post = await patchLinkedInPost(id, {
      approved_by_user_id: "backoffice",
      approved_at: new Date().toISOString(),
      status: body.scheduled_at ? "scheduled" : "pending_review",
      scheduled_at: body.scheduled_at || undefined,
      error_message: null
    });
    return { status: 200, payload: { ok: true, post } };
  }
  if (action === "schedule") {
    const settings = (await readLinkedInSettings()).settings;
    const post = await patchLinkedInPost(id, {
      scheduled_at: body.scheduled_at || nextScheduledAt(settings),
      status: "scheduled",
      error_message: null
    });
    return { status: 200, payload: { ok: true, post } };
  }
  if (action === "publish_now") {
    const post = await publishLinkedInPostById(id);
    return { status: post.status === "published" ? 200 : 400, payload: { ok: post.status === "published", post, error: post.error_message || null } };
  }
  if (action === "mark_manually_published") {
    const post = await patchLinkedInPost(id, {
      status: "manually_published",
      manually_published_at: new Date().toISOString(),
      error_message: null
    });
    return { status: 200, payload: { ok: true, post } };
  }
  if (action === "retry") {
    const post = await patchLinkedInPost(id, { status: "pending_review", error_message: null });
    return { status: 200, payload: { ok: true, post } };
  }
  if (action === "cancel") {
    const post = await patchLinkedInPost(id, { status: "cancelled" });
    return { status: 200, payload: { ok: true, post } };
  }
  return { status: 400, payload: { ok: false, error: "linkedin_action_not_supported" } };
}

async function handleLinkedIn(req, url, resource) {
  if (resource === "linkedin") return handleLinkedInDashboard(url);
  if (resource === "linkedin/daily") return handleLinkedInDaily(req);
  if (resource === "linkedin/autopublisher/run") return handleLinkedInDaily(req);
  if (resource === "linkedin/connect") return handleLinkedInConnect(req, url);
  if (resource === "linkedin/callback") return handleLinkedInCallback(req);
  if (resource === "linkedin/disconnect") return handleLinkedInDisconnect(req);
  if (resource === "linkedin/test-connection") return handleLinkedInTestConnection(req);
  if (resource === "linkedin/settings") return handleLinkedInSettings(req);
  if (resource === "linkedin/posts") return handleLinkedInPosts(req, url);
  return { status: 404, payload: { ok: false, error: "linkedin_resource_not_found", resource } };
}

function normalizeMetaPostRow(row = {}) {
  if (!row) return null;
  return {
    ...row,
    meta_response: parseJsonMaybe(row.meta_response, row.meta_response || null)
  };
}

async function readMetaConnectionState() {
  try {
    const rows = await supabaseFetch("marketing_meta_connections?select=*&order=created_at.asc&limit=1");
    return { connection: Array.isArray(rows) ? rows[0] || null : rows, table_missing: false, error: null };
  } catch (error) {
    return { connection: null, table_missing: /marketing_meta_connections/.test(error.message), error: error.message };
  }
}

async function saveMetaConnection(patch = {}) {
  const current = await readMetaConnectionState();
  const body = { ...patch, updated_at: new Date().toISOString() };
  const rows = current.connection?.id
    ? await supabaseFetch(`marketing_meta_connections?id=eq.${encodeURIComponent(current.connection.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(body)
      })
    : await supabaseFetch("marketing_meta_connections", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify([{ ...body, created_at: new Date().toISOString() }])
      });
  return Array.isArray(rows) ? rows[0] || null : rows;
}

async function readMetaSettings() {
  try {
    const rows = await supabaseFetch("marketing_meta_settings?select=*&order=created_at.asc&limit=1");
    const row = Array.isArray(rows) ? rows[0] || null : rows;
    return { row, settings: normalizeMetaSettings(row || defaultMetaSettings()), table_missing: false, error: null };
  } catch (error) {
    return {
      row: null,
      settings: defaultMetaSettings(),
      table_missing: /marketing_meta_settings/.test(error.message),
      error: error.message
    };
  }
}

async function saveMetaSettings(input = {}) {
  const current = await readMetaSettings();
  const settings = normalizeMetaSettings({ ...current.settings, ...input });
  const body = {
    ...settings,
    updated_at: new Date().toISOString()
  };
  const rows = current.row?.id
    ? await supabaseFetch(`marketing_meta_settings?id=eq.${encodeURIComponent(current.row.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(body)
      })
    : await supabaseFetch("marketing_meta_settings", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify([{ ...body, created_at: new Date().toISOString() }])
      });
  const row = Array.isArray(rows) ? rows[0] || null : rows;
  return { row, settings: normalizeMetaSettings(row || settings) };
}

async function listMetaPosts(url, limitOverride) {
  const params = new URLSearchParams({
    select: "*",
    order: "created_at.desc",
    limit: String(clampLimit(limitOverride || url.searchParams.get("limit") || 10, 10, 100))
  });
  const platform = String(url.searchParams.get("platform") || "").trim();
  if (META_PLATFORMS.includes(platform)) params.set("platform", `eq.${platform}`);
  try {
    const rows = await supabaseFetch(`marketing_meta_posts?${params.toString()}`);
    return { posts: (Array.isArray(rows) ? rows : []).map(normalizeMetaPostRow), table_missing: false, error: null };
  } catch (error) {
    return { posts: [], table_missing: /marketing_meta_posts/.test(error.message), error: error.message };
  }
}

function metaPostsSummary(posts = []) {
  const counts = countBy(posts, "status");
  return {
    total: posts.length,
    draft: counts.draft || 0,
    queued: counts.queued || 0,
    publishing: counts.publishing || 0,
    published: counts.published || 0,
    failed: counts.failed || 0,
    skipped: counts.skipped || 0,
    facebook: posts.filter((post) => post.platform === "facebook").length,
    instagram: posts.filter((post) => post.platform === "instagram").length
  };
}

async function listMetaRuns(limit = 5) {
  try {
    const rows = await supabaseFetch(`meta_autopublisher_runs?select=*&order=created_at.desc&limit=${encodeURIComponent(String(limit))}`);
    return { runs: Array.isArray(rows) ? rows : [], table_missing: false, error: null };
  } catch (error) {
    return { runs: [], table_missing: /meta_autopublisher_runs/.test(error.message), error: error.message };
  }
}

async function latestMetaOrganicPost() {
  try {
    const params = new URLSearchParams({
      select: "*",
      source_type: `eq.${META_ORGANIC_SOURCE_TYPE}`,
      order: "created_at.desc",
      limit: "1"
    });
    const rows = await supabaseFetch(`marketing_meta_posts?${params.toString()}`);
    return { post: normalizeMetaPostRow(Array.isArray(rows) ? rows[0] || null : rows), table_missing: false, error: null };
  } catch (error) {
    return {
      post: null,
      table_missing: /marketing_meta_posts/.test(error.message),
      error: sanitizeMetaSecretText(error.message || error)
    };
  }
}

async function recordMetaOrganicPost(platform, payload = {}, patch = {}) {
  if (!hasSupabaseConfig()) return { post: null, persisted: false, table_missing: false, error: "supabase_not_configured" };
  const row = {
    source_type: META_ORGANIC_SOURCE_TYPE,
    source_slug: "organic-test",
    source_url: payload.source_url || payload.link || metaConfig(process.env).siteUrl,
    platform,
    status: patch.status || "failed",
    caption: payload.caption || "",
    image_url: payload.image_url || null,
    published_url: patch.published_url || null,
    external_post_id: patch.external_post_id || null,
    published_at: patch.published_at || null,
    error_message: patch.error_message || null,
    utm_source: platform,
    utm_medium: "social",
    utm_campaign: "organic_publish_spike",
    city: null,
    template_type: "organic_test",
    meta_response: patch.meta_response || null
  };
  try {
    const rows = await supabaseFetch("marketing_meta_posts", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify([row])
    });
    return { post: normalizeMetaPostRow(Array.isArray(rows) ? rows[0] || null : rows), persisted: true, table_missing: false, error: null };
  } catch (error) {
    return {
      post: null,
      persisted: false,
      table_missing: /marketing_meta_posts/.test(error.message),
      error: sanitizeMetaSecretText(error.message || error)
    };
  }
}

function selectedMetaPageFromPages(pages = [], env = process.env) {
  const config = metaConfig(env);
  if (config.facebookPageId) return selectManagedPage(pages, config.facebookPageId);
  if (config.facebookPageName) {
    const wanted = config.facebookPageName.trim().toLowerCase();
    const byName = pages.find((page) => String(page.name || "").trim().toLowerCase() === wanted);
    if (byName) return byName;
  }
  const inmoradarPage = pages.find((page) => /inmoradar/i.test(String(page.name || "")));
  if (inmoradarPage) return inmoradarPage;
  return pages.length === 1 ? pages[0] : null;
}

async function saveDetectedMetaOrganicConnection(token, pages = [], target = "instagram") {
  const currentState = await readMetaConnectionState();
  const current = currentState.connection || {};
  const normalizedTarget = normalizeOAuthTarget(target);
  const page = selectedMetaPageFromPages(pages);
  const instagram = page?.instagram_business_account || null;
  const config = metaConfig(process.env);
  const pageMissingReason = config.facebookPageId && !page ? "meta_configured_page_not_found" : "meta_page_selection_required";
  const instagramAccountId = normalizedTarget === "instagram"
    ? token.user_id || current.instagram_business_account_id || config.instagramBusinessAccountId || null
    : instagram?.id || current.instagram_business_account_id || config.instagramBusinessAccountId || null;
  const facebookPageId = page?.id || current.facebook_page_id || null;
  const facebookPageName = page?.name || current.facebook_page_name || null;
  const mergedScopes = [...new Set([...(Array.isArray(current.scopes) ? current.scopes : []), ...(Array.isArray(token.scopes) ? token.scopes : [])])];
  const hasPageToken = page?.access_token || current.page_access_token_encrypted;
  const connected = normalizedTarget === "facebook"
    ? Boolean(facebookPageId && hasPageToken)
    : Boolean(instagramAccountId && token.access_token);
  const connection = await saveMetaConnection({
    status: connected ? "connected" : normalizedTarget === "facebook" ? "needs_page" : "needs_instagram",
    facebook_page_id: facebookPageId,
    facebook_page_name: facebookPageName,
    instagram_business_account_id: instagramAccountId,
    access_token_encrypted: current.access_token_encrypted || encryptMetaToken(token.access_token),
    user_access_token_encrypted: normalizedTarget === "facebook"
      ? current.user_access_token_encrypted || encryptMetaToken(token.access_token)
      : encryptMetaToken(token.access_token),
    page_access_token_encrypted: page?.access_token ? encryptMetaToken(page.access_token) : current.page_access_token_encrypted || null,
    token_expires_at: token.token_expires_at,
    scopes: mergedScopes,
    last_error: connected ? null : normalizedTarget === "facebook" ? pageMissingReason : "missing_instagram_business_account_id"
  });
  return { connection, page };
}

function metaOrganicStatusPayload(connectionState, lastAttemptState = {}, extra = {}) {
  const summary = summarizeMetaConnection(connectionState.connection, process.env);
  const lastAttempt = lastAttemptState.post || null;
  const lastMetaResponse = lastAttempt?.meta_response || {};
  const publishedMediaId = lastMetaResponse.published_media_id || lastAttempt?.external_post_id || lastMetaResponse.id || null;
  const instagramPublishingValidated =
    lastAttempt?.platform === "instagram" &&
    lastAttempt?.status === "published" &&
    Boolean(publishedMediaId);
  return {
    ok: true,
    connected: summary.status === "connected",
    status: summary.status,
    connection: summary,
    permissions: summary.scopes,
    missing_scopes: summary.missing_scopes,
    facebook_page_id: summary.facebook_page_id,
    facebook_page_name: summary.facebook_page_name,
    instagram_account_id: summary.instagram_business_account_id,
    instagram_publishing: {
      status: instagramPublishingValidated ? "validated" : "pending_manual_test",
      validated: instagramPublishingValidated,
      published_media_id: publishedMediaId,
      last_attempt_at: lastAttempt?.published_at || lastAttempt?.created_at || null
    },
    facebook_page_publishing: {
      status: summary.facebook_publish_available ? "available" : "pending_page_permissions",
      available: summary.facebook_publish_available
    },
    last_error: summary.last_error || connectionState.error || null,
    last_attempt: lastAttempt,
    env: metaEnvStatus(process.env),
    organic_env: validateMetaOrganicEnv(process.env),
    storage: {
      connection_table_missing: connectionState.table_missing,
      posts_table_missing: lastAttemptState.table_missing,
      connection_error: connectionState.error,
      posts_error: lastAttemptState.error
    },
    ...extra
  };
}

function isRecentIso(value, days = 7, now = new Date()) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  const end = new Date(now).getTime();
  if (!Number.isFinite(timestamp) || !Number.isFinite(end)) return false;
  return timestamp >= end - days * 86400000 && timestamp <= end + 60000;
}

function socialSafeText(value, maxLength = 500) {
  if (value === null || value === undefined || value === "") return "";
  return sanitizeMetaSecretText(sanitizeErrorMessage(value || "", maxLength), maxLength);
}

function socialPublishedMediaId(post = {}) {
  const response = post.meta_response || {};
  return post.published_media_id || response.published_media_id || post.external_post_id || response.id || null;
}

function socialPostDate(post = {}) {
  return post.published_at || post.manually_published_at || post.scheduled_at || post.created_at || null;
}

function socialPostPreview(post = {}, channel = post.platform || "linkedin") {
  const caption = post.caption || post.text || post.body || post.hook || "";
  const mediaUrl = post.media_url || post.image_url || "";
  const targetUrl = post.target_url || post.source_url || post.destination_url || "";
  const mediaAsset = post.media_asset ? normalizeSocialAssetRow(post.media_asset) : null;
  return {
    id: post.id || null,
    channel,
    date: socialPostDate(post),
    status: post.status || "draft",
    format: post.format || (mediaUrl ? "image" : channel === "linkedin" ? "text" : "link"),
    caption_preview: socialSafeText(caption, 180),
    caption: socialSafeText(caption, 2200),
    media_url: mediaUrl ? socialSafeText(mediaUrl, 1000) : null,
    image_url: mediaUrl ? socialSafeText(mediaUrl, 1000) : null,
    media_asset_id: post.media_asset_id || post.media_asset?.id || null,
    media_asset: mediaAsset,
    asset_compatibility: mediaAsset ? evaluateSocialAssetCompatibility(mediaAsset, channel) : null,
    target_url: targetUrl ? socialSafeText(targetUrl, 1000) : null,
    source_url: targetUrl ? socialSafeText(targetUrl, 1000) : null,
    topic: socialSafeText(post.topic || post.source_slug || "", 180),
    source: socialSafeText(post.source || post.source_type || "manual", 120),
    scheduled_at: post.scheduled_at || null,
    published_media_id: socialPublishedMediaId(post),
    error_message: post.error_message ? socialSafeText(post.error_message, 300) : null
  };
}

function socialLogEntry(input = {}) {
  return {
    channel: input.channel || "social",
    event: input.event || "status",
    status: input.status || "info",
    at: input.at || null,
    message: input.message ? socialSafeText(input.message, 500) : null,
    reference_id: input.reference_id || null,
    meta_response: input.meta_response ? sanitizeMetaPayload(input.meta_response) : null
  };
}

function socialMetricPlaceholder(channel, label = "Pendiente integracion") {
  return {
    channel,
    followers_current: null,
    followers_7d_ago: null,
    followers_30d_ago: null,
    follower_growth_7d: null,
    follower_growth_30d: null,
    posts_published: null,
    impressions: null,
    engagement: null,
    clicks: null,
    ctr: null,
    traffic_to_web: null,
    publishing_errors: null,
    status: label
  };
}

function sanitizeSocialOrganicPayload(payload = {}) {
  const lastAttempt = payload.last_attempt
    ? {
        ...payload.last_attempt,
        caption: socialSafeText(payload.last_attempt.caption, 180),
        error_message: payload.last_attempt.error_message ? socialSafeText(payload.last_attempt.error_message, 300) : null,
        meta_response: sanitizeMetaPayload(payload.last_attempt.meta_response || {})
      }
    : null;
  return {
    ...payload,
    connection: sanitizeMetaPayload(payload.connection || {}),
    last_attempt: lastAttempt
  };
}

function socialChannelStatusLabel(status) {
  return {
    not_configured: "No configurado",
    connected: "Conectado",
    validated: "Validado",
    pending_permissions: "Pendiente permisos",
    disabled: "Desactivado",
    error: "Error"
  }[status] || "Pendiente integracion";
}

function buildInstagramSocialChannel(metaOrganic = {}) {
  const connection = metaOrganic.connection || {};
  const missingScopes = metaOrganic.missing_scopes || connection.missing_scopes || [];
  const publishing = metaOrganic.instagram_publishing || {};
  const connected = metaOrganic.status === "connected" && Boolean(metaOrganic.instagram_account_id) && !missingScopes.length;
  const validated = publishing.validated === true;
  const status = validated
    ? "validated"
    : connected
      ? "connected"
      : missingScopes.length
        ? "pending_permissions"
        : metaOrganic.last_error
          ? "error"
          : "not_configured";
  return {
    key: "instagram",
    name: "Instagram",
    status,
    label: socialChannelStatusLabel(status),
    oauth: connected ? "connected" : socialChannelStatusLabel(status),
    publishing: validated ? "validated" : "pending_manual_test",
    business_status: validated ? "Publishing validado" : connected ? "OAuth conectado, pendiente test manual" : socialChannelStatusLabel(status),
    account_id: metaOrganic.instagram_account_id || null,
    permissions: metaOrganic.permissions || connection.scopes || [],
    missing_scopes: missingScopes,
    published_media_id: publishing.published_media_id || null,
    last_attempt_at: publishing.last_attempt_at || null,
    last_error: metaOrganic.last_error || null,
    actions: ["reconnect_instagram", "publish_test_instagram"]
  };
}

function buildFacebookSocialChannel(metaOrganic = {}) {
  const connection = metaOrganic.connection || {};
  const publishing = metaOrganic.facebook_page_publishing || {};
  const available = publishing.available === true || connection.facebook_publish_available === true;
  const hasPage = Boolean(metaOrganic.facebook_page_id || connection.facebook_page_id);
  const status = available ? "connected" : hasPage || metaOrganic.status === "connected" ? "pending_permissions" : "not_configured";
  return {
    key: "facebook",
    name: "Facebook",
    status,
    label: status === "pending_permissions" ? "Pendiente permisos Page" : socialChannelStatusLabel(status),
    oauth: hasPage ? "connected" : "not_configured",
    publishing: available ? "available" : "not_validated",
    business_status: available ? "Page lista para publicar" : "Pendiente permisos Page",
    page_id: metaOrganic.facebook_page_id || connection.facebook_page_id || null,
    page_name: metaOrganic.facebook_page_name || connection.facebook_page_name || null,
    last_error: metaOrganic.last_error || null,
    actions: ["connect_facebook_page"]
  };
}

function buildLinkedInSocialChannel(connectionState = {}, settingsState = {}, postsState = {}) {
  const connection = summarizeConnection(connectionState.connection, process.env);
  const settings = settingsState.settings || defaultLinkedInSettings();
  const tableMissing = connectionState.table_missing || settingsState.table_missing || postsState.table_missing;
  const config = linkedinConfig(process.env);
  const effectiveAutopost = config.autopostEnabled && settings.autopost_enabled === true;
  const connected = connection.status === "connected" || connection.automatic_available === true;
  const status = tableMissing
    ? "not_configured"
    : connected
      ? "connected"
      : effectiveAutopost
        ? "pending_permissions"
        : "disabled";
  return {
    key: "linkedin",
    name: "LinkedIn",
    status,
    label: tableMissing ? "Pendiente integracion" : connected ? "Conectado / draft only" : "Draft only / autopost_disabled",
    oauth: connected ? "connected" : "not_configured",
    publishing: "draft_only",
    business_status: "Draft/manual; no publicar desde Social",
    company_url: settings.linkedin_company_url || config.companyUrl || LINKEDIN_COMPANY_URL,
    last_attempt_at: postsState.posts?.[0]?.created_at || null,
    last_error: connection.last_error || connectionState.error || postsState.error || null,
    actions: []
  };
}

function buildTikTokSocialChannel() {
  return {
    key: "tiktok",
    name: "TikTok",
    status: "not_configured",
    label: "Pendiente integracion",
    oauth: "not_configured",
    publishing: "not_available",
    business_status: "Pendiente integracion",
    actions: []
  };
}

function socialReadonlySettings(metaSettings = {}, linkedinSettings = {}) {
  return {
    global: {
      autopublisher_enabled: false,
      autopublisher_status: "OFF",
      requires_human_approval: true,
      safe_mode: true,
      max_posts_per_day_total: 2,
      max_posts_per_day_per_channel: 1,
      allowed_hours: "09:00-20:00",
      avoid_weekends: true,
      default_utm_campaign: "organic_social",
      persistence: "read_only_defaults"
    },
    channels: {
      instagram: {
        max_per_day: 1,
        max_per_week: 5,
        manual_test_allowed: true,
        autopublishing: false,
        planned_formats: ["image", "carousel", "reel_future"]
      },
      facebook: {
        max_per_day: 1,
        max_per_week: 3,
        autopublishing: false,
        note: "Pendiente permisos Page"
      },
      linkedin: {
        max_per_day: Number(linkedinSettings.max_posts_per_day || 1),
        max_per_week: 3,
        autopublishing: false,
        note: "Draft/manual hasta nueva fase"
      },
      tiktok: {
        max_per_day: 0,
        max_per_week: 0,
        autopublishing: false,
        note: "Pendiente integracion"
      }
    },
    source_settings: {
      meta_autopost_enabled: metaSettings.autopost_enabled === true,
      linkedin_autopost_enabled: linkedinSettings.autopost_enabled === true
    }
  };
}

function buildSocialSummary({ channels = {}, socialPosts = [], now = new Date() } = {}) {
  const allPosts = socialPosts.map((post) => ({ ...post, channel: post.platform || post.channel || "social" }));
  const publishedStatuses = new Set(["published", "manually_published"]);
  const scheduledStatuses = new Set(["scheduled", "queued"]);
  const pendingStatuses = new Set(["pending_review", "draft", "image_pending", "ready"]);
  const queuedStatuses = new Set(["scheduled", "queued", "pending_review", "draft", "image_pending", "ready"]);
  const connectedChannels = Object.values(channels).filter((channel) => ["connected", "validated"].includes(channel.status)).length;
  const validatedChannels = Object.values(channels).filter((channel) => channel.status === "validated" || channel.publishing === "validated").length;
  const queuedPosts = allPosts.filter((post) => queuedStatuses.has(post.status)).length;
  const published7d = allPosts.filter((post) => publishedStatuses.has(post.status) && isRecentIso(socialPostDate(post), 7, now)).length;
  const scheduled = allPosts.filter((post) => scheduledStatuses.has(post.status)).length;
  const pendingReview = allPosts.filter((post) => pendingStatuses.has(post.status)).length;
  const errors7d = allPosts.filter((post) => post.status === "failed" && isRecentIso(post.updated_at || post.created_at, 7, now)).length;
  return {
    connected_channels: connectedChannels,
    publishing_validated_channels: validatedChannels,
    queued_posts: queuedPosts,
    published_posts_7d: published7d,
    scheduled_posts: scheduled,
    pending_review_posts: pendingReview,
    errors_7d: errors7d,
    followers_total: null,
    followers_growth_7d: null,
    followers_growth_30d: null,
    social_web_traffic: null,
    cards: [
      { key: "connected_channels", label: "Canales conectados", value: connectedChannels, hint: "Instagram, Facebook, LinkedIn, TikTok" },
      { key: "validated_channels", label: "Validados para publicar", value: validatedChannels, hint: "Manual u OAuth probado" },
      { key: "queued_posts", label: "Posts en cola", value: queuedPosts, hint: queuedPosts ? "Revisar Cola Social" : "Sin datos todavia" },
      { key: "published_posts_7d", label: "Publicados 7d", value: published7d, hint: "Datos reales disponibles" },
      { key: "scheduled_posts", label: "Programados", value: scheduled, hint: scheduled ? "Revisar cola" : "Sin datos todavia" },
      { key: "pending_review_posts", label: "Pendientes revision", value: pendingReview, hint: pendingReview ? "Necesitan aprobacion" : "Sin datos todavia" },
      { key: "errors_7d", label: "Errores 7d", value: errors7d, hint: errors7d ? "Revisar logs" : "Sin datos todavia" },
      { key: "followers_total", label: "Seguidores totales", value: "Pendiente integracion", hint: "No inventado" },
      { key: "social_web_traffic", label: "Trafico social web", value: "Pendiente integracion", hint: "UTM futuro" },
      { key: "autopublisher_global", label: "Autopublisher global", value: "OFF", hint: "Sin scheduler ni cola automatica" }
    ]
  };
}

async function handleSocialStatus(req) {
  if (req.method !== "GET") return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
  const [
    metaConnectionState,
    metaLastAttemptState,
    metaSettingsState,
    metaPostsState,
    metaRunsState,
    socialPostsState,
    socialAssetsState,
    linkedinConnectionState,
    linkedinSettingsState,
    linkedinPostsState,
    linkedinRunsState
  ] = await Promise.all([
    readMetaConnectionState(),
    latestMetaOrganicPost(),
    readMetaSettings(),
    listMetaPosts(new URL("https://admin.local/?limit=20"), 20),
    listMetaRuns(5),
    listSocialPosts(new URL("https://admin.local/?limit=50"), 50),
    listSocialAssets(new URL("https://admin.local/?limit=50"), 50),
    readLinkedInConnectionState(),
    readLinkedInSettings(),
    listLinkedInPosts(new URL("https://admin.local/?limit=20"), 20),
    listLinkedInRuns(5)
  ]);

  const metaOrganic = metaOrganicStatusPayload(metaConnectionState, metaLastAttemptState);
  const safeMetaOrganic = sanitizeSocialOrganicPayload(metaOrganic);
  const channels = {
    instagram: buildInstagramSocialChannel(metaOrganic),
    facebook: buildFacebookSocialChannel(metaOrganic),
    linkedin: buildLinkedInSocialChannel(linkedinConnectionState, linkedinSettingsState, linkedinPostsState),
    tiktok: buildTikTokSocialChannel()
  };
  const metaPosts = metaPostsState.posts || [];
  const linkedinPosts = linkedinPostsState.posts || [];
  const socialPosts = socialPostsState.posts || [];
  const socialAssets = socialAssetsState.assets || [];
  const posts = [
    ...socialPosts.map((post) => socialPostPreview(post, post.platform || post.channel || "social")),
    ...(socialPosts.length ? [] : [
      ...metaPosts.map((post) => socialPostPreview(post, post.platform || "meta")),
      ...linkedinPosts.map((post) => socialPostPreview(post, "linkedin"))
    ])
  ].sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))).slice(0, 12);
  const logs = [
    ...socialPosts.slice(0, 5).map((post) => socialLogEntry({
      channel: post.platform,
      event: "social_queue",
      status: post.status,
      at: post.updated_at || post.created_at,
      message: post.error_message || post.topic || "Cola editorial social",
      reference_id: post.published_media_id || post.id
    })),
    socialLogEntry({
      channel: "instagram",
      event: "oauth_status",
      status: metaOrganic.status,
      at: metaOrganic.instagram_publishing?.last_attempt_at,
      message: metaOrganic.last_error || "Instagram OAuth conectado",
      reference_id: metaOrganic.instagram_account_id
    }),
    ...(metaOrganic.last_attempt ? [socialLogEntry({
      channel: metaOrganic.last_attempt.platform || "instagram",
      event: "publish_test",
      status: metaOrganic.last_attempt.status || "unknown",
      at: socialPostDate(metaOrganic.last_attempt),
      message: metaOrganic.last_attempt.error_message || "Ultimo publish test",
      reference_id: socialPublishedMediaId(metaOrganic.last_attempt),
      meta_response: metaOrganic.last_attempt.meta_response
    })] : []),
    ...metaRunsState.runs.slice(0, 4).map((run) => socialLogEntry({
      channel: run.platform || "meta",
      event: "meta_autopublisher",
      status: run.status || "skipped",
      at: run.finished_at || run.created_at,
      message: run.error_message || "autopublisher_desactivado",
      reference_id: run.id
    })),
    ...linkedinRunsState.runs.slice(0, 3).map((run) => socialLogEntry({
      channel: "linkedin",
      event: "linkedin_autopublisher",
      status: run.status || "skipped",
      at: run.finished_at || run.created_at,
      message: run.error_message || "autopost_disabled",
      reference_id: run.id
    }))
  ].slice(0, 12);

  return {
    status: 200,
    payload: {
      ok: true,
      summary: buildSocialSummary({ channels, socialPosts }),
      channels,
      settings: socialReadonlySettings(metaSettingsState.settings, linkedinSettingsState.settings),
      metrics: {
        instagram: socialMetricPlaceholder("instagram"),
        facebook: socialMetricPlaceholder("facebook"),
        linkedin: socialMetricPlaceholder("linkedin"),
        tiktok: socialMetricPlaceholder("tiktok")
      },
      assets: socialAssets,
      posts,
      logs,
      autopublisher: {
        enabled: false,
        status: "OFF",
        reason: "autopost_disabled",
        cron_status: "disabled"
      },
      sources: {
        meta: {
          organic: safeMetaOrganic,
          summary: metaPostsSummary(metaPosts),
          storage: {
            connection_table_missing: metaConnectionState.table_missing,
            settings_table_missing: metaSettingsState.table_missing,
            posts_table_missing: metaPostsState.table_missing,
            runs_table_missing: metaRunsState.table_missing
          }
        },
        linkedin: {
          summary: linkedInPostsSummary(linkedinPosts),
          storage: {
            connection_table_missing: linkedinConnectionState.table_missing,
            settings_table_missing: linkedinSettingsState.table_missing,
            posts_table_missing: linkedinPostsState.table_missing,
            runs_table_missing: linkedinRunsState.table_missing
          }
        },
        tiktok: { storage: { configured: false } }
      },
      storage: {
        social_posts_table_missing: socialPostsState.table_missing,
        social_posts_error: socialPostsState.error,
        social_media_assets_table_missing: socialAssetsState.table_missing,
        social_media_assets_error: socialAssetsState.error,
        social_media_assets_pending_sql: socialAssetsState.table_missing ? SOCIAL_MEDIA_ASSETS_SQL : null,
        social_assets_storage_bucket: SOCIAL_ASSETS_STORAGE_BUCKET,
        social_assets_storage_sql: SOCIAL_ASSETS_STORAGE_SQL,
        pending_sql: socialPostsState.table_missing ? SOCIAL_POST_QUEUE_SQL : null
      }
    }
  };
}

async function createMetaRun(triggerType = "cron", platform = "multi") {
  try {
    const rows = await supabaseFetch("meta_autopublisher_runs", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify([{ status: "running", trigger_type: triggerType, platform }])
    });
    return Array.isArray(rows) ? rows[0] || null : rows;
  } catch (error) {
    return null;
  }
}

async function finishMetaRun(run, patch = {}) {
  if (!run?.id) return patch;
  try {
    const rows = await supabaseFetch(`meta_autopublisher_runs?id=eq.${encodeURIComponent(run.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch)
    });
    return Array.isArray(rows) ? rows[0] || patch : rows || patch;
  } catch (error) {
    return patch;
  }
}

function metaAutopublisherDisabledResult() {
  return {
    ok: true,
    skipped: true,
    reason: "autopost_disabled",
    status: "skipped",
    skipped_count: 1,
    published_count: 0,
    failed_count: 0,
    error_message: "autopost_disabled"
  };
}

async function listEligibleMetaLandings(limit = 50) {
  const params = new URLSearchParams({
    select: "id,slug,title,meta_title,meta_description,h1,city,template_type,status,index_status,quality_score,canonical_url,published_at,updated_at,last_generated_at,source_data_json",
    status: "eq.published",
    index_status: "eq.index",
    quality_score: "gte.75",
    order: "published_at.desc",
    limit: String(clampLimit(limit, 50, 100))
  });
  const rows = await supabaseFetch(`seo_landings?${params.toString()}`);
  return Array.isArray(rows) ? rows : [];
}

async function createMetaPostForLanding(landing, platform = "facebook", status = "draft") {
  const imageUrl = imageUrlForLanding(landing, platform, process.env);
  if (platform === "instagram" && !imageUrl) {
    throw new Error("meta_instagram_public_image_required");
  }
  const post = buildMetaPost({ landing, platform, status, imageUrl, env: process.env });
  const rows = await supabaseFetch("marketing_meta_posts", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([post])
  });
  return normalizeMetaPostRow(Array.isArray(rows) ? rows[0] || null : rows);
}

async function generateNextMetaPost({ platform = "facebook", status = "draft" } = {}) {
  if (!META_PLATFORMS.includes(platform)) return { ok: false, skipped: true, reason: "unsupported_platform" };
  const [postsState, landings] = await Promise.all([
    listMetaPosts(new URL("https://admin.local/?limit=100"), 100),
    listEligibleMetaLandings(80)
  ]);
  if (postsState.table_missing) {
    return { ok: true, skipped: true, reason: "table_missing", pending_sql: "database/marketing-meta.sql" };
  }
  const landing = pickNextLanding({ landings, posts: postsState.posts, platform, env: process.env });
  if (!landing) return { ok: true, skipped: true, reason: "no_eligible_landing" };
  const post = await createMetaPostForLanding(landing, platform, status);
  return { ok: true, skipped: false, post, landing };
}

async function readMetaPost(id) {
  const rows = await supabaseFetch(`marketing_meta_posts?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
  return normalizeMetaPostRow(Array.isArray(rows) ? rows[0] || null : rows);
}

async function patchMetaPost(id, patch = {}) {
  const rows = await supabaseFetch(`marketing_meta_posts?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() })
  });
  return normalizeMetaPostRow(Array.isArray(rows) ? rows[0] || null : rows);
}

async function loadMetaAccessToken(connection) {
  const encrypted = connection?.page_access_token_encrypted || connection?.access_token_encrypted;
  const accessToken = decryptMetaToken(encrypted);
  if (!accessToken) throw new Error("meta_access_token_missing");
  return accessToken;
}

async function loadMetaInstagramAccessToken(connection) {
  const encrypted = connection?.user_access_token_encrypted || connection?.access_token_encrypted;
  const accessToken = decryptMetaToken(encrypted);
  if (!accessToken) throw new Error("meta_instagram_access_token_missing");
  return accessToken;
}

async function loadMetaUserAccessToken(connection) {
  const encrypted = connection?.user_access_token_encrypted || connection?.access_token_encrypted;
  const accessToken = decryptMetaToken(encrypted);
  if (!accessToken) throw new Error("meta_user_access_token_missing");
  return accessToken;
}

async function publishMetaPostById(id) {
  const [post, connectionState, settingsState, postsState] = await Promise.all([
    readMetaPost(id),
    readMetaConnectionState(),
    readMetaSettings(),
    listMetaPosts(new URL("https://admin.local/?limit=100"), 100)
  ]);
  const connection = connectionState.connection;
  const settings = settingsState.settings;
  try {
    validateMetaPublishInput({
      post,
      posts: postsState.posts.filter((item) => item.id !== post?.id),
      connection,
      settings,
      env: process.env
    });
  } catch (error) {
    const message = sanitizeMetaSecretText(error.message || "meta_publish_not_ready");
    const nextStatus = /missing|required|disabled|false|not_ready|env|frequency|max/.test(message) ? "skipped" : "failed";
    return await patchMetaPost(id, { status: nextStatus, error_message: message });
  }
  const platform = String(post.platform || "").toLowerCase();
  let accessToken;
  try {
    accessToken = platform === "instagram" ? await loadMetaInstagramAccessToken(connection) : await loadMetaAccessToken(connection);
  } catch (error) {
    return await patchMetaPost(id, { status: "skipped", error_message: sanitizeMetaSecretText(error.message || "meta_access_token_missing") });
  }
  await patchMetaPost(id, { status: "publishing", error_message: null });
  try {
    const link = withUtm(post.source_url, platform, { city: post.city, slug: post.source_slug }, process.env);
    const config = metaConfig(process.env);
    const result = await publishMetaToPlatform({
      platform,
      accessToken,
      pageId: connection.facebook_page_id || config.facebookPageId,
      instagramBusinessAccountId: connection.instagram_business_account_id || config.instagramBusinessAccountId || config.instagramPublishAccountId,
      caption: post.caption,
      link,
      imageUrl: post.image_url,
      env: process.env
    });
    console.log(`[Meta Autopublisher] published ${platform} post ${result.external_post_id || ""}`.trim());
    return await patchMetaPost(id, {
      status: "published",
      published_at: new Date().toISOString(),
      external_post_id: result.external_post_id,
      published_url: result.published_url,
      meta_response: result.meta_response,
      error_message: null
    });
  } catch (error) {
    const message = sanitizeMetaSecretText(error.message || "meta_publish_failed");
    console.warn(`[Meta Autopublisher] failed ${post.platform} publish: ${message}`);
    await saveMetaConnection({ status: "error", last_error: message });
    return await patchMetaPost(id, { status: "failed", error_message: message });
  }
}

async function runMetaAutopublisherScheduler({ triggerType = "cron" } = {}) {
  const config = metaConfig(process.env);
  if (!config.autopostEnabled) {
    console.log("[Meta Autopublisher] skipped: autopost_disabled");
    return metaAutopublisherDisabledResult();
  }

  if (!hasSupabaseConfig()) {
    console.log("[Meta Autopublisher] skipped: supabase_not_configured");
    return { status: "skipped", skipped_count: 1, published_count: 0, failed_count: 0, error_message: "supabase_not_configured" };
  }

  const run = await createMetaRun(triggerType, "multi");
  const finish = (patch) => finishMetaRun(run, patch).then(() => patch);
  const finishDisabled = () => finish({ status: "skipped", skipped_count: 1, published_count: 0, failed_count: 0, error_message: "autopost_disabled" })
    .then((result) => ({ ...result, ok: true, skipped: true, reason: "autopost_disabled" }));
  const settingsState = await readMetaSettings();
  if (settingsState.table_missing) {
    console.log("[Meta Autopublisher] skipped: table_missing");
    return finish({ status: "skipped", skipped_count: 1, published_count: 0, failed_count: 0, error_message: "table_missing" });
  }
  if (settingsState.error) {
    const message = sanitizeMetaSecretText(settingsState.error);
    console.warn(`[Meta Autopublisher] failed: ${message}`);
    return finish({ status: "failed", skipped_count: 0, published_count: 0, failed_count: 1, error_message: message });
  }
  const settings = settingsState.settings;
  if (!settings.autopost_enabled) {
    console.log("[Meta Autopublisher] skipped: autopost_disabled");
    return finishDisabled();
  }

  const [connectionState, postsState] = await Promise.all([
    readMetaConnectionState(),
    listMetaPosts(new URL("https://admin.local/?limit=100"), 100)
  ]);
  if (connectionState.table_missing || postsState.table_missing) {
    console.log("[Meta Autopublisher] skipped: table_missing");
    return finish({ status: "skipped", skipped_count: 1, published_count: 0, failed_count: 0, error_message: "table_missing" });
  }
  if (connectionState.error || postsState.error) {
    const message = sanitizeMetaSecretText(connectionState.error || postsState.error);
    console.warn(`[Meta Autopublisher] failed: ${message}`);
    return finish({ status: "failed", skipped_count: 0, published_count: 0, failed_count: 1, error_message: message });
  }
  let landings = [];
  try {
    landings = await listEligibleMetaLandings(80);
  } catch (error) {
    const message = sanitizeMetaSecretText(error.message || "meta_landing_lookup_failed");
    console.warn(`[Meta Autopublisher] failed: ${message}`);
    return finish({ status: "failed", skipped_count: 0, published_count: 0, failed_count: 1, error_message: message });
  }
  const connection = connectionState.connection;
  const platforms = [
    settings.facebook_enabled ? "facebook" : null,
    settings.instagram_enabled ? "instagram" : null
  ].filter(Boolean);
  const results = [];
  let publishedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const knownPosts = [...postsState.posts];

  for (const platform of platforms) {
    const decision = shouldRunMetaAutopublisher({ posts: knownPosts, settings, connection, platform, env: process.env, now: new Date() });
    if (!decision.ok) {
      skippedCount += 1;
      console.log(`[Meta Autopublisher] skipped: ${decision.reason}`);
      results.push({ platform, status: "skipped", reason: decision.reason, missing_scopes: decision.missing_scopes || [] });
      continue;
    }
    const landing = pickNextLanding({ landings, posts: knownPosts, platform, env: process.env });
    if (!landing) {
      skippedCount += 1;
      console.log("[Meta Autopublisher] skipped: no_eligible_landing");
      results.push({ platform, status: "skipped", reason: "no_eligible_landing" });
      continue;
    }
    try {
      const imageUrl = imageUrlForLanding(landing, platform, process.env);
      if (platform === "instagram" && !imageUrl) throw new Error("meta_instagram_public_image_required");
      const post = await createMetaPostForLanding(landing, platform, "queued");
      const published = await publishMetaPostById(post.id);
      knownPosts.push(published);
      if (published.status === "published") {
        publishedCount += 1;
      } else if (published.status === "skipped") {
        skippedCount += 1;
      } else {
        failedCount += 1;
      }
      results.push({ platform, status: published.status, post_id: published.id, source_url: published.source_url, error_message: published.error_message || null });
    } catch (error) {
      failedCount += 1;
      const message = sanitizeMetaSecretText(error.message || "meta_publish_failed");
      console.warn(`[Meta Autopublisher] failed ${platform} publish: ${message}`);
      results.push({ platform, status: "failed", reason: message });
    }
  }

  const status = publishedCount ? "published" : failedCount ? "failed" : "skipped";
  return finish({
    status,
    platform: platforms.join(",") || "multi",
    published_count: publishedCount,
    skipped_count: skippedCount,
    failed_count: failedCount,
    result_json: { results },
    error_message: status === "failed" ? results.find((item) => item.status === "failed")?.reason || "meta_publish_failed" : null
  });
}

async function handleMetaDaily(req) {
  if (req.method !== "POST") return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
  const result = await runMetaAutopublisherScheduler({ triggerType: isCronTokenRequest(req) ? "cron" : "manual" });
  return {
    status: result.status === "failed" ? 500 : 200,
    payload: {
      ok: result.status !== "failed",
      skipped: result.status === "skipped",
      reason: result.error_message || result.status,
      ...result
    }
  };
}

async function handleMetaDashboard(url) {
  const [connectionState, settingsState, postsState, runsState] = await Promise.all([
    readMetaConnectionState(),
    readMetaSettings(),
    listMetaPosts(url, 10),
    listMetaRuns(5)
  ]);
  const settings = settingsState.settings;
  const connection = connectionState.connection;
  const connectionSummary = summarizeMetaConnection(connection, process.env);
  const lastPublication = postsState.posts.find((post) => post.published_at) || null;
  const decisions = Object.fromEntries(META_PLATFORMS.map((platform) => [
    platform,
    shouldRunMetaAutopublisher({ posts: postsState.posts, settings, connection, platform, now: new Date() })
  ]));
  return {
    status: 200,
    payload: {
      ok: true,
      connection: connectionSummary,
      settings,
      posts: postsState.posts,
      runs: runsState.runs,
      summary: metaPostsSummary(postsState.posts),
      last_publication: lastPublication,
      next_publication: nextMetaScheduledAt(settings),
      autopublisher: {
        enabled: settings.autopost_enabled === true && metaConfig(process.env).autopostEnabled,
        frequency_days: settings.frequency_days || 1,
        max_per_day: settings.max_per_day || 1,
        preferred_time: settings.preferred_time || "10:00",
        timezone: settings.timezone || "Europe/Madrid",
        next_publication: nextMetaScheduledAt(settings),
        decisions
      },
      env: metaEnvStatus(process.env),
      manual_mode_notice: META_MANUAL_MODE_NOTICE,
      storage: {
        connection_table_missing: connectionState.table_missing,
        settings_table_missing: settingsState.table_missing,
        posts_table_missing: postsState.table_missing,
        runs_table_missing: runsState.table_missing,
        connection_error: connectionState.error,
        settings_error: settingsState.error,
        posts_error: postsState.error,
        runs_error: runsState.error
      }
    }
  };
}

async function handleMetaConnect(req, url) {
  if (req.method !== "GET") return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
  const target = normalizeOAuthTarget(url.searchParams.get("target") || url.searchParams.get("platform") || "instagram");
  const scopes = metaOrganicOAuthScopes({ target, env: process.env });
  console.log(`[Meta Organic OAuth] legacy connect target=${target} scope=${scopes.join(",")}`);
  const result = buildOrganicAuthorizationUrl({ target, scopes });
  return { status: 200, payload: { ok: true, ...result, target } };
}

async function handleMetaCallback(req) {
  if (req.method !== "POST") return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
  const body = await readJsonBody(req);
  if (!body.code) return { status: 400, payload: { ok: false, error: "meta_code_required" } };
  const token = await exchangeMetaAuthorizationCode({ code: body.code });
  const connection = await saveMetaConnection({
    status: "needs_page",
    access_token_encrypted: encryptMetaToken(token.access_token),
    user_access_token_encrypted: encryptMetaToken(token.access_token),
    page_access_token_encrypted: null,
    token_expires_at: token.token_expires_at,
    scopes: token.scopes,
    last_error: null
  });
  return { status: 200, payload: { ok: true, connection: summarizeMetaConnection(connection, process.env) } };
}

async function handleMetaDisconnect(req) {
  if (req.method !== "POST") return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
  const connection = await saveMetaConnection({
    status: "disconnected",
    access_token_encrypted: null,
    user_access_token_encrypted: null,
    page_access_token_encrypted: null,
    token_expires_at: null,
    last_error: null
  });
  return { status: 200, payload: { ok: true, connection: summarizeMetaConnection(connection, process.env) } };
}

async function handleMetaPages(req) {
  const connectionState = await readMetaConnectionState();
  const connection = connectionState.connection;
  if (!connection) return { status: 400, payload: { ok: false, error: "meta_connection_missing" } };
  const userAccessToken = await loadMetaUserAccessToken(connection);
  const pages = await fetchManagedPages({ userAccessToken });
  if (req.method === "GET") {
    return { status: 200, payload: { ok: true, pages: pages.map(sanitizePage) } };
  }
  if (req.method === "POST") {
    const body = await readJsonBody(req);
    const page = selectManagedPage(pages, body.page_id || body.facebook_page_id);
    if (!page) return { status: 404, payload: { ok: false, error: "meta_page_not_found" } };
    if (!page.access_token) return { status: 400, payload: { ok: false, error: "meta_page_access_token_missing" } };
    const instagram = page.instagram_business_account || null;
    const connection = await saveMetaConnection({
      status: "connected",
      facebook_page_id: page.id,
      facebook_page_name: page.name,
      instagram_business_account_id: instagram?.id || null,
      access_token_encrypted: encryptMetaToken(page.access_token),
      page_access_token_encrypted: encryptMetaToken(page.access_token),
      scopes: connectionState.connection?.scopes || [],
      last_error: instagram?.id ? null : "missing_instagram_business_account_id"
    });
    return { status: 200, payload: { ok: true, page: sanitizePage(page), connection: summarizeMetaConnection(connection, process.env) } };
  }
  return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
}

async function handleMetaTestConnection(req) {
  if (req.method !== "POST") return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
  const connectionState = await readMetaConnectionState();
  const summary = summarizeMetaConnection(connectionState.connection, process.env);
  return {
    status: 200,
    payload: {
      ok: true,
      connection: summary,
      table_missing: connectionState.table_missing,
      error: connectionState.error,
      automatic_available: summary.automatic_available,
      missing_scopes: summary.missing_scopes,
      message: summary.automatic_available ? "Meta automatico disponible." : META_MANUAL_MODE_NOTICE
    }
  };
}

async function handleMetaOrganicOAuthStart(req, res, url) {
  if (req.method !== "GET") return json(res, 405, { ok: false, error: "method_not_allowed" });
  const target = normalizeOAuthTarget(url.searchParams.get("target") || url.searchParams.get("platform") || "instagram");
  const envStatus = validateMetaOrganicEnv(process.env, { target });
  if (target === "instagram") {
    const instagramAppIdSource = process.env.INSTAGRAM_APP_ID ? "env" : "missing";
    console.log(`[Meta Organic OAuth] instagram_app_id_source=${instagramAppIdSource} fallback=none`);
  }
  if (!envStatus.ok) {
    return json(res, 500, { ok: false, error: "meta_oauth_not_configured", missing: envStatus.missing });
  }
  const returnTo = url.searchParams.get("return_to") || "/backoffice/marketing/social";
  const scopes = metaOrganicOAuthScopes({ target, env: process.env });
  const state = encodeOrganicOAuthState({ returnTo, target });
  console.log(`[Meta Organic OAuth] target=${target} scope=${scopes.join(",")}`);
  const result = buildOrganicAuthorizationUrl({ target, state, scopes });
  if (target === "instagram") {
    const officialUrl = process.env.INSTAGRAM_OFFICIAL_EMBED_URL || process.env.INSTAGRAM_BUSINESS_LOGIN_URL || process.env.META_INSTAGRAM_OFFICIAL_EMBED_URL || "";
    console.log(`[Meta Organic OAuth] instagram_authorize_url=${redactInstagramAuthorizationUrl(result.url)}`);
    console.log(`[Meta Organic OAuth] instagram_authorize_summary=${JSON.stringify(summarizeInstagramAuthorizationUrl(result.url))}`);
    if (officialUrl) {
      console.log(`[Meta Organic OAuth] instagram_authorize_diff=${JSON.stringify(diffInstagramAuthorizationUrls(result.url, officialUrl))}`);
    }
    if (result.state_mode === "cookie") setMetaOAuthStateCookie(res, state);
  }
  if (url.searchParams.get("format") === "json") {
    if (!assertAdmin(req, res)) return;
    return json(res, 200, { ok: true, ...result, target, redirect_uri: envStatus.redirect_uri });
  }
  return redirect(res, result.url);
}

async function handleMetaOrganicOAuthCallback(req, res, url) {
  if (req.method !== "GET") return json(res, 405, { ok: false, error: "method_not_allowed" });
  let state = { returnTo: "/backoffice/marketing/social" };
  const rawState = url.searchParams.get("state") || readMetaOAuthStateCookie(req);
  if (readMetaOAuthStateCookie(req)) clearMetaOAuthStateCookie(res);
  try {
    if (!rawState) throw new Error("meta_oauth_state_required");
    state = decodeOrganicOAuthState(rawState);
  } catch (error) {
    return redirect(res, relativeWithQuery("/backoffice/marketing/social", {
      meta_oauth: "error",
      meta_error: sanitizeMetaSecretText(error.message || error)
    }));
  }

  if (url.searchParams.get("error")) {
    const message = sanitizeMetaSecretText(url.searchParams.get("error_description") || url.searchParams.get("error_reason") || url.searchParams.get("error"));
    return redirect(res, relativeWithQuery(state.returnTo, { meta_oauth: "error", meta_error: message }));
  }

  const code = url.searchParams.get("code");
  if (!code) return redirect(res, relativeWithQuery(state.returnTo, { meta_oauth: "error", meta_error: "meta_code_required" }));
  if (!hasSupabaseConfig()) {
    return redirect(res, relativeWithQuery(state.returnTo, { meta_oauth: "error", meta_error: "supabase_not_configured" }));
  }

  try {
    const target = normalizeOAuthTarget(state.target || "instagram");
    const token = target === "instagram"
      ? await exchangeInstagramAuthorizationCode({ code })
      : await exchangeMetaAuthorizationCode({ code });
    let pages = [];
    if (target !== "instagram") {
      try {
        pages = await fetchManagedPages({ userAccessToken: token.access_token });
      } catch (error) {
        pages = [];
      }
    }
    const { connection, page } = await saveDetectedMetaOrganicConnection(token, pages, target);
    const summary = summarizeMetaConnection(connection, process.env);
    return redirect(res, relativeWithQuery(state.returnTo, {
      meta_oauth: target === "facebook" ? (page?.access_token ? "connected" : "needs_page") : "connected",
      meta_status: summary.status
    }));
  } catch (error) {
    const message = sanitizeMetaSecretText(error.message || error);
    try {
      if (hasSupabaseConfig()) await saveMetaConnection({ status: "error", last_error: message });
    } catch {}
    return redirect(res, relativeWithQuery(state.returnTo, { meta_oauth: "error", meta_error: message }));
  }
}

async function handleMetaOrganicStatus(req) {
  if (req.method !== "GET") return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
  const [connectionState, lastAttemptState] = await Promise.all([readMetaConnectionState(), latestMetaOrganicPost()]);
  return { status: 200, payload: metaOrganicStatusPayload(connectionState, lastAttemptState) };
}

async function handleMetaOrganicPublishTest(req, platform) {
  if (req.method !== "POST") return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
  await readJsonBody(req).catch(() => ({}));
  if (!hasSupabaseConfig()) {
    return { status: 500, payload: { ok: false, error: "supabase_not_configured", pending_sql: "database/marketing-meta.sql" } };
  }
  const connectionState = await readMetaConnectionState();
  const connection = connectionState.connection;
  if (!connection) return { status: 400, payload: { ok: false, error: "meta_connection_missing" } };
  const config = metaConfig(process.env);
  const pageId = cleanNullable(connection.facebook_page_id || config.facebookPageId);
  const instagramAccountId = cleanNullable(connection.instagram_business_account_id || config.instagramBusinessAccountId || config.instagramPublishAccountId);
  const payload = platform === "facebook" ? buildFacebookOrganicTestPost(process.env) : buildInstagramOrganicTestPost(process.env);

  try {
    if (platform === "facebook" && !pageId) throw new Error("meta_facebook_page_id_missing");
    if (platform === "facebook" && !connection.page_access_token_encrypted) throw new Error("meta_facebook_page_access_token_missing");
    const accessToken = platform === "instagram" ? await loadMetaInstagramAccessToken(connection) : await loadMetaAccessToken(connection);
    const result = await publishMetaToPlatform({
      platform,
      accessToken,
      pageId,
      instagramBusinessAccountId: instagramAccountId,
      caption: payload.caption,
      link: payload.link,
      imageUrl: payload.image_url,
      env: process.env
    });
    const saved = await recordMetaOrganicPost(platform, payload, {
      status: "published",
      published_at: new Date().toISOString(),
      external_post_id: result.external_post_id,
      published_url: result.published_url,
      meta_response: result.meta_response
    });
    const profileId = result.meta_response?.instagram_profile?.user_id || result.meta_response?.instagram_profile?.id || null;
    await saveMetaConnection({
      status: "connected",
      last_error: null,
      ...(platform === "instagram" && profileId ? { instagram_business_account_id: profileId } : {})
    }).catch(() => null);
    return { status: 200, payload: { ok: true, platform, result, post: saved.post, persisted: saved.persisted, storage_error: saved.error || null } };
  } catch (error) {
    const message = sanitizeMetaSecretText(sanitizeErrorMessage(error, 800));
    const safeMetaResponse = error?.meta_response || error?.payload
      ? sanitizeMetaPayload(error.meta_response || error.payload)
      : null;
    const saved = await recordMetaOrganicPost(platform, payload, { status: "failed", error_message: message, meta_response: safeMetaResponse });
    const nextStatus = platform === "instagram" && connection.status === "connected" ? "connected" : "error";
    const profileId = safeMetaResponse?.instagram_profile?.user_id || safeMetaResponse?.instagram_profile?.id || null;
    await saveMetaConnection({
      status: nextStatus,
      last_error: message,
      ...(platform === "instagram" && profileId ? { instagram_business_account_id: profileId } : {})
    }).catch(() => null);
    return {
      status: 400,
      payload: {
        ok: false,
        platform,
        error: "meta_publish_failed",
        message,
        post: saved.post,
        persisted: saved.persisted,
        storage_error: saved.error || null
      }
    };
  }
}

async function handleMetaSettings(req) {
  if (req.method === "GET") {
    const result = await readMetaSettings();
    return { status: 200, payload: { ok: true, settings: result.settings, updated_at: result.row?.updated_at || null, table_missing: result.table_missing, error: result.error } };
  }
  if (req.method === "POST") {
    const body = await readJsonBody(req);
    const result = await saveMetaSettings(body.settings || body);
    return { status: 200, payload: { ok: true, settings: result.settings, updated_at: result.row?.updated_at || new Date().toISOString() } };
  }
  return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
}

async function handleMetaPosts(req, url) {
  if (req.method === "GET") {
    const posts = await listMetaPosts(url);
    return { status: 200, payload: { ok: true, posts: posts.posts, summary: metaPostsSummary(posts.posts), table_missing: posts.table_missing, error: posts.error } };
  }
  if (req.method === "POST") {
    const body = await readJsonBody(req);
    if (body.action) return handleMetaPostAction(body);
    if (!body.id) return { status: 400, payload: { ok: false, error: "meta_post_id_required" } };
    const post = await patchMetaPost(body.id, body);
    return { status: 200, payload: { ok: true, post } };
  }
  if (req.method === "PUT") {
    const body = await readJsonBody(req);
    if (!body.id) return { status: 400, payload: { ok: false, error: "meta_post_id_required" } };
    const patch = {
      caption: String(body.caption || "").trim(),
      image_url: cleanNullable(body.image_url),
      scheduled_for: cleanNullable(body.scheduled_for),
      status: body.status || "draft"
    };
    const post = await patchMetaPost(body.id, patch);
    return { status: 200, payload: { ok: true, post } };
  }
  return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
}

async function handleMetaPostAction(body = {}) {
  const id = body.id;
  const action = String(body.action || "").trim();
  if (!id && !["generate_next"].includes(action)) return { status: 400, payload: { ok: false, error: "meta_post_id_required" } };

  if (action === "generate_next") {
    const result = await generateNextMetaPost({ platform: META_PLATFORMS.includes(body.platform) ? body.platform : "facebook", status: "draft" });
    return { status: 200, payload: result };
  }
  if (action === "generate_image") {
    const post = await readMetaPost(id);
    const image_url = generateMetaImageSvg(post);
    const updated = await patchMetaPost(id, { image_url, error_message: null });
    return { status: 200, payload: { ok: true, post: updated } };
  }
  if (action === "publish_now") {
    const post = await publishMetaPostById(id);
    return { status: post.status === "published" ? 200 : 400, payload: { ok: post.status === "published", post, error: post.error_message || null } };
  }
  if (action === "retry") {
    const post = await patchMetaPost(id, { status: "queued", error_message: null });
    return { status: 200, payload: { ok: true, post } };
  }
  if (action === "skip") {
    const post = await patchMetaPost(id, { status: "skipped", error_message: null });
    return { status: 200, payload: { ok: true, post } };
  }
  return { status: 400, payload: { ok: false, error: "meta_action_not_supported" } };
}

async function handleMeta(req, url, resource) {
  if (resource === "meta") return handleMetaDashboard(url);
  if (resource === "meta/daily") return handleMetaDaily(req);
  if (resource === "meta/autopublisher/run") return handleMetaDaily(req);
  if (resource === "meta/connect") return handleMetaConnect(req, url);
  if (resource === "meta/callback") return handleMetaCallback(req);
  if (resource === "meta/disconnect") return handleMetaDisconnect(req);
  if (resource === "meta/pages") return handleMetaPages(req);
  if (resource === "meta/test-connection") return handleMetaTestConnection(req);
  if (resource === "meta/status") return handleMetaOrganicStatus(req);
  if (resource === "meta/publish-test-facebook") return handleMetaOrganicPublishTest(req, "facebook");
  if (resource === "meta/publish-test-instagram") return handleMetaOrganicPublishTest(req, "instagram");
  if (resource === "meta/settings") return handleMetaSettings(req);
  if (resource === "meta/posts") return handleMetaPosts(req, url);
  return { status: 404, payload: { ok: false, error: "meta_resource_not_found", resource } };
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

async function readSocialVideoProject(id) {
  if (!id) return null;
  const params = new URLSearchParams({
    id: `eq.${id}`,
    select: "*",
    limit: "1"
  });
  const rows = await supabaseFetch(`social_video_projects?${params.toString()}`);
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
async function readViralizaCreatorsAndActions(url, actionLimit = 500) {
  const creatorsResult = await safeFetch(viralCreatorSelectPath(url));
  const actionUrl = new URL(url.toString());
  actionUrl.searchParams.set("limit", String(actionLimit));
  const actionsResult = await safeFetch(viralActionSelectPath(actionUrl, actionLimit));
  return {
    creatorsResult,
    actionsResult,
    creators: safeRows(creatorsResult).map(mapViralCreatorRow),
    actions: safeRows(actionsResult).map(mapViralActionRow),
    persisted: !safeFetchFailed(creatorsResult) && !safeFetchFailed(actionsResult),
    warnings: [creatorsResult?.error, actionsResult?.error].filter(Boolean)
  };
}

async function handleViralizaPerformance(req, url) {
  if (req.method !== "GET") return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
  const data = await readViralizaCreatorsAndActions(url, 500);
  const performance = buildViralizaPerformanceReport(data.creators, data.actions, { days: 7 });
  return {
    status: 200,
    payload: {
      ok: true,
      performance,
      creators_count: data.creators.length,
      actions_count: data.actions.length,
      persisted: data.persisted,
      warnings: data.warnings
    }
  };
}

async function handleViralizaLearning(req, url) {
  if (req.method !== "GET") return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
  const today = new Date().toISOString().slice(0, 10);
  const from = String(url.searchParams.get("from") || "").slice(0, 10) || null;
  const to = String(url.searchParams.get("to") || today).slice(0, 10);
  const data = await readViralizaCreatorsAndActions(url, 500);
  const learning = analyzeViralizaLearning({ from, to }, { creators: data.creators, actions: data.actions });
  return {
    status: 200,
    payload: {
      ok: true,
      learning,
      persisted: data.persisted,
      warnings: data.warnings
    }
  };
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

const ADMIN_PRE_SUPABASE_READ_ONLY_ROUTES = createAdminRouter([
  {
    resource: "alerts",
    method: "GET",
    handler: () => handleAlerts()
  },
  {
    resource: "analytics/summary",
    method: "GET",
    handler: ({ req, url }) => handleOwnedAnalyticsSummary(req, url)
  },
  {
    resource: "analytics/pages",
    method: "GET",
    handler: ({ req, url }) => handleOwnedAnalyticsPages(req, url)
  },
  {
    resource: "analytics/learning",
    method: "GET",
    handler: ({ req, url }) => handleOwnedAnalyticsLearning(req, url)
  }
]);

const ADMIN_SUPABASE_ROUTED_ROUTES = createAdminRouter([
  {
    resource: "summary",
    method: "GET",
    handler: () => handleSummary()
  },
  {
    resource: "premium/subscriptions",
    method: "GET",
    handler: ({ url }) => handlePremiumSubscriptions(url)
  },
  {
    resource: "extension/usage",
    method: "GET",
    handler: ({ url }) => handleExtensionUsageSummary(url)
  },
  {
    resource: "parking/summary",
    method: "GET",
    handler: () => handleParkingSummary()
  },
  {
    resource: "seo/landings",
    method: "GET",
    fallbackOnMethodMismatch: true,
    handler: ({ url }) => handleSeoLandingsReadOnly(url)
  },
  {
    resource: "kpis/settings",
    method: ["GET", "POST"],
    fallbackOnMethodMismatch: true,
    handler: ({ req }) => handleKpiSettings(req)
  },
  {
    resource: "operations/releases",
    method: ["GET", "POST"],
    fallbackOnMethodMismatch: true,
    handler: ({ req, url }) => handleReleaseArtifacts(req, url)
  }
]);

async function handleAdminRequest(req, res) {
  if (handleCors(req, res, { policy: "admin" })) return;
  const { url, resource } = routeFromRequest(req);
  if (resource === "linkedin/daily" || resource === "linkedin/autopublisher/run") {
    if (!assertAdminOrCron(req, res)) return;
    try {
      const result = await handleLinkedIn(req, url, resource);
      return json(res, result.status, result.payload);
    } catch (error) {
      return json(res, 500, { ok: false, error: "linkedin_daily_failed", message: sanitizeErrorMessage(error, 500) });
    }
  }
  if (resource === "meta/daily" || resource === "meta/autopublisher/run") {
    if (!assertAdminOrCron(req, res)) return;
    try {
      const result = await handleMeta(req, url, resource);
      return json(res, result.status, result.payload);
    } catch (error) {
      return json(res, 500, { ok: false, error: "meta_daily_failed", message: sanitizeMetaSecretText(error.message || error, 500) });
    }
  }
  if (resource === "meta/oauth/start") {
    return handleMetaOrganicOAuthStart(req, res, url);
  }
  if (resource === "meta/oauth/callback") {
    return handleMetaOrganicOAuthCallback(req, res, url);
  }
  if (resource === "seo-autogenerate/run") {
    if (!assertAdminOrCron(req, res)) return;
    try {
      const result = await handleSeoAutogeneration(req, url);
      return json(res, result.status, result.payload);
    } catch (error) {
      return json(res, 500, { ok: false, error: "seo_autogeneration_failed", message: sanitizeErrorMessage(error, 500) });
    }
  }

  if (!assertAdmin(req, res)) return;

  try {
    const preSupabaseReadOnly = await dispatchAdminRoute(ADMIN_PRE_SUPABASE_READ_ONLY_ROUTES, { req, url, resource });
    if (preSupabaseReadOnly) {
      return json(res, preSupabaseReadOnly.status, preSupabaseReadOnly.payload);
    }
    if (resource === "meta/connect") {
      const result = await handleMeta(req, url, resource);
      return json(res, result.status, result.payload);
    }
    if (!hasSupabaseConfig()) {
      return json(res, 500, { ok: false, error: "supabase_not_configured" });
    }
    const supabaseRouted = await dispatchAdminRoute(ADMIN_SUPABASE_ROUTED_ROUTES, { req, url, resource });
    if (supabaseRouted) {
      return json(res, supabaseRouted.status, supabaseRouted.payload);
    }
    if (resource === "premium/subscriptions") {
      if (req.method !== "GET") return json(res, 405, { ok: false, error: "method_not_allowed" });
      const result = await handlePremiumSubscriptions(url);
      return json(res, result.status, result.payload);
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
    if (resource === "linkedin" || resource.startsWith("linkedin/")) {
      const result = await handleLinkedIn(req, url, resource);
      return json(res, result.status, result.payload);
    }
    if (resource === "social/status") {
      const result = await handleSocialStatus(req);
      return json(res, result.status, result.payload);
    }
    if (resource === "social/posts") {
      const result = await handleSocialPosts(req, url);
      return json(res, result.status, result.payload);
    }
    if (resource === "social/assets") {
      const result = await handleSocialAssets(req, url);
      return json(res, result.status, result.payload);
    }
    if (resource === "social/assets/upload") {
      const result = await handleSocialAssetUpload(req);
      return json(res, result.status, result.payload);
    }
    if (resource === "social/assets/from-runway") {
      const result = await handleSocialAssetFromRunway(req);
      return json(res, result.status, result.payload);
    }
    if (resource === "meta" || resource.startsWith("meta/")) {
      const result = await handleMeta(req, url, resource);
      return json(res, result.status, result.payload);
    }
    if (resource === "kpis/settings") {
      const result = await handleKpiSettings(req);
      return json(res, result.status, result.payload);
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
    if (resource === "viraliza/performance") {
      const result = await handleViralizaPerformance(req, url);
      return json(res, result.status, result.payload);
    }
    if (resource === "viraliza/learning") {
      const result = await handleViralizaLearning(req, url);
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
    if (String(resource || "").startsWith("meta")) {
      console.error("[admin]", resource, sanitizeMetaSecretText(error.message || error));
    } else {
      console.error("[admin]", resource, sanitizeErrorMessage(error));
    }
    return json(res, 500, {
      ok: false,
      error: "admin_request_failed",
      message: String(resource || "").startsWith("meta") ? sanitizeMetaSecretText(error.message || error) : sanitizeErrorMessage(error)
    });
  }
}

module.exports = async function handler(req, res) {
  const startedAt = Date.now();
  const { resource } = routeFromRequest(req);
  try {
    return await handleAdminRequest(req, res);
  } finally {
    logRequestMetric(req, res, { route: "api/admin", resource, startedAt });
  }
};
