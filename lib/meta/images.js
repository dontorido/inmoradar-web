const { cleanText, siteUrl } = require("./settings");

const DEFAULT_BRAND_IMAGE_PATH = "/assets/inmoradar-brand-mark.jpg";

function isPublicImageUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol);
  } catch (error) {
    return false;
  }
}

function defaultBrandImageUrl(env = process.env) {
  const configured = cleanText(env.META_DEFAULT_IMAGE_URL || env.PUBLIC_META_IMAGE_URL, 1000);
  if (isPublicImageUrl(configured)) return configured;
  return `${siteUrl(env)}${DEFAULT_BRAND_IMAGE_PATH}`;
}

function imageUrlForLanding(landing = {}, platform = "facebook", env = process.env) {
  const candidates = [
    landing.image_url,
    landing.og_image_url,
    landing.social_image_url,
    landing.source_data_json?.image_url,
    landing.source_data_json?.og_image_url,
    defaultBrandImageUrl(env)
  ];
  const imageUrl = candidates.find(isPublicImageUrl) || "";
  if (platform === "instagram" && !isPublicImageUrl(imageUrl)) return "";
  return imageUrl;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function generateMetaImageSvg(post = {}) {
  const platform = cleanText(post.platform || "Meta", 40).toUpperCase();
  const title = cleanText(post.city || post.source_slug || "InmoRadar", 44);
  const subtitle = cleanText(post.template_type || post.source_type || "SEO landing", 44).replace(/_/g, " ");
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
  <rect width="1200" height="1200" fill="#101112"/>
  <rect x="72" y="72" width="1056" height="1056" rx="44" fill="#18191B" stroke="#303236" stroke-width="2"/>
  <circle cx="158" cy="158" r="38" fill="#0B0B0C"/>
  <circle cx="158" cy="158" r="16" fill="none" stroke="#FFFFFF" stroke-width="5"/>
  <circle cx="158" cy="158" r="4" fill="#FFFFFF"/>
  <path d="M158 158 L170 146" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"/>
  <text x="214" y="172" fill="#FFFFFF" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="800">Inmo</text>
  <text x="315" y="172" fill="#FF4500" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="800">Radar</text>
  <text x="96" y="358" fill="#FF4500" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="800" letter-spacing="6">${escapeHtml(platform)}</text>
  <text x="96" y="520" fill="#FFFFFF" font-family="Arial, Helvetica, sans-serif" font-size="94" font-weight="900">${escapeHtml(title)}</text>
  <text x="96" y="626" fill="#D4D4D4" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="700">${escapeHtml(subtitle)}</text>
  <text x="96" y="916" fill="#A3A3A3" font-family="Arial, Helvetica, sans-serif" font-size="32">Datos para comparar antes de contactar.</text>
  <line x1="96" y1="1000" x2="1104" y2="1000" stroke="#2A2C31"/>
  <text x="96" y="1062" fill="#737782" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="700">INMORADAR.APP</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

module.exports = {
  DEFAULT_BRAND_IMAGE_PATH,
  defaultBrandImageUrl,
  generateMetaImageSvg,
  imageUrlForLanding,
  isPublicImageUrl
};
