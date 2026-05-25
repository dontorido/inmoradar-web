const { assertAdmin, fetchWithTimeout, handleCors, hasSupabaseConfig, json, readRawBody, sanitizeErrorMessage, supabaseFetch } = require("./_utils");
const { createAdminRouter, dispatchAdminRoute } = require("./_admin/router");
const {
  buildSeoAutogenerationOperationalAlerts,
  getSeoAutogenerationStatus,
  runSeoAutogeneration
} = require("./_seo/autogeneration");
const { runSeoLandingGeneration } = require("./_seo/generator");
const { SEO_DAILY_TARGETS, buildSeoDailyPolicySnapshot } = require("./_seo/publishingPolicy");
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
const {
  DEFAULT_USAGE_TIME_ZONE,
  safeTimeZone,
  summarizeExtensionUsage
} = require("../lib/extension-usage/metrics");
const { buildRevenueEventFromLemonPayload, summarizeMonthlyRevenue } = require("../lib/sales/revenue");
const {
  normalizeReleaseArtifactInput,
  normalizeReleaseTarget,
  releaseConnectors
} = require("../lib/operations/releases");
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
  buildOwnedAnalyticsLearning,
  summarizeOwnedAnalytics,
  summarizePagePerformance
} = require("../lib/analytics/learning");

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
  buildAuthorizationUrl: buildMetaAuthorizationUrl,
  buildMetaPost,
  decryptToken: decryptMetaToken,
  defaultSettings: defaultMetaSettings,
  encryptToken: encryptMetaToken,
  exchangeAuthorizationCode: exchangeMetaAuthorizationCode,
  fetchManagedPages,
  generateMetaImageSvg,
  imageUrlForLanding,
  metaConfig,
  metaEnvStatus,
  nextScheduledAt: nextMetaScheduledAt,
  normalizeSettings: normalizeMetaSettings,
  pickNextLanding,
  publishToPlatform: publishMetaToPlatform,
  sanitizeSecretText: sanitizeMetaSecretText,
  sanitizePage,
  selectManagedPage,
  shouldRunAutopublisher: shouldRunMetaAutopublisher,
  summarizeConnection: summarizeMetaConnection,
  validatePublishInput: validateMetaPublishInput,
  withUtm
} = require("../lib/meta/services");
const LANDING_SELECT =
  "id,opportunity_id,slug,title,meta_title,city,province,autonomous_community,template_type,status,index_status,quality_score,word_count,canonical_url,published_at,last_generated_at,created_at,updated_at";

function requestHeader(req, name) {
  const headers = req.headers || {};
  if (headers[name] !== undefined) return headers[name];
  const lowerName = String(name).toLowerCase();
  const entry = Object.entries(headers).find(([key]) => String(key).toLowerCase() === lowerName);
  return entry ? entry[1] : "";
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
    const seoAutogenerationStatus = await getSeoAutogenerationStatus();
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

const EXTENSION_USAGE_PRESETS = new Set(["24h", "7d", "30d", "month", "all"]);
const EXTENSION_USAGE_DAY_MS = 24 * 60 * 60 * 1000;

function extensionDateKeyInTimeZone(value, timeZone = DEFAULT_USAGE_TIME_ZONE) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.formatToParts(date).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function extensionTimeParts(date, timeZone = DEFAULT_USAGE_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: safeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23"
  });
  return formatter.formatToParts(date).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = Number(part.value);
    return acc;
  }, {});
}

function extensionTimeZoneOffsetMs(date, timeZone = DEFAULT_USAGE_TIME_ZONE) {
  const parts = extensionTimeParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, date.getUTCMilliseconds());
  return asUtc - date.getTime();
}

function extensionZonedDateToUtc(dateKey, timeZone = DEFAULT_USAGE_TIME_ZONE, endOfDay = false) {
  const match = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const hour = endOfDay ? 23 : 0;
  const minute = endOfDay ? 59 : 0;
  const second = endOfDay ? 59 : 0;
  const millisecond = endOfDay ? 999 : 0;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  for (let index = 0; index < 3; index += 1) {
    const offset = extensionTimeZoneOffsetMs(new Date(utcMs), timeZone);
    const next = Date.UTC(year, month - 1, day, hour, minute, second, millisecond) - offset;
    if (Math.abs(next - utcMs) < 1000) break;
    utcMs = next;
  }
  const date = new Date(utcMs);
  return Number.isNaN(date.getTime()) ? null : date;
}

function extensionDateKeyAddDays(dateKey, days) {
  const match = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return date.toISOString().slice(0, 10);
}

function normalizeExtensionPreset(value) {
  const preset = String(value || "").trim().toLowerCase();
  return EXTENSION_USAGE_PRESETS.has(preset) ? preset : "";
}

function extensionWindowFromPreset(preset, timeZone, now = new Date()) {
  const normalizedPreset = normalizeExtensionPreset(preset) || "30d";
  if (normalizedPreset === "all") {
    return {
      mode: "all",
      preset: "all",
      timezone: timeZone,
      start: "",
      end: "",
      from_date: "",
      to_date: "",
      days: null
    };
  }

  const end = now;
  const endDateKey = extensionDateKeyInTimeZone(end, timeZone);
  let start;
  let fromDateKey = endDateKey;

  if (normalizedPreset === "24h") {
    start = new Date(end.getTime() - EXTENSION_USAGE_DAY_MS);
    fromDateKey = extensionDateKeyInTimeZone(start, timeZone);
  } else if (normalizedPreset === "month") {
    fromDateKey = `${endDateKey.slice(0, 8)}01`;
    start = extensionZonedDateToUtc(fromDateKey, timeZone) || new Date(end.getTime() - 30 * EXTENSION_USAGE_DAY_MS);
  } else {
    const days = normalizedPreset === "7d" ? 7 : 30;
    fromDateKey = extensionDateKeyAddDays(endDateKey, -(days - 1));
    start = extensionZonedDateToUtc(fromDateKey, timeZone) || new Date(end.getTime() - days * EXTENSION_USAGE_DAY_MS);
  }

  return {
    mode: "preset",
    preset: normalizedPreset,
    timezone: timeZone,
    start: start.toISOString(),
    end: end.toISOString(),
    from_date: fromDateKey,
    to_date: endDateKey,
    days: Math.max(1, Math.ceil((end.getTime() - start.getTime()) / EXTENSION_USAGE_DAY_MS))
  };
}

function extensionUsageWindow(url, now = new Date()) {
  const timeZone = safeTimeZone(url.searchParams.get("timezone") || url.searchParams.get("tz") || DEFAULT_USAGE_TIME_ZONE);
  const preset = normalizeExtensionPreset(url.searchParams.get("preset"));
  if (preset && preset !== "all") return extensionWindowFromPreset(preset, timeZone, now);
  if (preset === "all") return extensionWindowFromPreset("all", timeZone, now);

  const fromParam = String(url.searchParams.get("from") || url.searchParams.get("from_date") || "").trim();
  const toParam = String(url.searchParams.get("to") || url.searchParams.get("to_date") || "").trim();
  const fromDate = extensionZonedDateToUtc(fromParam, timeZone);
  const toDate = extensionZonedDateToUtc(toParam, timeZone, true);

  if (fromParam || toParam) {
    if (fromDate && toDate) {
      let windowStart = fromDate;
      let windowEnd = toDate;
      let fromDateKey = fromParam;
      let toDateKey = toParam;
      if (windowStart > windowEnd) {
        [windowStart, windowEnd] = [windowEnd, windowStart];
        [fromDateKey, toDateKey] = [toDateKey, fromDateKey];
      }
      return {
        mode: "date_range",
        preset: "custom",
        timezone: timeZone,
        start: windowStart.toISOString(),
        end: windowEnd.toISOString(),
        from_date: fromDateKey,
        to_date: toDateKey,
        days: Math.max(1, Math.ceil((windowEnd.getTime() - windowStart.getTime()) / EXTENSION_USAGE_DAY_MS))
      };
    }
  }

  return extensionWindowFromPreset("30d", timeZone, now);
}

async function loadKnownExtensionUsersBefore(window) {
  if (!window.start || window.mode === "all") return [];
  const params = new URLSearchParams({
    select: "anonymous_id_hash",
    order: "created_at.asc",
    limit: "10000"
  });
  params.set("created_at", `lt.${window.start}`);
  params.set("anonymous_id_hash", "not.is.null");
  const rows = await supabaseFetch(`extension_usage_events?${params.toString()}`);
  return Array.from(new Set((Array.isArray(rows) ? rows : []).map((row) => row.anonymous_id_hash).filter(Boolean)));
}

function emptyExtensionUsagePayload(window, error = null) {
  const kpis = {
    unique_users: 0,
    active_users_24h: 0,
    active_users_7d: 0,
    active_users_30d: 0,
    new_users: 0,
    returning_users: 0,
    sessions: 0,
    events: 0,
    completed_analyses: 0,
    events_per_user: 0,
    sessions_per_user: 0,
    avg_session_seconds: 0,
    total_usage_seconds_estimated: 0,
    avg_user_seconds_estimated: 0,
    activation_users: 0,
    activation_rate: 0,
    usage_data_quality: "none",
    usage_is_estimated: false,
    usage_has_insufficient_data: true
  };
  const breakdowns = {
    browsers: [],
    countries: [],
    versions: [],
    events: []
  };
  return {
    ok: false,
    generated_at: new Date().toISOString(),
    window_days: window.days,
    window_mode: window.mode,
    window_from_date: window.from_date,
    window_to_date: window.to_date,
    window_start: window.start,
    window_end: window.end,
    window_preset: window.preset,
    timezone: window.timezone,
    range: {
      from: window.from_date,
      to: window.to_date,
      start: window.start,
      end: window.end,
      preset: window.preset,
      timezone: window.timezone
    },
    kpis,
    breakdowns,
    timeseries: [],
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
    table_missing: error ? /extension_usage_events/.test(error.message) : false,
    error: error?.message || ""
  };
}

async function handleExtensionUsageSummary(url) {
  const window = extensionUsageWindow(url);
  const limit = clampLimit(url.searchParams.get("limit"), 10000, 20000);
  const params = new URLSearchParams({
    select:
      "event_name,anonymous_id_hash,session_id_hash,browser_name,browser_version,platform,country,extension_version,duration_seconds,active_seconds,created_at",
    order: "created_at.desc",
    limit: String(limit)
  });
  if (window.start) params.append("created_at", `gte.${window.start}`);
  if (window.end) params.append("created_at", `lte.${window.end}`);

  try {
    const rows = await supabaseFetch(`extension_usage_events?${params.toString()}`);
    let knownUsersBeforeRange = [];
    try {
      knownUsersBeforeRange = await loadKnownExtensionUsersBefore(window);
    } catch (error) {
      knownUsersBeforeRange = [];
    }
    const summary = summarizeExtensionUsage(Array.isArray(rows) ? rows : [], new Date(window.end || Date.now()), {
      timeZone: window.timezone,
      rangeStart: window.start,
      rangeEnd: window.end,
      rangeFromDate: window.from_date,
      rangeToDate: window.to_date,
      preset: window.preset,
      knownUsersBeforeRange
    });
    return {
      ok: true,
      generated_at: new Date().toISOString(),
      window_days: window.days,
      window_mode: window.mode,
      window_from_date: window.from_date || summary.range.from,
      window_to_date: window.to_date || summary.range.to,
      window_start: window.start,
      window_end: window.end,
      window_preset: window.preset,
      timezone: window.timezone,
      event_limit: limit,
      result_limited: Array.isArray(rows) && rows.length >= limit,
      warning: Array.isArray(rows) && rows.length >= limit ? `extension_usage_limited_to_${limit}_events` : "",
      ...summary
    };
  } catch (error) {
    return emptyExtensionUsagePayload(window, error);
  }
}

const OWNED_ANALYTICS_WINDOW_DAYS = new Set([1, 7, 30, 90]);
const OWNED_ANALYTICS_MAX_WINDOW_DAYS = 90;
const OWNED_ANALYTICS_DAY_MS = 24 * 60 * 60 * 1000;

function ownedAnalyticsWindowDays(url) {
  const parsed = Number.parseInt(String(url.searchParams.get("days") || "7"), 10);
  return OWNED_ANALYTICS_WINDOW_DAYS.has(parsed) ? parsed : 7;
}

function parseOwnedAnalyticsDate(value, endOfDay = false) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const suffix = endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z";
    const date = new Date(`${raw}${suffix}`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  if (!endOfDay || /T/.test(raw)) return date;
  date.setUTCHours(23, 59, 59, 999);
  return date;
}

function dateOnly(value) {
  return value.toISOString().slice(0, 10);
}

function ownedAnalyticsWindow(url, now = new Date()) {
  const fromParam = url.searchParams.get("from") || url.searchParams.get("from_date");
  const toParam = url.searchParams.get("to") || url.searchParams.get("to_date");
  const from = parseOwnedAnalyticsDate(fromParam);
  const to = parseOwnedAnalyticsDate(toParam, true);

  if (fromParam || toParam) {
    if (from && to) {
      let windowStart = from;
      let windowEnd = to;
      if (windowStart > windowEnd) [windowStart, windowEnd] = [windowEnd, windowStart];

      const windowEndDayStart = new Date(Date.UTC(windowEnd.getUTCFullYear(), windowEnd.getUTCMonth(), windowEnd.getUTCDate()));
      const earliest = new Date(windowEndDayStart.getTime() - (OWNED_ANALYTICS_MAX_WINDOW_DAYS - 1) * OWNED_ANALYTICS_DAY_MS);
      const clamped = windowStart < earliest;
      if (clamped) windowStart = earliest;
      const windowMs = Math.max(OWNED_ANALYTICS_DAY_MS, windowEnd.getTime() - windowStart.getTime());
      const windowDays = Math.min(OWNED_ANALYTICS_MAX_WINDOW_DAYS, Math.max(1, Math.ceil(windowMs / OWNED_ANALYTICS_DAY_MS)));

      return {
        mode: "date_range",
        start: windowStart.toISOString(),
        end: windowEnd.toISOString(),
        from_date: dateOnly(windowStart),
        to_date: dateOnly(windowEnd),
        days: windowDays,
        hours: windowDays * 24,
        clamped
      };
    }
  }

  const days = ownedAnalyticsWindowDays(url);
  const end = now;
  const start = new Date(end.getTime() - days * OWNED_ANALYTICS_DAY_MS);
  return {
    mode: "rolling_days",
    start: start.toISOString(),
    end: end.toISOString(),
    from_date: dateOnly(start),
    to_date: dateOnly(end),
    days,
    hours: days * 24,
    clamped: false
  };
}

async function loadOwnedAnalyticsEvents(url) {
  const window = ownedAnalyticsWindow(url);
  if (!hasSupabaseConfig()) {
    return {
      ok: false,
      table_missing: false,
      reason: "supabase_not_configured",
      generated_at: new Date().toISOString(),
      window_days: window.days,
      window_hours: window.hours,
      window_mode: window.mode,
      window_from_date: window.from_date,
      window_to_date: window.to_date,
      window_start: window.start,
      window_end: window.end,
      window_clamped: window.clamped,
      events: []
    };
  }

  const limit = clampLimit(url.searchParams.get("limit"), 5000, 10000);
  const params = new URLSearchParams({
    select: "event_name,anonymous_session_id,page_path,page_url,page_type,content_type,template_type,slug,city,topic,source,referrer,utm,browser,device_type,metadata,occurred_at,created_at",
    order: "occurred_at.desc",
    limit: String(limit)
  });
  params.append("occurred_at", `gte.${window.start}`);
  params.append("occurred_at", `lte.${window.end}`);

  try {
    const rows = await supabaseFetch(`owned_analytics_events?${params.toString()}`);
    return {
      ok: true,
      table_missing: false,
      generated_at: new Date().toISOString(),
      window_days: window.days,
      window_hours: window.hours,
      window_mode: window.mode,
      window_from_date: window.from_date,
      window_to_date: window.to_date,
      window_start: window.start,
      window_end: window.end,
      window_clamped: window.clamped,
      events: Array.isArray(rows) ? rows : []
    };
  } catch (error) {
    return {
      ok: false,
      table_missing: /owned_analytics_events/i.test(error.message),
      reason: "storage_error",
      error: error.message,
      generated_at: new Date().toISOString(),
      window_days: window.days,
      window_hours: window.hours,
      window_mode: window.mode,
      window_from_date: window.from_date,
      window_to_date: window.to_date,
      window_start: window.start,
      window_end: window.end,
      window_clamped: window.clamped,
      events: []
    };
  }
}

function analyticsGroup(rows, key, limit = 8) {
  const groups = (rows || []).reduce((acc, row) => {
    const label = String(row[key] || "unknown");
    if (!acc[label]) acc[label] = { label, count: 0, install_clicks: 0, checkout_created: 0 };
    acc[label].count += 1;
    if (["install_click", "chrome_store_click", "seo_cta_click", "guide_cta_click", "article_cta_click"].includes(row.event_name)) acc[label].install_clicks += 1;
    if (row.event_name === "checkout_created") acc[label].checkout_created += 1;
    return acc;
  }, {});
  return Object.values(groups)
    .sort((a, b) => b.install_clicks - a.install_clicks || b.checkout_created - a.checkout_created || b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

async function handleOwnedAnalyticsSummary(req, url) {
  if (req.method !== "GET") return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
  const result = await loadOwnedAnalyticsEvents(url);
  const events = result.events || [];
  const pages = summarizePagePerformance(events);
  const learning = buildOwnedAnalyticsLearning(events);
  return {
    status: 200,
    payload: {
      ok: true,
      generated_at: result.generated_at || new Date().toISOString(),
      persisted: Boolean(result.ok),
      table_missing: Boolean(result.table_missing),
      warning: result.ok ? "" : result.reason || result.error || "analytics_unavailable",
      window_days: result.window_days,
      window_hours: result.window_hours,
      window_mode: result.window_mode,
      window_from_date: result.window_from_date,
      window_to_date: result.window_to_date,
      window_start: result.window_start,
      window_end: result.window_end,
      window_clamped: Boolean(result.window_clamped),
      summary: summarizeOwnedAnalytics(events),
      top_pages: pages.slice(0, 10),
      top_cities: analyticsGroup(events, "city"),
      top_templates: analyticsGroup(events, "template_type"),
      top_topics: analyticsGroup(events, "topic"),
      high_interaction_low_install: learning.high_interaction_low_install,
      calculator_install_pages: learning.calculator_install_pages,
      calculator_low_conversion: learning.calculator_low_conversion,
      recommendations: learning.recommendations
    }
  };
}

async function handleOwnedAnalyticsPages(req, url) {
  if (req.method !== "GET") return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
  const result = await loadOwnedAnalyticsEvents(url);
  const pages = summarizePagePerformance(result.events || []);
  const limit = clampLimit(url.searchParams.get("page_limit"), 50, 100);
  return {
    status: 200,
    payload: {
      ok: true,
      persisted: Boolean(result.ok),
      table_missing: Boolean(result.table_missing),
      warning: result.ok ? "" : result.reason || result.error || "analytics_unavailable",
      window_days: result.window_days,
      window_hours: result.window_hours,
      window_mode: result.window_mode,
      window_from_date: result.window_from_date,
      window_to_date: result.window_to_date,
      window_start: result.window_start,
      window_end: result.window_end,
      window_clamped: Boolean(result.window_clamped),
      pages: pages.slice(0, limit)
    }
  };
}

async function handleOwnedAnalyticsLearning(req, url) {
  if (req.method !== "GET") return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
  const result = await loadOwnedAnalyticsEvents(url);
  const learning = buildOwnedAnalyticsLearning(result.events || []);
  return {
    status: 200,
    payload: {
      ok: true,
      persisted: Boolean(result.ok),
      table_missing: Boolean(result.table_missing),
      warning: result.ok ? "" : result.reason || result.error || "analytics_unavailable",
      window_days: result.window_days,
      window_hours: result.window_hours,
      window_mode: result.window_mode,
      window_from_date: result.window_from_date,
      window_to_date: result.window_to_date,
      window_start: result.window_start,
      window_end: result.window_end,
      window_clamped: Boolean(result.window_clamped),
      ...learning
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
    select: "status,index_status,quality_score,template_type,published_at,updated_at,last_generated_at",
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
  const dailyPolicy = buildSeoDailyPolicySnapshot(landings);

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
    published_landings_today: dailyPolicy.published_landings_today,
    published_news_today: dailyPolicy.published_news_today,
    target_landings_per_day: SEO_DAILY_TARGETS.landings,
    target_news_per_day: SEO_DAILY_TARGETS.news,
    seo_daily_status: dailyPolicy.published_landings_today >= SEO_DAILY_TARGETS.landings && dailyPolicy.published_news_today >= SEO_DAILY_TARGETS.news ? "complete" : "pending",
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
    return { status: 200, payload: await getSeoAutogenerationStatus() };
  }
  if (!["GET", "POST"].includes(req.method)) {
    return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
  }

  const body = req.method === "POST" ? await readJsonBody(req) : {};
  const dryRun = dryRunOverrideFromRequest(req, url, body);
  const config = {};
  if (typeof dryRun === "boolean") config.dryRun = dryRun;
  const requestSource = isCronTokenRequest(req) && !isAdminTokenRequest(req) ? "cron" : "admin";
  const result = await runSeoAutogeneration({ requestSource, config });
  return { status: result.ok === false ? 500 : 200, payload: result };
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
  let accessToken;
  try {
    accessToken = await loadMetaAccessToken(connection);
  } catch (error) {
    return await patchMetaPost(id, { status: "skipped", error_message: sanitizeMetaSecretText(error.message || "meta_access_token_missing") });
  }
  await patchMetaPost(id, { status: "publishing", error_message: null });
  try {
    const platform = String(post.platform || "").toLowerCase();
    const link = withUtm(post.source_url, platform, { city: post.city, slug: post.source_slug }, process.env);
    const result = await publishMetaToPlatform({
      platform,
      accessToken,
      pageId: connection.facebook_page_id || process.env.META_FACEBOOK_PAGE_ID,
      instagramBusinessAccountId: connection.instagram_business_account_id || process.env.META_INSTAGRAM_BUSINESS_ACCOUNT_ID,
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
  const run = await createMetaRun(triggerType, "multi");
  const finish = (patch) => finishMetaRun(run, patch).then(() => patch);
  if (!hasSupabaseConfig()) {
    console.log("[Meta Autopublisher] skipped: supabase_not_configured");
    return finish({ status: "skipped", skipped_count: 1, published_count: 0, failed_count: 0, error_message: "supabase_not_configured" });
  }
  const [settingsState, connectionState, postsState] = await Promise.all([
    readMetaSettings(),
    readMetaConnectionState(),
    listMetaPosts(new URL("https://admin.local/?limit=100"), 100)
  ]);
  if (settingsState.table_missing || connectionState.table_missing || postsState.table_missing) {
    console.log("[Meta Autopublisher] skipped: table_missing");
    return finish({ status: "skipped", skipped_count: 1, published_count: 0, failed_count: 0, error_message: "table_missing" });
  }
  if (settingsState.error || connectionState.error || postsState.error) {
    const message = sanitizeMetaSecretText(settingsState.error || connectionState.error || postsState.error);
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
  const settings = settingsState.settings;
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
  const scopes = String(url.searchParams.get("scopes") || "")
    .split(/[\s,]+/)
    .filter(Boolean);
  const result = buildMetaAuthorizationUrl({ scopes: scopes.length ? scopes : undefined });
  return { status: 200, payload: { ok: true, ...result } };
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

const ADMIN_SUPABASE_READ_ONLY_ROUTES = createAdminRouter([
  {
    resource: "summary",
    method: "GET",
    handler: () => handleSummary()
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
    handler: ({ req, url }) => handleSeoLandings(req, url)
  },
  {
    resource: "kpis/settings",
    method: "GET",
    fallbackOnMethodMismatch: true,
    handler: ({ req }) => handleKpiSettings(req)
  }
]);

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
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
    if (!hasSupabaseConfig()) {
      return json(res, 500, { ok: false, error: "supabase_not_configured" });
    }
    const supabaseReadOnly = await dispatchAdminRoute(ADMIN_SUPABASE_READ_ONLY_ROUTES, { req, url, resource });
    if (supabaseReadOnly) {
      return json(res, supabaseReadOnly.status, supabaseReadOnly.payload);
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
    if (resource === "linkedin" || resource.startsWith("linkedin/")) {
      const result = await handleLinkedIn(req, url, resource);
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
};
