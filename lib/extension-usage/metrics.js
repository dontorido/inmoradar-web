const crypto = require("node:crypto");

const BROWSER_RULES = [
  ["edge", /\bEdg\/([\d.]+)/i],
  ["chrome", /\bChrome\/([\d.]+)/i],
  ["firefox", /\bFirefox\/([\d.]+)/i],
  ["safari", /\bVersion\/([\d.]+).*Safari/i],
  ["opera", /\bOPR\/([\d.]+)/i]
];

const REQUIRED_EXTENSION_USAGE_EVENTS = [
  "extension_installed",
  "extension_opened",
  "listing_detected",
  "analysis_started",
  "analysis_completed",
  "cta_clicked",
  "error"
];

const EVENT_ALIASES = {
  install: "extension_installed",
  installed: "extension_installed",
  open: "extension_opened",
  opened: "extension_opened",
  session_start: "extension_opened",
  analysis_complete: "analysis_completed",
  cta_click: "cta_clicked"
};

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

function normalizeEventName(value) {
  const token = normalizeToken(value || "heartbeat", "heartbeat", 48);
  return EVENT_ALIASES[token] || token;
}

function normalizeTimestamp(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  const now = Date.now();
  const time = Math.max(now - 7 * 24 * 60 * 60 * 1000, Math.min(date.getTime(), now + 5 * 60 * 1000));
  return new Date(time).toISOString();
}

function normalizePageDomain(value) {
  const raw = String(value || "").trim().slice(0, 240);
  if (!raw) return "unknown";
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return normalizeToken(url.hostname.replace(/^www\./i, ""), "unknown", 120);
  } catch {
    return normalizeToken(raw.replace(/^www\./i, ""), "unknown", 120);
  }
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
  const anonymousUserId = input.anonymous_user_id || input.anonymousUserId || input.anonymous_id || input.anonymousId || input.client_id || input.clientId;
  const sessionId = input.session_id || input.sessionId;

  return {
    event_name: normalizeEventName(input.event_name || input.eventName || "heartbeat"),
    anonymous_id_hash: hashIdentifier(anonymousUserId, salt),
    session_id_hash: hashIdentifier(sessionId, salt),
    browser_name: normalizeToken(input.browser_name || input.browserName || userAgentBrowser.browser_name, "unknown", 32),
    browser_version: normalizeVersion(input.browser_version || input.browserVersion || userAgentBrowser.browser_version),
    platform: normalizeToken(input.platform || input.os || "unknown", "unknown", 40),
    country: normalizeCountry(country),
    extension_version: normalizeVersion(input.extension_version || input.extensionVersion),
    page_domain: normalizePageDomain(input.page_domain || input.pageDomain || input.domain || input.page_url || input.pageUrl || input.url),
    occurred_at: normalizeTimestamp(input.timestamp || input.occurred_at || input.occurredAt || input.created_at || input.createdAt),
    duration_seconds: durationSeconds,
    active_seconds: activeSeconds,
    source: "extension",
    metadata: {
      manifest_version: input.manifest_version || input.manifestVersion || null,
      locale: String(input.locale || "").slice(0, 16) || null
    }
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

function countMap(rows, key) {
  return rows.reduce((acc, row) => {
    const value = String(row[key] || "unknown");
    acc.set(value, (acc.get(value) || 0) + 1);
    return acc;
  }, new Map());
}

function eventTime(row = {}) {
  return new Date(row.occurred_at || row.created_at || 0).getTime();
}

function latestEvent(rows) {
  const row = rows
    .filter((item) => Number.isFinite(eventTime(item)))
    .sort((a, b) => eventTime(b) - eventTime(a))[0];
  if (!row) return null;
  return {
    event_name: row.event_name || "unknown",
    occurred_at: row.occurred_at || row.created_at || null,
    received_at: row.created_at || null,
    extension_version: row.extension_version || "unknown",
    browser: row.browser_name || "unknown",
    country: row.country || "XX",
    page_domain: row.page_domain || "unknown"
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
  const byEventName = topCounts(safeRows, "event_name");
  const eventCounts = countMap(safeRows, "event_name");
  const expectedEvents = REQUIRED_EXTENSION_USAGE_EVENTS.map((eventName) => ({
    event_name: eventName,
    count: eventCounts.get(eventName) || 0,
    present: Boolean(eventCounts.get(eventName))
  }));

  return {
    total_events: safeRows.length,
    total_events_24h: rows24h.length,
    unique_users_30d: uniqueCount(safeRows, "anonymous_id_hash"),
    active_users_7d: uniqueCount(rows7d, "anonymous_id_hash"),
    active_users_24h: uniqueCount(rows24h, "anonymous_id_hash"),
    sessions_30d: sessions,
    active_seconds_30d: activeSeconds,
    average_session_seconds: sessions ? Math.round(activeSeconds / sessions) : 0,
    last_event: latestEvent(safeRows),
    expected_events: expectedEvents,
    missing_expected_events: expectedEvents.filter((item) => !item.present).map((item) => item.event_name),
    by_browser: topCounts(safeRows, "browser_name"),
    by_country: topCounts(safeRows, "country"),
    by_extension_version: topCounts(safeRows, "extension_version"),
    by_event_name: byEventName
  };
}

module.exports = {
  REQUIRED_EXTENSION_USAGE_EVENTS,
  browserFromUserAgent,
  extensionUsageEventFromInput,
  hashIdentifier,
  normalizePageDomain,
  normalizeCountry,
  summarizeExtensionUsage
};
