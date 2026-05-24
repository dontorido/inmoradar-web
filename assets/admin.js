const TOKEN_KEY = "inmoradar_admin_token";
const ALERT_DISMISS_PREFIX = "inmoradar_admin_alert_dismissed:";
const VIDEO_PROJECT_KEY = "inmoradar_social_video_project";
const RELEASE_TARGETS = ["web", "extension", "backoffice"];
const MAX_RELEASE_FILE_BYTES = 3 * 1024 * 1024;
const ANALYTICS_DEFAULT_DAYS = 7;
const ANALYTICS_MAX_RANGE_DAYS = 90;
const INITIAL_ADMIN_PATH = window.location.pathname || "";
const INITIAL_MARKETING_SUBSECTION = INITIAL_ADMIN_PATH.includes("/backoffice/marketing/viraliza")
  ? "marketing-viraliza"
  : INITIAL_ADMIN_PATH.includes("/backoffice/marketing/linkedin")
    ? "marketing-linkedin"
    : INITIAL_ADMIN_PATH.includes("/backoffice/marketing/meta")
      ? "marketing-meta"
      : "";
const DEFAULT_VIDEO_PROPERTY_DATA = Object.freeze({
  ciudad: "Madrid",
  barrio: "Ventas",
  portal: "Idealista",
  precio: "245.000 €",
  metros: "62 m²",
  precio_m2: "3.951 €/m²",
  entrada_estimada: "49.000 €",
  cuota_estimada: "980 €/mes",
  transporte: "Metro a 9 minutos",
  aparcamiento: "complicado",
  score: "6,8/10",
  veredicto: "lo compararía antes de llamar"
});

const VIDEO_TOPIC_PROPERTY_DATA = Object.freeze({
  random: {
    ciudad: "Madrid",
    barrio: "Ventas",
    portal: "Idealista",
    precio: "245.000 €",
    metros: "62 m²",
    habitaciones: "2",
    precio_m2: "3.951 €/m²",
    entrada_estimada: "49.000 €",
    cuota_estimada: "980 €/mes",
    transporte: "Metro a 9 minutos",
    aparcamiento: "complicado",
    senal_zona: "zona con buena demanda, pero conviene comparar calles cercanas",
    score: "6,8/10",
    veredicto: "lo compararía antes de llamar"
  },
  precio_m2: {
    ciudad: "Madrid",
    barrio: "Tetuán",
    portal: "Fotocasa",
    precio: "310.000 €",
    metros: "68 m²",
    habitaciones: "2",
    precio_m2: "4.558 €/m²",
    entrada_estimada: "62.000 €",
    cuota_estimada: "1.235 €/mes",
    transporte: "Metro a 6 minutos",
    aparcamiento: "difícil en horario laboral",
    senal_zona: "precio por metro alto para comparar con viviendas cercanas",
    score: "6,4/10",
    veredicto: "interesante, pero con señales a revisar"
  },
  alquiler: {
    ciudad: "Valencia",
    barrio: "Ruzafa",
    portal: "Idealista",
    tipo_inmueble: "alquiler",
    precio: "1.150 €/mes",
    metros: "54 m²",
    habitaciones: "1",
    precio_m2: "21,3 €/m²",
    entrada_estimada: "2.300 € entre fianza y primer mes",
    cuota_estimada: "1.150 €/mes",
    transporte: "Metro y bus a menos de 10 minutos",
    aparcamiento: "muy limitado",
    senal_zona: "zona demandada, precio sensible a ubicación exacta",
    score: "7,1/10",
    veredicto: "yo pediría más información antes de visitar"
  },
  compra: {
    ciudad: "Barcelona",
    barrio: "Sants",
    portal: "Habitaclia",
    tipo_inmueble: "compra",
    precio: "365.000 €",
    metros: "74 m²",
    habitaciones: "3",
    precio_m2: "4.932 €/m²",
    entrada_estimada: "73.000 €",
    cuota_estimada: "1.455 €/mes",
    transporte: "Cercanías y metro a 7 minutos",
    aparcamiento: "zona con presión media",
    senal_zona: "buena conexión, coste inicial elevado",
    score: "7,3/10",
    veredicto: "buena pinta, aunque conviene validar costes"
  },
  zona: {
    ciudad: "Málaga",
    barrio: "Teatinos",
    portal: "Pisos.com",
    precio: "285.000 €",
    metros: "82 m²",
    habitaciones: "3",
    precio_m2: "3.475 €/m²",
    entrada_estimada: "57.000 €",
    cuota_estimada: "1.135 €/mes",
    transporte: "Metro a 11 minutos",
    aparcamiento: "razonable fuera de hora punta",
    ruido: "medio",
    senal_zona: "zona familiar con servicios, revisar distancia real al transporte",
    score: "7,6/10",
    veredicto: "yo sí lo visitaría si la zona encaja"
  },
  parking: {
    ciudad: "Madrid",
    barrio: "Puente de Vallecas",
    portal: "Idealista",
    precio: "198.000 €",
    metros: "59 m²",
    habitaciones: "2",
    precio_m2: "3.356 €/m²",
    entrada_estimada: "39.600 €",
    cuota_estimada: "790 €/mes",
    transporte: "Metro a 8 minutos",
    aparcamiento: "complicado, garaje no incluido",
    senal_zona: "alta presión de aparcamiento en la calle",
    score: "6,2/10",
    veredicto: "yo lo guardaría, pero no lo pondría como primera visita"
  },
  errores: {
    ciudad: "Sevilla",
    barrio: "Nervión",
    portal: "Fotocasa",
    precio: "260.000 €",
    precio_alt: "275.000 €",
    metros: "61 m²",
    habitaciones: "2",
    precio_m2: "4.262 €/m²",
    entrada_estimada: "52.000 €",
    cuota_estimada: "1.035 €/mes",
    transporte: "Metro a 13 minutos",
    aparcamiento: "limitado",
    senal_zona: "el precio total distrae del coste por metro y del entorno",
    score: "6,5/10",
    veredicto: "no llamaría todavía sin comparar dos o tres opciones más"
  }
});

const INITIAL_ANALYTICS_RANGE = defaultAnalyticsDateRange();

const state = {
  token: sessionStorage.getItem(TOKEN_KEY) || "",
  activeSection: INITIAL_MARKETING_SUBSECTION ? "marketing" : "ventas",
  marketingSubsection: INITIAL_MARKETING_SUBSECTION,
  operacionesSubsection: "",
  premium: {
    q: "",
    status: "all",
    provider: "",
    eventName: ""
  },
  seo: {
    status: "all",
    page: 1,
    pageSize: 10,
    hasNextPage: false,
    hasPreviousPage: false
  },
  seoAutogeneration: {
    status: null,
    recentRuns: []
  },
  seoKeywordBacklog: {
    keywords: [],
    briefsById: new Map()
  },
  parking: {
    lastProbe: null
  },
  serviceStatus: null,
  releases: {
    web: [],
    extension: [],
    backoffice: []
  },
  kpis: {
    schema: [],
    settings: {},
    defaults: {}
  },
  video: {
    lastProject: null,
    selectedSceneIndex: 0,
    busy: false,
    backgroundClipUrl: "",
    backgroundClipName: "",
    backgroundClipType: "",
    runwayEstimate: null,
    runwayJob: null,
    runwayConfig: null,
    projects: [],
    storageError: "",
    jobsStorageError: ""
  },
  viraliza: {
    routine: null,
    executionMode: false,
    realCreators: [],
    dailyCreatorPlan: [],
    performance: null,
    learning: null,
    learningWarning: "",
    creatorsStorageWarning: "",
    dailyPlanWarning: ""
  },
  analytics: {
    days: ANALYTICS_DEFAULT_DAYS,
    fromDate: INITIAL_ANALYTICS_RANGE.from,
    toDate: INITIAL_ANALYTICS_RANGE.to,
    summary: null,
    pages: [],
    learning: null,
    warning: ""
  },
  linkedin: {
    connection: null,
    settings: {},
    posts: [],
    summary: {},
    env: {},
    currentPostId: "",
    lastPublication: null,
    manualNotice: ""
  },
  meta: {
    connection: null,
    settings: {},
    posts: [],
    pages: [],
    summary: {},
    env: {},
    currentPostId: "",
    lastPublication: null,
    manualNotice: ""
  },
  alerts: []
};

const els = {
  login: document.querySelector("[data-admin-login]"),
  app: document.querySelector("[data-admin-app]"),
  tokenForm: document.querySelector("[data-admin-token-form]"),
  status: document.querySelector("[data-admin-status]"),
  liveStatus: document.querySelector("[data-admin-live-status]"),
  alerts: document.querySelector("[data-admin-alerts]"),
  logout: document.querySelector("[data-admin-logout]"),
  sectionButtons: document.querySelectorAll("[data-admin-section-button]"),
  views: document.querySelectorAll("[data-admin-view]"),
  subsectionButtons: document.querySelectorAll("[data-admin-subsection-button]"),
  subsectionPanels: document.querySelectorAll("[data-admin-subsection-panel]"),
  subsectionEmptyStates: document.querySelectorAll("[data-admin-subsection-empty]"),
  refresh: document.querySelector("[data-admin-refresh]"),
  env: document.querySelector("[data-admin-env]"),
  stats: document.querySelector("[data-admin-stats]"),
  revenueSummary: document.querySelector("[data-revenue-summary]"),
  revenueChart: document.querySelector("[data-revenue-chart]"),
  extensionStats: document.querySelector("[data-extension-stats]"),
  extensionBreakdown: document.querySelector("[data-extension-breakdown]"),
  analyticsSummary: document.querySelector("[data-analytics-summary]"),
  analyticsPages: document.querySelector("[data-analytics-pages]"),
  analyticsLearning: document.querySelector("[data-analytics-learning]"),
  analyticsRefresh: document.querySelector("[data-analytics-refresh]"),
  analyticsPanels: document.querySelectorAll("[data-analytics-panel]"),
  analyticsFromInputs: document.querySelectorAll("[data-analytics-from]"),
  analyticsToInputs: document.querySelectorAll("[data-analytics-to]"),
  analyticsRefreshButtons: document.querySelectorAll("[data-analytics-refresh]"),
  premiumRows: document.querySelector("[data-premium-rows]"),
  seoSummary: document.querySelector("[data-seo-summary]"),
  seoRows: document.querySelector("[data-seo-rows]"),
  seoPagination: document.querySelector("[data-seo-pagination]"),
  premiumFilter: document.querySelector("[data-premium-filter]"),
  seoFilter: document.querySelector("[data-seo-filter]"),
  seoGenerate: document.querySelector("[data-seo-generate]"),
  seoPublish: document.querySelector("[data-seo-publish]"),
  seoAutogenSummary: document.querySelector("[data-seo-autogen-summary]"),
  seoAutogenRuns: document.querySelector("[data-seo-autogen-runs]"),
  seoAutogenRun: document.querySelector("[data-seo-autogen-run]"),
  seoAutogenDryRun: document.querySelector("[data-seo-autogen-dry-run]"),
  seoAutogenNote: document.querySelector("[data-seo-autogen-note]"),
  seoKeywordSummary: document.querySelector("[data-seo-keyword-summary]"),
  seoKeywordRows: document.querySelector("[data-seo-keyword-rows]"),
  seoKeywordBriefPreview: document.querySelector("[data-seo-keyword-brief-preview]"),
  seoKeywordRefresh: document.querySelector("[data-seo-keyword-refresh]"),
  linkedinRefresh: document.querySelector("[data-linkedin-refresh]"),
  linkedinTest: document.querySelector("[data-linkedin-test]"),
  linkedinConnect: document.querySelector("[data-linkedin-connect]"),
  linkedinDisconnect: document.querySelector("[data-linkedin-disconnect]"),
  linkedinGenerateDaily: document.querySelector("[data-linkedin-generate-daily]"),
  linkedinPause: document.querySelector("[data-linkedin-pause]"),
  linkedinCreatePost: document.querySelector("[data-linkedin-create-post]"),
  linkedinNotice: document.querySelector("[data-linkedin-notice]"),
  linkedinConnection: document.querySelector("[data-linkedin-connection]"),
  linkedinSummary: document.querySelector("[data-linkedin-summary]"),
  linkedinSettingsForm: document.querySelector("[data-linkedin-settings-form]"),
  linkedinEditorForm: document.querySelector("[data-linkedin-editor-form]"),
  linkedinRows: document.querySelector("[data-linkedin-post-rows]"),
  linkedinCopyText: document.querySelector("[data-linkedin-copy-text]"),
  linkedinDownloadImage: document.querySelector("[data-linkedin-download-image]"),
  metaRefresh: document.querySelector("[data-meta-refresh]"),
  metaTest: document.querySelector("[data-meta-test]"),
  metaConnect: document.querySelector("[data-meta-connect]"),
  metaDisconnect: document.querySelector("[data-meta-disconnect]"),
  metaLoadPages: document.querySelector("[data-meta-load-pages]"),
  metaGenerateNext: document.querySelector("[data-meta-generate-next]"),
  metaPause: document.querySelector("[data-meta-pause]"),
  metaNotice: document.querySelector("[data-meta-notice]"),
  metaConnection: document.querySelector("[data-meta-connection]"),
  metaPages: document.querySelector("[data-meta-pages]"),
  metaPageForm: document.querySelector("[data-meta-page-form]"),
  metaSummary: document.querySelector("[data-meta-summary]"),
  metaSettingsForm: document.querySelector("[data-meta-settings-form]"),
  metaEditorForm: document.querySelector("[data-meta-editor-form]"),
  metaRows: document.querySelector("[data-meta-post-rows]"),
  metaGeneratePlatform: document.querySelector("[data-meta-generate-platform]"),
  metaCopyCaption: document.querySelector("[data-meta-copy-caption]"),

  kpiForm: document.querySelector("[data-kpi-form]"),
  kpiReset: document.querySelector("[data-kpi-reset]"),
  parkingStats: document.querySelector("[data-parking-stats]"),
  parkingRows: document.querySelector("[data-parking-rows]"),
  parkingRefresh: document.querySelector("[data-parking-refresh]"),
  parkingProbeForm: document.querySelector("[data-parking-probe-form]"),
  parkingResult: document.querySelector("[data-parking-result]"),
  serviceStatusLink: document.querySelector("[data-admin-status-link]"),
  serviceStatusText: document.querySelector("[data-admin-status-text]"),
  serviceStatusSummary: document.querySelector("[data-service-status-summary]"),
  serviceStatusList: document.querySelector("[data-service-status-list]"),
  serviceStatusRefresh: document.querySelector("[data-service-status-refresh]"),
  releaseForms: document.querySelectorAll("[data-release-form]"),
  releaseRows: document.querySelectorAll("[data-release-rows]"),
  releaseConnectors: document.querySelectorAll("[data-release-connectors]"),
  releaseRefreshButtons: document.querySelectorAll("[data-release-refresh]"),
  videoForm: document.querySelector("[data-video-form]"),
  videoPanel: document.querySelector(".admin-video-panel"),
  videoPreview: document.querySelector("[data-video-preview]"),
  videoPreviewTopic: document.querySelector("[data-video-preview-topic]"),
  videoPreviewHeadline: document.querySelector("[data-video-preview-headline]"),
  videoPreviewBody: document.querySelector("[data-video-preview-body]"),
  videoPreviewTitle: document.querySelector("[data-video-preview-title]"),
  videoPreviewMeta: document.querySelector("[data-video-preview-meta]"),
  videoSocialCopy: document.querySelector("[data-video-social-copy]"),
  videoPreviewClip: document.querySelector("[data-video-preview-clip]"),
  videoStoryboard: document.querySelector("[data-video-storyboard]"),
  videoExport: document.querySelector("[data-video-export]"),
  videoBusy: document.querySelector("[data-video-busy]"),
  videoBusyMessage: document.querySelector("[data-video-busy-message]"),
  videoPipeline: document.querySelector("[data-video-pipeline]"),
  videoProjects: document.querySelector("[data-video-projects]"),
  videoRunwayPanel: document.querySelector("[data-video-runway-panel]"),
  videoRunwayModel: document.querySelector("[data-video-runway-model]"),
  videoRunwayDurationLabel: document.querySelector("[data-video-runway-duration-label]"),
  videoRunwayConfirm: document.querySelector("[data-video-runway-confirm]"),
  videoRunwayStatus: document.querySelector("[data-video-runway-status]"),
  videoRunwayEstimate: document.querySelector("[data-video-runway-estimate]"),
  videoRunwayRender: document.querySelector("[data-video-runway-render]"),
  videoRunwayPoll: document.querySelector("[data-video-runway-poll]"),
  videoRunwayImport: document.querySelector("[data-video-runway-import]"),
  videoReadiness: document.querySelector("[data-video-readiness]"),
  viralizaGenerate: document.querySelector("[data-viraliza-generate]"),
  viralizaMode: document.querySelector("[data-viraliza-mode]"),
  viralizaOpenSearch: document.querySelector("[data-viraliza-open-search]"),
  viralizaTitle: document.querySelector("[data-viraliza-title]"),
  viralizaSubtitle: document.querySelector("[data-viraliza-subtitle]"),
  viralizaFocusNote: document.querySelector("[data-viraliza-focus-note]"),
  viralizaKpis: document.querySelector("[data-viraliza-kpis]"),
  viralizaLayout: document.querySelector("[data-viraliza-layout]"),
  viralizaTheme: document.querySelector("[data-viraliza-theme]"),
  viralizaGoal: document.querySelector("[data-viraliza-goal]"),
  viralizaRoutineBlock: document.querySelector("[data-viraliza-routine-block]"),
  viralizaKeywordsBlock: document.querySelector("[data-viraliza-keywords-block]"),
  viralizaCommentsBlock: document.querySelector("[data-viraliza-comments-block]"),
  viralizaHooksBlock: document.querySelector("[data-viraliza-hooks-block]"),
  viralizaCreatorsBlock: document.querySelector("[data-viraliza-creators-block]"),
  viralizaOutreachBlock: document.querySelector("[data-viraliza-outreach-block]"),
  viralizaSavedVideosBlock: document.querySelector("[data-viraliza-saved-videos-block]"),
  viralizaResultsBlock: document.querySelector("[data-viraliza-results-block]"),
  viralizaResultsContent: document.querySelector("[data-viraliza-results-content]"),
  viralizaRoutine: document.querySelector("[data-viraliza-routine]"),
  viralizaKeywords: document.querySelector("[data-viraliza-keywords]"),
  viralizaComments: document.querySelector("[data-viraliza-comments]"),
  viralizaHooks: document.querySelector("[data-viraliza-hooks]"),
  viralizaCreators: document.querySelector("[data-viraliza-creators]"),
  viralizaOutreach: document.querySelector("[data-viraliza-outreach]"),
  viralizaSavedVideos: document.querySelector("[data-viraliza-saved-videos]"),
  viralizaExecution: document.querySelector("[data-viraliza-execution]"),
  viralizaSteps: document.querySelector("[data-viraliza-steps]"),
  viralizaContextForm: document.querySelector("[data-viraliza-context-form]"),
  viralizaContextOutput: document.querySelector("[data-viraliza-context-output]"),
  viralizaCreatorForm: document.querySelector("[data-viraliza-creator-form]"),
  viralizaImportJson: document.querySelector("[data-viraliza-import-json]"),
  viralizaImport: document.querySelector("[data-viraliza-import]"),
  viralizaDailyPlanRefresh: document.querySelector("[data-viraliza-daily-plan-refresh]"),
  viralizaRealCreators: document.querySelector("[data-viraliza-real-creators]"),
  viralizaDailyPlan: document.querySelector("[data-viraliza-daily-plan]"),
  viralizaResultForm: document.querySelector("[data-viraliza-result-form]"),
  viralizaLearningContent: document.querySelector("[data-viraliza-learning-content]"),
  viralizaLearningRefresh: document.querySelector("[data-viraliza-learning-refresh]")
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function tooltipAttrs(message) {
  if (!message) return "";
  const safeMessage = escapeHtml(message);
  return `data-tooltip="${safeMessage}" title="${safeMessage}" tabindex="0"`;
}

let adminTooltipEl = null;

function tooltipTargetFromEvent(event) {
  return event.target instanceof Element ? event.target.closest(".admin-linkedin-panel [data-tooltip], .admin-seo-performance-panel [data-tooltip]") : null;
}

function ensureAdminTooltip() {
  if (!adminTooltipEl) {
    adminTooltipEl = document.createElement("div");
    adminTooltipEl.className = "admin-floating-tooltip";
    adminTooltipEl.setAttribute("role", "tooltip");
    adminTooltipEl.hidden = true;
    document.body.append(adminTooltipEl);
  }
  return adminTooltipEl;
}

function positionAdminTooltip(target) {
  const tooltip = ensureAdminTooltip();
  const rect = target.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const gap = 10;
  const margin = 8;
  const topCandidate = rect.top - tooltipRect.height - gap;
  const top = topCandidate >= margin ? topCandidate : rect.bottom + gap;
  const left = Math.min(
    Math.max(rect.left + (rect.width / 2) - (tooltipRect.width / 2), margin),
    window.innerWidth - tooltipRect.width - margin
  );
  tooltip.style.left = `${Math.round(left)}px`;
  tooltip.style.top = `${Math.round(top)}px`;
}

function showAdminTooltip(target) {
  const message = target?.dataset?.tooltip;
  if (!message) return;
  const tooltip = ensureAdminTooltip();
  tooltip.textContent = message;
  tooltip.hidden = false;
  positionAdminTooltip(target);
}

function hideAdminTooltip() {
  if (adminTooltipEl) adminTooltipEl.hidden = true;
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function formatCompactDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function showStatus(message, tone = "neutral") {
  const target = els.app.hidden ? els.status : els.liveStatus;
  target.textContent = message || "";
  target.dataset.tone = tone;
}

function toLocalDatetimeValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function fromLocalDatetimeValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

function toLocalDateValue(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}

function parseLocalDateValue(value) {
  const normalized = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const date = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return toLocalDateValue(date) === normalized ? date : null;
}

function addLocalDays(date, days) {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

function defaultAnalyticsDateRange() {
  const to = new Date();
  const from = addLocalDays(to, -(ANALYTICS_DEFAULT_DAYS - 1));
  return {
    from: toLocalDateValue(from),
    to: toLocalDateValue(to)
  };
}

function normalizeAnalyticsDateRange(fromValue, toValue) {
  const defaults = defaultAnalyticsDateRange();
  let from = parseLocalDateValue(fromValue) || parseLocalDateValue(defaults.from);
  let to = parseLocalDateValue(toValue) || parseLocalDateValue(defaults.to);
  if (!from || !to) return defaults;
  if (from > to) [from, to] = [to, from];

  const earliest = addLocalDays(to, -(ANALYTICS_MAX_RANGE_DAYS - 1));
  if (from < earliest) from = earliest;

  return {
    from: toLocalDateValue(from),
    to: toLocalDateValue(to)
  };
}

function analyticsRangeParams(resource, range, extra = {}) {
  const params = new URLSearchParams({ resource, ...extra });
  params.set("from", range.from);
  params.set("to", range.to);
  return params;
}

function syncAnalyticsDateInputs() {
  els.analyticsFromInputs?.forEach((node) => {
    node.value = state.analytics.fromDate || "";
  });
  els.analyticsToInputs?.forEach((node) => {
    node.value = state.analytics.toDate || "";
  });
}

function readAnalyticsDateInputs() {
  const fromInput = Array.from(els.analyticsFromInputs || []).find((node) => node.value);
  const toInput = Array.from(els.analyticsToInputs || []).find((node) => node.value);
  const range = normalizeAnalyticsDateRange(
    fromInput?.value || state.analytics.fromDate,
    toInput?.value || state.analytics.toDate
  );
  state.analytics.fromDate = range.from;
  state.analytics.toDate = range.to;
  syncAnalyticsDateInputs();
  return range;
}

function formatDateOnly(value) {
  const date = parseLocalDateValue(value) || new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit"
  }).format(date);
}

function analyticsWindowLabel(payload = {}, fallbackDays = ANALYTICS_DEFAULT_DAYS) {
  if (payload.window_from_date && payload.window_to_date) {
    return `${formatDateOnly(payload.window_from_date)} - ${formatDateOnly(payload.window_to_date)}`;
  }
  return `${fallbackDays} dias`;
}

function authHeaders() {
  return {
    authorization: `Bearer ${state.token}`,
    "content-type": "application/json"
  };
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...authHeaders(),
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    const error = new Error(payload.message || payload.error || "admin_request_failed");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function adminAlertDismissKey(id) {
  return `${ALERT_DISMISS_PREFIX}${id}`;
}

function isAdminAlertDismissed(alert) {
  if (!alert?.id) return false;
  try {
    return localStorage.getItem(adminAlertDismissKey(alert.id)) === "1";
  } catch (error) {
    return false;
  }
}

function dismissAdminAlert(id) {
  try {
    localStorage.setItem(adminAlertDismissKey(id), "1");
  } catch (error) {
    return;
  }
}

function visibleAdminAlerts(alerts = []) {
  return alerts.filter((alert) => alert?.id && !isAdminAlertDismissed(alert));
}

function adminAlertSourceLabel(alert) {
  const source = String(alert?.origin || alert?.category || "system");
  const labels = {
    nightly_maintenance: "Mantenimiento nocturno",
    nightly_audit: "Auditoria nocturna",
    seo: "SEO",
    sales: "Ventas",
    system: "Sistema",
    viraliza: "Viraliza",
    waitlist: "Waitlist"
  };
  return labels[source] || source;
}

function adminAlertMeta(alert, severity) {
  const parts = [adminAlertSourceLabel(alert), severity];
  const createdAt = alert?.created_at || alert?.generated_at || alert?.timestamp;
  if (createdAt) parts.push(formatCompactDate(createdAt));
  if (alert?.read === false) parts.push("no leido");
  return parts.filter(Boolean).join(" · ");
}

function renderAdminAlerts(alerts = []) {
  state.alerts = Array.isArray(alerts) ? alerts : [];
  if (!els.alerts) return;
  const visibleAlerts = visibleAdminAlerts(state.alerts);
  if (!visibleAlerts.length) {
    els.alerts.innerHTML = "";
    els.alerts.hidden = true;
    return;
  }

  els.alerts.hidden = false;
  els.alerts.innerHTML = visibleAlerts
    .map((alert) => {
      const severity = String(alert.severity || "info").toLowerCase();
      const actionButton = alert.action_target
        ? `<button class="admin-alert-button" type="button" data-admin-alert-action="${escapeHtml(alert.id)}">${escapeHtml(alert.action_label || "Ir al evento")}</button>`
        : "";
      const dismissButton = alert.dismissible
        ? `<button class="admin-alert-button ghost" type="button" data-admin-alert-dismiss="${escapeHtml(alert.id)}">Desactivar notificación</button>`
        : "";
      return `
        <article class="admin-alert admin-alert--${escapeHtml(severity)}" data-admin-alert-id="${escapeHtml(alert.id)}">
          <div class="admin-alert-copy">
            <span>${escapeHtml(adminAlertMeta(alert, severity))}</span>
            <strong>${escapeHtml(alert.title || "Aviso operativo")}</strong>
            <p>${escapeHtml(alert.message || "Revisa este evento del BackOffice.")}</p>
          </div>
          <div class="admin-alert-actions">
            ${actionButton}
            ${dismissButton}
          </div>
        </article>`;
    })
    .join("");
}

function goToAdminAlertTarget(target) {
  const value = String(target || "").trim();
  if (!value) return;
  if (/^https?:\/\//i.test(value)) {
    window.open(value, "_blank", "noopener,noreferrer");
    return;
  }
  if (!value.startsWith("#")) return;

  if (value === "#seo-cron-secret" || value === "#seo-autogeneration") setAdminSubsection("marketing", "marketing-seo");
  if (value === "#operaciones-extension") setAdminSubsection("operaciones", "operaciones-extension");
  if (value === "#ventas-premium") setAdminSection("ventas");

  const targetEl = document.querySelector(value);
  if (targetEl) {
    targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  showStatus("No encuentro esa sección en este panel.", "neutral");
}

async function loadAlerts() {
  if (!els.alerts || !state.token) return;
  try {
    const payload = await api("/api/admin?resource=alerts");
    renderAdminAlerts(payload.alerts || []);
  } catch (error) {
    renderAdminAlerts([]);
  }
}
function requireLogin() {
  els.login.hidden = Boolean(state.token);
  els.app.hidden = !state.token;
  els.logout.hidden = !state.token;
}

function subsectionStateKey(group) {
  return group === "operaciones" ? "operacionesSubsection" : "marketingSubsection";
}

function subsectionGroupFromPanel(panelName) {
  return String(panelName || "").startsWith("operaciones-") ? "operaciones" : "marketing";
}

const VIRALIZA_SUBSECTION_AREAS = {
  "marketing-viraliza": "viraliza"
};

function viralizaAreaFromSubsection(value) {
  return VIRALIZA_SUBSECTION_AREAS[String(value || "")] || "";
}

function viralizaPanelAliases(value) {
  return Boolean(viralizaAreaFromSubsection(value));
}

function syncSubsectionPanels() {
  els.subsectionButtons.forEach((button) => {
    const group = button.dataset.adminSubsectionGroup || "marketing";
    const key = subsectionStateKey(group);
    const active = state.activeSection === group && state[key] === button.dataset.adminSubsectionButton;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });

  els.subsectionPanels.forEach((panel) => {
    const panelName = panel.dataset.adminSubsectionPanel || "";
    const group = subsectionGroupFromPanel(panelName);
    const key = subsectionStateKey(group);
    const selected = state[key];
    const aliasMatch = panelName === "marketing-viraliza" && viralizaPanelAliases(selected);
    panel.hidden = !(state.activeSection === group && (selected === panelName || aliasMatch));
  });

  els.subsectionEmptyStates.forEach((emptyState) => {
    const group = emptyState.dataset.adminSubsectionEmpty || "marketing";
    const key = subsectionStateKey(group);
    emptyState.hidden = !(state.activeSection === group && !state[key]);
  });
}

function setAdminSubsection(group, subsection) {
  const normalizedGroup = ["marketing", "operaciones"].includes(group) ? group : "marketing";
  const viralizaArea = normalizedGroup === "marketing" ? viralizaAreaFromSubsection(subsection) : "";
  state[subsectionStateKey(normalizedGroup)] = viralizaArea ? "marketing-viraliza" : subsection || "";
  if (viralizaArea) renderViraliza(state.viraliza.routine);
  setAdminSection(normalizedGroup);
}

function setAdminSection(section, options = {}) {
  const nextSection = ["ventas", "marketing", "kpis", "operaciones"].includes(section) ? section : "ventas";
  if (options.resetSubsection && nextSection === "marketing") state.marketingSubsection = "";
  if (options.resetSubsection && nextSection === "operaciones") state.operacionesSubsection = "";
  state.activeSection = nextSection;
  els.views.forEach((view) => {
    view.hidden = view.dataset.adminView !== state.activeSection;
  });
  els.sectionButtons.forEach((button) => {
    const active = button.dataset.adminSectionButton === state.activeSection;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  syncSubsectionPanels();
}

function slugId(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function chip(value, variant = "", kind = "status") {
  const label = escapeHtml(value || "-");
  const className = ["admin-chip", kind, variant].filter(Boolean).join(" ");
  const testId = kind === "score" ? `score-pill-${slugId(value)}` : `status-pill-${slugId(value)}`;
  return `<span class="${className}" data-testid="${escapeHtml(testId)}">${label}</span>`;
}

function statusTone(value) {
  const normalized = String(value || "").toLowerCase();
  if (["operational"].includes(normalized)) return "published";
  if (["degraded"].includes(normalized)) return "warn";
  if (["down"].includes(normalized)) return "bad";
  if (["unknown"].includes(normalized)) return "draft";
  if (["published", "active", "on_trial", "connected", "manually_published"].includes(normalized)) return "published";
  if (["ready", "ready_to_publish", "index", "paid", "scheduled", "pending_review"].includes(normalized)) return "ready";
  if (["cancelled", "expired", "needs_reauth", "needs_connection", "noindex", "unpaid", "payment_failed", "failed", "error", "disconnected"].includes(normalized)) return "bad";
  if (["past_due", "publishing"].includes(normalized)) return "warn";
  if (["draft", "image_pending", "needs_review", "manual", "skipped"].includes(normalized)) return "draft";
  if (["archived"].includes(normalized)) return "muted";
  return "draft";
}

function scoreTone(value) {
  const score = Number(value || 0);
  if (score >= 80) return "good";
  if (score >= 50) return "warn";
  return "bad";
}

const SEO_GATE_REASON_LABELS = {
  canonical_valid: "Canonical incorrecto",
  content_minimum: "Contenido insuficiente",
  faq_useful: "FAQ insuficiente",
  internal_links: "Faltan enlaces internos",
  measurable_cta: "CTA no medible",
  meta_unique: "Metas duplicadas",
  not_published: "No publicada",
  index_status_noindex: "Noindex",
  prudence_block: "Falta prudencia",
  quality_gate_failed: "Gate fallido",
  quality_score_below_80: "Score < 80",
  quality_score_minimum: "Score bajo",
  required_meta: "Metas incompletas",
  source_quality: "Fuente insuficiente",
  specific_content: "Contenido generico",
  third_party_independence: "Riesgo de afiliacion",
  uniqueness: "Duplicidad",
  not_street_exact: "Dato geografico confuso"
};

function seoGateLabel(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "passed") return "Gate OK";
  if (normalized === "failed") return "Falla gate";
  if (normalized === "not_calculated") return "No calculado";
  return "Gate ?";
}

function seoGateTone(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "passed") return "published";
  if (normalized === "failed") return "bad";
  if (normalized === "not_calculated") return "warn";
  return "draft";
}

function seoGateReasonLabel(reason) {
  const id = typeof reason === "string" ? reason : reason?.id;
  return SEO_GATE_REASON_LABELS[id] || String(id || "-");
}

function seoSitemapLabel(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "included") return "Sitemap: incluido";
  if (normalized === "legacy_compatible") return "Sitemap: legacy";
  if (normalized === "excluded") return "Sitemap: excluido";
  return "Sitemap: -";
}

function renderSeoGate(row = {}) {
  const failedChecks = Array.isArray(row.failed_checks) ? row.failed_checks : [];
  const failedText = failedChecks.length
    ? failedChecks.slice(0, 3).map(seoGateReasonLabel).join(" · ")
    : row.exclusion_reason
      ? seoGateReasonLabel(row.exclusion_reason)
      : seoSitemapLabel(row.sitemap_status);
  const recalc = row.needs_quality_gate_recalc ? " · recalcular" : "";
  return `
    <div>
      ${chip(seoGateLabel(row.quality_gate_status), seoGateTone(row.quality_gate_status))}
      <div class="admin-subtle">${escapeHtml(failedText || "-")}${escapeHtml(recalc)}</div>
      <div class="admin-subtle">${escapeHtml(row.quality_gate_action || seoSitemapLabel(row.sitemap_status))}</div>
    </div>
  `;
}

function stat(label, value, options = {}) {
  const id = options.id || slugId(label);
  const isZero = Number(value || 0) === 0;
  const tooltip = tooltipAttrs(options.tooltip);
  return `
    <div class="admin-stat${isZero ? " is-zero" : ""}" data-testid="stat-row-${escapeHtml(id)}"${tooltip ? ` ${tooltip}` : ""}>
      <div>
        <span>${escapeHtml(label)}</span>
        ${options.hint ? `<small>${escapeHtml(options.hint)}</small>` : ""}
      </div>
      <div class="admin-stat-value">
        <strong>${escapeHtml(value)}</strong>
        ${options.unit ? `<em>${escapeHtml(options.unit)}</em>` : ""}
        ${options.trend !== undefined ? chip(options.trend, scoreTone(options.trend), "score") : ""}
      </div>
    </div>
  `;
}

function serviceStatusLabel(value) {
  const normalized = String(value || "unknown").toLowerCase();
  return {
    operational: "Operativo",
    degraded: "Degradado",
    down: "Caido",
    unknown: "Sin verificar"
  }[normalized] || normalized;
}

function serviceDisplayName(service = {}) {
  return service.name || {
    public_web: "Web publica",
    api: "API",
    sitemap: "Sitemap",
    internal_data: "Datos internos",
    extension_version: "Versionado de extension",
    status_endpoint: "Status endpoint"
  }[service.id] || "Servicio";
}

function renderServiceStatusHeader(payload = {}) {
  if (!els.serviceStatusLink) return;
  const global = String(payload.status || "unknown").toLowerCase();
  const safeStatus = ["operational", "degraded", "down", "unknown"].includes(global) ? global : "unknown";
  const label = serviceStatusLabel(safeStatus);
  els.serviceStatusLink.dataset.state = safeStatus;
  els.serviceStatusLink.setAttribute("aria-label", `Abrir status page. Estado de servicios: ${label}`);
  els.serviceStatusLink.title = payload.updated_at ? `Actualizado: ${formatDate(payload.updated_at)}` : "Abrir status page";
  if (els.serviceStatusText) els.serviceStatusText.textContent = `Estado: ${label}`;
}

function renderServiceStatus(payload = {}) {
  const services = Array.isArray(payload.services) ? payload.services : [];
  const global = payload.status || "unknown";
  const operationalCount = services.filter((service) => service.status === "operational").length;
  const attentionCount = services.filter((service) => service.status !== "operational").length;
  state.serviceStatus = payload;
  renderServiceStatusHeader(payload);

  if (!els.serviceStatusSummary || !els.serviceStatusList) return;

  els.serviceStatusSummary.innerHTML = [
    stat("Estado global", serviceStatusLabel(global), {
      id: "service-status-global",
      hint: payload.updated_at ? formatDate(payload.updated_at) : "Sin fecha"
    }),
    stat("Operativos", `${operationalCount}/${services.length || 0}`, {
      id: "service-status-operational"
    }),
    stat("Con atencion", attentionCount, {
      id: "service-status-attention",
      hint: "Degradados, caidos o sin verificar"
    })
  ].join("");

  if (!services.length) {
    els.serviceStatusList.innerHTML = `<p class="admin-empty-state compact">No hay servicios publicados por /api/status.</p>`;
    return;
  }

  els.serviceStatusList.innerHTML = services
    .map((service) => {
      const serviceState = String(service.status || "unknown").toLowerCase();
      const latency = Number.isFinite(service.latency_ms) ? `${service.latency_ms} ms` : "sin latencia";
      return `
        <article class="admin-service-status-item" data-state="${escapeHtml(serviceState)}">
          <div>
            <strong>${escapeHtml(serviceDisplayName(service))}</strong>
            <p>${escapeHtml(service.message || "Estado no disponible.")}</p>
          </div>
          <div>
            ${chip(serviceStatusLabel(serviceState), statusTone(serviceState))}
            <small>${escapeHtml(latency)}</small>
          </div>
        </article>
      `;
    })
    .join("");
}

function getPath(source, path) {
  return String(path)
    .split(".")
    .reduce((acc, key) => (acc && Object.prototype.hasOwnProperty.call(acc, key) ? acc[key] : undefined), source);
}

function setPath(target, path, value) {
  const keys = String(path).split(".");
  let cursor = target;
  keys.slice(0, -1).forEach((key) => {
    if (!cursor[key] || typeof cursor[key] !== "object" || Array.isArray(cursor[key])) {
      cursor[key] = {};
    }
    cursor = cursor[key];
  });
  cursor[keys[keys.length - 1]] = value;
}

function renderStats(summary) {
  const premium = summary.premium || {};
  const byStatus = premium.by_status || {};
  const statusCount = (status) => Number(byStatus[status] || 0);
  els.env.textContent = summary.env?.lemonsqueezy_test_mode ? "Test mode" : "Live mode";
  els.env.dataset.mode = summary.env?.lemonsqueezy_test_mode ? "test" : "live";
  els.stats.innerHTML = [
    stat("Premium total", premium.total || 0, { id: "premium-total" }),
    stat("Premium active", statusCount("active") + statusCount("on_trial"), {
      id: "premium-active",
      hint: "Cuentas con suscripción activa esta semana"
    }),
    stat("On trial", statusCount("on_trial"), {
      id: "premium-trial",
      hint: "Pruebas activas pendientes de conversión"
    }),
    stat("Unpaid", statusCount("unpaid") + statusCount("past_due") + statusCount("payment_failed"), {
      id: "premium-unpaid",
      hint: "Pagos fallidos, pendientes o vencidos"
    }),
    stat("Canceladas", statusCount("cancelled") + statusCount("expired"), {
      id: "premium-cancelled",
      hint: "Suscripciones canceladas o expiradas"
    }),
    stat("Paid", statusCount("paid"), {
      id: "premium-paid",
      hint: "Eventos de pago confirmados"
    })
  ].join("");
}

function formatMoneyCents(cents, currency = "EUR") {
  const amount = Number(cents || 0) / 100;
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: currency || "EUR",
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2
    }).format(amount);
  } catch (error) {
    return `${amount.toFixed(Number.isInteger(amount) ? 0 : 2)} ${currency || "EUR"}`;
  }
}

function renderRevenue(revenue = {}) {
  if (!els.revenueSummary || !els.revenueChart) return;
  const currency = revenue.currency || "EUR";
  const months = revenue.months || [];
  const maxRevenue = Number(revenue.max_month_revenue_cents || Math.max(0, ...months.map((item) => Number(item.revenue_cents || 0))));
  const paymentCount = Number(revenue.payment_count || 0);

  els.revenueSummary.innerHTML = [
    stat("Ingresos 12m", formatMoneyCents(revenue.total_revenue_cents, currency), {
      id: "revenue-total",
      hint: `${paymentCount} cobros registrados`
    }),
    stat("Mes actual", formatMoneyCents(revenue.current_month_revenue_cents, currency), {
      id: "revenue-current-month",
      hint: "Cobros confirmados este mes"
    }),
    stat("Media mensual", formatMoneyCents(revenue.average_monthly_revenue_cents, currency), {
      id: "revenue-average",
      hint: "Media sobre la ventana visible"
    })
  ].join("");

  if (revenue.table_missing) {
    els.revenueChart.innerHTML = `<p class="admin-empty-state compact">Falta la tabla <strong>premium_revenue_events</strong>. Ejecuta <strong>database/premium-revenue-events.sql</strong> y los siguientes webhooks de Lemon empezarán a llenar la gráfica.</p>`;
    return;
  }

  const bars = months
    .map((month) => {
      const value = Number(month.revenue_cents || 0);
      const height = maxRevenue ? Math.max(5, Math.round((value / maxRevenue) * 100)) : 3;
      return `
        <div class="admin-revenue-month" title="${escapeHtml(month.label)}: ${escapeHtml(formatMoneyCents(value, currency))}">
          <div class="admin-revenue-track"><i style="--revenue-height:${height}%"></i></div>
          <strong>${escapeHtml(month.label || "-")}</strong>
          <span>${escapeHtml(formatMoneyCents(value, currency))}</span>
        </div>
      `;
    })
    .join("");

  els.revenueChart.innerHTML = `
    ${paymentCount ? "" : `<p class="admin-empty-state compact">Sin cobros registrados todavía. La gráfica se llenará con eventos de pago reales.</p>`}
    <div class="admin-revenue-bars">${bars}</div>
  `;
}

function formatDuration(seconds) {
  const total = Number(seconds || 0);
  if (!total) return "0 min";
  const hours = Math.floor(total / 3600);
  const minutes = Math.round((total % 3600) / 60);
  if (hours) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)} min`;
}

function renderUsageList(title, rows) {
  const items = (rows || []).slice(0, 6);
  const total = items.reduce((sum, item) => sum + Number(item.count || 0), 0) || 1;
  return `
    <section class="admin-extension-card">
      <span>${escapeHtml(title)}</span>
      ${
        items.length
          ? items
              .map((item) => {
                const pct = Math.max(4, Math.round((Number(item.count || 0) / total) * 100));
                return `
                  <div class="admin-extension-row">
                    <strong>${escapeHtml(item.label || "unknown")}</strong>
                    <em>${escapeHtml(item.count || 0)}</em>
                    <i style="--usage-pct:${pct}%"></i>
                  </div>
                `;
              })
              .join("")
          : `<p class="admin-empty-state compact">Sin datos todavía.</p>`
      }
    </section>
  `;
}

function renderExtensionUsage(payload) {
  if (!els.extensionStats || !els.extensionBreakdown) return;
  if (!payload?.ok && payload?.table_missing) {
    els.extensionStats.innerHTML = [
      stat("Usuarios 30d", 0, { id: "extension-users", hint: "Ejecuta database/extension-usage-events.sql" }),
      stat("Activos 7d", 0, { id: "extension-active-7d" }),
      stat("Sesiones 30d", 0, { id: "extension-sessions" }),
      stat("Tiempo uso", "0 min", { id: "extension-usage-time" })
    ].join("");
    els.extensionBreakdown.innerHTML = `<p class="admin-empty-state compact">Falta la tabla <strong>extension_usage_events</strong>. Cuando exista y la extensión envíe eventos, aquí aparecerán navegador, país, versión y eventos.</p>`;
    return;
  }

  els.extensionStats.innerHTML = [
    stat("Usuarios 30d", payload.unique_users_30d || 0, {
      id: "extension-users",
      hint: "Personas anónimas distintas usando la extensión"
    }),
    stat("Activos 7d", payload.active_users_7d || 0, {
      id: "extension-active-7d",
      hint: `${payload.active_users_24h || 0} activos en 24h`
    }),
    stat("Sesiones 30d", payload.sessions_30d || 0, {
      id: "extension-sessions",
      hint: `${payload.total_events || 0} eventos registrados`
    }),
    stat("Tiempo uso", formatDuration(payload.active_seconds_30d), {
      id: "extension-usage-time",
      hint: `Media sesión ${formatDuration(payload.average_session_seconds)}`
    })
  ].join("");

  els.extensionBreakdown.innerHTML = [
    renderUsageList("Navegador", payload.by_browser),
    renderUsageList("País", payload.by_country),
    renderUsageList("Version", payload.by_extension_version),
    renderUsageList("Evento", payload.by_event_name)
  ].join("");
}

function formatRate(value) {
  const number = Number(value || 0);
  return `${number.toFixed(number >= 10 ? 0 : 1)}%`;
}

const analyticsKpiTooltips = Object.freeze({
  events: "Eventos anónimos propios recogidos para el funnel SEO en la ventana seleccionada. Sirve como volumen base, no como usuarios únicos.",
  pageViews: "Vistas de páginas SEO registradas en la ventana seleccionada. No equivale a usuarios únicos ni a impresiones orgánicas.",
  installIntent: "Clics hacia Chrome Web Store o hacia el flujo de instalación. Mide intención, no instalación real.",
  chromeStore: "Usuarios o sesiones que han hecho clic hacia Chrome Web Store o hacia el flujo de instalación. Mide intención, no instalación real.",
  calculator: "Eventos de calculadora usada/completada en páginas SEO. Mide interacción cualificada, no checkout ni instalación.",
  scroll: "Eventos de profundidad de scroll al 50%/90% en páginas SEO. Mide lectura o interacción, no conversión.",
  waitlist: "Registros en waitlist desde el funnel. Mide interés declarado, no checkout, pago ni instalación.",
  checkout: "Checkouts creados o iniciados respecto al paso anterior del funnel. No equivale necesariamente a pago completado.",
  visits: "Visitas o page views registradas para esta página SEO dentro de la ventana seleccionada.",
  score: "Puntuación interna basada en intención de instalación, checkout, waitlist, calculadora, scroll e interacción. No es una nota SEO sobre 100."
});

function analyticsPageHref(row = {}) {
  const raw = String(row.page_path || row.page_url || row.page || row.slug || "").trim();
  if (!raw || raw === "unknown") return "";
  try {
    const url = new URL(raw, window.location.origin);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.href;
  } catch (error) {
    return "";
  }
}

function analyticsRow(row = {}) {
  const label = row.page || row.page_path || row.slug || "unknown";
  const href = analyticsPageHref(row);
  const detail = [row.template_type, row.city, row.topic].filter(Boolean).join(" · ") || row.content_type || "página";
  return `
    <article class="admin-analytics-item">
      <div class="admin-analytics-item-head">
        <div>
          <strong>${escapeHtml(label)}</strong>
          <span>${escapeHtml(detail)}</span>
        </div>
        ${href ? `<a class="admin-button tiny ghost admin-analytics-page-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">Ver p&aacute;gina</a>` : ""}
      </div>
      <dl>
        <div><dt ${tooltipAttrs(analyticsKpiTooltips.visits)}>Visitas</dt><dd>${escapeHtml(row.visits || 0)}</dd></div>
        <div><dt ${tooltipAttrs(analyticsKpiTooltips.installIntent)}>Intención</dt><dd>${escapeHtml(formatRate(row.install_rate))}</dd></div>
        <div><dt ${tooltipAttrs(analyticsKpiTooltips.calculator)}>Calc</dt><dd>${escapeHtml(row.calculator_used_count || 0)}/${escapeHtml(row.calculator_completed_count || 0)}</dd></div>
        <div><dt ${tooltipAttrs(analyticsKpiTooltips.scroll)}>Scroll</dt><dd>${escapeHtml(row.scroll_depth_50_count || 0)}/${escapeHtml(row.scroll_depth_90_count || 0)}</dd></div>
        <div><dt ${tooltipAttrs(analyticsKpiTooltips.checkout)}>Checkout</dt><dd>${escapeHtml(row.checkout_created_count || 0)}</dd></div>
        <div><dt ${tooltipAttrs(analyticsKpiTooltips.score)}>Índice interno</dt><dd>${escapeHtml(row.performance_score || 0)}</dd></div>
      </dl>
    </article>
  `;
}

function analyticsRecommendation(item = {}) {
  return `
    <article class="admin-learning-item">
      <span>${escapeHtml(item.priority || "low")} · ${escapeHtml(item.action || "recommendation")}</span>
      <strong>${escapeHtml(item.title || "Acumular mas datos")}</strong>
      <p>${escapeHtml(item.detail || "Todavia no hay senal suficiente.")}</p>
      ${item.source_page ? `<small>${escapeHtml(item.source_page)}</small>` : ""}
    </article>
  `;
}

function analyticsSignal(item = {}) {
  const type = item.type || "signal";
  const title =
    type === "calculator_to_install"
      ? `Calculadora + intención en ${item.page || "página"}`
      : type === "calculator_low_conversion"
        ? `Calculadora con baja conversión en ${item.page || "página"}`
        : `Interacción alta sin intención en ${item.page || "página"}`;
  const detail =
    item.reason ||
    (type === "calculator_to_install"
      ? `${item.sessions_with_calculator_then_install || 0}/${item.sessions_with_calculator || 0} sesiones con intención posterior`
      : "Señal de comportamiento SEO detectada.");
  return `
    <article class="admin-learning-item">
      <span>signal - ${escapeHtml(type)}</span>
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(detail)}</p>
      ${item.city ? `<small>${escapeHtml(item.city)}</small>` : ""}
    </article>
  `;
}

function analyticsSignals(payload = {}) {
  return [
    ...(payload.high_interaction_low_install || []),
    ...(payload.calculator_install_pages || []),
    ...(payload.calculator_low_conversion || [])
  ];
}

function analyticsPanelTargets(panel) {
  return {
    summary: panel?.querySelector("[data-analytics-summary]") || els.analyticsSummary,
    pages: panel?.querySelector("[data-analytics-pages]") || els.analyticsPages,
    segments: panel?.querySelector("[data-analytics-segments]") || null,
    learning: panel?.querySelector("[data-analytics-learning]") || els.analyticsLearning
  };
}

function analyticsSegmentGroup(title, items = []) {
  const rows = Array.isArray(items) ? items.filter((item) => item?.label && item.label !== "unknown").slice(0, 5) : [];
  const content = rows.length
    ? rows
        .map(
          (item) => `
            <div class="admin-analytics-segment">
              <strong>${escapeHtml(item.label)}</strong>
              <span>${escapeHtml(item.count || 0)} eventos - ${escapeHtml(item.install_clicks || 0)} intención - ${escapeHtml(item.checkout_created || 0)} checkout</span>
            </div>
          `
        )
        .join("")
    : `<p class="admin-empty-state compact">Sin datos suficientes.</p>`;
  return `
    <section class="admin-analytics-segment-group">
      <h4>${escapeHtml(title)}</h4>
      ${content}
    </section>
  `;
}

function renderAnalyticsPanel(targets, payload, context = {}) {
  if (!targets.summary || !targets.pages || !targets.learning) return;
  const summary = payload.summary || {};
  const pages = payload.top_pages || payload.pages || [];
  const recommendations = payload.recommendations || [];
  const signals = analyticsSignals(payload);
  const days = Number(payload.window_days || state.analytics.days || 7);
  const windowLabel = analyticsWindowLabel(payload, days);

  targets.summary.innerHTML = [
    stat("Eventos", summary.total_events || 0, {
      id: "analytics-events",
      hint: payload.table_missing ? "Ejecuta database/owned-analytics-events.sql" : `${windowLabel} - eventos anónimos propios`,
      tooltip: analyticsKpiTooltips.events
    }),
    stat("Page views", summary.page_views || 0, {
      id: "analytics-page-views",
      tooltip: analyticsKpiTooltips.pageViews
    }),
    stat("Intención instalación", (summary.install_clicks || 0) + (summary.chrome_store_clicks || 0), {
      id: "analytics-install-intent",
      hint: `${formatRate(summary.install_click_rate)} click/view. No confirma instalación real.`,
      tooltip: analyticsKpiTooltips.installIntent
    }),
    stat("Chrome Store", summary.chrome_store_clicks || 0, {
      id: "analytics-chrome-store",
      hint: "Salidas hacia Chrome Web Store",
      tooltip: analyticsKpiTooltips.chromeStore
    }),
    stat("Calculadora", `${summary.calculator_used || 0}/${summary.calculator_completed || 0}`, {
      id: "analytics-calculators",
      hint: `${formatRate(summary.calculator_completion_rate)} completadas`,
      tooltip: analyticsKpiTooltips.calculator
    }),
    stat("Scroll", `${summary.scroll_depth_50 || 0}/${summary.scroll_depth_90 || 0}`, {
      id: "analytics-scroll",
      hint: "50/90 de profundidad",
      tooltip: analyticsKpiTooltips.scroll
    }),
    stat("Waitlist", summary.waitlist_submit || 0, {
      id: "analytics-waitlist",
      tooltip: analyticsKpiTooltips.waitlist
    }),
    stat("Checkout", summary.checkout_created || 0, {
      id: "analytics-checkout",
      hint: `${formatRate(summary.checkout_created_rate)} creado/iniciado`,
      tooltip: analyticsKpiTooltips.checkout
    })
  ].join("");

  if (payload.table_missing || (payload.warning && !payload.persisted)) {
    const message = payload.table_missing
      ? "Falta la tabla <strong>owned_analytics_events</strong>. Ejecuta <strong>database/owned-analytics-events.sql</strong> en Supabase para activar el ranking."
      : "Analytics propio esta en modo degradado. Revisa Supabase o vuelve a cargar cuando el backend este configurado.";
    targets.pages.innerHTML = `<p class="admin-empty-state compact">${message}</p>`;
    targets.learning.innerHTML = `<p class="admin-empty-state compact">El aprendizaje aparecerá cuando existan eventos anónimos de visitas, intención de instalación y checkout.</p>`;
    if (targets.segments) targets.segments.innerHTML = `<p class="admin-empty-state compact">Sin segmentos por ciudad o template.</p>`;
    return;
  }

  targets.pages.innerHTML = pages.length
    ? pages.slice(0, context.pageLimit || 8).map(analyticsRow).join("")
    : `<p class="admin-empty-state compact">Aún no hay páginas con eventos suficientes.</p>`;

  if (targets.segments) {
    targets.segments.innerHTML = [
      analyticsSegmentGroup("Ciudades", payload.top_cities),
      analyticsSegmentGroup("Templates", payload.top_templates),
      analyticsSegmentGroup("Temas", payload.top_topics)
    ].join("");
  }

  targets.learning.innerHTML = recommendations.length || signals.length
    ? [
        ...recommendations.slice(0, 5).map(analyticsRecommendation),
        ...signals.slice(0, 4).map(analyticsSignal)
      ].join("")
    : `<p class="admin-empty-state compact">Sin recomendaciones todavía. Se generarán al acumular conversiones.</p>`;
}

function renderAnalyticsPerformance(payload = {}) {
  const summary = payload.summary || {};
  const pages = payload.top_pages || payload.pages || [];
  const days = Number(payload.window_days || state.analytics.days || 7);
  const panels = els.analyticsPanels?.length ? Array.from(els.analyticsPanels) : [];
  const targets = panels.length
    ? panels.map((panel) => analyticsPanelTargets(panel))
    : [analyticsPanelTargets(null)];

  if (!targets.length || targets.every((target) => !target.summary || !target.pages || !target.learning)) return;

  state.analytics.days = [1, 7, 30, 90].includes(days) ? days : 7;
  state.analytics.summary = summary;
  state.analytics.pages = pages;
  state.analytics.learning = payload;
  state.analytics.warning = payload.warning || payload.pages_warning || payload.learning_warning || "";
  const normalizedRange = normalizeAnalyticsDateRange(payload.window_from_date || state.analytics.fromDate, payload.window_to_date || state.analytics.toDate);
  state.analytics.fromDate = normalizedRange.from;
  state.analytics.toDate = normalizedRange.to;
  syncAnalyticsDateInputs();

  targets.forEach((target) => renderAnalyticsPanel(target, payload));
}
function renderParkingStats(payload) {
  if (!els.parkingStats) return;
  els.parkingStats.innerHTML = [
    stat("Cache total", payload.total_cache_rows || 0, { id: "cache-total", unit: "entradas" }),
    stat("Cache vigente", payload.valid_cache_rows || 0, { id: "cache-vigente", hint: "Entradas con TTL activo" }),
    stat("Assessments", payload.assessments_total || 0, { id: "assessments" }),
    stat("Score medio", payload.average_score || 0, { id: "score-medio", unit: "/10", trend: payload.average_score || 0 })
  ].join("");
}

function renderParkingRows(rows) {
  if (!els.parkingRows) return;
  if (!rows.length) {
    els.parkingRows.innerHTML = `<tr><td colspan="5">No hay cálculos de parking cacheados todavía.</td></tr>`;
    return;
  }

  els.parkingRows.innerHTML = rows
    .map((row) => {
      if (Object.prototype.hasOwnProperty.call(row, "overall_score")) {
        const score = Number(row.overall_score || 0);
        const confidence = Number(row.confidence_score || 0);
        return `
          <tr>
            <td>
              <strong>${escapeHtml(row.address_text || row.street || row.source_url || "-")}</strong>
              <div class="admin-subtle">${escapeHtml([row.zone_name, row.district, row.municipality].filter(Boolean).join(" / ") || "-")}</div>
            </td>
            <td>${chip(`${score}/10 - ${row.overall_label || "-"}`, score >= 7 ? "bad" : score <= 4 ? "published" : "warn")}</td>
            <td>${chip(confidence.toFixed(2), confidence >= 0.7 ? "published" : "draft")}</td>
            <td>${escapeHtml(row.profile || "general")}</td>
            <td>
              ${escapeHtml(formatDate(row.last_checked_at))}
              <div class="admin-subtle">${escapeHtml(row.status || "-")}</div>
            </td>
          </tr>
        `;
      }

      const score = Number(row.score || 0);
      const confidence = Number(row.confidence_score || 0);
      const expired = row.expires_at && new Date(row.expires_at).getTime() <= Date.now();
      return `
        <tr>
          <td>
            <strong>${escapeHtml(row.city || row.geohash || "-")}</strong>
            <div class="admin-subtle">${escapeHtml(row.geohash || "-")} - ${escapeHtml(row.radius_m || 500)} m</div>
          </td>
          <td>${chip(`${score}/10 - ${row.label || "-"}`, score >= 7 ? "bad" : score <= 4 ? "published" : "warn")}</td>
          <td>${chip(confidence.toFixed(2), confidence >= 0.7 ? "published" : "draft")}</td>
          <td>${escapeHtml(row.perspective || "visitor")}</td>
          <td>
            ${escapeHtml(formatDate(row.expires_at))}
            <div class="admin-subtle">${expired ? "caducado" : "vigente"}</div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function releaseTargetLabel(target) {
  return {
    web: "Web",
    extension: "Extensión",
    backoffice: "Backoffice"
  }[target] || target;
}

function releaseRowsElement(target) {
  return Array.from(els.releaseRows).find((node) => node.dataset.releaseRows === target);
}

function releaseConnectorsElement(target) {
  return Array.from(els.releaseConnectors).find((node) => node.dataset.releaseConnectors === target);
}

function formatBytes(bytes) {
  const size = Number(bytes || 0);
  if (!size) return "-";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function connectorCard(connector) {
  return `
    <article class="admin-release-connector ${connector.configured ? "is-ready" : "is-missing"}">
      <div>
        <strong>${escapeHtml(connector.label)}</strong>
        <span>${escapeHtml(connector.configured ? "Configurado" : "Pendiente")}</span>
      </div>
      <p>${escapeHtml(connector.purpose || "")}</p>
    </article>
  `;
}

function renderReleaseConnectors(target, connectors = {}) {
  const targetEl = releaseConnectorsElement(target);
  if (!targetEl) return;
  const items = connectors[target] || [];
  targetEl.innerHTML = items.length
    ? items.map(connectorCard).join("")
    : `<p class="admin-empty-state compact">Sin conectores definidos para ${escapeHtml(releaseTargetLabel(target))}.</p>`;
}

function releaseChromeActions(row) {
  const connector = String(row.connector_target || "").toLowerCase();
  if (row.target !== "extension" || connector !== "chrome") return "";
  const id = escapeHtml(row.id || "");
  return `
    <div class="admin-row-actions">
      <button class="admin-button tiny ghost" type="button" data-release-chrome-action="status" data-release-id="${id}">Estado Chrome</button>
      <button class="admin-button tiny ghost" type="button" data-release-chrome-action="upload" data-release-id="${id}">Subir ZIP</button>
      <button class="admin-button tiny" type="button" data-release-chrome-action="publish" data-release-id="${id}">Enviar revisión</button>
    </div>
  `;
}

function renderReleaseRows(target, payload = {}) {
  const targetEl = releaseRowsElement(target);
  if (!targetEl) return;
  renderReleaseConnectors(target, payload.connectors || {});
  const rows = payload.artifacts || [];
  state.releases[target] = rows;

  if (payload.table_missing) {
    targetEl.innerHTML = `<tr><td colspan="4">Falta la tabla release_artifacts. Ejecuta database/release-artifacts.sql.</td></tr>`;
    return;
  }
  if (!rows.length) {
    targetEl.innerHTML = `<tr><td colspan="4">Aún no hay artefactos de ${escapeHtml(releaseTargetLabel(target))} guardados.</td></tr>`;
    return;
  }

  targetEl.innerHTML = rows
    .map((row) => `
      <tr>
        <td>
          <strong>${escapeHtml(row.version || "-")}</strong>
          <div class="admin-subtle">${escapeHtml(row.title || "-")}</div>
          <div class="admin-subtle">${escapeHtml(formatDate(row.created_at))}</div>
        </td>
        <td>
          ${chip(row.channel || "draft", statusTone(row.channel))}
          <div class="admin-subtle">${escapeHtml(row.connector_target || row.artifact_kind || "-")}</div>
        </td>
        <td>
          <strong>${escapeHtml(row.file_name || row.artifact_kind || "-")}</strong>
          <div class="admin-subtle">${escapeHtml(formatBytes(row.file_size_bytes))}</div>
          <div class="admin-subtle">${escapeHtml(row.sha256 ? `sha ${row.sha256.slice(0, 10)}` : row.storage_path || "-")}</div>
        </td>
        <td>
          ${chip(row.status || "draft", statusTone(row.status))}
          ${releaseChromeActions(row)}
        </td>
      </tr>
    `)
    .join("");
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function releaseFilePayload(file) {
  if (!file) return {};
  if (file.size > MAX_RELEASE_FILE_BYTES) {
    throw new Error("Archivo demasiado grande para guardar inline. Usa Storage cuando activemos paquetes grandes.");
  }
  const buffer = await file.arrayBuffer();
  return {
    file_name: file.name,
    mime_type: file.type || "application/octet-stream",
    file_size_bytes: file.size,
    sha256: await sha256Hex(buffer),
    artifact_payload: {
      encoding: "base64",
      content_base64: arrayBufferToBase64(buffer)
    }
  };
}

async function releasePayloadFromForm(form) {
  const data = new FormData(form);
  const file = data.get("artifact_file");
  return {
    target: form.dataset.releaseTarget,
    version: String(data.get("version") || "").trim(),
    title: String(data.get("title") || "").trim(),
    channel: String(data.get("channel") || "draft"),
    status: "draft",
    artifact_kind: String(data.get("artifact_kind") || "bundle"),
    connector_target: String(data.get("connector_target") || "").trim(),
    notes: String(data.get("notes") || "").trim(),
    ...(await releaseFilePayload(file && file.name ? file : null))
  };
}

async function saveReleaseArtifact(form) {
  const target = form.dataset.releaseTarget;
  const payload = await releasePayloadFromForm(form);
  await api("/api/admin?resource=operations/releases", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  form.reset();
  await loadReleaseArtifacts(target);
  showStatus(`${releaseTargetLabel(target)} guardado en backoffice.`, "good");
}

async function runChromeReleaseAction(action, artifactId, button) {
  if (action === "publish" && !window.confirm("¿Enviar este ZIP a revisión/publicación en Chrome Web Store?")) return;
  const label = {
    status: "leyendo estado de Chrome",
    upload: "subiendo ZIP a Chrome",
    publish: "enviando a revisión en Chrome"
  }[action] || "ejecutando acción de Chrome";
  showStatus(`Chrome: ${label}...`);
  if (button) button.disabled = true;
  try {
    const payload = await api("/api/admin?resource=operations/chrome", {
      method: "POST",
      body: JSON.stringify({
        action,
        artifact_id: artifactId,
        publish_type: "DEFAULT_PUBLISH"
      })
    });
    await loadReleaseArtifacts("extension");
    showStatus(payload.message || "Acción de Chrome completada.", "good");
  } finally {
    if (button) button.disabled = false;
  }
}

function premiumDetail(label, value) {
  if (!value) return "";
  return `<div class="admin-subtle"><b>${escapeHtml(label)}:</b> ${escapeHtml(value)}</div>`;
}

function premiumDateDetail(label, value) {
  if (!value) return "";
  return premiumDetail(label, formatDate(value));
}

function renderPremium(rows) {
  if (!rows.length) {
    els.premiumRows.innerHTML = `<tr><td colspan="6">No hay suscripciones con este filtro.</td></tr>`;
    return;
  }

  els.premiumRows.innerHTML = rows
    .map(
      (row) => `
      <tr>
        <td>
          <strong>${escapeHtml(row.email || "-")}</strong>
          ${premiumDetail("customer", row.provider_customer_id)}
        </td>
        <td>${chip(row.status, statusTone(row.status))}</td>
        <td>
          <strong>${escapeHtml(row.provider || "-")}</strong>
          ${premiumDetail("product", row.product_id)}
          ${premiumDetail("variant", row.variant_id)}
        </td>
        <td>
          ${premiumDetail("subscription", row.provider_subscription_id)}
          ${premiumDetail("order", row.provider_order_id)}
        </td>
        <td>
          ${premiumDateDetail("renueva", row.renews_at)}
          ${premiumDateDetail("trial", row.trial_ends_at)}
          ${premiumDateDetail("termina", row.ends_at)}
          ${premiumDateDetail("creada", row.created_at)}
          ${premiumDateDetail("actualizada", row.updated_at)}
        </td>
        <td>${escapeHtml(row.event_name || "-")}</td>
      </tr>
    `
    )
    .join("");
}

function renderSeo(payload) {
  const rows = payload.landings || [];
  state.seo.page = Number(payload.page || state.seo.page || 1);
  state.seo.pageSize = Number(payload.page_size || state.seo.pageSize || 10);
  state.seo.hasNextPage = Boolean(payload.has_next_page);
  state.seo.hasPreviousPage = Boolean(payload.has_previous_page);
  renderSeoSummary(payload.summary || {}, rows);

  if (!rows.length) {
    els.seoRows.innerHTML = `<tr><td colspan="6">No hay landings con este filtro.</td></tr>`;
    renderSeoPagination(payload);
    return;
  }

  els.seoRows.innerHTML = rows
    .map((row) => {
      const href = `/${String(row.slug || "").replace(/^\/+|\/+$/g, "")}/`;
      return `
        <tr>
          <td>
            <a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(row.title || row.slug)}</a>
            <div class="admin-subtle">${escapeHtml(row.slug)} · ${escapeHtml(row.word_count || 0)} palabras</div>
          </td>
          <td>${escapeHtml(row.city || "-")}</td>
          <td>${chip(Number(row.quality_score || 0).toFixed(0), scoreTone(row.quality_score), "score")}</td>
          <td>${renderSeoGate(row)}</td>
          <td>
            ${chip(row.status, statusTone(row.status))}
            ${chip(row.index_status, statusTone(row.index_status))}
          </td>
          <td>
            <div class="admin-row-actions">
              <button class="admin-icon-button" type="button" data-seo-action="regenerate" data-slug="${escapeHtml(row.slug)}" aria-label="Regenerar landing">R</button>
              <button class="admin-icon-button" type="button" data-seo-action="recalculate_quality_gate" data-slug="${escapeHtml(row.slug)}" aria-label="Recalcular quality gate" title="Recalcular gate">Q</button>
              <button class="admin-icon-button" type="button" data-seo-action="publish" data-slug="${escapeHtml(row.slug)}" aria-label="Publicar landing">P</button>
              <button class="admin-icon-button" type="button" data-seo-action="noindex" data-slug="${escapeHtml(row.slug)}" aria-label="Marcar noindex">N</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
  renderSeoPagination(payload);
}

function renderSeoSummary(summary = {}, fallbackRows = []) {
  if (!els.seoSummary) return;
  const rows = Array.isArray(fallbackRows) ? fallbackRows : [];
  const fallbackTotal = rows.length;
  const total = Number(summary.total_landings ?? fallbackTotal);
  const published = Number(summary.published ?? rows.filter((row) => row.status === "published").length);
  const pending = Number(summary.pending_landings ?? rows.filter((row) => ["draft", "needs_review", "ready_to_publish"].includes(row.status)).length);
  const ready = Number(summary.ready_to_publish ?? rows.filter((row) => row.status === "ready_to_publish").length);
  const needsReview = Number(summary.needs_review ?? rows.filter((row) => row.status === "needs_review").length);
  const noindex = Number(summary.noindex ?? rows.filter((row) => row.index_status === "noindex" || row.status === "noindex").length);
  const opportunities = Number(summary.pending_opportunities ?? 0);
  const qualityGate = summary.quality_gate || {};
  const landingsToday = Number(summary.published_landings_today ?? 0);
  const newsToday = Number(summary.published_news_today ?? 0);
  const targetLandings = Number(summary.target_landings_per_day ?? 2);
  const targetNews = Number(summary.target_news_per_day ?? 2);
  const dailyStatus = summary.seo_daily_status === "complete" ? "completo" : "pendiente";
  const averageScore = Number(summary.average_quality_score ?? 0);

  els.seoSummary.innerHTML = [
    stat("Total", total, { id: "seo-total", hint: "Landings SEO creadas" }),
    stat("Publicadas", published, { id: "seo-published", hint: "Visibles e indexables" }),
    stat("Hoy landings", `${landingsToday}/${targetLandings}`, { id: "seo-today-landings", hint: "Objetivo diario programatico" }),
    stat("Hoy guias", `${newsToday}/${targetNews}`, { id: "seo-today-guides", hint: `Objetivo diario editorial - ${dailyStatus}` }),
    stat("Pendientes", pending, { id: "seo-pending", hint: "Draft + revision + ready" }),
    stat("Ready", ready, { id: "seo-ready", hint: "Listas para publicar" }),
    stat("Revision", needsReview, { id: "seo-review", hint: "Necesitan criterio humano" }),
    stat("Noindex", noindex, { id: "seo-noindex", hint: "Bloqueadas para indice" }),
    stat("Gate falla", Number(qualityGate.failed ?? 0), { id: "seo-gate-failed", hint: "Quality gate con checks fallidos" }),
    stat("Gate legacy", Number(qualityGate.not_calculated ?? 0), { id: "seo-gate-legacy", hint: "Sin quality_gate calculado" }),
    stat("Oportunidades", opportunities, { id: "seo-opportunities", hint: "Pendientes de generar" }),
    stat("Score medio", averageScore ? averageScore.toFixed(0) : 0, { id: "seo-average-score", unit: "/100", hint: "Solo landings con score" })
  ].join("");
}

function seoKeywordIntentLabel(value) {
  return String(value || "").replace(/_/g, " ");
}

function renderSeoKeywordSummary(summary = {}) {
  if (!els.seoKeywordSummary) return;
  els.seoKeywordSummary.innerHTML = [
    stat("Keywords", Number(summary.total || 0), { id: "seo-keywords-total", hint: "Backlog controlado" }),
    stat("Brief ready", Number(summary.brief_ready || 0), { id: "seo-keywords-ready", hint: "Listas para revisar" }),
    stat("Alta prioridad", Number(summary.high_priority || 0), { id: "seo-keywords-high", hint: "Prioridad >= 80" })
  ].join("");
}

function renderSeoKeywordBacklog(payload = {}) {
  if (!els.seoKeywordRows) return;
  const keywords = Array.isArray(payload.keywords) ? payload.keywords : [];
  state.seoKeywordBacklog.keywords = keywords;
  state.seoKeywordBacklog.briefsById = new Map(keywords.filter((item) => item.brief).map((item) => [item.id, item.brief]));
  renderSeoKeywordSummary(payload.summary || {});

  if (!keywords.length) {
    els.seoKeywordRows.innerHTML = `<tr><td colspan="6">No hay keywords en el backlog.</td></tr>`;
    return;
  }

  els.seoKeywordRows.innerHTML = keywords
    .map(
      (item) => `
        <tr>
          <td>
            <strong>${escapeHtml(item.keyword || "-")}</strong>
            <div class="admin-subtle">${escapeHtml(item.suggested_landing || "-")}</div>
          </td>
          <td>${escapeHtml(seoKeywordIntentLabel(item.intent))}</td>
          <td>${chip(item.page_type || "-", "draft")}</td>
          <td>${chip(Number(item.priority || 0).toFixed(0), scoreTone(item.priority), "score")}</td>
          <td>
            ${chip(item.status || "idea", statusTone(item.status))}
            <div class="admin-subtle">${escapeHtml(item.risk_level || "-")} riesgo</div>
          </td>
          <td>
            <button class="admin-button tiny ghost" type="button" data-seo-keyword-brief="${escapeHtml(item.id)}">Ver brief</button>
          </td>
        </tr>
      `
    )
    .join("");
}

function renderSeoKeywordBrief(brief = {}) {
  if (!els.seoKeywordBriefPreview) return;
  if (!brief.keyword) {
    els.seoKeywordBriefPreview.textContent = "Selecciona una keyword para ver el brief editorial.";
    return;
  }
  const list = (items = []) => items.slice(0, 8).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  els.seoKeywordBriefPreview.innerHTML = `
    <strong>${escapeHtml(brief.keyword)}</strong>
    <p>${escapeHtml(brief.target_user || "")}</p>
    <p><b>H1:</b> ${escapeHtml(brief.suggested_h1 || "")}</p>
    <p><b>Meta title:</b> ${escapeHtml(brief.suggested_meta_title || "")}</p>
    <p><b>Meta description:</b> ${escapeHtml(brief.suggested_meta_description || "")}</p>
    <p><b>CTA:</b> ${escapeHtml(brief.cta || "")}</p>
    <p><b>Prudencia:</b> ${escapeHtml(brief.prudence_block || "")}</p>
    <p><b>Independencia:</b> ${escapeHtml(brief.portal_independence_block || "")}</p>
    <p><b>H2 sugeridos:</b></p>
    <ul>${list(brief.h2_structure)}</ul>
    <p><b>Para pasar quality gate:</b></p>
    <ul>${list(brief.quality_gate_requirements)}</ul>
  `;
}

function ratioLabel(current, limit) {
  return `${Number(current || 0)} / ${Number(limit || 0)}`;
}

function seoAutogenBadge(label, tone = "neutral") {
  return `<span class="admin-seo-autogen-badge is-${escapeHtml(tone)}">${escapeHtml(label)}</span>`;
}

function seoAutogenCard(label, value, options = {}) {
  const classes = ["admin-seo-autogen-card"];
  if (options.overLimit) classes.push("is-over-limit");
  return `
    <article class="${classes.join(" ")}">
      <span>${escapeHtml(label)}</span>
      <div class="admin-seo-autogen-value">${options.badge ? seoAutogenBadge(value, options.tone) : escapeHtml(value)}</div>
      ${options.hint ? `<small>${escapeHtml(options.hint)}</small>` : ""}
    </article>
  `;
}

function renderSeoAutogeneration(payload = {}) {
  if (!els.seoAutogenSummary || !els.seoAutogenRuns) return;
  state.seoAutogeneration.status = payload;
  state.seoAutogeneration.recentRuns = payload.recent_runs || [];
  const config = payload.config || {};
  const limits = payload.limits || {};
  const lastRun = payload.last_run || null;
  const lastResult = lastRun?.result_json || {};
  const enabledLabel = config.enabled ? "Activo" : "Inactivo";
  const dryRunLabel = config.dry_run ? "Dry run" : "Publicacion real";
  const runCount = Number(limits.published_this_run || 0);
  const runLimit = Number(limits.max_per_run || 1);
  const dayCount = Number(limits.published_last_24h || 0);
  const dayLimit = Number(limits.max_per_day || 3);
  const weekCount = Number(limits.published_last_7d || 0);
  const weekLimit = Number(limits.max_per_week || 10);

  els.seoAutogenSummary.innerHTML = [
    seoAutogenCard("Estado", enabledLabel, { badge: true, tone: config.enabled ? "good" : "muted", hint: "Kill switch" }),
    seoAutogenCard("Modo", dryRunLabel, { badge: true, tone: config.dry_run ? "warn" : "good", hint: "Controlado por entorno" }),
    seoAutogenCard("Run", ratioLabel(runCount, runLimit), { hint: "Publicado / limite", overLimit: runCount > runLimit }),
    seoAutogenCard("24h", ratioLabel(dayCount, dayLimit), { hint: "Publicado / limite", overLimit: dayCount > dayLimit }),
    seoAutogenCard("7 dias", ratioLabel(weekCount, weekLimit), { hint: "Publicado / limite", overLimit: weekCount > weekLimit }),
    seoAutogenCard("Min score", `${Number(config.min_score || 80)} / 100`, { hint: "Umbral de calidad" }),
    seoAutogenCard("Ultima", lastRun ? formatCompactDate(lastRun.started_at) : "-", { hint: lastRun?.status || "Sin ejecuciones" }),
    seoAutogenCard("Proxima", payload.next_scheduled_at ? formatCompactDate(payload.next_scheduled_at) : "-", { hint: "Cadencia 6h" })
  ].join("");

  if (els.seoAutogenNote) {
    els.seoAutogenNote.textContent = config.enabled
      ? `Alcance: precio m2 ciudad y saber si un piso está caro por ciudad. Pausa con SEO_AUTOGENERATION_ENABLED=false. Último resultado: ${lastResult.reason || lastRun?.status || "sin datos"}.`
      : "Kill switch activo: SEO_AUTOGENERATION_ENABLED=false.";
  }

  const runs = payload.recent_runs || [];
  if (!runs.length) {
    els.seoAutogenRuns.innerHTML = `<tr><td colspan="4">Sin ejecuciones registradas.</td></tr>`;
    return;
  }

  els.seoAutogenRuns.innerHTML = runs
    .map((row) => {
      const result = row.result_json || {};
      const items = Array.isArray(result.results) ? result.results : [];
      const counts = `${Number(result.published_count || 0)} pub · ${Number(result.draft_count || 0)} draft · ${Number(result.skipped_count || 0)} skip`;
      const detail =
        items
          .slice(0, 3)
          .map((item) => [item.target_path, item.reason || item.status, item.final_score ? `score ${item.final_score}` : ""].filter(Boolean).join(" · "))
          .join(" | ") || result.reason;
      return `
        <tr>
          <td>
            <strong>${escapeHtml(formatCompactDate(row.started_at))}</strong>
            <div class="admin-subtle">${escapeHtml(row.run_key || "-")}</div>
          </td>
          <td>${chip(row.status || "unknown", statusTone(row.status))}</td>
          <td>${escapeHtml(counts)}</td>
          <td><div class="admin-seo-autogen-detail">${escapeHtml(detail || row.error_message || "-")}</div></td>
        </tr>
      `;
    })
    .join("");
}

function renderSeoPagination(payload) {
  if (!els.seoPagination) return;
  const page = Number(payload.page || state.seo.page || 1);
  const from = Number(payload.from || 0);
  const to = Number(payload.to || 0);
  const hasPrevious = Boolean(payload.has_previous_page);
  const hasNext = Boolean(payload.has_next_page);
  const range = from && to ? `${from}-${to}` : "0";

  els.seoPagination.innerHTML = `
      <span>Página ${escapeHtml(page)} - Landings ${escapeHtml(range)} - 10 por página</span>
    <div class="admin-pagination-actions">
      <button class="admin-button tiny ghost" type="button" data-seo-page="previous" data-testid="pagination-prev" ${hasPrevious ? "" : "disabled"}>Anterior</button>
      <button class="admin-button tiny secondary" type="button" data-seo-page="next" data-testid="pagination-next" ${hasNext ? "" : "disabled"}>Siguiente</button>
    </div>
  `;
}

function fieldOptions(field, value) {
  if (field.type === "boolean") {
    return [
      { value: "true", label: "Si" },
      { value: "false", label: "No" }
    ]
      .map((option) => {
        const selected = String(value === true) === option.value ? " selected" : "";
        return `<option value="${option.value}"${selected}>${escapeHtml(option.label)}</option>`;
      })
      .join("");
  }

  return (field.options || [])
    .map((option) => {
      const selected = String(value) === String(option.value) ? " selected" : "";
      return `<option value="${escapeHtml(option.value)}"${selected}>${escapeHtml(option.label)}</option>`;
    })
    .join("");
}

function renderKpiControl(field, value) {
  const path = escapeHtml(field.path);
  const common = `name="${path}" data-kpi-path="${path}" data-kpi-type="${escapeHtml(field.type)}"`;

  if (field.type === "select" || field.type === "boolean") {
    return `<select ${common}>${fieldOptions(field, value)}</select>`;
  }

  if (field.type === "textarea") {
    return `<textarea ${common} rows="3">${escapeHtml(value ?? "")}</textarea>`;
  }

  if (field.type === "number") {
    const min = typeof field.min === "number" ? ` min="${field.min}"` : "";
    const max = typeof field.max === "number" ? ` max="${field.max}"` : "";
    const step = typeof field.step === "number" ? ` step="${field.step}"` : "";
    return `<input ${common} type="number"${min}${max}${step} value="${escapeHtml(value ?? field.defaultValue ?? "")}">`;
  }

  return `<input ${common} type="text" value="${escapeHtml(value ?? "")}">`;
}

function defaultKpiValue(field) {
  const storedDefault = getPath(state.kpis.defaults, field.path);
  return storedDefault ?? field.defaultValue;
}

function formatKpiValue(field, value) {
  if (value === undefined || value === null || value === "") return "-";
  if (field.type === "boolean") return value ? "Si" : "No";
  if (field.type === "select") {
    const option = (field.options || []).find((item) => String(item.value) === String(value));
    return option ? option.label : value;
  }
  if (field.type === "number" && field.suffix) return `${value}${field.suffix}`;
  return String(value);
}

function kpiProposalText(field) {
  const proposedValue = defaultKpiValue(field);
  const formattedValue = formatKpiValue(field, proposedValue);
  const path = String(field.path || "");

  if (field.type === "boolean") {
    return `${formattedValue}. Mi propuesta es mantener esta bandera como punto de control para activar o apagar el bloque sin tocar el cálculo interno.`;
  }
  if (path.includes("fallback")) {
    return `Partir de ${formattedValue}. La propuesta evita KPIs fijos cuando falta dato real y deja claro cuando el resultado es orientativo.`;
  }
  if (path.includes("weight")) {
    return `Partir de ${formattedValue}. La propuesta reparte el peso para que ningun factor aislado domine el score sin evidencia suficiente.`;
  }
  if (path.includes("threshold") || path.includes("minimum")) {
    return `Partir de ${formattedValue}. La propuesta fija un umbral prudente y se debería ajustar solo con datos históricos medidos.`;
  }
  if (path.includes("cap") || path.includes("max")) {
    return `Partir de ${formattedValue}. La propuesta limita el optimismo cuando la precision del dato de partida baja.`;
  }
  return `Partir de ${formattedValue}. Es el dato de partida recomendado para medir resultados antes de endurecer o relajar la regla.`;
}

function linkedInStatusLabel(value) {
  const map = {
    disconnected: "No conectado",
    connected: "Conectado",
    needs_connection: "Necesita conexi\u00f3n",
    needs_reauth: "Reautorizaci\u00f3n",
    expired: "Token expirado",
    error: "Error",
    draft: "Draft",
    image_pending: "Imagen pendiente",
    ready: "Ready",
    pending_review: "Pendiente",
    scheduled: "Programado",
    publishing: "Publicando",
    published: "Publicado",
    manually_published: "Manual",
    failed: "Error",
    skipped: "Omitido",
    cancelled: "Cancelado"
  };
  return map[String(value || "").toLowerCase()] || value || "-";
}

function linkedInPostText(post = {}) {
  const hashtags = Array.isArray(post.hashtags) ? post.hashtags : String(post.hashtags || "").split(/[\s,]+/).filter(Boolean);
  return [post.hook, post.body, post.cta, hashtags.map((tag) => String(tag).startsWith("#") ? tag : `#${tag}`).join(" ")]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join("\n\n");
}

function renderLinkedIn(payload = {}) {
  state.linkedin.connection = payload.connection || null;
  state.linkedin.settings = payload.settings || {};
  state.linkedin.posts = payload.posts || [];
  state.linkedin.summary = payload.summary || {};
  state.linkedin.env = payload.env || {};
  state.linkedin.autopublisher = payload.autopublisher || {};
  state.linkedin.runs = payload.runs || [];
  state.linkedin.lastPublication = payload.last_publication || null;
  state.linkedin.manualNotice = payload.manual_mode_notice || "";
  renderLinkedInNotice(payload);
  renderLinkedInConnection();
  renderLinkedInSettings();
  renderLinkedInSummary();
  renderLinkedInPosts();
  updateLinkedInPublishControls();
  const selected = state.linkedin.posts.find((post) => post.id === state.linkedin.currentPostId) || state.linkedin.posts[0] || null;
  fillLinkedInEditor(selected);
}

function updateLinkedInPublishControls() {
  if (!els.linkedinEditorForm) return;
  const publishButtons = els.linkedinEditorForm.querySelectorAll('[data-linkedin-post-action="publish_now"]');
  const connected = state.linkedin.connection?.status === "connected" && Boolean(state.linkedin.connection?.organization_urn);
  publishButtons.forEach((button) => {
    button.hidden = !connected;
    button.disabled = !connected;
  });
}

function renderLinkedInNotice(payload = {}) {
  if (!els.linkedinNotice) return;
  const storage = payload.storage || {};
  const missing = storage.settings_table_missing || storage.posts_table_missing || storage.connection_table_missing || storage.runs_table_missing;
  const messages = [];
  if (missing) messages.push("Faltan tablas de LinkedIn. Ejecuta database/marketing-linkedin.sql en Supabase.");
  if (payload.manual_mode_notice) messages.push(payload.manual_mode_notice);
  if (storage.connection_error && !storage.connection_table_missing) messages.push(storage.connection_error);
  if (storage.settings_error && !storage.settings_table_missing) messages.push(storage.settings_error);
  if (storage.posts_error && !storage.posts_table_missing) messages.push(storage.posts_error);
  if (storage.runs_error && !storage.runs_table_missing) messages.push(storage.runs_error);
  els.linkedinNotice.innerHTML = messages.map((message) => `<p>${escapeHtml(message)}</p>`).join("");
  els.linkedinNotice.hidden = !messages.length;
}

function renderLinkedInConnection() {
  if (!els.linkedinConnection) return;
  const c = state.linkedin.connection || {};
  const env = state.linkedin.env || {};
  const autopublisher = state.linkedin.autopublisher || {};
  const hasPage = Boolean(c.organization_name || c.organization_urn || env.organization_urn_configured);
  els.linkedinConnection.innerHTML = `
    <div class="admin-linkedin-status-row"><span>Estado</span>${chip(linkedInStatusLabel(c.status || "disconnected"), statusTone(c.status))}</div>
    <div class="admin-linkedin-status-row"><span>P\u00e1gina destino</span><strong>${escapeHtml(autopublisher.company_url || c.linkedin_company_url || env.company_url || "-")}</strong></div>
    <div class="admin-linkedin-status-row"><span>Modo manual</span>${chip(c.manual_available ? "Activo" : "No", c.manual_available ? "published" : "bad")}</div>
    <div class="admin-linkedin-status-row"><span>Autopublisher</span>${chip(autopublisher.enabled ? "Activo" : "Pausado", autopublisher.enabled ? "published" : "draft")}</div>
    <div class="admin-linkedin-status-row"><span>Frecuencia</span><strong>${escapeHtml(autopublisher.frequency || "every_2_days")}</strong></div>
    <div class="admin-linkedin-status-row"><span>Pr\u00f3xima publicaci\u00f3n</span><strong>${escapeHtml(formatDate(autopublisher.next_publication))}</strong></div>
    <div class="admin-linkedin-status-row"><span>P\u00e1gina configurada</span><strong>${escapeHtml(hasPage ? "Si" : "No")}</strong></div>
    <div class="admin-linkedin-status-row"><span>Organization ID</span><strong>${escapeHtml(c.organization_id || env.organization_id || "-")}</strong></div>
    <div class="admin-linkedin-status-row"><span>Organization URN</span><code>${escapeHtml(c.organization_urn || "-")}</code></div>
    <div class="admin-linkedin-status-row"><span>Token expira</span><strong>${escapeHtml(formatDate(c.token_expires_at))}</strong></div>
    <div class="admin-linkedin-status-row"><span>\u00daltimo error</span><strong>${escapeHtml(c.last_error || "-")}</strong></div>
    <div class="admin-linkedin-status-row"><span>\u00daltima publicaci\u00f3n</span><strong>${escapeHtml(formatDate(state.linkedin.lastPublication?.published_at || state.linkedin.lastPublication?.manually_published_at))}</strong></div>
    <div class="admin-linkedin-status-row"><span>API version</span><strong>${escapeHtml(env.api_version || "-")}</strong></div>
  `;
}

function renderLinkedInSettings() {
  if (!els.linkedinSettingsForm) return;
  const form = els.linkedinSettingsForm;
  const settings = state.linkedin.settings || {};
  const set = (name, value) => {
    const field = form.elements[name];
    if (field) field.value = value ?? "";
  };
  set("linkedin_company_url", settings.linkedin_company_url || state.linkedin.autopublisher?.company_url || "https://www.linkedin.com/company/inmoradar-app/");
  set("organization_id", settings.organization_id || state.linkedin.connection?.organization_id || "");
  set("organization_urn", settings.organization_urn || state.linkedin.connection?.organization_urn || "");
  set("daily_generation_enabled", String(settings.daily_generation_enabled !== false));
  set("autopost_enabled", String(settings.autopost_enabled === true || settings.auto_publish_enabled === true));
  set("approval_required", String(settings.approval_required !== false));
  set("daily_post_time", settings.daily_post_time || "10:00");
  set("timezone", settings.timezone || "Europe/Madrid");
  set("frequency_days", String(settings.frequency_days || 2));
  set("max_posts_per_day", String(settings.max_posts_per_day || 1));
  set("active_post_type", settings.active_post_type || "precio_sexy_coste_oculto");
  set("content_mode", settings.content_mode || settings.active_post_type || "precio_sexy_coste_oculto");
  set("default_cta", settings.default_cta || "Analiza antes de contactar: https://inmoradar.app");
  set("default_hashtags", (settings.default_hashtags || []).map((tag) => `#${String(tag).replace(/^#/, "")}`).join(" "));
  set("destination_url", settings.destination_url || "https://inmoradar.app");
}

function renderLinkedInSummary() {
  if (!els.linkedinSummary) return;
  const summary = state.linkedin.summary || {};
  els.linkedinSummary.innerHTML = [
    stat("Total", summary.total || 0, { id: "linkedin-total", hint: "Posts en cola" }),
    stat("Ready", summary.ready || 0, { id: "linkedin-ready", hint: "Listos para publicar" }),
    stat("Pendientes", summary.pending_review || summary.needs_connection || 0, { id: "linkedin-pending", hint: "Requieren revisi\u00f3n o conexi\u00f3n" }),
    stat("Programados", summary.scheduled || 0, { id: "linkedin-scheduled", hint: "Listos para fecha" }),
    stat("Publicados", (summary.published || 0) + (summary.manually_published || 0), { id: "linkedin-published", hint: "API o manual" }),
    stat("Errores", summary.failed || 0, { id: "linkedin-failed", hint: "Reintentar o revisar" })
  ].join("");
}

function renderLinkedInPosts() {
  if (!els.linkedinRows) return;
  const rows = state.linkedin.posts || [];
  if (!rows.length) {
    els.linkedinRows.innerHTML = '<tr><td colspan="9">No hay publicaciones de LinkedIn todav\u00eda.</td></tr>';
    return;
  }
  els.linkedinRows.innerHTML = rows.map((post) => {
    const preview = post.image_url ? `<img class="admin-linkedin-thumb" src="${escapeHtml(post.image_url)}" alt="Preview LinkedIn">` : "-";
    const mode = post.source_type === "auto" ? "autom\u00e1tico" : "manual";
    const publishedAt = post.published_at || post.manually_published_at;
    return `
      <tr data-linkedin-post-id="${escapeHtml(post.id)}">
        <td>${escapeHtml(formatDate(post.created_at))}</td>
        <td>${preview}</td>
        <td><strong>${escapeHtml(post.hook || post.title || "-")}</strong><div class="admin-subtle">${escapeHtml(post.source_reference || post.source_type || "-")}</div></td>
        <td>${chip(linkedInStatusLabel(post.status), statusTone(post.status))}</td>
        <td>${chip(mode, mode === "autom\u00e1tico" ? "ready" : "draft")}</td>
        <td>${escapeHtml(formatDate(post.scheduled_at))}</td>
        <td>${escapeHtml(formatDate(publishedAt))}</td>
        <td><span class="admin-linkedin-error">${escapeHtml(post.error_message || "-")}</span></td>
        <td>
          <div class="admin-row-actions">
            <button class="admin-icon-button admin-linkedin-action-button" type="button" data-linkedin-row-action="view" data-linkedin-id="${escapeHtml(post.id)}" data-tooltip="Abre este post en el editor." title="Abre este post en el editor." aria-label="Ver post">Ver</button>
            <button class="admin-icon-button admin-linkedin-action-button" type="button" data-linkedin-row-action="approve" data-linkedin-id="${escapeHtml(post.id)}" data-tooltip="Aprueba este post para revisarlo o programarlo." title="Aprueba este post para revisarlo o programarlo." aria-label="Aprobar post">Aprobar</button>
            <button class="admin-icon-button admin-linkedin-action-button" type="button" data-linkedin-row-action="mark_manually_published" data-linkedin-id="${escapeHtml(post.id)}" data-tooltip="Marca este post como publicado manualmente." title="Marca este post como publicado manualmente." aria-label="Marcar publicado manualmente">Manual</button>
            <button class="admin-icon-button admin-linkedin-action-button" type="button" data-linkedin-row-action="cancel" data-linkedin-id="${escapeHtml(post.id)}" data-tooltip="Cancela este post." title="Cancela este post." aria-label="Cancelar post">Cancelar</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function fillLinkedInEditor(post) {
  if (!els.linkedinEditorForm) return;
  const form = els.linkedinEditorForm;
  const selected = post || {};
  state.linkedin.currentPostId = selected.id || "";
  const set = (name, value) => {
    const field = form.elements[name];
    if (field) field.value = value ?? "";
  };
  set("id", selected.id || "");
  set("price_display", selected.price_display || "");
  set("city", selected.city || "");
  set("hook", selected.hook || "");
  set("body", selected.body || "");
  set("hidden_costs", (selected.hidden_costs || []).join("\n"));
  set("cta", selected.cta || "");
  set("hashtags", (selected.hashtags || []).map((tag) => `#${String(tag).replace(/^#/, "")}`).join(" "));
  set("image_url", selected.image_url || "");
  set("image_prompt", selected.image_prompt || "");
  set("scheduled_at", toLocalDatetimeValue(selected.scheduled_at));
  set("status", selected.status || "draft");
  set("source_reference", selected.source_reference || "");
}

function currentLinkedInPost() {
  return (state.linkedin.posts || []).find((post) => post.id === state.linkedin.currentPostId) || null;
}

function collectLinkedInSettings() {
  const data = new FormData(els.linkedinSettingsForm);
  return {
    linkedin_company_url: String(data.get("linkedin_company_url") || "https://www.linkedin.com/company/inmoradar-app/"),
    organization_id: String(data.get("organization_id") || ""),
    organization_urn: String(data.get("organization_urn") || ""),
    daily_generation_enabled: data.get("daily_generation_enabled") === "true",
    autopost_enabled: data.get("autopost_enabled") === "true",
    auto_publish_enabled: data.get("autopost_enabled") === "true",
    approval_required: data.get("approval_required") === "true",
    daily_post_time: String(data.get("daily_post_time") || "10:00"),
    timezone: String(data.get("timezone") || "Europe/Madrid"),
    frequency_days: Number(data.get("frequency_days") || 2),
    max_posts_per_day: Number(data.get("max_posts_per_day") || 1),
    active_post_type: String(data.get("active_post_type") || "precio_sexy_coste_oculto"),
    content_mode: String(data.get("content_mode") || "precio_sexy_coste_oculto"),
    default_cta: String(data.get("default_cta") || ""),
    default_hashtags: String(data.get("default_hashtags") || ""),
    destination_url: String(data.get("destination_url") || "https://inmoradar.app")
  };
}

function collectLinkedInPost() {
  const data = new FormData(els.linkedinEditorForm);
  return {
    id: String(data.get("id") || ""),
    post_type: "precio_sexy_coste_oculto",
    price_display: String(data.get("price_display") || ""),
    city: String(data.get("city") || ""),
    hook: String(data.get("hook") || ""),
    headline: String(data.get("hook") || ""),
    body: String(data.get("body") || ""),
    copy: String(data.get("body") || ""),
    hidden_costs: String(data.get("hidden_costs") || ""),
    cta: String(data.get("cta") || ""),
    hashtags: String(data.get("hashtags") || ""),
    image_url: String(data.get("image_url") || ""),
    image_prompt: String(data.get("image_prompt") || ""),
    scheduled_at: fromLocalDatetimeValue(String(data.get("scheduled_at") || "")),
    status: String(data.get("status") || "draft"),
    source_reference: String(data.get("source_reference") || ""),
    source_type: "manual"
  };
}

async function loadLinkedIn() {
  if (!els.linkedinConnection) return;
  const payload = await api("/api/admin?resource=linkedin");
  renderLinkedIn(payload);
}

async function saveLinkedInSettings() {
  showStatus("Guardando ajustes de LinkedIn...");
  const payload = await api("/api/admin?resource=linkedin/settings", {
    method: "POST",
    body: JSON.stringify({ settings: collectLinkedInSettings() })
  });
  state.linkedin.settings = payload.settings || state.linkedin.settings;
  renderLinkedInSettings();
  showStatus("Ajustes de LinkedIn guardados.", "good");
}

async function pauseLinkedInAutopublisher() {
  if (!els.linkedinSettingsForm) return;
  const field = els.linkedinSettingsForm.elements.autopost_enabled;
  if (field) field.value = "false";
  await saveLinkedInSettings();
  showStatus("LinkedIn Autopublisher pausado.", "good");
}

async function saveLinkedInPost() {
  const input = collectLinkedInPost();
  const method = input.id ? "PUT" : "POST";
  showStatus(input.id ? "Guardando post de LinkedIn..." : "Creando post de LinkedIn...");
  const payload = await api("/api/admin?resource=linkedin/posts", {
    method,
    body: JSON.stringify(input)
  });
  await loadLinkedIn();
  fillLinkedInEditor(payload.post || currentLinkedInPost());
  showStatus("Post de LinkedIn guardado.", "good");
}

async function runLinkedInAction(action, id = state.linkedin.currentPostId) {
  if (!id && action !== "generate_daily") throw new Error("Selecciona o crea un post de LinkedIn primero.");
  const current = els.linkedinEditorForm ? collectLinkedInPost() : {};
  const body = { action, id, scheduled_at: current.scheduled_at };
  if (action === "generate_daily") body.publishIfAllowed = false;
  showStatus(`LinkedIn: ${action}...`);
  const payload = await api("/api/admin?resource=linkedin/posts", {
    method: "POST",
    body: JSON.stringify(body)
  });
  await loadLinkedIn();
  const post = payload.post || currentLinkedInPost();
  if (post) fillLinkedInEditor(post);
  showStatus(payload.skipped ? `LinkedIn omitido: ${payload.reason}` : "Acci\u00f3n LinkedIn completada.", payload.ok === false ? "bad" : "good");
}

async function connectLinkedIn() {
  const payload = await api("/api/admin?resource=linkedin/connect");
  if (payload.state) sessionStorage.setItem("inmoradar_linkedin_oauth_state", payload.state);
  if (!payload.url) throw new Error("linkedin_oauth_url_missing");
  window.location.href = payload.url;
}

async function disconnectLinkedIn() {
  if (!window.confirm("\u00bfDesconectar LinkedIn y volver a modo manual?")) return;
  await api("/api/admin?resource=linkedin/disconnect", { method: "POST", body: JSON.stringify({}) });
  await loadLinkedIn();
  showStatus("LinkedIn desconectado. Modo manual activo.", "good");
}

async function testLinkedInConnection() {
  const payload = await api("/api/admin?resource=linkedin/test-connection", { method: "POST", body: JSON.stringify({}) });
  if (payload.connection) state.linkedin.connection = payload.connection;
  renderLinkedInConnection();
  showStatus(payload.message || "Conexi\u00f3n de LinkedIn comprobada.", payload.automatic_available ? "good" : "neutral");
}

async function handleLinkedInOAuthCallbackFromUrl() {
  const params = new URLSearchParams(window.location.search || "");
  const code = params.get("code");
  const stateParam = params.get("state");
  if (!code || !state.token) return;
  const expectedState = sessionStorage.getItem("inmoradar_linkedin_oauth_state") || "";
  if (!expectedState) return;
  if (expectedState && stateParam && expectedState !== stateParam) {
    showStatus("LinkedIn OAuth: state no coincide. Reintenta la conexi\u00f3n.", "bad");
    return;
  }
  sessionStorage.removeItem("inmoradar_linkedin_oauth_state");
  showStatus("Conectando LinkedIn...");
  await api("/api/admin?resource=linkedin/callback", {
    method: "POST",
    body: JSON.stringify({ code, state: stateParam })
  });
  params.delete("code");
  params.delete("state");
  const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}${window.location.hash || ""}`;
  window.history.replaceState({}, document.title, next);
  await loadLinkedIn();
  showStatus("LinkedIn conectado.", "good");
}

function copyLinkedInText() {
  const formPost = collectLinkedInPost();
  const post = { ...currentLinkedInPost(), ...formPost };
  return copyToClipboard(linkedInPostText(post));
}

function downloadLinkedInImage() {
  const post = { ...currentLinkedInPost(), ...collectLinkedInPost() };
  const source = post.image_url || "";
  if (!source) {
    showStatus("Este post no tiene imagen todav\u00eda.", "bad");
    return;
  }
  const link = document.createElement("a");
  link.href = source;
  link.download = `inmoradar-linkedin-${post.id || Date.now()}.${source.startsWith("data:image/svg") ? "svg" : "png"}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  showStatus("Imagen de LinkedIn descargada.", "good");
}

function metaStatusLabel(value) {
  const map = {
    disconnected: "No conectado",
    needs_connection: "Necesita conexion",
    needs_page: "Selecciona Page",
    needs_instagram: "Sin Instagram",
    needs_permissions: "Faltan permisos",
    needs_reauth: "Reautorizar",
    connected: "Conectado",
    expired: "Token expirado",
    error: "Error",
    draft: "Draft",
    queued: "Queued",
    publishing: "Publicando",
    published: "Publicado",
    failed: "Error",
    skipped: "Omitido"
  };
  return map[String(value || "").toLowerCase()] || value || "-";
}

function renderMeta(payload = {}) {
  state.meta.connection = payload.connection || null;
  state.meta.settings = payload.settings || {};
  state.meta.posts = payload.posts || [];
  state.meta.summary = payload.summary || {};
  state.meta.env = payload.env || {};
  state.meta.autopublisher = payload.autopublisher || {};
  state.meta.runs = payload.runs || [];
  state.meta.lastPublication = payload.last_publication || null;
  state.meta.manualNotice = payload.manual_mode_notice || "";
  renderMetaNotice(payload);
  renderMetaConnection();
  renderMetaSettings();
  renderMetaSummary();
  renderMetaPosts();
  updateMetaPublishControls();
  const selected = state.meta.posts.find((post) => post.id === state.meta.currentPostId) || state.meta.posts[0] || null;
  fillMetaEditor(selected);
}

function updateMetaPublishControls() {
  if (!els.metaEditorForm) return;
  const publishButtons = els.metaEditorForm.querySelectorAll('[data-meta-post-action="publish_now"]');
  const connected = state.meta.connection?.status === "connected" && Boolean(state.meta.connection?.facebook_page_id);
  publishButtons.forEach((button) => {
    button.hidden = !connected;
    button.disabled = !connected;
  });
}

function renderMetaNotice(payload = {}) {
  if (!els.metaNotice) return;
  const storage = payload.storage || {};
  const missing = storage.settings_table_missing || storage.posts_table_missing || storage.connection_table_missing || storage.runs_table_missing;
  const messages = [];
  if (missing) messages.push("Faltan tablas de Meta. Ejecuta database/marketing-meta.sql en Supabase.");
  if (payload.manual_mode_notice) messages.push(payload.manual_mode_notice);
  if (storage.connection_error && !storage.connection_table_missing) messages.push(storage.connection_error);
  if (storage.settings_error && !storage.settings_table_missing) messages.push(storage.settings_error);
  if (storage.posts_error && !storage.posts_table_missing) messages.push(storage.posts_error);
  if (storage.runs_error && !storage.runs_table_missing) messages.push(storage.runs_error);
  els.metaNotice.innerHTML = messages.map((message) => `<p>${escapeHtml(message)}</p>`).join("");
  els.metaNotice.hidden = !messages.length;
}

function renderMetaConnection() {
  if (!els.metaConnection) return;
  const c = state.meta.connection || {};
  const env = state.meta.env || {};
  const autopublisher = state.meta.autopublisher || {};
  els.metaConnection.innerHTML = `
    <div class="admin-linkedin-status-row"><span>Estado</span>${chip(metaStatusLabel(c.status || "disconnected"), statusTone(c.status))}</div>
    <div class="admin-linkedin-status-row"><span>Facebook Page</span><strong>${escapeHtml(c.facebook_page_name || env.facebook_page_name || "-")}</strong></div>
    <div class="admin-linkedin-status-row"><span>Page ID</span><code>${escapeHtml(c.facebook_page_id || "-")}</code></div>
    <div class="admin-linkedin-status-row"><span>Instagram ID</span><code>${escapeHtml(c.instagram_business_account_id || "-")}</code></div>
    <div class="admin-linkedin-status-row"><span>Autopublisher</span>${chip(autopublisher.enabled ? "Activo" : "Pausado", autopublisher.enabled ? "published" : "draft")}</div>
    <div class="admin-linkedin-status-row"><span>Frecuencia</span><strong>${escapeHtml(`${autopublisher.frequency_days || 1} dia(s)`)}</strong></div>
    <div class="admin-linkedin-status-row"><span>Proximo intento</span><strong>${escapeHtml(formatDate(autopublisher.next_publication))}</strong></div>
    <div class="admin-linkedin-status-row"><span>Permisos faltantes</span><strong>${escapeHtml((c.missing_scopes || []).join(", ") || "-")}</strong></div>
    <div class="admin-linkedin-status-row"><span>Token expira</span><strong>${escapeHtml(formatDate(c.token_expires_at))}</strong></div>
    <div class="admin-linkedin-status-row"><span>Ultimo error</span><strong>${escapeHtml(c.last_error || "-")}</strong></div>
    <div class="admin-linkedin-status-row"><span>Ultima publicacion</span><strong>${escapeHtml(formatDate(state.meta.lastPublication?.published_at))}</strong></div>
    <div class="admin-linkedin-status-row"><span>Graph API</span><strong>${escapeHtml(env.graph_version || "-")}</strong></div>
  `;
}

function renderMetaPages(pages = state.meta.pages || []) {
  if (!els.metaPages) return;
  const current = state.meta.connection?.facebook_page_id || "";
  els.metaPages.innerHTML = [
    `<option value="">${pages.length ? "Selecciona Page" : "Cargar Pages"}</option>`,
    ...pages.map((page) => {
      const instagram = page.instagram_business_account?.id ? ` · IG ${page.instagram_business_account.id}` : " · sin IG";
      return `<option value="${escapeHtml(page.id)}"${page.id === current ? " selected" : ""}>${escapeHtml(page.name || page.id)}${escapeHtml(instagram)}</option>`;
    })
  ].join("");
}

function renderMetaSettings() {
  if (!els.metaSettingsForm) return;
  const form = els.metaSettingsForm;
  const settings = state.meta.settings || {};
  const set = (name, value) => {
    const field = form.elements[name];
    if (field) field.value = value ?? "";
  };
  set("autopost_enabled", String(settings.autopost_enabled === true));
  set("facebook_enabled", String(settings.facebook_enabled !== false));
  set("instagram_enabled", String(settings.instagram_enabled !== false));
  set("frequency_days", String(settings.frequency_days || 1));
  set("max_per_day", String(settings.max_per_day || 1));
  set("preferred_time", settings.preferred_time || "10:00");
  set("timezone", settings.timezone || "Europe/Madrid");
  set("content_mode", settings.content_mode || "seo_landings");
}

function renderMetaSummary() {
  if (!els.metaSummary) return;
  const summary = state.meta.summary || {};
  els.metaSummary.innerHTML = [
    stat("Total", summary.total || 0, { id: "meta-total", hint: "Posts en cola" }),
    stat("Draft", summary.draft || 0, { id: "meta-draft", hint: "Borradores" }),
    stat("Queued", summary.queued || 0, { id: "meta-queued", hint: "Listos" }),
    stat("Publicados", summary.published || 0, { id: "meta-published", hint: "Facebook o Instagram" }),
    stat("Errores", summary.failed || 0, { id: "meta-failed", hint: "Revisar permisos o imagen" }),
    stat("Omitidos", summary.skipped || 0, { id: "meta-skipped", hint: "Saltados por reglas" })
  ].join("");
}

function renderMetaPosts() {
  if (!els.metaRows) return;
  const rows = state.meta.posts || [];
  if (!rows.length) {
    els.metaRows.innerHTML = '<tr><td colspan="7">No hay publicaciones Meta todavia.</td></tr>';
    return;
  }
  els.metaRows.innerHTML = rows.map((post) => `
    <tr data-meta-post-id="${escapeHtml(post.id)}">
      <td>${escapeHtml(formatDate(post.created_at))}</td>
      <td>${chip(post.platform || "-", post.platform === "instagram" ? "ready" : "draft")}</td>
      <td><strong>${escapeHtml(post.source_slug || post.source_type || "-")}</strong><div class="admin-subtle">${escapeHtml(post.utm_campaign || "-")}</div></td>
      <td>${chip(metaStatusLabel(post.status), statusTone(post.status))}</td>
      <td>${escapeHtml(formatDate(post.published_at))}</td>
      <td><span class="admin-linkedin-error">${escapeHtml(post.error_message || "-")}</span></td>
      <td>
        <div class="admin-row-actions">
          <button class="admin-icon-button admin-linkedin-action-button" type="button" data-meta-row-action="view" data-meta-id="${escapeHtml(post.id)}" title="Ver post">Ver</button>
          <button class="admin-icon-button admin-linkedin-action-button" type="button" data-meta-row-action="publish_now" data-meta-id="${escapeHtml(post.id)}" title="Publicar ahora">Publicar</button>
          <button class="admin-icon-button admin-linkedin-action-button" type="button" data-meta-row-action="skip" data-meta-id="${escapeHtml(post.id)}" title="Omitir">Omitir</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function fillMetaEditor(post) {
  if (!els.metaEditorForm) return;
  const form = els.metaEditorForm;
  const selected = post || {};
  state.meta.currentPostId = selected.id || "";
  const set = (name, value) => {
    const field = form.elements[name];
    if (field) field.value = value ?? "";
  };
  set("id", selected.id || "");
  set("platform", selected.platform || "");
  set("status", selected.status || "draft");
  set("source_url", selected.source_url || "");
  set("caption", selected.caption || "");
  set("image_url", selected.image_url || "");
}

function currentMetaPost() {
  return (state.meta.posts || []).find((post) => post.id === state.meta.currentPostId) || null;
}

function collectMetaSettings() {
  const data = new FormData(els.metaSettingsForm);
  return {
    autopost_enabled: data.get("autopost_enabled") === "true",
    facebook_enabled: data.get("facebook_enabled") === "true",
    instagram_enabled: data.get("instagram_enabled") === "true",
    frequency_days: Number(data.get("frequency_days") || 1),
    max_per_day: Number(data.get("max_per_day") || 1),
    preferred_time: String(data.get("preferred_time") || "10:00"),
    timezone: String(data.get("timezone") || "Europe/Madrid"),
    content_mode: String(data.get("content_mode") || "seo_landings")
  };
}

function collectMetaPost() {
  const data = new FormData(els.metaEditorForm);
  return {
    id: String(data.get("id") || ""),
    caption: String(data.get("caption") || ""),
    image_url: String(data.get("image_url") || ""),
    status: String(data.get("status") || "draft")
  };
}

async function loadMeta() {
  if (!els.metaConnection) return;
  const payload = await api("/api/admin?resource=meta");
  renderMeta(payload);
}

async function saveMetaSettings() {
  showStatus("Guardando ajustes de Meta...");
  const payload = await api("/api/admin?resource=meta/settings", {
    method: "POST",
    body: JSON.stringify({ settings: collectMetaSettings() })
  });
  state.meta.settings = payload.settings || state.meta.settings;
  renderMetaSettings();
  showStatus("Ajustes de Meta guardados.", "good");
}

async function pauseMetaAutopublisher() {
  if (!els.metaSettingsForm) return;
  const field = els.metaSettingsForm.elements.autopost_enabled;
  if (field) field.value = "false";
  await saveMetaSettings();
  showStatus("Meta Autopublisher pausado.", "good");
}

async function connectMeta() {
  const payload = await api("/api/admin?resource=meta/connect");
  if (payload.state) sessionStorage.setItem("inmoradar_meta_oauth_state", payload.state);
  if (!payload.url) throw new Error("meta_oauth_url_missing");
  window.location.href = payload.url;
}

async function disconnectMeta() {
  if (!window.confirm("Desconectar Meta y pausar publicacion externa?")) return;
  await api("/api/admin?resource=meta/disconnect", { method: "POST", body: JSON.stringify({}) });
  await loadMeta();
  showStatus("Meta desconectado.", "good");
}

async function loadMetaPages() {
  showStatus("Cargando Pages de Meta...");
  const payload = await api("/api/admin?resource=meta/pages");
  state.meta.pages = payload.pages || [];
  renderMetaPages();
  showStatus(state.meta.pages.length ? "Pages cargadas." : "No hay Pages disponibles.", state.meta.pages.length ? "good" : "neutral");
}

async function saveMetaPageSelection() {
  const data = new FormData(els.metaPageForm);
  const pageId = String(data.get("page_id") || "");
  if (!pageId) throw new Error("Selecciona una Facebook Page.");
  const payload = await api("/api/admin?resource=meta/pages", {
    method: "POST",
    body: JSON.stringify({ page_id: pageId })
  });
  if (payload.connection) state.meta.connection = payload.connection;
  await loadMeta();
  showStatus("Facebook Page guardada.", "good");
}

async function testMetaConnection() {
  const payload = await api("/api/admin?resource=meta/test-connection", { method: "POST", body: JSON.stringify({}) });
  if (payload.connection) state.meta.connection = payload.connection;
  renderMetaConnection();
  showStatus(payload.message || "Conexion Meta comprobada.", payload.automatic_available ? "good" : "neutral");
}

async function generateNextMetaPost() {
  const platform = els.metaGeneratePlatform?.value || "facebook";
  showStatus(`Generando contenido Meta para ${platform}...`);
  const payload = await api("/api/admin?resource=meta/posts", {
    method: "POST",
    body: JSON.stringify({ action: "generate_next", platform })
  });
  await loadMeta();
  const post = payload.post || currentMetaPost();
  if (post) fillMetaEditor(post);
  showStatus(payload.skipped ? `Meta omitido: ${payload.reason}` : "Borrador Meta generado.", payload.skipped ? "neutral" : "good");
}

async function saveMetaPost() {
  const input = collectMetaPost();
  if (!input.id) throw new Error("Selecciona un post Meta primero.");
  showStatus("Guardando post Meta...");
  const payload = await api("/api/admin?resource=meta/posts", {
    method: "PUT",
    body: JSON.stringify(input)
  });
  await loadMeta();
  fillMetaEditor(payload.post || currentMetaPost());
  showStatus("Post Meta guardado.", "good");
}

async function runMetaAction(action, id = state.meta.currentPostId) {
  if (!id) throw new Error("Selecciona un post Meta primero.");
  showStatus(`Meta: ${action}...`);
  const payload = await api("/api/admin?resource=meta/posts", {
    method: "POST",
    body: JSON.stringify({ action, id })
  });
  await loadMeta();
  const post = payload.post || currentMetaPost();
  if (post) fillMetaEditor(post);
  showStatus(payload.ok === false ? (payload.error || "Meta no publicado.") : "Accion Meta completada.", payload.ok === false ? "bad" : "good");
}

async function handleMetaOAuthCallbackFromUrl() {
  const params = new URLSearchParams(window.location.search || "");
  const code = params.get("code");
  const stateParam = params.get("state");
  if (!code || !state.token) return;
  const expectedState = sessionStorage.getItem("inmoradar_meta_oauth_state") || "";
  if (!expectedState) return;
  if (stateParam && expectedState !== stateParam) {
    showStatus("Meta OAuth: state no coincide. Reintenta la conexion.", "bad");
    return;
  }
  sessionStorage.removeItem("inmoradar_meta_oauth_state");
  showStatus("Conectando Meta...");
  await api("/api/admin?resource=meta/callback", {
    method: "POST",
    body: JSON.stringify({ code, state: stateParam })
  });
  params.delete("code");
  params.delete("state");
  const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}${window.location.hash || ""}`;
  window.history.replaceState({}, document.title, next);
  await loadMeta();
  showStatus("Meta conectado. Carga Pages para seleccionar Facebook Page.", "good");
}

function copyMetaCaption() {
  const post = { ...currentMetaPost(), ...collectMetaPost() };
  return copyToClipboard(post.caption || "");
}
function renderKpis(payload) {
  state.kpis.schema = payload.schema || [];
  state.kpis.settings = payload.settings || {};
  state.kpis.defaults = payload.defaults || {};

  const note = payload.table_missing
    ? `<div class="admin-kpi-alert">Falta la tabla <strong>kpi_settings</strong>. Ejecuta <strong>database/kpi-settings.sql</strong> en Supabase para guardar cambios.</div>`
    : payload.error
      ? `<div class="admin-kpi-alert">Aviso KPI: ${escapeHtml(payload.error)}</div>`
    : `<div class="admin-kpi-meta">Última actualización KPI: ${escapeHtml(formatDate(payload.updated_at))}</div>`;

  els.kpiForm.innerHTML =
    note +
    state.kpis.schema
      .map(
        (group) => `
        <section class="admin-kpi-group">
          <div class="admin-kpi-group-title">
            <span>${escapeHtml(group.label)}</span>
            <small>${escapeHtml(group.description || "")}</small>
          </div>
          <div class="admin-kpi-fields">
            ${(group.fields || [])
              .map((field) => {
                const value = getPath(state.kpis.settings, field.path);
                const startingValue = defaultKpiValue(field);
                const currentValue = value ?? startingValue;
                return `
                  <label class="admin-kpi-field">
                    <span>
                      ${escapeHtml(field.label)}
                      ${field.suffix ? `<em>${escapeHtml(field.suffix)}</em>` : ""}
                    </span>
                    ${renderKpiControl(field, currentValue)}
                    <small class="admin-kpi-purpose"><strong>Para que sirve:</strong> ${escapeHtml(field.description || "Define como se calcula o se muestra este KPI.")}</small>
                    <small class="admin-kpi-proposal"><strong>Mi propuesta:</strong> ${escapeHtml(kpiProposalText(field))}</small>
                    <div class="admin-kpi-field-meta">
                      <span><strong>Dato actual:</strong> ${escapeHtml(formatKpiValue(field, currentValue))}</span>
                      <span><strong>Dato de partida:</strong> ${escapeHtml(formatKpiValue(field, startingValue))}</span>
                    </div>
                  </label>
                `;
              })
              .join("")}
          </div>
        </section>
      `
      )
      .join("");
}

function viralizaStatusTone(status) {
  const value = String(status || "").toLowerCase();
  if (["completed", "followed", "contacted", "replied", "collaboration_agreed"].includes(value)) return "ready";
  if (["skipped", "rejected", "archived"].includes(value)) return "bad";
  if (["in_progress", "reviewed", "warm_commented", "ready_to_contact"].includes(value)) return "warn";
  return "draft";
}

function platformLabel(value) {
  const labels = {
    tiktok: "TikTok",
    instagram: "Instagram",
    youtube: "YouTube",
    linkedin: "LinkedIn",
    x: "X"
  };
  return labels[String(value || "").toLowerCase()] || value || "-";
}

const VIRALIZA_TASK_GUIDES = {
  keyword_search: {
    steps: [
      "Pulsa los botones de búsqueda de las 3 keywords principales.",
          "Mira vídeos recientes con preguntas reales en comentarios.",
      "Anota una duda repetida, formato o frase que pueda convertirse en contenido."
    ],
    doneWhen: "Completa cuando tengas 3 ideas claras sacadas de conversaciones reales."
  },
  save_videos: {
    steps: [
      "Guarda 5 vídeos con buen hook en la propia plataforma.",
      "Fíjate en qué funciona: primera frase, ritmo, pregunta, comparativa o checklist.",
      "Decide cómo adaptarlo a InmoRadar sin copiar el contenido original."
    ],
    doneWhen: "Completa cuando tengas 5 referencias y una adaptación posible."
  },
  comment: {
    steps: [
      "Lee el vídeo y varios comentarios antes de publicar.",
      "Copia una sugerencia y cambia una frase para que encaje con el contexto.",
      "Publica manualmente, guarda la URL y marca el comentario como usado."
    ],
    doneWhen: "Completa cuando hayas dejado 10 comentarios útiles, máximo 2 con marca."
  },
  follow_accounts: {
    steps: [
      "Abre el perfil y revisa bio, país y últimos vídeos.",
      "Sigue solo cuentas con audiencia real sobre vivienda, hipoteca, barrios o finanzas.",
      "Si encaja mucho, deja un comentario útil antes de contactar."
    ],
    doneWhen: "Completa cuando hayas seguido o descartado conscientemente 5 cuentas."
  },
  hooks: {
    steps: [
      "Elige 3 ideas vistas hoy y conviértelas en frases de primer segundo.",
      "Comprueba que el hook no promete chollos, ahorro garantizado ni tasación exacta.",
      "Pulsa Crear vídeo en el hook con más potencial."
    ],
    doneWhen: "Completa cuando tengas 3 hooks y 1 candidato para vídeo."
  },
  outreach: {
    steps: [
      "Abre el perfil recomendado y valida si merece contacto hoy.",
      "Copia el mensaje y personaliza la primera frase con algo concreto del creador.",
      "Envía manualmente o marca pendiente si conviene calentar antes."
    ],
    doneWhen: "Completa cuando hayas contactado 1 creador o decidido calentar primero."
  },
  create_video: {
    steps: [
      "Elige el hook o aprendizaje más fuerte del día.",
      "Crea el brief/vídeo y revisa privacidad, disclaimer y CTA.",
      "Deja listo caption, hashtags y siguiente acción."
    ],
    doneWhen: "Completa cuando exista 1 vídeo preparado para grabar, publicar o programar."
  }
};

function guideList(items = [], title = "Qué tienes que hacer") {
  const clean = items.filter(Boolean);
  if (!clean.length) return "";
  return `
    <div class="admin-viraliza-howto">
      <strong>${escapeHtml(title)}</strong>
      <ol>${clean.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>
    </div>
  `;
}

function renderViralizaKpis(routine) {
  if (!els.viralizaKpis) return;
  if (!routine) {
    els.viralizaKpis.innerHTML = [
      stat("Rutina de hoy", "Pendiente", { hint: "Genera la rutina para empezar" }),
      stat("Racha actual", "0", { hint: "Días ejecutando la rutina" }),
      stat("Oportunidades", "0", { hint: "Keywords y búsquedas listas" }),
      stat("Comentarios", "0", { hint: "Comentarios preparados" })
    ].join("");
    return;
  }
  const completed = (routine.tasks || []).filter((task) => task.status === "completed").length;
  const total = (routine.tasks || []).length || 1;
  els.viralizaKpis.innerHTML = [
    stat("Rutina de hoy", `${completed}/${total}`, { hint: routine.status === "completed" ? "Completada" : "Pendiente" }),
    stat("Racha actual", routine.streak || "1", { hint: "Día activo de ejecución" }),
    stat("Oportunidades", (routine.keywords || []).length, { hint: "Keywords encontradas hoy" }),
    stat("Comentarios", (routine.comments || []).length, { hint: "Máximo 2 con marca" }),
    stat("Creadores nuevos", (routine.creators || []).length, { hint: "Detectados para revisar" }),
    stat("Contactados semana", routine.contactedThisWeek || 0, { hint: "Manual, no automático" }),
    stat("Vídeos semana", routine.videosThisWeek || 0, { hint: "Briefs o piezas creadas" }),
    stat("Formatos winners", routine.winningFormats || 0, { hint: "Aprendizaje semanal" })
  ].join("");
}

function viralizaTaskContext(task, routine) {
  if (task?.type !== "keyword_search") return "";
  const keywords = (routine?.primaryKeywords || routine?.keywords || []).slice(0, 3);
  if (!keywords.length) {
    return `<p class="admin-viraliza-done"><strong>Keywords propuestas:</strong> genera una rutina para verlas aquí.</p>`;
  }
  return `
    <div class="admin-viraliza-howto admin-viraliza-task-context">
      <strong>Keywords propuestas hoy:</strong>
      <ol>
        ${keywords
          .map((keyword) => {
            const urls = keyword.searchUrls || {};
            return `
              <li>
                <strong>${escapeHtml(keyword.keyword)}</strong>
                <span>${escapeHtml(keyword.intent || "Busca conversaciones reales sobre este tema.")}</span>
                <div class="admin-row-actions">
                  ${urls.tiktok ? `<button class="admin-button tiny ghost" type="button" data-open-url="${escapeHtml(urls.tiktok)}">TikTok</button>` : ""}
                  ${urls.youtube ? `<button class="admin-button tiny ghost" type="button" data-open-url="${escapeHtml(urls.youtube)}">YouTube</button>` : ""}
                  ${urls.instagram ? `<button class="admin-button tiny ghost" type="button" data-open-url="${escapeHtml(urls.instagram)}">Instagram</button>` : ""}
                </div>
              </li>
            `;
          })
          .join("")}
      </ol>
    </div>
  `;
}

function viralizaTaskCard(task, routine) {
  const guide = VIRALIZA_TASK_GUIDES[task.type] || {};
  const steps = Array.isArray(task.steps) && task.steps.length ? task.steps : guide.steps || [];
  const doneWhen = task.doneWhen || guide.doneWhen || "";
  return `
    <article class="admin-viraliza-card">
      <div class="admin-viraliza-card-head">
        ${chip(task.status || "pending", viralizaStatusTone(task.status))}
        <span>${escapeHtml(task.priority || "medium")} · ${escapeHtml(task.difficulty || "easy")} · ${escapeHtml(task.estimatedMinutes || "-")} min</span>
      </div>
      <h3>${escapeHtml(task.title)}</h3>
      <p>${escapeHtml(task.description || "")}</p>
      ${viralizaTaskContext(task, routine)}
      ${guideList(steps)}
      ${doneWhen ? `<p class="admin-viraliza-done"><strong>Cuando marcarlo hecho:</strong> ${escapeHtml(doneWhen)}</p>` : ""}
      <div class="admin-row-actions">
        <button class="admin-button tiny ghost" type="button" data-viraliza-record data-entity-type="task" data-entity-id="${escapeHtml(task.id)}" data-action-type="in_progress">Marcar en curso</button>
        <button class="admin-button tiny" type="button" data-viraliza-record data-entity-type="task" data-entity-id="${escapeHtml(task.id)}" data-action-type="completed">Marcar hecho</button>
      </div>
    </article>
  `;
}

function viralizaKeywordCard(keyword) {
  const urls = keyword.searchUrls || {};
  return `
    <article class="admin-viraliza-card admin-viraliza-keyword">
      <div class="admin-viraliza-card-head">
        ${chip(keyword.category || "keyword", "draft")}
        <span>${escapeHtml((keyword.platforms || []).map(platformLabel).join(", "))}</span>
      </div>
      <h3>${escapeHtml(keyword.keyword)}</h3>
      <p>${escapeHtml(keyword.intent || "")}</p>
      ${guideList(
        [
          "Abre una plataforma y revisa resultados recientes, no solo los más virales.",
          "Busca preguntas de usuarios, dudas de hipoteca, quejas de zona o comparativas.",
          "Si ves un patrón repetido, conviértelo en comentario, hook o vídeo."
        ],
        "Cómo usar esta keyword"
      )}
      <ul>${(keyword.whatToLookFor || []).slice(0, 3).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      <div class="admin-row-actions">
        ${Object.entries(urls)
          .slice(0, 4)
          .map(([platform, url]) => `<button class="admin-button tiny ghost" type="button" data-open-url="${escapeHtml(url)}">Abrir ${escapeHtml(platformLabel(platform))}</button>`)
          .join("")}
      </div>
    </article>
  `;
}

function viralizaCommentCard(comment) {
  return `
    <article class="admin-viraliza-card">
      <div class="admin-viraliza-card-head">
        ${chip(comment.type || "comment", "draft")}
        ${chip(comment.brandMention ? "marca" : "sin marca", comment.brandMention ? "warn" : "ready")}
      </div>
      <p class="admin-viraliza-copy">${escapeHtml(comment.text)}</p>
      ${guideList(
        [
          "Úsalo solo si el vídeo realmente habla de este tema.",
          "Ajusta una frase para que no parezca comentario genérico.",
          "Después de publicarlo, guarda la URL y revisa respuestas en 24h."
        ],
        "Antes de publicarlo"
      )}
      <small>${escapeHtml(comment.bestFor || "")} · riesgo ${escapeHtml(comment.risk || "low")}</small>
      <div class="admin-row-actions">
        <button class="admin-button tiny" type="button" data-copy-text="${escapeHtml(comment.text)}">Copiar</button>
        <button class="admin-button tiny ghost" type="button" data-viraliza-record data-entity-type="comment" data-entity-id="${escapeHtml(comment.id)}" data-action-type="used">Marcar usado</button>
      </div>
    </article>
  `;
}

function viralizaHookCard(hook) {
  return `
    <article class="admin-viraliza-card">
      <div class="admin-viraliza-card-head">
        ${chip(hook.category || "hook", "draft")}
        <span>${escapeHtml(hook.series || "")} · ${escapeHtml(hook.suggestedDuration || 28)}s</span>
      </div>
      <h3>${escapeHtml(hook.hook)}</h3>
      <p>${escapeHtml(hook.scriptPreview || "")}</p>
      <small>Overlay: ${escapeHtml(hook.overlayExample || "")}</small>
      ${guideList(
        [
          "Úsalo si responde a una conversación vista hoy.",
          "Convierte el hook en un vídeo corto con datos anonimizados o simulados.",
          "Termina con una pregunta clara para comentarios."
        ],
        "Cómo convertirlo en vídeo"
      )}
      <div class="admin-row-actions">
        <button class="admin-button tiny" type="button" data-copy-text="${escapeHtml(hook.hook)}">Copiar</button>
        <button class="admin-button tiny ghost" type="button" data-viraliza-create-video-from-hook="${escapeHtml(hook.id)}">Crear vídeo</button>
      </div>
    </article>
  `;
}

function viralizaCreatorCard(creator) {
  return `
    <article class="admin-viraliza-card">
      <div class="admin-viraliza-card-head">
        ${chip(`Score ${creator.creatorFitScore || 0}`, scoreTone(creator.creatorFitScore), "score")}
        <span>${escapeHtml(platformLabel(creator.platform))} · ${escapeHtml(creator.category || "")}</span>
      </div>
      <h3>${escapeHtml(creator.name || creator.handle || "Creador")}</h3>
      <p>${escapeHtml(creator.whyRelevant || creator.reason || "")}</p>
      <small>${escapeHtml((creator.topics || []).join(", "))}</small>
      ${guideList(
        [
          "Abre el perfil y revisa si su audiencia es de España.",
          "Mira si responde comentarios y si hay preguntas reales.",
          "Sigue solo si puedes aportar valor; si encaja mucho, comenta antes de contactar."
        ],
        "Decisión manual"
      )}
      <div class="admin-row-actions">
        <button class="admin-button tiny ghost" type="button" data-open-url="${escapeHtml(creator.url || "")}">Abrir perfil</button>
        <button class="admin-button tiny ghost" type="button" data-copy-text="${escapeHtml(creator.handle || "")}">Copiar handle</button>
        <button class="admin-button tiny" type="button" data-viraliza-record data-entity-type="creator" data-entity-id="${escapeHtml(creator.id)}" data-action-type="followed">Marcar seguido</button>
      </div>
    </article>
  `;
}

function viralizaSavedVideoCard(video, index) {
  return `
    <article class="admin-viraliza-card">
      <div class="admin-viraliza-card-head">
        ${chip(video.status || "pending", viralizaStatusTone(video.status))}
        <span>${escapeHtml(platformLabel(video.platform))}</span>
      </div>
      <h3>Vídeo ${index + 1}</h3>
      <p>Pega una URL, anota por qué funciona y crea una adaptación para InmoRadar. No copies el contenido: adapta el formato.</p>
      ${guideList(
        [
          "Guarda un vídeo con hook fuerte o muchos comentarios útiles.",
          "Resume en una frase por qué funciona.",
          "Piensa la version InmoRadar: antes de llamar, chollo o humo, A vs B, checklist o error."
        ],
        "Qué guardar"
      )}
      <div class="admin-row-actions">
        <button class="admin-button tiny ghost" type="button" data-viraliza-record data-entity-type="saved_video" data-entity-id="${escapeHtml(video.id)}" data-action-type="saved">Marcar guardado</button>
        <button class="admin-button tiny ghost" type="button" data-viraliza-saved-brief="${escapeHtml(video.id)}">Crear idea</button>
      </div>
    </article>
  `;
}

function renderViralizaOutreach(routine) {
  if (!els.viralizaOutreach) return;
  const creator = routine?.creatorToContact;
  const message = routine?.outreachMessage;
  if (!creator || !message) {
    els.viralizaOutreach.innerHTML = `<p class="admin-empty-state">Genera una rutina para ver el creador recomendado.</p>`;
    return;
  }
  els.viralizaOutreach.innerHTML = `
    <article class="admin-viraliza-card">
      <div class="admin-viraliza-card-head">
        ${chip(`Outreach ${creator.outreachScore || 0}`, scoreTone(creator.outreachScore), "score")}
        <span>${escapeHtml(creator.recommendedAction || "warm_comment")}</span>
      </div>
      <h3>${escapeHtml(creator.name || creator.handle)}</h3>
      <p>${escapeHtml(creator.bestCollabIdea || message.collaborationIdea || "")}</p>
      <pre>${escapeHtml(message.dm || message.medium || message.short || "")}</pre>
      ${guideList(
        [
          "No lo envíes tal cual si no has mirado el perfil.",
          "Cambia la primera frase para mencionar un vídeo, tema o ciudad concreta.",
          "Ofrece probar InmoRadar o hacer un contenido útil, no pedir promoción directa."
        ],
        "Antes de enviar"
      )}
      <div class="admin-row-actions">
        <button class="admin-button tiny" type="button" data-copy-text="${escapeHtml(message.dm || message.medium || message.short || "")}">Copiar mensaje</button>
        <button class="admin-button tiny ghost" type="button" data-viraliza-record data-entity-type="outreach" data-entity-id="${escapeHtml(message.id)}" data-action-type="contacted">Marcar contactado</button>
      </div>
    </article>
  `;
}

function renderViralizaSteps(routine) {
  if (!els.viralizaSteps) return;
  if (!routine) {
    els.viralizaSteps.innerHTML = `<p class="admin-empty-state">Genera una rutina para activar el modo ejecución.</p>`;
    return;
  }
  const keywords = (routine.primaryKeywords || routine.keywords || []).slice(0, 3);
  const comments = (routine.comments || []).slice(0, 10);
  const creators = (routine.followQueue || []).slice(0, 5);
  const hooks = (routine.hooks || []).slice(0, 3);
  const message = routine.outreachMessage;
  els.viralizaSteps.innerHTML = `
    <article class="admin-viraliza-step">
      <span>Pantalla 1</span>
      <h3>Busca estas 3 keywords</h3>
        <p class="admin-viraliza-step-intro">Hazlo primero. Abre las búsquedas, detecta conversaciones reales y vuelve con ideas concretas.</p>
      ${keywords.map(viralizaKeywordCard).join("")}
    </article>
    <article class="admin-viraliza-step">
      <span>Pantalla 2</span>
        <h3>Guarda 5 vídeos buenos</h3>
      <p class="admin-viraliza-step-intro">Guarda referencias por formato, no por tema exacto. La pregunta es: ¿cómo lo adaptamos a InmoRadar?</p>
      ${(routine.savedVideos || []).slice(0, 5).map(viralizaSavedVideoCard).join("")}
    </article>
    <article class="admin-viraliza-step">
      <span>Pantalla 3</span>
        <h3>Comenta en 10 vídeos</h3>
        <p class="admin-viraliza-step-intro">Copia, adapta y publica manualmente. Si no aporta valor al vídeo, no lo uses.</p>
      ${comments.map(viralizaCommentCard).join("")}
    </article>
    <article class="admin-viraliza-step">
      <span>Pantalla 4</span>
      <h3>Sigue 5 cuentas</h3>
      <p class="admin-viraliza-step-intro">Revisa cada perfil antes de seguir. Queremos cuentas con audiencia real y conversación útil.</p>
      ${creators.map(viralizaCreatorCard).join("")}
    </article>
    <article class="admin-viraliza-step">
      <span>Pantalla 5</span>
      <h3>Anota 3 hooks</h3>
      <p class="admin-viraliza-step-intro">Elige hooks que puedas producir rápido y que terminen en pregunta o debate.</p>
      ${hooks.map(viralizaHookCard).join("")}
    </article>
    <article class="admin-viraliza-step">
      <span>Pantalla 6</span>
      <h3>Contacta 1 creador</h3>
      <p class="admin-viraliza-step-intro">Contacta solo si el perfil encaja. Personaliza el mensaje antes de enviarlo.</p>
      ${message ? `<pre>${escapeHtml(message.dm || message.medium || "")}</pre><button class="admin-button tiny" type="button" data-copy-text="${escapeHtml(message.dm || message.medium || "")}">Copiar mensaje</button>` : `<p class="admin-empty-state">Sin creador recomendado.</p>`}
    </article>
    <article class="admin-viraliza-step">
        <span>Resumen del día</span>
      <h3>Aprendizajes y proximos pasos</h3>
      <p>Registra URL, resultados y notas después de 24h para que el Learning Engine detecte winners.</p>
    </article>
  `;
}

const VIRALIZA_OVERVIEW_COPY = {
  title: "Viraliza",
  subtitle: "Tu radar diario para encontrar conversaciones, creadores y formatos que pueden hacer crecer InmoRadar.",
  noteTitle: "Qué haces cada día",
  note:
    "Primero genera la rutina. Después usa modo ejecución para ir paso a paso y buscar oportunidades para abrir la primera búsqueda sugerida.",
  actions: [
    {
      label: "Generar rutina de hoy",
      text: "Prepara la agenda diaria: 3 keywords, comentarios sugeridos, cuentas a revisar, hooks, outreach y espacios para guardar vídeos de inspiración."
    },
    {
      label: "Modo ejecución",
      text: "Convierte la rutina en un asistente paso a paso. Sirve para hacerlo en orden y marcar cada acción cuando ya la hayas ejecutado manualmente."
    },
    {
      label: "Buscar oportunidades",
      text: "Abre la primera búsqueda recomendada del día para validar vídeos, comentarios y conversaciones reales antes de actuar."
    }
  ]
};

function setElementHidden(element, hidden) {
  if (element) element.hidden = Boolean(hidden);
}

function renderViralizaResults(routine) {
  if (!els.viralizaResultsContent) return;
  const tasks = routine?.tasks || [];
  const comments = routine?.comments || [];
  const creators = routine?.followQueue || [];
  const hooks = routine?.hooks || [];
  const completedTasks = tasks.filter((task) => task.status === "completed").length;
  const usedComments = comments.filter((comment) => ["used", "completed"].includes(String(comment.status || ""))).length;
  const followedCreators = creators.filter((creator) => ["followed", "completed"].includes(String(creator.status || ""))).length;
  const contacted = routine?.outreachMessage?.status === "contacted" || routine?.creatorToContact?.status === "contacted" ? 1 : 0;
  const quality = routine?.qualityCheck || {};
  const actions = [
    "Completa la rutina diaria y registra URL real de cada comentario usado.",
    "Revisa 24h después likes, respuestas, visitas de perfil y clicks al link.",
    "Si un hook genera retención o comentarios, crea 10 variantes del mismo formato.",
    "Si un creador responde, muévelo al pipeline de colaboración y prepara un brief conjunto."
  ];
  els.viralizaResultsContent.innerHTML = `
    <article class="admin-viraliza-result-card">
      <span>Rutina</span>
      <strong>${escapeHtml(completedTasks)}/${escapeHtml(tasks.length || 7)}</strong>
      <p>Tareas completadas hoy.</p>
    </article>
    <article class="admin-viraliza-result-card">
      <span>Comentarios</span>
      <strong>${escapeHtml(usedComments)}/${escapeHtml(comments.length || 10)}</strong>
      <p>Marca como usado y añade la URL donde lo publicaste.</p>
    </article>
    <article class="admin-viraliza-result-card">
      <span>Creadores</span>
      <strong>${escapeHtml(followedCreators)}/${escapeHtml(creators.length || 5)}</strong>
      <p>Cuentas revisadas y seguidas manualmente.</p>
    </article>
    <article class="admin-viraliza-result-card">
      <span>Outreach</span>
      <strong>${escapeHtml(contacted)}/1</strong>
      <p>Contacto del día preparado o enviado manualmente.</p>
    </article>
    <article class="admin-viraliza-result-card">
      <span>Hooks</span>
      <strong>${escapeHtml(hooks.length || 0)}</strong>
      <p>Hooks disponibles para convertir en vídeos y comparar rendimiento.</p>
    </article>
    <article class="admin-viraliza-result-card">
      <span>Control de calidad</span>
      <strong>${quality.passed === false ? "Revisar" : "OK"}</strong>
      <p>${escapeHtml((quality.issues || []).join(", ") || "Rutina human-in-the-loop, sin automatizar comentarios, follows ni DMs.")}</p>
    </article>
    <article class="admin-viraliza-result-card admin-viraliza-result-wide">
      <span>Learning Engine</span>
      <strong>Próximas acciones</strong>
      <ul>${actions.map((action) => `<li>${escapeHtml(action)}</li>`).join("")}</ul>
    </article>
  `;
}

function viralizaLearningRow(label, value, detail = "") {
  return `
    <article class="admin-viraliza-result-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <p>${escapeHtml(detail)}</p>
    </article>
  `;
}

function viralizaLearningList(items = [], empty = "Sin datos suficientes todavia.") {
  if (!items.length) return `<p class="admin-empty-state">${escapeHtml(empty)}</p>`;
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function viralizaPerformanceTable(rows = [], type = "creator") {
  if (!rows.length) return `<p class="admin-empty-state">Aun no hay rendimiento suficiente.</p>`;
  const firstColumn = type === "creator" ? "Cuenta" : type === "platform" ? "Plataforma" : "Tipo";
  return `
    <div class="admin-table-wrap compact">
      <table class="admin-table admin-viraliza-learning-table">
        <thead><tr><th>${firstColumn}</th><th>Acciones</th><th>Resp.</th><th>Installs</th><th>Score</th></tr></thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${escapeHtml(row.displayName || row.handle || row.label || row.key || "-")}<small>${row.platform ? ` � ${platformLabel(row.platform)}` : row.category ? ` � ${row.category}` : ""}</small></td>
              <td>${escapeHtml(row.actions || 0)}</td>
              <td>${escapeHtml(row.replies || 0)}</td>
              <td>${escapeHtml(row.installsAttributed || 0)}</td>
              <td>${chip(row.averageScore || 0, scoreTone(row.averageScore), "score")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderViralizaLearning() {
  if (!els.viralizaLearningContent) return;
  const performance = state.viraliza.performance || {};
  const learning = state.viraliza.learning || {};
  const summary = performance.summary || {};
  const warning = state.viraliza.learningWarning || "";
  const warningHtml = warning ? `<p class="admin-empty-state">Modo degradado: no se pudo leer todo el aprendizaje. Detalle: ${escapeHtml(warning)}</p>` : "";
  els.viralizaLearningContent.innerHTML = `
    ${warningHtml}
    <div class="admin-viraliza-results-grid admin-viraliza-learning-summary">
      ${viralizaLearningRow("Acciones 7 dias", summary.actionsLast7Days || 0, `${summary.totalActions || 0} acciones historicas`)}
      ${viralizaLearningRow("Respuestas", summary.replies || 0, "Senal fuerte de conversacion")}
      ${viralizaLearningRow("Likes", summary.likes || 0, "Senal ligera de interes")}
      ${viralizaLearningRow("Visitas perfil", summary.profileVisits || 0, "Interes intermedio")}
      ${viralizaLearningRow("Installs", summary.installsAttributed || 0, "Senal de conversion manual")}
      ${viralizaLearningRow("Score medio", summary.averageScore || 0, "0-100 ponderado")}
    </div>
    <div class="admin-viraliza-learning-grid">
      <article class="admin-viraliza-result-card admin-viraliza-result-wide">
        <span>Top cuentas</span>
        <strong>Que perfiles funcionan</strong>
        ${viralizaPerformanceTable(performance.topCreators || [], "creator")}
      </article>
      <article class="admin-viraliza-result-card">
        <span>Mejor plataforma</span>
        <strong>${escapeHtml((performance.topPlatforms || [])[0]?.label || "Pendiente")}</strong>
        ${viralizaPerformanceTable((performance.topPlatforms || []).slice(0, 4), "platform")}
      </article>
      <article class="admin-viraliza-result-card">
        <span>Mejor comentario</span>
        <strong>${escapeHtml((performance.topCommentTypes || [])[0]?.label || "Pendiente")}</strong>
        ${viralizaPerformanceTable((performance.topCommentTypes || []).slice(0, 4), "comment")}
      </article>
      <article class="admin-viraliza-result-card admin-viraliza-result-wide">
        <span>Que esta funcionando</span>
        <strong>Insights</strong>
        ${viralizaLearningList(learning.insights || [])}
      </article>
      <article class="admin-viraliza-result-card admin-viraliza-result-wide">
        <span>Recomendaciones para manana</span>
        <strong>Siguiente rutina</strong>
        ${viralizaLearningList(learning.nextActions || performance.recommendations || [])}
      </article>
    </div>
  `;
}

async function loadViralizaLearning() {
  if (!els.viralizaLearningContent) return;
  const [performanceResult, learningResult] = await Promise.allSettled([
    api("/api/admin?resource=viraliza/performance"),
    api("/api/admin?resource=viraliza/learning")
  ]);
  const performancePayload = performanceResult.status === "fulfilled" ? performanceResult.value : {};
  const learningPayload = learningResult.status === "fulfilled" ? learningResult.value : {};
  state.viraliza.performance = performancePayload.performance || null;
  state.viraliza.learning = learningPayload.learning || null;
  state.viraliza.learningWarning = [
    ...(performancePayload.persisted === false ? performancePayload.warnings || [performancePayload.error] : []),
    ...(learningPayload.persisted === false ? learningPayload.warnings || [learningPayload.error] : [])
  ].filter(Boolean).join(" | ");
  renderViralizaLearning();
}
function syncViralizaFocusedArea() {
  const copy = VIRALIZA_OVERVIEW_COPY;
  if (els.viralizaTitle) els.viralizaTitle.textContent = copy.title;
  if (els.viralizaSubtitle) els.viralizaSubtitle.textContent = copy.subtitle;
  if (els.viralizaFocusNote) {
    els.viralizaFocusNote.innerHTML = `
      <strong>${escapeHtml(copy.noteTitle)}</strong>
      <p>${escapeHtml(copy.note)}</p>
      <div class="admin-viraliza-howto">
        <strong>Qué significa cada botón:</strong>
        <ol>
          ${(copy.actions || [])
            .map((action) => `<li><strong>${escapeHtml(action.label)}:</strong> ${escapeHtml(action.text)}</li>`)
            .join("")}
        </ol>
      </div>
    `;
  }

  setElementHidden(els.viralizaLayout, false);
  setElementHidden(els.viralizaRoutineBlock, false);
  setElementHidden(els.viralizaKeywordsBlock, false);
  setElementHidden(els.viralizaCommentsBlock, false);
  setElementHidden(els.viralizaHooksBlock, false);
  setElementHidden(els.viralizaCreatorsBlock, false);
  setElementHidden(els.viralizaOutreachBlock, false);
  setElementHidden(els.viralizaSavedVideosBlock, false);
  setElementHidden(els.viralizaContextForm?.closest(".admin-viraliza-tools"), false);
  setElementHidden(els.viralizaResultsBlock, false);
}


function renderViralizaRealCreators() {
  if (!els.viralizaRealCreators) return;
  const creators = state.viraliza.realCreators || [];
  const warning = state.viraliza.creatorsStorageWarning || "";
  const warningHtml = warning
    ? `<p class="admin-empty-state">Modo degradado: no se pudo leer o guardar 'viral_creators'. Ejecuta database/viraliza.sql en Supabase. Detalle: ${escapeHtml(warning)}</p>`
    : "";
  if (!creators.length) {
    els.viralizaRealCreators.innerHTML = warningHtml || `<p class="admin-empty-state">Aun no hay cuentas reales importadas. Agrega una manualmente o pega un JSON revisado.</p>`;
    return;
  }
  els.viralizaRealCreators.innerHTML = warningHtml + creators
    .map((creator) => `
      <article class="admin-viraliza-real-item">
        <div>
          <strong>${escapeHtml(creator.displayName || creator.name || creator.handle || "Cuenta")}</strong>
          <span>${escapeHtml(platformLabel(creator.platform))} · ${escapeHtml(creator.handle || "")}</span>
          <small>${escapeHtml(creator.category || "")} ${creator.city ? `· ${escapeHtml(creator.city)}` : ""}</small>
        </div>
        <div class="admin-row-actions">
          ${chip(`Score ${creator.creatorFitScore || 0}`, scoreTone(creator.creatorFitScore), "score")}
          ${creator.profileUrl || creator.url ? `<button class="admin-button tiny ghost" type="button" data-open-url="${escapeHtml(creator.profileUrl || creator.url)}">Abrir</button>` : ""}
        </div>
      </article>
    `)
    .join("");
}

function renderViralizaDailyPlan() {
  if (!els.viralizaDailyPlan) return;
  const plan = state.viraliza.dailyCreatorPlan || [];
  const warning = state.viraliza.dailyPlanWarning || "";
  const warningHtml = warning
    ? `<p class="admin-empty-state">Modo degradado: no se pudo leer todo el historial de Viraliza. Ejecuta database/viraliza.sql en Supabase. Detalle: ${escapeHtml(warning)}</p>`
    : "";
  if (!plan.length) {
    els.viralizaDailyPlan.innerHTML = warningHtml || `<p class="admin-empty-state">Sin plan con cuentas reales. Importa cuentas y pulsa Actualizar plan de hoy.</p>`;
    return;
  }
  els.viralizaDailyPlan.innerHTML = warningHtml + plan
    .map((item) => `
      <article class="admin-viraliza-plan-card">
        <div class="admin-viraliza-card-head">
          ${chip(`Score ${item.priorityScore || 0}`, scoreTone(item.priorityScore), "score")}
          <span>${escapeHtml(platformLabel(item.platform))} · ${escapeHtml(item.recommendedAction || "review_profile")}</span>
        </div>
        <h3>${escapeHtml(item.displayName || item.handle || "Cuenta")}</h3>
        <p><strong>${escapeHtml(item.handle || "")}</strong> ${escapeHtml(item.category || "")}</p>
        <p>${escapeHtml(item.whyThisCreator || "")}</p>
        ${guideList([item.whatToLookFor], "Que mirar en su perfil")}
        <div class="admin-viraliza-message-box">
          <span>Comentario sugerido</span>
          <p>${escapeHtml(item.suggestedComment || "")}</p>
          <button class="admin-button tiny" type="button" data-copy-text="${escapeHtml(item.suggestedComment || "")}">Copiar comentario</button>
        </div>
        <div class="admin-viraliza-message-box">
          <span>DM sugerido</span>
          <p>${escapeHtml(item.suggestedDm || "")}</p>
          <button class="admin-button tiny ghost" type="button" data-copy-text="${escapeHtml(item.suggestedDm || "")}">Copiar DM</button>
        </div>
        <div class="admin-row-actions">
          ${item.profileUrl ? `<button class="admin-button tiny ghost" type="button" data-open-url="${escapeHtml(item.profileUrl)}">Abrir perfil</button>` : ""}
          <button class="admin-button tiny ghost" type="button" data-viraliza-plan-action="reviewed" data-plan-id="${escapeHtml(item.id)}">Revisado</button>
          <button class="admin-button tiny ghost" type="button" data-viraliza-plan-action="commented" data-plan-id="${escapeHtml(item.id)}">Comentado</button>
          <button class="admin-button tiny ghost" type="button" data-viraliza-plan-action="followed" data-plan-id="${escapeHtml(item.id)}">Seguido</button>
          <button class="admin-button tiny ghost" type="button" data-viraliza-plan-action="dm_sent" data-plan-id="${escapeHtml(item.id)}">DM enviado</button>
          <button class="admin-button tiny ghost" type="button" data-viraliza-plan-action="skipped" data-plan-id="${escapeHtml(item.id)}">Descartar</button>
          <button class="admin-button tiny" type="button" data-viraliza-result-fill="${escapeHtml(item.id)}">Registrar resultado</button>
        </div>
      </article>
    `)
    .join("");
}

function viralizaFormObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function loadViralizaCreators() {
  if (!els.viralizaRealCreators) return;
  const payload = await api("/api/admin?resource=viraliza/creators");
  state.viraliza.realCreators = payload.creators || [];
  state.viraliza.creatorsStorageWarning = payload.persisted === false ? payload.error || "Falta o falla la tabla viral_creators." : "";
  renderViralizaRealCreators();
}

async function loadViralizaDailyPlan() {
  if (!els.viralizaDailyPlan) return;
  const payload = await api("/api/admin?resource=viraliza/daily-plan");
  state.viraliza.dailyCreatorPlan = payload.dailyCreatorPlan || [];
  state.viraliza.dailyPlanWarning = payload.persisted === false ? (payload.warnings || []).join(" | ") || "Falta o falla alguna tabla Viraliza." : "";
  renderViralizaDailyPlan();
}

async function saveViralizaCreator(form) {
  const creator = viralizaFormObject(form);
  const payload = await api("/api/admin?resource=viraliza/creators", {
    method: "POST",
    body: JSON.stringify({ creator })
  });
  if (payload.creator) {
    state.viraliza.creatorsStorageWarning = payload.persisted === false ? payload.error || "Falta o falla la tabla viral_creators." : "";
    state.viraliza.realCreators = [payload.creator, ...(state.viraliza.realCreators || []).filter((item) => item.id !== payload.creator.id)];
    renderViralizaRealCreators();
  }
  form.reset();
  showStatus(payload.persisted ? "Cuenta real guardada." : "Cuenta preparada, pero no se guardo en Supabase. Revisa database/viraliza.sql.", payload.persisted ? "good" : "neutral");
  await Promise.allSettled([loadViralizaDailyPlan(), loadViralizaLearning()]);
}

async function importViralizaCreators() {
  const raw = els.viralizaImportJson?.value || "";
  if (!raw.trim()) return showStatus("Pega un array JSON de cuentas reales primero.", "bad");
  let parsed;
  let creators;
  try {
    parsed = JSON.parse(raw);
    creators = Array.isArray(parsed) ? parsed : Array.isArray(parsed.creators) ? parsed.creators : null;
  } catch (error) {
    return showStatus("JSON no valido. Pega un array de cuentas o { creators: [...] }.", "bad");
  }
  if (!creators) return showStatus("JSON valido, pero debe ser un array o un objeto con creators: [...].", "bad");
  const payload = await api("/api/admin?resource=viraliza/creators/import", {
    method: "POST",
    body: JSON.stringify({ creators })
  });
  state.viraliza.creatorsStorageWarning = payload.persisted === false ? payload.error || "Falta o falla la tabla viral_creators." : "";
  state.viraliza.realCreators = payload.creators || state.viraliza.realCreators || [];
  renderViralizaRealCreators();
  if (els.viralizaImportJson) els.viralizaImportJson.value = "";
  showStatus(payload.persisted ? `${payload.count || 0} cuentas importadas.` : `${payload.count || 0} cuentas preparadas, pero no guardadas.`, payload.persisted ? "good" : "neutral");
  await Promise.allSettled([loadViralizaDailyPlan(), loadViralizaLearning()]);
}

function viralizaPlanItem(id) {
  return (state.viraliza.dailyCreatorPlan || []).find((item) => item.id === id);
}

async function recordViralizaPlanAction(button) {
  const item = viralizaPlanItem(button.dataset.planId);
  if (!item) return;
  const actionType = button.dataset.viralizaPlanAction || "reviewed";
  const action = {
    id: `${item.id}_${actionType}`,
    creatorId: item.creatorId,
    actionDate: new Date().toISOString().slice(0, 10),
    platform: item.platform,
    actionType,
    targetUrl: item.profileUrl,
    suggestedComment: item.suggestedComment,
    suggestedDm: item.suggestedDm,
    status: "completed"
  };
  const payload = await api("/api/admin?resource=viraliza/actions", {
    method: "POST",
    body: JSON.stringify(action)
  });
  item.status = actionType;
  button.textContent = "Registrado";
  button.disabled = true;
  showStatus(payload.persisted ? "Accion manual registrada." : "Accion anotada, pero no guardada en Supabase.", payload.persisted ? "good" : "neutral");
  await loadViralizaLearning().catch(() => null);
}

function prefillViralizaResult(planId) {
  const item = viralizaPlanItem(planId);
  if (!item || !els.viralizaResultForm) return;
  const form = els.viralizaResultForm;
  form.elements.id.value = `${item.id}_${item.recommendedAction || "reviewed"}`;
  form.elements.creator_id.value = item.creatorId || "";
  form.elements.action_type.value = item.recommendedAction || "reviewed";
  form.elements.target_url.value = item.profileUrl || "";
  form.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function saveViralizaResult(form) {
  const action = viralizaFormObject(form);
  const payload = await api("/api/admin?resource=viraliza/actions", {
    method: "POST",
    body: JSON.stringify(action)
  });
  form.reset();
  showStatus(payload.persisted ? "Resultado guardado." : "Resultado preparado, pero no guardado en Supabase.", payload.persisted ? "good" : "neutral");
  await loadViralizaLearning().catch(() => null);
}
function renderViraliza(routine) {
  state.viraliza.routine = routine || state.viraliza.routine;
  const current = state.viraliza.routine;
  renderViralizaKpis(current);
  if (els.viralizaTheme) els.viralizaTheme.textContent = current?.theme || "Aún no hay rutina";
  if (els.viralizaGoal) {
    els.viralizaGoal.textContent =
      current?.dailyGoal || "Aún no hay rutina para hoy. Genera una rutina diaria y empieza por las keywords con más intención.";
  }
  if (els.viralizaRoutine) {
    els.viralizaRoutine.innerHTML = current ? (current.tasks || []).map((task) => viralizaTaskCard(task, current)).join("") : `<p class="admin-empty-state">Aún no hay rutina para hoy.</p>`;
  }
  if (els.viralizaKeywords) {
    els.viralizaKeywords.innerHTML = current ? (current.primaryKeywords || current.keywords || []).slice(0, 3).map(viralizaKeywordCard).join("") : `<p class="admin-empty-state">Genera una rutina para ver keywords.</p>`;
  }
  if (els.viralizaComments) {
    els.viralizaComments.innerHTML = current ? (current.comments || []).map(viralizaCommentCard).join("") : `<p class="admin-empty-state">Genera una rutina para preparar comentarios.</p>`;
  }
  if (els.viralizaHooks) {
    els.viralizaHooks.innerHTML = current ? (current.hooks || []).map(viralizaHookCard).join("") : `<p class="admin-empty-state">Genera una rutina para ver hooks.</p>`;
  }
  if (els.viralizaCreators) {
    els.viralizaCreators.innerHTML = current ? (current.followQueue || []).map(viralizaCreatorCard).join("") : `<p class="admin-empty-state">Genera una rutina para ver cuentas.</p>`;
  }
  if (els.viralizaSavedVideos) {
    els.viralizaSavedVideos.innerHTML = current ? (current.savedVideos || []).map(viralizaSavedVideoCard).join("") : `<p class="admin-empty-state">Genera una rutina para guardar inspiración.</p>`;
  }
  if (els.viralizaExecution) els.viralizaExecution.hidden = !state.viraliza.executionMode;
  renderViralizaOutreach(current);
  renderViralizaSteps(current);
  renderViralizaResults(current);
  syncViralizaFocusedArea();
}

async function loadViraliza() {
  if (!els.viralizaKpis) return;
  const payload = await api("/api/admin?resource=viraliza");
  renderViraliza(payload.routine);
  await Promise.allSettled([loadViralizaCreators(), loadViralizaDailyPlan(), loadViralizaLearning()]);
}

async function generateViralizaRoutine() {
  showStatus("Generando rutina Viraliza...");
  const payload = await api("/api/admin?resource=viraliza", {
    method: "POST",
    body: JSON.stringify({ action: "generate" })
  });
  renderViraliza(payload.routine);
  showStatus(payload.persisted ? "Rutina Viraliza guardada." : "Rutina Viraliza generada sin guardar. Ejecuta database/viraliza.sql si falta la tabla.", payload.persisted ? "good" : "neutral");
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showStatus("Copiado.", "good");
  } catch (error) {
    showStatus("No pude copiar automáticamente. Selecciona el texto manualmente.", "bad");
  }
}

async function recordViralizaAction(button) {
  const record = {
    entityType: button.dataset.entityType,
    entityId: button.dataset.entityId,
    actionType: button.dataset.actionType
  };
  await api("/api/admin?resource=viraliza", {
    method: "POST",
    body: JSON.stringify({ action: "record_action", record })
  }).catch(() => null);
  button.textContent = "Registrado";
  button.disabled = true;
  showStatus("Acción registrada. Recuerda ejecutar siempre manualmente en la plataforma.", "good");
}

async function generateContextualViralizaComments(form) {
  const data = new FormData(form);
  const payload = await api("/api/admin?resource=viraliza", {
    method: "POST",
    body: JSON.stringify({
      action: "contextual_comments",
      context: {
        url: String(data.get("url") || ""),
        creatorType: String(data.get("creator_type") || ""),
        description: String(data.get("description") || "")
      }
    })
  });
  if (!els.viralizaContextOutput) return;
  els.viralizaContextOutput.innerHTML = (payload.result?.comments || [])
    .map((comment) => viralizaCommentCard({ id: `context_${slugId(comment.text)}`, status: "pending", bestFor: comment.type, ...comment }))
    .join("");
}

function setVideoActions(enabled) {
  [els.videoExport].forEach((button) => {
    if (button) button.disabled = !enabled || state.video.busy;
  });
  syncRunwayDurationLabel();
  setRunwayActions();
}

function setVideoBusy(isBusy, message = "Trabajando...") {
  state.video.busy = Boolean(isBusy);
  if (els.videoBusy) {
    els.videoBusy.hidden = !state.video.busy;
  }
  if (els.videoBusyMessage) {
    els.videoBusyMessage.textContent = message;
  }
  if (els.videoPanel) {
    els.videoPanel.setAttribute("aria-busy", state.video.busy ? "true" : "false");
  }
  document.body.classList.toggle("admin-video-busy-active", state.video.busy);
  if (els.videoForm) {
    els.videoForm.querySelectorAll("input, select, button").forEach((control) => {
      control.disabled = state.video.busy;
    });
  }
  if (els.videoRunwayPanel) {
    els.videoRunwayPanel.querySelectorAll("input, select").forEach((control) => {
      control.disabled = state.video.busy;
    });
  }
  setVideoActions(Boolean(state.video.lastProject));
}

function setRunwayStatus(message, tone = "neutral") {
  if (!els.videoRunwayStatus) return;
  els.videoRunwayStatus.textContent = message || "";
  els.videoRunwayStatus.dataset.tone = tone;
}

function runwayErrorMessage(error) {
  const payload = error?.payload || {};
  const code = payload.error || error?.message || "";
  if (code === "social_video_jobs_storage_missing" || /social_video_jobs/i.test(String(payload.message || code))) {
    const message = "Runway no se ha lanzado: falta la tabla social_video_jobs en Supabase. Ejecuta database/social-video-jobs.sql en Supabase SQL Editor y vuelve a pulsar Generar clip Runway.";
    state.video.jobsStorageError = message;
    renderVideoReadiness();
    return message;
  }
  if (code === "runway_estimate_above_max_cost") {
    const estimate = payload.estimate || {};
    const estimatedCost = Number(estimate.estimated_cost_usd || 0);
    const maxCost = Number(payload.max_cost_usd || 0);
    const duration = Number(estimate.duration_seconds || 0);
    if (estimatedCost && maxCost) {
      const recommendedMax = Math.max(estimatedCost, Math.ceil(estimatedCost * 2) / 2);
      const durationText = duration ? ` de ${duration}s` : "";
      return `Ese clip${durationText} cuesta aprox. $${estimatedCost.toFixed(2)} y tu límite actual por render es $${maxCost.toFixed(2)}. Para lanzarlo, sube RUNWAY_MAX_COST_USD a ${recommendedMax.toFixed(2)} en Vercel o baja la duración del storyboard.`;
    }
    return "Ese clip supera el límite de coste por render. Baja la duración del storyboard o sube RUNWAY_MAX_COST_USD en Vercel.";
  }
  if (code === "runway_daily_budget_exceeded") {
    return "Presupuesto diario de Runway agotado. Sube RUNWAY_DAILY_BUDGET_USD o espera a mañana.";
  }
  if (code === "runway_api_secret_missing") {
    return "Falta RUNWAYML_API_SECRET en Vercel. Sin esa clave no se puede lanzar el clip real.";
  }
  if (code === "runway_render_disabled") {
    return "Runway está apagado. Activa RUNWAY_RENDER_ENABLED=true en Vercel para lanzar renders reales.";
  }
  if (code === "runway_create_failed" && payload.runway_error) {
    const detail = payload.runway_error.message || payload.runway_error.error || payload.message;
    const summary = payload.runway_request_summary
      ? ` Payload: ${payload.runway_request_summary.model || "-"}, ${payload.runway_request_summary.ratio || "-"}, ${payload.runway_request_summary.duration || "-"}s, prompt ${payload.runway_request_summary.prompt_text_chars || 0} chars.`
      : "";
    return `Runway ha rechazado la petición (${payload.runway_status || "sin código"}): ${detail}.${summary} He aplicado un prompt mínimo compatible; recarga, estima de nuevo y lanza otra vez.`;
  }
  if (code === "runway_create_failed" && /validation/i.test(String(payload.message || ""))) {
    return "Runway ha rechazado el formato de la petición. Ahora InmoRadar usa el formato compatible de texto puro; actualiza la página, estima de nuevo el coste y vuelve a lanzar el clip.";
  }
  return payload.message || error?.message || "No se pudo completar la acción de Runway.";
}

function setRunwayActions() {
  const hasProject = Boolean(state.video.lastProject);
  const hasEstimate = Boolean(state.video.runwayEstimate);
  const hasJob = Boolean(state.video.runwayJob?.id);
  const hasResult = Boolean(state.video.runwayJob?.result_url);
  const isBusy = Boolean(state.video.busy);
  if (els.videoRunwayEstimate) els.videoRunwayEstimate.disabled = !hasProject || isBusy;
  if (els.videoRunwayRender) els.videoRunwayRender.disabled = !hasProject || !hasEstimate || isBusy;
  if (els.videoRunwayPoll) els.videoRunwayPoll.disabled = !hasJob || isBusy || hasResult;
  if (els.videoRunwayImport) els.videoRunwayImport.disabled = !hasResult || isBusy;
}

function runwayReadiness(config = state.video.runwayConfig || {}) {
  if (!config || !Object.keys(config).length) {
    return {
      tone: "warn",
      status: "Sin comprobar",
      detail: "Todavía no se ha leído la configuración de Runway."
    };
  }
  if (config.dry_run_only) {
    return {
      tone: "warn",
      status: "Solo estimación",
      detail: "RUNWAY_DRY_RUN_ONLY está activo. Puedes estimar coste, pero no lanzar renders."
    };
  }
  if (!config.enabled) {
    return {
      tone: "warn",
      status: "Render apagado",
      detail: "Falta RUNWAY_RENDER_ENABLED=true. La maqueta local seguirá funcionando."
    };
  }
  if (!config.api_secret_configured) {
    return {
      tone: "bad",
      status: "Falta API key",
      detail: "Configura RUNWAYML_API_SECRET en Vercel para generar clips reales."
    };
  }
  return {
    tone: "good",
    status: "Runway activo",
    detail: `Límite/render $${Number(config.max_cost_usd || 0).toFixed(2)} · presupuesto diario $${Number(config.daily_budget_usd || 0).toFixed(2)}.`
  };
}

function renderVideoReadiness() {
  if (!els.videoReadiness) return;
  const project = state.video.lastProject;
  const status = String(project?.status || "");
  const hasClip = Boolean(state.video.backgroundClipName || project?.has_ai_clip || project?.has_uploaded_clip || status === "ai_clip_ready" || status === "final_exported");
  const finalReady = status === "final_exported";
  const cards = [
    {
      tone: project ? "good" : "warn",
      label: "01 - Storyboard",
      status: project ? "OK" : "Pendiente",
      detail: project ? "Guion, escenas y prompts preparados." : "Genera primero el storyboard."
    },
    {
      tone: hasClip ? "good" : project ? "warn" : "neutral",
      label: "02 - Clip real/IA",
      status: hasClip ? "OK" : project ? "Ahora" : "Pendiente",
      detail: hasClip ? "Ya hay un clip para usar como fondo humano." : "Genera el clip con Runway."
    },
    {
      tone: hasClip ? "good" : "neutral",
      label: "03 - Composición",
      status: hasClip ? "OK" : "Pendiente",
      detail: "Marca, textos, progreso y música se montan aquí."
    },
    {
      tone: finalReady ? "good" : "neutral",
      label: "04 - Listo para redes",
      status: finalReady ? "OK" : "Pendiente",
      detail: finalReady ? "MP4/WebM descargado y proyecto marcado." : "Descarga el vídeo final cuando esté compuesto."
    }
  ];
  els.videoReadiness.innerHTML = cards
    .map(
      (card) => `
        <article data-tone="${escapeHtml(card.tone)}">
          <span>${escapeHtml(card.label)}</span>
          <strong>${escapeHtml(card.status)}</strong>
          <p>${escapeHtml(card.detail)}</p>
        </article>
      `
    )
    .join("");
}

function runwayPayload(extra = {}) {
  const duration = currentRunwayClipDuration();
  return {
    project: state.video.lastProject,
    model: els.videoRunwayModel?.value || "gen4.5",
    duration_seconds: duration,
    scene_index: state.video.selectedSceneIndex || 0,
    ...extra
  };
}

function currentStoryboardDuration() {
  const fromProject = Number(state.video.lastProject?.duration_seconds || 0);
  if (Number.isFinite(fromProject) && fromProject > 0) return fromProject;
  const fromForm = Number(els.videoForm?.querySelector('[name="duration_seconds"]')?.value || 24);
  return Number.isFinite(fromForm) && fromForm > 0 ? fromForm : 24;
}

function currentRunwayClipDuration() {
  const storyboardDuration = currentStoryboardDuration();
  return Math.max(2, Math.min(10, storyboardDuration));
}

function syncRunwayDurationLabel() {
  if (!els.videoRunwayDurationLabel) return;
  const storyboardDuration = currentStoryboardDuration();
  const runwayDuration = currentRunwayClipDuration();
  els.videoRunwayDurationLabel.textContent =
    runwayDuration === storyboardDuration
      ? `${runwayDuration} segundos`
      : `${runwayDuration} segundos · se repite hasta ${storyboardDuration}s`;
}

function formatRunwayEstimate(estimate, limits = {}) {
  if (!estimate) return "Sin estimación.";
  const storyboardDuration = currentStoryboardDuration();
  const clipNote =
    Number(estimate.duration_seconds || 0) < storyboardDuration
      ? ` Clip compatible Runway: ${estimate.duration_seconds}s; el compositor lo repetirá hasta ${storyboardDuration}s.`
      : "";
  const maxCost = limits.max_cost_usd !== undefined ? ` Límite/render: $${Number(limits.max_cost_usd).toFixed(2)}.` : "";
  const dailyBudget = limits.daily_budget_usd !== undefined ? ` Presupuesto diario: $${Number(limits.daily_budget_usd).toFixed(2)}.` : "";
  const endpoint = limits.request?.endpoint ? ` Endpoint API: ${limits.request.endpoint}.` : "";
  const ratio = limits.request?.ratio ? ` Ratio API: ${limits.request.ratio}.` : "";
  const textOnlyNote = limits.request?.endpoint === "text_to_video" ? " Gen-4.5 en texto puro se envía por text_to_video." : "";
  return `Estimación Runway: ${estimate.model}, ${estimate.duration_seconds}s, ${estimate.estimated_credits} créditos, $${Number(estimate.estimated_cost_usd).toFixed(2)}.${clipNote}${endpoint}${ratio}${textOnlyNote}${maxCost}${dailyBudget}`;
}

async function estimateRunwayRender() {
  if (!state.video.lastProject) {
    setRunwayStatus("Genera primero un storyboard.", "bad");
    return null;
  }
  setVideoBusy(true, "Estimando coste de Runway. No gasta créditos.");
  setRunwayStatus("Trabajando: estimando coste de Runway...", "working");
  try {
    const payload = await api("/api/admin?resource=social-video/render", {
      method: "POST",
      body: JSON.stringify(runwayPayload({ dry_run: true }))
    });
    state.video.runwayEstimate = payload.estimate;
    state.video.runwayJob = null;
    setRunwayStatus(formatRunwayEstimate(payload.estimate, payload), "good");
    setRunwayActions();
    return payload;
  } finally {
    setVideoBusy(false);
  }
}

async function startRunwayRender() {
  if (!state.video.runwayEstimate) await estimateRunwayRender();
  if (!els.videoRunwayConfirm?.checked) {
    setRunwayStatus("Marca la confirmación de coste antes de lanzar Runway.", "bad");
    return;
  }
  state.video.jobsStorageError = "";
  renderVideoReadiness();
  setVideoBusy(true, "Lanzando clip en Runway. Puede tardar unos segundos en crear el job.");
  setRunwayStatus("Trabajando: enviando el render a Runway...", "working");
  try {
    const payload = await api("/api/admin?resource=social-video/render", {
      method: "POST",
      body: JSON.stringify(
        runwayPayload({
          confirm_cost_usd: state.video.runwayEstimate?.estimated_cost_usd || 0
        })
      )
    });
    state.video.runwayJob = payload.job;
    if (state.video.lastProject) {
      state.video.lastProject.status = "ai_clip_queued";
      state.video.lastProject.last_job_id = payload.job?.id || null;
      renderVideoPipeline();
      renderVideoStoryboard();
      loadSocialVideos().catch(() => {});
    }
    setRunwayStatus(`Runway lanzado. Job ${payload.job?.id || "-"} en estado ${payload.job?.status || "submitted"}.`, "good");
    showStatus("Render Runway lanzado. Usa Comprobar estado para traer el clip cuando termine.", "good");
  } finally {
    setVideoBusy(false);
    setRunwayActions();
  }
}

async function pollRunwayRender() {
  const jobId = state.video.runwayJob?.id;
  if (!jobId) return;
  setVideoBusy(true, "Comprobando Runway. Si el clip aún no está listo, podrás volver a comprobarlo.");
  setRunwayStatus("Trabajando: comprobando estado del render...", "working");
  try {
    const payload = await api(`/api/admin?resource=social-video/render&job_id=${encodeURIComponent(jobId)}`);
    state.video.runwayJob = payload.job;
    if (payload.job?.result_url) {
      if (state.video.lastProject) {
        state.video.lastProject.status = "ai_clip_ready";
        state.video.lastProject.has_ai_clip = true;
        state.video.lastProject.last_job_id = payload.job.id || state.video.lastProject.last_job_id || null;
        renderVideoPipeline();
        renderVideoReadiness();
        renderVideoStoryboard();
        loadSocialVideos().catch(() => {});
      }
      setRunwayStatus("Runway ha terminado. Pulsa Usar clip IA para cargarlo como fondo.", "good");
    } else if (payload.job?.failure) {
      setRunwayStatus(`Runway fallo: ${payload.job.failure}`, "bad");
    } else {
      setRunwayStatus(`Runway sigue en estado ${payload.job?.status || "pendiente"}.`, "neutral");
    }
    setRunwayActions();
  } finally {
    setVideoBusy(false);
  }
}

async function importRunwayClip() {
  const jobId = state.video.runwayJob?.id;
  if (!jobId) return;
  setVideoBusy(true, "Importando clip Runway para usarlo como fondo.");
  try {
    const response = await fetch(`/api/admin?resource=social-video/render-content&job_id=${encodeURIComponent(jobId)}`, {
      headers: authHeaders()
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.message || payload.error || "runway_clip_import_failed");
    }
    const blob = await response.blob();
    if (state.video.backgroundClipUrl) URL.revokeObjectURL(state.video.backgroundClipUrl);
    state.video.backgroundClipUrl = URL.createObjectURL(blob);
    state.video.backgroundClipName = `runway-${jobId}.mp4`;
    state.video.backgroundClipType = blob.type || "video/mp4";
    if (state.video.lastProject?.id) {
      await updateSocialVideoProjectStatus(state.video.lastProject.id, {
        status: "ai_clip_ready",
        has_ai_clip: true,
        last_job_id: jobId
      }).catch(() => null);
    }
    renderVideoPreview();
    renderVideoStoryboard();
    renderVideoPipeline();
    renderVideoReadiness();
    setRunwayStatus("Clip Runway cargado como fondo. Ya puedes componer el vídeo final con marca InmoRadar.", "good");
    showStatus("Clip Runway cargado como fondo.", "good");
  } finally {
    setVideoBusy(false);
    setRunwayActions();
  }
}

function videoFormPayload(form) {
  ensureVideoPropertyDataDefault(form);
  const data = new FormData(form);
  const propertyDataRaw = String(data.get("property_data") || "").trim();
  let propertyData = {};
  if (propertyDataRaw) {
    try {
      propertyData = JSON.parse(propertyDataRaw);
    } catch (error) {
      throw new Error("El JSON de datos del anuncio no es válido. Revisa comillas, comas y llaves.");
    }
    if (!propertyData || Array.isArray(propertyData) || typeof propertyData !== "object") {
      throw new Error("Los datos del anuncio deben ser un objeto JSON.");
    }
  }
  const city = String(data.get("city") || "").trim();
  if (city && !propertyData.ciudad) propertyData.ciudad = city;
  return {
    series_id: String(data.get("series_id") || "chollo_o_humo"),
    platform: String(data.get("platform") || "tiktok"),
    objective: String(data.get("objective") || "comments_and_installs"),
    topic: String(data.get("topic") || "random"),
    city,
    property_data: propertyData,
    duration_seconds: Number(data.get("duration_seconds") || 24),
    tone: String(data.get("tone") || "directo"),
    audience: String(data.get("audience") || "general"),
    visual_style: String(data.get("visual_style") || "hogar_cotidiano"),
    music_style: String(data.get("music_style") || "warm_house"),
    cta: String(data.get("cta") || "install")
  };
}

function syncVideoBackgroundClip(form) {
  const file = form?.querySelector('[name="background_clip"]')?.files?.[0];
  if (!file) return;
  if (state.video.backgroundClipUrl) {
    URL.revokeObjectURL(state.video.backgroundClipUrl);
  }
  state.video.backgroundClipUrl = URL.createObjectURL(file);
  state.video.backgroundClipName = file.name || "clip-personas-reales";
  state.video.backgroundClipType = file.type || "video";
}

function storedVideoProject(project) {
  if (!project) return null;
  const copy = { ...project };
  delete copy.local_background_clip;
  return copy;
}

function videoFormValue(form, name, fallback = "") {
  const field = form?.querySelector(`[name="${name}"]`);
  return String(field?.value || fallback).trim();
}

function selectedVideoPropertyData(form = els.videoForm) {
  const topic = videoFormValue(form, "topic", "random");
  const series = videoFormValue(form, "series_id", "chollo_o_humo");
  const platform = videoFormValue(form, "platform", "tiktok");
  const objective = videoFormValue(form, "objective", "comments_and_installs");
  const city = videoFormValue(form, "city", "");
  const base = {
    ...DEFAULT_VIDEO_PROPERTY_DATA,
    ...(VIDEO_TOPIC_PROPERTY_DATA[topic] || VIDEO_TOPIC_PROPERTY_DATA.random)
  };
  if (city) base.ciudad = city;
  base.portal = base.portal || "Idealista";
  base.disclaimer = "Estimaciones orientativas. No es una tasación.";
  base.cta = objective === "premium_conversion" ? "Pásalo por InmoRadar antes de contactar." : "¿Tú llamarías?";
  base.url_landing = "https://www.inmoradar.app";
  base.platform = platform;
  base.series_id = series;
  base.topic = topic;
  base.objective = objective;

  if (series === "piso_a_vs_piso_b") {
    return {
      ciudad: base.ciudad,
      barrio: base.barrio,
      portal: base.portal,
      platform,
      series_id: series,
      topic,
      objective,
      precio_base: base.precio,
      metros_a: "68",
      precio_m2_a: base.precio_m2,
      score_a: base.score,
      metros_b: "82",
      precio_m2_b: "3.720 €/m²",
      score_b: "7,1/10",
      ventaja_a: "mejor transporte",
      ventaja_b: "más metros y mejor precio por m²",
      veredicto: "si vas a diario en transporte público, miraría primero el A",
      cta: "¿Tú cuál visitarías primero?",
      disclaimer: base.disclaimer
    };
  }

  if (series === "lo_visitarias") {
    return {
      ...base,
      pros: ["precio competitivo", "transporte razonable", "distribución aprovechable"],
      contras: ["aparcamiento complicado", "conviene validar gastos", "zona a comparar"],
      veredicto_corto: "pediría más información antes de visitar"
    };
  }

  if (series === "mitos_inmobiliarios") {
    return {
      ...base,
      mito: "el piso más barato es siempre el mejor",
      realidad: "el precio necesita contexto de metros, entrada, cuota y zona",
      percepcion: "barato",
      senal_clave: "el coste real"
    };
  }

  if (series === "mini_tutoriales") {
    return {
      ...base,
      paso_1: "mira el precio por metro cuadrado",
      paso_2: "compáralo con la zona",
      paso_3: "revisa entrada, cuota y entorno",
      ejemplo: "el precio es alto, la zona no destaca y el coste inicial se dispara"
    };
  }

  if (series === "pisos_seguidores") {
    return {
      ...base,
      zona_resumen: `${base.barrio || "zona"} en ${base.ciudad || "ciudad no indicada"}`,
      accion_recomendada: "pediría más información antes de visitar",
      razon_principal: "hay señales útiles, pero falta validar costes y entorno"
    };
  }

  return base;
}

function defaultVideoPropertyDataText(form = els.videoForm) {
  return JSON.stringify(selectedVideoPropertyData(form), null, 2);
}

function ensureVideoPropertyDataDefault(form = els.videoForm) {
  const field = form?.querySelector('[name="property_data"]');
  if (field && !String(field.value || "").trim()) {
    field.value = defaultVideoPropertyDataText(form);
  }
}

function refreshVideoPropertyDataFromSelections(form = els.videoForm) {
  const field = form?.querySelector('[name="property_data"]');
  if (!field) return;
  field.value = defaultVideoPropertyDataText(form);
}

function realVideoPackText(project) {
  if (!project) return "";
  const pack = project.real_ai_video || {};
  const scenePrompts = (pack.scene_prompts || project.scenes || [])
    .map((scene, index) => {
      const title = scene.title || scene.headline || `Escena ${index + 1}`;
      const prompt = scene.prompt || scene.visual_prompt || "";
      return `${String(index + 1).padStart(2, "0")} - ${title}\n${prompt}`;
    })
    .join("\n\n");

  return [
    `INMORADAR - PACK VIDEO IA REAL`,
    `Título: ${project.title || ""}`,
    `Duración: ${project.duration_seconds || 24}s`,
    `Formato: ${project.format?.width || 1080}x${project.format?.height || 1920}`,
    project.growth_strategy ? `Serie: ${project.growth_strategy.series || ""}` : "",
    project.growth_strategy ? `Objetivo: ${project.growth_strategy.objective || ""}` : "",
    "",
    project.growth_strategy ? "GUION PERFORMANCE" : "",
    project.growth_strategy?.script || "",
    "",
    project.growth_strategy ? "OVERLAYS" : "",
    project.growth_strategy ? (project.growth_strategy.overlays || []).map((item) => `- ${item}`).join("\n") : "",
    "",
    project.growth_strategy ? "CAPTION Y CTA" : "",
    project.growth_strategy ? `${project.growth_strategy.caption || ""}\nCTA: ${project.growth_strategy.cta || ""}\nDisclaimer: ${project.growth_strategy.disclaimer || ""}` : "",
    "",
    "PROMPT MAESTRO",
    pack.master_prompt || project.global_ai_prompt || "",
    "",
    "NEGATIVE PROMPT",
    pack.negative_prompt || "Sin dibujos, sin 3D, sin avatares, sin caras deformes, sin manos deformes, sin texto ilegible, sin logotipos externos.",
    "",
    "ESCENAS",
    scenePrompts,
    "",
    "MÚSICA",
    project.music_prompt || project.music_direction || "",
    "",
    "BRANDING OBLIGATORIO",
    `Logo InmoRadar arriba derecha. Texto exacto "${project.branding?.websiteText || "Inmoradar.app"}" abajo derecha durante todo el vídeo.`,
    "",
    "USO RECOMENDADO",
    "Genera el vídeo base desde Runway y úsalo como clip IA en InmoRadar para exportar la pieza final con texto, marca y música."
  ].join("\n");
}

function videoProjectStatusLabel(status) {
  const labels = {
    storyboard_ready: "Storyboard listo",
    ai_clip_queued: "Clip IA en cola",
    ai_clip_ready: "Clip IA listo",
    final_exported: "Video final exportado",
    failed: "Error",
    archived: "Archivado"
  };
  return labels[status] || status || "Storyboard listo";
}

function videoPipelineSteps(project) {
  const status = String(project?.status || "storyboard_ready");
  const hasClip = Boolean(state.video.backgroundClipName || project?.has_ai_clip || project?.has_uploaded_clip || status === "ai_clip_ready" || status === "final_exported");
  const finalReady = status === "final_exported";
  return [
    {
      id: "storyboard",
      label: "01 - Storyboard",
      detail: project ? "Guion, escenas y prompts preparados." : "Pendiente de generar.",
      done: Boolean(project)
    },
    {
      id: "clip",
      label: "02 - Clip real/IA",
      detail: hasClip ? "Ya hay un clip para usar como fondo humano." : "Genera un clip con Runway.",
      done: hasClip,
      active: Boolean(project) && !hasClip
    },
    {
      id: "compose",
      label: "03 - Composición",
      detail: "Marca, textos, progreso y música se montan aquí.",
      done: finalReady,
      active: hasClip && !finalReady
    },
    {
      id: "ready",
      label: "04 - Listo para redes",
      detail: finalReady ? "MP4/WebM descargado y proyecto marcado." : "Descarga el vídeo final y el copy.",
      done: finalReady
    }
  ];
}

function renderVideoPipeline() {
  if (!els.videoPipeline) return;
  const project = state.video.lastProject;
  const steps = videoPipelineSteps(project);
  els.videoPipeline.innerHTML = `
    <div class="admin-video-pipeline-grid">
      ${steps
        .map(
          (step) => `
          <article class="admin-video-pipeline-step${step.done ? " done" : ""}${step.active ? " active" : ""}" data-testid="admin-video-pipeline-${escapeHtml(step.id)}">
            <span>${escapeHtml(step.label)}</span>
            <strong>${step.done ? "OK" : step.active ? "Ahora" : "Pendiente"}</strong>
            <p>${escapeHtml(step.detail)}</p>
          </article>
        `
        )
        .join("")}
    </div>
    ${
      project
        ? `<p class="admin-video-storage-note">${
            project.storage?.persisted === false
              ? `No se pudo guardar en Supabase: ${escapeHtml(project.storage.error || "tabla social_video_projects pendiente")}. Ejecuta database/social-video-projects.sql.`
              : project.storage?.persisted
                ? "Proyecto guardado en Supabase. Puedes recuperarlo desde la biblioteca."
                : "Proyecto activo en esta sesión."
          }</p>`
        : ""
    }
  `;
}

function renderVideoProjects() {
  if (!els.videoProjects) return;
  if (state.video.storageError) {
    els.videoProjects.innerHTML = `<p class="admin-empty-state">No puedo leer la biblioteca: ${escapeHtml(state.video.storageError)}. Ejecuta database/social-video-projects.sql.</p>`;
    return;
  }
  const projects = state.video.projects || [];
  if (!projects.length) {
    els.videoProjects.innerHTML = `<p class="admin-empty-state">Todavía no hay proyectos de vídeo guardados.</p>`;
    return;
  }
  els.videoProjects.innerHTML = `
    <div class="admin-video-project-list">
      ${projects
        .map(
          (project) => `
          <button class="admin-video-project-row" type="button" data-video-project-id="${escapeHtml(project.id)}" data-testid="admin-video-project-${escapeHtml(project.id)}">
            <span>
              <strong>${escapeHtml(project.title)}</strong>
              <small>${escapeHtml(project.city || "Sin ciudad")} - ${escapeHtml(project.topic_label || project.topic || "Video")} - ${escapeHtml(formatDate(project.updated_at || project.generated_at))}</small>
            </span>
            <span class="admin-video-project-meta">
              ${chip(videoProjectStatusLabel(project.status), project.status === "final_exported" ? "published" : project.status === "failed" ? "bad" : project.status === "ai_clip_ready" ? "ready" : "draft")}
              ${project.has_ai_clip ? chip("clip IA", "ready") : ""}
              ${project.final_exported_at ? chip("exportado", "published") : ""}
            </span>
          </button>
        `
        )
        .join("")}
    </div>
  `;
}

function renderVideoProject(project) {
  const isNewProject = project?.id && project.id !== state.video.lastProject?.id;
  state.video.lastProject = project;
  if (isNewProject) {
    state.video.runwayEstimate = null;
    state.video.runwayJob = null;
    if (els.videoRunwayConfirm) els.videoRunwayConfirm.checked = false;
  }
  state.video.selectedSceneIndex = Math.min(state.video.selectedSceneIndex || 0, Math.max((project.scenes || []).length - 1, 0));
  sessionStorage.setItem(VIDEO_PROJECT_KEY, JSON.stringify(storedVideoProject(project)));
  renderVideoPreview();
  renderVideoStoryboard();
  renderVideoPipeline();
  renderVideoReadiness();
  setVideoActions(Boolean(project));
}

function buildExpertSocialCopy(project) {
  if (!project) {
    return "Genera un storyboard para crear un texto de publicación conectado con el análisis del vídeo.";
  }
  const brief = project.growth_strategy || {};
  const hook = brief.hook || project.title || "Antes de contactar por una vivienda, mira los datos";
  const cta = brief.cta || project.cta_text || "Pásalo por InmoRadar antes de contactar.";
  const disclaimer = brief.disclaimer || project.disclaimer || "Estimaciones orientativas. No es una tasación.";
  const signal = (brief.overlays || project.overlays || [])
    .filter(Boolean)
    .slice(1, 5)
    .join(" · ");
  const hashtags = (brief.hashtags || project.hashtags || ["#InmoRadar", "#BuscarPiso", "#Vivienda"])
    .slice(0, 7)
    .join(" ");
  const context = signal
    ? `En este análisis miraría especialmente: ${signal}.`
    : "En valoración no me quedaría solo con la foto ni con el precio: miraría €/m², entrada, cuota, zona y señales del entorno.";
  return [
    hook,
    "",
    `${context} Como filtro previo, InmoRadar ayuda a poner criterio sobre el anuncio antes de llamar: precio, coste estimado, zona, transporte, aparcamiento y score en una sola lectura.`,
    "",
    `${cta} ${disclaimer}`,
    hashtags
  ].join("\n");
}

function renderVideoPreview() {
  const project = state.video.lastProject;
  if (!project || !els.videoPreview) return;
  const scenes = project.scenes || [];
  const scene = scenes[state.video.selectedSceneIndex] || scenes[0] || {};
  els.videoPreview.dataset.videoTopic = project.topic || "";
  if (els.videoPreviewTopic) els.videoPreviewTopic.textContent = project.topic_label || "Vídeo IA";
  if (els.videoPreviewHeadline) els.videoPreviewHeadline.textContent = scene.headline || project.title || "Vídeo InmoRadar";
  if (els.videoPreviewBody) els.videoPreviewBody.textContent = scene.body || project.caption || "";
  if (els.videoPreviewTitle) els.videoPreviewTitle.textContent = project.title || "Vídeo InmoRadar";
  if (els.videoPreviewMeta) {
    const clipLabel = state.video.backgroundClipName ? `clip real: ${state.video.backgroundClipName}` : "maqueta local sin clip real";
    els.videoPreviewMeta.textContent = `${project.duration_seconds || 24}s - ${project.format?.width || 1080}x${project.format?.height || 1920} - ${project.visual_style_label || "hogar"} - ${project.music_label || "música"} - ${clipLabel}`;
  }
  if (els.videoSocialCopy) els.videoSocialCopy.textContent = buildExpertSocialCopy(project);
  if (els.videoPreviewClip) {
    if (state.video.backgroundClipUrl) {
      if (els.videoPreviewClip.src !== state.video.backgroundClipUrl) {
        els.videoPreviewClip.src = state.video.backgroundClipUrl;
      }
      els.videoPreviewClip.hidden = false;
      els.videoPreviewClip.play().catch(() => {});
      els.videoPreview.classList.add("has-real-clip");
    } else {
      els.videoPreviewClip.hidden = true;
      els.videoPreviewClip.removeAttribute("src");
      els.videoPreview.classList.remove("has-real-clip");
    }
  }
}

function renderGrowthStrategyCard(project) {
  const brief = project?.growth_strategy;
  if (!brief) return "";
  const quality = brief.quality_check || {};
  const variants = brief.ab_variants || {};
  const qualityRows = Object.entries(quality)
    .map(([key, value]) => `<span>${escapeHtml(key.replace(/_/g, " "))}: <strong>${value ? "OK" : "Revisar"}</strong></span>`)
    .join("");
  const overlays = (brief.overlays || project.overlays || [])
    .map((overlay) => `<li>${escapeHtml(overlay)}</li>`)
    .join("");
  const hooks = (variants.hooks || [])
    .map((hook) => `<li>${escapeHtml(hook)}</li>`)
    .join("");
  const ctas = (variants.ctas || [])
    .map((cta) => `<li>${escapeHtml(cta)}</li>`)
    .join("");

  return `
    <section class="admin-video-branding-card admin-video-growth-card">
      <strong>Estrategia growth</strong>
      <p><b>Objetivo:</b> ${escapeHtml(brief.objective || "")}</p>
      <p><b>Hook:</b> ${escapeHtml(brief.hook || "")}</p>
      <p><b>CTA:</b> ${escapeHtml(brief.cta || "")}</p>
      <p><b>Disclaimer:</b> ${escapeHtml(brief.disclaimer || project.disclaimer || "")}</p>
      <p><b>Caption:</b> ${escapeHtml(brief.caption || project.caption || "")}</p>
      <p><b>Hashtags:</b> ${escapeHtml((brief.hashtags || project.hashtags || []).join(" "))}</p>
      <div class="admin-video-growth-lists">
        <div>
          <span>Overlays</span>
          <ol>${overlays}</ol>
        </div>
        <div>
          <span>Hooks A/B</span>
          <ol>${hooks}</ol>
        </div>
        <div>
          <span>CTAs A/B</span>
          <ol>${ctas}</ol>
        </div>
      </div>
      <div class="admin-video-quality">${qualityRows}</div>
    </section>
  `;
}

function renderVideoStoryboard() {
  const project = state.video.lastProject;
  if (!els.videoStoryboard) return;
  if (!project) {
    els.videoStoryboard.innerHTML = `<p class="admin-empty-state">Genera un vídeo para ver aquí el storyboard completo.</p>`;
    return;
  }
  els.videoStoryboard.innerHTML = `
    <section class="admin-video-output-head">
      <div>
        <span class="admin-kicker muted">Paquete IA</span>
        <h3>${escapeHtml(project.title)}</h3>
        <p>${escapeHtml(project.caption || "")}</p>
      </div>
      <div class="admin-video-output-meta">
        ${chip(project.status || "storyboard_ready", "ready")}
        ${chip(`${project.duration_seconds || 24}s`, "draft")}
      </div>
    </section>
    <section class="admin-video-branding-card">
      <strong>Reglas globales del vídeo</strong>
      <p>Fondo humano: ${escapeHtml(project.visual_style_label || "Hogar cotidiano")} - ${escapeHtml(project.visual_backdrop || "")}</p>
      <p>Música: ${escapeHtml(project.music_label || "House suave")} - ${escapeHtml(project.music_direction || "")}</p>
      <p>Branding: logo arriba derecha (${escapeHtml(project.branding?.logoSizePx || 72)} px) y texto exacto "${escapeHtml(project.branding?.websiteText || "Inmoradar.app")}" abajo derecha durante todo el vídeo.</p>
    </section>
    <section class="admin-video-branding-card">
      <strong>Personas reales</strong>
      <p>${state.video.backgroundClipName ? `Clip real activo: ${escapeHtml(state.video.backgroundClipName)}. Se usará como fondo del export local.` : "Sin clip real listo todavía. Genera el clip con Runway y úsalo como fondo antes de componer el vídeo final."}</p>
      <p>${escapeHtml(project.real_ai_video?.production_note || "El render final con personas reales requiere una IA de vídeo o un clip real como fuente visual.")}</p>
    </section>
    ${renderGrowthStrategyCard(project)}
    <div class="admin-video-scenes">
      ${(project.scenes || [])
        .map(
          (scene, index) => `
          <button class="admin-video-scene${index === state.video.selectedSceneIndex ? " active" : ""}" type="button" data-video-scene="${index}" data-testid="admin-video-scene-${index + 1}">
            <span>${String(index + 1).padStart(2, "0")} - ${escapeHtml(scene.role || "scene")}</span>
            <strong>${escapeHtml(scene.headline || "")}</strong>
            <p>${escapeHtml(scene.body || "")}</p>
            <small><b>Voz:</b> ${escapeHtml(scene.voiceover || "")}</small>
            <small><b>Visual IA:</b> ${escapeHtml(scene.visual_prompt || "")}</small>
            <small><b>Movimiento:</b> ${escapeHtml(scene.motion || "")}</small>
          </button>
        `
        )
        .join("")}
    </div>
    <section class="admin-video-prompt">
      <span class="admin-kicker muted">Prompt maestro IA</span>
      <pre>${escapeHtml(project.global_ai_prompt || "")}</pre>
    </section>
  `;
}

function downloadText(filename, mimeType, text) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildVideoPreviewHtml(project) {
  const firstScene = project.scenes?.[0] || {};
  const scenes = (project.scenes || [])
    .map(
      (scene, index) => `
      <article class="scene">
        <span>${String(index + 1).padStart(2, "0")} / ${escapeHtml(scene.role || "scene")}</span>
        <h2>${escapeHtml(scene.headline || "")}</h2>
        <p>${escapeHtml(scene.body || "")}</p>
      </article>
    `
    )
    .join("");
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(project.title || "Video InmoRadar")}</title>
  <style>
    *{box-sizing:border-box}body{margin:0;background:#09090B;color:#fff;font-family:Inter,system-ui,sans-serif}.canvas{position:relative;width:1080px;height:1920px;overflow:hidden;background:radial-gradient(circle at 25% 15%,rgba(255,69,0,.28),transparent 34%),linear-gradient(145deg,#09090B,#18181B 58%,#0A140F)}.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.055) 1px,transparent 1px);background-size:72px 72px}.people{position:absolute;inset:auto 0 0 0;height:56%;opacity:.9;background:radial-gradient(circle at 24% 34%,rgba(255,210,185,.38) 0 44px,transparent 45px),radial-gradient(circle at 49% 30%,rgba(255,210,185,.36) 0 40px,transparent 41px),radial-gradient(circle at 74% 36%,rgba(255,210,185,.34) 0 42px,transparent 43px),linear-gradient(90deg,transparent 12%,rgba(245,242,234,.22) 12% 28%,transparent 28% 35%,rgba(255,98,44,.22) 35% 55%,transparent 55% 62%,rgba(245,242,234,.18) 62% 82%,transparent 82%);filter:blur(.1px)}.people:before{content:"";position:absolute;left:140px;bottom:230px;width:150px;height:265px;border-radius:56px 56px 36px 36px;background:rgba(245,242,234,.56);box-shadow:270px -28px 0 rgba(255,98,44,.48),540px 16px 0 rgba(245,242,234,.46)}.people:after{content:"";position:absolute;left:356px;bottom:124px;width:370px;height:188px;border-radius:32px;background:rgba(9,9,11,.34);box-shadow:36px 40px 0 rgba(255,255,255,.13)}.content{position:absolute;left:76px;right:160px;top:260px;display:grid;gap:36px}.eyebrow{color:#FF4500;font:700 28px/1 monospace;letter-spacing:.22em;text-transform:uppercase}.content h1{margin:0;font-size:112px;line-height:.9;letter-spacing:-.07em}.content p{margin:0;color:rgba(255,255,255,.78);font-size:38px;line-height:1.35;max-width:760px}.scene-list{position:absolute;left:76px;right:76px;bottom:180px;display:grid;gap:18px}.scene{padding:24px 28px;border:1px solid rgba(255,255,255,.14);border-radius:28px;background:rgba(255,255,255,.08);backdrop-filter:blur(12px)}.scene span{color:#FF4500;font:700 18px/1 monospace;letter-spacing:.18em;text-transform:uppercase}.scene h2{margin:10px 0 6px;font-size:36px;line-height:1}.scene p{margin:0;color:rgba(255,255,255,.72);font-size:24px}.brand-logo{position:absolute;top:${project.branding?.logoMarginTopPx || 48}px;right:${project.branding?.logoMarginRightPx || 48}px;width:${project.branding?.logoSizePx || 72}px;height:${project.branding?.logoSizePx || 72}px;border-radius:22px}.brand-site{position:absolute;right:${project.branding?.websiteMarginRightPx || 48}px;bottom:${project.branding?.websiteMarginBottomPx || 48}px;font-size:${project.branding?.websiteFontSizePx || 32}px;font-weight:800;letter-spacing:-.02em}.safe{position:absolute;inset:96px;border:1px dashed rgba(255,255,255,.18);border-radius:42px;pointer-events:none}
  </style>
</head>
<body>
  <main class="canvas">
    <div class="grid"></div>
    <div class="safe"></div>
    <div class="people" aria-hidden="true"></div>
    <section class="content">
      <span class="eyebrow">${escapeHtml(project.topic_label || "InmoRadar")}</span>
      <h1>${escapeHtml(firstScene.headline || project.title || "Analiza antes de contactar.")}</h1>
      <p>${escapeHtml(project.caption || "")}</p>
    </section>
    <section class="scene-list">${scenes}</section>
    <img class="brand-logo" src="https://www.inmoradar.app/assets/inmoradar-brand-mark.svg" alt="InmoRadar">
    <span class="brand-site">Inmoradar.app</span>
  </main>
</body>
</html>`;
}

function supportedVideoMimeType() {
  if (!window.MediaRecorder) return "";
  return [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=avc1.64001F,mp4a.40.2",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4;codecs=h264"
  ].find((type) => window.MediaRecorder.isTypeSupported(type)) || "";
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function wrapCanvasText(ctx, text, maxWidth) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  });
  if (line) lines.push(line);
  return lines;
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const lines = wrapCanvasText(ctx, text, maxWidth).slice(0, maxLines);
  lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
  return y + lines.length * lineHeight;
}

function drawPerson(ctx, x, y, scale, tone, phase, accent = "#FF4500") {
  ctx.save();
  ctx.translate(x, y + Math.sin(phase) * 4);
  ctx.scale(scale, scale);
  ctx.globalAlpha = 0.9;

  ctx.fillStyle = "rgba(0,0,0,.24)";
  roundRect(ctx, -70, 90, 140, 22, 12);
  ctx.fill();

  ctx.fillStyle = "rgba(18,18,20,.68)";
  roundRect(ctx, -34, 74, 24, 108, 12);
  ctx.fill();
  roundRect(ctx, 12, 74, 24, 108, 12);
  ctx.fill();

  ctx.fillStyle = tone;
  roundRect(ctx, -52, -22, 104, 118, 34);
  ctx.fill();

  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.42;
  roundRect(ctx, -46, 2, 92, 16, 8);
  ctx.fill();
  ctx.globalAlpha = 0.9;

  ctx.fillStyle = "rgba(255,210,185,.82)";
  ctx.beginPath();
  ctx.arc(0, -64, 34, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(10,10,11,.72)";
  ctx.beginPath();
  ctx.arc(-4, -82, 28, Math.PI, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,210,185,.64)";
  ctx.lineWidth = 20;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-48, 10);
  ctx.lineTo(-92, 56 + Math.sin(phase) * 8);
  ctx.moveTo(48, 10);
  ctx.lineTo(92, 56 + Math.cos(phase) * 8);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,.26)";
  roundRect(ctx, -24, -8, 48, 10, 5);
  ctx.fill();
  ctx.restore();
}

function drawPeopleBackground(ctx, project, elapsedMs) {
  const width = project.format?.width || 1080;
  const height = project.format?.height || 1920;
  const phase = elapsedMs / 900;

  ctx.save();
  ctx.globalAlpha = 0.98;
  const windowGlow = ctx.createLinearGradient(0, 620, width, 1180);
  windowGlow.addColorStop(0, "rgba(255,255,255,.12)");
  windowGlow.addColorStop(0.45, "rgba(255,69,0,.12)");
  windowGlow.addColorStop(1, "rgba(255,255,255,.05)");
  ctx.fillStyle = windowGlow;
  roundRect(ctx, 72, 640, 936, 520, 44);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,.12)";
  roundRect(ctx, 108, 1080, 864, 300, 72);
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,.22)";
  roundRect(ctx, 78, 1288, 924, 154, 46);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.14)";
  roundRect(ctx, 220, 1440, 640, 92, 46);
  ctx.fill();

  const style = String(project.visual_style || "hogar_cotidiano");
  const palette =
    style === "amigos_piso"
      ? ["rgba(245,242,234,.82)", "rgba(255,98,44,.72)", "rgba(212,255,63,.52)"]
      : style === "familia_casa"
        ? ["rgba(245,242,234,.78)", "rgba(255,205,180,.74)", "rgba(255,255,255,.66)"]
        : ["rgba(245,242,234,.78)", "rgba(255,98,44,.68)", "rgba(255,255,255,.62)"];

  drawPerson(ctx, 250, 1168, 1.28, palette[0], phase, "#FF4500");
  drawPerson(ctx, 530, 1128, 1.18, palette[1], phase + 0.8, "#D4FF3F");
  drawPerson(ctx, 790, 1182, 1.08, palette[2], phase + 1.4, "#FF4500");

  ctx.fillStyle = "rgba(9,9,11,.34)";
  roundRect(ctx, 340, 1230, 380, 188, 30);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.16)";
  roundRect(ctx, 382, 1268, 296, 86, 20);
  ctx.fill();
  ctx.fillStyle = "#FF4500";
  roundRect(ctx, 404, 1370, 128, 10, 5);
  ctx.fill();
  ctx.restore();
}

function drawVideoBranding(ctx, project, logoImage) {
  const branding = project.branding || {};
  const width = project.format?.width || 1080;
  const height = project.format?.height || 1920;
  const logoSize = Number(branding.logoSizePx || 72);
  const logoX = width - Number(branding.logoMarginRightPx || 48) - logoSize;
  const logoY = Number(branding.logoMarginTopPx || 48);

  if (branding.showLogo !== false) {
    if (logoImage) {
      ctx.save();
      roundRect(ctx, logoX, logoY, logoSize, logoSize, 18);
      ctx.clip();
      ctx.drawImage(logoImage, logoX, logoY, logoSize, logoSize);
      ctx.restore();
    } else {
      ctx.fillStyle = "#09090B";
      roundRect(ctx, logoX, logoY, logoSize, logoSize, 18);
      ctx.fill();
      ctx.strokeStyle = "#FF4500";
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(logoX + logoSize / 2, logoY + logoSize / 2, logoSize * 0.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.arc(logoX + logoSize / 2, logoY + logoSize / 2, logoSize * 0.05, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(logoX + logoSize / 2, logoY + logoSize / 2);
      ctx.lineTo(logoX + logoSize * 0.62, logoY + logoSize * 0.37);
      ctx.stroke();
    }
  }

  if (branding.showWebsite !== false) {
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `900 ${Number(branding.websiteFontSizePx || 32)}px Arial`;
    ctx.textAlign = "right";
    ctx.shadowColor = "rgba(0,0,0,.55)";
    ctx.shadowBlur = 18;
    ctx.fillText(
      branding.websiteText || "Inmoradar.app",
      width - Number(branding.websiteMarginRightPx || 48),
      height - Number(branding.websiteMarginBottomPx || 48)
    );
    ctx.shadowBlur = 0;
    ctx.textAlign = "left";
  }
}

function drawCoverVideo(ctx, video, width, height) {
  const videoWidth = video.videoWidth || width;
  const videoHeight = video.videoHeight || height;
  const scale = Math.max(width / videoWidth, height / videoHeight);
  const drawWidth = videoWidth * scale;
  const drawHeight = videoHeight * scale;
  const x = (width - drawWidth) / 2;
  const y = (height - drawHeight) / 2;
  ctx.drawImage(video, x, y, drawWidth, drawHeight);
}

function drawVideoFrame(ctx, project, elapsedMs, logoImage, backgroundVideo) {
  const width = project.format?.width || 1080;
  const height = project.format?.height || 1920;
  const scenes = project.scenes || [];
  const scene =
    scenes.find((item) => elapsedMs >= Number(item.start_ms || 0) && elapsedMs < Number(item.end_ms || 0)) ||
    scenes[scenes.length - 1] ||
    {};
  const sceneIndex = Math.max(0, scenes.indexOf(scene));
  const progress = Math.max(0, Math.min(1, elapsedMs / Math.max(1, (project.duration_seconds || 24) * 1000)));

  if (backgroundVideo && backgroundVideo.readyState >= 2) {
    drawCoverVideo(ctx, backgroundVideo, width, height);
    const photoOverlay = ctx.createLinearGradient(0, 0, width, height);
    photoOverlay.addColorStop(0, "rgba(9,9,11,.82)");
    photoOverlay.addColorStop(0.46, "rgba(9,9,11,.36)");
    photoOverlay.addColorStop(1, "rgba(9,9,11,.22)");
    ctx.fillStyle = photoOverlay;
    ctx.fillRect(0, 0, width, height);
    const bottomOverlay = ctx.createLinearGradient(0, height * 0.58, 0, height);
    bottomOverlay.addColorStop(0, "rgba(9,9,11,0)");
    bottomOverlay.addColorStop(1, "rgba(9,9,11,.82)");
    ctx.fillStyle = bottomOverlay;
    ctx.fillRect(0, 0, width, height);
  } else {
    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, "#09090B");
    bg.addColorStop(0.55, "#18181B");
    bg.addColorStop(1, "#0A140F");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    const orangeGlow = ctx.createRadialGradient(270, 240, 0, 270, 240, 520);
    orangeGlow.addColorStop(0, "rgba(255,69,0,.38)");
    orangeGlow.addColorStop(1, "rgba(255,69,0,0)");
    ctx.fillStyle = orangeGlow;
    ctx.fillRect(0, 0, width, height);

    const limeGlow = ctx.createRadialGradient(900, 340, 0, 900, 340, 420);
    limeGlow.addColorStop(0, "rgba(212,255,63,.14)");
    limeGlow.addColorStop(1, "rgba(212,255,63,0)");
    ctx.fillStyle = limeGlow;
    ctx.fillRect(0, 0, width, height);

    drawPeopleBackground(ctx, project, elapsedMs);
  }

  ctx.strokeStyle = "rgba(255,255,255,.055)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += 72) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += 72) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  ctx.fillStyle = "#FF4500";
  ctx.font = "800 30px 'JetBrains Mono', monospace";
  ctx.letterSpacing = "4px";
  ctx.fillText(String(project.topic_label || "InmoRadar").toUpperCase(), 78, 278);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "900 112px Arial";
  let nextY = drawWrappedText(ctx, scene.headline || project.title, 76, 410, 760, 104, 5);

  ctx.fillStyle = "rgba(255,255,255,.78)";
  ctx.font = "500 42px Arial";
  nextY = drawWrappedText(ctx, scene.body || project.caption, 80, nextY + 34, 760, 58, 4);

  ctx.fillStyle = "rgba(255,255,255,.09)";
  roundRect(ctx, 76, 1328, 928, 250, 34);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.14)";
  ctx.stroke();
  ctx.fillStyle = "#FF4500";
  ctx.font = "800 22px 'JetBrains Mono', monospace";
  ctx.fillText(`${String(sceneIndex + 1).padStart(2, "0")} / ${String(scene.role || "scene").toUpperCase()}`, 116, 1390);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "900 44px Arial";
  drawWrappedText(ctx, scene.on_screen_text || scene.headline || "", 116, 1460, 820, 52, 2);

  ctx.fillStyle = "rgba(255,255,255,.18)";
  roundRect(ctx, 76, 1632, 928, 12, 8);
  ctx.fill();
  ctx.fillStyle = "#FF4500";
  roundRect(ctx, 76, 1632, 928 * progress, 12, 8);
  ctx.fill();

  drawVideoBranding(ctx, project, logoImage);
}

function musicNotesForStyle(style) {
  const maps = {
    warm_house: [196, 246.94, 293.66, 329.63, 293.66, 246.94, 220, 246.94],
    calm_pop: [174.61, 220, 261.63, 329.63, 261.63, 220],
    urban_soft: [146.83, 196, 233.08, 261.63, 233.08, 196],
    editorial_ambient: [130.81, 196, 261.63, 392]
  };
  return maps[style] || maps.warm_house;
}

async function createVideoMusicTrack(project, durationMs) {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return null;

  const audioContext = new AudioContextCtor();
  await audioContext.resume();
  const destination = audioContext.createMediaStreamDestination();
  const master = audioContext.createGain();
  const compressor = audioContext.createDynamicsCompressor();
  master.gain.setValueAtTime(0.18, audioContext.currentTime);
  master.connect(compressor);
  compressor.connect(destination);

  const start = audioContext.currentTime + 0.08;
  const durationSeconds = durationMs / 1000;
  const style = String(project.music_style || "warm_house");
  const notes = musicNotesForStyle(style);
  const step = style === "editorial_ambient" ? 1.6 : 0.48;

  const pad = audioContext.createOscillator();
  const padGain = audioContext.createGain();
  pad.type = "sine";
  pad.frequency.setValueAtTime(notes[0] / 2, start);
  padGain.gain.setValueAtTime(0, start);
  padGain.gain.linearRampToValueAtTime(0.08, start + 0.8);
  padGain.gain.linearRampToValueAtTime(0.055, start + Math.max(1, durationSeconds - 1));
  padGain.gain.linearRampToValueAtTime(0, start + durationSeconds);
  pad.connect(padGain);
  padGain.connect(master);
  pad.start(start);
  pad.stop(start + durationSeconds + 0.1);

  for (let t = 0; t < durationSeconds; t += step) {
    const index = Math.floor(t / step) % notes.length;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = style === "urban_soft" ? "triangle" : "sine";
    osc.frequency.setValueAtTime(notes[index], start + t);
    gain.gain.setValueAtTime(0, start + t);
    gain.gain.linearRampToValueAtTime(style === "editorial_ambient" ? 0.06 : 0.11, start + t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, start + t + Math.max(0.18, step * 0.86));
    osc.connect(gain);
    gain.connect(master);
    osc.start(start + t);
    osc.stop(start + t + step);

    if (style !== "editorial_ambient" && Math.floor(t / step) % 2 === 0) {
      const kick = audioContext.createOscillator();
      const kickGain = audioContext.createGain();
      kick.type = "sine";
      kick.frequency.setValueAtTime(86, start + t);
      kick.frequency.exponentialRampToValueAtTime(48, start + t + 0.12);
      kickGain.gain.setValueAtTime(0.13, start + t);
      kickGain.gain.exponentialRampToValueAtTime(0.001, start + t + 0.18);
      kick.connect(kickGain);
      kickGain.connect(master);
      kick.start(start + t);
      kick.stop(start + t + 0.2);
    }
  }

  return {
    stream: destination.stream,
    close: async () => {
      await audioContext.close().catch(() => {});
    }
  };
}

function createBackgroundVideo(url) {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const done = () => resolve(video);
    video.muted = true;
    video.loop = true;
    video.autoplay = true;
    video.playsInline = true;
    video.preload = "auto";
    video.crossOrigin = "anonymous";
    video.style.position = "fixed";
    video.style.left = "-9999px";
    video.style.top = "0";
    video.style.width = "1px";
    video.style.height = "1px";
    video.style.opacity = "0";
    video.setAttribute("aria-hidden", "true");
    video.onended = () => {
      video.currentTime = 0;
      video.play().catch(() => {});
    };
    video.oncanplay = done;
    video.onerror = () => {
      video.remove();
      reject(new Error("background_clip_load_failed"));
    };
    video.src = url;
    document.body.appendChild(video);
    video.load();
  });
}

function keepBackgroundVideoAlive(video) {
  if (!video) return;
  if (video.ended || (Number.isFinite(video.duration) && video.duration > 0 && video.currentTime >= video.duration - 0.08)) {
    video.currentTime = 0;
  }
  if (video.paused) {
    video.play().catch(() => {});
  }
}

async function exportVideoProject() {
  const project = state.video.lastProject;
  if (!project) return;
  if (!HTMLCanvasElement.prototype.captureStream || !window.MediaRecorder) {
    throw new Error("video_export_not_supported");
  }
  const mimeType = supportedVideoMimeType();
  if (!mimeType) throw new Error("video_mime_not_supported");

  const canvas = document.createElement("canvas");
  canvas.width = project.format?.width || 1080;
  canvas.height = project.format?.height || 1920;
  const ctx = canvas.getContext("2d");
  const stream = canvas.captureStream(project.format?.fps || 30);
  const chunks = [];
  const extension = mimeType.includes("webm") ? "webm" : "mp4";
  let logoImage = null;
  let musicTrack = null;
  let backgroundVideo = null;

  try {
    logoImage = await loadImage("assets/inmoradar-brand-mark.svg");
  } catch (error) {
    logoImage = null;
  }

  const durationMs = Math.max(1000, (project.duration_seconds || 24) * 1000);
  try {
    backgroundVideo = await createBackgroundVideo(state.video.backgroundClipUrl);
    if (backgroundVideo) {
      backgroundVideo.currentTime = 0;
      await backgroundVideo.play().catch(() => {});
    }
  } catch (error) {
    backgroundVideo = null;
    showStatus("No pude cargar el clip real; exporto maqueta local.", "neutral");
  }

  try {
    musicTrack = await createVideoMusicTrack(project, durationMs);
    musicTrack?.stream?.getAudioTracks().forEach((track) => stream.addTrack(track));
  } catch (error) {
    musicTrack = null;
  }

  const recorder = new MediaRecorder(stream, { mimeType });

  const finished = new Promise((resolve) => {
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size) chunks.push(event.data);
    };
    recorder.onstop = () => resolve();
  });

  setVideoBusy(true, "Componiendo vídeo final con fondo humano, música y marca fija.");
  showStatus(`Exportando vídeo ${extension.toUpperCase()} con música audible... mantén esta pestaña abierta.`);
  const start = performance.now();

  recorder.start(500);
  await new Promise((resolve) => {
    function frame(now) {
      const elapsed = Math.min(durationMs, now - start);
      keepBackgroundVideoAlive(backgroundVideo);
      drawVideoFrame(ctx, project, elapsed, logoImage, backgroundVideo);
      if (elapsed < durationMs) {
        requestAnimationFrame(frame);
      } else {
        recorder.stop();
        resolve();
      }
    }
    requestAnimationFrame(frame);
  });
  await finished;
  stream.getTracks().forEach((track) => track.stop());
  if (musicTrack) await musicTrack.close();
  if (backgroundVideo) {
    backgroundVideo.pause();
    backgroundVideo.removeAttribute("src");
    backgroundVideo.remove();
    backgroundVideo.load();
  }

  const blob = new Blob(chunks, { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${project.id || "inmoradar-video"}.${extension}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  if (project.id) {
    await updateSocialVideoProjectStatus(project.id, {
      status: "final_exported",
      has_uploaded_clip: Boolean(state.video.backgroundClipName),
      has_ai_clip: Boolean(state.video.runwayJob?.result_url || project.has_ai_clip),
      final_exported_at: new Date().toISOString()
    }).catch(() => null);
  }
  setVideoBusy(false);
  showStatus(
    `Vídeo final exportado en ${extension.toUpperCase()} ${state.video.backgroundClipName ? "con clip real de fondo" : "con fondo sintético local"} y música.`,
    "good"
  );
}

async function runVideoGeneration(form) {
  const payload = videoFormPayload(form);
  syncVideoBackgroundClip(form);
  payload.has_uploaded_clip = Boolean(state.video.backgroundClipName);
  setVideoBusy(true, "Generando guion, storyboard y preview con marca fija.");
  showStatus("Paso 1/4: generando storyboard de vídeo IA...");
  try {
    const project = await api("/api/admin?resource=social-video/generate", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    renderVideoProject(project);
    await loadSocialVideos().catch(() => null);
    showStatus(
      project.storage?.persisted === false
        ? `Paso 1 completado, pero la biblioteca no guarda: ${project.storage.error || "tabla pendiente"}.`
        : `Paso 1 completado: storyboard preparado. Ahora estima Runway para generar el clip.`,
      project.storage?.persisted === false ? "neutral" : "good"
    );
  } finally {
    setVideoBusy(false);
    renderVideoReadiness();
  }
}

async function copyVideoPrompt() {
  const project = state.video.lastProject;
  if (!project) return;
  const text = project.real_ai_video?.master_prompt || project.global_ai_prompt || "";
  try {
    await navigator.clipboard.writeText(text);
    showStatus("Prompt IA real copiado.", "good");
  } catch (error) {
    downloadText(`${project.id || "inmoradar-video"}-prompt.txt`, "text/plain;charset=utf-8", text);
    showStatus("No pude copiar al portapapeles; he descargado el prompt.", "neutral");
  }
}

function downloadVideoAiPack() {
  const project = state.video.lastProject;
  if (!project) return;
  downloadText(`${project.id || "inmoradar-video"}-pack-ia-real.txt`, "text/plain;charset=utf-8", realVideoPackText(project));
}

function downloadVideoJson() {
  const project = state.video.lastProject;
  if (!project) return;
  downloadText(`${project.id || "inmoradar-video"}-storyboard.json`, "application/json;charset=utf-8", JSON.stringify(project, null, 2));
}

function downloadVideoHtml() {
  const project = state.video.lastProject;
  if (!project) return;
  downloadText(`${project.id || "inmoradar-video"}-preview.html`, "text/html;charset=utf-8", buildVideoPreviewHtml(project));
}

async function loadSummary() {
  const summary = await api("/api/admin?resource=summary");
  renderStats(summary);
  renderRevenue(summary.revenue);
}

async function loadPremium() {
  const params = new URLSearchParams({
    limit: "100",
    status: state.premium.status || "all"
  });
  if (state.premium.q) params.set("q", state.premium.q);
  if (state.premium.provider) params.set("provider", state.premium.provider);
  if (state.premium.eventName) params.set("event_name", state.premium.eventName);
  const payload = await api(`/api/admin?resource=premium/subscriptions&${params.toString()}`);
  renderPremium(payload.subscriptions || []);
}

async function loadExtensionUsage() {
  if (!els.extensionStats) return;
  const payload = await api("/api/admin?resource=extension/usage");
  renderExtensionUsage(payload);
}

async function loadAnalytics() {
  if (!els.analyticsPanels?.length && !els.analyticsSummary) return;
  const range = readAnalyticsDateInputs();
  const summaryParams = analyticsRangeParams("analytics/summary", range);
  const pagesParams = analyticsRangeParams("analytics/pages", range, { page_limit: "50" });
  const learningParams = analyticsRangeParams("analytics/learning", range);
  const [summaryPayload, pagesPayload, learningPayload] = await Promise.all([
    api(`/api/admin?${summaryParams.toString()}`),
    api(`/api/admin?${pagesParams.toString()}`),
    api(`/api/admin?${learningParams.toString()}`)
  ]);
  renderAnalyticsPerformance({
    ...summaryPayload,
    pages: pagesPayload.pages || summaryPayload.top_pages || [],
    top_pages: summaryPayload.top_pages || pagesPayload.pages || [],
    recommendations: learningPayload.recommendations || summaryPayload.recommendations || [],
    high_interaction_low_install: learningPayload.high_interaction_low_install || summaryPayload.high_interaction_low_install || [],
    calculator_install_pages: learningPayload.calculator_install_pages || summaryPayload.calculator_install_pages || [],
    calculator_low_conversion: learningPayload.calculator_low_conversion || summaryPayload.calculator_low_conversion || [],
    pages_warning: pagesPayload.warning || "",
    learning_warning: learningPayload.warning || "",
    window_days: summaryPayload.window_days || pagesPayload.window_days || learningPayload.window_days || state.analytics.days,
    window_hours: summaryPayload.window_hours || pagesPayload.window_hours || learningPayload.window_hours || state.analytics.days * 24,
    window_from_date: summaryPayload.window_from_date || pagesPayload.window_from_date || learningPayload.window_from_date || range.from,
    window_to_date: summaryPayload.window_to_date || pagesPayload.window_to_date || learningPayload.window_to_date || range.to
  });
}

async function loadSeo() {
  const params = new URLSearchParams({
    limit: String(state.seo.pageSize || 10),
    page: String(state.seo.page || 1),
    status: state.seo.status || "all"
  });
  const payload = await api(`/api/admin?resource=seo/landings&${params.toString()}`);
  renderSeo(payload);
}

async function loadSeoAutogeneration() {
  if (!els.seoAutogenSummary) return;
  const payload = await api("/api/admin?resource=seo-autogenerate/run");
  renderSeoAutogeneration(payload);
}

async function loadSeoKeywordBacklog() {
  if (!els.seoKeywordRows) return;
  const payload = await api("/api/admin?resource=seo/keyword-backlog&limit=15&include_briefs=true");
  renderSeoKeywordBacklog(payload);
}

async function loadKpis() {
  const payload = await api("/api/admin?resource=kpis/settings");
  renderKpis(payload);
}

async function loadParking() {
  const payload = await api("/api/admin?resource=parking/summary");
  renderParkingStats(payload);
  renderParkingRows(payload.recent || []);
}

async function loadReleaseArtifacts(target) {
  const payload = await api(`/api/admin?resource=operations/releases&target=${encodeURIComponent(target)}`);
  renderReleaseRows(target, payload);
}

async function loadReleaseHubs() {
  if (!els.releaseRows.length) return;
  await Promise.all(RELEASE_TARGETS.map((target) => loadReleaseArtifacts(target)));
}

async function loadServiceStatus() {
  if (!els.serviceStatusLink && !els.serviceStatusSummary && !els.serviceStatusList) return;
  try {
    const response = await fetch("/api/status", { headers: { accept: "application/json" } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.status) throw new Error("status_unavailable");
    renderServiceStatus(payload);
  } catch (error) {
    renderServiceStatus({
      status: "degraded",
      updated_at: new Date().toISOString(),
      services: [
        {
          id: "status_endpoint",
          name: "Status endpoint",
          status: "degraded",
          message: "No se pudo leer /api/status.",
          latency_ms: null
        }
      ]
    });
  }
}

async function loadRunwayConfig() {
  if (!els.videoRunwayPanel) return;
  try {
    const payload = await api("/api/admin?resource=social-video/runway-config");
    state.video.runwayConfig = payload;
    if (payload.default_model && els.videoRunwayModel) els.videoRunwayModel.value = payload.default_model;
    syncRunwayDurationLabel();
    const readiness = runwayReadiness(payload);
    setRunwayStatus(
      `${readiness.status}. ${readiness.detail}`,
      readiness.tone === "good" ? "good" : readiness.tone === "bad" ? "bad" : "neutral"
    );
  } catch (error) {
    state.video.runwayConfig = {};
    setRunwayStatus("No pude leer la configuración de Runway. La estimación se activará al generar storyboard.", "neutral");
  }
  renderVideoReadiness();
  setRunwayActions();
}

async function loadSocialVideos() {
  if (!els.videoProjects) return;
  try {
    const payload = await api("/api/admin?resource=social-video/projects&limit=12");
    state.video.projects = payload.projects || [];
    state.video.storageError = payload.storage_error || "";
  } catch (error) {
    state.video.projects = [];
    state.video.storageError = error.message;
  }
  renderVideoProjects();
  renderVideoPipeline();
  renderVideoReadiness();
}

async function updateSocialVideoProjectStatus(id, patch = {}) {
  if (!id) return null;
  const payload = await api("/api/admin?resource=social-video/projects", {
    method: "POST",
    body: JSON.stringify({
      action: "update_status",
      id,
      ...patch
    })
  });
  if (payload.project && state.video.lastProject?.id === id) {
    state.video.lastProject = {
      ...state.video.lastProject,
      status: payload.project.status,
      has_ai_clip: payload.project.has_ai_clip,
      has_uploaded_clip: payload.project.has_uploaded_clip,
      final_exported_at: payload.project.final_exported_at,
      last_job_id: payload.project.last_job_id,
      failure: payload.project.failure
    };
    sessionStorage.setItem(VIDEO_PROJECT_KEY, JSON.stringify(storedVideoProject(state.video.lastProject)));
    renderVideoPipeline();
    renderVideoReadiness();
    renderVideoStoryboard();
  }
  await loadSocialVideos();
  return payload.project;
}

async function loadAll() {
  if (!state.token) return;
  showStatus("Cargando backoffice...");
  try {
    await loadAlerts();
    await Promise.all([
      loadSummary(),
      loadPremium(),
      loadExtensionUsage(),
      loadAnalytics(),
      loadSeo(),
      loadSeoAutogeneration(),
      loadSeoKeywordBacklog(),
      loadLinkedIn(),
      loadMeta(),
      loadKpis(),
      loadParking(),
      loadServiceStatus(),
      loadReleaseHubs(),
      loadViraliza(),
      loadRunwayConfig(),
      loadSocialVideos()
    ]);
    showStatus(`Actualizado ${formatDate(new Date().toISOString())}`, "good");
  } catch (error) {
    if (error.status === 401) {
      sessionStorage.removeItem(TOKEN_KEY);
      state.token = "";
      requireLogin();
      showStatus("Token incorrecto o caducado.", "bad");
      return;
    }
    showStatus(`Error: ${error.message}`, "bad");
  }
}

async function runParkingProbe(form) {
  const data = new FormData(form);
  const params = new URLSearchParams({
    street: String(data.get("street") || ""),
    street_number: String(data.get("street_number") || ""),
    zone: String(data.get("zone") || ""),
    district: String(data.get("district") || ""),
    municipality: String(data.get("municipality") || ""),
    garage_included: String(data.get("garage_included") || ""),
    profile: String(data.get("profile") || "general"),
    source_url: String(data.get("source_url") || "")
  });

  showStatus("Calculando Parking Intelligence...");
  const response = await fetch(`/api/parking-assessment?${params.toString()}`, {
    headers: { accept: "application/json" }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.message || payload.error || "parking_probe_failed");
  }
  state.parking.lastProbe = payload;
  if (els.parkingResult) {
    els.parkingResult.textContent = JSON.stringify(
      {
        score: payload.parking_assessment?.overall_score,
        label: payload.parking_assessment?.overall_label,
        confidence_score: payload.parking_assessment?.confidence_score,
        confidence_label: payload.parking_assessment?.confidence_label,
        garage: payload.garage,
        street_parking: payload.street_parking,
        resident_parking: payload.resident_parking,
        paid_parking: payload.paid_parking,
        transport_offset: payload.transport_offset,
        recommendations: payload.recommendations,
        sources: payload.sources,
        disclaimer: payload.disclaimer
      },
      null,
      2
    );
  }
  await loadParking();
  showStatus(`Parking ${payload.parking_assessment?.overall_score}/10 - ${payload.parking_assessment?.overall_label}`, "good");
}

function collectKpiValues() {
  const values = {};
  els.kpiForm.querySelectorAll("[data-kpi-path]").forEach((field) => {
    const path = field.dataset.kpiPath;
    const type = field.dataset.kpiType;
    let value = field.value;
    if (type === "boolean") value = value === "true";
    if (type === "number") value = Number(value);
    setPath(values, path, value);
  });
  return values;
}

async function saveKpis(settings) {
  showStatus("Guardando reglas KPI...");
  const payload = await api("/api/admin?resource=kpis/settings", {
    method: "POST",
    body: JSON.stringify({ settings })
  });
  renderKpis(payload);
  showStatus("KPIs guardados.", "good");
}

async function runSeoGeneration(mode) {
  const payload =
    mode === "publish"
      ? {
          mode: "publish",
          limit: 1,
          candidateLimit: 25,
          template_type: "random",
          autoPublish: true,
          includeExistingDrafts: true,
          publishFirstEligible: true
        }
      : {
          mode: "generate",
          limit: 1,
          template_type: "random",
          autoPublish: false
        };

  showStatus(mode === "publish" ? "Buscando SEO elegible para publicar..." : "Generando draft SEO...");
  const result = await api("/api/admin?resource=seo/generate-landings", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  await loadAll();
  if (!result.generated_count) {
    showStatus("No hay oportunidades SEO pendientes para generar.", "neutral");
    return;
  }
  const first = result.results?.[0];
  if (mode === "publish") {
    showStatus(
      result.published_count
        ? `Publicado y añadido a Noticias: ${first?.slug || "landing SEO"}`
        : `Generado, pero sin publicar: score ${first?.quality_score || 0}`,
      result.published_count ? "good" : "neutral"
    );
    return;
  }
  showStatus(`Draft SEO generado: ${first?.slug || "landing SEO"} · score ${first?.quality_score || 0}`, "good");
}

async function runSeoAutogeneration(dryRun = false) {
  showStatus(dryRun ? "Probando autogeneracion SEO..." : "Ejecutando autogeneracion SEO...");
  const result = await api("/api/admin?resource=seo-autogenerate/run", {
    method: "POST",
    body: JSON.stringify({ dry_run: dryRun })
  });
  await Promise.allSettled([loadSeo(), loadSeoAutogeneration()]);
  const first = result.results?.[0] || {};
  if (result.published_count) {
    showStatus(`Autogeneracion publicada: ${first.target_path || "pagina SEO"} - score ${first.final_score || 0}`, "good");
    return;
  }
  if (result.would_publish_count) {
    showStatus(`Dry run OK: publicaria ${first.target_path || "pagina SEO"} - score ${first.final_score || 0}`, "neutral");
    return;
  }
  showStatus(`Autogeneracion sin publicacion: ${first.reason || result.reason || "sin candidato elegible"}`, "neutral");
}

async function runSeoRowAction(action, slug) {
  showStatus(`${action} · ${slug}`);
  await api("/api/admin?resource=seo/landings", {
    method: "POST",
    body: JSON.stringify({ action, slug })
  });
  await loadAll();
  if (action === "publish") {
    showStatus(`Publicado y añadido a Noticias: ${slug}`, "good");
  }
}

async function runSeoGateRecalculation(slug) {
  showStatus(`Recalculando quality gate - ${slug}`);
  const result = await api("/api/admin?resource=seo/landings", {
    method: "POST",
    body: JSON.stringify({ action: "recalculate_quality_gate", slug })
  });
  await loadAll();
  const landing = result.landing || {};
  const failed = Array.isArray(landing.failed_checks) ? landing.failed_checks : [];
  const reason = failed[0] ? seoGateReasonLabel(failed[0]) : seoSitemapLabel(landing.sitemap_status);
  showStatus(
    `Quality gate recalculado: ${seoGateLabel(landing.quality_gate_status)} - score ${landing.quality_score || 0} - ${reason}`,
    landing.quality_gate_status === "failed" ? "neutral" : "good"
  );
}

els.tokenForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(els.tokenForm);
  state.token = String(form.get("token") || "").trim();
  if (!state.token) {
    showStatus("Pega el token admin.", "bad");
    return;
  }
  sessionStorage.setItem(TOKEN_KEY, state.token);
  requireLogin();
  await loadAll();
});

els.logout.addEventListener("click", () => {
  sessionStorage.removeItem(TOKEN_KEY);
  state.token = "";
  renderAdminAlerts([]);
  requireLogin();
  showStatus("");
});

els.refresh.addEventListener("click", loadAll);

els.sectionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setAdminSection(button.dataset.adminSectionButton, { resetSubsection: true });
  });
});

els.subsectionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setAdminSubsection(button.dataset.adminSubsectionGroup, button.dataset.adminSubsectionButton);
  });
});

els.premiumFilter.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(els.premiumFilter);
  state.premium.q = String(form.get("q") || "").trim();
  state.premium.status = String(form.get("status") || "all");
  state.premium.provider = String(form.get("provider") || "").trim();
  state.premium.eventName = String(form.get("event_name") || "").trim();
  await loadPremium();
});

els.analyticsRefreshButtons.forEach((button) => {
  button.addEventListener("click", () => {
    readAnalyticsDateInputs();
    loadAnalytics().catch((error) => showStatus(error.message, "bad"));
  });
});

syncAnalyticsDateInputs();
[...els.analyticsFromInputs, ...els.analyticsToInputs].forEach((input) => {
  input.addEventListener("change", () => {
    readAnalyticsDateInputs();
    loadAnalytics().catch((error) => showStatus(error.message, "bad"));
  });
});

els.seoFilter.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(els.seoFilter);
  state.seo.status = String(form.get("status") || "all");
  state.seo.page = 1;
  await loadSeo();
});

els.seoGenerate.addEventListener("click", () => runSeoGeneration("generate").catch((error) => showStatus(error.message, "bad")));
els.seoPublish.addEventListener("click", () => runSeoGeneration("publish").catch((error) => showStatus(error.message, "bad")));
if (els.seoAutogenRun) {
  els.seoAutogenRun.addEventListener("click", () => runSeoAutogeneration(false).catch((error) => showStatus(error.message, "bad")));
}
if (els.seoAutogenDryRun) {
  els.seoAutogenDryRun.addEventListener("click", () => runSeoAutogeneration(true).catch((error) => showStatus(error.message, "bad")));
}
if (els.linkedinRefresh) {
  els.linkedinRefresh.addEventListener("click", () => loadLinkedIn().catch((error) => showStatus(error.message, "bad")));
}
if (els.linkedinTest) {
  els.linkedinTest.addEventListener("click", () => testLinkedInConnection().catch((error) => showStatus(error.message, "bad")));
}
if (els.linkedinConnect) {
  els.linkedinConnect.addEventListener("click", () => connectLinkedIn().catch((error) => showStatus(error.message, "bad")));
}
if (els.linkedinDisconnect) {
  els.linkedinDisconnect.addEventListener("click", () => disconnectLinkedIn().catch((error) => showStatus(error.message, "bad")));
}
if (els.linkedinGenerateDaily) {
  els.linkedinGenerateDaily.addEventListener("click", () => runLinkedInAction("generate_daily", "").catch((error) => showStatus(error.message, "bad")));
}
if (els.linkedinPause) {
  els.linkedinPause.addEventListener("click", () => pauseLinkedInAutopublisher().catch((error) => showStatus(error.message, "bad")));
}
if (els.linkedinCreatePost) {
  els.linkedinCreatePost.addEventListener("click", () => {
    state.linkedin.currentPostId = "";
    fillLinkedInEditor({ status: "draft", hashtags: state.linkedin.settings?.default_hashtags || [] });
    showStatus("Borrador de LinkedIn preparado. Completa el editor y guarda.", "neutral");
  });
}
if (els.linkedinSettingsForm) {
  els.linkedinSettingsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveLinkedInSettings().catch((error) => showStatus(error.message, "bad"));
  });
}
if (els.linkedinEditorForm) {
  els.linkedinEditorForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveLinkedInPost().catch((error) => showStatus(error.message, "bad"));
  });
  els.linkedinEditorForm.addEventListener("click", (event) => {
    const button = event.target.closest("[data-linkedin-post-action]");
    if (!button) return;
    runLinkedInAction(button.dataset.linkedinPostAction).catch((error) => showStatus(error.message, "bad"));
  });
}
if (els.linkedinCopyText) {
  els.linkedinCopyText.addEventListener("click", () => copyLinkedInText().catch((error) => showStatus(error.message, "bad")));
}
if (els.linkedinDownloadImage) {
  els.linkedinDownloadImage.addEventListener("click", downloadLinkedInImage);
}
if (els.linkedinRows) {
  els.linkedinRows.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-linkedin-row-action]");
    if (actionButton) {
      const id = actionButton.dataset.linkedinId;
      if (actionButton.dataset.linkedinRowAction === "view") {
        const post = state.linkedin.posts.find((item) => item.id === id);
        if (post) fillLinkedInEditor(post);
        return;
      }
      runLinkedInAction(actionButton.dataset.linkedinRowAction, id).catch((error) => showStatus(error.message, "bad"));
      return;
    }
    const row = event.target.closest("[data-linkedin-post-id]");
    if (!row) return;
    const post = state.linkedin.posts.find((item) => item.id === row.dataset.linkedinPostId);
    if (post) fillLinkedInEditor(post);
  });
}
if (els.metaRefresh) {
  els.metaRefresh.addEventListener("click", () => loadMeta().catch((error) => showStatus(error.message, "bad")));
}
if (els.metaTest) {
  els.metaTest.addEventListener("click", () => testMetaConnection().catch((error) => showStatus(error.message, "bad")));
}
if (els.metaConnect) {
  els.metaConnect.addEventListener("click", () => connectMeta().catch((error) => showStatus(error.message, "bad")));
}
if (els.metaDisconnect) {
  els.metaDisconnect.addEventListener("click", () => disconnectMeta().catch((error) => showStatus(error.message, "bad")));
}
if (els.metaLoadPages) {
  els.metaLoadPages.addEventListener("click", () => loadMetaPages().catch((error) => showStatus(error.message, "bad")));
}
if (els.metaGenerateNext) {
  els.metaGenerateNext.addEventListener("click", () => generateNextMetaPost().catch((error) => showStatus(error.message, "bad")));
}
if (els.metaPause) {
  els.metaPause.addEventListener("click", () => pauseMetaAutopublisher().catch((error) => showStatus(error.message, "bad")));
}
if (els.metaSettingsForm) {
  els.metaSettingsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveMetaSettings().catch((error) => showStatus(error.message, "bad"));
  });
}
if (els.metaPageForm) {
  els.metaPageForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveMetaPageSelection().catch((error) => showStatus(error.message, "bad"));
  });
}
if (els.metaEditorForm) {
  els.metaEditorForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveMetaPost().catch((error) => showStatus(error.message, "bad"));
  });
  els.metaEditorForm.addEventListener("click", (event) => {
    const button = event.target.closest("[data-meta-post-action]");
    if (!button) return;
    runMetaAction(button.dataset.metaPostAction).catch((error) => showStatus(error.message, "bad"));
  });
}
if (els.metaCopyCaption) {
  els.metaCopyCaption.addEventListener("click", () => copyMetaCaption().catch((error) => showStatus(error.message, "bad")));
}
if (els.metaRows) {
  els.metaRows.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-meta-row-action]");
    if (actionButton) {
      const id = actionButton.dataset.metaId;
      if (actionButton.dataset.metaRowAction === "view") {
        const post = state.meta.posts.find((item) => item.id === id);
        if (post) fillMetaEditor(post);
        return;
      }
      runMetaAction(actionButton.dataset.metaRowAction, id).catch((error) => showStatus(error.message, "bad"));
      return;
    }
    const row = event.target.closest("[data-meta-post-id]");
    if (!row) return;
    const post = state.meta.posts.find((item) => item.id === row.dataset.metaPostId);
    if (post) fillMetaEditor(post);
  });
}
els.kpiForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveKpis(collectKpiValues()).catch((error) => showStatus(error.message, "bad"));
});

els.kpiReset.addEventListener("click", () => {
  if (!window.confirm("¿Restaurar los valores recomendados de KPIs?")) return;
  saveKpis(state.kpis.defaults).catch((error) => showStatus(error.message, "bad"));
});

if (els.parkingRefresh) {
  els.parkingRefresh.addEventListener("click", () => loadParking().catch((error) => showStatus(error.message, "bad")));
}

if (els.parkingProbeForm) {
  els.parkingProbeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    runParkingProbe(els.parkingProbeForm).catch((error) => showStatus(error.message, "bad"));
  });
}

if (els.serviceStatusRefresh) {
  els.serviceStatusRefresh.addEventListener("click", () => loadServiceStatus().catch((error) => showStatus(error.message, "bad")));
}

els.releaseForms.forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    saveReleaseArtifact(form).catch((error) => showStatus(error.message, "bad"));
  });
});

els.releaseRefreshButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const target = button.dataset.releaseRefresh;
    loadReleaseArtifacts(target).catch((error) => showStatus(error.message, "bad"));
  });
});

els.releaseRows.forEach((rowsEl) => {
  rowsEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-release-chrome-action]");
    if (!button) return;
    runChromeReleaseAction(button.dataset.releaseChromeAction, button.dataset.releaseId, button).catch((error) =>
      showStatus(error.message, "bad")
    );
  });
});

if (els.videoForm) {
  refreshVideoPropertyDataFromSelections(els.videoForm);
  syncRunwayDurationLabel();
  els.videoForm.addEventListener("submit", (event) => {
    event.preventDefault();
    runVideoGeneration(els.videoForm).catch((error) => showStatus(error.message, "bad"));
  });
  els.videoForm.querySelectorAll('[name="series_id"], [name="topic"], [name="platform"], [name="objective"], [name="city"]').forEach((control) => {
    const eventName = control.name === "city" ? "input" : "change";
    control.addEventListener(eventName, () => {
      refreshVideoPropertyDataFromSelections(els.videoForm);
    });
  });
  els.videoForm.querySelector('[name="duration_seconds"]')?.addEventListener("change", () => {
    state.video.runwayEstimate = null;
    syncRunwayDurationLabel();
    setRunwayStatus("Duración del storyboard cambiada. Runway generará un clip compatible y el compositor lo repetirá hasta la duración final; vuelve a estimar el coste.", "neutral");
    setRunwayActions();
  });
  els.videoForm.querySelector('[name="background_clip"]')?.addEventListener("change", () => {
    syncVideoBackgroundClip(els.videoForm);
    renderVideoPreview();
    renderVideoStoryboard();
    renderVideoPipeline();
    renderVideoReadiness();
    if (state.video.backgroundClipName) {
      if (state.video.lastProject?.id) {
        updateSocialVideoProjectStatus(state.video.lastProject.id, {
          status: "ai_clip_ready",
          has_uploaded_clip: true
        }).catch(() => null);
      }
      showStatus(`Clip real cargado: ${state.video.backgroundClipName}`, "good");
    }
  });
}

if (els.videoStoryboard) {
  els.videoStoryboard.addEventListener("click", (event) => {
    const button = event.target.closest("[data-video-scene]");
    if (!button) return;
    state.video.selectedSceneIndex = Number(button.dataset.videoScene || 0);
    renderVideoPreview();
    renderVideoStoryboard();
  });
}

if (els.videoProjects) {
  els.videoProjects.addEventListener("click", (event) => {
    const row = event.target.closest("[data-video-project-id]");
    if (!row) return;
    const item = (state.video.projects || []).find((project) => project.id === row.dataset.videoProjectId);
    if (!item) return;
    if (state.video.backgroundClipUrl) URL.revokeObjectURL(state.video.backgroundClipUrl);
    state.video.backgroundClipUrl = "";
    state.video.backgroundClipName = "";
    state.video.backgroundClipType = "";
    const project = {
      ...(item.project || {}),
      id: item.id,
      title: item.title,
      city: item.city,
      status: item.status,
      has_ai_clip: item.has_ai_clip,
      has_uploaded_clip: item.has_uploaded_clip,
      final_exported_at: item.final_exported_at,
      last_job_id: item.last_job_id,
      failure: item.failure,
      storage: { persisted: true, project: item }
    };
    renderVideoProject(project);
    showStatus(`Proyecto cargado: ${item.title}`, "good");
  });
}

if (els.videoExport) {
  els.videoExport.addEventListener("click", () =>
    exportVideoProject().catch((error) => {
      setVideoBusy(false);
      showStatus(error.message, "bad");
    })
  );
}

if (els.videoRunwayEstimate) {
  els.videoRunwayEstimate.addEventListener("click", () =>
    estimateRunwayRender().catch((error) => {
      setVideoBusy(false);
      setRunwayStatus(runwayErrorMessage(error), "bad");
    })
  );
}

if (els.videoRunwayRender) {
  els.videoRunwayRender.addEventListener("click", () => startRunwayRender().catch((error) => {
    setVideoBusy(false);
    setRunwayStatus(runwayErrorMessage(error), "bad");
  }));
}

if (els.videoRunwayPoll) {
  els.videoRunwayPoll.addEventListener("click", () =>
    pollRunwayRender().catch((error) => {
      setVideoBusy(false);
      setRunwayStatus(runwayErrorMessage(error), "bad");
    })
  );
}

if (els.videoRunwayImport) {
  els.videoRunwayImport.addEventListener("click", () => importRunwayClip().catch((error) => {
    setVideoBusy(false);
    setRunwayStatus(runwayErrorMessage(error), "bad");
  }));
}

if (els.videoRunwayModel) {
  els.videoRunwayModel.addEventListener("change", () => {
    state.video.runwayEstimate = null;
    setRunwayStatus("Modelo cambiado. Vuelve a estimar el coste.", "neutral");
    setRunwayActions();
  });
}

if (els.viralizaGenerate) {
  els.viralizaGenerate.addEventListener("click", () => generateViralizaRoutine().catch((error) => showStatus(error.message, "bad")));
}

if (els.viralizaMode) {
  els.viralizaMode.addEventListener("click", () => {
    state.viraliza.executionMode = !state.viraliza.executionMode;
    renderViraliza(state.viraliza.routine);
    els.viralizaMode.textContent = state.viraliza.executionMode ? "Cerrar modo ejecución" : "Modo ejecución";
  });
}

if (els.viralizaOpenSearch) {
  els.viralizaOpenSearch.addEventListener("click", () => {
    const firstUrl = state.viraliza.routine?.primaryKeywords?.[0]?.searchUrls?.tiktok;
    if (firstUrl) window.open(firstUrl, "_blank", "noopener,noreferrer");
  });
}


if (els.viralizaCreatorForm) {
  els.viralizaCreatorForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveViralizaCreator(els.viralizaCreatorForm).catch((error) => showStatus(error.message, "bad"));
  });
}

if (els.viralizaImport) {
  els.viralizaImport.addEventListener("click", () => importViralizaCreators().catch((error) => showStatus(error.message, "bad")));
}

if (els.viralizaDailyPlanRefresh) {
  els.viralizaDailyPlanRefresh.addEventListener("click", () => Promise.allSettled([loadViralizaDailyPlan(), loadViralizaLearning()]).catch((error) => showStatus(error.message, "bad")));
}

if (els.viralizaLearningRefresh) {
  els.viralizaLearningRefresh.addEventListener("click", () => loadViralizaLearning().catch((error) => showStatus(error.message, "bad")));
}

if (els.viralizaResultForm) {
  els.viralizaResultForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveViralizaResult(els.viralizaResultForm).catch((error) => showStatus(error.message, "bad"));
  });
}
if (els.viralizaContextForm) {
  els.viralizaContextForm.addEventListener("submit", (event) => {
    event.preventDefault();
    generateContextualViralizaComments(els.viralizaContextForm).catch((error) => showStatus(error.message, "bad"));
  });
}

if (els.app) {
  els.app.addEventListener("click", (event) => {
    const alertAction = event.target.closest("[data-admin-alert-action]");
    if (alertAction) {
      const alert = state.alerts.find((item) => item.id === alertAction.dataset.adminAlertAction);
      goToAdminAlertTarget(alert?.action_target);
      return;
    }
    const alertDismiss = event.target.closest("[data-admin-alert-dismiss]");
    if (alertDismiss) {
      dismissAdminAlert(alertDismiss.dataset.adminAlertDismiss);
      renderAdminAlerts(state.alerts);
      return;
    }
    const openButton = event.target.closest("[data-open-url]");
    if (openButton?.dataset.openUrl) {
      window.open(openButton.dataset.openUrl, "_blank", "noopener,noreferrer");
      return;
    }
    const copyButton = event.target.closest("[data-copy-text]");
    if (copyButton) {
      copyToClipboard(copyButton.dataset.copyText || "").catch((error) => showStatus(error.message, "bad"));
      return;
    }
    const planActionButton = event.target.closest("[data-viraliza-plan-action]");
    if (planActionButton) {
      recordViralizaPlanAction(planActionButton).catch((error) => showStatus(error.message, "bad"));
      return;
    }
    const resultFillButton = event.target.closest("[data-viraliza-result-fill]");
    if (resultFillButton) {
      prefillViralizaResult(resultFillButton.dataset.viralizaResultFill);
      return;
    }
    const recordButton = event.target.closest("[data-viraliza-record]");
    if (recordButton) {
      recordViralizaAction(recordButton).catch((error) => showStatus(error.message, "bad"));
      return;
    }
    const hookButton = event.target.closest("[data-viraliza-create-video-from-hook]");
    if (hookButton) {
      setAdminSubsection("marketing", "marketing-videos");
      showStatus("Usa este hook como base en el generador de vídeos.", "neutral");
    }
  });
}

els.seoRows.addEventListener("click", (event) => {
  const button = event.target.closest("[data-seo-action]");
  if (!button) return;
  const action = button.dataset.seoAction;
  const slug = button.dataset.slug;
  if (action === "recalculate_quality_gate") {
    runSeoGateRecalculation(slug).catch((error) => showStatus(error.message, "bad"));
    return;
  }
  runSeoRowAction(action, slug).catch((error) => showStatus(error.message, "bad"));
});

if (els.seoPagination) {
  els.seoPagination.addEventListener("click", (event) => {
    const button = event.target.closest("[data-seo-page]");
    if (!button || button.disabled) return;
    const direction = button.dataset.seoPage;
    if (direction === "previous") state.seo.page = Math.max(1, state.seo.page - 1);
    if (direction === "next") state.seo.page += 1;
    loadSeo().catch((error) => showStatus(error.message, "bad"));
  });
}

if (els.seoKeywordRefresh) {
  els.seoKeywordRefresh.addEventListener("click", () => loadSeoKeywordBacklog().catch((error) => showStatus(error.message, "bad")));
}

if (els.seoKeywordRows) {
  els.seoKeywordRows.addEventListener("click", (event) => {
    const button = event.target.closest("[data-seo-keyword-brief]");
    if (!button) return;
    const id = button.dataset.seoKeywordBrief;
    const cached = state.seoKeywordBacklog.briefsById.get(id);
    if (cached) {
      renderSeoKeywordBrief(cached);
      return;
    }
    api("/api/admin?resource=seo/keyword-backlog", {
      method: "POST",
      body: JSON.stringify({ action: "generate_brief", id })
    })
      .then((payload) => renderSeoKeywordBrief(payload.brief))
      .catch((error) => showStatus(error.message, "bad"));
  });
}

document.addEventListener("pointerover", (event) => {
  const target = tooltipTargetFromEvent(event);
  if (target) showAdminTooltip(target);
});

document.addEventListener("pointerout", (event) => {
  const target = tooltipTargetFromEvent(event);
  if (!target) return;
  if (event.relatedTarget instanceof Node && target.contains(event.relatedTarget)) return;
  hideAdminTooltip();
});

document.addEventListener("mouseover", (event) => {
  const target = tooltipTargetFromEvent(event);
  if (target) showAdminTooltip(target);
});

document.addEventListener("mouseout", (event) => {
  const target = tooltipTargetFromEvent(event);
  if (!target) return;
  if (event.relatedTarget instanceof Node && target.contains(event.relatedTarget)) return;
  hideAdminTooltip();
});

document.addEventListener("focusin", (event) => {
  const target = tooltipTargetFromEvent(event);
  if (target) showAdminTooltip(target);
});

document.addEventListener("focusout", (event) => {
  if (tooltipTargetFromEvent(event)) hideAdminTooltip();
});

window.addEventListener("scroll", hideAdminTooltip, true);
window.addEventListener("resize", hideAdminTooltip);

requireLogin();
setAdminSection(state.activeSection);
try {
  const storedProject = JSON.parse(sessionStorage.getItem(VIDEO_PROJECT_KEY) || "null");
  if (storedProject) renderVideoProject(storedProject);
} catch (error) {
  sessionStorage.removeItem(VIDEO_PROJECT_KEY);
}
renderVideoPipeline();
renderVideoProjects();
renderVideoReadiness();
handleLinkedInOAuthCallbackFromUrl().catch((error) => showStatus(error.message, "bad"));
handleMetaOAuthCallbackFromUrl().catch((error) => showStatus(error.message, "bad"));
loadAll();
