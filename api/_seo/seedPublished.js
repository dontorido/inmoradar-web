const { buildPriceCitySourceData } = require("./marketSources");
const { buildPriceCityLanding } = require("./priceCity");
const { calculateSeoLandingQuality } = require("./quality");

const FIRST_PUBLISHED_OPPORTUNITY = {
  keyword: "precio metro cuadrado Logroño",
  city: "Logroño",
  province: "La Rioja",
  autonomous_community: "La Rioja",
  intent: "informational",
  template_type: "price_city",
  search_priority: 85,
  status: "published"
};

const FIRST_PUBLISHED_AT = "2026-05-18T00:00:00.000Z";

async function getSeedPublishedLanding(slug) {
  if (String(slug || "").replace(/^\/+|\/+$/g, "") !== "precio-metro-cuadrado/logrono") {
    return null;
  }

  const sourceData = await buildPriceCitySourceData(FIRST_PUBLISHED_OPPORTUNITY);
  const landing = buildPriceCityLanding(FIRST_PUBLISHED_OPPORTUNITY, sourceData);
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
  getSeedPublishedLanding
};
