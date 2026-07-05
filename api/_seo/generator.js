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
const { evaluateLandingIndexability } = require("./indexability");
const { calculateSeoLandingQuality } = require("./quality");
const { canonicalForSlug, escapeHtml } = require("./text");

const LANDING_TEMPLATE_TYPES = ["price_city", "rent_city", "expensive_listing_city"];
const EDITORIAL_TEMPLATE_TYPES = ["editorial_guide"];
const SUPPORTED_TEMPLATE_TYPES = [...LANDING_TEMPLATE_TYPES, ...EDITORIAL_TEMPLATE_TYPES];
const RANDOM_LANDING_TEMPLATE_TYPES = new Set(["random", "mixed", "landing_random", "landings"]);
const RANDOM_ALL_TEMPLATE_TYPES = new Set(["all"]);
const RANDOM_NEWS_TEMPLATE_TYPES = new Set(["news", "guides", "editorial"]);
const SEO_OPPORTUNITY_SEED_CONFIRMATION = "SEED_SEO_OPPORTUNITIES";
const SEO_DRAFT_FROM_OPPORTUNITY_CONFIRMATION = "GENERATE_DRAFT_FROM_OPPORTUNITY";
const SEO_OPPORTUNITY_SEED_MAX_LIMIT = 50;
const SEO_OPPORTUNITY_SEED_DEFAULT_LIMIT = 10;
const SEO_OPPORTUNITY_SEED_SOURCES = new Set(["market_price_sources"]);
const SEED_REQUIRED_QUALITY_NOTES_BY_TEMPLATE = {
  price_city: ["has_sale_data"],
  rent_city: ["has_rent_data"],
  expensive_listing_city: ["has_sale_data"]
};

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

function countBy(rows = [], field) {
  return rows.reduce((counts, row) => {
    const key = String(row?.[field] || "unknown").toLowerCase();
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function candidateTemplateTypeForContentType(selectedContentType) {
  if (selectedContentType === "news") return "editorial_guide";
  if (selectedContentType === "landing") return "landing_random";
  return null;
}

function publicOpportunityDiagnostic(opportunity = {}) {
  return {
    slug: opportunitySlug(opportunity),
    template_type: opportunity.template_type || null,
    keyword: opportunity.keyword || null,
    city: opportunity.city || null
  };
}

function uniqueList(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function normalizedOpportunityCity(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function candidateTemplateTypesForPreview({ contentType = "landing", template = "all" } = {}) {
  const normalizedContentType = String(contentType || "landing").toLowerCase();
  const normalizedTemplate = String(template || "all").toLowerCase();
  const baseTypes =
    normalizedContentType === "news"
      ? EDITORIAL_TEMPLATE_TYPES
      : normalizedContentType === "all"
        ? SUPPORTED_TEMPLATE_TYPES
        : LANDING_TEMPLATE_TYPES;

  if (["all", "random", "mixed"].includes(normalizedTemplate)) return baseTypes;
  const requested = templateTypesForRequest(normalizedTemplate);
  return requested.filter((templateType) => baseTypes.includes(templateType));
}

function previewCandidateFromOpportunity(opportunity, source, qualityNotes = []) {
  return {
    content_type: seoContentTypeForTemplate(opportunity.template_type),
    template: opportunity.template_type,
    city: opportunity.city || null,
    province: opportunity.province || null,
    autonomous_community: opportunity.autonomous_community || null,
    keyword: opportunity.keyword || null,
    slug: opportunitySlug(opportunity),
    intent: opportunity.intent || "informational",
    search_priority: Number(opportunity.search_priority || 0),
    source,
    quality_notes: uniqueList(qualityNotes)
  };
}

function previewCandidateKey(candidate = {}) {
  if (candidate.template === "editorial_guide") {
    return `${candidate.template}|${String(candidate.keyword || "").toLowerCase()}`;
  }
  return `${candidate.template}|${normalizedOpportunityCity(candidate.city || candidate.keyword)}`;
}

function mergePreviewCandidates(candidates = []) {
  const byKey = new Map();
  for (const candidate of candidates) {
    const key = previewCandidateKey(candidate);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        ...candidate,
        _sources: uniqueList([candidate.source]),
        quality_notes: uniqueList(candidate.quality_notes)
      });
      continue;
    }
    existing._sources = uniqueList([...(existing._sources || []), candidate.source]);
    existing.source = existing._sources.join("+");
    existing.quality_notes = uniqueList([...(existing.quality_notes || []), ...(candidate.quality_notes || [])]);
  }
  return [...byKey.values()].map(({ _sources, ...candidate }) => candidate);
}

function marketRowsToPreviewOpportunities(rows = [], templateTypes = LANDING_TEMPLATE_TYPES) {
  const byCity = new Map();
  for (const row of rows) {
    const city = String(row.municipality || row.city || row.zone_name || "").trim();
    if (!city) continue;
    const key = normalizedOpportunityCity(city);
    if (!key) continue;
    const entry = byCity.get(key) || {
      city,
      province: row.province || "",
      autonomous_community: row.autonomous_community || "",
      operations: new Set(),
      sources: new Set()
    };
    if (row.operation) entry.operations.add(String(row.operation).toLowerCase());
    if (row.source) entry.sources.add(String(row.source));
    if (!entry.province && row.province) entry.province = row.province;
    if (!entry.autonomous_community && row.autonomous_community) entry.autonomous_community = row.autonomous_community;
    byCity.set(key, entry);
  }

  const opportunities = [];
  for (const entry of byCity.values()) {
    const hasSaleData = entry.operations.has("sale");
    const hasRentData = entry.operations.has("rent");
    for (const templateType of templateTypes) {
      if (templateType === "editorial_guide") continue;
      if (templateType === "price_city" && !hasSaleData) continue;
      if (templateType === "rent_city" && !hasRentData) continue;
      if (templateType === "expensive_listing_city" && !hasSaleData) continue;
      const config = TEMPLATE_CONFIG[templateType];
      opportunities.push({
        keyword: config.keyword(entry.city),
        city: entry.city,
        province: entry.province,
        autonomous_community: entry.autonomous_community,
        intent: config.intent,
        template_type: templateType,
        search_priority: 70,
        status: "pending",
        _quality_notes: [
          hasSaleData ? "has_sale_data" : null,
          hasRentData ? "has_rent_data" : null,
          entry.sources.size ? `sources:${[...entry.sources].sort().join(",")}` : null
        ].filter(Boolean)
      });
    }
  }
  return opportunities;
}

function applyOpportunityCollisions(candidate, existingOpportunityKeys, existingLandingSlugs) {
  const opportunity = {
    template_type: candidate.template,
    city: candidate.city,
    keyword: candidate.keyword
  };
  const alreadyExists = existingOpportunityKeys.has(opportunityKey(opportunity));
  const slugExists = existingLandingSlugs.has(candidate.slug);
  const reasons = [
    alreadyExists ? "existing_opportunity" : null,
    slugExists ? "slug_already_used" : null
  ].filter(Boolean);
  return {
    ...candidate,
    collision: reasons.length > 0,
    collision_reason: reasons.length ? reasons.join("+") : null,
    already_exists: alreadyExists,
    is_seedable: reasons.length === 0
  };
}

function previewSummary(candidates = [], templateTypes = []) {
  const byTemplate = Object.fromEntries(
    templateTypes.map((templateType) => [
      templateType,
      {
        total: candidates.filter((candidate) => candidate.template === templateType).length,
        seedable: candidates.filter((candidate) => candidate.template === templateType && candidate.is_seedable).length
      }
    ])
  );
  return {
    total_candidates: candidates.length,
    seedable_count: candidates.filter((candidate) => candidate.is_seedable).length,
    existing_opportunities_count: candidates.filter((candidate) => candidate.already_exists).length,
    used_slugs_count: candidates.filter((candidate) => String(candidate.collision_reason || "").includes("slug_already_used")).length,
    exhausted_templates: Object.entries(byTemplate)
      .filter(([, counts]) => counts.total > 0 && counts.seedable === 0)
      .map(([templateType]) => templateType),
    uncovered_cities: uniqueList(candidates.filter((candidate) => candidate.is_seedable && candidate.city).map((candidate) => candidate.city)).slice(0, 25),
    by_template: byTemplate
  };
}

async function getSeoOpportunitiesPreview(options = {}) {
  const contentType = String(options.contentType || options.content_type || "landing").toLowerCase();
  const template = String(options.template || options.template_type || "all").toLowerCase();
  const maxLimit = Math.max(1, Number.parseInt(String(options.maxLimit || options.max_limit || 200), 10) || 200);
  const limit = Math.max(1, Math.min(maxLimit, Number.parseInt(String(options.limit || 50), 10) || 50));
  let templateTypes = [];
  const warnings = [];

  try {
    templateTypes = candidateTemplateTypesForPreview({ contentType, template });
  } catch (error) {
    warnings.push("unsupported_template_filter");
    templateTypes = [];
  }

  const fetchRows = options.fetchRows || (hasSupabaseConfig() ? (path) => supabaseFetch(path, { timeoutMs: 8000 }) : null);
  if (!templateTypes.length) {
    return {
      ok: true,
      read_only: true,
      writes_enabled: false,
      content_type: contentType,
      template,
      template_types: [],
      summary: previewSummary([], []),
      candidates: [],
      warnings: [...warnings, "no_supported_templates_for_preview"]
    };
  }

  if (!fetchRows) {
    const candidates = poolForTemplateTypes(templateTypes)
      .map((opportunity) => previewCandidateFromOpportunity(opportunity, "controlled_seed_pool", ["existing_state_unavailable"]))
      .map((candidate) => ({
        ...candidate,
        collision: true,
        collision_reason: "existing_state_unavailable",
        already_exists: false,
        is_seedable: false
      }));
    return {
      ok: true,
      read_only: true,
      writes_enabled: false,
      content_type: contentType,
      template,
      template_types: templateTypes,
      summary: previewSummary(candidates, templateTypes),
      candidates: candidates.slice(0, limit),
      warnings: ["supabase_not_configured_preview_uses_static_catalog_only"]
    };
  }

  const templateFilter = templateTypes.length === 1 ? `eq.${templateTypes[0]}` : `in.(${templateTypes.join(",")})`;
  const landingParams = new URLSearchParams({
    select: "slug,status,template_type,city,title",
    limit: "5000"
  });
  const opportunityParams = new URLSearchParams({
    select: "keyword,city,template_type,status,intent,search_priority",
    template_type: templateFilter,
    limit: "5000"
  });
  const marketParams = new URLSearchParams({
    select: "municipality,province,autonomous_community,operation,source,period_date,price_eur_m2,confidence_score",
    municipality: "not.is.null",
    price_eur_m2: "not.is.null",
    limit: "5000"
  });

  let landingRows = [];
  let opportunityRows = [];
  let marketRows = [];
  let existingStateAvailable = true;
  try {
    const [landings, opportunities] = await Promise.all([
      fetchRows(`seo_landings?${landingParams.toString()}`),
      fetchRows(`seo_landing_opportunities?${opportunityParams.toString()}`)
    ]);
    landingRows = Array.isArray(landings) ? landings : [];
    opportunityRows = Array.isArray(opportunities) ? opportunities : [];
  } catch (error) {
    existingStateAvailable = false;
    warnings.push("existing_state_unavailable");
  }

  try {
    const rows = await fetchRows(`market_price_sources?${marketParams.toString()}`);
    marketRows = Array.isArray(rows) ? rows : [];
    if (!marketRows.length) warnings.push("market_price_sources_empty");
  } catch (error) {
    warnings.push("market_price_sources_unavailable");
  }

  const controlledCandidates = poolForTemplateTypes(templateTypes).map((opportunity) =>
    previewCandidateFromOpportunity(opportunity, "controlled_seed_pool", ["controlled_seed_pool"])
  );
  const marketCandidates = marketRowsToPreviewOpportunities(marketRows, templateTypes).map((opportunity) =>
    previewCandidateFromOpportunity(opportunity, "market_price_sources", opportunity._quality_notes || ["market_price_sources"])
  );
  const existingOpportunityKeys = new Set(opportunityRows.map(opportunityKey));
  const existingLandingSlugs = new Set(landingRows.map((landing) => landing.slug).filter(Boolean));
  const candidates = mergePreviewCandidates([...controlledCandidates, ...marketCandidates])
    .map((candidate) => existingStateAvailable
      ? applyOpportunityCollisions(candidate, existingOpportunityKeys, existingLandingSlugs)
      : {
          ...candidate,
          collision: true,
          collision_reason: "existing_state_unavailable",
          already_exists: false,
          is_seedable: false
        })
    .sort((left, right) => {
      if (left.is_seedable !== right.is_seedable) return left.is_seedable ? -1 : 1;
      return String(left.template).localeCompare(String(right.template)) || String(left.city || "").localeCompare(String(right.city || ""));
    });

  return {
    ok: true,
    read_only: true,
    writes_enabled: false,
    content_type: contentType,
    template,
    template_types: templateTypes,
    summary: previewSummary(candidates, templateTypes),
    candidates: candidates.slice(0, limit),
    warnings
  };
}

function clampSeedOpportunityLimit(limit) {
  const parsed = Number.parseInt(String(limit || SEO_OPPORTUNITY_SEED_DEFAULT_LIMIT), 10);
  if (!Number.isFinite(parsed)) return SEO_OPPORTUNITY_SEED_DEFAULT_LIMIT;
  return Math.max(1, Math.min(SEO_OPPORTUNITY_SEED_MAX_LIMIT, parsed));
}

function normalizeSeedList(value = []) {
  const raw = Array.isArray(value) ? value : String(value || "").split(",");
  return uniqueList(raw.map((item) => String(item || "").trim()));
}

function defaultSeedQualityNotes(template) {
  return SEED_REQUIRED_QUALITY_NOTES_BY_TEMPLATE[template] || [];
}

function normalizeSeedRequest(input = {}) {
  const confirm = String(input.confirm || "").trim();
  const dryRun = input.dry_run === false || input.dryRun === false ? false : true;
  const contentType = String(input.content_type || input.contentType || "landing").toLowerCase();
  const template = String(input.template || input.template_type || input.templateType || "").toLowerCase();
  const source = String(input.source || "market_price_sources").toLowerCase();
  const rawMinQualityNotes = input.min_quality_notes ?? input.minQualityNotes;
  return {
    confirm,
    dry_run: dryRun,
    content_type: contentType,
    template,
    source,
    limit: clampSeedOpportunityLimit(input.limit),
    cities: normalizeSeedList(input.cities),
    min_quality_notes:
      rawMinQualityNotes === undefined ? defaultSeedQualityNotes(template) : normalizeSeedList(rawMinQualityNotes)
  };
}

function emptySeedDiagnostics(extra = {}) {
  return {
    seedable_count: 0,
    seed_preview_candidates_count: 0,
    deduped_candidates_count: 0,
    already_existing_count: 0,
    missing_required_fields_count: 0,
    score_too_low_count: 0,
    unsupported_content_type_count: 0,
    limit_applied: 0,
    empty_reason: null,
    ...extra
  };
}

function seedValidationFailure(error, message, extra = {}) {
  return {
    ok: false,
    status: 400,
    error,
    message,
    dry_run: true,
    read_only: true,
    writes_enabled: false,
    would_insert_count: 0,
    inserted_count: 0,
    skipped_count: 0,
    error_count: 0,
    inserted: [],
    skipped: [],
    errors: [],
    seed_diagnostics: emptySeedDiagnostics({
      empty_reason: error === "seed_confirmation_required" || error === "seed_confirmation_invalid" ? "invalid_confirmation" : error
    }),
    empty_reason: error === "seed_confirmation_required" || error === "seed_confirmation_invalid" ? "invalid_confirmation" : error,
    ...extra
  };
}

function validateSeedRequest(request) {
  if (!request.confirm) {
    return seedValidationFailure(
      "seed_confirmation_required",
      `Confirma la accion con el texto exacto "${SEO_OPPORTUNITY_SEED_CONFIRMATION}".`
    );
  }
  if (request.confirm !== SEO_OPPORTUNITY_SEED_CONFIRMATION) {
    return seedValidationFailure(
      "seed_confirmation_invalid",
      `Confirmacion incorrecta o incompleta. Escribe exactamente "${SEO_OPPORTUNITY_SEED_CONFIRMATION}".`
    );
  }
  if (request.content_type !== "landing") {
    return seedValidationFailure("unsupported_content_type", "El seed controlado solo acepta content_type=landing.");
  }
  if (!LANDING_TEMPLATE_TYPES.includes(request.template)) {
    return seedValidationFailure("unsupported_template", "Elige una template landing concreta permitida.", {
      allowed_templates: LANDING_TEMPLATE_TYPES
    });
  }
  if (!SEO_OPPORTUNITY_SEED_SOURCES.has(request.source)) {
    return seedValidationFailure("unsupported_source", "La fuente permitida para seed controlado es market_price_sources.", {
      allowed_sources: [...SEO_OPPORTUNITY_SEED_SOURCES]
    });
  }
  return null;
}

function sourceMatches(candidate = {}, source) {
  return String(candidate.source || "")
    .split("+")
    .map((item) => item.trim().toLowerCase())
    .includes(source);
}

function qualityNotesMatch(candidate = {}, requiredNotes = []) {
  if (!requiredNotes.length) return true;
  const notes = new Set((candidate.quality_notes || []).map((note) => String(note || "").toLowerCase()));
  return requiredNotes.every((note) => notes.has(String(note || "").toLowerCase()));
}

function cityMatches(candidate = {}, cities = []) {
  if (!cities.length) return true;
  const allowed = new Set(cities.map(normalizedOpportunityCity));
  return allowed.has(normalizedOpportunityCity(candidate.city));
}

function missingSeedCandidateFields(candidate = {}) {
  return [
    candidate.keyword ? null : "keyword",
    candidate.city ? null : "city",
    candidate.template ? null : "template",
    candidate.slug ? null : "slug"
  ].filter(Boolean);
}

function inferSeedEmptyReason(diagnostics = {}) {
  if (Number(diagnostics.would_insert_count || 0) > 0) return null;
  const previewCount = Number(diagnostics.seed_preview_candidates_count || 0);
  const seedableCount = Number(diagnostics.seedable_count || 0);
  if (!previewCount) return "no_seed_preview_candidates";
  if (Number(diagnostics.unsupported_content_type_count || 0) >= previewCount) return "unsupported_content_type";
  if (Number(diagnostics.missing_required_fields_count || 0) >= previewCount) return "missing_required_fields";
  if (!seedableCount && Number(diagnostics.already_existing_count || 0) > 0) return "all_candidates_already_existing";
  if (!seedableCount && Number(diagnostics.slug_already_used_count || 0) > 0) return "all_candidates_already_existing";
  if (!seedableCount) return "no_seedable_candidates";
  if (!Number(diagnostics.after_source_filter_count || 0) && Number(diagnostics.source_mismatch_count || 0) > 0) {
    return "source_filter_excluded_all";
  }
  if (!Number(diagnostics.after_city_filter_count || 0) && Number(diagnostics.city_filter_mismatch_count || 0) > 0) {
    return "city_filter_excluded_all";
  }
  if (!Number(diagnostics.deduped_candidates_count || 0) && Number(diagnostics.quality_notes_mismatch_count || 0) > 0) {
    return "quality_notes_filter_excluded_all";
  }
  if (Number(diagnostics.revalidated_candidates_count || 0) > 0 && Number(diagnostics.revalidation_collision_count || 0) >= Number(diagnostics.revalidated_candidates_count || 0)) {
    return "revalidation_collisions_excluded_all";
  }
  if (!Number(diagnostics.deduped_candidates_count || 0)) return "filters_excluded_all";
  return "unknown_seed_empty";
}

function buildSeedDiagnostics({ request, preview, previewCandidates, preLimitCandidates, limitedCandidates, revalidated, insertable }) {
  const summary = preview?.summary || {};
  const diagnostics = {
    seedable_count: Number(summary.seedable_count ?? previewCandidates.filter((candidate) => candidate.is_seedable === true).length),
    seed_preview_candidates_count: previewCandidates.length,
    preview_total_candidates_count: Number(summary.total_candidates ?? previewCandidates.length),
    deduped_candidates_count: preLimitCandidates.length,
    limited_candidates_count: limitedCandidates.length,
    revalidated_candidates_count: revalidated.length,
    already_existing_count: previewCandidates.filter((candidate) => candidate.already_exists === true).length,
    slug_already_used_count: previewCandidates.filter((candidate) => String(candidate.collision_reason || "").includes("slug_already_used")).length,
    missing_required_fields_count: 0,
    score_too_low_count: 0,
    unsupported_content_type_count: 0,
    template_mismatch_count: 0,
    source_mismatch_count: 0,
    city_filter_mismatch_count: 0,
    quality_notes_mismatch_count: 0,
    after_source_filter_count: 0,
    after_city_filter_count: 0,
    after_quality_filter_count: preLimitCandidates.length,
    revalidation_collision_count: revalidated.length - insertable.length,
    limit_applied: request.limit,
    limit_truncated_count: Math.max(0, preLimitCandidates.length - limitedCandidates.length),
    would_insert_count: insertable.length,
    source_table: request.source,
    preview_tables: ["seo_landings", "seo_landing_opportunities", "market_price_sources"],
    filters_applied: {
      content_type: request.content_type,
      template: request.template,
      source: request.source,
      limit: request.limit,
      cities: request.cities,
      min_quality_notes: request.min_quality_notes
    },
    empty_reason: null
  };

  const revalidatedAlreadyExisting = revalidated.filter((candidate) => candidate.already_exists === true).length;
  const revalidatedSlugCollisions = revalidated.filter((candidate) => String(candidate.collision_reason || "").includes("slug_already_used")).length;
  diagnostics.already_existing_count = Math.max(diagnostics.already_existing_count, revalidatedAlreadyExisting);
  diagnostics.slug_already_used_count = Math.max(diagnostics.slug_already_used_count, revalidatedSlugCollisions);

  for (const candidate of previewCandidates) {
    if (candidate.content_type !== request.content_type) {
      diagnostics.unsupported_content_type_count += 1;
      continue;
    }
    if (candidate.template !== request.template) {
      diagnostics.template_mismatch_count += 1;
      continue;
    }
    if (missingSeedCandidateFields(candidate).length) {
      diagnostics.missing_required_fields_count += 1;
      continue;
    }
    if (candidate.is_seedable !== true || candidate.collision === true || candidate.already_exists === true) continue;
    if (!sourceMatches(candidate, request.source)) {
      diagnostics.source_mismatch_count += 1;
      continue;
    }
    diagnostics.after_source_filter_count += 1;
    if (!cityMatches(candidate, request.cities)) {
      diagnostics.city_filter_mismatch_count += 1;
      continue;
    }
    diagnostics.after_city_filter_count += 1;
    if (!qualityNotesMatch(candidate, request.min_quality_notes)) {
      diagnostics.quality_notes_mismatch_count += 1;
    }
  }

  diagnostics.empty_reason = inferSeedEmptyReason(diagnostics);
  return diagnostics;
}

function seedCandidatePublic(candidate = {}, extra = {}) {
  return {
    content_type: candidate.content_type || "landing",
    template: candidate.template || null,
    city: candidate.city || null,
    keyword: candidate.keyword || null,
    slug: candidate.slug || null,
    intent: candidate.intent || "informational",
    source: candidate.source || null,
    quality_notes: uniqueList(candidate.quality_notes || []),
    collision: Boolean(candidate.collision),
    collision_reason: candidate.collision_reason || null,
    already_exists: Boolean(candidate.already_exists),
    is_seedable: candidate.is_seedable === true,
    ...extra
  };
}

function opportunityRowFromPreviewCandidate(candidate = {}) {
  return {
    keyword: candidate.keyword,
    city: candidate.city,
    province: candidate.province || "",
    autonomous_community: candidate.autonomous_community || "",
    intent: candidate.intent || "informational",
    template_type: candidate.template,
    search_priority: Number(candidate.search_priority || 70),
    status: "pending"
  };
}

async function revalidateSeedCandidateCollisions(candidates, templateTypes, fetchRows) {
  if (!candidates.length) return [];
  const templateFilter = templateTypes.length === 1 ? `eq.${templateTypes[0]}` : `in.(${templateTypes.join(",")})`;
  const landingParams = new URLSearchParams({
    select: "slug,status,template_type,city,title",
    limit: "5000"
  });
  const opportunityParams = new URLSearchParams({
    select: "keyword,city,template_type,status,intent,search_priority",
    template_type: templateFilter,
    limit: "5000"
  });
  const [landings, opportunities] = await Promise.all([
    fetchRows(`seo_landings?${landingParams.toString()}`),
    fetchRows(`seo_landing_opportunities?${opportunityParams.toString()}`)
  ]);
  const existingOpportunityKeys = new Set((Array.isArray(opportunities) ? opportunities : []).map(opportunityKey));
  const existingLandingSlugs = new Set((Array.isArray(landings) ? landings : []).map((landing) => landing.slug).filter(Boolean));
  return candidates.map((candidate) => applyOpportunityCollisions(candidate, existingOpportunityKeys, existingLandingSlugs));
}

async function seedSeoOpportunitiesFromPreview(input = {}, options = {}) {
  const request = normalizeSeedRequest(input);
  const validationError = validateSeedRequest(request);
  if (validationError) return validationError;

  const fetchRows = options.fetchRows || (hasSupabaseConfig() ? (path) => supabaseFetch(path, { timeoutMs: 8000 }) : null);
  const insertRow = options.insertRow || (hasSupabaseConfig()
    ? (row) => supabaseFetch("seo_landing_opportunities", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify([row]),
        timeoutMs: 8000
      })
    : null);

  if (!fetchRows) {
    return {
      ...seedValidationFailure("supabase_not_configured", "Supabase no esta configurado para leer el preview.", { status: 500 }),
      dry_run: request.dry_run,
      filters: request
    };
  }
  if (!request.dry_run && !insertRow) {
    return {
      ...seedValidationFailure("supabase_not_configured", "Supabase no esta configurado para escribir oportunidades.", { status: 500 }),
      dry_run: false,
      filters: request
    };
  }

  const preview = await getSeoOpportunitiesPreview({
    content_type: request.content_type,
    template: request.template,
    limit: options.previewLimit || 5000,
    maxLimit: options.previewMaxLimit || 5000,
    fetchRows
  });
  const previewCandidates = Array.isArray(preview.candidates) ? preview.candidates : [];
  const preLimitCandidates = previewCandidates.filter(
    (candidate) =>
      candidate.content_type === request.content_type &&
      candidate.template === request.template &&
      candidate.is_seedable === true &&
      candidate.collision === false &&
      candidate.already_exists === false &&
      !missingSeedCandidateFields(candidate).length &&
      sourceMatches(candidate, request.source) &&
      cityMatches(candidate, request.cities) &&
      qualityNotesMatch(candidate, request.min_quality_notes)
  );
  const candidates = preLimitCandidates.slice(0, request.limit);

  const revalidated = await revalidateSeedCandidateCollisions(candidates, [request.template], fetchRows);
  const insertable = [];
  const skipped = [];
  for (const candidate of revalidated) {
    if (candidate.is_seedable === true && candidate.collision === false && candidate.already_exists === false) {
      insertable.push(candidate);
    } else {
      skipped.push(seedCandidatePublic(candidate, {
        reason: candidate.collision_reason || "collision"
      }));
    }
  }
  const seedDiagnostics = buildSeedDiagnostics({
    request,
    preview,
    previewCandidates,
    preLimitCandidates,
    limitedCandidates: candidates,
    revalidated,
    insertable
  });

  const base = {
    ok: true,
    dry_run: request.dry_run,
    read_only: request.dry_run,
    writes_enabled: !request.dry_run,
    filters: {
      content_type: request.content_type,
      template: request.template,
      source: request.source,
      limit: request.limit,
      cities: request.cities,
      min_quality_notes: request.min_quality_notes
    },
    preview_summary: preview.summary || {},
    seed_diagnostics: seedDiagnostics,
    seedable_count: seedDiagnostics.seedable_count,
    seed_preview_candidates_count: seedDiagnostics.seed_preview_candidates_count,
    deduped_candidates_count: seedDiagnostics.deduped_candidates_count,
    already_existing_count: seedDiagnostics.already_existing_count,
    missing_required_fields_count: seedDiagnostics.missing_required_fields_count,
    score_too_low_count: seedDiagnostics.score_too_low_count,
    unsupported_content_type_count: seedDiagnostics.unsupported_content_type_count,
    limit_applied: seedDiagnostics.limit_applied,
    empty_reason: seedDiagnostics.empty_reason,
    warnings: preview.warnings || [],
    would_insert_count: insertable.length,
    would_insert: insertable.map((candidate) => seedCandidatePublic(candidate, { row: opportunityRowFromPreviewCandidate(candidate) })),
    inserted_count: 0,
    skipped_count: skipped.length,
    error_count: 0,
    inserted: [],
    skipped,
    errors: []
  };

  if (request.dry_run) return base;

  const inserted = [];
  const errors = [];
  for (const candidate of insertable) {
    const row = opportunityRowFromPreviewCandidate(candidate);
    try {
      const result = await insertRow(row, candidate);
      const saved = Array.isArray(result) ? result[0] || row : result || row;
      inserted.push(seedCandidatePublic(candidate, { row: saved }));
    } catch (error) {
      errors.push(seedCandidatePublic(candidate, {
        reason: "insert_failed",
        error: String(error?.message || error || "insert_failed").slice(0, 300)
      }));
    }
  }

  return {
    ...base,
    read_only: false,
    writes_enabled: true,
    inserted_count: inserted.length,
    skipped_count: skipped.length,
    error_count: errors.length,
    inserted,
    errors
  };
}

function inferCandidateSourceEmptyReason(diagnostics = {}) {
  if (!diagnostics.selected_content_type || !diagnostics.template_types?.length) return "selected_type_without_source";
  if (diagnostics.ready_to_publish_count > 0) return null;
  if (diagnostics.pending_opportunities_count > 0) return "ready_to_publish_empty";
  if (diagnostics.seedable_opportunities_count > 0) return "pending_opportunities_empty";
  if (diagnostics.existing_slug_collisions_count > 0) return "seed_exhausted_by_existing_slugs";
  if (diagnostics.controlled_opportunities_count > 0) return "seed_backlog_empty";
  return "unknown_candidate_source_empty";
}

async function getLandingPreviewSeedableSummary({ selectedContentType, templateType, fetchRows }) {
  if (selectedContentType !== "landing") return null;
  try {
    const preview = await getSeoOpportunitiesPreview({
      content_type: "landing",
      template: templateType || "all",
      limit: 1,
      maxLimit: 5000,
      fetchRows
    });
    return {
      seedable_count: Number(preview?.summary?.seedable_count || 0),
      warnings: Array.isArray(preview?.warnings) ? preview.warnings : []
    };
  } catch {
    return null;
  }
}

async function getSeoCandidateSourceDiagnostics(options = {}) {
  const selectedContentType = options.selectedContentType ?? options.selected_content_type ?? null;
  const templateType = options.templateType || options.template_type || candidateTemplateTypeForContentType(selectedContentType);
  const candidateLimit = clampCandidateLimit(options.candidateLimit || options.candidate_limit || 25);
  let templateTypes = [];

  try {
    templateTypes = templateType ? templateTypesForRequest(templateType) : [];
  } catch {
    templateTypes = [];
  }

  const base = {
    ok: true,
    read_only: true,
    selected_content_type: selectedContentType,
    template_type: templateType || null,
    template_types: templateTypes,
    ready_to_publish_count: 0,
    pending_opportunities_count: 0,
    pending_opportunities_by_template: {},
    pending_opportunities_by_status: {},
    seedable_opportunities_count: 0,
    existing_slug_collisions_count: 0,
    existing_slug_collisions_sample: []
  };

  if (!selectedContentType || !templateTypes.length) {
    return {
      ...base,
      candidate_source_empty_reason: "selected_type_without_source"
    };
  }

  const fetchRows = options.fetchRows || (hasSupabaseConfig() ? (path) => supabaseFetch(path) : null);
  if (!fetchRows) {
    return {
      ...base,
      ok: false,
      reason: "supabase_not_configured",
      candidate_source_empty_reason: "unknown_candidate_source_empty"
    };
  }

  try {
    const templateFilter = templateTypes.length === 1 ? `eq.${templateTypes[0]}` : `in.(${templateTypes.join(",")})`;
    const readyParams = new URLSearchParams({
      select: "slug,status,template_type,title,quality_score",
      status: "in.(ready_to_publish,READY_TO_PUBLISH)",
      limit: "1000"
    });
    const opportunityParams = new URLSearchParams({
      select: "keyword,city,template_type,status,search_priority",
      template_type: templateFilter,
      limit: "1000"
    });
    const landingParams = new URLSearchParams({
      select: "slug,status,template_type,title",
      template_type: templateFilter,
      limit: "1000"
    });
    const [readyRowsRaw, opportunityRowsRaw, existingLandingRowsRaw] = await Promise.all([
      fetchRows(`seo_landings?${readyParams.toString()}`),
      fetchRows(`seo_landing_opportunities?${opportunityParams.toString()}`),
      fetchRows(`seo_landings?${landingParams.toString()}`)
    ]);
    const readyRows = Array.isArray(readyRowsRaw) ? readyRowsRaw : [];
    const opportunityRows = Array.isArray(opportunityRowsRaw) ? opportunityRowsRaw : [];
    const existingLandingRows = Array.isArray(existingLandingRowsRaw) ? existingLandingRowsRaw : [];
    const pendingRows = opportunityRows.filter((row) => String(row.status || "").toLowerCase() === "pending");
    const pool = poolForTemplateTypes(templateTypes);
    const existingOpportunityKeys = new Set(opportunityRows.map(opportunityKey));
    const existingLandingSlugs = new Set(existingLandingRows.map((landing) => landing.slug).filter(Boolean));
    const seedableOpportunities = pool.filter(
      (opportunity) => !existingOpportunityKeys.has(opportunityKey(opportunity)) && !existingLandingSlugs.has(opportunitySlug(opportunity))
    );
    const slugCollisions = pool.filter((opportunity) => existingLandingSlugs.has(opportunitySlug(opportunity)));
    const previewSeedableSummary = await getLandingPreviewSeedableSummary({ selectedContentType, templateType, fetchRows });
    const seedableCount = Math.max(seedableOpportunities.length, Number(previewSeedableSummary?.seedable_count || 0));
    const diagnostics = {
      ...base,
      ready_to_publish_count: readyRows.length,
      pending_opportunities_count: pendingRows.length,
      pending_opportunities_by_template: countBy(pendingRows, "template_type"),
      pending_opportunities_by_status: countBy(opportunityRows, "status"),
      opportunities_total_count: opportunityRows.length,
      controlled_opportunities_count: pool.length,
      seedable_opportunities_count: seedableCount,
      controlled_seedable_opportunities_count: seedableOpportunities.length,
      preview_seedable_opportunities_count: previewSeedableSummary?.seedable_count ?? null,
      preview_warnings: previewSeedableSummary?.warnings || [],
      existing_slug_collisions_count: slugCollisions.length,
      existing_slug_collisions_sample: slugCollisions.slice(0, candidateLimit).map(publicOpportunityDiagnostic)
    };
    return {
      ...diagnostics,
      candidate_source_empty_reason: inferCandidateSourceEmptyReason(diagnostics)
    };
  } catch {
    return {
      ...base,
      ok: false,
      reason: "candidate_source_diagnostics_failed",
      candidate_source_empty_reason: "unknown_candidate_source_empty"
    };
  }
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

async function fetchDraftLandingOpportunities({ limit, templateType, readyToPublishOnly = false }) {
  if (!hasSupabaseConfig()) return [];

  const templateTypes = templateTypesForRequest(templateType);
  const params = new URLSearchParams({
    select: "id,opportunity_id,slug,title,city,province,autonomous_community,template_type,status,quality_score,updated_at",
    status: readyToPublishOnly ? "in.(ready_to_publish,READY_TO_PUBLISH)" : "in.(draft,needs_review,ready_to_publish,noindex)",
    order: "updated_at.asc",
    limit: String(limit)
  });
  params.set("template_type", templateTypes.length === 1 ? `eq.${templateTypes[0]}` : `in.(${templateTypes.join(",")})`);
  const rows = await supabaseFetch(`seo_landings?${params.toString()}`);
  return Array.isArray(rows) ? rows.map(landingToOpportunity) : [];
}

async function fetchGenerationCandidates({ limit, templateType, includeExistingDrafts, existingDraftsOnly = false, readyToPublishOnly = false }) {
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
    fetchDraftLandingOpportunities({ limit, templateType, readyToPublishOnly }),
    existingDraftsOnly ? Promise.resolve([]) : fetchPendingOpportunities({ limit, templateType })
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
  let result;
  try {
    result = await supabaseFetch("seo_landings?on_conflict=slug", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify([landing])
    });
  } catch (error) {
    if (!/column\s+"?(index_status|published_at)"?\s+does not exist/i.test(String(error?.message || error || ""))) {
      throw error;
    }
    const { index_status: _indexStatus, published_at: _publishedAt, ...storageLanding } = landing;
    result = await supabaseFetch("seo_landings?on_conflict=slug", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify([storageLanding])
    });
  }
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
  let rows;
  try {
    rows = await supabaseFetch(`seo_landings?${params.toString()}`);
  } catch (error) {
    if (!/column\s+"?published_at"?\s+does not exist/i.test(String(error?.message || error || ""))) throw error;
    const compatibleParams = new URLSearchParams({
      select: "id,template_type,status,updated_at,last_generated_at",
      status: "eq.published",
      updated_at: `gte.${start.toISOString()}`,
      limit: "5000"
    });
    rows = await supabaseFetch(`seo_landings?${compatibleParams.toString()}`);
  }
  const snapshot = buildSeoDailyPolicySnapshot(Array.isArray(rows) ? rows : [], { now });
  return snapshot.published_total_today;
}

function canPublishNow({ mode, autoPublish, quality, publishedToday, publishedThisRun, dailyPublishLimit, maxPublishesPerRun, minScore = 85 }) {
  if (mode !== "publish" || !autoPublish) return false;
  if (quality.score < minScore) return false;
  if (quality.technical_indexability_status === "blocked") return false;
  if (quality.editorial_quality_status && !["pass", "ok"].includes(String(quality.editorial_quality_status).toLowerCase())) return false;
  if (Array.isArray(quality.rejection_reasons) && quality.rejection_reasons.length) return false;
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

function parseBriefJson(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return {};
  }
}

function normalizeLandingSlug(value) {
  return String(value || "")
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase();
}

function suggestedSlugForOpportunity(opportunity) {
  const brief = parseBriefJson(opportunity?.brief_json);
  const raw = opportunity?.suggested_slug || brief.suggested_slug || brief.slug;
  const slug = normalizeLandingSlug(raw || opportunitySlug(opportunity));
  return slug ? `/${slug}/` : "";
}

function arrayFromBrief(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function safeHomeLifeBriefText(value) {
  return String(value || "")
    .replace(/¿?\s*es\s+(una\s+)?(estafa|fraude|engaño)\s+si/gi, "¿Es una señal a comprobar si")
    .replace(/\bestafas?\b/gi, "señales delicadas")
    .replace(/\bfraudes?\b/gi, "incidencias")
    .replace(/\bengaños?\b/gi, "datos incoherentes")
    .trim();
}

function defaultHomeLifeFaq() {
  return [
    {
      question: "¿Qué señales conviene revisar antes de contactar por una vivienda?",
      answer:
        "Conviene revisar precio, precio/m², fotos, ubicación, datos incompletos y coherencia general, siempre como señales a comprobar y no como conclusiones absolutas."
    },
    {
      question: "¿Puede un anuncio incompleto ser suficiente para descartar una vivienda?",
      answer:
        "No necesariamente. Puede indicar que necesitas pedir más información antes de visitar o comparar con otras viviendas similares."
    },
    {
      question: "¿Cómo ayuda InmoRadar en esta revisión previa?",
      answer:
        "InmoRadar resume datos clave del anuncio, ayuda a revisar precio/m², detecta señales de riesgo y facilita comparar varias viviendas con más contexto."
    },
    {
      question: "¿Esta guía sustituye una revisión profesional?",
      answer:
        "No. Es una orientación preliminar para preparar mejores preguntas antes de contactar."
    }
  ];
}

function sanitizeHomeLifeFaq(items) {
  const sourceItems = arrayFromBrief(items).length ? items : defaultHomeLifeFaq();
  return arrayFromBrief(sourceItems)
    .slice(0, 5)
    .map((item) => {
      const question = typeof item === "object" ? item.question : item;
      const answer =
        typeof item === "object" && item.answer
          ? item.answer
          : "Revisa el anuncio con calma, contrasta los datos disponibles y prepara preguntas antes de contactar.";
      return {
        question: safeHomeLifeBriefText(question),
        answer: safeHomeLifeBriefText(answer)
      };
    })
    .filter((item) => item.question && item.answer);
}

function renderList(items) {
  return arrayFromBrief(items)
    .map((item) => `<li>${escapeHtml(safeHomeLifeBriefText(item))}</li>`)
    .join("");
}

function renderFaq(items) {
  return arrayFromBrief(items)
    .slice(0, 5)
    .map((item) => {
      const question = typeof item === "object" ? item.question : item;
      const answer =
        typeof item === "object" && item.answer
          ? item.answer
          : "Revisa el anuncio con calma, contrasta los datos disponibles y prepara preguntas antes de contactar.";
      return `<div class="seo-faq-item"><h3>${escapeHtml(safeHomeLifeBriefText(question))}</h3><p>${escapeHtml(
        safeHomeLifeBriefText(answer)
      )}</p></div>`;
    })
    .join("");
}

function homeLifeTopicBody({ title, brief, faq, ctaPrimary, ctaSecondary, disclaimer }) {
  const requiredSections = arrayFromBrief(brief.required_h2_sections);
  const secondaryKeywords = arrayFromBrief(brief.secondary_keywords);
  const safeFaq = sanitizeHomeLifeFaq(faq);

  const sectionsList = requiredSections.length
    ? `<ul>${renderList(requiredSections)}</ul>`
    : `<ul>
        <li>Datos incompletos o poco claros.</li>
        <li>Fotos que no permiten entender el estado real de la vivienda.</li>
        <li>Precio/m² que conviene comparar con viviendas similares.</li>
        <li>Ubicación, superficie o características que merecen contraste.</li>
      </ul>`;
  const keywordList = secondaryKeywords.length
    ? `<p>También puede ayudarte a revisar: ${escapeHtml(secondaryKeywords.map(safeHomeLifeBriefText).join(", "))}.</p>`
    : "";

  return `
    <article class="seo-landing seo-home-life-topic">
      <h1>${escapeHtml(title)}</h1>
      <p>Antes de contactar por una vivienda, merece la pena mirar el anuncio con calma. Algunas señales no significan por sí solas que haya un problema, pero sí pueden ayudarte a preparar preguntas prudentes, contrastar datos y tomar una decisión con más información.</p>
      <p>Esta guía propone una revisión orientativa para detectar señales a comprobar sin sacar conclusiones absolutas sobre anunciantes, inmobiliarias ni portales inmobiliarios.</p>

      <h2>Qué señales conviene comprobar en un anuncio de vivienda</h2>
      <p>Un anuncio puede parecer atractivo y aun así dejar dudas razonables. Revisa si aparecen superficie, distribución, estado, planta, ascensor, gastos recurrentes, certificado energético y ubicación aproximada. Cuando falte información importante, lo mejor es anotarla como punto a preguntar.</p>
      ${sectionsList}

      <h2>Preguntas prudentes antes de contactar</h2>
      <p>Antes de llamar o escribir, prepara preguntas concretas: qué gastos mensuales tiene la vivienda, si las fotos son recientes, si hay derramas previstas, qué incluye el precio y desde cuándo está publicado el anuncio. El objetivo no es acusar, sino obtener contexto útil para decidir si merece la pena avanzar.</p>
      <p>También puedes preguntar por reformas, orientación, aislamiento, consumo energético y cualquier dato técnico que pueda afectar al coste real de vivir en esa vivienda.</p>

      <h2>Precio/m², fotos, ubicación y datos incompletos</h2>
      <p>El precio/m² es una referencia útil para comparar, pero no debe interpretarse de forma aislada. Una vivienda puede tener un precio distinto por estado, altura, luz, terraza, garaje, eficiencia energética o cercanía a servicios. Si las fotos no muestran baños, cocina, fachada o zonas clave, conviene pedir más detalle.</p>
      <p>Los datos incompletos no prueban nada por sí mismos. Funcionan como señales a comprobar: elementos que merecen contraste antes de visitar o descartar.</p>
      ${keywordList}

      <h2>Cómo comparar varias viviendas sin precipitarte</h2>
      <p>Compara anuncios similares en una tabla sencilla: precio total, precio/m², superficie, gastos, estado, ubicación, información pendiente y preguntas necesarias. Así evitas decidir solo por una foto o por un precio que parece bajo sin mirar el contexto.</p>
      <p>Si varias viviendas tienen dudas parecidas, prioriza las que ofrecen más información y dejan menos preguntas básicas sin responder.</p>

      <h2>Cómo te ayuda InmoRadar antes de contactar por un piso</h2>
      <p>InmoRadar ayuda a analizar anuncios inmobiliarios antes de contactar. Resume datos clave, ayuda a revisar precio/m², detecta señales de riesgo y facilita comparar varias viviendas con más contexto antes de tomar una decisión.</p>
      <p>También puede ayudarte a estimar mejor el coste real antes de decidir si contactas, visitas o sigues comparando otras opciones.</p>
      <p><strong>${escapeHtml(ctaPrimary)}</strong></p>
      <p>${escapeHtml(ctaSecondary)}</p>

      <h2>Resumen: observa señales, pide contexto y decide con más información</h2>
      <p>Una revisión prudente no busca conclusiones absolutas. Busca ordenar dudas, pedir información concreta y comparar mejor. Si un anuncio deja preguntas importantes abiertas, apunta esas preguntas antes de contactar y contrasta con otras viviendas similares.</p>

      <h2>Preguntas frecuentes</h2>
      <div class="seo-faq">${renderFaq(safeFaq)}</div>

      <p class="seo-disclaimer">${escapeHtml(disclaimer)}</p>
      <p><a href="/como-controlar-factura-luz-casa/">Revisar gastos de luz antes de elegir vivienda</a> puede completar esta lectura. También puedes consultar una guía sobre <a href="/guias/coste-real-comprar-vivienda/">coste real de comprar una vivienda</a>.</p>
    </article>
  `;
}

function buildHomeLifeTopicLanding(opportunity, sourceData) {
  const brief = parseBriefJson(opportunity.brief_json);
  const slug = normalizeLandingSlug(suggestedSlugForOpportunity(opportunity));
  const isRiskSignals = opportunity.cluster_id === "risk_signals" || slug === "senales-riesgo-anuncio-vivienda";
  const title = isRiskSignals
    ? "Señales de riesgo en un anuncio de vivienda: guía prudente antes de contactar"
    : String(brief.suggested_title || brief.suggested_h1 || opportunity.keyword || "Guía práctica antes de contactar por una vivienda").trim();
  const h1 = isRiskSignals
    ? "Señales de riesgo en un anuncio de vivienda: guía prudente antes de contactar"
    : String(brief.suggested_h1 || title).trim();
  const metaDescription = isRiskSignals
    ? "Guía prudente para revisar señales, datos incompletos y preguntas clave antes de contactar por una vivienda. Compara anuncios con más contexto."
    : String(brief.suggested_meta_description || "Guía orientativa para revisar anuncios inmobiliarios con más contexto antes de contactar.").trim();
  const ctaPrimary = "Analiza un piso con InmoRadar antes de contactar.";
  const ctaSecondary = "Instala la extensión de Chrome y úsala mientras revisas anuncios inmobiliarios.";
  const disclaimer =
    "InmoRadar ofrece orientación y análisis preliminar. No sustituye una tasación, asesoramiento legal, financiero, técnico, energético ni de seguros.";
  const faq = sanitizeHomeLifeFaq(brief.suggested_faqs);
  const bodyHtml = homeLifeTopicBody({
    title: h1,
    brief,
    faq,
    ctaPrimary,
    ctaSecondary,
    disclaimer
  });

  return {
    slug,
    title,
    meta_title: title,
    meta_description: metaDescription,
    h1,
    body_html: bodyHtml,
    city: opportunity.city || null,
    province: opportunity.province || null,
    autonomous_community: opportunity.autonomous_community || null,
    template_type: "home_life_topic",
    canonical_url: canonicalForSlug(slug),
    faq,
    source_data_json: sourceData
  };
}

function buildLandingForOpportunity(opportunity, sourceData, options = {}) {
  if (opportunity.template_type === "price_city") return buildPriceCityLanding(opportunity, sourceData);
  if (opportunity.template_type === "rent_city") return buildRentCityLanding(opportunity, sourceData);
  if (opportunity.template_type === "expensive_listing_city") return buildExpensiveListingCityLanding(opportunity, sourceData);
  if (opportunity.template_type === "editorial_guide") return buildEditorialGuideLanding(opportunity, sourceData);
  if (opportunity.template_type === "home_life_topic" && options.allowHomeLifeTopic === true) {
    return buildHomeLifeTopicLanding(opportunity, sourceData);
  }
  throw new Error(`Unsupported template_type: ${opportunity.template_type}`);
}

function buildLandingRecord({ opportunity, landing, sourceData, quality, indexability, status, indexStatus, now, publishedAt }) {
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
      indexability,
      quality,
      faq: landing.faq,
      lookup_error: sourceData.lookup_error || null
    },
    published_at: publishedAt,
    updated_at: now,
    last_generated_at: now
  };
}

async function fetchOpportunityById(opportunityId) {
  const params = new URLSearchParams({
    select: "*",
    id: `eq.${opportunityId}`,
    limit: "1"
  });
  const rows = await supabaseFetch(`seo_landing_opportunities?${params.toString()}`);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function fetchLandingMatchesByOpportunityId(opportunityId) {
  const params = new URLSearchParams({
    select: "id,slug,template_type,status,index_status,published_at",
    opportunity_id: `eq.${opportunityId}`,
    limit: "10"
  });
  const rows = await supabaseFetch(`seo_landings?${params.toString()}`);
  return Array.isArray(rows) ? rows : [];
}

async function fetchLandingMatchesBySlug(slug) {
  const params = new URLSearchParams({
    select: "id,slug,template_type,status,index_status,published_at",
    slug: `eq.${slug}`,
    limit: "10"
  });
  const rows = await supabaseFetch(`seo_landings?${params.toString()}`);
  return Array.isArray(rows) ? rows : [];
}

async function fetchOpportunityMatchesBySuggestedSlug(suggestedSlug) {
  if (!suggestedSlug) return [];
  const params = new URLSearchParams({
    select: "id,keyword,cluster_id,suggested_slug,template_type,status",
    suggested_slug: `eq.${suggestedSlug}`,
    limit: "50"
  });
  const rows = await supabaseFetch(`seo_landing_opportunities?${params.toString()}`);
  return Array.isArray(rows) ? rows : [];
}

async function fetchOpportunityMatchesByKeywordCluster(opportunity) {
  if (!opportunity.keyword || !opportunity.cluster_id) return [];
  const params = new URLSearchParams({
    select: "id,keyword,cluster_id,suggested_slug,template_type,status",
    keyword: `eq.${opportunity.keyword}`,
    cluster_id: `eq.${opportunity.cluster_id}`,
    limit: "50"
  });
  const rows = await supabaseFetch(`seo_landing_opportunities?${params.toString()}`);
  return Array.isArray(rows) ? rows : [];
}

async function insertLanding(landing) {
  const rows = await supabaseFetch("seo_landings", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([landing])
  });
  return Array.isArray(rows) ? rows[0] || null : rows;
}

function duplicateCheckSummary({ landingOpportunityMatches, landingSlugMatches, suggestedSlugMatches, keywordClusterMatches }) {
  return {
    matching_landing_opportunity_count: landingOpportunityMatches.length,
    matching_landing_slug_count: landingSlugMatches.length,
    duplicate_suggested_slug_count: suggestedSlugMatches.length,
    duplicate_keyword_cluster_count: keywordClusterMatches.length,
    matching_landings: [...landingOpportunityMatches, ...landingSlugMatches].map((landing) => ({
      id: landing.id,
      slug: landing.slug,
      template_type: landing.template_type,
      status: landing.status,
      index_status: landing.index_status,
      published_at: landing.published_at ?? null
    }))
  };
}

function blockedDraftResult(error, httpStatus, extra = {}) {
  return {
    ok: false,
    created: false,
    error,
    http_status: httpStatus,
    published: false,
    wordpress_called: false,
    cron_executed: false,
    seed_executed: false,
    ...extra
  };
}

async function generateSeoDraftFromOpportunity(input = {}) {
  if (input.confirm !== SEO_DRAFT_FROM_OPPORTUNITY_CONFIRMATION) {
    return blockedDraftResult("invalid_confirmation", 400);
  }
  if (!hasSupabaseConfig()) {
    return blockedDraftResult("supabase_not_configured", 500);
  }

  const opportunityId = Number.parseInt(String(input.opportunity_id || input.opportunityId || ""), 10);
  if (!Number.isInteger(opportunityId) || opportunityId <= 0) {
    return blockedDraftResult("invalid_opportunity_id", 400);
  }

  const opportunity = await fetchOpportunityById(opportunityId);
  if (!opportunity) {
    return blockedDraftResult("opportunity_not_found", 404, { opportunity_id: opportunityId });
  }
  if (String(opportunity.status || "").toLowerCase() !== "pending") {
    return blockedDraftResult("opportunity_status_not_pending", 409, {
      opportunity_id: opportunityId,
      opportunity_status: opportunity.status || null
    });
  }
  if (opportunity.template_type !== "home_life_topic") {
    return blockedDraftResult("unsupported_template_type", 400, {
      opportunity_id: opportunityId,
      template_type: opportunity.template_type || null
    });
  }

  const suggestedSlug = suggestedSlugForOpportunity(opportunity);
  const slug = normalizeLandingSlug(suggestedSlug);
  if (!slug) {
    return blockedDraftResult("missing_suggested_slug", 400, { opportunity_id: opportunityId });
  }

  const [landingOpportunityMatches, landingSlugMatches, suggestedSlugRows, keywordClusterRows] = await Promise.all([
    fetchLandingMatchesByOpportunityId(opportunityId),
    fetchLandingMatchesBySlug(slug),
    fetchOpportunityMatchesBySuggestedSlug(suggestedSlug),
    fetchOpportunityMatchesByKeywordCluster(opportunity)
  ]);
  const suggestedSlugMatches = suggestedSlugRows.filter((row) => Number(row.id) !== opportunityId);
  const keywordClusterMatches = keywordClusterRows.filter((row) => Number(row.id) !== opportunityId);
  const duplicate_checks = duplicateCheckSummary({
    landingOpportunityMatches,
    landingSlugMatches,
    suggestedSlugMatches,
    keywordClusterMatches
  });

  if (landingOpportunityMatches.length) {
    return blockedDraftResult("landing_already_exists_for_opportunity", 409, {
      opportunity_id: opportunityId,
      slug,
      duplicate_checks
    });
  }
  if (landingSlugMatches.length) {
    return blockedDraftResult("landing_slug_already_exists", 409, {
      opportunity_id: opportunityId,
      slug,
      duplicate_checks
    });
  }
  if (suggestedSlugMatches.length) {
    return blockedDraftResult("duplicate_suggested_slug", 409, {
      opportunity_id: opportunityId,
      slug,
      duplicate_checks
    });
  }
  if (keywordClusterMatches.length) {
    return blockedDraftResult("duplicate_keyword_cluster", 409, {
      opportunity_id: opportunityId,
      slug,
      duplicate_checks
    });
  }

  const now = input.now || new Date().toISOString();
  const brief = parseBriefJson(opportunity.brief_json);
  const sourceData = {
    generated_by: "inmoradar_seo_manual_opportunity_draft",
    source: "seo_landing_opportunities",
    opportunity_id: opportunityId,
    cluster_id: opportunity.cluster_id || null,
    suggested_slug: suggestedSlug,
    brief_json: brief,
    sources: [],
    records: [],
    hasRealData: true,
    hasProvincialOnly: false,
    manual_review_required: true
  };
  const landing = buildLandingForOpportunity(opportunity, sourceData, { allowHomeLifeTopic: true });
  const quality = calculateSeoLandingQuality(landing, { ...sourceData, faq: landing.faq });
  const indexability = evaluateLandingIndexability(
    {
      ...landing,
      status: "needs_review",
      index_status: "noindex",
      quality_score: quality.score,
      word_count: quality.word_count
    },
    { quality }
  );
  const record = buildLandingRecord({
    opportunity,
    landing,
    sourceData,
    quality,
    indexability,
    status: "needs_review",
    indexStatus: "noindex",
    now,
    publishedAt: null
  });
  record.source_data_json = {
    ...record.source_data_json,
    source: "seo_landing_opportunities",
    opportunity_id: opportunityId,
    cluster_id: opportunity.cluster_id || null,
    suggested_slug: suggestedSlug,
    brief_json: brief,
    manual_review_required: true
  };
  const saved = await insertLanding(record);
  const updatedOpportunityRows = await updateOpportunity(opportunity, { status: "needs_review" });
  const updatedOpportunity = Array.isArray(updatedOpportunityRows) ? updatedOpportunityRows[0] || null : updatedOpportunityRows;

  return {
    ok: true,
    created: true,
    landing_id: saved?.id || null,
    opportunity_id: opportunityId,
    slug: record.slug,
    status: record.status,
    index_status: record.index_status,
    canonical_url: record.canonical_url,
    published_at: record.published_at,
    warnings: quality.warnings || [],
    duplicate_checks,
    opportunity_status: updatedOpportunity?.status || "needs_review",
    quality_score: quality.score,
    word_count: quality.word_count,
    published: false,
    wordpress_called: false,
    cron_executed: false,
    seed_executed: false
  };
}

function resultSummary(record, sourceData, quality, saved) {
  const indexability = record.source_data_json?.indexability || {};
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
    signals: quality.signals,
    penalties: quality.penalties,
    warnings: quality.warnings || [],
    rejection_reasons: quality.rejection_reasons || [],
    indexability_reasons: indexability.reasons || [],
    sitemap_eligible: Boolean(indexability.sitemap_eligible),
    sitemap_reason: indexability.sitemap_reason || null,
    technical_indexability_status: quality.technical_indexability_status || "ok",
    editorial_quality_status: quality.editorial_quality_status || "pass",
    saved: Boolean(saved)
  };
}

async function generateOne({ opportunity, mode, autoPublish, publishedToday, publishedThisRun, dailyPublishLimit, maxPublishesPerRun, minScore, now }) {
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
  const publishIndexability = evaluateLandingIndexability(
    {
      ...landing,
      status: "published",
      index_status: "index",
      quality_score: quality.score,
      word_count: quality.word_count
    },
    { quality, minQualityScore: minScore }
  );
  const canAutoPublish =
    publishIndexability.sitemap_eligible &&
    canPublishNow({
      mode,
      autoPublish,
      quality,
      publishedToday,
      publishedThisRun,
      dailyPublishLimit,
      maxPublishesPerRun,
      minScore
    });
  const wouldPublishInDryRun =
    dryRun &&
    autoPublish &&
    publishIndexability.can_publish &&
    canPublishNow({
      mode: "publish",
      autoPublish: true,
      quality,
      publishedToday,
      publishedThisRun,
      dailyPublishLimit,
      maxPublishesPerRun,
      minScore
    });
  const status = wouldPublishInDryRun ? "would_publish" : landingStatus(quality.score, canAutoPublish);
  const indexStatus = canAutoPublish || wouldPublishInDryRun ? "index" : "noindex";
  const publishedAt = canAutoPublish ? now : null;
  const indexability = evaluateLandingIndexability(
    {
      ...landing,
      status: canAutoPublish || wouldPublishInDryRun ? "published" : status,
      index_status: indexStatus,
      quality_score: quality.score,
      word_count: quality.word_count
    },
    { quality, minQualityScore: minScore }
  );
  const record = buildLandingRecord({
    opportunity,
    landing,
    sourceData,
    quality,
    indexability,
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
    didPublish: canAutoPublish,
    wouldPublish: wouldPublishInDryRun
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
  const existingDraftsOnly = options.existingDraftsOnly === true;
  const readyToPublishOnly = options.readyToPublishOnly === true;
  const publishFirstEligible = options.publishFirstEligible === true;
  const parsedMaxPublishesPerRun = Number.parseInt(String(options.maxPublishesPerRun ?? 1), 10);
  const parsedDailyPublishLimit = Number.parseInt(String(options.dailyPublishLimit ?? 1), 10);
  const parsedMinScore = Number.parseInt(String(options.minScore ?? 85), 10);
  const maxPublishesPerRun = Math.max(1, Math.min(100, Number.isFinite(parsedMaxPublishesPerRun) ? parsedMaxPublishesPerRun : 1));
  const dailyPublishLimit =
    options.dailyPublishLimit === null
      ? null
      : Math.max(0, Math.min(100, Number.isFinite(parsedDailyPublishLimit) ? parsedDailyPublishLimit : 1));
  const minScore = Math.max(0, Math.min(100, Number.isFinite(parsedMinScore) ? parsedMinScore : 85));
  const now = options.now || new Date().toISOString();
  const opportunities =
    options.opportunities ||
    (await fetchGenerationCandidates({
      limit: publishFirstEligible ? candidateLimit : limit,
      templateType,
      includeExistingDrafts,
      existingDraftsOnly,
      readyToPublishOnly
    }));
  let publishedToday = await countPublishedToday(now);
  if (Number.isFinite(Number(options.publishedToday))) {
    publishedToday = Number(options.publishedToday);
  }
  let publishedThisRun = 0;
  let consumedThisRun = 0;
  const results = [];

  for (const opportunity of opportunities.slice(0, publishFirstEligible ? candidateLimit : limit)) {
    const generated = await generateOne({
      opportunity,
      mode,
      autoPublish,
      publishedToday,
      publishedThisRun: consumedThisRun,
      dailyPublishLimit,
      maxPublishesPerRun,
      minScore,
      now
    });
    if (generated.didPublish) {
      publishedToday += 1;
      publishedThisRun += 1;
      consumedThisRun += 1;
    } else if (generated.wouldPublish) {
      consumedThisRun += 1;
    }
    results.push(resultSummary(generated.record, generated.sourceData, generated.quality, generated.saved));
    if (publishFirstEligible && consumedThisRun >= maxPublishesPerRun) break;
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
    existingDraftsOnly,
    readyToPublishOnly,
    dailyPublishLimit,
    maxPublishesPerRun,
    minScore,
    generated_count: results.length,
    published_count: publishedThisRun,
    results
  };
}

module.exports = {
  canPublishNow,
  DEFAULT_SEED_OPPORTUNITIES,
  getSeoCandidateSourceDiagnostics,
  getSeoOpportunitiesPreview,
  generateSeoDraftFromOpportunity,
  seedSeoOpportunitiesFromPreview,
  runSeoLandingGeneration
};
