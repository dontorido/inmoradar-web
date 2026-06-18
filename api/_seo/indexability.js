const { QUALITY_GATE_SCORE_THRESHOLD } = require("./quality");
const { canonicalForSlug, countWords, normalizeText, siteUrl, stripHtml } = require("./text");

const MIN_INDEXABLE_WORD_COUNT = 500;
const MIN_INTERNAL_LINKS = 2;

function normalizeSlug(value) {
  return String(value || "").replace(/^\/+|\/+$/g, "").toLowerCase();
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function parseJsonMaybe(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function presentValue(value) {
  if (value === undefined || value === null) return false;
  return typeof value === "string" ? value.trim() !== "" : true;
}

function sourceContainers(sourceData = {}) {
  return [
    sourceData,
    sourceData.landing,
    sourceData.seo,
    sourceData.meta,
    sourceData.metadata,
    sourceData.content,
    sourceData.page
  ].filter((entry) => entry && typeof entry === "object");
}

function landingField(landing = {}, sourceData = {}, key, aliases = []) {
  for (const field of [key, ...aliases]) {
    if (presentValue(landing[field])) return landing[field];
  }
  for (const container of sourceContainers(sourceData)) {
    for (const field of [key, ...aliases]) {
      if (presentValue(container[field])) return container[field];
    }
  }
  return landing[key];
}

function hasLandingField(landing = {}, sourceData = {}, key, aliases = []) {
  for (const field of [key, ...aliases]) {
    if (hasOwn(landing, field)) return true;
  }
  for (const container of sourceContainers(sourceData)) {
    for (const field of [key, ...aliases]) {
      if (hasOwn(container, field)) return true;
    }
  }
  return false;
}

function normalizeSeoLandingFields(landing = {}) {
  const sourceData = parseJsonMaybe(landing.source_data_json);
  return {
    ...landing,
    slug: landingField(landing, sourceData, "slug", ["path"]),
    title: landingField(landing, sourceData, "title"),
    meta_title: landingField(landing, sourceData, "meta_title", ["metaTitle"]),
    meta_description: landingField(landing, sourceData, "meta_description", ["metaDescription", "description"]),
    h1: landingField(landing, sourceData, "h1", ["headline"]),
    body_html: landingField(landing, sourceData, "body_html", ["bodyHtml", "content_html", "html", "body", "content"]),
    canonical_url: landingField(landing, sourceData, "canonical_url", ["canonicalUrl", "canonical"])
  };
}

function qualityFromLanding(landing = {}, explicitQuality = null) {
  if (explicitQuality && typeof explicitQuality === "object") return explicitQuality;
  const sourceData = parseJsonMaybe(landing.source_data_json);
  return parseJsonMaybe(sourceData.quality, {});
}

function hasMojibakeText(value) {
  return /[\uFFFD]|\u00c3[\u0080-\u00bf]|\u00c2[\u0080-\u00bf]?|\u00e2[\u0080-\u20ac][\u0080-\u20ac]?/.test(
    String(value || "")
  );
}

function landingText(landing = {}) {
  return [landing.title, landing.meta_title, landing.meta_description, landing.h1, stripHtml(landing.body_html)].filter(Boolean).join(" ");
}

function canonicalIssueReason(landing = {}, baseUrl = siteUrl()) {
  const slug = normalizeSlug(landing.slug);
  if (!slug) return "slug_missing";
  const configured = String(landing.canonical_url || "").trim();
  if (!configured) return "canonical_missing";

  let configuredUrl;
  let expectedUrl;
  try {
    configuredUrl = new URL(configured);
    expectedUrl = new URL(canonicalForSlug(slug, baseUrl));
  } catch (_) {
    return "canonical_invalid";
  }

  if (!/^https?:$/.test(configuredUrl.protocol)) return "canonical_not_absolute";
  if (configuredUrl.origin !== expectedUrl.origin) return "canonical_host_mismatch";

  const configuredPath = configuredUrl.pathname.replace(/\/+$/, "") || "/";
  const expectedPath = expectedUrl.pathname.replace(/\/+$/, "") || "/";
  if (configuredPath !== expectedPath) return "canonical_path_mismatch";
  return null;
}

function internalLinkCount(bodyHtml = "") {
  return (String(bodyHtml || "").match(/\shref=["']\//g) || []).length;
}

function wordCountForLanding(landing = {}) {
  const explicit = Number(landing.word_count);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return countWords(landing.body_html);
}

function hasContentSignal(landing = {}) {
  return landing.word_count !== undefined || Boolean(landing.body_html);
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value || {}, key);
}

function normalizeReason(reason) {
  const value = String(reason || "").trim();
  if (!value) return "";
  if (value === "canonical_non_canonical_host") return "canonical_host_mismatch";
  if (value === "technical_indexability_blocked") return "technical_rejection";
  if (/^quality_score_below_/.test(value)) return "quality_score_below_threshold";
  return value;
}

function addReason(reasons, reason) {
  const normalized = normalizeReason(reason);
  if (normalized && !reasons.includes(normalized)) reasons.push(normalized);
}

function evaluateLandingIndexability(landing = {}, options = {}) {
  const normalizedLanding = normalizeSeoLandingFields(landing);
  const sourceData = parseJsonMaybe(landing.source_data_json);
  const publishReasons = [];
  const indexStateReasons = [];
  const quality = qualityFromLanding(normalizedLanding, options.quality);
  const status = String(normalizedLanding.status || "").toLowerCase();
  const explicitIndexStatus = String(normalizedLanding.index_status || "").toLowerCase();
  const indexStatus = explicitIndexStatus || (status === "published" ? "index" : "");
  const score = Number(normalizedLanding.quality_score ?? quality.score ?? 0);
  const minQualityScore = Number(options.minQualityScore ?? QUALITY_GATE_SCORE_THRESHOLD);
  const canonicalIssue = canonicalIssueReason(normalizedLanding, options.baseUrl || siteUrl());
  const wordCount = wordCountForLanding(normalizedLanding);
  const bodyHtml = String(normalizedLanding.body_html || "");
  const visibleBodyText = normalizeText(stripHtml(bodyHtml));
  const explicitWordCount = Number(normalizedLanding.word_count);
  const hasBodyHtmlField = hasLandingField(landing, sourceData, "body_html", [
    "bodyHtml",
    "content_html",
    "html",
    "body",
    "content"
  ]);
  const hasEnoughExplicitWords = Number.isFinite(explicitWordCount) && explicitWordCount >= MIN_INDEXABLE_WORD_COUNT;
  const requirePublished = options.requirePublished !== false;
  const requireIndex = options.requireIndex !== false;
  const requireInternalLinks = options.requireInternalLinks !== false && Boolean(bodyHtml);
  const expectedCanonical = normalizedLanding.slug ? canonicalForSlug(normalizeSlug(normalizedLanding.slug), options.baseUrl || siteUrl()) : null;

  if (requirePublished && status !== "published") addReason(indexStateReasons, `status_${status || "unknown"}`);
  if (requireIndex && indexStatus !== "index") {
    addReason(indexStateReasons, indexStatus === "noindex" ? "noindex" : `index_status_${indexStatus || "unknown"}`);
  }
  if (["draft", "needs_review", "ready_to_publish", "review", "noindex", "archived"].includes(status)) {
    addReason(indexStateReasons, status === "noindex" ? "noindex" : `not_public_${status}`);
  }
  if (score < minQualityScore) addReason(publishReasons, "quality_score_below_threshold");
  if (canonicalIssue) addReason(publishReasons, canonicalIssue);

  if (!normalizeText(normalizedLanding.title || normalizedLanding.meta_title)) addReason(publishReasons, "missing_title");
  if (!normalizeText(normalizedLanding.meta_description)) addReason(publishReasons, "missing_meta_description");
  if (!normalizeText(normalizedLanding.h1)) addReason(publishReasons, "missing_h1");
  if ((hasBodyHtmlField && !visibleBodyText) || (!hasBodyHtmlField && !hasEnoughExplicitWords)) addReason(publishReasons, "content_missing");
  if (hasContentSignal(normalizedLanding) && wordCount < MIN_INDEXABLE_WORD_COUNT) addReason(publishReasons, "low_content");
  if (requireInternalLinks && internalLinkCount(bodyHtml) < MIN_INTERNAL_LINKS) addReason(publishReasons, "no_internal_links");

  if (hasMojibakeText(landingText(normalizedLanding))) addReason(publishReasons, "mojibake_detected");
  if (quality.technical_indexability_status === "blocked") addReason(publishReasons, "technical_rejection");
  for (const reason of arrayOrEmpty(quality.rejection_reasons)) addReason(publishReasons, reason);

  const indexReasons = [...publishReasons];
  for (const reason of indexStateReasons) addReason(indexReasons, reason);

  const canPublish = publishReasons.length === 0;
  const canIndex = indexReasons.length === 0;
  const sitemapEligible = canIndex;
  return {
    can_publish: canPublish,
    can_index: canIndex,
    sitemap_eligible: sitemapEligible,
    indexable: canIndex,
    reasons: indexReasons,
    publish_reasons: publishReasons,
    index_reasons: indexReasons,
    primary_reason: sitemapEligible ? "eligible" : indexReasons[0],
    canonical_url: expectedCanonical,
    word_count: wordCount,
    min_quality_score: minQualityScore,
    min_word_count: MIN_INDEXABLE_WORD_COUNT,
    min_internal_links: MIN_INTERNAL_LINKS,
    sitemap_status: sitemapEligible ? "included" : "excluded",
    sitemap_reason: sitemapEligible ? "published_index_quality_ok" : indexReasons[0]
  };
}

function evaluateSitemapEligibility(landing = {}, options = {}) {
  return evaluateLandingIndexability(landing, {
    ...options,
    minQualityScore: options.minQualityScore ?? QUALITY_GATE_SCORE_THRESHOLD,
    requirePublished: true,
    requireIndex: true,
    requireInternalLinks: options.requireInternalLinks !== false
  });
}

module.exports = {
  MIN_INDEXABLE_WORD_COUNT,
  MIN_INTERNAL_LINKS,
  canonicalIssueReason,
  evaluateLandingIndexability,
  evaluateSitemapEligibility,
  internalLinkCount
};
