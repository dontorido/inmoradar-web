function createSeoHandlers({
  buildSeoDailyPolicySnapshot,
  clampLimit,
  clampPage,
  landingSelect,
  safeFetch,
  seoDailyTargets,
  supabaseFetch
} = {}) {
  if (typeof buildSeoDailyPolicySnapshot !== "function") throw new Error("admin_seo_daily_policy_required");
  if (typeof clampLimit !== "function") throw new Error("admin_seo_clamp_limit_required");
  if (typeof clampPage !== "function") throw new Error("admin_seo_clamp_page_required");
  if (!landingSelect) throw new Error("admin_seo_landing_select_required");
  if (typeof safeFetch !== "function") throw new Error("admin_seo_safe_fetch_required");
  if (!seoDailyTargets || typeof seoDailyTargets !== "object") throw new Error("admin_seo_daily_targets_required");
  if (typeof supabaseFetch !== "function") throw new Error("admin_seo_supabase_fetch_required");

  function parseJsonMaybe(value, fallback = {}) {
    if (!value) return fallback;
    if (typeof value === "object") return value;
    try {
      return JSON.parse(value);
    } catch (_) {
      return fallback;
    }
  }

  function arrayOrEmpty(value) {
    return Array.isArray(value) ? value.filter(Boolean) : [];
  }

  function sitemapDecision(row) {
    const status = String(row.status || "").toLowerCase();
    const indexStatus = String(row.index_status || "").toLowerCase();
    const score = Number(row.quality_score || 0);
    if (status !== "published") return { status: "excluded", reason: `status_${status || "unknown"}` };
    if (indexStatus !== "index") return { status: "excluded", reason: `index_status_${indexStatus || "unknown"}` };
    if (score < 75) return { status: "excluded", reason: "quality_score_below_75" };
    return { status: "included", reason: "published_index_quality_ok" };
  }

  function qualityDetailsForLanding(row = {}) {
    const sourceData = parseJsonMaybe(row.source_data_json);
    const quality = parseJsonMaybe(sourceData.quality);
    const score = Number(row.quality_score || quality.score || 0);
    const sitemap = sitemapDecision(row);
    const qualityReasons = arrayOrEmpty(quality.rejection_reasons);
    const reasons = sitemap.status === "excluded" ? [...new Set([sitemap.reason, ...qualityReasons])] : qualityReasons;
    return {
      quality_signals: arrayOrEmpty(quality.signals),
      quality_penalties: arrayOrEmpty(quality.penalties),
      quality_warnings: arrayOrEmpty(quality.warnings),
      quality_reasons: reasons,
      technical_indexability_status:
        quality.technical_indexability_status ||
        (sitemap.status === "included" ? "indexable" : sitemap.reason),
      editorial_quality_status:
        quality.editorial_quality_status || (score >= 75 ? "pass" : score >= 60 ? "review" : "fail"),
      sitemap_status: sitemap.status,
      sitemap_reason: sitemap.reason
    };
  }

  function publicLandingRow(row = {}) {
    const { source_data_json: _sourceDataJson, ...publicRow } = row;
    return {
      ...publicRow,
      ...qualityDetailsForLanding(row)
    };
  }

  function buildSeoLandingsSummary(rows = [], opportunities = [], activeStatus = "all") {
    const landings = Array.isArray(rows) ? rows : [];
    const statusCounts = landings.reduce((acc, row) => {
      const key = String(row.status || "unknown").toLowerCase();
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const indexCounts = landings.reduce((acc, row) => {
      const key = String(row.index_status || "unknown").toLowerCase();
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const scores = landings
      .map((row) => Number(row.quality_score || 0))
      .filter((score) => Number.isFinite(score) && score > 0);
    const filteredTotal =
      activeStatus && activeStatus !== "all"
        ? landings.filter((row) => String(row.status || "").toLowerCase() === activeStatus).length
        : landings.length;
    const pendingLandings =
      (statusCounts.draft || 0) + (statusCounts.needs_review || 0) + (statusCounts.ready_to_publish || 0);
    const pendingOpportunities = (Array.isArray(opportunities) ? opportunities : []).filter((row) =>
      ["pending", "generating", "draft", "needs_review"].includes(String(row.status || "").toLowerCase())
    ).length;
    const dailyPolicy = buildSeoDailyPolicySnapshot(landings);

    return {
      total_landings: landings.length,
      filtered_total: filteredTotal,
      published: statusCounts.published || 0,
      ready_to_publish: statusCounts.ready_to_publish || 0,
      needs_review: statusCounts.needs_review || 0,
      draft: statusCounts.draft || 0,
      noindex: landings.filter(
        (row) =>
          String(row.index_status || "").toLowerCase() === "noindex" ||
          String(row.status || "").toLowerCase() === "noindex"
      ).length,
      indexable: indexCounts.index || 0,
      pending_landings: pendingLandings,
      pending_opportunities: pendingOpportunities,
      published_landings_today: dailyPolicy.published_landings_today,
      published_news_today: dailyPolicy.published_news_today,
      target_landings_per_day: seoDailyTargets.landings,
      target_news_per_day: seoDailyTargets.news,
      seo_daily_status: dailyPolicy.published_landings_today >= seoDailyTargets.landings && dailyPolicy.published_news_today >= seoDailyTargets.news ? "complete" : "pending",
      average_quality_score: scores.length
        ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
        : 0
    };
  }

  async function handleSeoLandings(url) {
    const pageSize = clampLimit(url.searchParams.get("limit"), 10, 50);
    const page = clampPage(url.searchParams.get("page"));
    const offset = (page - 1) * pageSize;
    const status = String(url.searchParams.get("status") || "").trim().toLowerCase();
    const params = new URLSearchParams({
      select: landingSelect,
      order: "updated_at.desc",
      limit: String(pageSize + 1),
      offset: String(offset)
    });
    if (status && status !== "all") params.set("status", `eq.${status}`);

    const summaryParams = new URLSearchParams({
      select: "status,index_status,quality_score,template_type,published_at,updated_at,last_generated_at",
      limit: "5000"
    });
    const opportunitiesParams = new URLSearchParams({
      select: "status,template_type",
      limit: "5000"
    });
    const [rows, summaryRows, opportunityRows] = await Promise.all([
      supabaseFetch(`seo_landings?${params.toString()}`),
      safeFetch(`seo_landings?${summaryParams.toString()}`),
      safeFetch(`seo_landing_opportunities?${opportunitiesParams.toString()}`)
    ]);
    const allRows = Array.isArray(rows) ? rows : [];
    const hasNextPage = allRows.length > pageSize;
    const landings = allRows.slice(0, pageSize).map(publicLandingRow);
    const summary = buildSeoLandingsSummary(summaryRows, opportunityRows, status);
    return {
      status: 200,
      payload: {
        ok: true,
        count: landings.length,
        page,
        page_size: pageSize,
        has_next_page: hasNextPage,
        has_previous_page: page > 1,
        from: landings.length ? offset + 1 : 0,
        to: offset + landings.length,
        summary,
        landings
      }
    };
  }

  return {
    handleSeoLandings
  };
}

module.exports = {
  createSeoHandlers
};
