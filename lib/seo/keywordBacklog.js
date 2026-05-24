const SEO_KEYWORD_INTENTS = [
  "saber_si_piso_esta_caro",
  "precio_metro_cuadrado_vivienda",
  "analizar_anuncio_inmobiliario",
  "analizar_piso_antes_de_comprar",
  "comparar_pisos_online",
  "negociar_precio_vivienda",
  "preguntas_antes_de_contactar",
  "extension_chrome_inmobiliaria"
];

const SEO_KEYWORD_STATUSES = ["idea", "brief_ready", "draft", "quality_review", "approved", "rejected", "published"];

const SEO_KEYWORD_PAGE_TYPES = [
  "expensive_listing_city",
  "price_city",
  "editorial_guide",
  "chrome_extension_landing",
  "comparison_guide"
];

const DEFAULT_CREATED_AT = "2026-05-24T00:00:00.000Z";

const SEO_KEYWORD_BACKLOG_SEEDS = [
  {
    id: "seo_kw_001",
    keyword: "saber si un piso esta caro en Madrid",
    intent: "saber_si_piso_esta_caro",
    page_type: "expensive_listing_city",
    city: "Madrid",
    province: "Madrid",
    priority: 94,
    manual_difficulty: "media",
    status: "brief_ready",
    suggested_landing: "/saber-si-piso-esta-caro/madrid/",
    recommended_cta: "Analiza anuncios antes de contactar",
    risk_level: "media",
    risk_notes: "Necesita datos locales suficientes y evitar prometer precio exacto.",
    created_at: DEFAULT_CREATED_AT,
    updated_at: DEFAULT_CREATED_AT
  },
  {
    id: "seo_kw_002",
    keyword: "precio metro cuadrado vivienda Valencia",
    intent: "precio_metro_cuadrado_vivienda",
    page_type: "price_city",
    city: "Valencia",
    province: "Valencia",
    priority: 90,
    manual_difficulty: "media",
    status: "brief_ready",
    suggested_landing: "/precio-metro-cuadrado/valencia/",
    recommended_cta: "Compara el anuncio con InmoRadar",
    risk_level: "media",
    risk_notes: "Debe citar fuente, fecha y nivel geografico.",
    created_at: DEFAULT_CREATED_AT,
    updated_at: DEFAULT_CREATED_AT
  },
  {
    id: "seo_kw_003",
    keyword: "analizar anuncio inmobiliario antes de contactar",
    intent: "analizar_anuncio_inmobiliario",
    page_type: "editorial_guide",
    city: "",
    province: "",
    priority: 88,
    manual_difficulty: "baja",
    status: "brief_ready",
    suggested_landing: "/analizar-anuncio-inmobiliario/",
    recommended_cta: "Instalar InmoRadar para revisar anuncios",
    risk_level: "baja",
    risk_notes: "Debe explicar valor sin sugerir afiliacion con portales.",
    created_at: DEFAULT_CREATED_AT,
    updated_at: DEFAULT_CREATED_AT
  },
  {
    id: "seo_kw_004",
    keyword: "analizar piso antes de comprar",
    intent: "analizar_piso_antes_de_comprar",
    page_type: "editorial_guide",
    city: "",
    province: "",
    priority: 84,
    manual_difficulty: "baja",
    status: "idea",
    suggested_landing: "/guias/analizar-piso-antes-de-comprar/",
    recommended_cta: "Analiza pisos antes de contactar",
    risk_level: "baja",
    risk_notes: "Evitar prometer decision definitiva de compra.",
    created_at: DEFAULT_CREATED_AT,
    updated_at: DEFAULT_CREATED_AT
  },
  {
    id: "seo_kw_005",
    keyword: "comparar pisos online",
    intent: "comparar_pisos_online",
    page_type: "comparison_guide",
    city: "",
    province: "",
    priority: 82,
    manual_difficulty: "media",
    status: "idea",
    suggested_landing: "/guias/comparar-pisos-online/",
    recommended_cta: "Compara anuncios con InmoRadar",
    risk_level: "media",
    risk_notes: "Debe aportar una matriz de comparacion real, no texto generico.",
    created_at: DEFAULT_CREATED_AT,
    updated_at: DEFAULT_CREATED_AT
  },
  {
    id: "seo_kw_006",
    keyword: "negociar precio vivienda",
    intent: "negociar_precio_vivienda",
    page_type: "editorial_guide",
    city: "",
    province: "",
    priority: 78,
    manual_difficulty: "media",
    status: "idea",
    suggested_landing: "/guias/negociar-precio-vivienda/",
    recommended_cta: "Prepara argumentos antes de contactar",
    risk_level: "media",
    risk_notes: "No debe prometer descuentos ni tasacion exacta.",
    created_at: DEFAULT_CREATED_AT,
    updated_at: DEFAULT_CREATED_AT
  },
  {
    id: "seo_kw_007",
    keyword: "preguntas antes de contactar por un piso",
    intent: "preguntas_antes_de_contactar",
    page_type: "editorial_guide",
    city: "",
    province: "",
    priority: 76,
    manual_difficulty: "baja",
    status: "brief_ready",
    suggested_landing: "/guias/preguntas-antes-de-contactar-por-un-piso/",
    recommended_cta: "Genera preguntas utiles con InmoRadar",
    risk_level: "baja",
    risk_notes: "Debe ser practico y accionable.",
    created_at: DEFAULT_CREATED_AT,
    updated_at: DEFAULT_CREATED_AT
  },
  {
    id: "seo_kw_008",
    keyword: "extension chrome inmobiliaria",
    intent: "extension_chrome_inmobiliaria",
    page_type: "chrome_extension_landing",
    city: "",
    province: "",
    priority: 74,
    manual_difficulty: "baja",
    status: "brief_ready",
    suggested_landing: "/extension-chrome-inmobiliaria/",
    recommended_cta: "Instalar extension Chrome",
    risk_level: "baja",
    risk_notes: "Debe hablar de herramienta independiente y no de integracion oficial.",
    created_at: DEFAULT_CREATED_AT,
    updated_at: DEFAULT_CREATED_AT
  },
  {
    id: "seo_kw_009",
    keyword: "precio metro cuadrado vivienda Sevilla",
    intent: "precio_metro_cuadrado_vivienda",
    page_type: "price_city",
    city: "Sevilla",
    province: "Sevilla",
    priority: 72,
    manual_difficulty: "media",
    status: "idea",
    suggested_landing: "/precio-metro-cuadrado/sevilla/",
    recommended_cta: "Compara el anuncio con referencias locales",
    risk_level: "media",
    risk_notes: "Solo avanzar si hay fuente local suficiente.",
    created_at: DEFAULT_CREATED_AT,
    updated_at: DEFAULT_CREATED_AT
  },
  {
    id: "seo_kw_010",
    keyword: "saber si un piso esta caro en Barcelona",
    intent: "saber_si_piso_esta_caro",
    page_type: "expensive_listing_city",
    city: "Barcelona",
    province: "Barcelona",
    priority: 70,
    manual_difficulty: "alta",
    status: "idea",
    suggested_landing: "/saber-si-piso-esta-caro/barcelona/",
    recommended_cta: "Analiza antes de contactar",
    risk_level: "alta",
    risk_notes: "Mercado amplio: evitar pagina generica si no hay datos por zona.",
    created_at: DEFAULT_CREATED_AT,
    updated_at: DEFAULT_CREATED_AT
  },
  {
    id: "seo_kw_011",
    keyword: "comparar precio piso zona",
    intent: "comparar_pisos_online",
    page_type: "editorial_guide",
    city: "",
    province: "",
    priority: 68,
    manual_difficulty: "media",
    status: "idea",
    suggested_landing: "/guias/comparar-precio-piso-zona/",
    recommended_cta: "Revisa precio, zona y senales antes de escribir",
    risk_level: "media",
    risk_notes: "Debe explicar limites de datos por zona.",
    created_at: DEFAULT_CREATED_AT,
    updated_at: DEFAULT_CREATED_AT
  },
  {
    id: "seo_kw_012",
    keyword: "costes ocultos al comprar vivienda",
    intent: "analizar_piso_antes_de_comprar",
    page_type: "editorial_guide",
    city: "",
    province: "",
    priority: 66,
    manual_difficulty: "baja",
    status: "idea",
    suggested_landing: "/guias/costes-ocultos-comprar-vivienda/",
    recommended_cta: "Calcula el coste real antes de contactar",
    risk_level: "baja",
    risk_notes: "Debe ser prudente y no sustituir asesoramiento profesional.",
    created_at: DEFAULT_CREATED_AT,
    updated_at: DEFAULT_CREATED_AT
  }
];

function normalizeKeyword(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function slugPart(value) {
  return normalizeKeyword(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function suggestedLandingFor(item = {}) {
  if (item.suggested_landing) return item.suggested_landing;
  const citySlug = slugPart(item.city);
  if (item.page_type === "price_city" && citySlug) return `/precio-metro-cuadrado/${citySlug}/`;
  if (item.page_type === "expensive_listing_city" && citySlug) return `/saber-si-piso-esta-caro/${citySlug}/`;
  return `/guias/${slugPart(item.keyword)}/`;
}

function normalizeBacklogItem(raw = {}, index = 0) {
  const keyword = String(raw.keyword || "").trim();
  const intent = SEO_KEYWORD_INTENTS.includes(raw.intent) ? raw.intent : "analizar_anuncio_inmobiliario";
  const pageType = SEO_KEYWORD_PAGE_TYPES.includes(raw.page_type) ? raw.page_type : "editorial_guide";
  const status = SEO_KEYWORD_STATUSES.includes(raw.status) ? raw.status : "idea";
  const priority = Math.max(0, Math.min(100, Number(raw.priority ?? raw.search_priority ?? 50)));
  return {
    id: String(raw.id || `seo_kw_custom_${index + 1}`),
    keyword,
    intent,
    page_type: pageType,
    city: String(raw.city || ""),
    province: String(raw.province || ""),
    priority,
    manual_difficulty: String(raw.manual_difficulty || "media"),
    status,
    suggested_landing: suggestedLandingFor(raw),
    recommended_cta: String(raw.recommended_cta || "Analiza pisos antes de contactar"),
    risk_level: String(raw.risk_level || "media"),
    risk_notes: String(raw.risk_notes || "Revisar fuentes, prudencia e independencia antes de generar contenido."),
    created_at: raw.created_at || DEFAULT_CREATED_AT,
    updated_at: raw.updated_at || raw.created_at || DEFAULT_CREATED_AT,
    brief_json: raw.brief_json && typeof raw.brief_json === "object" ? raw.brief_json : null
  };
}

function dedupeBacklogItems(items = []) {
  const seen = new Set();
  const result = [];
  for (const raw of items) {
    const item = normalizeBacklogItem(raw, result.length);
    if (!item.keyword) continue;
    const key = `${normalizeKeyword(item.keyword)}|${item.suggested_landing}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result.sort((a, b) => b.priority - a.priority || a.keyword.localeCompare(b.keyword));
}

function targetUserFor(item) {
  if (item.intent === "extension_chrome_inmobiliaria") return "Usuario que busca una extension independiente para revisar anuncios inmobiliarios en Chrome.";
  if (item.city) return `Persona buscando vivienda en ${item.city} que quiere comparar un anuncio antes de contactar.`;
  return "Usuario que busca vivienda en Espana y quiere reducir riesgo antes de escribir o llamar.";
}

function h1For(item) {
  const citySuffix = item.city ? ` en ${item.city}` : "";
  const map = {
    saber_si_piso_esta_caro: `Como saber si un piso esta caro${citySuffix}`,
    precio_metro_cuadrado_vivienda: `Precio por metro cuadrado de vivienda${citySuffix}`,
    analizar_anuncio_inmobiliario: "Como analizar un anuncio inmobiliario antes de contactar",
    analizar_piso_antes_de_comprar: "Como analizar un piso antes de comprar",
    comparar_pisos_online: "Como comparar pisos online sin perder contexto",
    negociar_precio_vivienda: "Como preparar una negociacion de precio de vivienda",
    preguntas_antes_de_contactar: "Preguntas utiles antes de contactar por un piso",
    extension_chrome_inmobiliaria: "Extension Chrome inmobiliaria para analizar anuncios"
  };
  return map[item.intent] || `Analiza pisos antes de contactar${citySuffix}`;
}

function metaTitleFor(item) {
  return `${h1For(item).slice(0, 54)} | InmoRadar`;
}

function metaDescriptionFor(item) {
  const cityText = item.city ? ` en ${item.city}` : "";
  return `Guia prudente para ${item.keyword}${cityText}: que revisar, que datos hacen falta y como usar InmoRadar antes de contactar.`;
}

function h2StructureFor(item) {
  return [
    "Que quiere resolver esta busqueda",
    item.city ? `Datos minimos para hablar de ${item.city}` : "Datos minimos antes de sacar conclusiones",
    "Senales de riesgo que conviene revisar",
    "Como usar InmoRadar antes de contactar",
    "Limites: referencia orientativa, no tasacion",
    "Preguntas frecuentes"
  ];
}

function requiredSourcesFor(item) {
  if (["price_city", "expensive_listing_city"].includes(item.page_type)) {
    return [
      "Fuente publica de precio por metro cuadrado con fecha visible",
      "Nivel geografico municipio/zona cuando exista",
      "Datos de venta y, si aplica, alquiler para contexto",
      "Fecha de actualizacion y enlace nofollow a fuente"
    ];
  }
  return [
    "Fuentes editoriales propias o datos agregados internos no sensibles",
    "Ejemplos anonimizados sin URL completa ni direccion exacta",
    "Referencia clara a que InmoRadar no sustituye una tasacion"
  ];
}

function qualityGateRequirementsFor(item) {
  return [
    "quality_score >= 80",
    "Al menos 700 palabras utiles",
    "Canonical alineado con slug",
    "CTA medible con data-install-button y data-install-source",
    "Bloque de prudencia: referencia orientativa/no tasacion exacta",
    "Bloque de independencia: sin afiliacion oficial con portales inmobiliarios",
    "FAQ util y enlaces internos",
    "Contenido especifico, no plantilla que solo cambia ciudad",
    item.city ? "Fuente real, fecha y nivel geografico suficiente" : "Ejemplos y consejos propios no genericos"
  ];
}

function buildSeoKeywordBrief(item) {
  const normalized = normalizeBacklogItem(item);
  return {
    id: `${normalized.id}_brief`,
    keyword_id: normalized.id,
    keyword: normalized.keyword,
    search_intent: normalized.intent,
    target_user: targetUserFor(normalized),
    suggested_h1: h1For(normalized),
    suggested_meta_title: metaTitleFor(normalized),
    suggested_meta_description: metaDescriptionFor(normalized),
    h2_structure: h2StructureFor(normalized),
    cta: normalized.recommended_cta,
    recommended_internal_links: [
      "/",
      "/analizar-anuncio-inmobiliario/",
      "/precio-metro-cuadrado/logrono/"
    ],
    prudence_block: "Los datos deben presentarse como referencia orientativa. No es una tasacion, no garantiza el precio real ni sustituye una revision profesional.",
    portal_independence_block: "InmoRadar es una herramienta independiente. No debe sugerir afiliacion oficial con Idealista, Fotocasa, Habitaclia ni otros portales.",
    suggested_faq: [
      `Como puedo usar ${normalized.keyword} sin sacar conclusiones precipitadas?`,
      "Que datos necesito antes de contactar?",
      "InmoRadar da una tasacion exacta?",
      "Que deberia preguntar al anunciante?"
    ],
    risks: [
      normalized.risk_notes,
      "Evitar promesas absolutas como precio real definitivo.",
      "No usar marcas de portales como si hubiera integracion oficial.",
      "No publicar si la futura landing no supera el quality gate."
    ],
    required_sources: requiredSourcesFor(normalized),
    recommended_page_type: normalized.page_type,
    suggested_landing: normalized.suggested_landing,
    quality_gate_requirements: qualityGateRequirementsFor(normalized),
    next_step: "Revisar brief y fuentes antes de generar cualquier landing. Este brief no publica ni indexa contenido."
  };
}

function filterBacklogItems(items = [], filters = {}) {
  const status = String(filters.status || "all");
  const intent = String(filters.intent || "all");
  return dedupeBacklogItems(items).filter((item) => {
    if (status !== "all" && item.status !== status) return false;
    if (intent !== "all" && item.intent !== intent) return false;
    return true;
  });
}

function backlogSummary(items = []) {
  const byStatus = {};
  const byIntent = {};
  for (const item of items) {
    byStatus[item.status] = (byStatus[item.status] || 0) + 1;
    byIntent[item.intent] = (byIntent[item.intent] || 0) + 1;
  }
  return {
    total: items.length,
    by_status: byStatus,
    by_intent: byIntent,
    high_priority: items.filter((item) => item.priority >= 80).length,
    brief_ready: items.filter((item) => item.status === "brief_ready").length
  };
}

function buildSeoKeywordBacklog(rows = SEO_KEYWORD_BACKLOG_SEEDS, filters = {}) {
  const limit = Math.max(1, Math.min(50, Number(filters.limit || 15)));
  const items = filterBacklogItems(rows, filters).slice(0, limit);
  const includeBriefs = filters.include_briefs === true || filters.includeBriefs === true;
  return {
    keywords: includeBriefs ? items.map((item) => ({ ...item, brief: item.brief_json || buildSeoKeywordBrief(item) })) : items,
    summary: backlogSummary(items)
  };
}

function findBacklogItem(rows = SEO_KEYWORD_BACKLOG_SEEDS, input = {}) {
  const items = dedupeBacklogItems(rows);
  const id = String(input.id || input.keyword_id || "").trim();
  const keyword = normalizeKeyword(input.keyword);
  if (id) return items.find((item) => item.id === id) || null;
  if (keyword) return items.find((item) => normalizeKeyword(item.keyword) === keyword) || null;
  return null;
}

module.exports = {
  SEO_KEYWORD_BACKLOG_SEEDS,
  SEO_KEYWORD_INTENTS,
  SEO_KEYWORD_PAGE_TYPES,
  SEO_KEYWORD_STATUSES,
  buildSeoKeywordBacklog,
  buildSeoKeywordBrief,
  dedupeBacklogItems,
  findBacklogItem,
  normalizeBacklogItem,
  normalizeKeyword
};
