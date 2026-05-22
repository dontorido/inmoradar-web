const crypto = require("node:crypto");
const { generateVideoBrief, analyzePerformance: analyzeVideoPerformance } = require("../social-video/videoStrategyInmoRadar");

const PLATFORMS = Object.freeze(["tiktok", "instagram", "youtube", "linkedin", "x"]);

const DEFAULT_CONFIG = Object.freeze({
  cities: ["Madrid", "Barcelona", "Valencia", "Malaga", "Sevilla", "Bilbao", "Zaragoza", "Alicante"],
  categories: [
    "comprar piso",
    "hipoteca",
    "primera vivienda",
    "barrios",
    "inversion inmobiliaria",
    "errores inmobiliarios",
    "precio metro cuadrado",
    "anuncios inmobiliarios"
  ],
  platforms: PLATFORMS,
  commentTone: "educativo",
  dailyLimits: {
    keywords: 3,
    savedVideos: 5,
    comments: 10,
    follows: 5,
    hooks: 3,
    creatorsContacted: 1,
    realCreators: 5
  }
});

const KEYWORD_LIBRARY = Object.freeze([
  { keyword: "comprar piso", category: "comprar piso", intent: "Usuarios valorando compra de vivienda", type: "core" },
  { keyword: "buscar piso", category: "comprar piso", intent: "Usuarios activos buscando vivienda", type: "core" },
  { keyword: "primera vivienda", category: "primera vivienda", intent: "Compradores primerizos con dudas", type: "pain" },
  { keyword: "errores comprar piso", category: "errores inmobiliarios", intent: "Usuarios buscando consejos antes de comprar", type: "pain" },
  { keyword: "hipoteca", category: "hipoteca", intent: "Conversaciones sobre financiacion", type: "finance" },
  { keyword: "entrada piso", category: "hipoteca", intent: "Dudas sobre coste inicial y ahorros necesarios", type: "finance" },
  { keyword: "precio metro cuadrado", category: "precio metro cuadrado", intent: "Usuarios comparando si una vivienda esta cara", type: "core" },
  { keyword: "idealista piso caro", category: "anuncios inmobiliarios", intent: "Conversaciones sobre anuncios y portales", type: "platform" },
  { keyword: "fotocasa comprar piso", category: "anuncios inmobiliarios", intent: "Usuarios buscando en portales compatibles", type: "platform" },
  { keyword: "piso barato", category: "comprar piso", intent: "Usuarios atraidos por oportunidades aparentes", type: "pain" },
  { keyword: "barrios Madrid vivienda", category: "barrios", intent: "Busqueda local en Madrid", type: "local", city: "Madrid" },
  { keyword: "barrios Barcelona vivienda", category: "barrios", intent: "Busqueda local en Barcelona", type: "local", city: "Barcelona" },
  { keyword: "vivienda Valencia", category: "barrios", intent: "Busqueda local en Valencia", type: "local", city: "Valencia" },
  { keyword: "inversion inmobiliaria", category: "inversion inmobiliaria", intent: "Usuarios comparando rentabilidad y riesgo", type: "finance" },
  { keyword: "chollo inmobiliario", category: "comprar piso", intent: "Conversaciones de oportunidad y sospecha", type: "pain" },
  { keyword: "calcular hipoteca", category: "hipoteca", intent: "Usuarios calculando cuota antes de llamar", type: "finance" },
  { keyword: "cuota hipoteca", category: "hipoteca", intent: "Dudas sobre coste mensual real", type: "finance" },
  { keyword: "antes de visitar piso", category: "comprar piso", intent: "Usuarios preparando visitas", type: "pain" },
  { keyword: "senales de alerta piso", category: "errores inmobiliarios", intent: "Usuarios buscando red flags de anuncios", type: "pain" },
  { keyword: "piso caro o barato", category: "precio metro cuadrado", intent: "Usuarios queriendo comparar precio y zona", type: "core" }
]);

const CREATOR_ARCHETYPES = Object.freeze([
  {
    category: "asesor_hipotecario",
    label: "Asesor hipotecario",
    topics: ["hipoteca", "entrada", "cuota"],
    whyRelevant: "Audiencia preguntando por entrada, cuota e hipoteca antes de comprar.",
    bestCollabIdea: "Analizar 3 pisos antes de pedir hipoteca."
  },
  {
    category: "comprar_piso",
    label: "Creador comprar piso",
    topics: ["comprar piso", "primera vivienda", "visitas"],
    whyRelevant: "Habla con usuarios en busqueda activa y dudas practicas.",
    bestCollabIdea: "Antes de llamar por un piso, revisa estas 5 cosas."
  },
  {
    category: "finanzas_personales",
    label: "Finanzas personales",
    topics: ["ahorro", "hipoteca", "presupuesto"],
    whyRelevant: "Puede conectar coste real de vivienda con decisiones de ahorro.",
    bestCollabIdea: "Cuanto necesitas realmente antes de contactar por una vivienda."
  },
  {
    category: "cuenta_local",
    label: "Cuenta local",
    topics: ["barrios", "transporte", "vivir en ciudad"],
    whyRelevant: "Audiencia local que decide por zona, transporte y servicios.",
    bestCollabIdea: "Merece la pena este piso en la zona."
  },
  {
    category: "inmobiliario_didactico",
    label: "Inmobiliario didactico",
    topics: ["mercado", "anuncios", "visitas"],
    whyRelevant: "Explica mercado sin limitarse a ensenar viviendas.",
    bestCollabIdea: "Analisis de un anuncio antes de contactar."
  },
  {
    category: "arquitecto_tecnico",
    label: "Arquitecto tecnico",
    topics: ["estado vivienda", "reformas", "ITE"],
    whyRelevant: "Complementa el analisis de numeros con senales fisicas de vivienda.",
    bestCollabIdea: "Fotos bonitas, numeros claros y senales tecnicas a revisar."
  },
  {
    category: "abogado_inmobiliario",
    label: "Abogado inmobiliario",
    topics: ["contrato", "arras", "riesgos"],
    whyRelevant: "Su audiencia necesita filtros antes de entrar en fases legales.",
    bestCollabIdea: "Que mirar antes de pedir documentacion."
  },
  {
    category: "inversor_inmobiliario",
    label: "Inversor inmobiliario pequeno",
    topics: ["rentabilidad", "zona", "precio"],
    whyRelevant: "Usa formatos de comparativa y datos, utiles para InmoRadar.",
    bestCollabIdea: "El barato no siempre es la mejor compra."
  },
  {
    category: "reformista",
    label: "Reformista/interiorista",
    topics: ["reforma", "potencial", "costes"],
    whyRelevant: "Analiza viviendas y puede sumar una capa de coste oculto.",
    bestCollabIdea: "Piso barato, reforma cara y datos antes de llamar."
  },
  {
    category: "viral_general",
    label: "Creador viral extrapolable",
    topics: ["hooks", "comparativas", "debate"],
    whyRelevant: "Sus formatos pueden adaptarse a vivienda sin copiar.",
    bestCollabIdea: "A vs B inmobiliario con veredicto prudente."
  }
]);

const COMMENT_TEMPLATES = Object.freeze([
  {
    type: "educational",
    bestFor: "video sobre errores al comprar piso",
    brandMention: false,
    text: "Totalmente. Mucha gente se enamora de las fotos antes de mirar €/m2, entrada estimada y transporte. Ahi suelen aparecer las sorpresas."
  },
  {
    type: "agreement_plus_value",
    bestFor: "video de hipoteca o compra",
    brandMention: false,
    text: "Muy clave. El precio del anuncio es solo la primera capa; antes de llamar conviene mirar cuota, entrada y zona."
  },
  {
    type: "smart_question",
    bestFor: "video comparando pisos",
    brandMention: false,
    text: "¿Tu que priorizarias mas en este caso: precio, transporte o coste inicial?"
  },
  {
    type: "mini_checklist",
    bestFor: "video de checklist inmobiliario",
    brandMention: false,
    text: "Checklist rapido antes de contactar: €/m2, entrada, cuota, transporte, aparcamiento y comparacion con zona."
  },
  {
    type: "soft_counterpoint",
    bestFor: "video de piso barato",
    brandMention: false,
    text: "Puede parecer barato, pero sin comparar €/m2 y entorno es dificil saber si realmente compensa."
  },
  {
    type: "brand_soft",
    bestFor: "video sobre comparar anuncios",
    brandMention: true,
    text: "Esto es justo lo que intentamos resolver con InmoRadar: menos pestanas y mas criterio antes de contactar."
  },
  {
    type: "mortgage_advisor",
    bestFor: "asesor hipotecario",
    brandMention: false,
    text: "Muy importante lo de la entrada. Mucha gente mira el precio del anuncio, pero no calcula ahorro inicial, cuota y gastos antes de llamar."
  },
  {
    type: "local_area",
    bestFor: "video de barrio o ciudad",
    brandMention: false,
    text: "La zona cambia mucho la lectura del anuncio: transporte, aparcamiento y servicios pueden hacer que el precio tenga mas o menos sentido."
  },
  {
    type: "investment",
    bestFor: "video de inversion inmobiliaria",
    brandMention: false,
    text: "En inversion, el precio bajo ayuda, pero la clave esta en comparar zona, demanda, gastos y si el anuncio esta en mercado."
  },
  {
    type: "errors",
    bestFor: "video de errores frecuentes",
    brandMention: true,
    text: "Antes de enamorarte de un piso, pasarlo por una capa de datos tipo InmoRadar puede evitar muchas visitas flojas."
  }
]);

const HOOK_LIBRARY = Object.freeze([
  { hook: "Este piso parece barato... pero espera a ver la entrada.", category: "curiosidad", series: "Pisos que parecen baratos" },
  { hook: "Antes de llamar por un piso, mira esto.", category: "educativo", series: "Antes de llamar" },
  { hook: "Dos pisos por el mismo precio. Uno merece mas la visita.", category: "A vs B", series: "Piso A vs Piso B" },
  { hook: "El anuncio dice oportunidad. Los numeros dicen otra cosa.", category: "polemica suave", series: "¿Chollo o humo?" },
  { hook: "El error es mirar solo el precio.", category: "checklist", series: "Errores buscando piso" },
  { hook: "¿Comprarias este piso si o no?", category: "interaccion", series: "¿Lo visitarias?" },
  { hook: "No todo piso barato es buena compra.", category: "polemica suave", series: "Pisos que parecen baratos" },
  { hook: "Este piso tiene una senal que mucha gente no mira.", category: "curiosidad", series: "¿Chollo o humo?" },
  { hook: "Estoy creando una capa de analisis para Idealista y Fotocasa.", category: "build in public", series: "Build in public" },
  { hook: "Vivir en esta zona cambia la lectura del precio.", category: "local", series: "Barrios y vivienda" }
]);

function id(prefix, seed = "") {
  const base = crypto.createHash("sha1").update(`${prefix}:${seed}:${Date.now()}`).digest("hex").slice(0, 10);
  return `${prefix}_${base}`;
}

function stableIndex(seed, length) {
  if (!length) return 0;
  const hash = crypto.createHash("sha1").update(String(seed || "")).digest("hex");
  return Number.parseInt(hash.slice(0, 8), 16) % length;
}

function pick(list, seed) {
  return list[stableIndex(seed, list.length)] || list[0];
}

function normalizeConfig(config = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...config,
    cities: Array.isArray(config.cities) && config.cities.length ? config.cities : DEFAULT_CONFIG.cities,
    categories: Array.isArray(config.categories) && config.categories.length ? config.categories : DEFAULT_CONFIG.categories,
    platforms: Array.isArray(config.platforms) && config.platforms.length ? config.platforms : DEFAULT_CONFIG.platforms,
    dailyLimits: {
      ...DEFAULT_CONFIG.dailyLimits,
      ...(config.dailyLimits || config.daily_limits || {})
    }
  };
}

function normalizeDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function daysSinceEpoch(date) {
  return Math.floor(new Date(`${normalizeDate(date)}T00:00:00Z`).getTime() / 86400000);
}

function slug(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function searchUrls(keyword) {
  const encoded = encodeURIComponent(keyword);
  const plus = keyword.split(/\s+/).map(encodeURIComponent).join("+");
  return {
    tiktok: `https://www.tiktok.com/search?q=${encoded}`,
    instagram: `https://www.instagram.com/explore/search/keyword/?q=${encoded}`,
    youtube: `https://www.youtube.com/results?search_query=${plus}+shorts`,
    google: `https://www.google.com/search?q=${plus}+site%3Atiktok.com+OR+site%3Ayoutube.com%2Fshorts`,
    linkedin: `https://www.linkedin.com/search/results/content/?keywords=${encoded}`,
    x: `https://x.com/search?q=${encoded}&src=typed_query`
  };
}

function keywordPayload(item, seed, routineId = null) {
  const keyword = item.keyword;
  return {
    id: id("keyword", `${routineId || ""}:${keyword}:${seed}`),
    routineId,
    keyword,
    category: item.category,
    intent: item.intent,
    platforms: ["tiktok", "youtube", "instagram"],
    platformPriority: ["tiktok", "youtube", "instagram"],
    searchUrls: searchUrls(keyword),
    whatToLookFor: [
      "videos con muchas preguntas en comentarios",
      "checklists sobre compra, hipoteca o visitas",
      "creadores respondiendo dudas reales",
      "formatos con hook fuerte adaptable a InmoRadar"
    ],
    suggestedComments: [],
    suggestedHooks: [],
    status: "pending",
    performanceScore: 0,
    notes: ""
  };
}

function recentKeywordSet(history = {}) {
  const rows = Array.isArray(history.keywords) ? history.keywords : [];
  const sevenDaysAgo = Date.now() - 7 * 86400000;
  return new Set(
    rows
      .filter((row) => !row.created_at || new Date(row.created_at).getTime() >= sevenDaysAgo)
      .filter((row) => Number(row.performance_score || row.performanceScore || 0) < 80)
      .map((row) => String(row.keyword || "").toLowerCase())
      .filter(Boolean)
  );
}

function generateKeywordSet(config = {}, history = {}) {
  const normalized = normalizeConfig(config);
  const date = normalizeDate(config.date || new Date());
  const day = daysSinceEpoch(date);
  const recent = recentKeywordSet(history);
  const available = KEYWORD_LIBRARY.filter((item) => !recent.has(item.keyword.toLowerCase()));
  const pool = available.length >= 13 ? available : KEYWORD_LIBRARY;
  const city = normalized.cities[day % normalized.cities.length];
  const localKeyword = pool.find((item) => item.type === "local" && item.city === city) || {
    keyword: `comprar piso ${city}`,
    category: "barrios",
    intent: `Usuarios buscando vivienda en ${city}`,
    type: "local",
    city
  };
  const painKeyword = pick(pool.filter((item) => item.type === "pain"), `${date}:pain`);
  const financeKeyword = day % 2 === 0 ? pick(pool.filter((item) => item.type === "finance"), `${date}:finance`) : null;
  const platformKeyword = day % 3 === 0 ? pick(pool.filter((item) => item.type === "platform"), `${date}:platform`) : null;

  const primarySeeds = [painKeyword, localKeyword, financeKeyword || platformKeyword || pick(pool, `${date}:core`)].filter(Boolean);
  const uniquePrimary = [];
  primarySeeds.forEach((item) => {
    if (!uniquePrimary.find((existing) => existing.keyword === item.keyword)) uniquePrimary.push(item);
  });
  while (uniquePrimary.length < 3) {
    const candidate = pick(pool, `${date}:primary:${uniquePrimary.length}`);
    if (!uniquePrimary.find((item) => item.keyword === candidate.keyword)) uniquePrimary.push(candidate);
  }

  const secondary = [];
  pool.forEach((item) => {
    if (secondary.length >= 10) return;
    if (uniquePrimary.find((primary) => primary.keyword === item.keyword)) return;
    secondary.push(item);
  });

  return {
    primary: uniquePrimary.slice(0, 3).map((item, index) => keywordPayload(item, `${date}:main:${index}`)),
    secondary: secondary.slice(0, 10).map((item, index) => keywordPayload(item, `${date}:secondary:${index}`))
  };
}

function scoreCreator(creator = {}) {
  const topics = Array.isArray(creator.topics) ? creator.topics.map((item) => String(item).toLowerCase()) : [];
  const category = String(creator.category || "").toLowerCase();
  const thematic = Math.min(25, topics.filter((item) => /hipoteca|piso|vivienda|barrio|zona|inmobili/i.test(item)).length * 8 + (category ? 9 : 0));
  const spain = /espana|españa|madrid|barcelona|valencia|malaga|sevilla|bilbao|zaragoza|alicante/i.test(
    `${creator.country || ""} ${creator.city || ""}`
  )
    ? 15
    : 7;
  const comments = Math.min(15, Math.round(Number(creator.avgComments || creator.avg_comments || 0) / 8));
  const collab = /asesor|comprar|finanzas|local|inmobiliario|arquitecto|abogado|inversor/i.test(category) ? 15 : 8;
  const frequencyText = String(creator.postingFrequency || creator.posting_frequency || "");
  const frequency = /3-5|diari|semana|weekly/i.test(frequencyText) ? 10 : 5;
  const followers = Number(creator.followers || 0);
  const views = Number(creator.avgViews || creator.avg_views || 0);
  const engagement = followers ? Math.min(10, Math.round(((Number(creator.avgComments || creator.avg_comments || 0) + views * 0.02) / followers) * 100)) : 6;
  const fit = /hipoteca|piso|vivienda|barrio|zona|anuncio|idealista|fotocasa/i.test(topics.join(" ")) ? 10 : 6;
  let score = thematic + spain + comments + collab + frequency + engagement + fit;
  if (followers && (followers < 5000 || followers > 80000)) score -= 8;
  if (/lujo|corporativo|promocion/i.test(`${creator.topics || ""} ${creator.category || ""}`)) score -= 10;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function creatorCandidateFromArchetype(archetype, keyword, config, index, routineId = null) {
  const city = config.cities[index % config.cities.length];
  const platform = config.platforms[index % config.platforms.length] || "tiktok";
  const handle = `@buscar_${slug(archetype.category)}_${slug(city)}`;
  const creator = {
    id: id("creator", `${routineId || ""}:${archetype.category}:${keyword.keyword}:${index}`),
    routineId,
    name: `Busqueda: ${archetype.label} ${city}`,
    handle,
    platform,
    url: searchUrls(`${archetype.label} ${city}`)[platform] || searchUrls(`${archetype.label} ${city}`).google,
    category: archetype.category,
    city,
    country: "Espana",
    followers: 25000,
    avgViews: 12000,
    avgComments: 80,
    postingFrequency: "3-5/semana",
    topics: Array.from(new Set([...archetype.topics, keyword.keyword])),
    creatorFitScore: 0,
    outreachScore: 0,
    whyRelevant: archetype.whyRelevant,
    bestCollabIdea: archetype.bestCollabIdea,
    recommendedAction: "follow_and_warm_comment",
    status: "suggested",
    notes: "Sugerencia de busqueda. Revisar perfil real antes de seguir o contactar."
  };
  creator.creatorFitScore = scoreCreator(creator);
  creator.outreachScore = Math.min(100, Math.round(creator.creatorFitScore * 0.78 + 14));
  return creator;
}

function findCreatorCandidates(keywords = [], config = {}, integrations = {}) {
  const normalized = normalizeConfig(config);
  const routineId = config.routineId || null;
  const primary = Array.isArray(keywords) && keywords.length ? keywords : generateKeywordSet(normalized).primary;
  const imported = Array.isArray(integrations.creators) ? integrations.creators : [];
  const importedCreators = imported.map((creator, index) => {
    const normalizedCreator = {
      id: creator.id || id("creator", `imported:${index}:${creator.handle || creator.url || ""}`),
      routineId,
      status: creator.status || "suggested",
      recommendedAction: creator.recommendedAction || creator.recommended_action || "review_profile",
      ...creator
    };
    normalizedCreator.creatorFitScore = scoreCreator(normalizedCreator);
    normalizedCreator.outreachScore = Number(normalizedCreator.outreachScore || normalizedCreator.outreach_score || Math.min(100, Math.round(normalizedCreator.creatorFitScore * 0.78 + 12)));
    return normalizedCreator;
  });
  const generated = CREATOR_ARCHETYPES.map((archetype, index) =>
    creatorCandidateFromArchetype(archetype, primary[index % primary.length], normalized, index, routineId)
  );
  return [...importedCreators, ...generated].sort((a, b) => Number(b.creatorFitScore || 0) - Number(a.creatorFitScore || 0));
}

function generateFollowQueue(creators = [], history = {}) {
  const followed = new Set((Array.isArray(history.followedCreators) ? history.followedCreators : []).map((item) => String(item.handle || item).toLowerCase()));
  return creators
    .filter((creator) => !followed.has(String(creator.handle || "").toLowerCase()))
    .sort((a, b) => Number(b.creatorFitScore || 0) - Number(a.creatorFitScore || 0))
    .slice(0, 5)
    .map((creator) => ({
      ...creator,
      queueId: id("follow", `${creator.id}:${creator.handle}`),
      reason: creator.whyRelevant,
      suggestedComment: commentForCreator(creator),
      strategicValue: creator.creatorFitScore >= 78 ? "colaboracion_potencial" : "inspiracion_y_relacion",
      status: "pending",
      followedAt: null
    }));
}

function commentForCreator(creator) {
  if (/hipotec/i.test(creator.category || "")) {
    return "Muy util. La entrada y la cuota real deberian mirarse antes de enamorarse de un anuncio.";
  }
  if (/local|barrio/i.test(creator.category || "")) {
    return "La zona cambia totalmente la lectura del precio: transporte, aparcamiento y servicios pesan mucho.";
  }
  return "Muy buen enfoque. Antes de contactar, comparar precio, zona y coste real suele ahorrar visitas flojas.";
}

function trimComment(text) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= 280) return normalized;
  return `${normalized.slice(0, 276).replace(/\s+\S*$/, "")}...`;
}

function generateDailyComments(keywords = [], creators = [], savedVideos = [], config = {}) {
  const seed = `${normalizeDate(config.date || new Date())}:${keywords.map((item) => item.keyword).join("|")}:${savedVideos.length}`;
  const ordered = COMMENT_TEMPLATES.map((template, index) => ({ ...template, sort: stableIndex(`${seed}:${index}`, 1000) }))
    .sort((a, b) => a.sort - b.sort)
    .slice(0, 10);
  let brandCount = 0;
  const comments = ordered.map((template, index) => {
    const brandMention = template.brandMention && brandCount < 2;
    if (brandMention) brandCount += 1;
    const text = brandMention ? template.text : template.text.replace(/InmoRadar/gi, "una capa de datos");
    return {
      id: id("comment", `${seed}:${index}`),
      routineId: config.routineId || null,
      text: trimComment(text),
      type: template.type,
      bestFor: template.bestFor,
      brandMention,
      risk: brandMention ? "medium" : "low",
      status: "pending",
      copiedAt: null,
      usedOnUrl: null,
      result: {
        likes: null,
        replies: null,
        profileVisits: null
      }
    };
  });
  const questionCount = comments.filter((comment) => /\?/.test(comment.text)).length;
  if (questionCount < 2) {
    const target = comments.find((comment) => !comment.brandMention && comment.type !== "mini_checklist") || comments[0];
    target.type = "smart_question";
    target.text = "¿Que pesaria mas para ti antes de llamar: precio, zona, cuota o transporte?";
    target.bestFor = "video de debate inmobiliario";
  }
  return comments;
}

function generateContextualComments(videoContext = {}) {
  const text = `${videoContext.description || ""} ${videoContext.transcript || ""} ${videoContext.creatorType || ""}`.toLowerCase();
  const isMortgage = /hipoteca|entrada|cuota|financia/.test(text);
  const isLocal = /barrio|zona|ciudad|vivir en|transporte/.test(text);
  const recommendation = /sorteo|meme|humor|politic|irrelevante/.test(text) ? "no_comentar" : "comentar";
  const base = isMortgage
    ? "Muy clave lo de la entrada. Mucha gente mira solo el precio del anuncio, pero antes de llamar deberia calcular entrada, cuota y gastos aproximados."
    : isLocal
      ? "La zona cambia mucho la decision: transporte, ruido, aparcamiento y servicios pueden pesar tanto como el precio."
      : "Buen punto. Antes de contactar por un piso, mirar precio, €/m2, entrada, cuota y entorno ayuda a filtrar mejor.";
  return {
    recommendation,
    comments: [
      { type: "recommended", text: trimComment(base), brandMention: false, risk: "low" },
      { type: "question", text: "¿Tu que mirarias primero aqui: precio, transporte o coste inicial?", brandMention: false, risk: "low" },
      { type: "short", text: "El precio sin contexto se queda corto.", brandMention: false, risk: "low" },
      {
        type: "brand_soft",
        text: "Esto encaja mucho con InmoRadar: analizar antes de contactar, sin depender solo de fotos.",
        brandMention: true,
        risk: "medium"
      },
      { type: "checklist", text: "Checklist rapido: €/m2, entrada, cuota, transporte, parking y comparativa de zona.", brandMention: false, risk: "low" }
    ]
  };
}

function outreachIdeaForCreator(creator = {}) {
  if (/hipotec/i.test(creator.category || "")) return "Antes de pedir hipoteca, analiza bien el anuncio.";
  if (/local|cuenta_local/i.test(creator.category || "")) return `¿Merece la pena este piso en ${creator.city || "tu ciudad"}?`;
  if (/arquitect|reform/i.test(creator.category || "")) return "Fotos bonitas, reforma posible y numeros antes de llamar.";
  if (/abogado/i.test(creator.category || "")) return "Antes de firmar arras, filtra bien el anuncio.";
  return creator.bestCollabIdea || "Analizar 3 anuncios antes de contactar.";
}

function generateOutreachMessage(creator = {}, messageType = "dm") {
  const name = creator.name && !String(creator.name).startsWith("Busqueda:") ? creator.name : creator.handle || "hey";
  const topic = Array.isArray(creator.topics) && creator.topics.length ? creator.topics[0] : "vivienda";
  const idea = outreachIdeaForCreator(creator);
  const cityLine = creator.city ? ` sobre vivir en ${creator.city}` : "";
  const isMortgage = /hipotec/i.test(creator.category || "");
  const intro = isMortgage
    ? `Hey ${name}, me gusta mucho como explicas hipotecas sin complicarlo.`
    : `Hey ${name}, me gusta mucho como explicas ${topic}${cityLine}.`;
  const body =
    "Estoy creando InmoRadar, una herramienta que analiza anuncios inmobiliarios antes de contactar: precio, €/m2, entrada estimada, cuota orientativa, zona, transporte y senales clave.";
  const proposal = `Creo que podriamos hacer un video util tipo: "${idea}"`;
  const close = "Te paso acceso Premium gratis y algunos ejemplos anonimizados si quieres probarlo.";
  return {
    id: id("outreach", `${creator.id || creator.handle || ""}:${messageType}`),
    creatorId: creator.id || null,
    messageType,
    short: `${intro} ${proposal}. ${close}`,
    medium: [intro, "", body, "", proposal, "", close].join("\n"),
    dm: [intro, "", body, "", proposal, "", close].join("\n"),
    email: [`Hola ${name},`, "", body, "", proposal, "", close, "", "Gracias,"].join("\n"),
    collaborationIdea: idea,
    incentive: "Acceso Premium gratis y ejemplos anonimizados.",
    cta: "¿Te apetece probarlo y decirme si te aporta valor?",
    status: "pending"
  };
}

function generateDailyHooks(keywords = [], savedVideos = [], history = {}) {
  const seed = `${keywords.map((item) => item.keyword).join("|")}:${savedVideos.length}:${JSON.stringify(history.hooks || [])}`;
  const interaction = HOOK_LIBRARY.find((hook) => hook.category === "interaccion") || HOOK_LIBRARY[0];
  const rest = HOOK_LIBRARY.filter((hook) => hook.hook !== interaction.hook)
    .map((hook, index) => ({ ...hook, sort: stableIndex(`${seed}:${index}`, 1000) }))
    .sort((a, b) => a.sort - b.sort)
    .slice(0, 2);
  return [interaction, ...rest]
    .map((item, index) => {
      const duration = index === 0 ? 20 : index === 1 ? 35 : 28;
      const brief = generateVideoBriefFromHook({ ...item, suggestedDuration: duration });
      return {
        id: id("hook", `${seed}:${item.hook}`),
        routineId: history.routineId || null,
        hook: item.hook,
        category: item.category,
        series: item.series,
        suggestedDuration: duration,
        suggestedCta: brief.cta,
        overlayExample: brief.overlays[0] || item.hook,
        scriptPreview: brief.script.split("\n").slice(0, 4).join(" "),
        status: "pending",
        performanceScore: 0,
        brief
      };
    });
}

function seriesIdFromName(name) {
  const normalized = slug(name);
  const map = {
    chollo_o_humo: "chollo_o_humo",
    antes_de_llamar: "antes_de_llamar",
    piso_a_vs_piso_b: "piso_a_vs_piso_b",
    analizando_pisos_de_seguidores: "pisos_seguidores",
    errores_buscando_piso: "errores_buscar_piso",
    pisos_que_parecen_baratos: "parecen_baratos",
    lo_visitarias: "lo_visitarias",
    mitos_inmobiliarios: "mitos_inmobiliarios",
    build_in_public: "build_in_public",
    barrios_y_vivienda: "antes_de_llamar",
    hipoteca_y_anuncio: "antes_de_llamar"
  };
  return map[normalized] || "chollo_o_humo";
}

function generateVideoBriefFromHook(hook) {
  const hookText = typeof hook === "string" ? hook : hook.hook;
  const series = typeof hook === "object" ? hook.series : "¿Chollo o humo?";
  return generateVideoBrief({
    seriesId: seriesIdFromName(series),
    platform: "tiktok",
    duration: hook.suggestedDuration || 28,
    objective: "comments_and_installs",
    hook: hookText,
    propertyData: {
      ciudad: "Madrid",
      precio: "dato no disponible",
      metros: "dato no disponible",
      cta: "¿Tu lo visitarias?"
    }
  });
}

function generateVideoBriefFromSavedVideo(video = {}) {
  const original = String(video.hook || video.topic || "video de inspiracion");
  const adaptedHook = /hipoteca/i.test(original)
    ? "Errores antes de llamar por un piso."
    : /barrio|zona/i.test(original)
      ? "Vivir en esta zona cambia la lectura del precio."
      : "Este anuncio parece bueno, pero mira los numeros.";
  return {
    sourceType: "saved_video",
    sourceId: video.id || null,
    adaptationNote: "Adaptacion inspirada en el formato, no copia del contenido original.",
    ...generateVideoBrief({
      seriesId: /hipoteca/i.test(original) ? "antes_de_llamar" : "chollo_o_humo",
      platform: video.platform || "tiktok",
      duration: Number(video.duration || 28),
      hook: adaptedHook,
      propertyData: {
        ciudad: video.city || "Madrid",
        precio: "dato no disponible",
        metros: "dato no disponible"
      }
    })
  };
}

function routineTasks() {
  const taskDefinitions = [
    {
      type: "keyword_search",
      title: "Revisa las 3 keywords del dia",
      description: "El sistema ya te propone las keywords. Abre las busquedas para validar donde hay conversaciones reales y elegir donde comentar.",
      priority: "high",
      difficulty: "easy",
      estimatedMinutes: 10,
      steps: [
        "Abre las 3 keywords sugeridas y mira los primeros resultados recientes.",
        "Prioriza videos con preguntas de gente buscando vivienda, hipoteca, entrada o barrio.",
        "Elige 1 comentario util y 1 idea de video por cada keyword."
      ],
      doneWhen: "Has validado las 3 keywords y sabes en que conversacion concreta vas a participar."
    },
    {
      type: "save_videos",
      title: "Guarda 5 referencias con buen hook",
      description: "Usa las referencias sugeridas o los resultados de las keywords para guardar videos que podamos adaptar sin copiarlos.",
      priority: "high",
      difficulty: "medium",
      estimatedMinutes: 20,
      steps: [
        "Guarda videos con un primer segundo claro: pregunta, conflicto, dato o comparativa.",
        "Anota el hook, el tema y por que funciona: debate, checklist, sorpresa, comparativa o historia.",
        "Escribe la adaptacion InmoRadar: que dato, overlay o veredicto usariamos nosotros."
      ],
      doneWhen: "Tienes 5 referencias guardadas y al menos 1 adaptacion posible para InmoRadar."
    },
    {
      type: "comment",
      title: "Publica 10 comentarios utiles",
      description: "El sistema te prepara comentarios; tu eliges video real, ajustas una frase al contexto y publicas manualmente.",
      priority: "high",
      difficulty: "medium",
      estimatedMinutes: 25,
      steps: [
        "Abre los videos o creadores sugeridos y lee 3-5 comentarios destacados.",
        "Copia una sugerencia, ajusta una frase al contexto y evita sonar a anuncio.",
        "Publica manualmente, guarda la URL y marca el comentario como usado."
      ],
      doneWhen: "Has dejado 10 comentarios revisados, maximo 2 con mencion suave a InmoRadar."
    },
    {
      type: "follow_accounts",
      title: "Revisa 5 cuentas relevantes",
      description: "El sistema te propone cuentas; tu validas el perfil y solo sigues si encaja con vivienda, hipoteca, barrios o compra.",
      priority: "medium",
      difficulty: "easy",
      estimatedMinutes: 12,
      steps: [
        "Abre el perfil y revisa bio, pais, temas y ultimos 5 videos.",
        "Sigue solo si habla de vivienda, hipoteca, barrios, finanzas o busqueda de piso.",
        "Si encaja mucho, deja primero un comentario util antes de pensar en contacto."
      ],
      doneWhen: "Has seguido 5 cuentas estrategicas o descartado las que no encajan."
    },
    {
      type: "hooks",
      title: "Elige 3 hooks adaptables",
      description: "Convierte lo aprendido hoy en hooks propios para videos cortos de InmoRadar.",
      priority: "medium",
      difficulty: "easy",
      estimatedMinutes: 10,
      steps: [
        "Elige 3 patrones vistos hoy: curiosidad, checklist, A vs B, error o debate.",
        "Reescribelos con lenguaje InmoRadar y sin promesas absolutas.",
        "Pulsa Crear video en el hook que mejor encaje para generar un brief."
      ],
      doneWhen: "Tienes 3 hooks listos y 1 candidato claro para video."
    },
    {
      type: "outreach",
      title: "Contacta 1 creador potencial",
      description: "Solo contacta si hay fit real; personaliza el mensaje antes de enviarlo.",
      priority: "medium",
      difficulty: "medium",
      estimatedMinutes: 12,
      steps: [
        "Abre el perfil recomendado y revisa si su audiencia pregunta por vivienda o hipoteca.",
        "Copia el mensaje y cambia la primera frase para mencionar algo concreto del creador.",
        "Envia manualmente o marca como pendiente si hoy conviene calentar antes con comentarios."
      ],
      doneWhen: "Has enviado 1 mensaje personalizado o decidido conscientemente calentar primero."
    },
    {
      type: "create_video",
      title: "Crea o lanza 1 video propio",
      description: "Usa el mejor aprendizaje del dia para crear un brief o pieza lista para publicar.",
      priority: "high",
      difficulty: "medium",
      estimatedMinutes: 30,
      steps: [
        "Elige el hook con mas potencial de comentario o retencion.",
        "Genera el video/brief y revisa que no muestre datos personales ni promesas absolutas.",
        "Deja listo caption, hashtags, CTA y disclaimer antes de publicarlo."
      ],
      doneWhen: "Hay 1 video propio creado, programado o preparado para grabar/publicar."
    }
  ];
  return taskDefinitions.map(({ type, title, description, priority, difficulty, estimatedMinutes, steps, doneWhen }) => ({
    id: id("task", `${type}:${title}`),
    type,
    title,
    description,
    priority,
    difficulty,
    estimatedMinutes,
    status: "pending",
    actionLabel: actionLabelForTask(type),
    steps,
    doneWhen,
    notes: "",
    result: null
  }));
}

function actionLabelForTask(type) {
  const labels = {
    keyword_search: "Abrir busquedas",
    save_videos: "Guardar video",
    comment: "Copiar comentario",
    follow_accounts: "Abrir perfil",
    hooks: "Crear variante",
    outreach: "Copiar mensaje",
    create_video: "Crear video"
  };
  return labels[type] || "Revisar";
}

function routineTheme(keywordSet, date) {
  const primary = keywordSet.primary[0]?.keyword || "antes de llamar por un piso";
  const themes = {
    "errores comprar piso": "Antes de llamar por un piso",
    "antes de visitar piso": "Checklist antes de visitar",
    "entrada piso": "Coste real antes de contactar",
    hipoteca: "Hipoteca y anuncio",
    "precio metro cuadrado": "Piso caro o barato"
  };
  return themes[primary] || `Radar diario: ${primary}`;
}

function generateDailyRoutine(date = new Date(), config = {}, history = {}) {
  const normalized = normalizeConfig({ ...config, date });
  const routineDate = normalizeDate(date);
  const routineId = id("routine", routineDate);
  const keywordSet = generateKeywordSet({ ...normalized, date: routineDate }, history);
  const keywords = [...keywordSet.primary, ...keywordSet.secondary].map((keyword) => ({ ...keyword, routineId }));
  const creators = findCreatorCandidates(keywordSet.primary, { ...normalized, routineId }, history.integrations || {});
  const followQueue = generateFollowQueue(creators, history).map((creator) => ({ ...creator, routineId }));
  const comments = generateDailyComments(keywordSet.primary, creators, history.savedVideos || [], { ...normalized, routineId, date: routineDate });
  const hooks = generateDailyHooks(keywordSet.primary, history.savedVideos || [], { ...history, routineId });
  const creatorToContact = creators.find((creator) => creator.outreachScore >= 75) || creators[0] || null;
  const outreachMessage = creatorToContact ? generateOutreachMessage(creatorToContact, "dm") : null;
  const theme = routineTheme(keywordSet, routineDate);
  const tasks = routineTasks();
  return {
    id: routineId,
    date: routineDate,
    theme,
    dailyGoal: `Encontrar conversaciones sobre "${keywordSet.primary[0].keyword}" y convertirlas en comentarios, hooks y un video propio sin hacer spam.`,
    status: "pending",
    completionRate: 0,
    ethicalGuardrails: [
      "No seguir automaticamente.",
      "No publicar comentarios automaticamente.",
      "No enviar mensajes privados automaticamente.",
      "Revisar cada accion antes de ejecutarla.",
      "Usar datos oficiales o enlaces de busqueda manual cuando no haya API."
    ],
    keywords,
    primaryKeywords: keywordSet.primary.map((keyword) => ({ ...keyword, routineId })),
    secondaryKeywords: keywordSet.secondary.map((keyword) => ({ ...keyword, routineId })),
    creators,
    comments,
    followQueue,
    hooks,
    creatorToContact,
    outreachMessage,
    savedVideos: Array.from({ length: normalized.dailyLimits.savedVideos }, (_, index) => ({
      id: id("saved_video_slot", `${routineId}:${index}`),
      routineId,
      platform: normalized.platforms[index % normalized.platforms.length],
      url: "",
      creatorHandle: "",
      topic: "",
      hook: "",
      duration: null,
      likes: null,
      comments: null,
      shares: null,
      whyItWorks: "",
      adaptationIdea: "",
      status: "pending",
      notes: ""
    })),
    videoBrief: hooks[0]?.brief || null,
    tasks,
    qualityCheck: qualityCheckRoutine({
      primaryKeywords: keywordSet.primary,
      comments,
      followQueue,
      hooks,
      creatorToContact,
      tasks
    })
  };
}

function qualityCheckRoutine(routine) {
  const comments = routine.comments || [];
  return {
    exactly_3_primary_keywords: (routine.primaryKeywords || []).length === 3,
    exactly_10_comments: comments.length === 10,
    exactly_5_follow_suggestions: (routine.followQueue || []).length === 5,
    exactly_3_hooks: (routine.hooks || []).length === 3,
    exactly_1_creator_to_contact: Boolean(routine.creatorToContact),
    max_2_brand_comments: comments.filter((comment) => comment.brandMention).length <= 2,
    at_least_4_pure_value_comments: comments.filter((comment) => !comment.brandMention).length >= 4,
    at_least_1_local_keyword: (routine.primaryKeywords || []).some((keyword) => keyword.category === "barrios"),
    at_least_1_interaction_hook: (routine.hooks || []).some((hook) => /interaccion|A vs B|curiosidad/i.test(hook.category)),
    at_least_1_question_comment: comments.some((comment) => /\?/.test(comment.text)),
    at_least_2_question_comments: comments.filter((comment) => /\?/.test(comment.text)).length >= 2,
    at_least_1_checklist_comment: comments.some((comment) => /checklist/i.test(comment.type) || /checklist/i.test(comment.text)),
    human_review_required: true,
    no_auto_publish: true
  };
}

function normalizePlatform(value) {
  const platform = String(value || "").trim().toLowerCase();
  return PLATFORMS.includes(platform) ? platform : "tiktok";
}

function normalizeTopics(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 12);
  return String(value || "")
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function normalizeRealCreator(creator = {}, index = 0) {
  const platform = normalizePlatform(creator.platform);
  const handle = String(creator.handle || "").trim();
  const profileUrl = String(creator.profileUrl || creator.profile_url || creator.url || "").trim();
  const displayName = String(creator.displayName || creator.display_name || creator.name || handle || "").trim();
  const normalized = {
    id: creator.id || id("creator", `${platform}:${handle || profileUrl}:${index}`),
    platform,
    handle,
    displayName,
    name: displayName,
    profileUrl,
    url: profileUrl,
    category: String(creator.category || "viral_general").trim() || "viral_general",
    city: String(creator.city || "").trim(),
    country: String(creator.country || "Espana").trim() || "Espana",
    topics: normalizeTopics(creator.topics),
    followers: Number(creator.followers ?? creator.followers_count ?? 0) || 0,
    avgViews: Number(creator.avgViews ?? creator.avg_views ?? 0) || 0,
    avgComments: Number(creator.avgComments ?? creator.avg_comments ?? 0) || 0,
    postingFrequency: String(creator.postingFrequency || creator.posting_frequency || "").trim(),
    notes: String(creator.notes || "").trim(),
    status: String(creator.status || "reviewed").trim() || "reviewed"
  };
  normalized.creatorFitScore = Number(creator.creatorFitScore ?? creator.creator_fit_score ?? scoreCreator(normalized));
  normalized.outreachScore = Number(
    creator.outreachScore ?? creator.outreach_score ?? Math.min(100, Math.round(normalized.creatorFitScore * 0.78 + 12))
  );
  normalized.whyRelevant = creator.whyRelevant || creator.why_relevant || whyRealCreator(normalized);
  normalized.bestCollabIdea = creator.bestCollabIdea || creator.best_collab_idea || outreachIdeaForCreator(normalized);
  normalized.recommendedAction = creator.recommendedAction || creator.recommended_action || "review_profile";
  return normalized;
}

function creatorLastAction(creator, actions = [], actionTypes = []) {
  const ids = new Set([creator.id, creator.handle].filter(Boolean).map((value) => String(value).toLowerCase()));
  return actions
    .filter((action) => {
      const creatorId = String(action.creatorId || action.creator_id || action.entityId || action.entity_id || "").toLowerCase();
      const type = String(action.actionType || action.action_type || "").toLowerCase();
      return ids.has(creatorId) && (!actionTypes.length || actionTypes.includes(type));
    })
    .sort((a, b) => new Date(b.actionDate || b.action_date || b.created_at || 0) - new Date(a.actionDate || a.action_date || a.created_at || 0))[0];
}

function daysSinceAction(action, date = new Date()) {
  if (!action) return Infinity;
  const actionDate = new Date(action.actionDate || action.action_date || action.created_at || action.updated_at || 0);
  const targetDate = new Date(`${normalizeDate(date)}T00:00:00Z`);
  if (Number.isNaN(actionDate.getTime())) return Infinity;
  return Math.floor((targetDate.getTime() - actionDate.getTime()) / 86400000);
}

function realCreatorPriorityScore(creator = {}, actions = [], date = new Date()) {
  const normalized = normalizeRealCreator(creator);
  const platformRank = { tiktok: 18, instagram: 15, youtube: 12, linkedin: 8, x: 5 };
  const categoryBoost = /hipotec|comprar|finanzas|local|barrio|inmobiliario|reform|arquitect|abogado|inversor/i.test(normalized.category)
    ? 18
    : 8;
  const topicBoost = Math.min(18, normalizeTopics(normalized.topics).filter((topic) => /hipoteca|piso|vivienda|barrio|zona|reforma|finanza|anuncio/i.test(topic)).length * 5);
  const locationBoost = /espana|madrid|barcelona|valencia|malaga|sevilla|bilbao|zaragoza|alicante/i.test(`${normalized.country} ${normalized.city}`) ? 14 : 5;
  const engagementBoost = Math.min(14, Math.round(Number(normalized.avgComments || 0) / 8) + Math.round(Number(normalized.avgViews || 0) / 12000));
  let score = platformRank[normalized.platform] + categoryBoost + topicBoost + locationBoost + engagementBoost + Math.round((normalized.creatorFitScore || 0) * 0.22);
  const followers = Number(normalized.followers || 0);
  if (followers && followers < 1000) score -= 8;
  if (followers && followers > 150000) score -= 14;
  if (/generico|humor|lujo|corporativo|agencia/i.test(`${normalized.category} ${normalized.notes} ${normalized.topics.join(" ")}`)) score -= 10;
  const recentContact = creatorLastAction(normalized, actions, ["dm_sent", "contacted"]);
  const recentComment = creatorLastAction(normalized, actions, ["commented", "used", "warm_commented"]);
  if (daysSinceAction(recentContact, date) <= 21) score -= 35;
  if (daysSinceAction(recentComment, date) <= 7) score -= 16;
  const creatorActions = (Array.isArray(actions) ? actions : []).filter((action) => {
    const actionCreatorId = String(action.creatorId || action.creator_id || "").toLowerCase();
    return actionCreatorId && [normalized.id, normalized.handle].filter(Boolean).map((item) => String(item).toLowerCase()).includes(actionCreatorId);
  });
  const historicalScore = averageScore(creatorActions);
  if (creatorActions.length >= 2 && historicalScore >= 35) score += 10;
  if (creatorActions.length >= 3 && historicalScore <= 8) score -= 18;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function whyRealCreator(creator = {}) {
  const topics = normalizeTopics(creator.topics).slice(0, 3).join(", ") || "vivienda";
  const city = creator.city ? ` en ${creator.city}` : "";
  const platform = platformLabelForEngine(creator.platform);
  return `Cuenta real de ${platform}${city} con encaje en ${topics}; revisala manualmente antes de comentar o contactar.`;
}

function platformLabelForEngine(value) {
  const labels = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube", linkedin: "LinkedIn", x: "X" };
  return labels[normalizePlatform(value)] || "TikTok";
}

function realCreatorLookFor(creator = {}) {
  if (/hipotec|finanzas/i.test(creator.category || "")) {
    return "Busca videos recientes sobre entrada, cuota, ahorro inicial o errores antes de pedir hipoteca.";
  }
  if (/local|barrio/i.test(creator.category || "")) {
    return "Busca posts sobre barrios, transporte, zonas concretas o vivir en la ciudad.";
  }
  if (/reform|arquitect/i.test(creator.category || "")) {
    return "Busca analisis de viviendas, reformas, estado del inmueble o costes ocultos.";
  }
  return "Busca videos con dudas reales sobre comprar piso, comparar anuncios o decidir antes de llamar.";
}

function realCreatorComment(creator = {}, index = 0) {
  if (/hipotec|finanzas/i.test(creator.category || "")) {
    return trimComment("Muy clave. Mucha gente mira solo el precio del anuncio, pero antes de llamar conviene calcular entrada, cuota y gastos aproximados.");
  }
  if (/local|barrio/i.test(creator.category || "")) {
    return trimComment("La zona cambia mucho la lectura de un anuncio: transporte, aparcamiento, ruido y servicios pueden pesar tanto como el precio.");
  }
  if (/reform|arquitect/i.test(creator.category || "")) {
    return trimComment("Las fotos pueden enamorar, pero el coste real tambien esta en estado, reforma, comunidad y contexto de zona.");
  }
  if (index === 0) {
    return trimComment("Antes de contactar por un piso, comparar precio, €/m2, entrada, cuota y entorno suele ahorrar visitas flojas.");
  }
  return trimComment("Buen enfoque. El anuncio enseña una parte; los numeros y la zona suelen contar la otra.");
}

function realCreatorRecommendedAction(creator, actions = [], date = new Date(), score = 0) {
  if (daysSinceAction(creatorLastAction(creator, actions, ["dm_sent", "contacted"]), date) <= 21) return "comment";
  if (score >= 82 && daysSinceAction(creatorLastAction(creator, actions, ["commented", "warm_commented", "used"]), date) <= 14) return "dm";
  if (score >= 70) return "comment";
  if (creator.status === "suggested") return "review_profile";
  return "follow";
}

function generateDailyCreatorPlan(creators = [], actions = [], date = new Date(), config = {}) {
  const normalizedConfig = normalizeConfig(config);
  const limit = Math.max(1, Math.min(20, Number(normalizedConfig.dailyLimits.realCreators || normalizedConfig.dailyLimits.follows || 5)));
  const normalizedCreators = (Array.isArray(creators) ? creators : [])
    .map(normalizeRealCreator)
    .filter((creator) => !["paused", "archived", "rejected", "skipped"].includes(String(creator.status || "").toLowerCase()))
    .filter((creator) => creator.handle || creator.profileUrl);
  return normalizedCreators
    .map((creator, index) => {
      const priorityScore = realCreatorPriorityScore(creator, actions, date);
      const recommendedAction = realCreatorRecommendedAction(creator, actions, date, priorityScore);
      const suggestedDm = generateOutreachMessage(creator, "dm").dm;
      return {
        id: id("creator_plan", `${normalizeDate(date)}:${creator.id}:${recommendedAction}`),
        creatorId: creator.id,
        platform: creator.platform,
        handle: creator.handle,
        displayName: creator.displayName || creator.name || creator.handle,
        profileUrl: creator.profileUrl || creator.url,
        category: creator.category,
        priorityScore,
        whyThisCreator: creator.whyRelevant || whyRealCreator(creator),
        whatToLookFor: realCreatorLookFor(creator),
        suggestedComment: realCreatorComment(creator, index),
        suggestedDm,
        recommendedAction,
        risk: recommendedAction === "dm" ? "medium" : "low",
        status: "pending"
      };
    })
    .filter((item) => item.priorityScore >= 25)
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, limit);
}

function normalizeViralAction(action = {}) {
  const actionType = String(action.actionType || action.action_type || "reviewed").trim() || "reviewed";
  const actionDate = normalizeDate(action.actionDate || action.action_date || new Date());
  const creatorId = String(action.creatorId || action.creator_id || action.entityId || action.entity_id || "").trim() || null;
  return {
    id: action.id || id("viral_action", `${creatorId || "none"}:${actionType}:${actionDate}:${action.targetUrl || action.target_url || ""}`),
    creatorId,
    actionDate,
    platform: normalizePlatform(action.platform),
    actionType,
    targetUrl: String(action.targetUrl || action.target_url || action.url || "").trim(),
    suggestedComment: String(action.suggestedComment || action.suggested_comment || "").trim(),
    usedComment: String(action.usedComment || action.used_comment || "").trim(),
    suggestedDm: String(action.suggestedDm || action.suggested_dm || "").trim(),
    usedDm: String(action.usedDm || action.used_dm || "").trim(),
    status: String(action.status || "completed").trim() || "completed",
    likesCount: Number(action.likesCount ?? action.likes_count ?? action.likes ?? 0) || 0,
    repliesCount: Number(action.repliesCount ?? action.replies_count ?? action.replies ?? 0) || 0,
    profileVisits: Number(action.profileVisits ?? action.profile_visits ?? 0) || 0,
    installsAttributed: Number(action.installsAttributed ?? action.installs_attributed ?? 0) || 0,
    notes: String(action.notes || "").trim()
  };
}
function metricNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function detectViralCommentType(action = {}) {
  const normalized = normalizeViralAction(action);
  const text = `${normalized.usedComment || ""} ${normalized.suggestedComment || ""}`.toLowerCase();
  if (/dm|message|contact/i.test(normalized.actionType) || normalized.usedDm || normalized.suggestedDm) return "dm";
  if (/inmoradar|marca|brand/.test(text)) return "brand_soft";
  if (/checklist|uno:|dos:|tres:|antes de contactar/.test(text)) return "checklist";
  if (/\?/.test(text)) return "question";
  if (/totalmente|muy clave|conviene|importante|mucha gente/.test(text)) return "educational";
  return "other";
}

function calculateViralActionPerformanceScore(action = {}) {
  const normalized = normalizeViralAction(action);
  const likes = metricNumber(normalized.likesCount);
  const replies = metricNumber(normalized.repliesCount);
  const profileVisits = metricNumber(normalized.profileVisits);
  const installs = metricNumber(normalized.installsAttributed);
  const actionType = String(normalized.actionType || "").toLowerCase();
  const status = String(normalized.status || "").toLowerCase();
  let score = 0;
  score += Math.min(20, likes * 1);
  score += Math.min(24, profileVisits * 3);
  score += Math.min(40, replies * 8);
  score += Math.min(80, installs * 25);
  if (/dm|contact/.test(actionType) && replies > 0) score += 10;
  if (["replied", "collaboration_agreed"].includes(status)) score += 16;
  if (["skipped", "discarded", "archived"].includes(status)) score -= 8;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function averageScore(items = []) {
  const scores = items.map((item) => calculateViralActionPerformanceScore(item));
  if (!scores.length) return 0;
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

function latestActionDate(actions = []) {
  return actions
    .map((action) => action.actionDate || action.action_date || action.created_at || action.updated_at || "")
    .filter(Boolean)
    .sort()
    .pop() || null;
}

function sumActionMetric(actions = [], field) {
  return actions.reduce((sum, action) => {
    const normalized = normalizeViralAction(action);
    return sum + metricNumber(normalized[field]);
  }, 0);
}

function actionsSince(actions = [], days = 7, now = new Date()) {
  const cutoff = new Date(now).getTime() - days * 86400000;
  return actions.filter((action) => {
    const value = action.actionDate || action.action_date || action.created_at || action.updated_at;
    const time = new Date(value || 0).getTime();
    return Number.isFinite(time) && time >= cutoff;
  });
}

function buildCreatorIndex(creators = []) {
  const index = new Map();
  (Array.isArray(creators) ? creators : []).map(normalizeRealCreator).forEach((creator) => {
    [creator.id, creator.handle].filter(Boolean).forEach((key) => index.set(String(key).toLowerCase(), creator));
  });
  return index;
}

function summarizeViralCreatorPerformance(creators = [], actions = []) {
  const creatorIndex = buildCreatorIndex(creators);
  const groups = new Map();
  (Array.isArray(actions) ? actions : []).map(normalizeViralAction).forEach((action) => {
    const key = String(action.creatorId || "unknown").toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(action);
  });
  return Array.from(groups.entries())
    .map(([key, rows]) => {
      const creator = creatorIndex.get(key) || {};
      return {
        creatorId: key === "unknown" ? null : key,
        handle: creator.handle || key,
        displayName: creator.displayName || creator.name || creator.handle || key,
        platform: creator.platform || rows[0]?.platform || "tiktok",
        category: creator.category || "unknown",
        actions: rows.length,
        likes: sumActionMetric(rows, "likesCount"),
        replies: sumActionMetric(rows, "repliesCount"),
        profileVisits: sumActionMetric(rows, "profileVisits"),
        installsAttributed: sumActionMetric(rows, "installsAttributed"),
        averageScore: averageScore(rows),
        lastActionDate: latestActionDate(rows)
      };
    })
    .sort((a, b) => b.averageScore - a.averageScore || b.replies - a.replies || b.installsAttributed - a.installsAttributed);
}

function summarizeViralGroupPerformance(actions = [], groupBy = "platform") {
  const groups = new Map();
  (Array.isArray(actions) ? actions : []).map(normalizeViralAction).forEach((action) => {
    const key = groupBy === "commentType" ? detectViralCommentType(action) : String(action[groupBy] || "unknown").toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(action);
  });
  return Array.from(groups.entries())
    .map(([key, rows]) => ({
      key,
      label: key,
      actions: rows.length,
      likes: sumActionMetric(rows, "likesCount"),
      replies: sumActionMetric(rows, "repliesCount"),
      profileVisits: sumActionMetric(rows, "profileVisits"),
      installsAttributed: sumActionMetric(rows, "installsAttributed"),
      averageScore: averageScore(rows),
      lastActionDate: latestActionDate(rows)
    }))
    .sort((a, b) => b.averageScore - a.averageScore || b.replies - a.replies || b.installsAttributed - a.installsAttributed);
}

function generateViralizaPerformanceRecommendations(report = {}) {
  const recommendations = [];
  const bestCreator = report.topCreators?.[0];
  const bestPlatform = report.topPlatforms?.[0];
  const bestCommentType = report.topCommentTypes?.[0];
  const weakBrand = (report.topCommentTypes || []).find((item) => item.key === "brand_soft" && item.actions >= 2 && item.averageScore < report.summary.averageScore);
  if (bestCreator && bestCreator.averageScore >= 35) {
    recommendations.push(`Repetir interacciones con ${bestCreator.handle}: esta cuenta esta por encima de la media.`);
  }
  if (bestPlatform && bestPlatform.actions >= 2) {
    recommendations.push(`Priorizar ${bestPlatform.label}: concentra el mejor rendimiento reciente.`);
  }
  if (bestCommentType && bestCommentType.actions >= 2) {
    recommendations.push(`Probar mas comentarios tipo ${bestCommentType.label}; estan generando mejor senal.`);
  }
  if (weakBrand) {
    recommendations.push("Reducir menciones directas a InmoRadar en primera interaccion y aportar valor antes de nombrar la marca.");
  }
  if (!report.summary.actionsLast7Days) {
    recommendations.push("Registrar resultados esta semana para que el motor pueda aprender con datos reales.");
  }
  if (!recommendations.length) {
    recommendations.push("Mantener el plan diario y comparar comentarios tipo pregunta frente a checklist durante una semana.");
  }
  return recommendations;
}

function buildViralizaPerformanceReport(creators = [], actions = [], options = {}) {
  const normalizedActions = (Array.isArray(actions) ? actions : []).map(normalizeViralAction);
  const recentActions = actionsSince(normalizedActions, options.days || 7, options.now || new Date());
  const targetActions = options.recentOnly === false ? normalizedActions : recentActions;
  const summary = {
    totalActions: normalizedActions.length,
    actionsLast7Days: recentActions.length,
    likes: sumActionMetric(targetActions, "likesCount"),
    replies: sumActionMetric(targetActions, "repliesCount"),
    profileVisits: sumActionMetric(targetActions, "profileVisits"),
    installsAttributed: sumActionMetric(targetActions, "installsAttributed"),
    averageScore: averageScore(targetActions),
    noAutoPublish: true,
    humanInTheLoop: true
  };
  const report = {
    summary,
    topCreators: summarizeViralCreatorPerformance(creators, targetActions).slice(0, 8),
    topPlatforms: summarizeViralGroupPerformance(targetActions, "platform").slice(0, 5),
    topCommentTypes: summarizeViralGroupPerformance(targetActions, "commentType").slice(0, 6),
    recentActions: targetActions.slice(0, 20).map((action) => ({
      ...action,
      commentType: detectViralCommentType(action),
      performanceScore: calculateViralActionPerformanceScore(action)
    }))
  };
  report.recommendations = generateViralizaPerformanceRecommendations(report);
  return report;
}

function analyzeViralizaLearning(dateRange = {}, data = {}) {
  const creators = Array.isArray(data.creators) ? data.creators : [];
  const actions = Array.isArray(data.actions) ? data.actions : [];
  const performance = buildViralizaPerformanceReport(creators, actions, { recentOnly: false });
  const winners = [
    ...performance.topCreators.filter((item) => item.averageScore >= 40).slice(0, 3).map((item) => ({ type: "creator", ...item })),
    ...performance.topPlatforms.filter((item) => item.averageScore >= 35).slice(0, 2).map((item) => ({ type: "platform", ...item })),
    ...performance.topCommentTypes.filter((item) => item.averageScore >= 35).slice(0, 2).map((item) => ({ type: "comment_type", ...item }))
  ];
  const losers = performance.topCreators
    .filter((item) => item.actions >= 3 && item.averageScore <= 8 && !item.replies && !item.installsAttributed)
    .slice(0, 5)
    .map((item) => ({ type: "creator", ...item }));
  const insights = [];
  if (performance.summary.replies) insights.push(`${performance.summary.replies} respuestas registradas en el periodo.`);
  if (performance.summary.installsAttributed) insights.push(`${performance.summary.installsAttributed} instalaciones atribuidas manualmente.`);
  if (performance.topPlatforms[0]) insights.push(`${performance.topPlatforms[0].label} es la plataforma con mejor score medio.`);
  if (performance.topCommentTypes[0]) insights.push(`El formato ${performance.topCommentTypes[0].label} es el comentario con mejor senal.`);
  if (!insights.length) insights.push("Aun faltan resultados manuales para detectar patrones fiables.");
  return {
    dateRange,
    performance,
    winners,
    losers,
    insights,
    nextActions: generateViralizaPerformanceRecommendations(performance)
  };
}
function recordAction(action = {}) {
  return {
    id: id("action", `${action.entityType || action.type}:${action.entityId || ""}`),
    entityType: action.entityType || action.type || "unknown",
    entityId: action.entityId || null,
    actionType: action.actionType || action.action || "manual_review",
    status: action.status || "completed",
    url: action.url || action.usedOnUrl || null,
    notes: action.notes || "",
    recordedAt: new Date().toISOString()
  };
}

function recordResult(entity = {}, metrics = {}) {
  return Object.entries(metrics).map(([metricName, metricValue]) => ({
    id: id("result", `${entity.entityType || entity.type}:${entity.id}:${metricName}`),
    entityType: entity.entityType || entity.type || "unknown",
    entityId: entity.id || entity.entityId || null,
    metricName,
    metricValue: Number(metricValue) || 0,
    recordedAt: new Date().toISOString()
  }));
}

function classifyMetricSet(metrics = {}) {
  const video = analyzeVideoPerformance(metrics);
  if (video.classification === "winner") return "winner";
  if (video.classification === "promising") return "promising";
  if (video.classification === "weak") return "weak";
  return "average";
}

function analyzeWeeklyLearning(dateRange = {}, data = {}) {
  const videos = Array.isArray(data.videos) ? data.videos : [];
  const comments = Array.isArray(data.comments) ? data.comments : [];
  const creators = Array.isArray(data.creators) ? data.creators : [];
  const hooks = Array.isArray(data.hooks) ? data.hooks : [];
  const keywords = Array.isArray(data.keywords) ? data.keywords : [];
  const winners = videos.filter((video) => classifyMetricSet(video.metrics || video) === "winner");
  const commentWinners = comments.filter((comment) => Number(comment.resultReplies || comment.result_replies || 0) > 0);
  const creatorReplies = creators.filter((creator) => ["replied", "collaboration_agreed"].includes(String(creator.status || "")));
  return {
    dateRange,
    bestKeywords: keywords.sort((a, b) => Number(b.performanceScore || b.performance_score || 0) - Number(a.performanceScore || a.performance_score || 0)).slice(0, 5),
    bestHooks: hooks.sort((a, b) => Number(b.performanceScore || b.performance_score || 0) - Number(a.performanceScore || a.performance_score || 0)).slice(0, 5),
    bestCommentTypes: commentWinners.map((comment) => comment.type).slice(0, 5),
    bestCreatorCategories: creatorReplies.map((creator) => creator.category).slice(0, 5),
    bestVideos: winners,
    classifications: {
      winner: winners.length,
      promising: videos.filter((video) => classifyMetricSet(video.metrics || video) === "promising").length,
      average: videos.filter((video) => classifyMetricSet(video.metrics || video) === "average").length,
      weak: videos.filter((video) => classifyMetricSet(video.metrics || video) === "weak").length
    }
  };
}

function recommendNextActions(learningReport = {}) {
  const actions = [];
  if ((learningReport.bestHooks || []).length) actions.push("Si un hook gana, crear 10 variaciones con ciudad o coste distinto.");
  if ((learningReport.bestKeywords || []).length) actions.push("Repetir la mejor keyword con otra ciudad prioritaria.");
  if ((learningReport.bestCommentTypes || []).length) actions.push("Convertir el comentario con respuestas en plantilla derivada.");
  if ((learningReport.bestCreatorCategories || []).length) actions.push("Mover creadores que responden al pipeline de colaboracion.");
  if ((learningReport.bestVideos || []).length) actions.push("Priorizar el formato ganador en el generador de videos.");
  if (!actions.length) actions.push("Cambiar hooks de apertura y buscar mas conversaciones con dolor explicito.");
  return actions;
}

module.exports = {
  DEFAULT_CONFIG,
  PLATFORMS,
  generateDailyRoutine,
  generateKeywordSet,
  findCreatorCandidates,
  scoreCreator,
  generateFollowQueue,
  generateDailyComments,
  generateContextualComments,
  generateOutreachMessage,
  generateDailyHooks,
  generateVideoBriefFromHook,
  generateVideoBriefFromSavedVideo,
  normalizeRealCreator,
  generateDailyCreatorPlan,
  normalizeViralAction,
  calculateViralActionPerformanceScore,
  detectViralCommentType,
  buildViralizaPerformanceReport,
  analyzeViralizaLearning,
  realCreatorPriorityScore,
  recordAction,
  recordResult,
  analyzeWeeklyLearning,
  recommendNextActions,
  qualityCheckRoutine
};
