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

function seoContentTypeAvailabilityCount(source = {}) {
  return (
    Number(source.ready_to_publish_count || 0) +
    Number(source.pending_opportunities_count || 0) +
    Number(source.seedable_opportunities_count || 0)
  );
}

function hasSeoContentTypeAvailability(source = {}) {
  if (!source || typeof source !== "object") return false;
  if (source.has_candidates === true) return true;
  return seoContentTypeAvailabilityCount(source) > 0;
}

function normalizedContentAvailability(options = {}) {
  const availability = options.availability || options.content_type_availability || options.contentAvailability || null;
  if (!availability || typeof availability !== "object") return null;
  return {
    landing: availability.landing || availability.landings || null,
    news: availability.news || availability.guides || null
  };
}

function applyContentAvailabilitySelection(selectedContentType, options = {}) {
  if (!selectedContentType) return { selected_content_type: selectedContentType, policy_adjustment: null };
  const availability = normalizedContentAvailability(options);
  if (!availability) return { selected_content_type: selectedContentType, policy_adjustment: null };
  const alternateContentType = selectedContentType === "news" ? "landing" : selectedContentType === "landing" ? "news" : null;
  if (!alternateContentType) return { selected_content_type: selectedContentType, policy_adjustment: null };
  const selectedAvailability = availability[selectedContentType];
  const alternateAvailability = availability[alternateContentType];
  if (!selectedAvailability || !alternateAvailability) {
    return { selected_content_type: selectedContentType, policy_adjustment: null };
  }
  if (hasSeoContentTypeAvailability(selectedAvailability)) {
    return { selected_content_type: selectedContentType, policy_adjustment: null };
  }
  if (hasSeoContentTypeAvailability(alternateAvailability)) {
    return {
      selected_content_type: alternateContentType,
      policy_adjustment: "candidate_availability_fallback"
    };
  }
  return { selected_content_type: selectedContentType, policy_adjustment: null };
}

function selectNextSeoContentType(summary = {}, targets = SEO_DAILY_TARGETS, options = {}) {
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
  let selectedContentType = "news";
  if (landingRemaining <= 0) selectedContentType = "news";
  else if (newsRemaining <= 0) selectedContentType = "landing";
  else selectedContentType = publishedLandings <= publishedNews ? "landing" : "news";
  const availabilitySelection = applyContentAvailabilitySelection(selectedContentType, options);
  return {
    selected_content_type: availabilitySelection.selected_content_type,
    skipped_reason: null,
    policy_adjustment: availabilitySelection.policy_adjustment
  };
}

function buildSeoDailyPolicySnapshot(rows = [], options = {}) {
  const targets = options.targets || SEO_DAILY_TARGETS;
  const summary = summarizeSeoPublications(rows, {
    now: options.now,
    timeZone: targets.timeZone
  });
  const contentAvailability = normalizedContentAvailability(options);
  const selection = selectNextSeoContentType(summary, targets, { availability: contentAvailability });
  return {
    ...summary,
    target_landings_per_day: targets.landings,
    target_news_per_day: targets.news,
    target_total_per_day: targets.total,
    selected_content_type: selection.selected_content_type,
    skipped_reason: selection.skipped_reason,
    selected_content_type_policy_adjustment: selection.policy_adjustment || null,
    content_type_availability: contentAvailability || undefined
  };
}

module.exports = {
  SEO_DAILY_TARGETS,
  buildSeoDailyTargets,
  buildSeoDailyPolicySnapshot,
  dateKeyForTimeZone,
  hasSeoContentTypeAvailability,
  isSeoNewsTemplateType,
  selectNextSeoContentType,
  seoContentTypeForTemplate,
  summarizeSeoPublications
};
