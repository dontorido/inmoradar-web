const crypto = require("node:crypto");

const BROWSER_RULES = [
  ["edge", /\bEdg\/([\d.]+)/i],
  ["chrome", /\bChrome\/([\d.]+)/i],
  ["firefox", /\bFirefox\/([\d.]+)/i],
  ["safari", /\bVersion\/([\d.]+).*Safari/i],
  ["opera", /\bOPR\/([\d.]+)/i]
];

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

  return {
    event_name: normalizeToken(input.event_name || input.eventName || "heartbeat", "heartbeat", 48),
    anonymous_id_hash: hashIdentifier(input.anonymous_id || input.anonymousId || input.client_id || input.clientId, salt),
    session_id_hash: hashIdentifier(input.session_id || input.sessionId, salt),
    browser_name: normalizeToken(input.browser_name || input.browserName || userAgentBrowser.browser_name, "unknown", 32),
    browser_version: normalizeVersion(input.browser_version || input.browserVersion || userAgentBrowser.browser_version),
    platform: normalizeToken(input.platform || input.os || "unknown", "unknown", 40),
    country: normalizeCountry(country),
    extension_version: normalizeVersion(input.extension_version || input.extensionVersion),
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

function summarizeExtensionUsage(rows = [], now = new Date()) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const since24h = nowMs - 24 * 60 * 60 * 1000;
  const since7d = nowMs - 7 * 24 * 60 * 60 * 1000;
  const rows24h = safeRows.filter((row) => new Date(row.created_at).getTime() >= since24h);
  const rows7d = safeRows.filter((row) => new Date(row.created_at).getTime() >= since7d);
  const activeSeconds = sumSeconds(safeRows, "active_seconds") || sumSeconds(safeRows, "duration_seconds");
  const sessions = uniqueCount(safeRows, "session_id_hash");

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
    by_extension_version: topCounts(safeRows, "extension_version"),
    by_event_name: topCounts(safeRows, "event_name")
  };
}

module.exports = {
  browserFromUserAgent,
  extensionUsageEventFromInput,
  hashIdentifier,
  normalizeCountry,
  summarizeExtensionUsage
};
