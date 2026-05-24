const crypto = require("node:crypto");

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_USAGE_TIME_ZONE = "Europe/Madrid";
const SESSION_WINDOW_SECONDS = 30 * 60;
const SESSION_GAP_CAP_SECONDS = 10 * 60;
const SESSION_NO_HEARTBEAT_CAP_SECONDS = 30 * 60;
const SESSION_MAX_SECONDS = 12 * 60 * 60;

const BROWSER_RULES = [
  ["edge", /\bEdg\/([\d.]+)/i],
  ["chrome", /\bChrome\/([\d.]+)/i],
  ["firefox", /\bFirefox\/([\d.]+)/i],
  ["safari", /\bVersion\/([\d.]+).*Safari/i],
  ["opera", /\bOPR\/([\d.]+)/i]
];

const HEARTBEAT_EVENTS = new Set(["heartbeat"]);
const SESSION_END_EVENTS = new Set(["session_end", "session_ended"]);
const COMPLETED_ANALYSIS_EVENTS = new Set(["analysis_completed", "page_analyzed", "page_analysis_completed"]);

function clampNumber(value, min, max, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function roundRatio(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
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

function firstValue(...values) {
  return values.find((value) => String(value || "").trim());
}

function safeUsageMetadata(input = {}) {
  const metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
  const timestamp = firstValue(input.timestamp, input.occurred_at, input.occurredAt, metadata.timestamp, metadata.occurred_at);
  const portal = firstValue(input.portal, metadata.portal);
  const pageDomain = firstValue(input.page_domain, input.pageDomain, input.domain, metadata.page_domain, metadata.domain);

  return {
    manifest_version: input.manifest_version || input.manifestVersion || null,
    locale: String(input.locale || metadata.locale || "").slice(0, 16) || null,
    event_timestamp: timestamp ? String(timestamp).slice(0, 40) : null,
    portal: portal ? normalizeToken(portal, "unknown", 80) : null,
    page_domain: pageDomain ? normalizeToken(pageDomain, "unknown", 120) : null
  };
}

function extensionUsageEventFromInput(input = {}, headers = {}, options = {}) {
  const userAgentBrowser = browserFromUserAgent(headers["user-agent"] || headers["User-Agent"] || "");
  const salt = options.hashSalt || process.env.EXTENSION_USAGE_HASH_SECRET || process.env.ADMIN_IMPORT_TOKEN || "inmoradar";
  const durationSeconds = clampNumber(input.duration_seconds ?? input.durationSeconds, 0, SESSION_MAX_SECONDS, 0);
  const activeSeconds = clampNumber(input.active_seconds ?? input.activeSeconds, 0, SESSION_MAX_SECONDS, durationSeconds);
  const country =
    input.country ||
    headers["x-vercel-ip-country"] ||
    headers["cf-ipcountry"] ||
    headers["x-country-code"] ||
    headers["X-Vercel-IP-Country"];
  const anonymousIdentifier = firstValue(
    input.anonymous_install_id,
    input.anonymousInstallId,
    input.install_id,
    input.installId,
    input.anonymous_user_id,
    input.anonymousUserId,
    input.anonymous_id,
    input.anonymousId,
    input.user_id,
    input.userId,
    input.client_id,
    input.clientId
  );

  return {
    event_name: normalizeToken(input.event_name || input.eventName || "heartbeat", "heartbeat", 48),
    anonymous_id_hash: hashIdentifier(anonymousIdentifier, salt),
    session_id_hash: hashIdentifier(input.session_id || input.sessionId, salt),
    browser_name: normalizeToken(input.browser_name || input.browserName || userAgentBrowser.browser_name, "unknown", 32),
    browser_version: normalizeVersion(input.browser_version || input.browserVersion || userAgentBrowser.browser_version),
    platform: normalizeToken(input.platform || input.os || "unknown", "unknown", 40),
    country: normalizeCountry(country),
    extension_version: normalizeVersion(input.extension_version || input.extensionVersion),
    duration_seconds: durationSeconds,
    active_seconds: activeSeconds,
    source: "extension",
    metadata: safeUsageMetadata(input)
  };
}

function uniqueCount(rows, key) {
  return new Set(rows.map((row) => row[key]).filter(Boolean)).size;
}

function sumSeconds(rows, key) {
  return rows.reduce((sum, row) => sum + clampNumber(row[key], 0, SESSION_MAX_SECONDS, 0), 0);
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

function safeTimeZone(timeZone) {
  const value = String(timeZone || DEFAULT_USAGE_TIME_ZONE).trim();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return value;
  } catch (error) {
    return DEFAULT_USAGE_TIME_ZONE;
  }
}

function dateKeyInTimeZone(value, timeZone = DEFAULT_USAGE_TIME_ZONE) {
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

function normalizeUsageRows(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map((row, index) => {
      const createdMs = new Date(row.created_at).getTime();
      if (!Number.isFinite(createdMs)) return null;
      return {
        ...row,
        event_name: normalizeToken(row.event_name || "unknown", "unknown", 48),
        _row_index: index,
        _created_ms: createdMs
      };
    })
    .filter(Boolean)
    .sort((a, b) => a._created_ms - b._created_ms || a._row_index - b._row_index);
}

function usageSessionKey(row, cursors, counters) {
  if (row.session_id_hash) return `session:${row.session_id_hash}`;
  const entityKey = row.anonymous_id_hash ? `user:${row.anonymous_id_hash}` : `event:${row._row_index}`;
  const cursor = cursors.get(entityKey);
  if (cursor && row._created_ms - cursor.last_ms <= SESSION_WINDOW_SECONDS * 1000) {
    cursor.last_ms = row._created_ms;
    return cursor.key;
  }
  const nextCount = (counters.get(entityKey) || 0) + 1;
  counters.set(entityKey, nextCount);
  const key = `${entityKey}:window:${nextCount}`;
  cursors.set(entityKey, { key, last_ms: row._created_ms });
  return key;
}

function estimateSecondsFromGaps(rows) {
  if (rows.length < 2) return 0;
  return rows.slice(1).reduce((sum, row, index) => {
    const previous = rows[index];
    const gap = Math.max(0, Math.round((row._created_ms - previous._created_ms) / 1000));
    return sum + Math.min(gap, SESSION_GAP_CAP_SECONDS);
  }, 0);
}

function finalizeUsageSession(session) {
  const rows = session.rows.sort((a, b) => a._created_ms - b._created_ms || a._row_index - b._row_index);
  const activeSeconds = rows.reduce((sum, row) => sum + clampNumber(row.active_seconds, 0, SESSION_MAX_SECONDS, 0), 0);
  const durationSeconds = rows.reduce((sum, row) => sum + clampNumber(row.duration_seconds, 0, SESSION_MAX_SECONDS, 0), 0);
  const durationMax = rows.reduce((max, row) => Math.max(max, clampNumber(row.duration_seconds, 0, SESSION_MAX_SECONDS, 0)), 0);
  const hasHeartbeat = rows.some((row) => HEARTBEAT_EVENTS.has(row.event_name));
  const hasSessionEnd = rows.some((row) => SESSION_END_EVENTS.has(row.event_name));
  const explicitSeconds = activeSeconds || (hasSessionEnd && durationMax ? durationMax : durationSeconds);
  const gapEstimateSeconds = estimateSecondsFromGaps(rows);
  const rawSeconds = explicitSeconds || gapEstimateSeconds;
  const cap = explicitSeconds || hasHeartbeat ? SESSION_MAX_SECONDS : SESSION_NO_HEARTBEAT_CAP_SECONDS;
  const duration = clampNumber(rawSeconds, 0, cap, 0);
  const quality = explicitSeconds ? "measured" : duration ? "estimated" : "insufficient";

  return {
    key: session.key,
    anonymous_id_hash: session.anonymous_id_hash || rows.find((row) => row.anonymous_id_hash)?.anonymous_id_hash || "",
    session_id_hash: session.session_id_hash || rows.find((row) => row.session_id_hash)?.session_id_hash || "",
    event_count: rows.length,
    start_ms: rows[0]?._created_ms || 0,
    end_ms: rows[rows.length - 1]?._created_ms || 0,
    start_at: rows[0]?.created_at || "",
    end_at: rows[rows.length - 1]?.created_at || "",
    duration_seconds: duration,
    duration_quality: quality,
    has_heartbeat: hasHeartbeat,
    has_session_end: hasSessionEnd
  };
}

function buildUsageSessions(rows = []) {
  const safeRows = normalizeUsageRows(rows);
  const sessions = new Map();
  const cursors = new Map();
  const counters = new Map();

  safeRows.forEach((row) => {
    const key = usageSessionKey(row, cursors, counters);
    if (!sessions.has(key)) {
      sessions.set(key, {
        key,
        anonymous_id_hash: row.anonymous_id_hash || "",
        session_id_hash: row.session_id_hash || "",
        rows: []
      });
    }
    const session = sessions.get(key);
    if (!session.anonymous_id_hash && row.anonymous_id_hash) session.anonymous_id_hash = row.anonymous_id_hash;
    if (!session.session_id_hash && row.session_id_hash) session.session_id_hash = row.session_id_hash;
    session.rows.push(row);
  });

  return Array.from(sessions.values()).map(finalizeUsageSession);
}

function dateKeyAddDays(dateKey, days) {
  const match = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return date.toISOString().slice(0, 10);
}

function dateKeysBetween(fromDate, toDate, maxDays = 366) {
  if (!fromDate || !toDate) return [];
  const keys = [];
  let current = fromDate;
  for (let index = 0; index < maxDays; index += 1) {
    keys.push(current);
    if (current === toDate) break;
    current = dateKeyAddDays(current, 1);
    if (!current || current > toDate) break;
  }
  return keys;
}

function buildUserStats(rows, sessions, timeZone) {
  const stats = new Map();
  rows.forEach((row) => {
    if (!row.anonymous_id_hash) return;
    if (!stats.has(row.anonymous_id_hash)) {
      stats.set(row.anonymous_id_hash, {
        events: 0,
        days: new Set(),
        sessions: new Set(),
        first_ms: row._created_ms,
        has_completed_analysis: false
      });
    }
    const user = stats.get(row.anonymous_id_hash);
    user.events += 1;
    user.days.add(dateKeyInTimeZone(row.created_at, timeZone));
    user.first_ms = Math.min(user.first_ms, row._created_ms);
    if (COMPLETED_ANALYSIS_EVENTS.has(row.event_name)) user.has_completed_analysis = true;
  });

  sessions.forEach((session) => {
    if (!session.anonymous_id_hash || !stats.has(session.anonymous_id_hash)) return;
    stats.get(session.anonymous_id_hash).sessions.add(session.key);
  });

  return stats;
}

function usageDataQuality(sessions) {
  if (!sessions.length) return "none";
  const measured = sessions.filter((session) => session.duration_quality === "measured").length;
  const estimated = sessions.filter((session) => session.duration_quality === "estimated").length;
  const insufficient = sessions.filter((session) => session.duration_quality === "insufficient").length;
  if (measured && !estimated && !insufficient) return "measured";
  if (measured && (estimated || insufficient)) return "mixed";
  if (estimated && insufficient) return "partial_estimate";
  if (estimated) return "estimated";
  return "insufficient";
}

function buildUsageTimeseries(rows, sessions, userStats, options = {}) {
  const timeZone = safeTimeZone(options.timeZone);
  const knownUsersBeforeRange = new Set(options.knownUsersBeforeRange || []);
  const firstRowDate = rows[0] ? dateKeyInTimeZone(rows[0].created_at, timeZone) : "";
  const lastRowDate = rows[rows.length - 1] ? dateKeyInTimeZone(rows[rows.length - 1].created_at, timeZone) : "";
  const fromDate = options.rangeFromDate || firstRowDate;
  const toDate = options.rangeToDate || lastRowDate || fromDate;
  const dateKeys = dateKeysBetween(fromDate, toDate);
  const rowsByDate = new Map();
  const sessionsByDate = new Map();
  const firstDateByUser = new Map();

  rows.forEach((row) => {
    const date = dateKeyInTimeZone(row.created_at, timeZone);
    if (!rowsByDate.has(date)) rowsByDate.set(date, []);
    rowsByDate.get(date).push(row);
    if (row.anonymous_id_hash && !firstDateByUser.has(row.anonymous_id_hash)) {
      firstDateByUser.set(row.anonymous_id_hash, date);
    }
  });

  sessions.forEach((session) => {
    const date = dateKeyInTimeZone(session.start_at, timeZone);
    if (!sessionsByDate.has(date)) sessionsByDate.set(date, []);
    sessionsByDate.get(date).push(session);
  });

  return dateKeys.map((date) => {
    const dayRows = rowsByDate.get(date) || [];
    const daySessions = sessionsByDate.get(date) || [];
    const users = new Set(dayRows.map((row) => row.anonymous_id_hash).filter(Boolean));
    const usageSeconds = daySessions.reduce((sum, session) => sum + session.duration_seconds, 0);
    const returningUsers = Array.from(users).filter((user) => {
      const stats = userStats.get(user);
      return stats && (stats.days.size > 1 || stats.sessions.size > 1);
    }).length;
    const newUsers = Array.from(users).filter(
      (user) => firstDateByUser.get(user) === date && !knownUsersBeforeRange.has(user)
    ).length;

    return {
      date,
      unique_users: users.size,
      new_users: newUsers,
      returning_users: returningUsers,
      sessions: daySessions.length,
      completed_analyses: dayRows.filter((row) => COMPLETED_ANALYSIS_EVENTS.has(row.event_name)).length,
      events: dayRows.length,
      total_usage_seconds_estimated: usageSeconds,
      avg_session_seconds: daySessions.length ? Math.round(usageSeconds / daySessions.length) : 0
    };
  });
}

function summarizeExtensionUsage(rows = [], now = new Date(), options = {}) {
  if (!(now instanceof Date) && typeof now === "object" && now !== null) {
    options = now;
    now = new Date();
  }
  const timeZone = safeTimeZone(options.timeZone);
  const safeRows = normalizeUsageRows(rows);
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const rangeEndMs = options.rangeEnd ? new Date(options.rangeEnd).getTime() : nowMs;
  const sessions = buildUsageSessions(safeRows);
  const userStats = buildUserStats(safeRows, sessions, timeZone);
  const knownUsersBeforeRange = new Set(options.knownUsersBeforeRange || []);
  const users = Array.from(userStats.keys());
  const sessionsCount = sessions.length;
  const totalUsageSeconds = sessions.reduce((sum, session) => sum + session.duration_seconds, 0);
  const completedAnalyses = safeRows.filter((row) => COMPLETED_ANALYSIS_EVENTS.has(row.event_name)).length;
  const activationUsers = users.filter((user) => userStats.get(user)?.has_completed_analysis).length;
  const returningUsers = users.filter((user) => {
    const stats = userStats.get(user);
    return stats && (stats.days.size > 1 || stats.sessions.size > 1);
  }).length;
  const newUsers = users.filter((user) => !knownUsersBeforeRange.has(user)).length;
  const activeUsersSince = (days) => {
    const cutoff = rangeEndMs - days * DAY_MS;
    return uniqueCount(
      safeRows.filter((row) => row._created_ms >= cutoff && row._created_ms <= rangeEndMs),
      "anonymous_id_hash"
    );
  };
  const quality = usageDataQuality(sessions);
  const uniqueUsers = users.length;
  const kpis = {
    unique_users: uniqueUsers,
    active_users_24h: activeUsersSince(1),
    active_users_7d: activeUsersSince(7),
    active_users_30d: activeUsersSince(30),
    new_users: newUsers,
    returning_users: returningUsers,
    sessions: sessionsCount,
    events: safeRows.length,
    completed_analyses: completedAnalyses,
    events_per_user: uniqueUsers ? roundRatio(safeRows.length / uniqueUsers) : 0,
    sessions_per_user: uniqueUsers ? roundRatio(sessionsCount / uniqueUsers) : 0,
    avg_session_seconds: sessionsCount ? Math.round(totalUsageSeconds / sessionsCount) : 0,
    total_usage_seconds_estimated: totalUsageSeconds,
    avg_user_seconds_estimated: uniqueUsers ? Math.round(totalUsageSeconds / uniqueUsers) : 0,
    activation_users: activationUsers,
    activation_rate: uniqueUsers ? roundRatio((activationUsers / uniqueUsers) * 100) : 0,
    usage_data_quality: quality,
    usage_is_estimated: ["estimated", "mixed", "partial_estimate"].includes(quality),
    usage_has_insufficient_data: quality === "insufficient" || quality === "partial_estimate"
  };
  const breakdowns = {
    browsers: topCounts(safeRows, "browser_name"),
    countries: topCounts(safeRows, "country"),
    versions: topCounts(safeRows, "extension_version"),
    events: topCounts(safeRows, "event_name")
  };
  const timeseries = buildUsageTimeseries(safeRows, sessions, userStats, {
    ...options,
    timeZone,
    knownUsersBeforeRange
  });

  return {
    range: {
      from: options.rangeFromDate || timeseries[0]?.date || "",
      to: options.rangeToDate || timeseries[timeseries.length - 1]?.date || "",
      start: options.rangeStart || "",
      end: options.rangeEnd || "",
      preset: options.preset || "",
      timezone: timeZone
    },
    kpis,
    breakdowns,
    timeseries,
    total_events: kpis.events,
    unique_users_30d: kpis.unique_users,
    active_users_7d: kpis.active_users_7d,
    active_users_24h: kpis.active_users_24h,
    sessions_30d: kpis.sessions,
    active_seconds_30d: kpis.total_usage_seconds_estimated,
    average_session_seconds: kpis.avg_session_seconds,
    by_browser: breakdowns.browsers,
    by_country: breakdowns.countries,
    by_extension_version: breakdowns.versions,
    by_event_name: breakdowns.events
  };
}

module.exports = {
  DEFAULT_USAGE_TIME_ZONE,
  browserFromUserAgent,
  buildUsageSessions,
  dateKeyInTimeZone,
  extensionUsageEventFromInput,
  hashIdentifier,
  normalizeCountry,
  safeTimeZone,
  summarizeExtensionUsage
};
