const crypto = require("node:crypto");
const { hasSupabaseConfig, supabaseFetch } = require("../_utils");

const ENDPOINT = "photo-condition-analysis";
const DEFAULT_MAX_IMAGES = 8;
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-4.1-mini";

const memoryCache = new Map();
const rateBuckets = new Map();

const CONDITION_LABELS_ES = {
  excellent: "Excelente",
  good: "Bueno",
  average: "Medio",
  dated: "Antiguo/desactualizado",
  poor: "Malo",
  unknown: "No concluyente"
};

const RENOVATION_PROBABILITY_ES = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  very_high: "Muy alta",
  unknown: "No concluyente"
};

const RENOVATION_TYPE_ES = {
  none: "Sin reforma aparente",
  cosmetic_update: "Actualizacion estetica",
  partial_renovation: "Reforma parcial",
  full_renovation: "Reforma integral probable",
  unknown: "No concluyente"
};

const PHOTO_ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["condition", "renovation", "signals", "confidence_score", "caveats", "price_interpretation"],
  properties: {
    condition: {
      type: "object",
      additionalProperties: false,
      required: ["label", "label_es", "score"],
      properties: {
        label: { type: "string", enum: ["excellent", "good", "average", "dated", "poor", "unknown"] },
        label_es: { type: "string" },
        score: { type: "number", minimum: 0, maximum: 100 }
      }
    },
    renovation: {
      type: "object",
      additionalProperties: false,
      required: ["probability", "probability_es", "type", "type_es", "estimated_scope"],
      properties: {
        probability: { type: "string", enum: ["low", "medium", "high", "very_high", "unknown"] },
        probability_es: { type: "string" },
        type: { type: "string", enum: ["none", "cosmetic_update", "partial_renovation", "full_renovation", "unknown"] },
        type_es: { type: "string" },
        estimated_scope: { type: "array", items: { type: "string" } }
      }
    },
    signals: {
      type: "object",
      additionalProperties: false,
      required: ["kitchen", "bathroom", "flooring", "walls_ceilings", "windows_doors", "general_light"],
      properties: {
        kitchen: { $ref: "#/$defs/area_signal" },
        bathroom: { $ref: "#/$defs/area_signal" },
        flooring: { $ref: "#/$defs/area_signal" },
        walls_ceilings: { $ref: "#/$defs/area_signal" },
        windows_doors: { $ref: "#/$defs/area_signal" },
        general_light: { $ref: "#/$defs/area_signal" }
      }
    },
    confidence_score: { type: "number", minimum: 0, maximum: 1 },
    caveats: { type: "array", items: { type: "string" } },
    price_interpretation: {
      type: "object",
      additionalProperties: false,
      required: ["impact", "message"],
      properties: {
        impact: { type: "string", enum: ["positive", "neutral", "negative", "unknown"] },
        message: { type: "string" }
      }
    }
  },
  $defs: {
    area_signal: {
      type: "object",
      additionalProperties: false,
      required: ["status", "renovation_likelihood", "notes"],
      properties: {
        status: { type: "string", enum: ["excellent", "good", "average", "dated", "poor", "unknown"] },
        renovation_likelihood: { type: "string", enum: ["low", "medium", "high", "very_high", "unknown"] },
        notes: { type: "array", items: { type: "string" } }
      }
    }
  }
};

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value, min, max) {
  const number = asNumber(value);
  if (number === null) return min;
  return Math.max(min, Math.min(max, number));
}

function hash(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function imageObject(value) {
  if (typeof value === "string") return { url: value, alt: "" };
  if (!value || typeof value !== "object") return { url: "", alt: "" };
  return {
    url: value.url || value.src || value.href || "",
    alt: value.alt || value.title || value.label || "",
    width: value.width || null,
    height: value.height || null
  };
}

function normalizeImageUrl(value) {
  const raw = String(value || "").trim();
  if (!raw || /^data:/i.test(raw) || /^blob:/i.test(raw)) return null;
  try {
    const url = new URL(raw);
    if (!/^https?:$/.test(url.protocol)) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(imwidth|width|height|quality|size|w|h|q)$/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return null;
  }
}

function scoreImageCandidate(candidate) {
  const haystack = normalizeText(`${candidate.url} ${candidate.alt}`);
  let score = 0;

  if (/cocina|kitchen/.test(haystack)) score += 50;
  if (/bano|bath|aseo/.test(haystack)) score += 45;
  if (/salon|comedor|living/.test(haystack)) score += 40;
  if (/dormitorio|habitacion|bedroom/.test(haystack)) score += 35;
  if (/pasillo|hall|terraza|balcon/.test(haystack)) score += 22;
  if (/interior|foto|image/.test(haystack)) score += 8;

  if (/plano|mapa|map|logo|icon|street.?view|fachada|portal|calle|entorno|zona/.test(haystack)) score -= 35;
  if (candidate.width && Number(candidate.width) < 320) score -= 20;
  if (candidate.height && Number(candidate.height) < 240) score -= 20;

  return score;
}

function selectRepresentativeListingImages(imageUrls, options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit || DEFAULT_MAX_IMAGES), DEFAULT_MAX_IMAGES));
  const seen = new Set();
  const candidates = [];
  const discardedImages = [];

  for (const item of asArray(imageUrls)) {
    const candidate = imageObject(item);
    const normalized = normalizeImageUrl(candidate.url);
    if (!normalized) {
      discardedImages.push({ url: candidate.url || "", reason: "invalid_url" });
      continue;
    }
    if (seen.has(normalized)) {
      discardedImages.push({ url: candidate.url, reason: "duplicate" });
      continue;
    }
    seen.add(normalized);
    candidates.push({
      ...candidate,
      url: candidate.url,
      normalizedUrl: normalized,
      score: scoreImageCandidate(candidate)
    });
  }

  const sorted = candidates.sort((a, b) => b.score - a.score);
  const selected = sorted.slice(0, limit);
  for (const item of sorted.slice(limit)) {
    discardedImages.push({ url: item.url, reason: "over_limit" });
  }

  return {
    selectedImages: selected.map((item) => item.url),
    normalizedSelectedImages: selected.map((item) => item.normalizedUrl),
    discardedImages,
    selectionReason: `Seleccionadas ${selected.length} imagenes representativas priorizando interiores y descartando duplicados.`
  };
}

function defaultCaveats(extra = []) {
  return [
    "Estimacion visual basada solo en fotos del anuncio.",
    "Las fotos pueden estar editadas, incompletas o no mostrar defectos importantes.",
    "No sustituye una inspeccion tecnica ni una visita presencial.",
    ...extra
  ];
}

function areaSignal(value = {}) {
  return {
    status: value.status || "unknown",
    renovation_likelihood: value.renovation_likelihood || "unknown",
    notes: asArray(value.notes).map(String).slice(0, 4)
  };
}

function normalizeModelAnalysis(raw = {}, imagesAnalyzed = 0) {
  const conditionLabel = raw.condition?.label || "unknown";
  const renovationProbability = raw.renovation?.probability || "unknown";
  const renovationType = raw.renovation?.type || "unknown";
  const confidencePenalty = imagesAnalyzed < 2 ? 0.55 : 1;
  const confidence = clamp(raw.confidence_score ?? 0.4, 0, 1) * confidencePenalty;

  return {
    condition: {
      label: conditionLabel,
      label_es: raw.condition?.label_es || CONDITION_LABELS_ES[conditionLabel] || "No concluyente",
      score: clamp(raw.condition?.score ?? 50, 0, 100)
    },
    renovation: {
      probability: renovationProbability,
      probability_es: raw.renovation?.probability_es || RENOVATION_PROBABILITY_ES[renovationProbability] || "No concluyente",
      type: renovationType,
      type_es: raw.renovation?.type_es || RENOVATION_TYPE_ES[renovationType] || "No concluyente",
      estimated_scope: asArray(raw.renovation?.estimated_scope).map(String).slice(0, 8)
    },
    signals: {
      kitchen: areaSignal(raw.signals?.kitchen),
      bathroom: areaSignal(raw.signals?.bathroom),
      flooring: areaSignal(raw.signals?.flooring),
      walls_ceilings: areaSignal(raw.signals?.walls_ceilings),
      windows_doors: areaSignal(raw.signals?.windows_doors),
      general_light: areaSignal(raw.signals?.general_light)
    },
    confidence_score: Math.round(confidence * 100) / 100,
    caveats: defaultCaveats(asArray(raw.caveats).map(String)).slice(0, 8),
    price_interpretation: {
      impact: raw.price_interpretation?.impact || "unknown",
      message: raw.price_interpretation?.message || "Estimacion visual disponible como contexto adicional para interpretar el precio."
    }
  };
}

function buildPrompt(input = {}, imagesCount = 0) {
  return [
    "Analiza las fotos de un anuncio inmobiliario.",
    "Estima el estado visual de conservacion y la probabilidad de reforma basandote unicamente en las imagenes disponibles.",
    "No afirmes certezas absolutas. Usa expresiones como parece, sugiere, segun las fotos y probabilidad.",
    "No analices personas. Si aparecen personas, ignoralas.",
    "No estimes coste de reforma y no digas que una reforma es obligatoria.",
    "Si las fotos son insuficientes, baja confidence_score y usa unknown cuando corresponda.",
    "Devuelve solo JSON valido con el esquema solicitado.",
    "",
    `Imagenes recibidas: ${imagesCount}.`,
    `Operacion: ${input.operation || "unknown"}.`,
    `Precio anuncio: ${input.price_total || "unknown"}.`,
    `Superficie m2: ${input.surface_m2 || "unknown"}.`,
    `Precio anuncio eur/m2: ${input.listing_price_eur_m2 || "unknown"}.`,
    `Referencia mercado eur/m2: ${input.market_price_eur_m2 || "unknown"}.`,
    `Diferencia pct: ${input.difference_pct || "unknown"}.`
  ].join("\n");
}

function extractOutputText(response = {}) {
  if (typeof response.output_text === "string") return response.output_text;
  for (const item of asArray(response.output)) {
    for (const content of asArray(item.content)) {
      if (typeof content.text === "string") return content.text;
      if (typeof content.output_text === "string") return content.output_text;
    }
  }
  return "";
}

async function callVisionModel(input, selectedImages, options = {}) {
  const apiKey = options.openaiApiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { ok: false, reason: "vision_model_not_configured", message: "Falta OPENAI_API_KEY en Vercel." };
  }

  const payload = {
    model: options.model || process.env.OPENAI_VISION_MODEL || DEFAULT_MODEL,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: buildPrompt(input, selectedImages.length) },
          ...selectedImages.map((url) => ({ type: "input_image", image_url: url, detail: "low" }))
        ]
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "photo_condition_analysis",
        strict: true,
        schema: PHOTO_ANALYSIS_SCHEMA
      }
    },
    temperature: 0.1,
    max_output_tokens: 1800
  };

  const response = await (options.fetchImpl || fetch)(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return { ok: false, reason: "vision_model_error", status: response.status, details: text.slice(0, 500) };
  }

  const data = await response.json();
  const outputText = extractOutputText(data);
  if (!outputText) return { ok: false, reason: "vision_model_empty" };

  try {
    return { ok: true, analysis: JSON.parse(outputText), raw: data };
  } catch {
    return { ok: false, reason: "vision_model_invalid_json" };
  }
}

function cachePayload(input, analysis, selectedImages, rawResponse = null) {
  return {
    ok: true,
    source: "vision_model",
    access_level: "free",
    images_analyzed: selectedImages.length,
    ...analysis,
    raw_response: rawResponse || null,
    listing_url: input.listing_url || null,
    portal: input.portal || null,
    cached_at: new Date().toISOString()
  };
}

function publicPayload(payload, cache = { hit: false, layer: "network" }) {
  const copy = { ...payload };
  delete copy.raw_response;
  return { ...copy, cache };
}

function rowToPayload(row = {}) {
  return {
    ok: true,
    source: row.source || "vision_model",
    access_level: row.access_level || "free",
    images_analyzed: row.images_analyzed || 0,
    condition: {
      label: row.condition_label || "unknown",
      label_es: row.condition_label_es || CONDITION_LABELS_ES[row.condition_label] || "No concluyente",
      score: asNumber(row.condition_score) ?? 50
    },
    renovation: {
      probability: row.renovation_probability || "unknown",
      probability_es: row.renovation_probability_es || RENOVATION_PROBABILITY_ES[row.renovation_probability] || "No concluyente",
      type: row.renovation_type || "unknown",
      type_es: row.renovation_type_es || RENOVATION_TYPE_ES[row.renovation_type] || "No concluyente",
      estimated_scope: asArray(row.estimated_scope_json)
    },
    signals: row.signals_json || {},
    confidence_score: asNumber(row.confidence_score) ?? 0.4,
    caveats: asArray(row.caveats_json),
    price_interpretation: row.price_interpretation_json || { impact: "unknown", message: "" },
    listing_url: row.listing_url || null,
    portal: row.portal || null,
    cached_at: row.updated_at || row.created_at || null
  };
}

async function getCachedPhotoAnalysis(listingUrlHash, imageUrlsHash) {
  const memoryKey = `${listingUrlHash}:${imageUrlsHash}`;
  const memory = memoryCache.get(memoryKey);
  if (memory && memory.expiresAt > Date.now()) return { payload: memory.payload, cache: { hit: true, layer: "memory" } };
  if (memory) memoryCache.delete(memoryKey);

  if (!hasSupabaseConfig()) return null;
  const now = encodeURIComponent(new Date().toISOString());
  const path = [
    "photo_condition_analysis_cache?select=*",
    `listing_url_hash=eq.${encodeURIComponent(listingUrlHash)}`,
    `image_urls_hash=eq.${encodeURIComponent(imageUrlsHash)}`,
    `expires_at=gt.${now}`,
    "limit=1"
  ].join("&");
  const rows = await supabaseFetch(path, { method: "GET" }).catch(() => []);
  if (!rows?.length) return null;
  return { payload: rowToPayload(rows[0]), cache: { hit: true, layer: "supabase" } };
}

async function setCachedPhotoAnalysis(listingUrlHash, imageUrlsHash, input, payload, ttlMs = DEFAULT_TTL_MS) {
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  const memoryKey = `${listingUrlHash}:${imageUrlsHash}`;
  memoryCache.set(memoryKey, { payload, expiresAt: Date.now() + ttlMs });

  if (!hasSupabaseConfig()) return;
  const row = {
    listing_url_hash: listingUrlHash,
    image_urls_hash: imageUrlsHash,
    portal: input.portal || null,
    listing_url: input.listing_url || null,
    source: payload.source || "vision_model",
    access_level: payload.access_level || "free",
    images_analyzed: payload.images_analyzed || 0,
    condition_label: payload.condition?.label || null,
    condition_label_es: payload.condition?.label_es || null,
    condition_score: payload.condition?.score || null,
    renovation_probability: payload.renovation?.probability || null,
    renovation_probability_es: payload.renovation?.probability_es || null,
    renovation_type: payload.renovation?.type || null,
    renovation_type_es: payload.renovation?.type_es || null,
    estimated_scope_json: payload.renovation?.estimated_scope || [],
    signals_json: payload.signals || {},
    confidence_score: payload.confidence_score || null,
    price_interpretation_json: payload.price_interpretation || {},
    caveats_json: payload.caveats || [],
    raw_response_json: payload.raw_response || {},
    expires_at: expiresAt,
    updated_at: new Date().toISOString()
  };

  await supabaseFetch("photo_condition_analysis_cache?on_conflict=listing_url_hash,image_urls_hash", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(row)
  }).catch((error) => console.warn("[photo-analysis] cache write failed", error.message));
}

function windowStart(ms) {
  return Math.floor(Date.now() / ms) * ms;
}

function checkPhotoRateLimit(key = "anonymous") {
  const hourMs = 60 * 60 * 1000;
  const dayMs = 24 * hourMs;
  const hourKey = `${key}:${ENDPOINT}:h:${windowStart(hourMs)}`;
  const dayKey = `${key}:${ENDPOINT}:d:${windowStart(dayMs)}`;
  const hour = rateBuckets.get(hourKey) || 0;
  const day = rateBuckets.get(dayKey) || 0;
  if (hour >= 5 || day >= 20) {
    return {
      allowed: false,
      reason: "rate_limited",
      hourly_remaining: Math.max(0, 5 - hour),
      daily_remaining: Math.max(0, 20 - day)
    };
  }
  rateBuckets.set(hourKey, hour + 1);
  rateBuckets.set(dayKey, day + 1);
  return {
    allowed: true,
    hourly_remaining: Math.max(0, 5 - hour - 1),
    daily_remaining: Math.max(0, 20 - day - 1)
  };
}

function combinePriceAndPhotoAssessment(priceAssessment = {}, photoAssessment = {}) {
  const label = priceAssessment.label || priceAssessment.rawLabel || priceAssessment.comparison?.label || "";
  const condition = photoAssessment.condition?.label || "";
  const renovation = photoAssessment.renovation?.probability || "";

  if (label === "caro" && ["high", "very_high"].includes(renovation)) {
    return "El precio esta por encima de mercado y las fotos sugieren posible necesidad de reforma. Conviene revisar con especial cautela.";
  }
  if (label === "algo_caro" && ["good", "excellent"].includes(condition)) {
    return "El precio esta por encima de la referencia, pero el estado visual podria justificar parte de la prima.";
  }
  if (label === "buen_precio" && renovation === "high") {
    return "El precio parece competitivo, aunque podria reflejar una posible inversion adicional en reforma.";
  }
  if (label === "muy_buen_precio" && condition === "poor") {
    return "El precio es muy bajo frente a mercado, pero las fotos sugieren revisar cuidadosamente el estado del inmueble.";
  }
  if (label === "en_mercado" && condition === "good") {
    return "El precio esta alineado con mercado y el estado visual parece favorable.";
  }
  return photoAssessment.price_interpretation?.message || "";
}

async function buildPhotoConditionAnalysisResponse(input = {}, options = {}) {
  const selection = selectRepresentativeListingImages(input.image_urls || input.imageUrls || [], { limit: DEFAULT_MAX_IMAGES });
  if (!selection.selectedImages.length) {
    return {
      status: 400,
      body: {
        ok: false,
        reason: "no_images",
        message: "No se han detectado fotos suficientes para analizar el estado visual del inmueble."
      }
    };
  }

  const rateKey = hash(options.clientKey || input.session_id || input.user_id || input.listing_url || "anonymous").slice(0, 24);
  const rate = options.skipRateLimit ? { allowed: true } : checkPhotoRateLimit(rateKey);
  if (!rate.allowed) {
    return {
      status: 429,
      body: {
        ok: false,
        reason: "rate_limited",
        message: "Has alcanzado temporalmente el limite de analisis visual. Intentalo mas tarde.",
        rate_limit: rate
      }
    };
  }

  const listingUrlHash = hash(input.listing_url || selection.normalizedSelectedImages.join("|"));
  const imageUrlsHash = hash(selection.normalizedSelectedImages.join("|"));
  const cached = options.skipCache ? null : await getCachedPhotoAnalysis(listingUrlHash, imageUrlsHash);
  if (cached) return { status: 200, body: publicPayload(cached.payload, cached.cache) };

  const model = options.modelResponse
    ? { ok: true, analysis: options.modelResponse, raw: { mocked: true } }
    : await callVisionModel(input, selection.selectedImages, options);

  if (!model.ok) {
    return {
      status: model.reason === "vision_model_not_configured" ? 503 : 502,
      body: {
        ok: false,
        reason: model.reason || "vision_model_error",
        message: "No se ha podido analizar visualmente el inmueble en este momento."
      }
    };
  }

  const analysis = normalizeModelAnalysis(model.analysis, selection.selectedImages.length);
  const combinedMessage = combinePriceAndPhotoAssessment(
    { label: input.price_label || input.market_label || "" },
    analysis
  );
  if (combinedMessage) analysis.price_interpretation.message = combinedMessage;

  const payload = cachePayload(input, analysis, selection.selectedImages, model.raw);
  await setCachedPhotoAnalysis(listingUrlHash, imageUrlsHash, input, payload, options.ttlMs || DEFAULT_TTL_MS);

  return {
    status: 200,
    body: {
      ...publicPayload(payload, { hit: false, layer: "network" }),
      selection: {
        selected_images_count: selection.selectedImages.length,
        discarded_images_count: selection.discardedImages.length,
        reason: selection.selectionReason
      }
    }
  };
}

function clearPhotoAnalysisMemory() {
  memoryCache.clear();
  rateBuckets.clear();
}

module.exports = {
  PHOTO_ANALYSIS_SCHEMA,
  buildPhotoConditionAnalysisResponse,
  checkPhotoRateLimit,
  clearPhotoAnalysisMemory,
  combinePriceAndPhotoAssessment,
  normalizeModelAnalysis,
  selectRepresentativeListingImages
};
