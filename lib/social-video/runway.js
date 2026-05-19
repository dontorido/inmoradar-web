const RUNWAY_API_BASE_URL = "https://api.dev.runwayml.com/v1";
const RUNWAY_API_VERSION = "2024-11-06";
const RUNWAY_CREDIT_USD = 0.01;

const RUNWAY_VIDEO_PRICING = Object.freeze({
  "gen4.5": 12,
  gen4_turbo: 5,
  gen4_aleph: 15,
  gen3a_turbo: 5,
  act_two: 5,
  veo3: 40,
  "veo3.1_audio": 40,
  "veo3.1_no_audio": 20,
  "veo3.1_fast_audio": 15,
  "veo3.1_fast_no_audio": 10
});

const RUNWAY_TEXT_TO_VIDEO_MODELS = new Set([
  "gen4.5",
  "veo3",
  "veo3.1_audio",
  "veo3.1_no_audio",
  "veo3.1_fast_audio",
  "veo3.1_fast_no_audio"
]);

function runwaySettings(env = process.env) {
  return {
    enabled: env.RUNWAY_RENDER_ENABLED === "true",
    apiSecretConfigured: Boolean(env.RUNWAYML_API_SECRET || env.RUNWAY_API_SECRET),
    apiSecret: env.RUNWAYML_API_SECRET || env.RUNWAY_API_SECRET || "",
    model: env.RUNWAY_DEFAULT_MODEL || "gen4.5",
    ratio: env.RUNWAY_DEFAULT_RATIO || "720:1280",
    durationSeconds: Number.parseInt(env.RUNWAY_DEFAULT_DURATION_SECONDS || "5", 10),
    maxCostUsd: Number(env.RUNWAY_MAX_COST_USD || "0.75"),
    dailyBudgetUsd: Number(env.RUNWAY_DAILY_BUDGET_USD || "3"),
    dryRunOnly: env.RUNWAY_DRY_RUN_ONLY === "true"
  };
}

function normalizeRunwayModel(model) {
  const value = String(model || "").trim();
  return RUNWAY_TEXT_TO_VIDEO_MODELS.has(value) && RUNWAY_VIDEO_PRICING[value] ? value : "gen4.5";
}

function normalizeRunwayDuration(value) {
  const duration = Number.parseInt(String(value || 5), 10);
  if (!Number.isFinite(duration)) return 5;
  return Math.max(5, Math.min(15, duration));
}

function estimateRunwayCost({ model, durationSeconds }) {
  const normalizedModel = normalizeRunwayModel(model);
  const duration = normalizeRunwayDuration(durationSeconds);
  const creditsPerSecond = RUNWAY_VIDEO_PRICING[normalizedModel];
  const credits = creditsPerSecond * duration;
  return {
    model: normalizedModel,
    duration_seconds: duration,
    credits_per_second: creditsPerSecond,
    estimated_credits: credits,
    estimated_cost_usd: Number((credits * RUNWAY_CREDIT_USD).toFixed(2))
  };
}

function buildRunwayPrompt(project = {}, sceneIndex = 0) {
  const scenes = Array.isArray(project.scenes) ? project.scenes : [];
  const scene = scenes[Number(sceneIndex) || 0] || scenes[0] || {};
  const branding = project.branding || {};
  const scenePrompts = scenes
    .map((item, index) => `${index + 1}. ${item.headline || ""}: ${item.visual_prompt || item.body || ""}`)
    .join("\n");

  return [
    `Video vertical 9:16 para InmoRadar. Crear un clip base realista y cinematografico de fondo humano inmobiliario.`,
    `Tema: ${project.topic_label || project.topic || "InmoRadar"}. Tono: ${project.tone_label || "Directo"}. Audiencia: ${project.audience_label || "general"}.`,
    `Escena principal a representar: ${scene.headline || project.title || "Analiza antes de contactar."}`,
    `Contexto visual: ${scene.visual_prompt || project.visual_backdrop || "personas reales en una casa luminosa revisando un anuncio inmobiliario."}`,
    `Movimiento sugerido: ${scene.motion || "camara lenta, movimiento natural y estable."}`,
    `Debe parecer video grabado con personas reales en interiores domesticos espanoles: piel, ropa, manos, caras y gestos naturales.`,
    `No incluir texto legible, logos externos, marcas de portales, pantallas con datos falsos ni claims absolutos.`,
    `Dejar espacio libre arriba derecha para logo InmoRadar y abajo derecha para "${branding.websiteText || "Inmoradar.app"}"; esos overlays los pondra InmoRadar despues.`,
    `Estetica: inmobiliaria premium, cotidiana, luz natural, profundidad de campo suave, sin aspecto de anuncio stock.`,
    scenePrompts ? `Storyboard completo de referencia:\n${scenePrompts}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function buildRunwayTextToVideoRequest({ project, model, durationSeconds, ratio, sceneIndex }) {
  const estimate = estimateRunwayCost({ model, durationSeconds });
  return {
    model: estimate.model,
    promptText: buildRunwayPrompt(project, sceneIndex),
    ratio: ratio || "720:1280",
    duration: estimate.duration_seconds
  };
}

async function createRunwayTextToVideo({ apiSecret, fetchImpl = fetch, request, timeoutMs = 20000 }) {
  if (!apiSecret) throw new Error("runway_api_secret_missing");
  const response = await fetchImpl(`${RUNWAY_API_BASE_URL}/text_to_video`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiSecret}`,
      "content-type": "application/json",
      "x-runway-version": RUNWAY_API_VERSION
    },
    body: JSON.stringify(request),
    timeoutMs
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || payload.error || `runway_create_failed_${response.status}`);
  }
  return payload;
}

async function getRunwayTask({ apiSecret, taskId, fetchImpl = fetch, timeoutMs = 15000 }) {
  if (!apiSecret) throw new Error("runway_api_secret_missing");
  if (!taskId) throw new Error("runway_task_id_missing");
  const response = await fetchImpl(`${RUNWAY_API_BASE_URL}/tasks/${encodeURIComponent(taskId)}`, {
    headers: {
      authorization: `Bearer ${apiSecret}`,
      "x-runway-version": RUNWAY_API_VERSION
    },
    timeoutMs
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || payload.error || `runway_task_failed_${response.status}`);
  }
  return payload;
}

module.exports = {
  RUNWAY_API_BASE_URL,
  RUNWAY_API_VERSION,
  RUNWAY_CREDIT_USD,
  RUNWAY_TEXT_TO_VIDEO_MODELS,
  RUNWAY_VIDEO_PRICING,
  buildRunwayPrompt,
  buildRunwayTextToVideoRequest,
  createRunwayTextToVideo,
  estimateRunwayCost,
  getRunwayTask,
  normalizeRunwayDuration,
  normalizeRunwayModel,
  runwaySettings
};
