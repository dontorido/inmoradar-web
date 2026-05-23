const { hasSupabaseConfig, supabaseFetch } = require("../_utils");
const {
  buildEditorialGuideLanding,
  buildEditorialGuideSourceData,
  editorialGuideOpportunities,
  editorialGuideSlugForOpportunity
} = require("./editorialGuides");
const { buildExpensiveListingCityLanding, buildRentCityLanding } = require("../../lib/seo/cityGuideTemplates");
const { buildPriceCitySourceData } = require("./marketSources");
const { buildSeoDailyPolicySnapshot, seoContentTypeForTemplate } = require("./publishingPolicy");
const { buildPriceCityLanding } = require("./priceCity");
const { calculateSeoLandingQuality } = require("./quality");

const LANDING_TEMPLATE_TYPES = ["price_city", "rent_city", "expensive_listing_city"];
const EDITORIAL_TEMPLATE_TYPES = ["editorial_guide"];
const SUPPORTED_TEMPLATE_TYPES = [...LANDING_TEMPLATE_TYPES, ...EDITORIAL_TEMPLATE_TYPES];
const RANDOM_LANDING_TEMPLATE_TYPES = new Set(["random", "mixed", "landing_random", "landings"]);
const RANDOM_ALL_TEMPLATE_TYPES = new Set(["all"]);
const RANDOM_NEWS_TEMPLATE_TYPES = new Set(["news", "guides", "editorial"]);

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

const CITY_OPPORTUNITY_POOL = [
  ["Madrid", "Madrid", "Comunidad de Madrid", 100],
  ["Barcelona", "Barcelona", "Cataluña", 95],
  ["Valencia", "Valencia", "Comunidad Valenciana", 90],
  ["Sevilla", "Sevilla", "Andalucía", 88],
  ["Zaragoza", "Zaragoza", "Aragón", 86],
  ["Málaga", "Málaga", "Andalucía", 84],
  ["Bilbao", "Bizkaia", "País Vasco", 82],
  ["Logroño", "La Rioja", "La Rioja", 80],
  ["Santander", "Cantabria", "Cantabria", 78],
  ["Granada", "Granada", "Andalucía", 76],
  ["Alicante", "Alicante", "Comunidad Valenciana", 74],
  ["A Coruña", "A Coruña", "Galicia", 72],
  ["Valladolid", "Valladolid", "Castilla y León", 70],
  ["Salamanca", "Salamanca", "Castilla y León", 68],
  ["Las Palmas de Gran Canaria", "Las Palmas", "Canarias", 66]
];

const TEMPLATE_CONFIG = {
  price_city: {
    intent: "informational",
    priorityOffset: 0,
    keyword: (city) => `precio metro cuadrado ${city}`
  },
  rent_city: {
    intent: "informational",
    priorityOffset: -3,
    keyword: (city) => `precio alquiler metro cuadrado ${city}`
  },
  expensive_listing_city: {
    intent: "commercial_investigation",
    priorityOffset: -6,
    keyword: (city) => `saber si un piso está caro en ${city}`
  }
};

function opportunityForTemplate([city, province, autonomousCommunity, priority], templateType) {
  const config = TEMPLATE_CONFIG[templateType];
  return {
    keyword: config.keyword(city),
    city,
    province,
    autonomous_community: autonomousCommunity,
    intent: config.intent,
    template_type: templateType,
    search_priority: priority + config.priorityOffset,
    status: "pending"
  };
}

const CONTROLLED_SEO_OPPORTUNITIES = [
  ...CITY_OPPORTUNITY_POOL.flatMap((city) =>
    LANDING_TEMPLATE_TYPES.map((templateType) => opportunityForTemplate(city, templateType))
  ),
  ...editorialGuideOpportunities()
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
  if (opportunity.template_type === "editorial_guide") {
    return `${opportunity.template_type}|${String(opportunity.keyword || "").toLowerCase()}`;
  }
  return `${opportunity.template_type}|${String(opportunity.city || "").toLowerCase()}`;
}

function templateTypesForRequest(templateType) {
  const normalized = String(templateType || "").toLowerCase();
  if (RANDOM_LANDING_TEMPLATE_TYPES.has(normalized)) return LANDING_TEMPLATE_TYPES;
  if (RANDOM_NEWS_TEMPLATE_TYPES.has(normalized)) return EDITORIAL_TEMPLATE_TYPES;
  if (RANDOM_ALL_TEMPLATE_TYPES.has(normalized)) return SUPPORTED_TEMPLATE_TYPES;
  if (!SUPPORTED_TEMPLATE_TYPES.includes(templateType)) {
    throw new Error(`Unsupported template_type: ${templateType}`);
  }
  return [templateType];
}

function opportunitySlug(opportunity) {
  if (opportunity.template_type === "editorial_guide") return editorialGuideSlugForOpportunity(opportunity);
  const citySlug = String(opportunity.city || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "-");
  if (opportunity.template_type === "rent_city") return `precio-alquiler/${citySlug}`;
  if (opportunity.template_type === "expensive_listing_city") return `saber-si-piso-esta-caro/${citySlug}`;
  return `precio-metro-cuadrado/${citySlug}`;
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function poolForTemplateTypes(templateTypes) {
  const allowed = new Set(templateTypes);
  return CONTROLLED_SEO_OPPORTUNITIES.filter((opportunity) => allowed.has(opportunity.template_type));
}

async function fetchPendingOpportunities({ limit, templateType }) {
  const templateTypes = templateTypesForRequest(templateType);
  const isRandom = templateTypes.length > 1;

  if (!hasSupabaseConfig()) {
    if (!isRandom && templateTypes[0] === "price_city") {
      return DEFAULT_SEED_OPPORTUNITIES.slice(0, limit);
    }
    const pool = poolForTemplateTypes(templateTypes);
    return (isRandom ? shuffle(pool) : pool).slice(0, limit);
  }

  const params = new URLSearchParams({
    select: "*",
    status: "eq.pending",
    order: "search_priority.desc",
    limit: String(isRandom ? Math.max(50, limit * 5) : limit)
  });
  params.set("template_type", templateTypes.length === 1 ? `eq.${templateTypes[0]}` : `in.(${templateTypes.join(",")})`);
  let rows = await supabaseFetch(`seo_landing_opportunities?${params.toString()}`);
  if (Array.isArray(rows) && rows.length === 0) {
    await seedMissingOpportunityBacklog(templateTypes);
    rows = await supabaseFetch(`seo_landing_opportunities?${params.toString()}`);
  }
  if (!Array.isArray(rows)) return [];
  const ordered = isRandom ? shuffle(rows) : rows;
  return ordered.slice(0, limit);
}

async function seedMissingOpportunityBacklog(templateTypes) {
  if (!hasSupabaseConfig()) return;
  const pool = poolForTemplateTypes(templateTypes);
  if (!pool.length) return;

  const opportunityParams = new URLSearchParams({
    select: "keyword,city,template_type",
    template_type: templateTypes.length === 1 ? `eq.${templateTypes[0]}` : `in.(${templateTypes.join(",")})`,
    limit: "1000"
  });
  const landingParams = new URLSearchParams({
    select: "slug",
    template_type: templateTypes.length === 1 ? `eq.${templateTypes[0]}` : `in.(${templateTypes.join(",")})`,
    limit: "1000"
  });
  const [existingOpportunities, existingLandings] = await Promise.all([
    supabaseFetch(`seo_landing_opportunities?${opportunityParams.toString()}`),
    supabaseFetch(`seo_landings?${landingParams.toString()}`)
  ]);
  const existingOpportunityKeys = new Set((Array.isArray(existingOpportunities) ? existingOpportunities : []).map(opportunityKey));
  const existingLandingSlugs = new Set((Array.isArray(existingLandings) ? existingLandings : []).map((landing) => landing.slug));
  const seedRows = pool.filter(
    (opportunity) => !existingOpportunityKeys.has(opportunityKey(opportunity)) && !existingLandingSlugs.has(opportunitySlug(opportunity))
  );
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

  const templateTypes = templateTypesForRequest(templateType);
  const params = new URLSearchParams({
    select: "id,opportunity_id,slug,title,city,province,autonomous_community,template_type,status,quality_score,updated_at",
    status: "in.(draft,needs_review,ready_to_publish,noindex)",
    order: "updated_at.asc",
    limit: String(limit)
  });
  params.set("template_type", templateTypes.length === 1 ? `eq.${templateTypes[0]}` : `in.(${templateTypes.join(",")})`);
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
  const start = new Date(new Date(now).getTime() - 48 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    select: "id,template_type,status,published_at,updated_at,last_generated_at",
    status: "eq.published",
    published_at: `gte.${start.toISOString()}`,
    limit: "5000"
  });
  const rows = await supabaseFetch(`seo_landings?${params.toString()}`);
  const snapshot = buildSeoDailyPolicySnapshot(Array.isArray(rows) ? rows : [], { now });
  return snapshot.published_total_today;
}

function canPublishNow({ mode, autoPublish, quality, publishedToday, publishedThisRun, dailyPublishLimit, maxPublishesPerRun }) {
  if (mode !== "publish" || !autoPublish) return false;
  if (quality.score < 85) return false;
  if (publishedThisRun >= maxPublishesPerRun) return false;
  if (dailyPublishLimit !== null && publishedToday >= dailyPublishLimit) return false;
  return true;
}

function sourceSummary(record) {
  return {
    operation: record.operation,
    source: record.source,
    source_url: record.source_url,
    period_label: record.period_label,
    period_date: record.period_date,
    geo_level: record.geo_level,
    price_eur_m2: record.price_eur_m2
  };
}

function templateSourceData(sourceData, templateType) {
  const selectedRecords =
    templateType === "rent_city" ? [sourceData.rent].filter(Boolean) : [sourceData.sale, sourceData.rent].filter(Boolean);
  const hasProvincialOnly =
    selectedRecords.length > 0 && selectedRecords.every((record) => ["province", "autonomous_community", "country"].includes(record.geo_level));

  return {
    ...sourceData,
    hasRealData: selectedRecords.length > 0,
    hasProvincialOnly,
    records: selectedRecords,
    sources: selectedRecords.map(sourceSummary)
  };
}

function buildLandingForOpportunity(opportunity, sourceData) {
  if (opportunity.template_type === "price_city") return buildPriceCityLanding(opportunity, sourceData);
  if (opportunity.template_type === "rent_city") return buildRentCityLanding(opportunity, sourceData);
  if (opportunity.template_type === "expensive_listing_city") return buildExpensiveListingCityLanding(opportunity, sourceData);
  if (opportunity.template_type === "editorial_guide") return buildEditorialGuideLanding(opportunity, sourceData);
  throw new Error(`Unsupported template_type: ${opportunity.template_type}`);
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
  const dryRun = mode === "dry_run";
  if (!dryRun) {
    await updateOpportunity(opportunity, { status: "generating" });
  }

  const sourceData =
    opportunity.template_type === "editorial_guide"
      ? buildEditorialGuideSourceData(opportunity, now)
      : templateSourceData(await buildPriceCitySourceData(opportunity), opportunity.template_type);
  const landing = buildLandingForOpportunity(opportunity, sourceData);
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
  if (Number.isFinite(Number(options.publishedToday))) {
    publishedToday = Number(options.publishedToday);
  }
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
    content_type: templateTypesForRequest(templateType).every((type) => seoContentTypeForTemplate(type) === "news") ? "news" : "landing",
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
