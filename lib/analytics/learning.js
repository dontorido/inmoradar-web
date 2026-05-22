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
  "checkout_error"
];

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
    if (["install_click", "chrome_store_click", "seo_cta_click", "guide_cta_click", "article_cta_click"].includes(row.event_name)) acc[label].install_clicks += 1;
    if (row.event_name === "checkout_created") acc[label].checkout_created += 1;
    return acc;
  }, {});
  return Object.values(counts)
    .sort((a, b) => b.install_clicks - a.install_clicks || b.checkout_created - a.checkout_created || b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function scoreContentPerformance(page = {}) {
  const views = Number(page.page_views || 0);
  const installs = Number(page.install_intent ?? NaN) || Number(page.install_clicks || 0) + Number(page.chrome_store_clicks || 0) + Number(page.seo_cta_click || 0) + Number(page.guide_cta_click || 0) + Number(page.article_cta_click || 0);
  const waitlist = Number(page.waitlist_submit || 0);
  const checkoutStarts = Number(page.checkout_start || 0);
  const checkouts = Number(page.checkout_created || 0);
  const errors = Number(page.checkout_error || 0);
  const base = installs * 8 + waitlist * 5 + checkoutStarts * 12 + checkouts * 30 - errors * 4;
  const efficiency = views ? (installs + checkoutStarts * 2 + checkouts * 5) / views : 0;
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
        ...emptyCounts()
      });
    }
    const item = groups.get(key);
    const eventName = row.event_name;
    if (Object.prototype.hasOwnProperty.call(item, eventName)) item[eventName] += 1;
  });

  return Array.from(groups.values())
    .map((page) => {
      const installs = page.install_click + page.chrome_store_click + page.seo_cta_click + page.guide_cta_click + page.article_cta_click;
      const enriched = {
        ...page,
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
        install_rate: rate(installs, page.page_view),
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
    install_click_rate: rate(installClicks, pageViews),
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
      reason: `${page.install_rate}% instalación / ${page.checkout_created_count} checkouts creados`
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

function recommendFutureContent(pages = []) {
  const winners = findWinningTopics(pages);
  const weak = findUnderperformingPages(pages);
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
      detail: "Tiene tráfico pero no convierte en instalación ni checkout. Probar CTA más concreto o bloque de ejemplo.",
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
    recommendations: recommendFutureContent(pages)
  };
}

module.exports = {
  buildOwnedAnalyticsLearning,
  findUnderperformingPages,
  findWinningTopics,
  recommendFutureContent,
  scoreContentPerformance,
  summarizeOwnedAnalytics,
  summarizePagePerformance
};