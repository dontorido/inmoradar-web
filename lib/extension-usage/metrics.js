const crypto = require("node:crypto");

const BROWSER_RULES = [
  ["edge", /\bEdg\/([\d.]+)/i],
  ["chrome", /\bChrome\/([\d.]+)/i],
  ["firefox", /\bFirefox\/([\d.]+)/i],
  ["safari", /\bVersion\/([\d.]+).*Safari/i],
  ["opera", /\bOPR\/([\d.]+)/i]
];

const ALLOWED_METADATA_KEYS = new Set([
  "area",
  "attribution_id",
  "campaign",
  "click_timestamp",
  "cta",
  "derived_from",
  "has_market_reference",
  "has_parking_assessment",
  "has_price",
  "has_surface",
  "install_source",
  "landing_path",
  "locale",
  "manifest_version",
  "operation_type",
  "portal",
  "reason",
  "store",
  "target",
  "utm_campaign",
  "utm_content",
  "utm_medium",
  "utm_source",
  "utm_term"
]);
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const URL_PATTERN = /https?:\/\/\S+|www\.\S+/gi;
const PHONE_PATTERN = /\+?\d[\d\s().-]{7,}\d/g;
const LONG_NUMBER_PATTERN = /\b\d{5,}\b/g;

function clampNumber(value, min, max, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function normalizeToken(value, fallback = "unknown", maxLength = 80) {
  const text = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, maxLength);
  return text || fallback;
}

function normalizeCountry(value) {
  const country = String(value || "").trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
  return country || "XX";
}

function normalizeVersion(value) {
  const version = String(value || "").trim().replace(/[^0-9a-zA-Z._-]+/g, "").slice(0, 32);
  return version || "unknown";
}

function normalizeDate(value, fallback = new Date()) {
  const date = value ? new Date(value) : fallback;
  if (Number.isNaN(date.getTime())) return fallback.toISOString();
  return date.toISOString();
}

function normalizePageDomain(value) {
  const raw = String(value || "").trim().slice(0, 240);
  if (!raw) return "unknown";

  let host = raw;
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    host = url.hostname;
  } catch {
    host = raw.split(/[/?#]/)[0];
  }

  return normalizeToken(host.replace(/^www\./i, ""), "unknown", 120);
}

function normalizeLandingPath(value) {
  const raw = String(value || "").trim().slice(0, 180);
  if (!raw) return null;
  let path = raw.split(/[?#]/)[0];
  try {
    const url = new URL(raw.includes("://") ? raw : `https://www.inmoradar.app${raw.startsWith("/") ? raw : `/${raw}`}`);
    path = url.pathname || "/";
  } catch {
    path = raw.split(/[?#]/)[0];
  }
  path = `/${String(path || "/").replace(/^\/+/, "")}`;
  return path
    .replace(/[^a-zA-Z0-9/_-]+/g, "-")
    .replace(/\/{2,}/g, "/")
    .slice(0, 160) || "/";
}

function hashIdentifier(value, salt = "") {
  const text = String(value || "").trim();
  if (!text) return null;
  return crypto.createHash("sha256").update(`${salt}:${text}`).digest("hex").slice(0, 48);
}

function browserFromUserAgent(userAgent = "") {
  const agent = String(userAgent || "");
  for (const [name, pattern] of BROWSER_RULES) {
    const match = agent.match(pattern);
    if (match) {
      return {
        browser_name: name,
        browser_version: normalizeVersion(match[1])
      };
    }
  }
  return {
    browser_name: "unknown",
    browser_version: "unknown"
  };
}

function sanitizeMetadataValue(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return Math.max(-100000, Math.min(100000, Math.round(value)));
  }

  const clean = String(value || "")
    .replace(URL_PATTERN, "[url]")
    .replace(EMAIL_PATTERN, "[email]")
    .replace(PHONE_PATTERN, "[number]")
    .replace(LONG_NUMBER_PATTERN, "[number]")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return clean || null;
}

function sanitizeMetadata(metadata = {}, base = {}) {
  const clean = {};
  for (const [rawKey, rawValue] of Object.entries({ ...metadata, ...base }).slice(0, 24)) {
    const key = normalizeToken(rawKey, "", 40);
    if (!ALLOWED_METADATA_KEYS.has(key)) continue;
    const value =
      key === "landing_path"
        ? normalizeLandingPath(rawValue)
        : key === "click_timestamp"
          ? String(rawValue || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 40)
          : sanitizeMetadataValue(rawValue);
    if (value !== null && value !== undefined && value !== "") clean[key] = value;
  }
  return clean;
}

function extensionUsageEventFromInput(input = {}, headers = {}, options = {}) {
  const userAgentBrowser = browserFromUserAgent(headers["user-agent"] || headers["User-Agent"] || "");
  const salt = options.hashSalt || process.env.EXTENSION_USAGE_HASH_SECRET || process.env.ADMIN_IMPORT_TOKEN || "inmoradar";
  const durationSeconds = clampNumber(input.duration_seconds ?? input.durationSeconds, 0, 60 * 60 * 12, 0);
  const activeSeconds = clampNumber(input.active_seconds ?? input.activeSeconds, 0, 60 * 60 * 12, durationSeconds);
  const country =
    input.country ||
    headers["x-vercel-ip-country"] ||
    headers["cf-ipcountry"] ||
    headers["x-country-code"] ||
    headers["X-Vercel-IP-Country"];

  return {
    event_name: normalizeToken(input.event_name || input.eventName || "heartbeat", "heartbeat", 48),
    anonymous_id_hash: hashIdentifier(
      input.anonymous_user_id || input.anonymousUserId || input.anonymous_id || input.anonymousId || input.client_id || input.clientId,
      salt
    ),
    session_id_hash: hashIdentifier(input.session_id || input.sessionId, salt),
    page_domain: normalizePageDomain(input.page_domain || input.pageDomain || input.page_url || input.pageUrl),
    occurred_at: normalizeDate(input.occurred_at || input.occurredAt || input.timestamp || input.created_at),
    browser_name: normalizeToken(input.browser_name || input.browserName || input.browser || userAgentBrowser.browser_name, "unknown", 32),
    browser_version: normalizeVersion(input.browser_version || input.browserVersion || userAgentBrowser.browser_version),
    platform: normalizeToken(input.platform || input.os || "unknown", "unknown", 40),
    country: normalizeCountry(country),
    extension_version: normalizeVersion(input.extension_version || input.extensionVersion),
    duration_seconds: durationSeconds,
    active_seconds: activeSeconds,
    source: normalizeToken(input.source || "extension", "extension", 40),
    metadata: sanitizeMetadata(input.metadata, {
      manifest_version: input.manifest_version || input.manifestVersion || null,
      locale: String(input.locale || "").slice(0, 16) || null
    })
  };
}

function uniqueCount(rows, key) {
  return new Set(rows.map((row) => row[key]).filter(Boolean)).size;
}

function sumSeconds(rows, key) {
  return rows.reduce((sum, row) => sum + clampNumber(row[key], 0, 60 * 60 * 12, 0), 0);
}

function topCounts(rows, key, limit = 8) {
  const counts = rows.reduce((acc, row) => {
    const value = String(row[key] || "unknown");
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function eventTime(row = {}) {
  const timestamp = new Date(row.occurred_at || row.created_at).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function rowsForEvent(rows = [], eventName = "") {
  return rows.filter((row) => row.event_name === eventName);
}

function uniqueUsersForEvent(rows = [], eventName = "") {
  return uniqueCount(rowsForEvent(rows, eventName), "anonymous_id_hash");
}

function rate(numerator, denominator) {
  const top = Number(numerator || 0);
  const bottom = Number(denominator || 0);
  if (!bottom) return 0;
  return Math.round((top / bottom) * 1000) / 10;
}

function firstListingAnalysisUsers(rows = []) {
  const explicit = rowsForEvent(rows, "first_listing_analysis")
    .map((row) => row.anonymous_id_hash)
    .filter(Boolean);
  const users = new Set(explicit);
  rowsForEvent(rows, "analysis_completed")
    .filter((row) => row.anonymous_id_hash)
    .sort((left, right) => eventTime(left) - eventTime(right))
    .forEach((row) => users.add(row.anonymous_id_hash));
  return users;
}

function firstListingAnalysisEventFrom(event = {}) {
  if (event.event_name !== "analysis_completed" || !event.anonymous_id_hash) return null;
  return {
    ...event,
    event_name: "first_listing_analysis",
    source: normalizeToken(event.source || "extension", "extension", 40),
    metadata: sanitizeMetadata(event.metadata, { derived_from: "analysis_completed" })
  };
}

function summarizeExtensionUsage(rows = [], now = new Date()) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const since24h = nowMs - 24 * 60 * 60 * 1000;
  const since7d = nowMs - 7 * 24 * 60 * 60 * 1000;
  const rows24h = safeRows.filter((row) => eventTime(row) >= since24h);
  const rows7d = safeRows.filter((row) => eventTime(row) >= since7d);
  const activeSeconds = sumSeconds(safeRows, "active_seconds") || sumSeconds(safeRows, "duration_seconds");
  const sessions = uniqueCount(safeRows, "session_id_hash");
  const extensionOpened = rowsForEvent(safeRows, "extension_opened").length;
  const listingDetected = rowsForEvent(safeRows, "listing_detected").length;
  const analysisStarted = rowsForEvent(safeRows, "analysis_started").length;
  const analysisCompleted = rowsForEvent(safeRows, "analysis_completed").length;
  const firstAnalysisUsers = firstListingAnalysisUsers(safeRows);
  const extensionOpenedUsers = uniqueUsersForEvent(safeRows, "extension_opened");

  return {
    total_events: safeRows.length,
    unique_users_30d: uniqueCount(safeRows, "anonymous_id_hash"),
    active_users_7d: uniqueCount(rows7d, "anonymous_id_hash"),
    active_users_24h: uniqueCount(rows24h, "anonymous_id_hash"),
    sessions_30d: sessions,
    active_seconds_30d: activeSeconds,
    average_session_seconds: sessions ? Math.round(activeSeconds / sessions) : 0,
    by_browser: topCounts(safeRows, "browser_name"),
    by_country: topCounts(safeRows, "country"),
    by_page_domain: topCounts(safeRows, "page_domain"),
    by_extension_version: topCounts(safeRows, "extension_version"),
    by_event_name: topCounts(safeRows, "event_name"),
    extension_opened: extensionOpened,
    listing_detected: listingDetected,
    analysis_started: analysisStarted,
    analysis_completed: analysisCompleted,
    first_listing_analysis: firstAnalysisUsers.size,
    first_listing_analysis_events: rowsForEvent(safeRows, "first_listing_analysis").length,
    users_with_extension_opened: extensionOpenedUsers,
    users_with_analysis_completed: uniqueUsersForEvent(safeRows, "analysis_completed"),
    users_with_first_listing_analysis: firstAnalysisUsers.size,
    listing_detected_to_analysis_completed_rate: rate(analysisCompleted, listingDetected),
    extension_opened_to_first_listing_analysis_rate: rate(firstAnalysisUsers.size, extensionOpenedUsers)
  };
}

module.exports = {
  browserFromUserAgent,
  extensionUsageEventFromInput,
  firstListingAnalysisEventFrom,
  hashIdentifier,
  normalizeCountry,
  normalizePageDomain,
  sanitizeMetadata,
  summarizeExtensionUsage
};
