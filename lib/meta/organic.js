const crypto = require("node:crypto");
const { cleanText, metaConfig, siteUrl } = require("./settings");
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

function validateMetaOrganicEnv(env = process.env) {
  const config = metaConfig(env);
  const missing = [];
  if (!config.appId) missing.push("META_APP_ID");
  if (!config.appSecret) missing.push("META_APP_SECRET");
  if (!config.redirectUri) missing.push("META_REDIRECT_URI");
  return {
    ok: missing.length === 0,
    missing,
    graph_version: config.graphVersion,
    redirect_uri: config.redirectUri,
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

function stateSecret(env = process.env) {
  const config = metaConfig(env);
  return config.appSecret || env.META_ACCESS_TOKEN_ENCRYPTION_KEY || env.ADMIN_IMPORT_TOKEN || "inmoradar-meta-oauth-state";
}

function signStatePayload(payload, env = process.env) {
  return crypto.createHmac("sha256", stateSecret(env)).update(payload).digest("base64url");
}

function encodeOrganicOAuthState({ returnTo = "/backoffice/marketing/meta", issuedAt = Date.now(), nonce = "" } = {}, env = process.env) {
  const safeReturnTo = String(returnTo || "/backoffice/marketing/meta").startsWith("/")
    ? String(returnTo || "/backoffice/marketing/meta")
    : "/backoffice/marketing/meta";
  const payload = Buffer.from(JSON.stringify({
    n: nonce || crypto.randomBytes(12).toString("base64url"),
    r: safeReturnTo,
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
  maskSecret,
  organicTestImageUrl,
  validateMetaOrganicEnv
};
