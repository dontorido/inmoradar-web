const {
  buildOwnedAnalyticsLearning,
  summarizeOwnedAnalytics,
  summarizePagePerformance
} = require("../../../lib/analytics/learning");

const OWNED_ANALYTICS_WINDOW_DAYS = new Set([1, 7, 30, 90]);
const OWNED_ANALYTICS_MAX_WINDOW_DAYS = 90;
const OWNED_ANALYTICS_DAY_MS = 24 * 60 * 60 * 1000;
const OWNED_ANALYTICS_DEFAULT_TIME_ZONE = "UTC";

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

function safeOwnedAnalyticsTimeZone(timeZone) {
  const value = String(timeZone || OWNED_ANALYTICS_DEFAULT_TIME_ZONE).trim() || OWNED_ANALYTICS_DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return value;
  } catch (error) {
    return OWNED_ANALYTICS_DEFAULT_TIME_ZONE;
  }
}

function ownedAnalyticsTimeParts(date, timeZone = OWNED_ANALYTICS_DEFAULT_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: safeOwnedAnalyticsTimeZone(timeZone),
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

function ownedAnalyticsTimeZoneOffsetMs(date, timeZone = OWNED_ANALYTICS_DEFAULT_TIME_ZONE) {
  const parts = ownedAnalyticsTimeParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, date.getUTCMilliseconds());
  return asUtc - date.getTime();
}

function ownedAnalyticsZonedDateToUtc(dateKey, timeZone = OWNED_ANALYTICS_DEFAULT_TIME_ZONE, endOfDay = false) {
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
    const offset = ownedAnalyticsTimeZoneOffsetMs(new Date(utcMs), timeZone);
    const next = Date.UTC(year, month - 1, day, hour, minute, second, millisecond) - offset;
    if (Math.abs(next - utcMs) < 1000) break;
    utcMs = next;
  }
  const date = new Date(utcMs);
  return Number.isNaN(date.getTime()) ? null : date;
}

function ownedAnalyticsDateKeyInTimeZone(value, timeZone = OWNED_ANALYTICS_DEFAULT_TIME_ZONE) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeOwnedAnalyticsTimeZone(timeZone),
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

function ownedAnalyticsDateKeyAddDays(dateKey, days) {
  const match = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return date.toISOString().slice(0, 10);
}

function parseOwnedAnalyticsDateInTimeZone(value, timeZone = OWNED_ANALYTICS_DEFAULT_TIME_ZONE, endOfDay = false) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return ownedAnalyticsZonedDateToUtc(raw, timeZone, endOfDay);
  }
  return parseOwnedAnalyticsDate(raw, endOfDay);
}

function ownedAnalyticsWindow(url, now = new Date()) {
  const timeZone = safeOwnedAnalyticsTimeZone(url.searchParams.get("timezone") || url.searchParams.get("tz") || OWNED_ANALYTICS_DEFAULT_TIME_ZONE);
  const fromParam = url.searchParams.get("from") || url.searchParams.get("from_date");
  const toParam = url.searchParams.get("to") || url.searchParams.get("to_date");
  const from = parseOwnedAnalyticsDateInTimeZone(fromParam, timeZone);
  const to = parseOwnedAnalyticsDateInTimeZone(toParam, timeZone, true);

  if (fromParam || toParam) {
    if (from && to) {
      let windowStart = from;
      let windowEnd = to;
      if (windowStart > windowEnd) [windowStart, windowEnd] = [windowEnd, windowStart];

      const windowEndDateKey = ownedAnalyticsDateKeyInTimeZone(windowEnd, timeZone);
      const earliestDateKey = ownedAnalyticsDateKeyAddDays(windowEndDateKey, -(OWNED_ANALYTICS_MAX_WINDOW_DAYS - 1));
      const earliest = ownedAnalyticsZonedDateToUtc(earliestDateKey, timeZone) || new Date(windowEnd.getTime() - (OWNED_ANALYTICS_MAX_WINDOW_DAYS - 1) * OWNED_ANALYTICS_DAY_MS);
      const clamped = windowStart < earliest;
      if (clamped) windowStart = earliest;
      const windowMs = Math.max(OWNED_ANALYTICS_DAY_MS, windowEnd.getTime() - windowStart.getTime());
      const windowDays = Math.min(OWNED_ANALYTICS_MAX_WINDOW_DAYS, Math.max(1, Math.ceil(windowMs / OWNED_ANALYTICS_DAY_MS)));

      return {
        mode: "date_range",
        timezone: timeZone,
        start: windowStart.toISOString(),
        end: windowEnd.toISOString(),
        from_date: ownedAnalyticsDateKeyInTimeZone(windowStart, timeZone),
        to_date: ownedAnalyticsDateKeyInTimeZone(windowEnd, timeZone),
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
    timezone: timeZone,
    start: start.toISOString(),
    end: end.toISOString(),
    from_date: ownedAnalyticsDateKeyInTimeZone(start, timeZone),
    to_date: ownedAnalyticsDateKeyInTimeZone(end, timeZone),
    days,
    hours: days * 24,
    clamped: false
  };
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

const INSTALL_CTA_EVENTS = new Set(["install_click", "seo_cta_click", "guide_cta_click", "article_cta_click"]);

function cleanSourceToken(value, fallback = "unknown") {
  const token = String(value || "").trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9._:-]+/g, "");
  return token || fallback;
}

function analyticsSourceIdentity(row = {}) {
  const utm = row.utm && typeof row.utm === "object" && !Array.isArray(row.utm) ? row.utm : {};
  const rawSource = utm.source || utm.utm_source || row.source || (row.referrer ? "referral" : "direct");
  const source = cleanSourceToken(rawSource, "direct");
  const mediumFallback = source === "direct" ? "none" : source === "referral" ? "referral" : "unknown";
  const medium = cleanSourceToken(utm.medium || utm.utm_medium, mediumFallback);
  const campaign = cleanSourceToken(utm.campaign || utm.utm_campaign, "");
  return { source, medium, campaign };
}

function analyticsSourceGroups(rows, limit = 12) {
  const groups = new Map();
  for (const row of rows || []) {
    const identity = analyticsSourceIdentity(row);
    const key = `${identity.source}|${identity.medium}|${identity.campaign}`;
    if (!groups.has(key)) {
      groups.set(key, {
        ...identity,
        page_views: 0,
        events: 0,
        cta_installation: 0,
        chrome_store_clicks: 0,
        sessions: new Set()
      });
    }

    const item = groups.get(key);
    item.events += 1;
    if (row.anonymous_session_id) item.sessions.add(String(row.anonymous_session_id));
    if (row.event_name === "page_view") item.page_views += 1;
    if (INSTALL_CTA_EVENTS.has(row.event_name)) item.cta_installation += 1;
    if (row.event_name === "chrome_store_click") item.chrome_store_clicks += 1;
  }

  return Array.from(groups.values())
    .map((item) => {
      const sessions = item.sessions.size;
      return {
        source: item.source,
        medium: item.medium,
        campaign: item.campaign,
        users: sessions,
        new_users: null,
        sessions,
        user_identity: "anonymous_session_id",
        cta_installation: item.cta_installation,
        chrome_store_clicks: item.chrome_store_clicks,
        activations: null,
        analyses: null,
        page_views: item.page_views,
        events: item.events,
        visit_to_cta_rate: item.page_views ? Number(((item.cta_installation / item.page_views) * 100).toFixed(1)) : 0,
        cta_to_analysis_rate: null
      };
    })
    .sort((a, b) => b.users - a.users || b.cta_installation - a.cta_installation || b.chrome_store_clicks - a.chrome_store_clicks || b.page_views - a.page_views || a.source.localeCompare(b.source))
    .slice(0, limit);
}

function createAnalyticsHandlers({ clampLimit, hasSupabaseConfig, supabaseFetch } = {}) {
  if (typeof clampLimit !== "function") throw new Error("admin_analytics_clamp_limit_required");
  if (typeof hasSupabaseConfig !== "function") throw new Error("admin_analytics_supabase_config_required");
  if (typeof supabaseFetch !== "function") throw new Error("admin_analytics_supabase_fetch_required");

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
        window_timezone: window.timezone,
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
        window_timezone: window.timezone,
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
        window_timezone: window.timezone,
        window_from_date: window.from_date,
        window_to_date: window.to_date,
        window_start: window.start,
        window_end: window.end,
        window_clamped: window.clamped,
        events: []
      };
    }
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
        window_timezone: result.window_timezone,
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
        top_sources: analyticsSourceGroups(events),
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
        window_timezone: result.window_timezone,
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
        window_timezone: result.window_timezone,
        window_from_date: result.window_from_date,
        window_to_date: result.window_to_date,
        window_start: result.window_start,
        window_end: result.window_end,
        window_clamped: Boolean(result.window_clamped),
        ...learning
      }
    };
  }

  return {
    handleOwnedAnalyticsLearning,
    handleOwnedAnalyticsPages,
    handleOwnedAnalyticsSummary
  };
}

module.exports = {
  analyticsSourceGroups,
  createAnalyticsHandlers
};
