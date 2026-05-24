const { countWords, normalizeText } = require("./text");

const SEO_INDEX_MIN_SCORE = 80;
const SEO_AUTOPUBLISH_MIN_SCORE = 80;

function hasSourceAndDate(sourceData) {
  return Boolean(
    sourceData?.records?.length &&
      sourceData.records.every((record) => record.source && record.source_url && (record.period_label || record.period_date))
  );
}

function citySpecificBlockCount(bodyHtml) {
  return (String(bodyHtml || "").match(/data-city-specific="true"/g) || []).length;
}

function guideSpecificBlockCount(bodyHtml) {
  return (String(bodyHtml || "").match(/data-guide-specific="true"/g) || []).length;
}

function containsUsefulFaq(landing, sourceData) {
  const faq = sourceData?.faq || landing?.source_data_json?.faq || [];
  if (Array.isArray(faq) && faq.length >= 4) return true;
  return /class="seo-faq"|<h2[^>]*>Preguntas frecuentes/i.test(String(landing?.body_html || ""));
}

function hasClearCta(bodyHtml) {
  return /Instalar InmoRadar|Analiza anuncios antes de contactar|INSTALAR INMORADAR/i.test(String(bodyHtml || ""));
}

function hasMeasurableInstallCta(bodyHtml) {
  const html = String(bodyHtml || "");
  return /data-install-button/i.test(html) && /data-install-source="seo[_a-z0-9-]*"/i.test(html);
}

function internalLinkCount(bodyHtml) {
  return (String(bodyHtml || "").match(/href="\//g) || []).length;
}

function metaLooksUnique(landing) {
  const title = normalizeText(landing?.title);
  const metaTitle = normalizeText(landing?.meta_title);
  const metaDescription = normalizeText(landing?.meta_description);
  const h1 = normalizeText(landing?.h1);
  const city = normalizeText(landing?.city);
  if (!title || !metaTitle || !metaDescription || !h1 || !city) return false;
  if (!title.includes(city) || !metaTitle.includes(city) || !h1.includes(city)) return false;
  return metaDescription.length >= 80 && title !== metaTitle;
}

function hasMunicipalitySoldAsStreet(landing, sourceData) {
  const hasMunicipality = sourceData?.records?.some((record) => record.geo_level === "municipality");
  if (!hasMunicipality) return false;
  return /precio exacto de calle|precio de calle|dato exacto de la calle/i.test(String(landing?.body_html || ""));
}

function hasOverGenericClaims(landing) {
  const body = String(landing?.body_html || "");
  const city = normalizeText(landing?.city);
  const cityMentions = city ? (normalizeText(body).match(new RegExp(`\\b${city}\\b`, "g")) || []).length : 0;
  const requiredBlocks = landing?.template_type === "editorial_guide" ? guideSpecificBlockCount(body) : citySpecificBlockCount(body);
  const absoluteClaims = /(garantizado|sin duda|valor real exacto|siempre es|siempre será|es el precio exacto|precio exacto de calle)/i.test(body);
  if (landing?.template_type === "editorial_guide") return requiredBlocks < 3 || absoluteClaims;
  return cityMentions < 5 || requiredBlocks < 3 || absoluteClaims;
}

function hasCanonicalUrl(landing) {
  const slug = String(landing?.slug || "").replace(/^\/+|\/+$/g, "");
  const canonical = String(landing?.canonical_url || "").trim();
  if (!slug || !canonical) return false;
  return /^https:\/\/(www\.)?inmoradar\.app\//i.test(canonical) && canonical.endsWith(`/${slug}/`);
}

function hasPrudenceBlock(landing) {
  const body = normalizeText(landing?.body_html);
  return (
    /referencia orientativa|referencias orientativas|dato agregado|senal agregada|señal agregada/.test(body) &&
    /no constituye una tasacion|no sustituye una tasacion|no es una tasacion|no garantiza|no describe una calle concreta/.test(body)
  );
}

function hasThirdPartyAffiliationRisk(landing) {
  const text = normalizeText(`${landing?.title || ""} ${landing?.meta_title || ""} ${landing?.meta_description || ""} ${landing?.body_html || ""}`);
  return /(idealista|fotocasa|habitaclia)[a-z0-9\s]{0,32}(oficial|afiliad|partner|colaboracion oficial)|oficial[a-z0-9\s]{0,32}(idealista|fotocasa|habitaclia)/.test(text);
}

function addGateCheck(checks, id, ok, message, severity = "blocker") {
  checks.push({ id, ok: Boolean(ok), severity, message });
}

function evaluateSeoQualityGate({ landing, sourceData = {}, quality = null, uniqueness = { ok: true }, minScore = SEO_AUTOPUBLISH_MIN_SCORE } = {}) {
  const computedQuality = quality || calculateSeoLandingQuality(landing, sourceData);
  const wordCount = Number(computedQuality.word_count) || countWords(landing?.body_html);
  const templateType = String(landing?.template_type || "");
  const isEditorialGuide = templateType === "editorial_guide";
  const checks = [];
  const sourceVisible = hasSourceAndDate(sourceData) && /Fuente:|Fecha del dato:/i.test(String(landing?.body_html || ""));
  const specificBlockCount = isEditorialGuide ? guideSpecificBlockCount(landing?.body_html) : citySpecificBlockCount(landing?.body_html);

  addGateCheck(checks, "quality_score_minimum", computedQuality.score >= minScore, `Quality score ${computedQuality.score} por debajo del minimo ${minScore}.`);
  addGateCheck(checks, "content_minimum", wordCount >= 700, "La landing debe tener al menos 700 palabras utiles.");
  addGateCheck(checks, "required_meta", Boolean(landing?.title && landing?.meta_title && landing?.meta_description && landing?.h1), "Faltan title, meta title, meta description o H1.");
  addGateCheck(
    checks,
    "meta_unique",
    isEditorialGuide ? normalizeText(landing?.meta_description).length >= 80 : metaLooksUnique(landing) && !sourceData.duplicateMeta,
    "Title, H1 y meta description deben ser especificos y no duplicados."
  );
  addGateCheck(checks, "canonical_valid", hasCanonicalUrl(landing), "Canonical ausente o no alineado con el slug.");
  addGateCheck(checks, "measurable_cta", hasMeasurableInstallCta(landing?.body_html), "Debe existir CTA SEO medible con data-install-button y data-install-source.");
  addGateCheck(checks, "internal_links", internalLinkCount(landing?.body_html) >= 2, "Debe incluir al menos dos enlaces internos utiles.");
  addGateCheck(checks, "faq_useful", containsUsefulFaq(landing, sourceData), "Debe incluir FAQ util.");
  addGateCheck(checks, "specific_content", specificBlockCount >= 3 && !hasOverGenericClaims(landing), "Debe incluir contenido especifico y evitar afirmaciones genericas o absolutas.");
  addGateCheck(checks, "prudence_block", hasPrudenceBlock(landing), "Debe incluir bloque de prudencia: referencia orientativa/no tasacion exacta.");
  addGateCheck(checks, "third_party_independence", !hasThirdPartyAffiliationRisk(landing), "No debe sugerir afiliacion oficial con portales inmobiliarios.");
  addGateCheck(checks, "not_street_exact", !hasMunicipalitySoldAsStreet(landing, sourceData), "No puede vender un dato municipal como dato exacto de calle.");
  addGateCheck(checks, "source_quality", isEditorialGuide || (sourceData.hasRealData && !sourceData.hasProvincialOnly && sourceVisible), "Debe tener fuente real visible, fecha y nivel suficiente.");
  addGateCheck(checks, "uniqueness", uniqueness?.ok !== false, `Duplicidad o similitud excesiva: ${uniqueness?.reason || "unknown"}.`);

  const failed = checks.filter((check) => !check.ok);
  const blockingReasons = failed.filter((check) => check.severity === "blocker").map((check) => check.id);
  const canPublish = blockingReasons.length === 0;
  return {
    passed: canPublish,
    can_publish: canPublish,
    can_index: canPublish && computedQuality.score >= SEO_INDEX_MIN_SCORE,
    min_score: minScore,
    index_min_score: SEO_INDEX_MIN_SCORE,
    quality_score: computedQuality.score,
    word_count: wordCount,
    reasons: blockingReasons,
    checks
  };
}

function calculateSeoLandingQuality(landing, sourceData = {}) {
  const signals = [];
  const penalties = [];
  let score = 0;
  const wordCount = Number(landing?.word_count) || countWords(landing?.body_html);
  const sourceVisible = hasSourceAndDate(sourceData) && /Fuente:|Fecha del dato:/i.test(String(landing?.body_html || ""));
  const specificBlockCount = landing?.template_type === "editorial_guide" ? guideSpecificBlockCount(landing?.body_html) : citySpecificBlockCount(landing?.body_html);
  const citySpecific = specificBlockCount >= 3 && !hasOverGenericClaims(landing);

  if (sourceData.hasRealData && !sourceData.hasProvincialOnly) {
    score += 25;
    signals.push("datos reales disponibles");
  }
  if (sourceVisible) {
    score += 15;
    signals.push("fuente y fecha visibles");
  }
  if (citySpecific) {
    score += 20;
    signals.push("contenido específico de ciudad");
  }
  if (wordCount >= 700) {
    score += 10;
    signals.push("longitud suficiente");
  }
  if (containsUsefulFaq(landing, sourceData)) {
    score += 10;
    signals.push("FAQ útil");
  }
  if (metaLooksUnique(landing) && !sourceData.duplicateMeta) {
    score += 10;
    signals.push("meta title/description únicos");
  }
  if (hasClearCta(landing?.body_html)) {
    score += 5;
    signals.push("CTA claro");
  }
  if (internalLinkCount(landing?.body_html) >= 2) {
    score += 5;
    signals.push("enlaces internos");
  }

  if (sourceData.isDuplicate) {
    score -= 30;
    penalties.push("contenido duplicado");
  }
  if (!sourceVisible) {
    score -= 30;
    penalties.push("sin fuente visible");
  }
  if (wordCount < 500) {
    score -= 20;
    penalties.push("menos de 500 palabras");
  }
  if (hasOverGenericClaims(landing)) {
    score -= 15;
    penalties.push("afirmaciones demasiado genéricas o absolutas");
  }
  if (hasMunicipalitySoldAsStreet(landing, sourceData)) {
    score -= 25;
    penalties.push("dato municipal vendido como calle");
  }
  if (sourceData.hasProvincialOnly) {
    score -= 25;
    penalties.push("solo hay dato provincial/autonómico para una landing de ciudad");
  }

  const normalizedScore = Math.max(0, Math.min(100, score));
  return {
    score: normalizedScore,
    word_count: wordCount,
    signals,
    penalties
  };
}

module.exports = {
  SEO_AUTOPUBLISH_MIN_SCORE,
  SEO_INDEX_MIN_SCORE,
  calculateSeoLandingQuality,
  evaluateSeoQualityGate
};
