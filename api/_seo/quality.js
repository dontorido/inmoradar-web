const { canonicalForSlug, countWords, normalizeText, siteUrl, stripHtml } = require("./text");

const QUALITY_GATE_SCORE_THRESHOLD = 75;
const THIRD_PARTY_BRANDS = ["idealista", "fotocasa", "habitaclia", "pisos com"];
const BRAND_RISK_TERMS = new Set([
  "afiliado",
  "afiliada",
  "afiliados",
  "asociado",
  "certificado",
  "colaborador",
  "colaboracion",
  "convenio",
  "homologado",
  "integrado",
  "integracion",
  "oficial",
  "oficialmente",
  "partner",
  "partners"
]);

function sourceRecords(sourceData = {}) {
  const records = Array.isArray(sourceData.records) ? sourceData.records : [];
  if (records.length) return records.filter(Boolean);
  return Array.isArray(sourceData.sources) ? sourceData.sources.filter(Boolean) : [];
}

function hasEscapedUrl(bodyHtml, sourceUrl) {
  if (!sourceUrl) return false;
  const body = String(bodyHtml || "");
  const url = String(sourceUrl || "").trim();
  if (!url) return false;
  if (body.includes(url) || body.includes(url.replace(/&/g, "&amp;"))) return true;
  try {
    const parsed = new URL(url);
    return Boolean(parsed.pathname && body.includes(parsed.pathname));
  } catch (_) {
    return false;
  }
}

function sourceVisibilityDetails(landing, sourceData = {}) {
  const records = sourceRecords(sourceData);
  const bodyHtml = String(landing?.body_html || "");
  const visibleText = normalizeText(stripHtml(bodyHtml));
  const hasCompleteMetadata = Boolean(
    records.length &&
      records.every((record) => record.source && record.source_url && (record.period_label || record.period_date))
  );
  const hasSourceLabel = /Fuente:|Fuente y fecha del dato:/i.test(bodyHtml);
  const hasDateLabel = /Fecha del dato:|Fuente y fecha del dato:|periodo/i.test(bodyHtml);
  const visibleSources = records.every((record) => {
    if (!record.source || !record.source_url) return false;
    return hasEscapedUrl(bodyHtml, record.source_url);
  });
  const visibleDates = records.every((record) => {
    const period = String(record.period_label || record.period_date || "").trim();
    return Boolean(period && visibleText.includes(normalizeText(period)));
  });

  return {
    records,
    hasCompleteMetadata,
    hasSourceLabel,
    hasDateLabel,
    sourceVisible: hasCompleteMetadata && hasSourceLabel && visibleSources,
    dateVisible: hasCompleteMetadata && hasDateLabel && visibleDates,
    sourceAndDateVisible: hasCompleteMetadata && hasSourceLabel && hasDateLabel && visibleSources && visibleDates
  };
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
  const body = normalizeText(stripHtml(bodyHtml));
  return /(^|\s)(empezar gratis|instalar inmoradar|analiza anuncios|analiza antes de contactar|analiza anuncios antes de contactar|probar gratis|comenzar gratis)(\s|$)/i.test(body);
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

function landingText(landing) {
  return [
    landing?.title,
    landing?.meta_title,
    landing?.meta_description,
    landing?.h1,
    stripHtml(landing?.body_html)
  ]
    .filter(Boolean)
    .join(" ");
}

function hasMojibake(landing) {
  const text = landingText(landing);
  return /[\uFFFD]|\u00c3[\u0080-\u00bf]|\u00c2[\u0080-\u00bf]?|\u00e2[\u0080-\u20ac][\u0080-\u20ac]?/.test(text);
}

function canonicalIssueReason(landing) {
  const slug = String(landing?.slug || "").replace(/^\/+|\/+$/g, "");
  const configured = String(landing?.canonical_url || "").trim();
  if (!configured || !slug) return null;

  let configuredUrl;
  let expectedUrl;
  try {
    configuredUrl = new URL(configured);
    expectedUrl = new URL(canonicalForSlug(slug, siteUrl()));
  } catch (_) {
    return "canonical invalido";
  }

  const configuredPath = configuredUrl.pathname.replace(/\/+$/, "") || "/";
  const expectedPath = expectedUrl.pathname.replace(/\/+$/, "") || "/";
  if (configuredUrl.origin !== expectedUrl.origin) return "canonical externo o dominio no canonico";
  if (configuredPath !== expectedPath) return "canonical con path incoherente";
  return null;
}

function hasRiskyThirdPartyBrandClaim(landing) {
  const words = normalizeText(landingText(landing)).split(/\s+/).filter(Boolean);
  if (!words.length) return false;

  for (let index = 0; index < words.length; index += 1) {
    const oneWordBrand = THIRD_PARTY_BRANDS.includes(words[index]);
    const twoWordBrand = THIRD_PARTY_BRANDS.includes(`${words[index]} ${words[index + 1] || ""}`);
    if (!oneWordBrand && !twoWordBrand) continue;

    const start = Math.max(0, index - 8);
    const end = Math.min(words.length, index + 9);
    const windowWords = words.slice(start, end);
    const windowText = windowWords.join(" ");
    const explicitlyNegated =
      /no (somos|es|esta|tenemos|existe).{0,30}(oficial|partner|afiliad|integrado)/.test(windowText) ||
      /(sin|ninguna) (relacion|afiliacion|colaboracion|integracion) oficial/.test(windowText);
    if (explicitlyNegated) continue;
    if (windowWords.some((word) => BRAND_RISK_TERMS.has(word))) return true;
  }

  return false;
}

function hasOverGenericClaims(landing) {
  const body = String(landing?.body_html || "");
  const city = normalizeText(landing?.city);
  const cityMentions = city ? (normalizeText(body).match(new RegExp(`\\b${city}\\b`, "g")) || []).length : 0;
  const requiredBlocks = landing?.template_type === "editorial_guide" ? guideSpecificBlockCount(body) : citySpecificBlockCount(body);
  const absoluteClaims = /(garantizado|sin duda|valor real exacto|siempre es|siempre sera|es el precio exacto|precio exacto de calle)/i.test(
    normalizeText(body)
  );
  if (landing?.template_type === "editorial_guide") return requiredBlocks < 3 || absoluteClaims;
  return cityMentions < 5 || requiredBlocks < 3 || absoluteClaims;
}

function calculateSeoLandingQuality(landing, sourceData = {}) {
  const signals = [];
  const penalties = [];
  const warnings = [];
  const rejectionReasons = [];
  let score = 0;
  const wordCount = Number(landing?.word_count) || countWords(landing?.body_html);
  const sourceVisibility = sourceVisibilityDetails(landing, sourceData);
  const sourceVisible = sourceVisibility.sourceAndDateVisible;
  const specificBlockCount = landing?.template_type === "editorial_guide" ? guideSpecificBlockCount(landing?.body_html) : citySpecificBlockCount(landing?.body_html);
  const citySpecific = specificBlockCount >= 3 && !hasOverGenericClaims(landing);
  const canonicalIssue = canonicalIssueReason(landing);
  const mojibakeDetected = hasMojibake(landing);
  const riskyThirdPartyBrandClaim = hasRiskyThirdPartyBrandClaim(landing);

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
    signals.push("contenido especifico de ciudad");
  }
  if (wordCount >= 700) {
    score += 10;
    signals.push("longitud suficiente");
  }
  if (containsUsefulFaq(landing, sourceData)) {
    score += 10;
    signals.push("FAQ util");
  }
  if (metaLooksUnique(landing) && !sourceData.duplicateMeta) {
    score += 10;
    signals.push("meta title/description unicos");
  }
  if (hasClearCta(landing?.body_html)) {
    score += 5;
    signals.push("CTA claro");
  }
  if (internalLinkCount(landing?.body_html) >= 2) {
    score += 5;
    signals.push("enlaces internos");
  }
  if (!canonicalIssue) {
    signals.push("canonical coherente");
  }

  if (sourceData.isDuplicate) {
    score -= 30;
    penalties.push("contenido duplicado");
  }
  if (!sourceVisibility.hasCompleteMetadata) {
    score -= 30;
    penalties.push("fuente o fecha incompleta en datos de origen");
  } else if (!sourceVisible) {
    score -= 30;
    if (!sourceVisibility.sourceVisible) penalties.push("sin fuente visible");
    if (!sourceVisibility.dateVisible) penalties.push("sin fecha visible");
  }
  if (wordCount < 500) {
    score -= 20;
    penalties.push("menos de 500 palabras");
  }
  if (hasOverGenericClaims(landing)) {
    score -= 15;
    penalties.push("afirmaciones demasiado genericas o absolutas");
  }
  if (hasMunicipalitySoldAsStreet(landing, sourceData)) {
    score -= 25;
    penalties.push("dato municipal vendido como calle");
  }
  if (sourceData.hasProvincialOnly) {
    score -= 25;
    penalties.push("solo hay dato provincial/autonomico para una landing de ciudad");
  }
  if (mojibakeDetected) {
    score -= 30;
    penalties.push("posible mojibake o caracteres rotos");
    warnings.push("Revisar tildes/encoding antes de indexar");
  }
  if (canonicalIssue) {
    score -= 30;
    penalties.push(canonicalIssue);
    warnings.push("Canonical no coincide con la URL esperada");
  }
  if (riskyThirdPartyBrandClaim) {
    score -= 15;
    penalties.push("uso potencialmente arriesgado de marca de tercero");
    warnings.push("Revisar menciones a portales para evitar sugerir afiliacion u oficialidad");
  }

  const normalizedScore = Math.max(0, Math.min(100, score));
  if (!sourceVisibility.hasCompleteMetadata) rejectionReasons.push("source_metadata_incomplete");
  else {
    if (!sourceVisibility.sourceVisible) rejectionReasons.push("source_not_visible");
    if (!sourceVisibility.dateVisible) rejectionReasons.push("date_not_visible");
  }
  if (normalizedScore < QUALITY_GATE_SCORE_THRESHOLD) rejectionReasons.push("quality_score_below_75");
  if (mojibakeDetected) rejectionReasons.push("mojibake_detected");
  if (canonicalIssue) rejectionReasons.push("canonical_incoherent");

  return {
    score: normalizedScore,
    word_count: wordCount,
    signals,
    penalties,
    warnings,
    rejection_reasons: rejectionReasons,
    technical_indexability_status: mojibakeDetected || canonicalIssue ? "blocked" : "ok",
    editorial_quality_status:
      riskyThirdPartyBrandClaim || normalizedScore < QUALITY_GATE_SCORE_THRESHOLD
        ? normalizedScore >= 60
          ? "review"
          : "fail"
        : "pass"
  };
}

module.exports = {
  QUALITY_GATE_SCORE_THRESHOLD,
  calculateSeoLandingQuality
};
