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

  function cleanInspectFilter(value, { lowercase = false } = {}) {
    const cleaned = String(value || "").trim();
    if (!cleaned || cleaned.toLowerCase() === "all") return "";
    const truncated = cleaned.slice(0, 160);
    return lowercase ? truncated.toLowerCase() : truncated;
  }

  function normalizeLandingSlug(value) {
    return String(value || "")
      .trim()
      .replace(/^https?:\/\/[^/]+/i, "")
      .split(/[?#]/)[0]
      .replace(/^\/+|\/+$/g, "")
      .toLowerCase();
  }

  function duplicateOverflowCount(values = []) {
    const counts = values
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean)
      .reduce((acc, value) => {
        acc[value] = (acc[value] || 0) + 1;
        return acc;
      }, {});
    return Object.values(counts).reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  }

  function briefArray(value) {
    return Array.isArray(value) ? value.filter(Boolean) : [];
  }

  function publicBrief(brief = {}) {
    const parsed = parseJsonMaybe(brief);
    return {
      primary_keyword: parsed.primary_keyword || null,
      secondary_keywords: briefArray(parsed.secondary_keywords),
      suggested_title: parsed.suggested_title || null,
      suggested_h1: parsed.suggested_h1 || null,
      suggested_meta_description: parsed.suggested_meta_description || null,
      required_h2_sections: briefArray(parsed.required_h2_sections),
      suggested_faqs: briefArray(parsed.suggested_faqs),
      cta_primary: parsed.cta_primary || null,
      cta_secondary: parsed.cta_secondary || null,
      inmoradar_value_angle: parsed.inmoradar_value_angle || null,
      disclaimer: parsed.disclaimer || null,
      content_warnings: briefArray(parsed.content_warnings),
      quality_requirements: briefArray(parsed.quality_requirements)
    };
  }

  function publicOpportunityRow(row = {}) {
    return {
      id: row.id ?? null,
      keyword: row.keyword || null,
      city: row.city || null,
      suggested_slug: row.suggested_slug || null,
      cluster_id: row.cluster_id || null,
      template_type: row.template_type || null,
      status: row.status || null,
      search_priority: row.search_priority ?? null,
      created_at: row.created_at || null,
      updated_at: row.updated_at || null,
      brief_json: publicBrief(row.brief_json)
    };
  }

  function publicMatchingLanding(row = {}) {
    return {
      id: row.id ?? null,
      slug: row.slug || null,
      template_type: row.template_type || null,
      status: row.status || null,
      index_status: row.index_status || null,
      published_at: row.published_at || null
    };
  }

  function buildSeoLandingsSummary(rows = [], opportunities = [], activeStatus = "all") {
    const landings = Array.isArray(rows) ? rows : [];
    const opportunityRows = Array.isArray(opportunities) ? opportunities : [];
    const landingsWithSitemap = landings.map((row) => ({ row, sitemap: evaluateSitemapEligibility(row, { quality: parseJsonMaybe(parseJsonMaybe(row.source_data_json).quality) }) }));
    const pipelineTemplateTypes = ["price_city", "rent_city", "expensive_listing_city", "editorial_guide", "home_life_topic"];
    const autopublishTemplateTypes = new Set(["price_city", "rent_city", "expensive_listing_city", "editorial_guide"]);
    const normalizeTemplateType = (value) => String(value || "unknown").trim().toLowerCase() || "unknown";
    const emptyPipelineBucket = (templateType) => ({
      pending: 0,
      needs_review: 0,
      ready_to_publish: 0,
      published: 0,
      indexables: 0,
      sitemap: 0,
      autopublish_allowed: autopublishTemplateTypes.has(templateType)
    });
    const pipelineByTemplate = pipelineTemplateTypes.reduce((acc, templateType) => {
      acc[templateType] = emptyPipelineBucket(templateType);
      return acc;
    }, {});
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const ensurePipelineBucket = (templateType) => {
      if (!pipelineByTemplate[templateType]) pipelineByTemplate[templateType] = emptyPipelineBucket(templateType);
      return pipelineByTemplate[templateType];
    };
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
    const pendingOpportunities = opportunityRows.filter((row) =>
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
    for (const row of opportunityRows) {
      const status = String(row.status || "").toLowerCase();
      if (status !== "pending") continue;
      const bucket = ensurePipelineBucket(normalizeTemplateType(row.template_type));
      bucket.pending += 1;
    }
    for (const item of landingsWithSitemap) {
      const row = item.row || {};
      const status = String(row.status || "").toLowerCase();
      const bucket = ensurePipelineBucket(normalizeTemplateType(row.template_type));
      if (status === "needs_review") bucket.needs_review += 1;
      if (status === "ready_to_publish") bucket.ready_to_publish += 1;
      if (status === "published") bucket.published += 1;
      if (status === "published" && String(row.index_status || "").toLowerCase() === "index") bucket.indexables += 1;
      if (item.sitemap.sitemap_eligible) bucket.sitemap += 1;
    }
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
      pipeline_by_template: pipelineByTemplate,
      published_landings_today: dailyPolicy.published_landings_today,
      published_news_today: dailyPolicy.published_news_today,
      target_landings_per_day: seoDailyTargets.landings,
      target_news_per_day: seoDailyTargets.news,
      published_landings_week: landings.filter((row) => {
        if (String(row.status || "").toLowerCase() !== "published") return false;
        const timestamp = Date.parse(row.published_at || row.updated_at || row.last_generated_at || "");
        return Number.isFinite(timestamp) && timestamp >= oneWeekAgo;
      }).length,
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
    const templateType = String(url.searchParams.get("template_type") || url.searchParams.get("template") || "").trim().toLowerCase();
    const params = new URLSearchParams({
      select: landingSelect,
      order: "updated_at.desc",
      limit: String(pageSize + 1),
      offset: String(offset)
    });
    if (status && status !== "all") params.set("status", `eq.${status}`);
    if (templateType && templateType !== "all") params.set("template_type", `eq.${templateType}`);

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

  async function handleSeoOpportunitiesInspect(url) {
    const pageSize = clampLimit(url.searchParams.get("limit"), 10, 50);
    const filters = {
      template_type: cleanInspectFilter(url.searchParams.get("template_type"), { lowercase: true }),
      cluster_id: cleanInspectFilter(url.searchParams.get("cluster_id")),
      status: cleanInspectFilter(url.searchParams.get("status"), { lowercase: true }),
      suggested_slug: cleanInspectFilter(url.searchParams.get("suggested_slug")),
      keyword: cleanInspectFilter(url.searchParams.get("keyword"))
    };
    const activeFilters = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
    const warnings = Object.keys(activeFilters).length ? [] : ["no_filters_applied_limit_enforced"];
    const opportunitySelect =
      "id,keyword,city,suggested_slug,cluster_id,template_type,status,search_priority,created_at,updated_at,brief_json";
    const opportunityParams = new URLSearchParams({
      select: opportunitySelect,
      order: "search_priority.desc,id.asc",
      limit: String(pageSize)
    });
    if (filters.template_type) opportunityParams.set("template_type", `eq.${filters.template_type}`);
    if (filters.cluster_id) opportunityParams.set("cluster_id", `eq.${filters.cluster_id}`);
    if (filters.status) opportunityParams.set("status", `eq.${filters.status}`);
    if (filters.suggested_slug) opportunityParams.set("suggested_slug", `eq.${filters.suggested_slug}`);
    if (filters.keyword) opportunityParams.set("keyword", `eq.${filters.keyword}`);

    const rows = await supabaseFetch(`seo_landing_opportunities?${opportunityParams.toString()}`);
    const opportunities = Array.isArray(rows) ? rows : [];
    let duplicateSuggestedSlugCount = duplicateOverflowCount(opportunities.map((row) => row.suggested_slug));
    let duplicateKeywordClusterCount = duplicateOverflowCount(
      opportunities.map((row) => (row.keyword && row.cluster_id ? `${row.keyword}::${row.cluster_id}` : ""))
    );
    let matchingLandings = [];
    const slugForLookup = filters.suggested_slug || opportunities[0]?.suggested_slug || "";
    const landingSlug = normalizeLandingSlug(slugForLookup);

    if (filters.suggested_slug) {
      const slugParams = new URLSearchParams({
        select: "id,keyword,cluster_id,suggested_slug,template_type,status",
        suggested_slug: `eq.${filters.suggested_slug}`,
        limit: "5000"
      });
      const slugRows = await supabaseFetch(`seo_landing_opportunities?${slugParams.toString()}`);
      duplicateSuggestedSlugCount = Math.max(
        duplicateSuggestedSlugCount,
        Math.max(0, (Array.isArray(slugRows) ? slugRows.length : 0) - 1)
      );
    }

    if (filters.keyword && filters.cluster_id) {
      const keywordClusterParams = new URLSearchParams({
        select: "id,keyword,cluster_id,suggested_slug,template_type,status",
        keyword: `eq.${filters.keyword}`,
        cluster_id: `eq.${filters.cluster_id}`,
        limit: "5000"
      });
      const keywordClusterRows = await supabaseFetch(`seo_landing_opportunities?${keywordClusterParams.toString()}`);
      duplicateKeywordClusterCount = Math.max(
        duplicateKeywordClusterCount,
        Math.max(0, (Array.isArray(keywordClusterRows) ? keywordClusterRows.length : 0) - 1)
      );
    }

    if (landingSlug) {
      const landingParams = new URLSearchParams({
        select: "id,slug,template_type,status,index_status,published_at",
        slug: `eq.${landingSlug}`,
        limit: "50"
      });
      const landingRows = await supabaseFetch(`seo_landings?${landingParams.toString()}`);
      matchingLandings = Array.isArray(landingRows) ? landingRows.map(publicMatchingLanding) : [];
    }

    return {
      status: 200,
      payload: {
        ok: true,
        read_only: true,
        filters_applied: activeFilters,
        warnings,
        count: opportunities.length,
        limit_applied: pageSize,
        opportunities: opportunities.map(publicOpportunityRow),
        duplicate_suggested_slug_count: duplicateSuggestedSlugCount,
        duplicate_keyword_cluster_count: duplicateKeywordClusterCount,
        matching_landing_slug_count: matchingLandings.length,
        matching_landings: matchingLandings
      }
    };
  }

  return {
    handleSeoLandings,
    handleSeoOpportunitiesInspect
  };
}

module.exports = {
  createSeoHandlers
};
