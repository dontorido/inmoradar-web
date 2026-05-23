const crypto = require("node:crypto");
const { cleanText, metaConfig, normalizeScopes, sanitizeSecretText, META_REQUIRED_SCOPES } = require("./settings");

function generateOAuthState() {
  return crypto.randomBytes(18).toString("base64url");
}

function encryptionKey(env = process.env) {
  const config = metaConfig(env);
  const material = config.encryptionKey || config.appSecret || env.ADMIN_IMPORT_TOKEN || env.CRON_SECRET || "inmoradar-meta-local-key";
  return crypto.createHash("sha256").update(String(material)).digest();
}

function encryptToken(token, env = process.env) {
  const value = String(token || "");
  if (!value) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(env), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptToken(payload, env = process.env) {
  const value = String(payload || "");
  if (!value) return "";
  if (!value.startsWith("v1.")) return value;
  const [, iv, tag, encrypted] = value.split(".");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(env), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

function authScopes(scopes = META_REQUIRED_SCOPES) {
  return [...new Set(normalizeScopes(scopes).length ? normalizeScopes(scopes) : META_REQUIRED_SCOPES)];
}

function buildAuthorizationUrl({ state = generateOAuthState(), env = process.env, scopes = META_REQUIRED_SCOPES } = {}) {
  const config = metaConfig(env);
  if (!config.appId || !config.redirectUri) throw new Error("meta_oauth_not_configured");
  const normalizedScopes = authScopes(scopes);
  const params = new URLSearchParams({
    client_id: config.appId,
    redirect_uri: config.redirectUri,
    state,
    response_type: "code",
    auth_type: "rerequest",
    return_scopes: "true",
    scope: normalizedScopes.join(",")
  });
  return {
    url: `${config.authUrl}/${config.graphVersion}/dialog/oauth?${params.toString()}`,
    state,
    scopes: normalizedScopes
  };
}

async function graphGet(path, params = {}, { accessToken = "", env = process.env, fetchImpl = fetch } = {}) {
  const config = metaConfig(env);
  const url = new URL(`${config.graphUrl}/${config.graphVersion}/${String(path).replace(/^\/+/, "")}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  });
  if (accessToken) url.searchParams.set("access_token", accessToken);
  const response = await fetchImpl(url.href, { method: "GET" });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message = sanitizeSecretText(payload?.error?.message || payload?.message || `meta_graph_get_failed_${response.status}`);
    throw new Error(message);
  }
  return payload;
}

function normalizeTokenPayload(payload = {}, fallbackScopes = []) {
  const expiresIn = Number(payload.expires_in || 0);
  const tokenExpiresAt = expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
  const scopes = normalizeScopes(payload.granted_scopes || payload.scope || fallbackScopes);
  return {
    access_token: payload.access_token || "",
    token_type: payload.token_type || "bearer",
    token_expires_at: tokenExpiresAt,
    scopes
  };
}

async function exchangeAuthorizationCode({ code, env = process.env, fetchImpl = fetch } = {}) {
  const config = metaConfig(env);
  if (!code) throw new Error("meta_code_required");
  if (!config.appId || !config.appSecret || !config.redirectUri) throw new Error("meta_oauth_not_configured");
  const shortLived = await graphGet("oauth/access_token", {
    client_id: config.appId,
    client_secret: config.appSecret,
    redirect_uri: config.redirectUri,
    code
  }, { env, fetchImpl });
  let token = shortLived;
  try {
    token = await graphGet("oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: config.appId,
      client_secret: config.appSecret,
      fb_exchange_token: shortLived.access_token
    }, { env, fetchImpl });
  } catch (error) {
    token = shortLived;
  }
  return normalizeTokenPayload(token, shortLived.granted_scopes || shortLived.scope || []);
}

function sanitizePage(page = {}) {
  return {
    id: cleanText(page.id, 120),
    name: cleanText(page.name, 200),
    tasks: Array.isArray(page.tasks) ? page.tasks.map((item) => cleanText(item, 80)).filter(Boolean) : [],
    perms: Array.isArray(page.perms) ? page.perms.map((item) => cleanText(item, 80)).filter(Boolean) : [],
    instagram_business_account: page.instagram_business_account
      ? {
          id: cleanText(page.instagram_business_account.id, 120),
          username: cleanText(page.instagram_business_account.username, 120)
        }
      : null,
    has_access_token: Boolean(page.access_token)
  };
}

async function fetchManagedPages({ userAccessToken, env = process.env, fetchImpl = fetch } = {}) {
  if (!userAccessToken) throw new Error("meta_user_access_token_missing");
  const payload = await graphGet("me/accounts", {
    fields: "id,name,access_token,tasks,perms,instagram_business_account{id,username}",
    limit: 100
  }, { accessToken: userAccessToken, env, fetchImpl });
  return Array.isArray(payload.data) ? payload.data : [];
}

function selectManagedPage(pages = [], pageId = "") {
  const normalized = cleanText(pageId, 120);
  return pages.find((page) => cleanText(page.id, 120) === normalized) || null;
}

module.exports = {
  authScopes,
  buildAuthorizationUrl,
  decryptToken,
  encryptToken,
  exchangeAuthorizationCode,
  fetchManagedPages,
  generateOAuthState,
  normalizeTokenPayload,
  sanitizePage,
  selectManagedPage
};
