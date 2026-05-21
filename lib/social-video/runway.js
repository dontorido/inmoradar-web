const RUNWAY_API_BASE_URL = "https://api.dev.runwayml.com/v1";
const RUNWAY_API_VERSION = "2024-11-06";
const RUNWAY_CREDIT_USD = 0.01;
const RUNWAY_MAX_PROMPT_TEXT_CHARS = 650;
const RUNWAY_TEXT_ONLY_RATIO = "1280:720";
const RUNWAY_VERTICAL_IMAGE_RATIO = "720:1280";
const RUNWAY_FALLBACK_PROMPT =
  "A realistic cinematic shot inside a bright Spanish apartment. A person reviews a home listing on a laptop, natural hands and face, slow stable camera movement, warm daylight. No text, no logos, no readable screens, no brand names.";

const RUNWAY_VIDEO_PRICING = Object.freeze({
  "gen4.5": 12
});

const RUNWAY_TEXT_TO_VIDEO_MODELS = new Set([
  "gen4.5"
]);

function runwaySettings(env = process.env) {
  return {
    enabled: env.RUNWAY_RENDER_ENABLED === "true",
    apiSecretConfigured: Boolean(env.RUNWAYML_API_SECRET || env.RUNWAY_API_SECRET),
    apiSecret: env.RUNWAYML_API_SECRET || env.RUNWAY_API_SECRET || "",
    model: normalizeRunwayModel(env.RUNWAY_DEFAULT_MODEL || "gen4.5"),
    ratio: normalizeRunwayRatio(env.RUNWAY_DEFAULT_RATIO),
    durationSeconds: Number.parseInt(env.RUNWAY_DEFAULT_DURATION_SECONDS || "5", 10),
    maxCostUsd: Number(env.RUNWAY_MAX_COST_USD || "0.75"),
    dailyBudgetUsd: Number(env.RUNWAY_DAILY_BUDGET_USD || "3"),
    dryRunOnly: env.RUNWAY_DRY_RUN_ONLY === "true"
  };
}

class RunwayApiError extends Error {
  constructor(message, { status = null, payload = null } = {}) {
    super(message);
    this.name = "RunwayApiError";
    this.status = status;
    this.payload = payload;
  }
}

function normalizeRunwayRatio(value, options = {}) {
  if (options.textOnly) return RUNWAY_TEXT_ONLY_RATIO;
  const ratio = String(value || "").trim();
  if (ratio === "1280:720" || ratio === "16:9" || ratio === "1280:768") return "1280:720";
  return RUNWAY_VERTICAL_IMAGE_RATIO;
}

function normalizeRunwayModel(model) {
  const value = String(model || "").trim();
  return RUNWAY_TEXT_TO_VIDEO_MODELS.has(value) && RUNWAY_VIDEO_PRICING[value] ? value : "gen4.5";
}

function normalizeRunwayDuration(value) {
  const duration = Number.parseInt(String(value || 5), 10);
  if (!Number.isFinite(duration)) return 5;
  return Math.max(5, Math.min(10, duration));
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

function compactRunwayText(value, maxLength = 180) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function sanitizeRunwayPromptText(value, maxLength = RUNWAY_MAX_PROMPT_TEXT_CHARS) {
  const text = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/€/g, "EUR")
    .replace(/²/g, "2")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const safeText = text || RUNWAY_FALLBACK_PROMPT;
  if (safeText.length <= maxLength) return safeText;
  return safeText.slice(0, Math.max(0, maxLength - 3)).trim() + "...";
}

function buildRunwayPrompt(project = {}, sceneIndex = 0) {
  const scenes = Array.isArray(project.scenes) ? project.scenes : [];
  const scene = scenes[Number(sceneIndex) || 0] || scenes[0] || {};
  const branding = project.branding || {};
  const sceneHint = compactRunwayText(scene.visual_prompt || scene.body || project.visual_backdrop || "", 180);
  const headline = compactRunwayText(scene.headline || project.title || project.topic_label || "Home listing analysis", 90);
  const website = compactRunwayText(branding.websiteText || "Inmoradar.app", 40);
  return sanitizeRunwayPromptText(
    [
      "Realistic cinematic background video for a Spanish real estate analysis tool.",
      `Main idea: ${headline}.`,
      sceneHint ? `Visual context: ${sceneHint}.` : "Visual context: people naturally reviewing a home listing in a bright apartment.",
      "Slow stable camera movement, warm daylight, natural hands, faces and gestures, premium but everyday look.",
      `No readable text, no logos, no portal brands, no fake data. Leave clean space top right for InmoRadar and bottom right for ${website}.`
    ].join(" ")
  );
}

function buildRunwayTextToVideoRequest({ project, model, durationSeconds, ratio, sceneIndex, promptImage }) {
  const estimate = estimateRunwayCost({ model, durationSeconds });
  const endpoint = estimate.model === "gen4.5" ? "image_to_video" : "text_to_video";
  const hasPromptImage = typeof promptImage === "string" && promptImage.trim();
  const request = {
    endpoint,
    model: estimate.model,
    promptText: buildRunwayPrompt(project, sceneIndex),
    ratio: normalizeRunwayRatio(ratio, { textOnly: endpoint === "image_to_video" && !hasPromptImage }),
    duration: estimate.duration_seconds
  };
  if (hasPromptImage) request.promptImage = promptImage.trim();
  return request;
}

function buildRunwayFallbackRequest(request = {}) {
  return {
    model: "gen4.5",
    promptText: RUNWAY_FALLBACK_PROMPT,
    ratio: RUNWAY_TEXT_ONLY_RATIO,
    duration: normalizeRunwayDuration(request.duration || 5)
  };
}

function isRunwayBodyValidationError(status, payload) {
  const haystack = [
    payload?.message,
    payload?.error,
    payload?.detail,
    ...(Array.isArray(payload?.errors) ? payload.errors.map((item) => item?.message || item?.detail || item?.code) : [])
  ]
    .filter(Boolean)
    .join(" ");
  return Number(status) === 400 && /validation|body/i.test(haystack);
}

function runwayRequestSummary(request = {}) {
  return {
    endpoint: request.endpoint || null,
    model: request.model || null,
    ratio: request.ratio || null,
    duration: request.duration || null,
    prompt_text_chars: String(request.promptText || "").length,
    prompt_image: Boolean(request.promptImage)
  };
}

async function parseRunwayResponse(response) {
  const text = await response.text().catch(() => "");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 800) };
  }
}

function runwayErrorMessage(payload, status) {
  const direct = payload?.message || payload?.error || payload?.detail;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  if (Array.isArray(payload?.errors) && payload.errors.length) {
    return payload.errors
      .map((item) => item?.message || item?.detail || item?.code || String(item))
      .filter(Boolean)
      .join(" · ");
  }
  return `runway_create_failed_${status || "unknown"}`;
}

async function createRunwayTextToVideo({ apiSecret, fetchImpl = fetch, request, timeoutMs = 20000 }) {
  if (!apiSecret) throw new Error("runway_api_secret_missing");
  const endpoint = request.endpoint || (request.model === "gen4.5" ? "image_to_video" : "text_to_video");
  const { endpoint: _endpoint, ...runwayRequest } = request;
  const response = await postRunwayRequest({ apiSecret, endpoint, fetchImpl, request: runwayRequest, timeoutMs });
  const payload = await parseRunwayResponse(response);
  if (!response.ok && endpoint === "image_to_video" && !request.promptImage && isRunwayBodyValidationError(response.status, payload)) {
    const fallbackRequest = buildRunwayFallbackRequest(request);
    const fallbackResponse = await postRunwayRequest({ apiSecret, endpoint, fetchImpl, request: fallbackRequest, timeoutMs });
    const fallbackPayload = await parseRunwayResponse(fallbackResponse);
    if (fallbackResponse.ok) return fallbackPayload;
    throw new RunwayApiError(runwayErrorMessage(fallbackPayload, fallbackResponse.status), {
      status: fallbackResponse.status,
      payload: {
        ...fallbackPayload,
        original_error: payload,
        fallback_request_summary: runwayRequestSummary({ endpoint, ...fallbackRequest })
      }
    });
  }
  if (!response.ok) {
    throw new RunwayApiError(runwayErrorMessage(payload, response.status), {
      status: response.status,
      payload
    });
  }
  return payload;
}

async function postRunwayRequest({ apiSecret, endpoint, fetchImpl, request, timeoutMs }) {
  return fetchImpl(`${RUNWAY_API_BASE_URL}/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiSecret}`,
      "Content-Type": "application/json",
      "X-Runway-Version": RUNWAY_API_VERSION
    },
    body: JSON.stringify(request),
    timeoutMs
  });
}

async function getRunwayTask({ apiSecret, taskId, fetchImpl = fetch, timeoutMs = 15000 }) {
  if (!apiSecret) throw new Error("runway_api_secret_missing");
  if (!taskId) throw new Error("runway_task_id_missing");
  const response = await fetchImpl(`${RUNWAY_API_BASE_URL}/tasks/${encodeURIComponent(taskId)}`, {
    headers: {
      Authorization: `Bearer ${apiSecret}`,
      "X-Runway-Version": RUNWAY_API_VERSION
    },
    timeoutMs
  });
  const payload = await parseRunwayResponse(response);
  if (!response.ok) {
    throw new RunwayApiError(runwayErrorMessage(payload, response.status), {
      status: response.status,
      payload
    });
  }
  return payload;
}

module.exports = {
  RUNWAY_API_BASE_URL,
  RUNWAY_API_VERSION,
  RUNWAY_CREDIT_USD,
  RUNWAY_FALLBACK_PROMPT,
  RUNWAY_TEXT_ONLY_RATIO,
  RUNWAY_TEXT_TO_VIDEO_MODELS,
  RUNWAY_VERTICAL_IMAGE_RATIO,
  RUNWAY_VIDEO_PRICING,
  RunwayApiError,
  buildRunwayFallbackRequest,
  buildRunwayPrompt,
  buildRunwayTextToVideoRequest,
  createRunwayTextToVideo,
  estimateRunwayCost,
  getRunwayTask,
  normalizeRunwayDuration,
  normalizeRunwayModel,
  normalizeRunwayRatio,
  runwayRequestSummary,
  sanitizeRunwayPromptText,
  runwaySettings
};
