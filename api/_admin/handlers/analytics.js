const {
  buildOwnedAnalyticsLearning,
  summarizeOwnedAnalytics,
  summarizePagePerformance
} = require("../../../lib/analytics/learning");

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
  const rawSource = utm.source || utm.utm_source || row.source || (row.referrer ? "referral" : "unknown");
  const source = cleanSourceToken(rawSource, "unknown");
  const mediumFallback = source === "referral" ? "referral" : "unknown";
  const medium = cleanSourceToken(utm.medium || utm.utm_medium, mediumFallback);
  const campaign = cleanSourceToken(utm.campaign || utm.utm_campaign, "-");
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
        returning_users: null,
        unclassified_users: null,
        sessions,
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
