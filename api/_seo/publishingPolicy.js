const SEO_DAILY_TARGETS = {
  landings: 2,
  news: 2,
  total: 4,
  timeZone: "Europe/Madrid"
};

const NEWS_TEMPLATE_TYPES = new Set(["editorial_guide", "news_guide"]);

function buildSeoDailyTargets(input = {}) {
  const total = Math.max(0, Number.parseInt(String(input.total ?? SEO_DAILY_TARGETS.total), 10) || 0);
  return {
    landings: Math.ceil(total / 2),
    news: Math.floor(total / 2),
    total,
    timeZone: input.timeZone || SEO_DAILY_TARGETS.timeZone
  };
}

function isSeoNewsTemplateType(templateType) {
  return NEWS_TEMPLATE_TYPES.has(String(templateType || "").toLowerCase());
}

function seoContentTypeForTemplate(templateType) {
  return isSeoNewsTemplateType(templateType) ? "news" : "landing";
}

function dateKeyForTimeZone(value = new Date(), timeZone = SEO_DAILY_TARGETS.timeZone) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function summarizeSeoPublications(rows = [], options = {}) {
  const now = options.now || new Date();
  const timeZone = options.timeZone || SEO_DAILY_TARGETS.timeZone;
  const todayKey = dateKeyForTimeZone(now, timeZone);
  const publishedToday = (Array.isArray(rows) ? rows : []).filter((row) => {
    const status = String(row.status || "published").toLowerCase();
    if (status && status !== "published") return false;
    return dateKeyForTimeZone(row.published_at || row.updated_at || row.last_generated_at, timeZone) === todayKey;
  });
  const publishedLandingsToday = publishedToday.filter((row) => seoContentTypeForTemplate(row.template_type) === "landing").length;
  const publishedNewsToday = publishedToday.filter((row) => seoContentTypeForTemplate(row.template_type) === "news").length;

  return {
    date: todayKey,
    time_zone: timeZone,
    published_landings_today: publishedLandingsToday,
    published_news_today: publishedNewsToday,
    published_total_today: publishedToday.length
  };
}

function selectNextSeoContentType(summary = {}, targets = SEO_DAILY_TARGETS) {
  const publishedLandings = Number(summary.published_landings_today || 0);
  const publishedNews = Number(summary.published_news_today || 0);
  const publishedTotal = Number(summary.published_total_today || 0);
  if (publishedTotal >= targets.total) {
    return { selected_content_type: null, skipped_reason: "daily_total_quota_reached" };
  }
  const landingRemaining = Math.max(0, targets.landings - publishedLandings);
  const newsRemaining = Math.max(0, targets.news - publishedNews);
  if (landingRemaining <= 0 && newsRemaining <= 0) {
    return { selected_content_type: null, skipped_reason: "daily_2_plus_2_quota_reached" };
  }
  if (landingRemaining <= 0) return { selected_content_type: "news", skipped_reason: null };
  if (newsRemaining <= 0) return { selected_content_type: "landing", skipped_reason: null };
  if (publishedLandings <= publishedNews) return { selected_content_type: "landing", skipped_reason: null };
  return { selected_content_type: "news", skipped_reason: null };
}

function buildSeoDailyPolicySnapshot(rows = [], options = {}) {
  const targets = options.targets || SEO_DAILY_TARGETS;
  const summary = summarizeSeoPublications(rows, {
    now: options.now,
    timeZone: targets.timeZone
  });
  const selection = selectNextSeoContentType(summary, targets);
  return {
    ...summary,
    target_landings_per_day: targets.landings,
    target_news_per_day: targets.news,
    target_total_per_day: targets.total,
    selected_content_type: selection.selected_content_type,
    skipped_reason: selection.skipped_reason
  };
}

module.exports = {
  SEO_DAILY_TARGETS,
  buildSeoDailyTargets,
  buildSeoDailyPolicySnapshot,
  dateKeyForTimeZone,
  isSeoNewsTemplateType,
  selectNextSeoContentType,
  seoContentTypeForTemplate,
  summarizeSeoPublications
};
