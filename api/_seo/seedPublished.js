const { buildExpensiveListingCityLanding, buildRentCityLanding } = require("../../lib/seo/cityGuideTemplates");
const { buildPriceCitySourceData } = require("./marketSources");
const { buildPriceCityLanding } = require("./priceCity");
const { calculateSeoLandingQuality } = require("./quality");

const SEED_PUBLISHED_OPPORTUNITIES = {
  "precio-metro-cuadrado/logrono": {
    keyword: "precio metro cuadrado Logrono",
    city: "Logrono",
    province: "La Rioja",
    autonomous_community: "La Rioja",
    intent: "informational",
    template_type: "price_city",
    search_priority: 85,
    status: "published"
  },
  "precio-metro-cuadrado/madrid": {
    keyword: "precio metro cuadrado Madrid",
    city: "Madrid",
    province: "Madrid",
    autonomous_community: "Madrid Comunidad",
    intent: "informational",
    template_type: "price_city",
    search_priority: 95,
    status: "published"
  },
  "precio-alquiler/madrid": {
    keyword: "precio alquiler metro cuadrado Madrid",
    city: "Madrid",
    province: "Madrid",
    autonomous_community: "Madrid Comunidad",
    intent: "informational",
    template_type: "rent_city",
    search_priority: 92,
    status: "published"
  },
  "saber-si-piso-esta-caro/granada": {
    keyword: "saber si un piso esta caro en Granada",
    city: "Granada",
    province: "Granada",
    autonomous_community: "Andalucia",
    intent: "commercial_investigation",
    template_type: "expensive_listing_city",
    search_priority: 76,
    status: "published"
  }
};

const FIRST_PUBLISHED_OPPORTUNITY = SEED_PUBLISHED_OPPORTUNITIES["precio-metro-cuadrado/logrono"];
const FIRST_PUBLISHED_AT = "2026-05-18T00:00:00.000Z";

function buildSeedLanding(opportunity, sourceData) {
  if (opportunity.template_type === "rent_city") {
    return buildRentCityLanding(opportunity, sourceData);
  }
  if (opportunity.template_type === "expensive_listing_city") {
    return buildExpensiveListingCityLanding(opportunity, sourceData);
  }
  return buildPriceCityLanding(opportunity, sourceData);
}

async function getSeedPublishedLanding(slug) {
  const cleanSlug = String(slug || "").replace(/^\/+|\/+$/g, "");
  const opportunity = SEED_PUBLISHED_OPPORTUNITIES[cleanSlug];
  if (!opportunity) return null;

  const sourceData = await buildPriceCitySourceData(opportunity);
  const landing = buildSeedLanding(opportunity, sourceData);
  const quality = calculateSeoLandingQuality(landing, { ...sourceData, faq: landing.faq });
  if (!sourceData.hasRealData || quality.score < 85) return null;

  return {
    id: null,
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
    index_status: "index",
    status: "published",
    quality_score: quality.score,
    word_count: quality.word_count,
    source_data_json: {
      generated_by: "inmoradar_seed_published_landing",
      template_type: landing.template_type,
      sources: sourceData.sources,
      quality,
      faq: landing.faq
    },
    published_at: FIRST_PUBLISHED_AT,
    updated_at: FIRST_PUBLISHED_AT,
    last_generated_at: FIRST_PUBLISHED_AT
  };
}

module.exports = {
  FIRST_PUBLISHED_OPPORTUNITY,
  SEED_PUBLISHED_OPPORTUNITIES,
  getSeedPublishedLanding
};
