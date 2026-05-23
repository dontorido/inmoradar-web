const CORE_EVENTS = [
  "page_view",
  "install_click",
  "chrome_store_click",
  "seo_cta_click",
  "guide_cta_click",
  "article_cta_click",
  "waitlist_submit",
  "premium_click",
  "checkout_start",
  "checkout_created",
  "checkout_error",
  "calculator_used",
  "calculator_completed",
  "seo_internal_link_click",
  "seo_scroll_depth"
];
const INSTALL_INTENT_EVENTS = new Set(["install_click", "chrome_store_click", "seo_cta_click", "guide_cta_click", "article_cta_click"]);

function emptyCounts() {
  return CORE_EVENTS.reduce((acc, eventName) => {
    acc[eventName] = 0;
    return acc;
  }, {});
}

function rate(part, total) {
  const numerator = Number(part || 0);
  const denominator = Number(total || 0);
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 10000) / 100;
}

function pageKey(row = {}) {
  return row.page_path || row.slug || row.page_url || "unknown";
}

function labelForPage(row = {}) {
  return row.slug || row.page_path || row.page_url || "unknown";
}

function groupCount(rows, key, limit = 10) {
  const counts = rows.reduce((acc, row) => {
    const label = String(row[key] || "unknown");
    acc[label] = acc[label] || { label, count: 0, install_clicks: 0, checkout_created: 0 };
    acc[label].count += 1;
    if (INSTALL_INTENT_EVENTS.has(row.event_name)) acc[label].install_clicks += 1;
    if (row.event_name === "checkout_created") acc[label].checkout_created += 1;
    return acc;
  }, {});
  return Object.values(counts)
    .sort((a, b) => b.install_clicks - a.install_clicks || b.checkout_created - a.checkout_created || b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function scrollDepth(row = {}) {
  const depth = Number(row.metadata?.depth || row.metadata?.scroll_depth || 0);
  return depth === 50 || depth === 90 ? depth : 0;
}

function eventTimestampMs(row = {}) {
  const value = row.occurred_at || row.created_at || "";
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function anonymousSessionId(row = {}) {
  return String(row.anonymous_session_id || row.anonymousSessionId || "").trim();
}

function updateCalculatorSessionAttribution(item, row = {}) {
  const eventName = row.event_name;
  if (eventName !== "calculator_used" && !INSTALL_INTENT_EVENTS.has(eventName)) return;
  const sessionId = anonymousSessionId(row);
  if (!sessionId) return;
  const timestamp = eventTimestampMs(row);
  if (timestamp === null) return;
  const current = item.calculator_session_events.get(sessionId) || {
    first_calculator_at: null,
    install_intent_at: []
  };
  if (eventName === "calculator_used") {
    current.first_calculator_at =
      current.first_calculator_at === null ? timestamp : Math.min(current.first_calculator_at, timestamp);
  } else {
    current.install_intent_at.push(timestamp);
  }
  item.calculator_session_events.set(sessionId, current);
}

function calculatorSessionStats(sessionEvents = new Map()) {
  const sessions = Array.from(sessionEvents.values());
  const withCalculator = sessions.filter((session) => session.first_calculator_at !== null);
  const thenInstall = withCalculator.filter((session) =>
    session.install_intent_at.some((timestamp) => timestamp >= session.first_calculator_at)
  );
  return {
    sessions_with_calculator: withCalculator.length,
    sessions_with_calculator_then_install: thenInstall.length,
    calculator_to_install_rate: Math.min(100, rate(thenInstall.length, withCalculator.length))
  };
}

function scoreContentPerformance(page = {}) {
  const views = Number(page.page_views || page.page_view || page.visits || 0);
  const installs = Number(page.install_intent ?? NaN) || Number(page.install_clicks || 0) + Number(page.chrome_store_clicks || 0) + Number(page.seo_cta_click || 0) + Number(page.guide_cta_click || 0) + Number(page.article_cta_click || 0);
  const waitlist = Number(page.waitlist_submit || 0);
  const checkoutStarts = Number(page.checkout_start || 0);
  const checkouts = Number(page.checkout_created || 0);
  const errors = Number(page.checkout_error || 0);
  const calculatorCompletions = Number(page.calculator_completed || page.calculator_completed_count || 0);
  const calculatorStarts = Number(page.calculator_used || page.calculator_used_count || 0);
  const internalLinks = Number(page.seo_internal_link_click || page.internal_link_clicks || 0);
  const scroll90 = Number(page.scroll_depth_90 || page.scroll_90 || 0);
  const base = installs * 8 + waitlist * 5 + checkoutStarts * 12 + checkouts * 30 + calculatorStarts * 2 + calculatorCompletions * 3 + internalLinks + scroll90 - errors * 4;
  const efficiency = views ? (installs + checkoutStarts * 2 + checkouts * 5 + calculatorCompletions) / views : 0;
  return Math.max(0, Math.round((base + efficiency * 100) * 10) / 10);
}

function summarizePagePerformance(events = []) {
  const groups = new Map();
  const safeEvents = Array.isArray(events) ? events : [];

  safeEvents.forEach((row) => {
    const key = pageKey(row);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        page: labelForPage(row),
        page_path: row.page_path || "",
        page_url: row.page_url || "",
        page_type: row.page_type || "",
        content_type: row.content_type || "",
        template_type: row.template_type || "",
        slug: row.slug || "",
        city: row.city || "",
        topic: row.topic || "",
        scroll_depth_50: 0,
        scroll_depth_90: 0,
        calculator_session_events: new Map(),
        ...emptyCounts()
      });
    }
    const item = groups.get(key);
    const eventName = row.event_name;
    if (Object.prototype.hasOwnProperty.call(item, eventName)) item[eventName] += 1;
    updateCalculatorSessionAttribution(item, row);
    if (eventName === "seo_scroll_depth") {
      const depth = scrollDepth(row);
      if (depth === 50) item.scroll_depth_50 += 1;
      if (depth === 90) item.scroll_depth_90 += 1;
    }
  });

  return Array.from(groups.values())
    .map((page) => {
      const installs = page.install_click + page.chrome_store_click + page.seo_cta_click + page.guide_cta_click + page.article_cta_click;
      const calculatorStats = calculatorSessionStats(page.calculator_session_events);
      const enriched = {
        ...page,
        calculator_session_events: undefined,
        visits: page.page_view,
        install_intent: installs,
        install_clicks: page.install_click + page.seo_cta_click + page.guide_cta_click + page.article_cta_click,
        chrome_store_clicks: page.chrome_store_click,
        seo_cta_clicks: page.seo_cta_click,
        guide_cta_clicks: page.guide_cta_click,
        article_cta_clicks: page.article_cta_click,
        waitlist_submits: page.waitlist_submit,
        premium_clicks: page.premium_click,
        checkout_starts: page.checkout_start,
        checkout_created_count: page.checkout_created,
        checkout_errors: page.checkout_error,
        calculator_used_count: page.calculator_used,
        calculator_completed_count: page.calculator_completed,
        internal_link_clicks: page.seo_internal_link_click,
        scroll_depth_50_count: page.scroll_depth_50,
        scroll_depth_90_count: page.scroll_depth_90,
        interaction_count: page.calculator_used + page.calculator_completed + page.seo_internal_link_click + page.scroll_depth_50 + page.scroll_depth_90,
        install_rate: rate(installs, page.page_view),
        calculator_completion_rate: rate(page.calculator_completed, page.calculator_used),
        sessions_with_calculator: calculatorStats.sessions_with_calculator,
        sessions_with_calculator_then_install: calculatorStats.sessions_with_calculator_then_install,
        calculator_to_install_rate: calculatorStats.calculator_to_install_rate,
        checkout_start_rate: rate(page.checkout_start, page.page_view),
        checkout_created_rate: rate(page.checkout_created, page.checkout_start)
      };
      enriched.performance_score = scoreContentPerformance(enriched);
      return enriched;
    })
    .sort((a, b) => b.performance_score - a.performance_score || b.visits - a.visits || a.page.localeCompare(b.page));
}

function summarizeOwnedAnalytics(events = []) {
  const safeEvents = Array.isArray(events) ? events : [];
  const counts = safeEvents.reduce((acc, row) => {
    const eventName = row.event_name || "unknown";
    acc[eventName] = (acc[eventName] || 0) + 1;
    return acc;
  }, {});
  const pageViews = counts.page_view || 0;
  const installClicks = (counts.install_click || 0) + (counts.chrome_store_click || 0) + (counts.seo_cta_click || 0) + (counts.guide_cta_click || 0) + (counts.article_cta_click || 0);
  const checkoutStarts = counts.checkout_start || 0;
  const scroll50 = safeEvents.filter((row) => row.event_name === "seo_scroll_depth" && scrollDepth(row) === 50).length;
  const scroll90 = safeEvents.filter((row) => row.event_name === "seo_scroll_depth" && scrollDepth(row) === 90).length;

  return {
    total_events: safeEvents.length,
    page_views: pageViews,
    install_clicks: (counts.install_click || 0) + (counts.seo_cta_click || 0) + (counts.guide_cta_click || 0) + (counts.article_cta_click || 0),
    chrome_store_clicks: counts.chrome_store_click || 0,
    seo_cta_clicks: counts.seo_cta_click || 0,
    guide_cta_clicks: counts.guide_cta_click || 0,
    article_cta_clicks: counts.article_cta_click || 0,
    waitlist_submit: counts.waitlist_submit || 0,
    premium_click: counts.premium_click || 0,
    checkout_start: checkoutStarts,
    checkout_created: counts.checkout_created || 0,
    checkout_error: counts.checkout_error || 0,
    calculator_used: counts.calculator_used || 0,
    calculator_completed: counts.calculator_completed || 0,
    seo_internal_link_click: counts.seo_internal_link_click || 0,
    seo_scroll_depth: counts.seo_scroll_depth || 0,
    scroll_depth_50: scroll50,
    scroll_depth_90: scroll90,
    install_click_rate: rate(installClicks, pageViews),
    calculator_completion_rate: rate(counts.calculator_completed || 0, counts.calculator_used || 0),
    checkout_start_rate: rate(checkoutStarts, pageViews),
    checkout_created_rate: rate(counts.checkout_created || 0, checkoutStarts),
    by_event: Object.entries(counts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([label, count]) => ({ label, count }))
  };
}

function findWinningTopics(pages = []) {
  return pages
    .filter((page) => page.performance_score >= 12 || page.install_rate >= 8 || page.checkout_created_count > 0)
    .slice(0, 8)
    .map((page) => ({
      type: "winner",
      page: page.page,
      topic: page.topic || page.template_type || page.content_type || "contenido",
      city: page.city || "",
      score: page.performance_score,
      reason: `${page.install_rate}% intención de instalación / ${page.checkout_created_count} checkouts creados`
    }));
}

function findUnderperformingPages(pages = []) {
  return pages
    .filter((page) => page.visits >= 5 && page.install_rate < 2 && page.checkout_starts === 0)
    .slice(0, 8)
    .map((page) => ({
      type: "underperforming",
      page: page.page,
      topic: page.topic || page.template_type || page.content_type || "contenido",
      city: page.city || "",
      score: page.performance_score,
      reason: `${page.visits} visitas y poca intención de instalación`
    }));
}

function findHighInteractionLowInstallPages(pages = []) {
  return pages
    .filter((page) => (page.interaction_count >= 5 || page.calculator_used_count >= 3 || page.scroll_depth_90_count >= 3) && page.install_intent === 0 && page.checkout_starts === 0)
    .slice(0, 8)
    .map((page) => ({
      type: "high_interaction_low_install",
      page: page.page,
      topic: page.topic || page.template_type || page.content_type || "contenido",
      city: page.city || "",
      score: page.performance_score,
      reason: `${page.interaction_count} interacciones SEO sin clics de intención de instalación`
    }));
}

function findCalculatorInstallPages(pages = []) {
  return pages
    .filter((page) => page.sessions_with_calculator > 0 && page.sessions_with_calculator_then_install > 0)
    .slice(0, 8)
    .map((page) => ({
      type: "calculator_to_install",
      page: page.page,
      topic: page.topic || page.template_type || page.content_type || "contenido",
      city: page.city || "",
      calculator_used: page.calculator_used_count,
      sessions_with_calculator: page.sessions_with_calculator,
      sessions_with_calculator_then_install: page.sessions_with_calculator_then_install,
      rate: page.calculator_to_install_rate
    }));
}

function findCalculatorLowConversionPages(pages = []) {
  return pages
    .filter((page) => page.sessions_with_calculator >= 3 && page.calculator_to_install_rate < 5)
    .slice(0, 8)
    .map((page) => ({
      type: "calculator_low_conversion",
      page: page.page,
      topic: page.topic || page.template_type || page.content_type || "contenido",
      city: page.city || "",
      score: page.performance_score,
      reason: `${page.sessions_with_calculator} sesiones con calculadora y ${page.calculator_to_install_rate}% intención posterior`
    }));
}

function recommendFutureContent(pages = []) {
  const winners = findWinningTopics(pages);
  const weak = findUnderperformingPages(pages);
  const highInteractionLowInstall = findHighInteractionLowInstallPages(pages);
  const calculatorLowConversion = findCalculatorLowConversionPages(pages);
  const recommendations = [];

  winners.slice(0, 4).forEach((item) => {
    recommendations.push({
      action: "create_related_content",
      priority: "high",
      title: `Crear contenido relacionado con ${item.topic}`,
      detail: item.city ? `Repetir el ángulo en ciudades similares a ${item.city}.` : "Repetir el ángulo con una ciudad o caso cercano.",
      source_page: item.page
    });
  });

  weak.slice(0, 4).forEach((item) => {
    recommendations.push({
      action: "improve_cta",
      priority: "medium",
      title: `Revisar CTA en ${item.page}`,
      detail: "Tiene tráfico pero no genera intención de instalación ni checkout. Probar CTA más concreto o bloque de ejemplo.",
      source_page: item.page
    });
  });

  highInteractionLowInstall.slice(0, 4).forEach((item) => {
    recommendations.push({
      action: "improve_cta",
      priority: "high",
      title: `Mejorar CTA en ${item.page}`,
      detail: "Hay interacción SEO, pero no hay intención de instalación. Probar CTA contextual junto al bloque que genera interacción.",
      source_page: item.page
    });
  });

  calculatorLowConversion.slice(0, 4).forEach((item) => {
    recommendations.push({
      action: "review_calculator_cta",
      priority: "high",
      title: `Revisar calculadora en ${item.page}`,
      detail: "La calculadora se usa, pero no genera intención de instalación. Probar CTA inmediato tras el resultado y ejemplo de siguiente paso.",
      source_page: item.page
    });
  });

  if (!recommendations.length) {
    recommendations.push({
      action: "collect_more_data",
      priority: "low",
      title: "Acumular más eventos antes de decidir",
      detail: "Todavía no hay señal suficiente para orientar contenidos futuros.",
      source_page: ""
    });
  }

  return recommendations;
}

function buildOwnedAnalyticsLearning(events = []) {
  const pages = summarizePagePerformance(events);
  return {
    summary: summarizeOwnedAnalytics(events),
    pages,
    top_pages: pages.slice(0, 10),
    top_cities: groupCount(events, "city"),
    top_templates: groupCount(events, "template_type"),
    top_topics: groupCount(events, "topic"),
    winners: findWinningTopics(pages),
    underperforming: findUnderperformingPages(pages),
    high_interaction_low_install: findHighInteractionLowInstallPages(pages),
    calculator_install_pages: findCalculatorInstallPages(pages),
    calculator_low_conversion: findCalculatorLowConversionPages(pages),
    recommendations: recommendFutureContent(pages)
  };
}

module.exports = {
  buildOwnedAnalyticsLearning,
  findCalculatorInstallPages,
  findCalculatorLowConversionPages,
  findHighInteractionLowInstallPages,
  findUnderperformingPages,
  findWinningTopics,
  recommendFutureContent,
  scoreContentPerformance,
  summarizeOwnedAnalytics,
  summarizePagePerformance
};
