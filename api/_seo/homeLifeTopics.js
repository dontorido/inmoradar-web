const { hasSupabaseConfig, supabaseFetch } = require("../_utils");

const SEO_HOME_TOPIC_CONFIRMATION = "SEED_SEO_HOME_TOPICS";
const HOME_TOPIC_TEMPLATE_TYPE = "home_life_topic";
const HOME_TOPIC_DEFAULT_LIMIT = 20;
const HOME_TOPIC_MAX_LIMIT = 50;
const HOME_TOPIC_MAX_PER_CLUSTER = 3;
const HOME_TOPIC_CITY = "Espana";
const HOME_TOPIC_PROVINCE = "";
const HOME_TOPIC_AUTONOMOUS_COMMUNITY = "";

const INMORADAR_VALUE_ANGLE =
  "InmoRadar ayuda a analizar anuncios inmobiliarios antes de contactar, resumir datos clave, calcular precio/m2, detectar senales de riesgo y comparar mejor.";
const CTA_PRIMARY = "Analiza un piso con InmoRadar antes de contactar.";
const CTA_SECONDARY = "Instala la extension de Chrome y usala mientras revisas anuncios inmobiliarios.";
const INMORADAR_BLOCK_TITLE = "Como te ayuda InmoRadar antes de contactar por un piso";
const HOME_TOPIC_DISCLAIMER =
  "Contenido orientativo. No sustituye asesoramiento legal, tecnico, financiero, energetico ni de seguros. Verifica siempre datos, contratos, presupuestos y normativa aplicable antes de decidir.";

const BLOCKED_BRAND_SLUG_TERMS = ["idealista", "fotocasa", "habitaclia", "pisos-com", "pisoscom"];

const HOME_LIFE_SEO_CLUSTERS = [
  {
    cluster_id: "housing_total_cost",
    name: "Coste real de vivir en una vivienda",
    priority: 100,
    search_intent: "informational",
    funnel_stage: "problem_aware",
    inmoradar_relationship: "Ayuda a pasar de mirar precio de anuncio a estimar el coste real de vivir en esa vivienda.",
    seo_risk: "medium",
    reputation_legal_risk: "medium",
    templates: [HOME_TOPIC_TEMPLATE_TYPE],
    secondary_keywords: ["coste vivienda", "presupuesto vivienda", "gastos mensuales casa"],
    topics: [
      ["coste real comprar vivienda", "coste-real-comprar-vivienda"],
      ["cuanto cuesta vivir en un piso", "cuanto-cuesta-vivir-en-un-piso"],
      ["presupuesto mensual vivienda", "presupuesto-mensual-vivienda"]
    ]
  },
  {
    cluster_id: "electricity_bill",
    name: "Factura de la luz",
    priority: 96,
    search_intent: "informational",
    funnel_stage: "problem_aware",
    inmoradar_relationship: "Conecta el coste mensual de una vivienda con senales que conviene revisar antes de contactar.",
    seo_risk: "medium",
    reputation_legal_risk: "medium",
    templates: [HOME_TOPIC_TEMPLATE_TYPE],
    secondary_keywords: ["factura luz casa", "consumo electrico piso", "ahorrar luz vivienda"],
    topics: [
      ["como controlar factura luz casa", "como-controlar-factura-luz-casa"],
      ["cuanta luz gasta un piso", "cuanta-luz-gasta-un-piso"],
      ["ahorrar luz en casa", "ahorrar-luz-en-casa"]
    ]
  },
  {
    cluster_id: "gas_heating",
    name: "Gas y calefaccion",
    priority: 92,
    search_intent: "informational",
    funnel_stage: "problem_aware",
    inmoradar_relationship: "Aporta contexto de coste y riesgo para valorar viviendas con calefaccion, gas o consumos altos.",
    seo_risk: "medium",
    reputation_legal_risk: "high",
    templates: [HOME_TOPIC_TEMPLATE_TYPE],
    secondary_keywords: ["calefaccion piso", "gasto gas casa", "gas o electricidad vivienda"],
    topics: [
      ["como elegir proveedor gas casa", "como-elegir-proveedor-gas-casa"],
      ["calefaccion gas o electrica piso", "calefaccion-gas-o-electrica-piso"],
      ["gasto calefaccion piso", "gasto-calefaccion-piso"]
    ]
  },
  {
    cluster_id: "home_internet",
    name: "Internet en casa",
    priority: 88,
    search_intent: "informational",
    funnel_stage: "consideration",
    inmoradar_relationship: "Ayuda a revisar servicios disponibles y costes de mudanza antes de elegir vivienda.",
    seo_risk: "low",
    reputation_legal_risk: "low",
    templates: [HOME_TOPIC_TEMPLATE_TYPE],
    secondary_keywords: ["fibra optica piso", "internet al mudarte", "contratar internet casa"],
    topics: [
      ["como elegir internet para casa", "como-elegir-internet-para-casa"],
      ["fibra optica alquilar piso", "fibra-optica-alquilar-piso"],
      ["que internet contratar al mudarte", "que-internet-contratar-al-mudarte"]
    ]
  },
  {
    cluster_id: "home_insurance",
    name: "Seguro del hogar",
    priority: 84,
    search_intent: "informational",
    funnel_stage: "consideration",
    inmoradar_relationship: "Situa el seguro como coste y pregunta clave al comparar compra o alquiler.",
    seo_risk: "medium",
    reputation_legal_risk: "high",
    templates: [HOME_TOPIC_TEMPLATE_TYPE],
    secondary_keywords: ["seguro hogar", "seguro vivienda alquiler", "cobertura seguro hogar"],
    topics: [
      ["seguro hogar comprar piso", "seguro-hogar-comprar-piso"],
      ["seguro hogar alquiler quien paga", "seguro-hogar-alquiler-quien-paga"],
      ["que cubre seguro hogar", "que-cubre-seguro-hogar"]
    ]
  },
  {
    cluster_id: "appliances",
    name: "Electrodomesticos",
    priority: 80,
    search_intent: "informational",
    funnel_stage: "consideration",
    inmoradar_relationship: "Ayuda a estimar coste de equipar una vivienda tras comprar o alquilar.",
    seo_risk: "low",
    reputation_legal_risk: "low",
    templates: [HOME_TOPIC_TEMPLATE_TYPE],
    secondary_keywords: ["electrodomesticos piso", "equipar cocina", "electrodomesticos eficientes"],
    topics: [
      ["electrodomesticos basicos para piso nuevo", "electrodomesticos-basicos-para-piso-nuevo"],
      ["cuanto cuesta equipar cocina", "cuanto-cuesta-equipar-cocina"],
      ["electrodomesticos eficientes piso", "electrodomesticos-eficientes-piso"]
    ]
  },
  {
    cluster_id: "furniture_decoration",
    name: "Muebles y decoracion",
    priority: 76,
    search_intent: "informational",
    funnel_stage: "consideration",
    inmoradar_relationship: "Conecta la decision de vivienda con el coste posterior de amueblar y adaptar el piso.",
    seo_risk: "low",
    reputation_legal_risk: "low",
    templates: [HOME_TOPIC_TEMPLATE_TYPE],
    secondary_keywords: ["amueblar piso", "decorar piso pequeno", "muebles basicos piso"],
    topics: [
      ["cuanto cuesta amueblar un piso", "cuanto-cuesta-amueblar-un-piso"],
      ["ideas decorar piso pequeno", "ideas-decorar-piso-pequeno"],
      ["muebles basicos para piso nuevo", "muebles-basicos-para-piso-nuevo"]
    ]
  },
  {
    cluster_id: "moving_home",
    name: "Mudanza",
    priority: 72,
    search_intent: "informational",
    funnel_stage: "consideration",
    inmoradar_relationship: "Ayuda a convertir la comparacion de anuncios en un plan realista de cambio de vivienda.",
    seo_risk: "low",
    reputation_legal_risk: "low",
    templates: [HOME_TOPIC_TEMPLATE_TYPE],
    secondary_keywords: ["mudanza piso", "checklist mudanza", "coste mudanza"],
    topics: [
      ["cuanto cuesta una mudanza", "cuanto-cuesta-una-mudanza"],
      ["checklist mudanza piso", "checklist-mudanza-piso"],
      ["que hacer antes de mudarte", "que-hacer-antes-de-mudarte"]
    ]
  },
  {
    cluster_id: "community_fees",
    name: "Gastos de comunidad",
    priority: 68,
    search_intent: "informational",
    funnel_stage: "consideration",
    inmoradar_relationship: "Refuerza preguntas y senales que conviene revisar antes de contactar por un piso.",
    seo_risk: "medium",
    reputation_legal_risk: "medium",
    templates: [HOME_TOPIC_TEMPLATE_TYPE],
    secondary_keywords: ["gastos comunidad piso", "comunidad vivienda", "preguntar gastos comunidad"],
    topics: [
      ["gastos comunidad vivienda", "gastos-comunidad-vivienda"],
      ["preguntar gastos comunidad antes comprar", "preguntar-gastos-comunidad-antes-comprar"],
      ["gastos comunidad piso caro o normal", "gastos-comunidad-piso-caro-o-normal"]
    ]
  },
  {
    cluster_id: "reforms",
    name: "Reformas",
    priority: 64,
    search_intent: "informational",
    funnel_stage: "consideration",
    inmoradar_relationship: "Ayuda a detectar si un piso barato o caro puede esconder costes posteriores relevantes.",
    seo_risk: "medium",
    reputation_legal_risk: "high",
    templates: [HOME_TOPIC_TEMPLATE_TYPE],
    secondary_keywords: ["reformar piso", "comprar piso para reformar", "coste reforma vivienda"],
    topics: [
      ["cuanto cuesta reformar un piso", "cuanto-cuesta-reformar-un-piso"],
      ["comprar piso para reformar", "comprar-piso-para-reformar"],
      ["revisar piso antes de reformar", "revisar-piso-antes-de-reformar"]
    ]
  },
  {
    cluster_id: "energy_efficiency",
    name: "Eficiencia energetica",
    priority: 60,
    search_intent: "informational",
    funnel_stage: "consideration",
    inmoradar_relationship: "Relaciona senales del anuncio y coste mensual con la eficiencia real de la vivienda.",
    seo_risk: "medium",
    reputation_legal_risk: "medium",
    templates: [HOME_TOPIC_TEMPLATE_TYPE],
    secondary_keywords: ["certificado energetico vivienda", "eficiencia energetica piso", "factura energia casa"],
    topics: [
      ["certificado energetico vivienda", "certificado-energetico-vivienda"],
      ["piso con mala eficiencia energetica", "piso-con-mala-eficiencia-energetica"],
      ["como afecta eficiencia energetica factura", "como-afecta-eficiencia-energetica-factura"]
    ]
  },
  {
    cluster_id: "viewing_checklist",
    name: "Checklist antes de contactar o visitar",
    priority: 56,
    search_intent: "informational",
    funnel_stage: "activation",
    inmoradar_relationship: "Es el puente mas directo hacia usar InmoRadar antes de escribir al anunciante.",
    seo_risk: "low",
    reputation_legal_risk: "low",
    templates: [HOME_TOPIC_TEMPLATE_TYPE],
    secondary_keywords: ["checklist visitar piso", "preguntar antes contactar piso", "cosas mirar piso"],
    topics: [
      ["que preguntar antes contactar piso", "que-preguntar-antes-contactar-piso"],
      ["checklist visitar piso", "checklist-visitar-piso"],
      ["cosas que mirar en un piso", "cosas-que-mirar-en-un-piso"]
    ]
  },
  {
    cluster_id: "risk_signals",
    name: "Senales de riesgo en anuncios",
    priority: 52,
    search_intent: "commercial_investigation",
    funnel_stage: "activation",
    inmoradar_relationship: "Refuerza el caso de uso principal: detectar senales raras o sobrevaloracion antes de contactar.",
    seo_risk: "medium",
    reputation_legal_risk: "medium",
    templates: [HOME_TOPIC_TEMPLATE_TYPE],
    secondary_keywords: ["senales riesgo anuncio", "anuncio piso raro", "piso sobrevalorado"],
    topics: [
      ["senales riesgo anuncio vivienda", "senales-riesgo-anuncio-vivienda"],
      ["cosas raras anuncio piso", "cosas-raras-anuncio-piso"],
      ["como detectar piso sobrevalorado", "como-detectar-piso-sobrevalorado"]
    ]
  },
  {
    cluster_id: "neighbourhood_services",
    name: "Barrio y servicios",
    priority: 48,
    search_intent: "informational",
    funnel_stage: "consideration",
    inmoradar_relationship: "Amplia la comparacion de viviendas hacia zona, servicios y calidad de decision.",
    seo_risk: "low",
    reputation_legal_risk: "low",
    templates: [HOME_TOPIC_TEMPLATE_TYPE],
    secondary_keywords: ["elegir barrio", "servicios cerca de casa", "zona antes comprar piso"],
    topics: [
      ["que mirar zona antes comprar piso", "que-mirar-zona-antes-comprar-piso"],
      ["elegir barrio para vivir", "elegir-barrio-para-vivir"],
      ["servicios cerca de casa", "servicios-cerca-de-casa"]
    ]
  }
];

function uniqueList(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function clampHomeTopicLimit(limit) {
  const parsed = Number.parseInt(String(limit || HOME_TOPIC_DEFAULT_LIMIT), 10);
  if (!Number.isFinite(parsed)) return HOME_TOPIC_DEFAULT_LIMIT;
  return Math.max(1, Math.min(HOME_TOPIC_MAX_LIMIT, parsed));
}

function normalizeClusterList(value = []) {
  const raw = Array.isArray(value) ? value : String(value || "").split(",");
  return uniqueList(raw.map((item) => item.toLowerCase()));
}

function normalizeHomeTopicRequest(input = {}) {
  return {
    confirm: String(input.confirm || "").trim(),
    dry_run: input.dry_run === false || input.dryRun === false ? false : true,
    limit: clampHomeTopicLimit(input.limit),
    clusters: normalizeClusterList(input.clusters || input.cluster_ids || input.clusterIds)
  };
}

function slugPath(slug) {
  return `/${String(slug || "").replace(/^\/+|\/+$/g, "")}/`;
}

function titleFromKeyword(keyword) {
  const text = String(keyword || "").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

function warningListForCluster(cluster) {
  const warnings = [];
  if (cluster.seo_risk === "high") warnings.push("seo_risk_high_requires_manual_review");
  if (cluster.reputation_legal_risk === "high") warnings.push("legal_or_reputational_risk_high_requires_manual_review");
  if (["home_insurance", "gas_heating", "reforms", "energy_efficiency"].includes(cluster.cluster_id)) {
    warnings.push("avoid_advice_claims_without_sources");
  }
  return warnings;
}

function buildHomeTopicBrief(cluster, topic, index) {
  const [primaryKeyword, slug] = topic;
  const title = titleFromKeyword(primaryKeyword);
  const secondaryKeywords = uniqueList([
    ...(cluster.secondary_keywords || []),
    `${primaryKeyword} antes de contactar`,
    "analizar anuncios inmobiliarios"
  ]).filter((keyword) => keyword !== primaryKeyword);

  return {
    primary_keyword: primaryKeyword,
    secondary_keywords: secondaryKeywords,
    search_intent: cluster.search_intent,
    target_user: "Persona que esta comparando viviendas en Espana antes de contactar, comprar, alquilar o mudarse.",
    problem_summary: `El usuario quiere entender ${cluster.name.toLowerCase()} y como afecta al coste real o al riesgo de elegir una vivienda.`,
    suggested_title: `${title}: que revisar antes de decidir`,
    suggested_h1: `${title}: guia practica antes de contactar por una vivienda`,
    suggested_meta_description: `Aprende que revisar sobre ${cluster.name.toLowerCase()} antes de decidir. Usa InmoRadar para analizar anuncios, comparar datos y detectar senales de riesgo.`,
    suggested_slug: slugPath(slug),
    required_h2_sections: [
      `Que revisar sobre ${cluster.name.toLowerCase()}`,
      "Preguntas utiles antes de contactar",
      "Senales de coste o riesgo que conviene comparar",
      INMORADAR_BLOCK_TITLE,
      "Resumen practico antes de decidir"
    ],
    suggested_faqs: [
      `Que debo mirar sobre ${cluster.name.toLowerCase()} antes de contactar?`,
      "Como puedo comparar mejor varias viviendas?",
      "Cuando conviene pedir mas informacion al anunciante?"
    ],
    internal_link_targets: ["/que-analiza", "/premium", "/noticias", "/"],
    cta_primary: CTA_PRIMARY,
    cta_secondary: CTA_SECONDARY,
    inmoradar_value_angle: INMORADAR_VALUE_ANGLE,
    product_block_required: true,
    required_product_block: {
      title: INMORADAR_BLOCK_TITLE,
      bullets: [
        "analizar anuncios inmobiliarios",
        "resumir datos clave",
        "calcular precio/m2",
        "detectar senales de riesgo",
        "comparar viviendas",
        "estimar mejor el coste real de la decision",
        "CTA a usar o instalar InmoRadar"
      ]
    },
    disclaimer: HOME_TOPIC_DISCLAIMER,
    quality_requirements: [
      "Debe ser util y accionable, no una landing thin.",
      "Debe incluir ejemplos concretos de preguntas o comprobaciones.",
      "Debe explicar limites: no sustituye asesoramiento profesional.",
      `Debe incluir el bloque obligatorio "${INMORADAR_BLOCK_TITLE}".`,
      "Debe conectar el tema con analizar anuncios antes de contactar."
    ],
    content_warnings: warningListForCluster(cluster),
    cluster: {
      cluster_id: cluster.cluster_id,
      name: cluster.name,
      funnel_stage: cluster.funnel_stage,
      seo_risk: cluster.seo_risk,
      reputation_legal_risk: cluster.reputation_legal_risk,
      priority: cluster.priority,
      topic_index: index
    }
  };
}

function buildHomeTopicCandidate(cluster, topic, index) {
  const brief = buildHomeTopicBrief(cluster, topic, index);
  return {
    content_type: "landing",
    cluster_id: cluster.cluster_id,
    cluster_name: cluster.name,
    funnel_stage: cluster.funnel_stage,
    template_type: HOME_TOPIC_TEMPLATE_TYPE,
    templates: cluster.templates,
    primary_keyword: brief.primary_keyword,
    keyword: brief.primary_keyword,
    slug: brief.suggested_slug,
    suggested_slug: brief.suggested_slug,
    search_intent: brief.search_intent,
    intent: brief.search_intent,
    search_priority: Math.max(1, Number(cluster.priority || 0) - index),
    seo_risk: cluster.seo_risk,
    reputation_legal_risk: cluster.reputation_legal_risk,
    content_warnings: brief.content_warnings,
    brief,
    city: HOME_TOPIC_CITY,
    province: HOME_TOPIC_PROVINCE,
    autonomous_community: HOME_TOPIC_AUTONOMOUS_COMMUNITY
  };
}

function selectedClusters(requestClusters = []) {
  const registry = new Map(HOME_LIFE_SEO_CLUSTERS.map((cluster) => [cluster.cluster_id, cluster]));
  if (!requestClusters.length) {
    return {
      clusters: [...HOME_LIFE_SEO_CLUSTERS].sort((left, right) => Number(right.priority || 0) - Number(left.priority || 0)),
      unsupported_cluster_count: 0,
      unsupported_clusters: []
    };
  }
  const clusters = [];
  const unsupported = [];
  for (const clusterId of requestClusters) {
    if (registry.has(clusterId)) clusters.push(registry.get(clusterId));
    else unsupported.push(clusterId);
  }
  return {
    clusters,
    unsupported_cluster_count: unsupported.length,
    unsupported_clusters: unsupported
  };
}

function homeTopicCatalogCandidates(request = {}) {
  const selection = selectedClusters(request.clusters);
  const candidates = [];
  for (let index = 0; index < HOME_TOPIC_MAX_PER_CLUSTER; index += 1) {
    for (const cluster of selection.clusters) {
      const topic = cluster.topics[index];
      if (topic) candidates.push(buildHomeTopicCandidate(cluster, topic, index));
    }
  }
  return { ...selection, candidates };
}

function slugKey(value) {
  return String(value || "").replace(/^\/+|\/+$/g, "").toLowerCase();
}

function templateKeywordKey(value = {}) {
  return `${String(value.template_type || value.template || HOME_TOPIC_TEMPLATE_TYPE).toLowerCase()}|${String(
    value.primary_keyword || value.keyword || ""
  ).toLowerCase()}`;
}

function hasBlockedBrandSlug(slug = "") {
  const normalized = slugKey(slug);
  return BLOCKED_BRAND_SLUG_TERMS.some((term) => normalized.includes(term));
}

function missingCandidateFields(candidate = {}) {
  return [
    candidate.cluster_id ? null : "cluster_id",
    candidate.primary_keyword ? null : "primary_keyword",
    candidate.template_type ? null : "template_type",
    candidate.suggested_slug ? null : "suggested_slug",
    candidate.brief?.cta_primary ? null : "cta_primary",
    candidate.brief?.cta_secondary ? null : "cta_secondary",
    candidate.brief?.inmoradar_value_angle ? null : "inmoradar_value_angle",
    candidate.brief?.disclaimer ? null : "disclaimer",
    candidate.brief?.product_block_required === true ? null : "product_block_required"
  ].filter(Boolean);
}

function countBy(rows = [], field) {
  return rows.reduce((counts, row) => {
    const value = typeof field === "function" ? field(row) : row?.[field];
    const key = String(value || "unknown").toLowerCase();
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function emptyHomeTopicDiagnostics(extra = {}) {
  return {
    total_candidates: 0,
    insertable_candidates: 0,
    inserted_count: 0,
    skipped_count: 0,
    errors_count: 0,
    already_existing_count: 0,
    already_pending_count: 0,
    missing_required_fields_count: 0,
    unsupported_cluster_count: 0,
    per_cluster_counts: {},
    per_template_counts: {},
    limit_applied: 0,
    empty_reason: null,
    confirmation_required: true,
    ...extra
  };
}

function inferHomeTopicEmptyReason(diagnostics = {}) {
  if (Number(diagnostics.insertable_candidates || 0) > 0) return null;
  if (Number(diagnostics.total_candidates || 0) === 0 && Number(diagnostics.unsupported_cluster_count || 0) > 0) return "unsupported_cluster";
  if (Number(diagnostics.total_candidates || 0) === 0) return "no_candidates";
  if (Number(diagnostics.missing_required_fields_count || 0) >= Number(diagnostics.total_candidates || 0)) return "missing_required_fields";
  if (Number(diagnostics.already_pending_count || 0) >= Number(diagnostics.total_candidates || 0)) return "all_candidates_already_pending";
  if (Number(diagnostics.already_existing_count || 0) >= Number(diagnostics.total_candidates || 0)) return "all_candidates_already_existing";
  return "filters_excluded_all";
}

function candidatePublic(candidate = {}, extra = {}) {
  return {
    content_type: "landing",
    cluster_id: candidate.cluster_id,
    cluster_name: candidate.cluster_name,
    funnel_stage: candidate.funnel_stage,
    template_type: candidate.template_type,
    primary_keyword: candidate.primary_keyword,
    suggested_slug: candidate.suggested_slug,
    search_intent: candidate.search_intent,
    search_priority: candidate.search_priority,
    seo_risk: candidate.seo_risk,
    reputation_legal_risk: candidate.reputation_legal_risk,
    content_warnings: candidate.content_warnings || [],
    brief: candidate.brief,
    ...extra
  };
}

function homeTopicOpportunityRow(candidate = {}) {
  return {
    keyword: candidate.primary_keyword,
    city: HOME_TOPIC_CITY,
    province: HOME_TOPIC_PROVINCE,
    autonomous_community: HOME_TOPIC_AUTONOMOUS_COMMUNITY,
    intent: candidate.search_intent || "informational",
    template_type: candidate.template_type || HOME_TOPIC_TEMPLATE_TYPE,
    search_priority: Number(candidate.search_priority || 50),
    data_available: false,
    status: "pending",
    cluster_id: candidate.cluster_id,
    suggested_slug: candidate.suggested_slug,
    brief_json: candidate.brief
  };
}

async function fetchHomeTopicExistingState(fetchRows) {
  const opportunityParams = new URLSearchParams({
    select: "keyword,city,template_type,status,cluster_id,suggested_slug",
    limit: "5000"
  });
  const landingParams = new URLSearchParams({
    select: "slug,title,template_type,status",
    limit: "5000"
  });
  const [opportunities, landings] = await Promise.all([
    fetchRows(`seo_landing_opportunities?${opportunityParams.toString()}`),
    fetchRows(`seo_landings?${landingParams.toString()}`)
  ]);
  return {
    opportunities: Array.isArray(opportunities) ? opportunities : [],
    landings: Array.isArray(landings) ? landings : []
  };
}

function evaluateHomeTopicCandidates({ request, catalog, existingState }) {
  const existingLandingSlugs = new Set((existingState.landings || []).map((row) => slugKey(row.slug)).filter(Boolean));
  const existingOpportunitySlugs = new Set((existingState.opportunities || []).map((row) => slugKey(row.suggested_slug)).filter(Boolean));
  const existingOpportunityKeys = new Set((existingState.opportunities || []).map(templateKeywordKey));
  const existingPendingKeys = new Set(
    (existingState.opportunities || [])
      .filter((row) => String(row.status || "").toLowerCase() === "pending")
      .map(templateKeywordKey)
  );
  const existingPendingSlugs = new Set(
    (existingState.opportunities || [])
      .filter((row) => String(row.status || "").toLowerCase() === "pending")
      .map((row) => slugKey(row.suggested_slug))
      .filter(Boolean)
  );

  const evaluated = [];
  for (const candidate of catalog.candidates) {
    const reasons = [];
    const missingFields = missingCandidateFields(candidate);
    if (missingFields.length) reasons.push("missing_required_fields");
    if (hasBlockedBrandSlug(candidate.suggested_slug)) reasons.push("blocked_brand_slug");
    const slug = slugKey(candidate.suggested_slug);
    const keywordKey = templateKeywordKey(candidate);
    if (existingPendingKeys.has(keywordKey) || existingPendingSlugs.has(slug)) reasons.push("already_pending");
    else if (existingOpportunityKeys.has(keywordKey) || existingOpportunitySlugs.has(slug) || existingLandingSlugs.has(slug)) {
      reasons.push("already_existing");
    }
    evaluated.push({
      ...candidate,
      is_insertable: reasons.length === 0,
      skip_reasons: reasons,
      row: reasons.length === 0 ? homeTopicOpportunityRow(candidate) : null
    });
  }

  const insertable = evaluated.filter((candidate) => candidate.is_insertable).slice(0, request.limit);
  const limitedInsertableKeys = new Set(insertable.map((candidate) => `${candidate.cluster_id}|${candidate.suggested_slug}`));
  const skipped = evaluated
    .filter((candidate) => !candidate.is_insertable || !limitedInsertableKeys.has(`${candidate.cluster_id}|${candidate.suggested_slug}`))
    .map((candidate) => {
      const reasons = candidate.skip_reasons.length ? candidate.skip_reasons : ["limit_excluded"];
      return candidatePublic(candidate, { reason: reasons[0], skip_reasons: reasons });
    });

  const diagnostics = emptyHomeTopicDiagnostics({
    total_candidates: evaluated.length,
    insertable_candidates: insertable.length,
    skipped_count: skipped.length,
    already_existing_count: evaluated.filter((candidate) => candidate.skip_reasons.includes("already_existing")).length,
    already_pending_count: evaluated.filter((candidate) => candidate.skip_reasons.includes("already_pending")).length,
    missing_required_fields_count: evaluated.filter((candidate) => candidate.skip_reasons.includes("missing_required_fields")).length,
    unsupported_cluster_count: catalog.unsupported_cluster_count,
    unsupported_clusters: catalog.unsupported_clusters,
    per_cluster_counts: countBy(insertable, "cluster_id"),
    per_template_counts: countBy(insertable, "template_type"),
    limit_applied: request.limit,
    confirmation_required: true,
    clusters_included: catalog.clusters.map((cluster) => ({
      cluster_id: cluster.cluster_id,
      name: cluster.name,
      priority: cluster.priority,
      funnel_stage: cluster.funnel_stage,
      search_intent: cluster.search_intent,
      seo_risk: cluster.seo_risk,
      reputation_legal_risk: cluster.reputation_legal_risk,
      templates: cluster.templates
    })),
    max_per_cluster: HOME_TOPIC_MAX_PER_CLUSTER
  });
  diagnostics.empty_reason = inferHomeTopicEmptyReason(diagnostics);
  return { evaluated, insertable, skipped, diagnostics };
}

async function buildHomeTopicSeedPlan(input = {}, options = {}) {
  const request = normalizeHomeTopicRequest(input);
  const fetchRows = options.fetchRows || (hasSupabaseConfig() ? (path) => supabaseFetch(path, { timeoutMs: 8000 }) : null);
  if (!fetchRows) {
    return {
      request,
      error: {
        ok: false,
        status: 500,
        error: "supabase_not_configured",
        message: "Supabase no esta configurado para leer oportunidades tematicas.",
        dry_run: true,
        read_only: true,
        writes_enabled: false,
        ...emptyHomeTopicDiagnostics({ empty_reason: "supabase_not_configured" }),
        diagnostics: emptyHomeTopicDiagnostics({ empty_reason: "supabase_not_configured" }),
        home_topic_diagnostics: emptyHomeTopicDiagnostics({ empty_reason: "supabase_not_configured" })
      }
    };
  }
  const catalog = homeTopicCatalogCandidates(request);
  const existingState = await fetchHomeTopicExistingState(fetchRows);
  const plan = evaluateHomeTopicCandidates({ request, catalog, existingState });
  return { request, catalog, existingState, ...plan };
}

function homeTopicBaseResult({ request, catalog, insertable, skipped, diagnostics }) {
  return {
    ok: true,
    dry_run: request.dry_run,
    read_only: request.dry_run,
    writes_enabled: !request.dry_run,
    source: "home_life_topic_registry",
    confirmation_text: SEO_HOME_TOPIC_CONFIRMATION,
    confirmation_required: true,
    default_limit: HOME_TOPIC_DEFAULT_LIMIT,
    max_limit: HOME_TOPIC_MAX_LIMIT,
    max_per_cluster: HOME_TOPIC_MAX_PER_CLUSTER,
    filters: {
      limit: request.limit,
      clusters: request.clusters
    },
    clusters: catalog.clusters.map((cluster) => ({
      cluster_id: cluster.cluster_id,
      name: cluster.name,
      priority: cluster.priority,
      search_intent: cluster.search_intent,
      funnel_stage: cluster.funnel_stage,
      inmoradar_relationship: cluster.inmoradar_relationship,
      seo_risk: cluster.seo_risk,
      reputation_legal_risk: cluster.reputation_legal_risk,
      templates: cluster.templates
    })),
    total_candidates: diagnostics.total_candidates,
    insertable_candidates: diagnostics.insertable_candidates,
    would_insert_count: insertable.length,
    would_insert: insertable.map((candidate) => candidatePublic(candidate, { row: candidate.row })),
    inserted_count: 0,
    inserted: [],
    skipped_count: skipped.length,
    skipped,
    error_count: 0,
    errors_count: 0,
    errors: [],
    already_existing_count: diagnostics.already_existing_count,
    already_pending_count: diagnostics.already_pending_count,
    missing_required_fields_count: diagnostics.missing_required_fields_count,
    unsupported_cluster_count: diagnostics.unsupported_cluster_count,
    per_cluster_counts: diagnostics.per_cluster_counts,
    per_template_counts: diagnostics.per_template_counts,
    limit_applied: diagnostics.limit_applied,
    empty_reason: diagnostics.empty_reason,
    diagnostics,
    home_topic_diagnostics: diagnostics
  };
}

async function getSeoHomeTopicOpportunitiesPreview(input = {}, options = {}) {
  const plan = await buildHomeTopicSeedPlan({ ...input, dry_run: true }, options);
  if (plan.error) return plan.error;
  return {
    ...homeTopicBaseResult(plan),
    dry_run: true,
    read_only: true,
    writes_enabled: false
  };
}

function invalidHomeTopicConfirmation(request) {
  const emptyReason = request.confirm ? "invalid_confirmation" : "confirmation_required";
  return {
    ok: false,
    status: 400,
    error: request.confirm ? "seed_home_topics_confirmation_invalid" : "seed_home_topics_confirmation_required",
    message: `Confirmacion incorrecta o incompleta. Escribe exactamente "${SEO_HOME_TOPIC_CONFIRMATION}" para crear oportunidades pending.`,
    dry_run: true,
    read_only: true,
    writes_enabled: false,
    confirmation_required: true,
    confirmation_text: SEO_HOME_TOPIC_CONFIRMATION,
    would_insert_count: 0,
    inserted_count: 0,
    skipped_count: 0,
    error_count: 0,
    errors_count: 0,
    inserted: [],
    skipped: [],
    errors: [],
    empty_reason: emptyReason,
    diagnostics: emptyHomeTopicDiagnostics({ empty_reason: emptyReason }),
    home_topic_diagnostics: emptyHomeTopicDiagnostics({ empty_reason: emptyReason })
  };
}

async function seedSeoHomeTopicOpportunities(input = {}, options = {}) {
  const request = normalizeHomeTopicRequest(input);
  if (!request.dry_run && request.confirm !== SEO_HOME_TOPIC_CONFIRMATION) return invalidHomeTopicConfirmation(request);
  const insertRow = options.insertRow || (hasSupabaseConfig()
    ? (row) => supabaseFetch("seo_landing_opportunities", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify([row]),
        timeoutMs: 8000
      })
    : null);
  if (!request.dry_run && !insertRow) {
    return {
      ok: false,
      status: 500,
      error: "supabase_not_configured",
      message: "Supabase no esta configurado para escribir oportunidades tematicas.",
      dry_run: false,
      read_only: true,
      writes_enabled: false,
      empty_reason: "supabase_not_configured",
      diagnostics: emptyHomeTopicDiagnostics({ empty_reason: "supabase_not_configured" }),
      home_topic_diagnostics: emptyHomeTopicDiagnostics({ empty_reason: "supabase_not_configured" })
    };
  }

  const plan = await buildHomeTopicSeedPlan(request, options);
  if (plan.error) return { ...plan.error, dry_run: request.dry_run };
  const base = homeTopicBaseResult(plan);
  if (request.dry_run) return base;

  const inserted = [];
  const errors = [];
  for (const candidate of plan.insertable) {
    try {
      const result = await insertRow(candidate.row, candidate);
      const saved = Array.isArray(result) ? result[0] || candidate.row : result || candidate.row;
      inserted.push(candidatePublic(candidate, { row: saved }));
    } catch (error) {
      errors.push(candidatePublic(candidate, {
        reason: "insert_failed",
        error: String(error?.message || error || "insert_failed").slice(0, 300)
      }));
    }
  }

  const diagnostics = {
    ...plan.diagnostics,
    inserted_count: inserted.length,
    errors_count: errors.length
  };

  return {
    ...base,
    dry_run: false,
    read_only: false,
    writes_enabled: true,
    inserted_count: inserted.length,
    inserted,
    error_count: errors.length,
    errors_count: errors.length,
    errors,
    diagnostics,
    home_topic_diagnostics: diagnostics
  };
}

module.exports = {
  BLOCKED_BRAND_SLUG_TERMS,
  HOME_LIFE_SEO_CLUSTERS,
  HOME_TOPIC_DEFAULT_LIMIT,
  HOME_TOPIC_MAX_LIMIT,
  HOME_TOPIC_MAX_PER_CLUSTER,
  HOME_TOPIC_TEMPLATE_TYPE,
  SEO_HOME_TOPIC_CONFIRMATION,
  buildHomeTopicBrief,
  getSeoHomeTopicOpportunitiesPreview,
  homeTopicCatalogCandidates,
  homeTopicOpportunityRow,
  seedSeoHomeTopicOpportunities
};
