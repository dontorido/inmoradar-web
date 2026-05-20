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
    creatorsContacted: 1
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
  return [
    ["keyword_search", "Busca 3 keywords del dia", "Abre las busquedas sugeridas y encuentra conversaciones con intencion.", "high", "easy", 10],
    ["save_videos", "Guarda 5 videos con buen hook", "Pega URLs y anota por que funciona cada formato.", "high", "medium", 20],
    ["comment", "Deja 10 comentarios utiles", "Copia comentarios, revisalos y publicalos manualmente si encajan.", "high", "medium", 25],
    ["follow_accounts", "Sigue 5 cuentas relevantes", "Revisa perfil real antes de seguir. Nada automatico.", "medium", "easy", 12],
    ["hooks", "Anota 3 hooks adaptables", "Convierte observaciones del dia en hooks propios.", "medium", "easy", 10],
    ["outreach", "Contacta 1 creador potencial", "Solo si hay fit y contexto. Copia el mensaje y revisalo.", "medium", "medium", 12],
    ["create_video", "Crea o lanza 1 video propio", "Usa el hook ganador del dia para generar un brief.", "high", "medium", 30]
  ].map(([type, title, description, priority, difficulty, estimatedMinutes]) => ({
    id: id("task", `${type}:${title}`),
    type,
    title,
    description,
    priority,
    difficulty,
    estimatedMinutes,
    status: "pending",
    actionLabel: actionLabelForTask(type),
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
  recordAction,
  recordResult,
  analyzeWeeklyLearning,
  recommendNextActions,
  qualityCheckRoutine
};
