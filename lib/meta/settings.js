const DEFAULT_SITE_URL = "https://www.inmoradar.app";
const DEFAULT_GRAPH_VERSION = "v23.0";
const META_MANUAL_MODE_NOTICE =
  "Meta Autopublisher esta preparado para Facebook Page e Instagram profesional, pero la publicacion real solo se activa con OAuth valido, Page seleccionada, permisos suficientes, META_AUTOPOST_ENABLED=true y autopost_enabled=true.";

const META_INSTAGRAM_BUSINESS_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish"
];

const META_FACEBOOK_PAGE_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts"
];

const META_LEGACY_INSTAGRAM_SCOPES = [
  "instagram_basic",
  "instagram_content_publish"
];

const META_REQUIRED_SCOPES = META_INSTAGRAM_BUSINESS_SCOPES;

const META_SCOPE_ALIASES = {
  instagram_business_basic: ["instagram_basic", "business_basic"],
  instagram_business_content_publish: ["instagram_content_publish", "business_content_publish"]
};

const META_POST_STATUSES = ["draft", "queued", "publishing", "published", "failed", "skipped"];
const META_PLATFORMS = ["facebook", "instagram"];
const META_CONNECTION_STATUSES = [
  "disconnected",
  "needs_connection",
  "needs_page",
  "needs_instagram",
  "needs_permissions",
  "needs_reauth",
  "connected",
  "expired",
  "error"
];

function cleanText(value, max = 4000) {
  return String(value || "").replace(/\u0000/g, "").trim().slice(0, max);
}

function sanitizeSecretText(value, max = 800) {
  return String(value || "")
    .replace(/(access_token=)[^&\s]+/gi, "$1[redacted]")
    .replace(/(fb_exchange_token=)[^&\s]+/gi, "$1[redacted]")
    .replace(/(client_secret=)[^&\s]+/gi, "$1[redacted]")
    .replace(/(authorization:\s*bearer\s+)[^\s]+/gi, "$1[redacted]")
    .replace(/\b(?:EA[A-Za-z0-9_-]{20,}|EAA[A-Za-z0-9_-]{20,})\b/g, "[redacted]")
    .replace(/\b[A-Za-z0-9_-]{96,}\b/g, "[redacted]")
    .slice(0, max);
}

function configured(value) {
  return Boolean(String(value || "").trim());
}

function boolEnv(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function intEnv(value, fallback, min = 1, max = 365) {
  const number = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(number) || Number.isNaN(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function siteUrl(env = process.env) {
  return cleanText(env.PUBLIC_SITE_URL || env.SITE_URL || DEFAULT_SITE_URL, 500).replace(/\/+$/, "");
}

function metaConfig(env = process.env) {
  return {
    appId: cleanText(env.META_APP_ID, 300),
    appSecret: cleanText(env.META_APP_SECRET, 1000),
    redirectUri: cleanText(env.META_REDIRECT_URI || `${siteUrl(env)}/api/meta/oauth/callback`, 1000),
    encryptionKey: cleanText(env.META_ACCESS_TOKEN_ENCRYPTION_KEY, 1000),
    graphVersion: cleanText(env.META_GRAPH_VERSION || DEFAULT_GRAPH_VERSION, 20),
    graphUrl: cleanText(env.META_GRAPH_URL || "https://graph.facebook.com", 200).replace(/\/+$/, ""),
    authUrl: cleanText(env.META_AUTH_URL || "https://www.facebook.com", 200).replace(/\/+$/, ""),
    autopostEnabled: boolEnv(env.META_AUTOPOST_ENABLED, false),
    frequencyDays: intEnv(env.META_AUTOPOST_FREQUENCY_DAYS, 1, 1, 30),
    maxPerDay: intEnv(env.META_AUTOPOST_MAX_PER_DAY, 1, 1, 10),
    preferredTime: cleanText(env.META_AUTOPOST_TIME || "10:00", 20),
    timezone: cleanText(env.META_AUTOPOST_TIMEZONE || "Europe/Madrid", 80),
    facebookPageId: cleanText(env.META_FACEBOOK_PAGE_ID, 120),
    facebookPageName: cleanText(env.META_FACEBOOK_PAGE_NAME, 200),
    instagramBusinessAccountId: cleanText(env.META_INSTAGRAM_ACCOUNT_ID || env.META_INSTAGRAM_BUSINESS_ACCOUNT_ID, 120),
    siteUrl: siteUrl(env)
  };
}

function metaEnvStatus(env = process.env) {
  const config = metaConfig(env);
  return {
    app_id_configured: configured(config.appId),
    app_secret_configured: configured(config.appSecret),
    redirect_uri_configured: configured(config.redirectUri),
    encryption_key_configured: configured(config.encryptionKey),
    facebook_page_id_configured: configured(config.facebookPageId),
    facebook_page_name: config.facebookPageName || null,
    instagram_business_account_id_configured: configured(config.instagramBusinessAccountId),
    instagram_account_id_configured: configured(config.instagramBusinessAccountId),
    graph_version: config.graphVersion,
    autopost_env_enabled: config.autopostEnabled,
    frequency_days: config.frequencyDays,
    max_per_day: config.maxPerDay,
    preferred_time: config.preferredTime,
    timezone: config.timezone,
    automatic_available_by_env:
      configured(config.appId) &&
      configured(config.appSecret) &&
      configured(config.redirectUri) &&
      configured(config.encryptionKey)
  };
}

function defaultSettings(env = process.env) {
  const config = metaConfig(env);
  return {
    autopost_enabled: false,
    frequency_days: config.frequencyDays || 1,
    max_per_day: config.maxPerDay || 1,
    preferred_time: config.preferredTime || "10:00",
    timezone: config.timezone || "Europe/Madrid",
    facebook_enabled: true,
    instagram_enabled: true,
    content_mode: "seo_landings",
    last_error: null
  };
}

function normalizeSettings(input = {}, env = process.env) {
  const fallback = defaultSettings(env);
  const frequencyDays = intEnv(input.frequency_days, fallback.frequency_days, 1, 30);
  const maxPerDay = intEnv(input.max_per_day ?? input.max_posts_per_day, fallback.max_per_day, 1, 10);
  const preferredTime = /^\d{2}:\d{2}$/.test(String(input.preferred_time || input.daily_post_time || ""))
    ? String(input.preferred_time || input.daily_post_time)
    : fallback.preferred_time;
  const contentMode = cleanText(input.content_mode || fallback.content_mode, 80);
  return {
    autopost_enabled: input.autopost_enabled === true || input.auto_publish_enabled === true,
    frequency_days: frequencyDays,
    max_per_day: maxPerDay,
    preferred_time: preferredTime,
    timezone: cleanText(input.timezone || fallback.timezone, 80),
    facebook_enabled: input.facebook_enabled === false ? false : true,
    instagram_enabled: input.instagram_enabled === false ? false : true,
    content_mode: contentMode || "seo_landings",
    last_error: input.last_error || null
  };
}

function normalizeScopes(value) {
  if (Array.isArray(value)) return [...new Set(value.map((item) => cleanText(item, 120)).filter(Boolean))];
  if (value && typeof value === "object") {
    if (Array.isArray(value.scopes)) return normalizeScopes(value.scopes);
    if (Array.isArray(value.data)) return normalizeScopes(value.data);
  }
  return String(value || "")
    .split(/[\s,]+/)
    .map((item) => cleanText(item, 120))
    .filter(Boolean);
}

function missingRequiredScopes(scopes, required = META_REQUIRED_SCOPES) {
  const granted = new Set(normalizeScopes(scopes));
  return required.filter((scope) => {
    if (granted.has(scope)) return false;
    return !(META_SCOPE_ALIASES[scope] || []).some((alias) => granted.has(alias));
  });
}

function requiredScopesForPlatform(platform = "instagram") {
  const key = String(platform || "").toLowerCase();
  if (key === "facebook") return META_FACEBOOK_PAGE_SCOPES;
  if (key === "instagram") return META_INSTAGRAM_BUSINESS_SCOPES;
  return META_REQUIRED_SCOPES;
}

function summarizeConnection(connection = null, env = process.env) {
  const config = metaConfig(env);
  const row = connection || {};
  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : null;
  const expired = expiresAt && expiresAt <= Date.now();
  const scopes = normalizeScopes(row.scopes);
  const missingScopes = missingRequiredScopes(scopes);
  const facebookMissingScopes = missingRequiredScopes(scopes, META_FACEBOOK_PAGE_SCOPES);
  const instagramMissingScopes = missingRequiredScopes(scopes, META_INSTAGRAM_BUSINESS_SCOPES);
  const facebookPageId = row.facebook_page_id || config.facebookPageId || "";
  const facebookPageName = row.facebook_page_name || config.facebookPageName || "";
  const instagramBusinessAccountId = row.instagram_business_account_id || config.instagramBusinessAccountId || "";
  const hasToken = Boolean(row.page_access_token_encrypted || row.access_token_encrypted);
  const hasUserOrInstagramToken = Boolean(row.user_access_token_encrypted || row.access_token_encrypted);
  const hasPageToken = Boolean(row.page_access_token_encrypted);
  const configuredStatus = row.status || (configured(config.appId) && configured(config.redirectUri) ? "needs_connection" : "disconnected");
  let status = expired && configuredStatus === "connected" ? "needs_reauth" : configuredStatus;
  if (status === "connected" && missingScopes.length) status = "needs_permissions";
  if (status === "connected" && !instagramBusinessAccountId) status = "needs_instagram";

  const automaticAvailable =
    status === "connected" &&
    hasUserOrInstagramToken &&
    configured(instagramBusinessAccountId) &&
    configured(config.appId) &&
    configured(config.appSecret) &&
    configured(config.redirectUri) &&
    configured(config.encryptionKey) &&
    instagramMissingScopes.length === 0;

  const facebookPublishAvailable =
    configured(facebookPageId) &&
    hasPageToken &&
    facebookMissingScopes.length === 0;

  const instagramPublishAvailable =
    configured(instagramBusinessAccountId) &&
    hasUserOrInstagramToken &&
    instagramMissingScopes.length === 0;

  return {
    provider: "meta",
    status,
    facebook_user_id: row.facebook_user_id || null,
    facebook_page_id: facebookPageId || null,
    facebook_page_name: facebookPageName || null,
    instagram_business_account_id: instagramBusinessAccountId || null,
    scopes,
    missing_scopes: missingScopes,
    facebook_missing_scopes: facebookMissingScopes,
    instagram_missing_scopes: instagramMissingScopes,
    token_expires_at: row.token_expires_at || null,
    last_error: row.last_error || null,
    updated_at: row.updated_at || null,
    has_facebook_page: configured(facebookPageId),
    has_instagram_account: configured(instagramBusinessAccountId),
    has_page_access_token: hasPageToken,
    facebook_publish_available: facebookPublishAvailable,
    instagram_publish_available: instagramPublishAvailable,
    automatic_available: automaticAvailable,
    autopost_enabled: config.autopostEnabled,
    manual_available: true,
    notice: automaticAvailable ? null : META_MANUAL_MODE_NOTICE
  };
}

function postDayKey(value, timeZone = "Europe/Madrid") {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function publishedPostsForDay(posts = [], platform, date = new Date(), timeZone = "Europe/Madrid") {
  const key = postDayKey(date, timeZone);
  return posts.filter((post) => {
    if (platform && String(post.platform || "").toLowerCase() !== platform) return false;
    const published = post.published_at;
    return published && postDayKey(published, timeZone) === key && String(post.status || "") === "published";
  });
}

function lastPublishedAt(posts = [], platform = "") {
  return posts
    .filter((post) => !platform || String(post.platform || "").toLowerCase() === platform)
    .map((post) => post.published_at)
    .filter(Boolean)
    .sort()
    .pop() || null;
}

function daysSince(value, now = new Date()) {
  if (!value) return Number.POSITIVE_INFINITY;
  const start = new Date(value).getTime();
  const end = new Date(now).getTime();
  if (!Number.isFinite(start) || Number.isNaN(start) || Number.isNaN(end)) return Number.POSITIVE_INFINITY;
  return Math.floor((end - start) / 86400000);
}

function nextScheduledAt(settings = defaultSettings(), now = new Date()) {
  const normalized = normalizeSettings(settings);
  const [hour, minute] = String(normalized.preferred_time || "10:00").split(":").map((part) => Number.parseInt(part, 10));
  const next = new Date(now);
  next.setHours(Number.isFinite(hour) ? hour : 10, Number.isFinite(minute) ? minute : 0, 0, 0);
  if (next.getTime() <= new Date(now).getTime()) next.setDate(next.getDate() + normalized.frequency_days);
  return next.toISOString();
}

function shouldRunAutopublisher({ posts = [], settings = defaultSettings(), connection = null, env = process.env, platform = "facebook", now = new Date() } = {}) {
  const normalized = normalizeSettings(settings, env);
  const config = metaConfig(env);
  const summary = summarizeConnection(connection, env);
  const platformKey = String(platform || "").toLowerCase();
  if (!META_PLATFORMS.includes(platformKey)) return { ok: false, reason: "unsupported_platform" };
  if (!config.autopostEnabled) return { ok: false, reason: "META_AUTOPOST_ENABLED=false" };
  if (!normalized.autopost_enabled) return { ok: false, reason: "autopost_enabled=false" };
  if (platformKey === "facebook" && !normalized.facebook_enabled) return { ok: false, reason: "facebook_disabled" };
  if (platformKey === "instagram" && !normalized.instagram_enabled) return { ok: false, reason: "instagram_disabled" };
  if (!summary.has_facebook_page) return { ok: false, reason: "missing_facebook_page_id" };
  if (platformKey === "instagram" && !summary.has_instagram_account) return { ok: false, reason: "missing_instagram_business_account_id" };
  const platformMissingScopes = missingRequiredScopes(summary.scopes, requiredScopesForPlatform(platformKey));
  if (platformMissingScopes.length) return { ok: false, reason: `missing_permissions:${platformMissingScopes.join(",")}`, missing_scopes: platformMissingScopes };
  if (platformKey === "facebook" && !summary.has_page_access_token) return { ok: false, reason: "missing_facebook_page_access_token" };
  if (!configured(config.appId) || !configured(config.appSecret) || !configured(config.redirectUri) || !configured(config.encryptionKey)) {
    return { ok: false, reason: "meta_env_not_configured" };
  }
  if (!summary.automatic_available) return { ok: false, reason: "missing_connection" };
  if (publishedPostsForDay(posts, platformKey, now, normalized.timezone).length >= normalized.max_per_day) {
    return { ok: false, reason: "max_per_day_reached" };
  }
  const lastPublished = lastPublishedAt(posts, platformKey);
  if (lastPublished && daysSince(lastPublished, now) < normalized.frequency_days) {
    return { ok: false, reason: "frequency_not_due", last_published_at: lastPublished };
  }
  return { ok: true, reason: "due", platform: platformKey };
}

module.exports = {
  DEFAULT_GRAPH_VERSION,
  DEFAULT_SITE_URL,
  META_CONNECTION_STATUSES,
  META_MANUAL_MODE_NOTICE,
  META_FACEBOOK_PAGE_SCOPES,
  META_INSTAGRAM_BUSINESS_SCOPES,
  META_LEGACY_INSTAGRAM_SCOPES,
  META_PLATFORMS,
  META_POST_STATUSES,
  META_REQUIRED_SCOPES,
  META_SCOPE_ALIASES,
  cleanText,
  configured,
  defaultSettings,
  intEnv,
  lastPublishedAt,
  metaConfig,
  metaEnvStatus,
  missingRequiredScopes,
  nextScheduledAt,
  normalizeScopes,
  normalizeSettings,
  postDayKey,
  publishedPostsForDay,
  requiredScopesForPlatform,
  sanitizeSecretText,
  shouldRunAutopublisher,
  siteUrl,
  summarizeConnection
};
