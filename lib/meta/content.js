const { cleanText, siteUrl } = require("./settings");

const SUPPORTED_TEMPLATE_TYPES = ["expensive_listing_city", "price_city", "rent_city", "editorial_guide"];
const DEFAULT_QUALITY_SCORE = 75;

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slugify(value) {
  return normalizeText(value).replace(/\s+/g, "-");
}

function normalizeUrl(value, env = process.env) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw, siteUrl(env));
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.href;
  } catch (error) {
    return "";
  }
}

function landingUrl(landing = {}, env = process.env) {
  const canonical = normalizeUrl(landing.canonical_url, env);
  if (canonical) return canonical;
  const slug = String(landing.slug || "").replace(/^\/+|\/+$/g, "");
  return slug ? `${siteUrl(env)}/${slug}/` : "";
}

function canonicalSourceUrl(value, env = process.env) {
  const href = normalizeUrl(value, env);
  if (!href) return "";
  const url = new URL(href);
  url.search = "";
  url.hash = "";
  return url.href;
}

function campaignForLanding(landing = {}) {
  const city = slugify(landing.city || "");
  if (city) return `seo_city_${city}`;
  const slug = slugify(String(landing.slug || "").split("/").pop() || landing.title || "landing");
  return `seo_guide_${slug || "landing"}`;
}

function withUtm(url, platform, landing = {}, env = process.env) {
  const href = normalizeUrl(url, env);
  if (!href) return "";
  const target = new URL(href);
  target.searchParams.set("utm_source", platform);
  target.searchParams.set("utm_medium", "social");
  target.searchParams.set("utm_campaign", campaignForLanding(landing));
  return target.href;
}

function hasEncodingGlitch(value) {
  return /(?:Ã|Â|â‚¬|â€¢|�)/.test(String(value || ""));
}

function landingHasEncodingGlitches(landing = {}) {
  return [landing.title, landing.meta_title, landing.meta_description, landing.h1, landing.city, landing.slug]
    .filter(Boolean)
    .some(hasEncodingGlitch);
}

function isEligibleLanding(landing = {}, options = {}) {
  const minQualityScore = Number(options.minQualityScore || DEFAULT_QUALITY_SCORE);
  const templateType = String(landing.template_type || "").trim();
  const qualityScore = Number(landing.quality_score || 0);
  if (!SUPPORTED_TEMPLATE_TYPES.includes(templateType)) return false;
  if (String(landing.status || "").toLowerCase() !== "published") return false;
  if (String(landing.index_status || "").toLowerCase() !== "index") return false;
  if (!Number.isFinite(qualityScore) || qualityScore < minQualityScore) return false;
  if (!landingUrl(landing, options.env || process.env)) return false;
  if (landingHasEncodingGlitches(landing)) return false;
  if (!cleanText(landing.title || landing.h1 || landing.meta_title, 240)) return false;
  return true;
}

function displayCity(landing = {}) {
  return cleanText(landing.city || "tu ciudad", 80);
}

function titleForGuide(landing = {}) {
  return cleanText(landing.title || landing.h1 || landing.meta_title || "Guia de InmoRadar", 180);
}

function captionTemplate(landing = {}, url) {
  const city = displayCity(landing);
  const type = String(landing.template_type || "");
  if (type === "expensive_listing_city") {
    return [
      `¿Un piso en ${city} parece barato... o solo lo parece?`,
      "",
      "InmoRadar analiza precio por m2, zona, señales ocultas y coste real antes de contactar.",
      "",
      "Compruebalo aqui:",
      url
    ].join("\n");
  }
  if (type === "price_city") {
    return [
      `¿Cuanto cuesta realmente comprar vivienda en ${city}?`,
      "",
      "Hemos preparado una referencia rapida de precio por m2 para comparar mejor antes de visitar anuncios.",
      "",
      url
    ].join("\n");
  }
  if (type === "rent_city") {
    return [
      `Antes de alquilar en ${city}, mira esto.`,
      "",
      "Precio, zona, señales ocultas y coste real pueden cambiar mucho la decision.",
      "",
      url
    ].join("\n");
  }
  return [
    "Nueva guia de InmoRadar:",
    "",
    titleForGuide(landing),
    "",
    "Una forma rapida de entender mejor el mercado antes de llamar, visitar o negociar.",
    "",
    url
  ].join("\n");
}

function trimForPlatform(caption, platform) {
  const max = platform === "instagram" ? 1900 : 5000;
  const text = cleanText(caption, max + 200);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

function buildCaption({ landing, platform = "facebook", env = process.env } = {}) {
  const sourceUrl = canonicalSourceUrl(landingUrl(landing, env), env);
  const utmUrl = withUtm(sourceUrl, platform, landing, env);
  const caption = trimForPlatform(captionTemplate(landing, utmUrl), platform);
  return {
    caption,
    source_url: sourceUrl,
    platform,
    utm_source: platform,
    utm_medium: "social",
    utm_campaign: campaignForLanding(landing),
    source_slug: String(landing?.slug || "").replace(/^\/+|\/+$/g, "")
  };
}

function duplicateForPlatform(posts = [], platform, landing = {}, env = process.env) {
  const sourceUrl = canonicalSourceUrl(landingUrl(landing, env), env);
  const sourceSlug = String(landing.slug || "").replace(/^\/+|\/+$/g, "");
  return posts.some((post) => {
    if (String(post.platform || "").toLowerCase() !== platform) return false;
    if (["failed", "skipped"].includes(String(post.status || ""))) return false;
    const postUrl = canonicalSourceUrl(post.source_url, env);
    return (sourceUrl && postUrl === sourceUrl) || (sourceSlug && post.source_slug === sourceSlug);
  });
}

function publishedCityTypeKey(post = {}) {
  return [normalizeText(post.city || ""), normalizeText(post.source_type || post.template_type || "")].join("|");
}

function pickNextLanding({ landings = [], posts = [], platform = "facebook", env = process.env, minQualityScore = DEFAULT_QUALITY_SCORE } = {}) {
  const candidates = landings
    .filter((landing) => isEligibleLanding(landing, { env, minQualityScore }))
    .filter((landing) => !duplicateForPlatform(posts, platform, landing, env))
    .sort((left, right) => {
      const score = Number(right.quality_score || 0) - Number(left.quality_score || 0);
      if (score) return score;
      return new Date(right.published_at || right.updated_at || 0).getTime() - new Date(left.published_at || left.updated_at || 0).getTime();
    });
  if (candidates.length <= 1) return candidates[0] || null;
  const recentPublished = posts
    .filter((post) => String(post.platform || "").toLowerCase() === platform && post.published_at)
    .sort((left, right) => new Date(right.published_at).getTime() - new Date(left.published_at).getTime())[0];
  const recentKey = publishedCityTypeKey(recentPublished);
  return candidates.find((landing) => publishedCityTypeKey({ city: landing.city, source_type: landing.template_type }) !== recentKey) || candidates[0] || null;
}

function buildMetaPost({ landing, platform = "facebook", status = "draft", imageUrl = null, env = process.env } = {}) {
  const content = buildCaption({ landing, platform, env });
  return {
    source_type: landing?.template_type || "seo_landing",
    source_slug: content.source_slug,
    source_url: content.source_url,
    platform,
    status,
    caption: content.caption,
    image_url: imageUrl,
    published_url: null,
    external_post_id: null,
    scheduled_for: null,
    published_at: null,
    error_message: null,
    utm_source: content.utm_source,
    utm_medium: content.utm_medium,
    utm_campaign: content.utm_campaign,
    city: landing?.city || null,
    template_type: landing?.template_type || null
  };
}

module.exports = {
  DEFAULT_QUALITY_SCORE,
  SUPPORTED_TEMPLATE_TYPES,
  buildCaption,
  buildMetaPost,
  canonicalSourceUrl,
  campaignForLanding,
  duplicateForPlatform,
  hasEncodingGlitch,
  isEligibleLanding,
  landingHasEncodingGlitches,
  landingUrl,
  normalizeText,
  pickNextLanding,
  slugify,
  withUtm
};
