const crypto = require("node:crypto");
const {
  META_FACEBOOK_PAGE_SCOPES,
  META_INSTAGRAM_BUSINESS_SCOPES,
  META_LEGACY_INSTAGRAM_SCOPES,
  cleanText,
  metaConfig,
  siteUrl
} = require("./settings");
const { defaultBrandImageUrl, isPublicImageUrl } = require("./images");

const META_ORGANIC_FACEBOOK_COPY =
  "Estamos probando la publicacion automatica de InmoRadar. InmoRadar ayuda a analizar anuncios inmobiliarios antes de contactar.";
const META_ORGANIC_INSTAGRAM_CAPTION =
  "Probando publicacion automatica de InmoRadar. Analiza pisos antes de contactar. Mas informacion en inmoradar.app";
const META_ORGANIC_SOURCE_TYPE = "meta_organic_spike";

function organicSiteUrl(env = process.env) {
  return siteUrl(env) || "https://www.inmoradar.app";
}

function organicTestImageUrl(env = process.env) {
  const configured = cleanText(env.META_TEST_IMAGE_URL || env.META_DEFAULT_IMAGE_URL || env.PUBLIC_META_IMAGE_URL, 1000);
  if (isPublicImageUrl(configured)) return configured;
  return defaultBrandImageUrl(env);
}

function buildFacebookOrganicTestPost(env = process.env) {
  return {
    platform: "facebook",
    caption: META_ORGANIC_FACEBOOK_COPY,
    link: organicSiteUrl(env),
    source_url: organicSiteUrl(env),
    image_url: ""
  };
}

function buildInstagramOrganicTestPost(env = process.env) {
  return {
    platform: "instagram",
    caption: META_ORGANIC_INSTAGRAM_CAPTION,
    source_url: organicSiteUrl(env),
    image_url: organicTestImageUrl(env)
  };
}

function validateMetaOrganicEnv(env = process.env, { target = "instagram" } = {}) {
  const config = metaConfig(env);
  const normalizedTarget = normalizeOAuthTarget(target);
  const missing = [];
  if (normalizedTarget === "instagram") {
    if (!config.instagramAppId) missing.push("INSTAGRAM_APP_ID");
    if (!config.instagramAppSecret) missing.push("INSTAGRAM_APP_SECRET");
    if (!config.instagramRedirectUri) missing.push("INSTAGRAM_REDIRECT_URI");
  } else {
    if (!config.appId) missing.push("META_APP_ID");
    if (!config.appSecret) missing.push("META_APP_SECRET");
    if (!config.redirectUri) missing.push("META_REDIRECT_URI");
  }
  return {
    ok: missing.length === 0,
    target: normalizedTarget,
    missing,
    graph_version: normalizedTarget === "instagram" ? config.instagramGraphVersion : config.graphVersion,
    redirect_uri: normalizedTarget === "instagram" ? config.instagramRedirectUri : config.redirectUri,
    facebook_page_id: config.facebookPageId || null,
    instagram_account_id: config.instagramBusinessAccountId || null
  };
}

function maskSecret(value) {
  const raw = String(value || "");
  if (!raw) return "";
  if (raw.length <= 10) return `${raw.slice(0, 3)}...`;
  return `${raw.slice(0, 6)}...${raw.slice(-4)}`;
}

function legacyInstagramOAuthEnabled(env = process.env) {
  return ["1", "true", "yes", "on"].includes(String(env.META_ENABLE_LEGACY_INSTAGRAM_SCOPES || "").trim().toLowerCase());
}

function normalizeOAuthTarget(value) {
  const target = String(value || "instagram").trim().toLowerCase();
  if (["facebook", "page", "pages"].includes(target)) return "facebook";
  return "instagram";
}

function metaOrganicOAuthScopes({ target = "instagram", env = process.env } = {}) {
  const instagramScopes = legacyInstagramOAuthEnabled(env) ? META_LEGACY_INSTAGRAM_SCOPES : META_INSTAGRAM_BUSINESS_SCOPES;
  const normalizedTarget = normalizeOAuthTarget(target);
  if (normalizedTarget === "facebook") return [...META_FACEBOOK_PAGE_SCOPES];
  return [...instagramScopes];
}

function stateSecret(env = process.env) {
  const config = metaConfig(env);
  return config.appSecret || config.instagramAppSecret || env.META_ACCESS_TOKEN_ENCRYPTION_KEY || env.ADMIN_IMPORT_TOKEN || "inmoradar-meta-oauth-state";
}

function signStatePayload(payload, env = process.env) {
  return crypto.createHmac("sha256", stateSecret(env)).update(payload).digest("base64url");
}

function encodeOrganicOAuthState({ returnTo = "/backoffice/marketing/meta", target = "instagram", issuedAt = Date.now(), nonce = "" } = {}, env = process.env) {
  const safeReturnTo = String(returnTo || "/backoffice/marketing/meta").startsWith("/")
    ? String(returnTo || "/backoffice/marketing/meta")
    : "/backoffice/marketing/meta";
  const payload = Buffer.from(JSON.stringify({
    n: nonce || crypto.randomBytes(12).toString("base64url"),
    r: safeReturnTo,
    t: normalizeOAuthTarget(target),
    i: Number(issuedAt) || Date.now()
  })).toString("base64url");
  return `${payload}.${signStatePayload(payload, env)}`;
}

function decodeOrganicOAuthState(state, env = process.env, { now = Date.now(), maxAgeMs = 30 * 60 * 1000 } = {}) {
  const [payload, signature] = String(state || "").split(".");
  if (!payload || !signature) throw new Error("meta_oauth_state_invalid");
  const expected = signStatePayload(payload, env);
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== receivedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)) {
    throw new Error("meta_oauth_state_invalid");
  }
  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  const issuedAt = Number(decoded.i || 0);
  if (!Number.isFinite(issuedAt) || Math.abs(Number(now) - issuedAt) > maxAgeMs) {
    throw new Error("meta_oauth_state_expired");
  }
  return {
    nonce: cleanText(decoded.n, 120),
    returnTo: String(decoded.r || "/backoffice/marketing/meta").startsWith("/") ? String(decoded.r) : "/backoffice/marketing/meta",
    target: normalizeOAuthTarget(decoded.t),
    issuedAt
  };
}

module.exports = {
  META_ORGANIC_FACEBOOK_COPY,
  META_ORGANIC_INSTAGRAM_CAPTION,
  META_ORGANIC_SOURCE_TYPE,
  buildFacebookOrganicTestPost,
  buildInstagramOrganicTestPost,
  decodeOrganicOAuthState,
  encodeOrganicOAuthState,
  legacyInstagramOAuthEnabled,
  maskSecret,
  metaOrganicOAuthScopes,
  normalizeOAuthTarget,
  organicTestImageUrl,
  validateMetaOrganicEnv
};
