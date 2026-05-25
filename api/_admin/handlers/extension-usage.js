const {
  DEFAULT_USAGE_TIME_ZONE,
  safeTimeZone,
  summarizeExtensionUsage
} = require("../../../lib/extension-usage/metrics");

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

function createExtensionUsageHandlers({ clampLimit, supabaseFetch } = {}) {
  if (typeof clampLimit !== "function") throw new Error("admin_extension_usage_clamp_limit_required");
  if (typeof supabaseFetch !== "function") throw new Error("admin_extension_usage_supabase_fetch_required");

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
        status: 200,
        payload: {
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
        }
      };
    } catch (error) {
      return {
        status: 200,
        payload: emptyExtensionUsagePayload(window, error)
      };
    }
  }

  return {
    handleExtensionUsageSummary
  };
}

module.exports = {
  createExtensionUsageHandlers
};
