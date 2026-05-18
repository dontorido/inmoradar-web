const { hasSupabaseConfig, supabaseFetch } = require("../_utils");
const { buildPriceCitySourceData } = require("./marketSources");
const { buildPriceCityLanding } = require("./priceCity");
const { calculateSeoLandingQuality } = require("./quality");

const DEFAULT_SEED_OPPORTUNITIES = [
  {
    keyword: "precio metro cuadrado Madrid",
    city: "Madrid",
    province: "Madrid",
    autonomous_community: "Comunidad de Madrid",
    intent: "informational",
    template_type: "price_city",
    search_priority: 100,
    status: "pending"
  },
  {
    keyword: "precio metro cuadrado Barcelona",
    city: "Barcelona",
    province: "Barcelona",
    autonomous_community: "Cataluña",
    intent: "informational",
    template_type: "price_city",
    search_priority: 95,
    status: "pending"
  },
  {
    keyword: "precio metro cuadrado Valencia",
    city: "Valencia",
    province: "Valencia",
    autonomous_community: "Comunidad Valenciana",
    intent: "informational",
    template_type: "price_city",
    search_priority: 90,
    status: "pending"
  },
  {
    keyword: "precio metro cuadrado Logroño",
    city: "Logroño",
    province: "La Rioja",
    autonomous_community: "La Rioja",
    intent: "informational",
    template_type: "price_city",
    search_priority: 85,
    status: "pending"
  },
  {
    keyword: "precio metro cuadrado Málaga",
    city: "Málaga",
    province: "Málaga",
    autonomous_community: "Andalucía",
    intent: "informational",
    template_type: "price_city",
    search_priority: 80,
    status: "pending"
  }
];

function clampLimit(limit) {
  const parsed = Number.parseInt(String(limit || 5), 10);
  if (!Number.isFinite(parsed)) return 5;
  return Math.max(1, Math.min(10, parsed));
}

function clampCandidateLimit(limit) {
  const parsed = Number.parseInt(String(limit || 10), 10);
  if (!Number.isFinite(parsed)) return 10;
  return Math.max(1, Math.min(25, parsed));
}

function landingStatus(score, shouldPublish) {
  if (shouldPublish) return "published";
  if (score >= 75) return "ready_to_publish";
  if (score >= 60) return "needs_review";
  return "draft";
}

function opportunityKey(opportunity) {
  return `${opportunity.template_type}|${String(opportunity.city || "").toLowerCase()}`;
}

async function fetchPendingOpportunities({ limit, templateType }) {
  if (!hasSupabaseConfig()) {
    return DEFAULT_SEED_OPPORTUNITIES.filter((opportunity) => opportunity.template_type === templateType).slice(0, limit);
  }

  const params = new URLSearchParams({
    select: "*",
    status: "eq.pending",
    template_type: `eq.${templateType}`,
    order: "search_priority.desc",
    limit: String(limit)
  });
  let rows = await supabaseFetch(`seo_landing_opportunities?${params.toString()}`);
  if (Array.isArray(rows) && rows.length === 0) {
    await seedDefaultOpportunitiesIfEmpty(templateType);
    rows = await supabaseFetch(`seo_landing_opportunities?${params.toString()}`);
  }
  return Array.isArray(rows) ? rows : [];
}

async function seedDefaultOpportunitiesIfEmpty(templateType) {
  if (!hasSupabaseConfig()) return;

  const existingParams = new URLSearchParams({
    select: "id",
    template_type: `eq.${templateType}`,
    limit: "1"
  });
  const existing = await supabaseFetch(`seo_landing_opportunities?${existingParams.toString()}`);
  if (Array.isArray(existing) && existing.length > 0) return;

  const seedRows = DEFAULT_SEED_OPPORTUNITIES.filter((opportunity) => opportunity.template_type === templateType);
  if (!seedRows.length) return;

  await supabaseFetch("seo_landing_opportunities?on_conflict=keyword,city,template_type", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(seedRows)
  });
}

function landingToOpportunity(landing) {
  return {
    id: landing.opportunity_id || null,
    keyword: landing.title || `precio metro cuadrado ${landing.city}`,
    city: landing.city,
    province: landing.province,
    autonomous_community: landing.autonomous_community,
    intent: "informational",
    template_type: landing.template_type,
    search_priority: Number(landing.quality_score) || 0,
    status: landing.status,
    existing_landing_id: landing.id,
    existing_landing_slug: landing.slug,
    existing_landing_status: landing.status,
    existing_landing_quality_score: Number(landing.quality_score) || 0
  };
}

async function fetchDraftLandingOpportunities({ limit, templateType }) {
  if (!hasSupabaseConfig()) return [];

  const params = new URLSearchParams({
    select: "id,opportunity_id,slug,title,city,province,autonomous_community,template_type,status,quality_score,updated_at",
    template_type: `eq.${templateType}`,
    status: "in.(draft,needs_review,ready_to_publish,noindex)",
    order: "updated_at.asc",
    limit: String(limit)
  });
  const rows = await supabaseFetch(`seo_landings?${params.toString()}`);
  return Array.isArray(rows) ? rows.map(landingToOpportunity) : [];
}

async function fetchGenerationCandidates({ limit, templateType, includeExistingDrafts }) {
  if (!includeExistingDrafts) {
    return fetchPendingOpportunities({ limit, templateType });
  }

  const candidates = [];
  const seen = new Set();
  const add = (opportunity) => {
    const key = opportunityKey(opportunity);
    if (!seen.has(key)) {
      seen.add(key);
      candidates.push(opportunity);
    }
  };

  const [drafts, pending] = await Promise.all([
    fetchDraftLandingOpportunities({ limit, templateType }),
    fetchPendingOpportunities({ limit, templateType })
  ]);

  drafts.forEach(add);
  pending.forEach(add);
  return candidates.slice(0, limit);
}

async function updateOpportunity(opportunity, patch) {
  if (!hasSupabaseConfig() || !opportunity.id) return null;
  const params = new URLSearchParams({ id: `eq.${opportunity.id}` });
  return supabaseFetch(`seo_landing_opportunities?${params.toString()}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(patch)
  });
}

async function upsertLanding(landing) {
  const result = await supabaseFetch("seo_landings?on_conflict=slug", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify([landing])
  });
  return Array.isArray(result) ? result[0] : result;
}

async function countPublishedToday(now) {
  if (!hasSupabaseConfig()) return 0;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const params = new URLSearchParams({
    select: "id",
    status: "eq.published",
    published_at: `gte.${start.toISOString()}`
  });
  const rows = await supabaseFetch(`seo_landings?${params.toString()}`);
  return Array.isArray(rows) ? rows.length : 0;
}

function canPublishNow({ mode, autoPublish, quality, publishedToday, publishedThisRun, dailyPublishLimit, maxPublishesPerRun }) {
  if (mode !== "publish" || !autoPublish) return false;
  if (quality.score < 85) return false;
  if (publishedThisRun >= maxPublishesPerRun) return false;
  if (dailyPublishLimit !== null && publishedToday >= dailyPublishLimit) return false;
  return true;
}

function buildLandingRecord({ opportunity, landing, sourceData, quality, status, indexStatus, now, publishedAt }) {
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
    index_status: indexStatus,
    status,
    quality_score: quality.score,
    word_count: quality.word_count,
    source_data_json: {
      generated_by: "inmoradar_seo_mvp",
      template_type: landing.template_type,
      sources: sourceData.sources,
      quality,
      faq: landing.faq,
      lookup_error: sourceData.lookup_error || null
    },
    published_at: publishedAt,
    last_generated_at: now
  };
}

function resultSummary(record, sourceData, quality, saved) {
  return {
    slug: record.slug,
    title: record.title,
    city: record.city,
    template_type: record.template_type,
    quality_score: quality.score,
    status: record.status,
    index_status: record.index_status,
    word_count: record.word_count,
    data_available: sourceData.hasRealData,
    sources: sourceData.sources,
    penalties: quality.penalties,
    saved: Boolean(saved)
  };
}

async function generateOne({ opportunity, mode, autoPublish, publishedToday, publishedThisRun, dailyPublishLimit, maxPublishesPerRun, now }) {
  if (opportunity.template_type !== "price_city") {
    throw new Error(`Unsupported template_type: ${opportunity.template_type}`);
  }

  const dryRun = mode === "dry_run";
  if (!dryRun) {
    await updateOpportunity(opportunity, { status: "generating" });
  }

  const sourceData = await buildPriceCitySourceData(opportunity);
  const landing = buildPriceCityLanding(opportunity, sourceData);
  const quality = calculateSeoLandingQuality(landing, { ...sourceData, faq: landing.faq });
  const canAutoPublish = canPublishNow({
    mode,
    autoPublish,
    quality,
    publishedToday,
    publishedThisRun,
    dailyPublishLimit,
    maxPublishesPerRun
  });
  const status = landingStatus(quality.score, canAutoPublish);
  const indexStatus = status === "published" && quality.score >= 75 ? "index" : "noindex";
  const publishedAt = canAutoPublish ? now : null;
  const record = buildLandingRecord({
    opportunity,
    landing,
    sourceData,
    quality,
    status,
    indexStatus,
    now,
    publishedAt
  });

  let saved = null;
  if (!dryRun) {
    saved = await upsertLanding(record);
    await updateOpportunity(opportunity, {
      data_available: sourceData.hasRealData,
      quality_score: quality.score,
      status
    });
  }

  return {
    record,
    sourceData,
    quality,
    saved,
    didPublish: canAutoPublish
  };
}

async function runSeoLandingGeneration(options = {}) {
  const mode = options.mode || "dry_run";
  if (!["dry_run", "generate", "publish"].includes(mode)) {
    throw new Error("mode must be dry_run, generate or publish");
  }
  if (mode !== "dry_run" && !hasSupabaseConfig()) {
    throw new Error("Supabase is required for generate/publish mode");
  }

  const limit = clampLimit(options.limit);
  const candidateLimit = clampCandidateLimit(options.candidateLimit || limit);
  const templateType = options.template_type || options.templateType || "price_city";
  const autoPublish = options.autoPublish === true;
  const includeExistingDrafts = options.includeExistingDrafts === true;
  const publishFirstEligible = options.publishFirstEligible === true;
  const maxPublishesPerRun = Math.max(1, Math.min(5, Number.parseInt(String(options.maxPublishesPerRun || 1), 10) || 1));
  const dailyPublishLimit = options.dailyPublishLimit === null ? null : Math.max(1, Number.parseInt(String(options.dailyPublishLimit || 1), 10) || 1);
  const now = options.now || new Date().toISOString();
  const opportunities =
    options.opportunities ||
    (await fetchGenerationCandidates({
      limit: publishFirstEligible ? candidateLimit : limit,
      templateType,
      includeExistingDrafts
    }));
  let publishedToday = await countPublishedToday(now);
  let publishedThisRun = 0;
  const results = [];

  for (const opportunity of opportunities.slice(0, publishFirstEligible ? candidateLimit : limit)) {
    const generated = await generateOne({
      opportunity,
      mode,
      autoPublish,
      publishedToday,
      publishedThisRun,
      dailyPublishLimit,
      maxPublishesPerRun,
      now
    });
    if (generated.didPublish) {
      publishedToday += 1;
      publishedThisRun += 1;
    }
    results.push(resultSummary(generated.record, generated.sourceData, generated.quality, generated.saved));
    if (publishFirstEligible && generated.didPublish) break;
  }

  return {
    ok: true,
    mode,
    dry_run: mode === "dry_run",
    template_type: templateType,
    limit,
    candidate_limit: publishFirstEligible ? candidateLimit : limit,
    autoPublish,
    includeExistingDrafts,
    dailyPublishLimit,
    maxPublishesPerRun,
    generated_count: results.length,
    published_count: publishedThisRun,
    results
  };
}

module.exports = {
  DEFAULT_SEED_OPPORTUNITIES,
  runSeoLandingGeneration
};
