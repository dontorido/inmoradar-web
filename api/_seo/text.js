const DISPLAY_NAME_OVERRIDES = {
  "a coruna": "A Coruña",
  "barcelona": "Barcelona",
  "logrono": "Logroño",
  "madrid": "Madrid",
  "malaga": "Málaga",
  "valencia": "Valencia"
};

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function displayName(value) {
  const normalized = normalizeText(value);
  return DISPLAY_NAME_OVERRIDES[normalized] || String(value || "").trim();
}

function slugify(value) {
  return normalizeText(value).replace(/\s+/g, "-");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&[a-z0-9#]+;/gi, " ");
}

function countWords(html) {
  const words = stripHtml(html)
    .replace(/\s+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words.length;
}

function formatNumber(value, decimals = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals
  }).format(number);
}

function siteUrl() {
  return String(process.env.PUBLIC_SITE_URL || process.env.SITE_URL || "https://inmoradar.app").replace(/\/+$/, "");
}

function canonicalForSlug(slug) {
  return `${siteUrl()}/${String(slug || "").replace(/^\/+|\/+$/g, "")}/`;
}

module.exports = {
  canonicalForSlug,
  countWords,
  displayName,
  escapeHtml,
  formatNumber,
  normalizeText,
  siteUrl,
  slugify,
  stripHtml
};
