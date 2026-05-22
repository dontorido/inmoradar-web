const { countWords, normalizeText } = require("./text");

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
  calculateSeoLandingQuality
};
