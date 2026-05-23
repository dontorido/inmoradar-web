const { hasSupabaseConfig, supabaseFetch } = require("../_utils");
const { buildPriceCitySourceData } = require("./marketSources");
const { buildPriceCityLanding } = require("./priceCity");
const { calculateSeoLandingQuality } = require("./quality");
const { normalizeText, stripHtml } = require("./text");
const { buildExpensiveListingCityLanding } = require("../../lib/seo/cityGuideTemplates");

const JOB_NAME = "seo-autogeneration";
const SCHEDULE = "0 */6 * * *";
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const MAX_DRAFTS_PER_RUN = 1;
const SIMILARITY_BLOCK_THRESHOLD = 0.985;
const ALLOWED_AUTOGENERATION_TEMPLATE_TYPES = ["price_city", "expensive_listing_city"];
const ALLOWED_TEMPLATE_SET = new Set(ALLOWED_AUTOGENERATION_TEMPLATE_TYPES);

function safeError(error) {
  return String(error?.message || error || "unknown_error")
    .replace(/eyJ[a-zA-Z0-9._-]+/g, "[redacted-jwt]")
    .replace(/sb_secret_[a-zA-Z0-9._-]+/g, "[redacted-secret]")
    .slice(0, 500);
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  const number = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(min, Math.min(max, number));
}

function buildSeoAutogenerationConfig(env = process.env, overrides = {}) {
  const enabled =
    typeof overrides.enabled === "boolean"
      ? overrides.enabled
      : parseBoolean(env.SEO_AUTOGENERATION_ENABLED, false);
  const dryRun =
    typeof overrides.dryRun === "boolean"
      ? overrides.dryRun
      : parseBoolean(env.SEO_AUTOGENERATION_DRY_RUN, true);

  return {
    enabled,
    dry_run: dryRun,
    max_per_run: clampInt(overrides.maxPerRun ?? env.SEO_AUTOGENERATION_MAX_PER_RUN, 1, 1, 1),
    max_per_day: clampInt(overrides.maxPerDay ?? env.SEO_AUTOGENERATION_MAX_PER_DAY, 3, 1, 3),
    max_per_week: clampInt(overrides.maxPerWeek ?? env.SEO_AUTOGENERATION_MAX_PER_WEEK, 10, 1, 10),
    min_score: clampInt(overrides.minScore ?? env.SEO_AUTOGENERATION_MIN_SCORE, 80, 80, 100),
    candidate_limit: clampInt(overrides.candidateLimit ?? env.SEO_AUTOGENERATION_CANDIDATE_LIMIT, 25, 1, 50),
    allowed_template_types: ALLOWED_AUTOGENERATION_TEMPLATE_TYPES,
    schedule: SCHEDULE
  };
}

function nowIso(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function nextSixHourRun(now = new Date()) {
  const date = new Date(now);
  date.setUTCMinutes(0, 0, 0);
  const nextHour = Math.floor(date.getUTCHours() / 6) * 6 + 6;
  date.setUTCHours(nextHour);
  return date.toISOString();
}

function normalizedKey(value) {
  return normalizeText(value).replace(/\s+/g, " ");
}

function normalizeSlug(value) {
  return String(value || "").trim().replace(/^\/+|\/+$/g, "").toLowerCase();
}

function targetPathForSlug(slug) {
  const clean = normalizeSlug(slug);
  return clean ? `/${clean}/` : "/";
}

function candidateKey(opportunity) {
  return `${String(opportunity.template_type || "").toLowerCase()}|${normalizedKey(opportunity.city)}`;
}

function normalizeOpportunity(row = {}) {
  return {
    id: row.id || null,
    keyword: String(row.keyword || "").trim(),
    city: String(row.city || row.municipality || "").trim(),
    province: String(row.province || "").trim(),
    autonomous_community: String(row.autonomous_community || "").trim(),
    intent: String(row.intent || "informational").trim(),
    template_type: String(row.template_type || "").trim().toLowerCase(),
    search_priority: Number(row.search_priority || row.priority || 0),
    source: row.source || null
  };
}

function dedupeOpportunities(opportunities) {
  const byKey = new Map();
  for (const raw of opportunities || []) {
    const opportunity = normalizeOpportunity(raw);
    const key = candidateKey(opportunity);
    if (!opportunity.city || !opportunity.template_type || !key.includes("|")) continue;
    const existing = byKey.get(key);
    if (!existing || Number(opportunity.search_priority || 0) > Number(existing.search_priority || 0)) {
      byKey.set(key, opportunity);
    }
  }
  return [...byKey.values()].sort((a, b) => Number(b.search_priority || 0) - Number(a.search_priority || 0));
}

function opportunityFromMarketRow(row, templateType) {
  const city = String(row.municipality || row.city || "").trim();
  if (!city) return null;
  const config =
    templateType === "expensive_listing_city"
      ? {
          keyword: `saber si un piso esta caro en ${city}`,
          intent: "commercial_investigation",
          priority: 82
        }
      : {
          keyword: `precio metro cuadrado ${city}`,
          intent: "informational",
          priority: 88
        };
  return {
    keyword: config.keyword,
    city,
    province: row.province || "",
    autonomous_community: row.autonomous_community || "",
    intent: config.intent,
    template_type: templateType,
    search_priority: config.priority,
    source: "market_price_sources"
  };
}

function targetCityOpportunities(env = process.env) {
  return String(env.SEO_AUTOGENERATION_TARGET_CITIES || "")
    .split(",")
    .map((city) => city.trim())
    .filter(Boolean)
    .flatMap((city) =>
      ALLOWED_AUTOGENERATION_TEMPLATE_TYPES.map((templateType) => ({
        keyword:
          templateType === "expensive_listing_city"
            ? `saber si un piso esta caro en ${city}`
            : `precio metro cuadrado ${city}`,
        city,
        province: "",
        autonomous_community: "",
        intent: templateType === "expensive_listing_city" ? "commercial_investigation" : "informational",
        template_type: templateType,
        search_priority: 70,
        source: "target_cities_env"
      }))
    );
}

async function safeSupabase(path, fallback = []) {
  try {
    const rows = await supabaseFetch(path, { timeoutMs: 8000 });
    return Array.isArray(rows) ? rows : fallback;
  } catch (error) {
    return fallback;
  }
}

function createSupabaseStorage(env = process.env) {
  return {
    async startRun({ now, requestSource }) {
      if (!hasSupabaseConfig()) return { persisted: false, acquired: true, warning: "supabase_not_configured" };
      const runKey =
        requestSource === "cron"
          ? `${JOB_NAME}:${new Date(now).toISOString().slice(0, 13)}`
          : `${JOB_NAME}:manual:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
      const rows = await supabaseFetch("seo_cron_runs?on_conflict=run_key", {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
        body: JSON.stringify([
          {
            run_key: runKey,
            job_name: JOB_NAME,
            status: "running",
            started_at: now
          }
        ]),
        timeoutMs: 5000
      });
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row?.id) return { persisted: true, acquired: false, reason: "cron_already_running_or_completed" };
      return { persisted: true, acquired: true, id: row.id, run_key: row.run_key };
    },
    async finishRun(run, patch) {
      if (!run?.persisted || !run?.id) return null;
      return supabaseFetch(`seo_cron_runs?id=eq.${encodeURIComponent(run.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          status: patch.status,
          finished_at: patch.finished_at,
          result_json: patch.result_json || {},
          error_message: patch.error_message || null
        }),
        timeoutMs: 5000
      });
    },
    async fetchRecentRuns(limit = 10) {
      if (!hasSupabaseConfig()) return [];
      return safeSupabase(
        `seo_cron_runs?select=*&job_name=eq.${JOB_NAME}&order=started_at.desc&limit=${encodeURIComponent(String(limit))}`,
        []
      );
    },
    async fetchExistingLandings() {
      if (!hasSupabaseConfig()) return [];
      return safeSupabase(
        "seo_landings?select=id,slug,title,meta_title,meta_description,h1,body_html,city,template_type,status,index_status,published_at,quality_score,source_data_json&limit=5000",
        []
      );
    },
    async fetchRecentPublishedLandings({ now }) {
      if (!hasSupabaseConfig()) return [];
      const since = new Date(new Date(now).getTime() - WEEK_MS - DAY_MS).toISOString();
      return safeSupabase(
        `seo_landings?select=id,slug,template_type,status,index_status,published_at&status=eq.published&published_at=gte.${encodeURIComponent(
          since
        )}&order=published_at.desc&limit=5000`,
        []
      );
    },
    async fetchCandidateOpportunities({ candidateLimit }) {
      if (!hasSupabaseConfig()) return targetCityOpportunities(env).slice(0, candidateLimit);
      const templateList = ALLOWED_AUTOGENERATION_TEMPLATE_TYPES.join(",");
      const opportunityParams = new URLSearchParams({
        select: "*",
        status: "eq.pending",
        template_type: `in.(${templateList})`,
        order: "search_priority.desc",
        limit: String(candidateLimit)
      });
      const marketParams = new URLSearchParams({
        select: "municipality,province,autonomous_community,operation,source,source_url,period_label,period_date,price_eur_m2",
        operation: "eq.sale",
        municipality: "not.is.null",
        price_eur_m2: "not.is.null",
        limit: "1000"
      });
      const analyticsSince = new Date(Date.now() - 30 * DAY_MS).toISOString();
      const analyticsParams = new URLSearchParams({
        select: "event_name,page_path,city,template_type,created_at",
        event_name: "in.(calculator_used,calculator_completed,seo_cta_click,install_click,chrome_store_click)",
        created_at: `gte.${analyticsSince}`,
        limit: "1000"
      });
      const [opportunities, marketRows, analyticsRows] = await Promise.all([
        safeSupabase(`seo_landing_opportunities?${opportunityParams.toString()}`, []),
        safeSupabase(`market_price_sources?${marketParams.toString()}`, []),
        safeSupabase(`owned_analytics_events?${analyticsParams.toString()}`, [])
      ]);
      const analyticsBoostByCity = new Map();
      for (const row of analyticsRows) {
        const city = normalizedKey(row.city || cityFromSeoPath(row.page_path));
        if (!city) continue;
        analyticsBoostByCity.set(city, (analyticsBoostByCity.get(city) || 0) + 3);
      }
      const fromMarket = marketRows.flatMap((row) =>
        ALLOWED_AUTOGENERATION_TEMPLATE_TYPES.map((templateType) => opportunityFromMarketRow(row, templateType)).filter(Boolean)
      );
      const targets = targetCityOpportunities(env);
      const merged = dedupeOpportunities([...opportunities, ...fromMarket, ...targets]);
      return merged
        .map((opportunity) => ({
          ...opportunity,
          search_priority: Math.min(100, Number(opportunity.search_priority || 0) + (analyticsBoostByCity.get(normalizedKey(opportunity.city)) || 0))
        }))
        .slice(0, candidateLimit);
    },
    async saveLanding(record) {
      if (!hasSupabaseConfig()) throw new Error("Supabase is not configured");
      const rows = await supabaseFetch("seo_landings", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify([record])
      });
      return Array.isArray(rows) ? rows[0] : rows;
    },
    async updateOpportunity(opportunity, patch) {
      if (!hasSupabaseConfig() || !opportunity?.id) return null;
      return supabaseFetch(`seo_landing_opportunities?id=eq.${encodeURIComponent(opportunity.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(patch)
      });
    }
  };
}

function cityFromSeoPath(path) {
  const match = String(path || "").match(/^\/(?:precio-metro-cuadrado|saber-si-piso-esta-caro)\/([^/?#]+)/i);
  return match ? match[1].replace(/-/g, " ") : "";
}

function countPublishedSince(rows, sinceMs) {
  return (rows || []).filter((row) => {
    const publishedAt = Date.parse(row.published_at || row.created_at || "");
    return Number.isFinite(publishedAt) && publishedAt >= sinceMs;
  }).length;
}

function buildLimitSnapshot({ recentPublished, now, config, publishedThisRun = 0 }) {
  const nowMs = new Date(now).getTime();
  const publishedLast24h = countPublishedSince(recentPublished, nowMs - DAY_MS) + publishedThisRun;
  const publishedLast7d = countPublishedSince(recentPublished, nowMs - WEEK_MS) + publishedThisRun;
  return {
    max_per_run: config.max_per_run,
    max_per_day: config.max_per_day,
    max_per_week: config.max_per_week,
    published_this_run: publishedThisRun,
    published_last_24h: publishedLast24h,
    published_last_7d: publishedLast7d,
    remaining_run: Math.max(0, config.max_per_run - publishedThisRun),
    remaining_day: Math.max(0, config.max_per_day - publishedLast24h),
    remaining_week: Math.max(0, config.max_per_week - publishedLast7d)
  };
}

function hasSufficientSourceData(sourceData) {
  if (!sourceData?.hasRealData || sourceData?.hasProvincialOnly) return false;
  if (!sourceData.sale?.price_eur_m2) return false;
  const records = Array.isArray(sourceData.records) ? sourceData.records : [];
  if (!records.length) return false;
  return records.every((record) => record.source && record.source_url && record.price_eur_m2 && (record.period_label || record.period_date));
}

function sourceDataReason(sourceData) {
  if (!sourceData?.hasRealData) return "insufficient_source_data";
  if (sourceData?.hasProvincialOnly) return "city_level_data_missing";
  if (!sourceData.sale?.price_eur_m2) return "sale_data_missing";
  return "source_metadata_incomplete";
}

function ngrams(text, size = 5) {
  const words = normalizeText(stripHtml(text))
    .split(/\s+/)
    .filter((word) => word.length > 2);
  if (words.length <= size) return new Set(words);
  const result = new Set();
  for (let index = 0; index <= words.length - size; index += 1) {
    result.add(words.slice(index, index + size).join(" "));
  }
  return result;
}

function jaccard(left, right) {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const item of left) {
    if (right.has(item)) intersection += 1;
  }
  const union = left.size + right.size - intersection;
  return union ? intersection / union : 0;
}

function maxBodySimilarity(landing, existingLandings) {
  const current = ngrams(landing.body_html);
  return (existingLandings || []).reduce((max, row) => Math.max(max, jaccard(current, ngrams(row.body_html))), 0);
}

function uniquenessCheck(landing, existingLandings) {
  const slug = normalizeSlug(landing.slug);
  const targetPath = targetPathForSlug(slug);
  const cityKey = normalizedKey(landing.city);
  const templateType = String(landing.template_type || "").toLowerCase();
  const normalized = {
    title: normalizedKey(landing.title),
    h1: normalizedKey(landing.h1),
    meta_description: normalizedKey(landing.meta_description),
    meta_title: normalizedKey(landing.meta_title)
  };
  for (const row of existingLandings || []) {
    if (normalizeSlug(row.slug) === slug || targetPathForSlug(row.slug) === targetPath) {
      return { ok: false, reason: "target_path_exists" };
    }
    if (String(row.template_type || "").toLowerCase() === templateType && normalizedKey(row.city) === cityKey) {
      return { ok: false, reason: "city_template_exists" };
    }
    if (normalizedKey(row.title) === normalized.title) return { ok: false, reason: "duplicate_title" };
    if (normalizedKey(row.h1) === normalized.h1) return { ok: false, reason: "duplicate_h1" };
    if (normalizedKey(row.meta_description) === normalized.meta_description) return { ok: false, reason: "duplicate_meta_description" };
    if (normalizedKey(row.meta_title) === normalized.meta_title) return { ok: false, reason: "duplicate_meta_title" };
  }
  const similarity = maxBodySimilarity(landing, existingLandings);
  if (similarity >= SIMILARITY_BLOCK_THRESHOLD) {
    return { ok: false, reason: "too_similar_to_existing_page", similarity };
  }
  return { ok: true, similarity };
}

function dataQualityScore(sourceData) {
  if (!hasSufficientSourceData(sourceData)) return 0;
  const records = sourceData.records || [];
  const allWithDates = records.every((record) => record.period_label || record.period_date);
  const municipalityOrBetter = records.some((record) => ["municipality", "neighbourhood", "zone", "district"].includes(record.geo_level));
  let score = 75;
  if (sourceData.sale) score += 10;
  if (municipalityOrBetter) score += 10;
  if (allWithDates) score += 5;
  return Math.min(100, score);
}

function uniquenessScore(check) {
  if (!check.ok) return 0;
  const similarity = Number(check.similarity || 0);
  if (similarity < 0.7) return 100;
  if (similarity < 0.85) return 95;
  if (similarity < 0.94) return 88;
  return 80;
}

function seoOpportunityScore(opportunity) {
  const priority = Number(opportunity.search_priority || 0);
  if (!priority) return 70;
  return Math.max(55, Math.min(100, priority));
}

function conversionPotentialScore(opportunity) {
  if (opportunity.template_type === "price_city") return 95;
  if (opportunity.template_type === "expensive_listing_city") return 90;
  return 70;
}

function scoreAutogenerationCandidate({ opportunity, quality, uniqueness, sourceData }) {
  const components = {
    data_quality_score: dataQualityScore(sourceData),
    uniqueness_score: uniquenessScore(uniqueness),
    seo_opportunity_score: seoOpportunityScore(opportunity),
    conversion_potential_score: conversionPotentialScore(opportunity),
    template_quality_score: Number(quality?.score || 0)
  };
  const weighted =
    components.data_quality_score * 0.35 +
    components.uniqueness_score * 0.25 +
    components.seo_opportunity_score * 0.2 +
    components.conversion_potential_score * 0.2;
  return {
    ...components,
    final_score: Math.max(0, Math.min(100, Math.round(Math.min(weighted, components.template_quality_score || weighted))))
  };
}

function buildLandingForOpportunity(opportunity, sourceData) {
  if (opportunity.template_type === "price_city") return buildPriceCityLanding(opportunity, sourceData);
  if (opportunity.template_type === "expensive_listing_city") return buildExpensiveListingCityLanding(opportunity, sourceData);
  throw new Error(`Unsupported template_type: ${opportunity.template_type}`);
}

function buildLandingRecord({ opportunity, landing, sourceData, quality, score, status, now }) {
  const publishedAt = status === "published" ? now : null;
  return {
    opportunity_id: opportunity.id || null,
    slug: landing.slug,
    title: landing.title,
    meta_title: landing.meta_title,
    meta_description: landing.meta_description,
    h1: landing.h1,
    body_html: landing.body_html,
    city: landing.city,
    province: landing.province,
    autonomous_community: landing.autonomous_community,
    template_type: landing.template_type,
    canonical_url: landing.canonical_url,
    index_status: status === "published" ? "index" : "noindex",
    status,
    quality_score: score.final_score,
    word_count: quality.word_count,
    source_data_json: {
      generated_by: "inmoradar_seo_autogeneration",
      template_type: landing.template_type,
      sources: sourceData.sources || [],
      score,
      quality,
      faq: landing.faq || [],
      lookup_error: sourceData.lookup_error || null
    },
    published_at: publishedAt,
    last_generated_at: now
  };
}

function resultFor({ opportunity, landing, status, reason, score, quality, sourceData, saved, targetPath }) {
  return {
    page_type: opportunity?.template_type || null,
    city: opportunity?.city || null,
    target_path: targetPath || (landing?.slug ? targetPathForSlug(landing.slug) : null),
    status,
    reason,
    final_score: score?.final_score ?? null,
    quality_score: quality?.score ?? null,
    data_quality_score: score?.data_quality_score ?? null,
    uniqueness_score: score?.uniqueness_score ?? null,
    seo_opportunity_score: score?.seo_opportunity_score ?? null,
    conversion_potential_score: score?.conversion_potential_score ?? null,
    sources_count: Array.isArray(sourceData?.sources) ? sourceData.sources.length : 0,
    saved: Boolean(saved)
  };
}

function emptySummary({ config, now, requestSource, reason }) {
  return {
    ok: true,
    job_name: JOB_NAME,
    request_source: requestSource,
    enabled: config.enabled,
    dry_run: config.dry_run,
    started_at: now,
    finished_at: now,
    candidates_count: 0,
    published_count: 0,
    draft_count: 0,
    skipped_count: reason ? 1 : 0,
    failed_count: 0,
    reason: reason || null,
    results: reason ? [{ status: "skipped", reason, target_path: null, final_score: null }] : [],
    limits: {
      max_per_run: config.max_per_run,
      max_per_day: config.max_per_day,
      max_per_week: config.max_per_week,
      published_this_run: 0,
      published_last_24h: 0,
      published_last_7d: 0,
      remaining_run: config.max_per_run,
      remaining_day: config.max_per_day,
      remaining_week: config.max_per_week
    },
    config
  };
}

async function finishRun(storage, run, summary, status = "completed", errorMessage = null) {
  if (!storage?.finishRun) return;
  try {
    await storage.finishRun(run, {
      status,
      finished_at: summary.finished_at || new Date().toISOString(),
      result_json: summary,
      error_message: errorMessage
    });
  } catch (error) {
    console.warn("[seo-autogeneration] failed to update run log", safeError(error));
  }
}

async function runSeoAutogeneration(options = {}) {
  const now = nowIso(options.now);
  const requestSource = options.requestSource || "manual";
  const env = options.env || process.env;
  const config = buildSeoAutogenerationConfig(env, options.config || {});
  const storage = options.storage || createSupabaseStorage(env);
  let run = null;

  try {
    if (storage.startRun) {
      run = await storage.startRun({ now, requestSource });
      if (run && run.acquired === false) {
        const summary = emptySummary({ config, now, requestSource, reason: run.reason || "cron_already_running_or_completed" });
        await finishRun(storage, run, summary, "skipped", null);
        return summary;
      }
    }

    if (!config.enabled) {
      const summary = emptySummary({ config, now, requestSource, reason: "autogeneration_disabled" });
      await finishRun(storage, run, summary, "skipped", null);
      return summary;
    }

    if (!config.dry_run && !options.storage && !hasSupabaseConfig()) {
      const summary = emptySummary({ config, now, requestSource, reason: "supabase_not_configured" });
      await finishRun(storage, run, summary, "skipped", null);
      return summary;
    }

    const [existingLandings, recentPublished, rawCandidates] = await Promise.all([
      storage.fetchExistingLandings ? storage.fetchExistingLandings() : [],
      storage.fetchRecentPublishedLandings ? storage.fetchRecentPublishedLandings({ now }) : [],
      options.opportunities || (storage.fetchCandidateOpportunities ? storage.fetchCandidateOpportunities(config) : [])
    ]);
    const candidates = dedupeOpportunities(rawCandidates).slice(0, config.candidate_limit);
    const results = [];
    let publishedCount = 0;
    let publishSlotCount = 0;
    let draftCount = 0;
    let failedCount = 0;
    const existingAndSaved = [...(existingLandings || [])];
    const sourceDataProvider = options.sourceDataProvider || buildPriceCitySourceData;

    if (!candidates.length) {
      results.push({ status: "skipped", reason: "no_candidates", target_path: null, final_score: null });
    }

    for (const opportunity of candidates) {
      const limitSnapshot = buildLimitSnapshot({ recentPublished, now, config, publishedThisRun: publishSlotCount });
      if (!ALLOWED_TEMPLATE_SET.has(opportunity.template_type)) {
        results.push(resultFor({ opportunity, status: "skipped", reason: "unsupported_template_type" }));
        continue;
      }
      if (!opportunity.city) {
        results.push(resultFor({ opportunity, status: "skipped", reason: "city_required" }));
        continue;
      }
      if (limitSnapshot.remaining_day <= 0) {
        results.push(resultFor({ opportunity, status: "skipped", reason: "daily_limit_reached" }));
        continue;
      }
      if (limitSnapshot.remaining_week <= 0) {
        results.push(resultFor({ opportunity, status: "skipped", reason: "weekly_limit_reached" }));
        continue;
      }
      if (publishSlotCount >= config.max_per_run) {
        results.push(resultFor({ opportunity, status: "skipped", reason: "run_limit_reached" }));
        continue;
      }

      try {
        const sourceData = await sourceDataProvider(opportunity);
        if (!hasSufficientSourceData(sourceData)) {
          results.push(resultFor({ opportunity, status: "skipped", reason: sourceDataReason(sourceData), sourceData }));
          continue;
        }

        const landing = buildLandingForOpportunity(opportunity, sourceData);
        const targetPath = targetPathForSlug(landing.slug);
        const uniqueness = uniquenessCheck(landing, existingAndSaved);
        if (!uniqueness.ok) {
          results.push(resultFor({ opportunity, landing, status: "skipped", reason: uniqueness.reason, targetPath, sourceData }));
          continue;
        }

        const quality = calculateSeoLandingQuality(landing, { ...sourceData, faq: landing.faq });
        const score = scoreAutogenerationCandidate({ opportunity, quality, uniqueness, sourceData });
        if (score.final_score >= config.min_score) {
          const status = config.dry_run ? "would_publish" : "published";
          const record = buildLandingRecord({ opportunity, landing, sourceData, quality, score, status: "published", now });
          let saved = null;
          if (!config.dry_run) {
            saved = await storage.saveLanding(record);
            if (storage.updateOpportunity) {
              await storage.updateOpportunity(opportunity, {
                data_available: true,
                quality_score: score.final_score,
                status: "published"
              });
            }
            existingAndSaved.push(record);
          }
          publishSlotCount += 1;
          publishedCount += config.dry_run ? 0 : 1;
          results.push(resultFor({ opportunity, landing, status, reason: null, score, quality, sourceData, saved, targetPath }));
          if (publishSlotCount >= config.max_per_run) continue;
          continue;
        }

        if (score.final_score >= 60) {
          const shouldDraft = !config.dry_run && draftCount < MAX_DRAFTS_PER_RUN;
          let saved = null;
          if (shouldDraft) {
            const record = buildLandingRecord({ opportunity, landing, sourceData, quality, score, status: "draft", now });
            saved = await storage.saveLanding(record);
            draftCount += 1;
            existingAndSaved.push(record);
          }
          results.push(
            resultFor({
              opportunity,
              landing,
              status: config.dry_run ? "would_skip" : shouldDraft ? "draft" : "skipped",
              reason: shouldDraft ? "score_below_publish_threshold_drafted" : "score_below_publish_threshold",
              score,
              quality,
              sourceData,
              saved,
              targetPath
            })
          );
          continue;
        }

        results.push(
          resultFor({
            opportunity,
            landing,
            status: "skipped",
            reason: "score_below_draft_threshold",
            score,
            quality,
            sourceData,
            targetPath
          })
        );
      } catch (error) {
        failedCount += 1;
        results.push(resultFor({ opportunity, status: "failed", reason: safeError(error) }));
      }
    }

    const finishedAt = new Date().toISOString();
    const skippedCount = results.filter((result) => ["skipped", "would_skip"].includes(result.status)).length;
    const summary = {
      ok: true,
      job_name: JOB_NAME,
      request_source: requestSource,
      enabled: config.enabled,
      dry_run: config.dry_run,
      started_at: now,
      finished_at: finishedAt,
      candidates_count: candidates.length,
      published_count: config.dry_run ? 0 : publishedCount,
      would_publish_count: results.filter((result) => result.status === "would_publish").length,
      draft_count: draftCount,
      skipped_count: skippedCount,
      failed_count: failedCount,
      reason: null,
      results,
      limits: buildLimitSnapshot({ recentPublished, now, config, publishedThisRun: publishedCount }),
      config
    };
    await finishRun(storage, run, summary, failedCount ? "failed" : "completed", failedCount ? "candidate_failed" : null);
    return summary;
  } catch (error) {
    const summary = emptySummary({ config, now, requestSource, reason: "autogeneration_failed" });
    summary.ok = false;
    summary.error = safeError(error);
    summary.finished_at = new Date().toISOString();
    await finishRun(storage, run, summary, "failed", summary.error);
    return summary;
  }
}

async function getSeoAutogenerationStatus(options = {}) {
  const env = options.env || process.env;
  const config = buildSeoAutogenerationConfig(env, options.config || {});
  const storage = options.storage || createSupabaseStorage(env);
  const now = nowIso(options.now);
  const [recentRuns, recentPublished] = await Promise.all([
    storage.fetchRecentRuns ? storage.fetchRecentRuns(10) : [],
    storage.fetchRecentPublishedLandings ? storage.fetchRecentPublishedLandings({ now }) : []
  ]);
  const limits = buildLimitSnapshot({ recentPublished, now, config, publishedThisRun: 0 });
  return {
    ok: true,
    job_name: JOB_NAME,
    generated_at: now,
    config,
    limits,
    last_run: Array.isArray(recentRuns) ? recentRuns[0] || null : null,
    recent_runs: Array.isArray(recentRuns) ? recentRuns : [],
    next_scheduled_at: nextSixHourRun(new Date(now)),
    pause_hint: "Set SEO_AUTOGENERATION_ENABLED=false"
  };
}

module.exports = {
  ALLOWED_AUTOGENERATION_TEMPLATE_TYPES,
  JOB_NAME,
  SCHEDULE,
  buildLimitSnapshot,
  buildSeoAutogenerationConfig,
  createSupabaseStorage,
  getSeoAutogenerationStatus,
  nextSixHourRun,
  runSeoAutogeneration,
  scoreAutogenerationCandidate,
  targetPathForSlug,
  uniquenessCheck
};
