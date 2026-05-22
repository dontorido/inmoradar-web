const crypto = require("node:crypto");

const LINKEDIN_AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
const LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const LINKEDIN_REST_URL = "https://api.linkedin.com/rest";
const DEFAULT_API_VERSION = "202605";
const DEFAULT_DESTINATION_URL = "https://inmoradar.app";
const DEFAULT_HASHTAGS = ["InmoRadar", "PropTech", "Inmobiliario", "RealEstate", "Vivienda", "InversionInmobiliaria"];
const COMPANY_PAGE_ROLES = ["ADMINISTRATOR", "CONTENT_ADMIN", "DIRECT_SPONSORED_CONTENT_POSTER"];
const POST_STATUSES = ["draft", "pending_review", "scheduled", "publishing", "published", "manually_published", "failed", "cancelled"];
const CONTENT_MODES = ["rent_question", "hidden_signals", "inmoradar_signal", "comparison", "mixed"];

const MANUAL_MODE_NOTICE =
  "La publicacion automatica en paginas de empresa requiere aprobacion de LinkedIn Community Management API. Mientras tanto, puedes generar el post, copiar el texto, descargar la imagen y publicarlo manualmente.";

const TEMPLATES = [
  {
    id: "rent_question",
    label: "¿Lo alquilarías?",
    title: "¿Lo alquilarías?",
    hook: "¿Lo alquilarías por {price}?",
    body:
      "Este inmueble puede parecer una oportunidad, pero el precio no cuenta toda la historia.\n\nAntes de contactar conviene mirar:\n• Precio por m² frente a la zona\n• Entrada estimada\n• Transporte cercano\n• Aparcamiento\n• Gastos recurrentes\n• Señales de demanda o sobreprecio\n\nInmoRadar te ayuda a ver lo que el anuncio no te cuenta.",
    cta: "Analiza antes de contactar: {url}",
    accent: "#FF4A13"
  },
  {
    id: "hidden_signals",
    label: "Lo que el anuncio no te cuenta",
    title: "Lo que el anuncio no te cuenta",
    hook: "Lo importante de un anuncio muchas veces está fuera del anuncio.",
    body:
      "Una vivienda no se entiende solo por sus fotos.\n\nTambién importan:\n• €/m² real\n• Coste inicial\n• Zona\n• Transporte\n• Aparcamiento\n• Gastos recurrentes\n• Señales urbanas\n\nEso es lo que InmoRadar añade sobre los portales inmobiliarios.",
    cta: "Descubre lo que el anuncio no te cuenta: {url}",
    accent: "#D4FF3F"
  },
  {
    id: "inmoradar_signal",
    label: "Señal InmoRadar",
    title: "Señal InmoRadar",
    hook: "Una buena oportunidad no siempre es el precio más bajo.",
    body:
      "Para valorar un inmueble necesitas contexto.\n\nInmoRadar cruza señales como precio, zona, transporte, aparcamiento y coste inicial para ayudarte a priorizar qué anuncios merecen una visita.",
    cta: "Busca donde ya buscas. Decide con más criterio: {url}",
    accent: "#0A0A0A"
  },
  {
    id: "comparison",
    label: "Comparativa",
    title: "Sin contexto vs con InmoRadar",
    hook: "El mismo anuncio cambia cuando lo miras con datos.",
    body:
      "Sin contexto, un anuncio compite por fotos y precio total.\n\nCon InmoRadar puedes revisar precio por m², coste inicial, zona, transporte, aparcamiento y señales clave antes de escribir.\n\nNo decide por ti. Te da criterio para priorizar mejor.",
    cta: "Compara antes de contactar: {url}",
    accent: "#F4A523"
  }
];

function cleanText(value, max = 4000) {
  return String(value || "").replace(/\u0000/g, "").trim().slice(0, max);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function configured(value) {
  return Boolean(String(value || "").trim());
}

function linkedinConfig(env = process.env) {
  return {
    clientId: cleanText(env.LINKEDIN_CLIENT_ID, 300),
    clientSecret: cleanText(env.LINKEDIN_CLIENT_SECRET, 1000),
    redirectUri: cleanText(env.LINKEDIN_REDIRECT_URI, 1000),
    apiVersion: cleanText(env.LINKEDIN_API_VERSION, 20) || DEFAULT_API_VERSION,
    organizationUrn: normalizeOrganizationUrn(env.LINKEDIN_ORGANIZATION_URN),
    autoPublishEnabled: String(env.LINKEDIN_AUTO_PUBLISH_ENABLED || "false").toLowerCase() === "true",
    dailyPostTime: cleanText(env.LINKEDIN_DAILY_POST_TIME, 20) || "09:30",
    timezone: cleanText(env.LINKEDIN_TIMEZONE, 80) || "Europe/Madrid",
    restUrl: LINKEDIN_REST_URL,
    manualModeNotice: MANUAL_MODE_NOTICE
  };
}

function linkedinEnvStatus(env = process.env) {
  const config = linkedinConfig(env);
  return {
    client_id_configured: configured(config.clientId),
    client_secret_configured: configured(config.clientSecret),
    redirect_uri_configured: configured(config.redirectUri),
    organization_urn_configured: configured(config.organizationUrn),
    api_version: config.apiVersion,
    auto_publish_env_enabled: config.autoPublishEnabled,
    daily_post_time: config.dailyPostTime,
    timezone: config.timezone,
    automatic_available_by_env:
      configured(config.clientId) && configured(config.clientSecret) && configured(config.redirectUri) && configured(config.organizationUrn)
  };
}

function normalizeOrganizationUrn(value) {
  const raw = cleanText(value, 200);
  if (!raw) return "";
  if (/^urn:li:organization:\d+$/i.test(raw)) return raw;
  if (/^\d+$/.test(raw)) return `urn:li:organization:${raw}`;
  return raw;
}

function defaultSettings(env = process.env) {
  const config = linkedinConfig(env);
  return {
    daily_generation_enabled: true,
    auto_publish_enabled: false,
    approval_required: true,
    daily_post_time: config.dailyPostTime || "09:30",
    timezone: config.timezone || "Europe/Madrid",
    content_mode: "mixed",
    default_cta: `Analiza antes de contactar: ${DEFAULT_DESTINATION_URL}`,
    default_hashtags: DEFAULT_HASHTAGS,
    destination_url: DEFAULT_DESTINATION_URL
  };
}

function normalizeHashtags(value) {
  if (Array.isArray(value)) return value.map((item) => cleanText(item, 80).replace(/^#/, "")).filter(Boolean).slice(0, 12);
  return String(value || "")
    .split(/[\s,]+/)
    .map((item) => cleanText(item, 80).replace(/^#/, ""))
    .filter(Boolean)
    .slice(0, 12);
}

function normalizeSettings(input = {}, env = process.env) {
  const fallback = defaultSettings(env);
  const mode = cleanText(input.content_mode || fallback.content_mode, 40);
  return {
    daily_generation_enabled: input.daily_generation_enabled === false ? false : true,
    auto_publish_enabled: input.auto_publish_enabled === true,
    approval_required: input.approval_required === false ? false : true,
    daily_post_time: /^\d{2}:\d{2}$/.test(String(input.daily_post_time || "")) ? input.daily_post_time : fallback.daily_post_time,
    timezone: cleanText(input.timezone || fallback.timezone, 80),
    content_mode: CONTENT_MODES.includes(mode) ? mode : "mixed",
    default_cta: cleanText(input.default_cta || fallback.default_cta, 500),
    default_hashtags: normalizeHashtags(input.default_hashtags || fallback.default_hashtags),
    destination_url: cleanText(input.destination_url || fallback.destination_url, 500)
  };
}

function templateForMode(mode, date = new Date()) {
  const normalized = CONTENT_MODES.includes(mode) ? mode : "mixed";
  if (normalized !== "mixed") return TEMPLATES.find((item) => item.id === normalized) || TEMPLATES[0];
  const dayKey = Math.floor(new Date(date).getTime() / 86400000);
  return TEMPLATES[Math.abs(dayKey) % TEMPLATES.length];
}

function renderTemplateText(text, variables = {}) {
  const price = cleanText(variables.price || "1.200 €/mes", 80);
  const url = cleanText(variables.url || DEFAULT_DESTINATION_URL, 500);
  return String(text || "").replace(/\{price\}/g, price).replace(/\{url\}/g, url);
}

function formatHashtags(hashtags = []) {
  return normalizeHashtags(hashtags)
    .map((tag) => `#${tag}`)
    .join(" ");
}

function buildLinkedInPostText(post = {}) {
  const parts = [post.hook, post.body, post.cta, formatHashtags(post.hashtags)].map((item) => cleanText(item, 5000)).filter(Boolean);
  return parts.join("\n\n");
}

function generateLinkedInImage(post = {}, options = {}) {
  const hook = cleanText(post.hook || "Descubre lo que el anuncio no te cuenta.", 160);
  const subtitle = cleanText(options.subtitle || "InmoRadar añade contexto antes de contactar", 120);
  const accent = cleanText(options.accent || "#FF4A13", 20);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200" viewBox="0 0 1600 1200">
  <defs>
    <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M 48 0 L 0 0 0 48" fill="none" stroke="#E8E2D8" stroke-width="1"/></pattern>
  </defs>
  <rect width="1600" height="1200" fill="#F5F2EA"/>
  <rect width="1600" height="1200" fill="url(#grid)" opacity="0.85"/>
  <rect x="96" y="96" width="1408" height="1008" rx="42" fill="#0A0A0A"/>
  <circle cx="188" cy="190" r="24" fill="${escapeHtml(accent)}"/>
  <text x="232" y="200" fill="#F5F2EA" font-family="Arial, Helvetica, sans-serif" font-size="40" font-weight="800">InmoRadar</text>
  <text x="128" y="326" fill="${escapeHtml(accent)}" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="800" letter-spacing="8">SEÑAL INMOBILIARIA</text>
  <foreignObject x="128" y="380" width="1240" height="420">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Arial,Helvetica,sans-serif;color:#fff;font-size:88px;line-height:0.98;font-weight:900;letter-spacing:-4px;">${escapeHtml(hook)}</div>
  </foreignObject>
  <foreignObject x="128" y="850" width="1060" height="140">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Arial,Helvetica,sans-serif;color:#D9D9D9;font-size:36px;line-height:1.25;font-weight:500;">${escapeHtml(subtitle)}</div>
  </foreignObject>
  <text x="128" y="1046" fill="#F5F2EA" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="800">Inmoradar.app</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function generateLinkedInPost(input = {}, settings = defaultSettings(), now = new Date()) {
  const normalizedSettings = normalizeSettings(settings);
  const template = templateForMode(input.content_mode || normalizedSettings.content_mode, now);
  const destinationUrl = cleanText(input.destination_url || normalizedSettings.destination_url || DEFAULT_DESTINATION_URL, 500);
  const variables = { price: input.price, url: destinationUrl };
  const hook = cleanText(input.hook || renderTemplateText(template.hook, variables), 300);
  const body = cleanText(input.body || renderTemplateText(template.body, variables), 5000);
  const cta = cleanText(input.cta || normalizedSettings.default_cta || renderTemplateText(template.cta, variables), 500);
  const hashtags = normalizeHashtags(input.hashtags || normalizedSettings.default_hashtags || DEFAULT_HASHTAGS);
  const title = cleanText(input.title || template.title, 180);
  const post = {
    title,
    hook,
    body,
    cta,
    hashtags,
    image_url: input.image_url || null,
    image_path: input.image_path || null,
    source_type: input.source_type || "auto",
    source_reference: input.source_reference || template.id,
    scheduled_at: input.scheduled_at || null,
    status: input.status || (normalizedSettings.approval_required ? "pending_review" : "draft"),
    approval_required: normalizedSettings.approval_required,
    text: ""
  };
  post.text = buildLinkedInPostText(post);
  if (!post.image_url) post.image_url = generateLinkedInImage(post, { accent: template.accent });
  return post;
}

function postDayKey(value = new Date()) {
  return new Date(value).toISOString().slice(0, 10);
}

function hasPostForDay(posts = [], date = new Date()) {
  const key = postDayKey(date);
  return posts.some((post) => {
    const created = post.created_at || post.scheduled_at || post.published_at || post.manually_published_at;
    return created && postDayKey(created) === key && String(post.status || "") !== "cancelled";
  });
}

function nextScheduledAt(settings = defaultSettings(), now = new Date()) {
  const normalized = normalizeSettings(settings);
  const [hour, minute] = String(normalized.daily_post_time || "09:30").split(":").map((part) => Number.parseInt(part, 10));
  const next = new Date(now);
  next.setHours(Number.isFinite(hour) ? hour : 9, Number.isFinite(minute) ? minute : 30, 0, 0);
  if (next.getTime() <= new Date(now).getTime()) next.setDate(next.getDate() + 1);
  return next.toISOString();
}

function summarizeConnection(connection = null, env = process.env) {
  const config = linkedinConfig(env);
  const row = connection || {};
  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : null;
  const expired = expiresAt && expiresAt <= Date.now();
  const status = expired && row.status === "connected" ? "expired" : row.status || "disconnected";
  const hasToken = Boolean(row.access_token_encrypted || row.access_token);
  const organizationUrn = normalizeOrganizationUrn(row.organization_urn || config.organizationUrn);
  const automaticAvailable =
    status === "connected" &&
    hasToken &&
    configured(organizationUrn) &&
    config.autoPublishEnabled &&
    configured(config.clientId) &&
    configured(config.clientSecret);

  return {
    provider: "linkedin",
    status,
    mode: automaticAvailable ? "automatic" : "manual",
    organization_urn: organizationUrn || null,
    organization_name: row.organization_name || null,
    token_expires_at: row.token_expires_at || null,
    refresh_token_expires_at: row.refresh_token_expires_at || null,
    scopes: Array.isArray(row.scopes) ? row.scopes : normalizeHashtags(row.scopes || []),
    last_error: row.last_error || null,
    updated_at: row.updated_at || null,
    automatic_available: automaticAvailable,
    manual_available: true,
    notice: automaticAvailable ? null : MANUAL_MODE_NOTICE,
    allowed_page_roles: COMPANY_PAGE_ROLES
  };
}

function authScopes(options = {}) {
  const base = ["w_organization_social"];
  if (options.readOrganization !== false) base.push("r_organization_social");
  if (options.memberFallback) base.push("w_member_social");
  return [...new Set(base)];
}

function generateOAuthState() {
  return crypto.randomBytes(18).toString("base64url");
}

function buildAuthorizationUrl({ state = generateOAuthState(), env = process.env, scopes = authScopes({ memberFallback: true }) } = {}) {
  const config = linkedinConfig(env);
  if (!config.clientId || !config.redirectUri) throw new Error("linkedin_oauth_not_configured");
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    state,
    scope: scopes.join(" ")
  });
  return { url: `${LINKEDIN_AUTH_URL}?${params.toString()}`, state, scopes };
}

function encryptionKey(env = process.env) {
  const material = env.LINKEDIN_CLIENT_SECRET || env.ADMIN_IMPORT_TOKEN || env.CRON_SECRET || "inmoradar-linkedin-local-key";
  return crypto.createHash("sha256").update(String(material)).digest();
}

function encryptToken(value, env = process.env) {
  const plain = cleanText(value, 10000);
  if (!plain) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(env), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptToken(value, env = process.env) {
  const raw = cleanText(value, 10000);
  if (!raw) return "";
  const [version, ivText, tagText, encryptedText] = raw.split(".");
  if (version !== "v1" || !ivText || !tagText || !encryptedText) return "";
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(env), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64url")), decipher.final()]).toString("utf8");
}

async function exchangeAuthorizationCode({ code, env = process.env, fetchImpl = fetch }) {
  const config = linkedinConfig(env);
  if (!config.clientId || !config.clientSecret || !config.redirectUri) throw new Error("linkedin_oauth_not_configured");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: cleanText(code, 2000),
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret
  });
  const response = await fetchImpl(LINKEDIN_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  const payload = await response.json().catch(async () => ({ raw: await response.text().catch(() => "") }));
  if (!response.ok) throw new LinkedInApiError("linkedin_token_exchange_failed", response.status, payload);
  return normalizeTokenPayload(payload);
}

async function refreshAccessToken({ refreshToken, env = process.env, fetchImpl = fetch }) {
  const config = linkedinConfig(env);
  if (!refreshToken) throw new Error("linkedin_refresh_token_missing");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret
  });
  const response = await fetchImpl(LINKEDIN_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  const payload = await response.json().catch(async () => ({ raw: await response.text().catch(() => "") }));
  if (!response.ok) throw new LinkedInApiError("linkedin_token_refresh_failed", response.status, payload);
  return normalizeTokenPayload(payload);
}

function normalizeTokenPayload(payload = {}, now = Date.now()) {
  const expiresIn = Number(payload.expires_in || 0);
  const refreshExpiresIn = Number(payload.refresh_token_expires_in || 0);
  return {
    access_token: payload.access_token || "",
    refresh_token: payload.refresh_token || "",
    expires_in: expiresIn,
    refresh_token_expires_in: refreshExpiresIn,
    token_expires_at: expiresIn ? new Date(now + expiresIn * 1000).toISOString() : null,
    refresh_token_expires_at: refreshExpiresIn ? new Date(now + refreshExpiresIn * 1000).toISOString() : null,
    scopes: String(payload.scope || "").split(/\s+/).filter(Boolean)
  };
}

class LinkedInApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = "LinkedInApiError";
    this.status = status;
    this.payload = payload;
  }
}

function linkedInHeaders(accessToken, apiVersion = DEFAULT_API_VERSION, extra = {}) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Linkedin-Version": apiVersion,
    "X-Restli-Protocol-Version": "2.0.0",
    ...extra
  };
}

function validatePublishInput({ post, connection, settings = {}, env = process.env }) {
  const config = linkedinConfig(env);
  const summary = summarizeConnection(connection, env);
  const autoEnabled = config.autoPublishEnabled && settings.auto_publish_enabled === true;
  if (!autoEnabled) throw new Error("linkedin_auto_publish_disabled");
  if (summary.status !== "connected") throw new Error("linkedin_connection_not_ready");
  if (!summary.organization_urn) throw new Error("linkedin_organization_urn_missing");
  if (!post?.image_url && !post?.image_path) throw new Error("linkedin_image_required");
  if (!cleanText(post?.body || post?.text, 5000)) throw new Error("linkedin_body_required");
  if (summary.token_expires_at && new Date(summary.token_expires_at).getTime() <= Date.now()) throw new Error("linkedin_token_expired");
  return true;
}

async function imageBufferFromSource(source, fetchImpl = fetch) {
  const value = cleanText(source, 2000000);
  if (!value) throw new Error("linkedin_image_required");
  if (value.startsWith("data:")) {
    const match = value.match(/^data:([^;,]+)((?:;[^,]*)*),(.*)$/);
    if (!match) throw new Error("linkedin_image_data_url_invalid");
    const mime = match[1];
    const meta = match[2] || "";
    const encoded = match[3] || "";
    const buffer = /;base64/i.test(meta) ? Buffer.from(encoded, "base64") : Buffer.from(decodeURIComponent(encoded), "utf8");
    return { buffer, mime };
  }
  if (/^https?:\/\//i.test(value)) {
    const response = await fetchImpl(value);
    if (!response.ok) throw new Error(`linkedin_image_fetch_failed_${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer), mime: response.headers.get("content-type") || "application/octet-stream" };
  }
  throw new Error("linkedin_image_must_be_data_or_url");
}

function validateImageMime(mime) {
  const normalized = String(mime || "").split(";")[0].toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp"].includes(normalized)) {
    throw new Error("linkedin_image_format_must_be_jpg_png_webp");
  }
  return normalized;
}

async function uploadImage({ accessToken, ownerUrn, imageSource, env = process.env, fetchImpl = fetch }) {
  const config = linkedinConfig(env);
  const initResponse = await fetchImpl(`${config.restUrl}/images?action=initializeUpload`, {
    method: "POST",
    headers: linkedInHeaders(accessToken, config.apiVersion, { "content-type": "application/json" }),
    body: JSON.stringify({ initializeUploadRequest: { owner: ownerUrn } })
  });
  const initPayload = await initResponse.json().catch(async () => ({ raw: await initResponse.text().catch(() => "") }));
  if (!initResponse.ok) throw new LinkedInApiError("linkedin_image_initialize_failed", initResponse.status, initPayload);
  const uploadUrl = initPayload?.value?.uploadUrl;
  const imageUrn = initPayload?.value?.image;
  if (!uploadUrl || !imageUrn) throw new LinkedInApiError("linkedin_image_initialize_invalid_response", initResponse.status, initPayload);

  const { buffer, mime } = await imageBufferFromSource(imageSource, fetchImpl);
  const contentType = validateImageMime(mime);
  const uploadResponse = await fetchImpl(uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "content-type": contentType },
    body: buffer
  });
  if (!uploadResponse.ok) {
    const payload = await uploadResponse.text().catch(() => "");
    throw new LinkedInApiError("linkedin_image_upload_failed", uploadResponse.status, { raw: payload.slice(0, 500) });
  }
  return { image_urn: imageUrn, initialize_response: initPayload };
}

async function createPost({ accessToken, ownerUrn, post, imageUrn, env = process.env, fetchImpl = fetch }) {
  const config = linkedinConfig(env);
  const commentary = cleanText(post.text || buildLinkedInPostText(post), 3000);
  const body = {
    author: ownerUrn,
    commentary,
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: []
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
    content: imageUrn
      ? {
          media: {
            title: cleanText(post.title || post.hook || "InmoRadar", 200),
            id: imageUrn
          }
        }
      : undefined
  };
  const response = await fetchImpl(`${config.restUrl}/posts`, {
    method: "POST",
    headers: linkedInHeaders(accessToken, config.apiVersion, { "content-type": "application/json" }),
    body: JSON.stringify(body)
  });
  const text = await response.text().catch(() => "");
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch (error) {
    payload = { raw: text.slice(0, 1000) };
  }
  if (!response.ok) throw new LinkedInApiError("linkedin_post_create_failed", response.status, payload);
  return {
    post_urn: response.headers.get("x-restli-id") || payload.id || payload.value?.id || null,
    response: payload
  };
}


function approveLinkedInPostState(post = {}, options = {}) {
  const scheduledAt = options.scheduled_at || post.scheduled_at || null;
  return {
    ...post,
    approved_by_user_id: options.userId || "backoffice",
    approved_at: options.now || new Date().toISOString(),
    scheduled_at: scheduledAt,
    status: scheduledAt ? "scheduled" : "pending_review",
    error_message: null
  };
}

function scheduleLinkedInPostState(post = {}, scheduledAt = null, settings = defaultSettings()) {
  return {
    ...post,
    scheduled_at: scheduledAt || nextScheduledAt(settings),
    status: "scheduled",
    error_message: null
  };
}

function markLinkedInPostManuallyPublishedState(post = {}, now = new Date().toISOString()) {
  return {
    ...post,
    status: "manually_published",
    manually_published_at: now,
    error_message: null
  };
}

function failLinkedInPostState(post = {}, error = "linkedin_publish_failed") {
  return {
    ...post,
    status: "failed",
    error_message: cleanText(error, 800)
  };
}
async function publishPost({ accessToken, post, ownerUrn, env = process.env, fetchImpl = fetch }) {
  const image = await uploadImage({ accessToken, ownerUrn, imageSource: post.image_url || post.image_path, env, fetchImpl });
  const created = await createPost({ accessToken, ownerUrn, post, imageUrn: image.image_urn, env, fetchImpl });
  return {
    linkedin_image_urn: image.image_urn,
    linkedin_post_urn: created.post_urn,
    linkedin_response: {
      image: image.initialize_response,
      post: created.response
    }
  };
}

module.exports = {
  COMPANY_PAGE_ROLES,
  CONTENT_MODES,
  DEFAULT_HASHTAGS,
  MANUAL_MODE_NOTICE,
  POST_STATUSES,
  TEMPLATES,
  LinkedInApiError,
  approveLinkedInPostState,
  authScopes,
  buildAuthorizationUrl,
  buildLinkedInPostText,
  createPost,
  decryptToken,
  defaultSettings,
  encryptToken,
  exchangeAuthorizationCode,
  failLinkedInPostState,
  formatHashtags,
  generateLinkedInImage,
  generateLinkedInPost,
  hasPostForDay,
  imageBufferFromSource,
  linkedInHeaders,
  linkedinConfig,
  linkedinEnvStatus,
  nextScheduledAt,
  normalizeHashtags,
  normalizeOrganizationUrn,
  normalizeSettings,
  markLinkedInPostManuallyPublishedState,
  normalizeTokenPayload,
  postDayKey,
  publishPost,
  refreshAccessToken,
  scheduleLinkedInPostState,
  summarizeConnection,
  templateForMode,
  uploadImage,
  validateImageMime,
  validatePublishInput
};