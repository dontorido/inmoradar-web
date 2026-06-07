function createSeoHandlers({
  buildSeoDailyPolicySnapshot,
  clampLimit,
  clampPage,
  landingSelect,
  safeFetch,
  seoDailyTargets,
  supabaseFetch
} = {}) {
  const { evaluateSitemapEligibility } = require("../../_seo/indexability");

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

  function qualityDetailsForLanding(row = {}) {
    const sourceData = parseJsonMaybe(row.source_data_json);
    const quality = parseJsonMaybe(sourceData.quality);
    const score = Number(row.quality_score || quality.score || 0);
    const sitemap = evaluateSitemapEligibility(row, { quality });
    const qualityReasons = arrayOrEmpty(quality.rejection_reasons);
    const reasons = sitemap.sitemap_status === "excluded" ? [...new Set([...(sitemap.reasons || []), ...qualityReasons])] : qualityReasons;
    return {
      quality_signals: arrayOrEmpty(quality.signals),
      quality_penalties: arrayOrEmpty(quality.penalties),
      quality_warnings: arrayOrEmpty(quality.warnings),
      quality_reasons: reasons,
      technical_indexability_status:
        quality.technical_indexability_status ||
        (sitemap.sitemap_status === "included" ? "indexable" : sitemap.sitemap_reason),
      editorial_quality_status:
        quality.editorial_quality_status || (score >= 75 ? "pass" : score >= 60 ? "review" : "fail"),
      sitemap_status: sitemap.sitemap_status,
      sitemap_reason: sitemap.sitemap_reason,
      sitemap_reasons: sitemap.reasons || []
    };
  }

  function publicLandingRow(row = {}) {
    const { body_html: _bodyHtml, source_data_json: _sourceDataJson, ...publicRow } = row;
    return {
      ...publicRow,
      ...qualityDetailsForLanding(row)
    };
  }

  function buildSeoLandingsSummary(rows = [], opportunities = [], activeStatus = "all") {
    const landings = Array.isArray(rows) ? rows : [];
    const landingsWithSitemap = landings.map((row) => ({ row, sitemap: evaluateSitemapEligibility(row, { quality: parseJsonMaybe(parseJsonMaybe(row.source_data_json).quality) }) }));
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
    const sitemapIncluded = landingsWithSitemap.filter((item) => item.sitemap.sitemap_eligible).length;
    const sitemapExcluded = landingsWithSitemap.length - sitemapIncluded;
    const sitemapExclusionReasons = landingsWithSitemap
      .filter((item) => !item.sitemap.sitemap_eligible)
      .reduce((acc, item) => {
        const reason = item.sitemap.primary_reason || "unknown";
        acc[reason] = (acc[reason] || 0) + 1;
        return acc;
      }, {});
    const latestPublished = [...landings]
      .filter((row) => String(row.status || "").toLowerCase() === "published")
      .sort((left, right) => Date.parse(right.published_at || right.updated_at || right.last_generated_at || 0) - Date.parse(left.published_at || left.updated_at || left.last_generated_at || 0))
      .slice(0, 5)
      .map((row) => ({
        slug: row.slug,
        title: row.title || row.slug,
        published_at: row.published_at || row.updated_at || row.last_generated_at || null,
        sitemap_status: evaluateSitemapEligibility(row).sitemap_status,
        sitemap_reason: evaluateSitemapEligibility(row).sitemap_reason
      }));
    const warningCounts = {
      canonical: Object.entries(sitemapExclusionReasons)
        .filter(([reason]) => reason.startsWith("canonical_"))
        .reduce((sum, [, count]) => sum + count, 0),
      noindex: Number(indexCounts.noindex || 0) + Number(statusCounts.noindex || 0),
      robots: 0,
      low_content: Number(sitemapExclusionReasons.low_content || 0),
      no_internal_links: Number(sitemapExclusionReasons.no_internal_links || 0)
    };

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
      indexable: landings.filter((row) => String(row.status || "").toLowerCase() === "published" && String(row.index_status || "").toLowerCase() === "index").length,
      sitemap_included: sitemapIncluded,
      sitemap_excluded: sitemapExcluded,
      sitemap_exclusion_reasons: sitemapExclusionReasons,
      published_without_sitemap: landingsWithSitemap.filter((item) => String(item.row.status || "").toLowerCase() === "published" && !item.sitemap.sitemap_eligible).length,
      pending_landings: pendingLandings,
      pending_opportunities: pendingOpportunities,
      published_landings_today: dailyPolicy.published_landings_today,
      published_news_today: dailyPolicy.published_news_today,
      target_landings_per_day: seoDailyTargets.landings,
      target_news_per_day: seoDailyTargets.news,
      seo_daily_status: dailyPolicy.published_landings_today >= seoDailyTargets.landings && dailyPolicy.published_news_today >= seoDailyTargets.news ? "complete" : "pending",
      average_quality_score: scores.length
        ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
        : 0,
      last_sitemap_generated_at: new Date().toISOString(),
      latest_published_landings: latestPublished,
      warnings: warningCounts,
      gsc_discovered_not_indexed: {
        imported: false,
        flow: "Exporta el CSV de Google Search Console, filtra 'Descubierta: actualmente sin indexar' y compara cada URL con sitemap_reasons/canonical/noindex en esta tabla."
      }
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
      select: "slug,title,meta_title,meta_description,h1,body_html,status,index_status,quality_score,word_count,canonical_url,template_type,published_at,updated_at,last_generated_at,source_data_json",
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
