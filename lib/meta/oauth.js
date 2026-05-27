const crypto = require("node:crypto");
const {
  META_FACEBOOK_PAGE_SCOPES,
  META_INSTAGRAM_BUSINESS_SCOPES,
  META_REQUIRED_SCOPES,
  cleanText,
  metaConfig,
  normalizeScopes,
  sanitizeSecretText
} = require("./settings");

function generateOAuthState() {
  return crypto.randomBytes(18).toString("base64url");
}

function encryptionKey(env = process.env) {
  const config = metaConfig(env);
  const material = config.encryptionKey || config.appSecret || config.instagramAppSecret || env.ADMIN_IMPORT_TOKEN || env.CRON_SECRET || "inmoradar-meta-local-key";
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

function maskDebugValue(key, value) {
  const raw = String(value || "");
  if (!raw) return "";
  if (/state|token|secret|code/i.test(String(key || ""))) {
    return raw.length <= 10 ? `[present:${raw.length}]` : `${raw.slice(0, 6)}...${raw.slice(-4)}`;
  }
  return raw.length > 200 ? `${raw.slice(0, 120)}...[${raw.length}]` : raw;
}

function instagramOAuthStateMode(env = process.env) {
  return ["cookie", "none"].includes(cleanText(env.INSTAGRAM_OAUTH_STATE_MODE, 20).toLowerCase()) ? "cookie" : "query";
}

function instagramBusinessLoginTemplate(env = process.env) {
  return cleanText(env.INSTAGRAM_BUSINESS_LOGIN_URL || env.INSTAGRAM_OFFICIAL_EMBED_URL || env.META_INSTAGRAM_OFFICIAL_EMBED_URL, 4000);
}

const INSTAGRAM_TOP_LEVEL_OVERRIDES = new Set(["platform_app_id", "next", "scope"]);
const INSTAGRAM_NEXT_PARAM_OVERRIDES = new Set(["client_id", "redirect_uri", "response_type", "scope", "state"]);

function parseUrlSafe(value, base = "https://www.instagram.com") {
  if (!value) return null;
  try {
    return new URL(String(value || ""), base);
  } catch (error) {
    return null;
  }
}

function buildAuthorizationUrl({ state = generateOAuthState(), env = process.env, scopes = META_FACEBOOK_PAGE_SCOPES } = {}) {
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

function buildInstagramAuthorizationUrl({ state = generateOAuthState(), env = process.env, scopes = META_INSTAGRAM_BUSINESS_SCOPES } = {}) {
  const config = metaConfig(env);
  if (!config.instagramAppId || !config.instagramRedirectUri) throw new Error("meta_instagram_oauth_not_configured");
  const normalizedScopes = authScopes(scopes);
  const stateMode = instagramOAuthStateMode(env);
  const template = parseUrlSafe(instagramBusinessLoginTemplate(env));
  const templateNext = parseUrlSafe(template?.searchParams.get("next"));
  const nextParams = new URLSearchParams({
    client_id: config.instagramAppId,
    redirect_uri: config.instagramRedirectUri,
    response_type: "code",
    scope: normalizedScopes.join(",")
  });
  if (templateNext) {
    for (const [key, value] of templateNext.searchParams.entries()) {
      if (!INSTAGRAM_NEXT_PARAM_OVERRIDES.has(key) && !nextParams.has(key)) nextParams.append(key, value);
    }
  }
  if (stateMode === "query") nextParams.set("state", state);
  const nextPath = templateNext?.pathname || "/oauth/authorize/third_party/";
  const next = `${nextPath.endsWith("/") ? nextPath : `${nextPath}/`}?${nextParams.toString()}`;
  const topEntries = template
    ? Array.from(template.searchParams.entries()).filter(([key]) => !INSTAGRAM_TOP_LEVEL_OVERRIDES.has(key))
    : [["force_authentication", ""]];
  const hasForce = topEntries.some(([key]) => key === "force_authentication" || key === "force_reauth");
  if (!hasForce) topEntries.unshift(["force_authentication", ""]);
  const scopeParam = normalizedScopes.join(",");
  const topParams = topEntries
    .map(([key, value]) => value === "" ? encodeURIComponent(key) : `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .concat([
      `scope=${encodeURIComponent(scopeParam)}`,
      `platform_app_id=${encodeURIComponent(config.instagramAppId)}`,
      `next=${encodeURIComponent(next)}`
    ])
    .join("&");
  return {
    url: `${config.instagramAuthUrl}/accounts/login/?${topParams}`,
    state,
    state_mode: stateMode,
    scopes: normalizedScopes,
    provider: "instagram"
  };
}

function summarizeInstagramAuthorizationUrl(url) {
  const parsed = parseUrlSafe(url);
  if (!parsed) return { ok: false, error: "invalid_url" };
  const top_params = {};
  for (const [key, value] of parsed.searchParams.entries()) {
    if (key !== "next") top_params[key] = maskDebugValue(key, value);
  }
  const nextRaw = parsed.searchParams.get("next") || "";
  const nextUrl = parseUrlSafe(nextRaw);
  const next_params = {};
  if (nextUrl) {
    for (const [key, value] of nextUrl.searchParams.entries()) {
      next_params[key] = maskDebugValue(key, value);
    }
  }
  return {
    ok: true,
    origin: parsed.origin,
    path: parsed.pathname,
    top_params,
    has_next: Boolean(nextRaw),
    next_path: nextUrl?.pathname || null,
    next_params
  };
}

function redactInstagramAuthorizationUrl(url) {
  const parsed = parseUrlSafe(url);
  if (!parsed) return "";
  const nextRaw = parsed.searchParams.get("next");
  const nextUrl = parseUrlSafe(nextRaw);
  if (nextUrl?.searchParams.has("state")) {
    nextUrl.searchParams.set("state", "[state]");
  }
  const params = [];
  for (const [key, value] of parsed.searchParams.entries()) {
    const nextValue = key === "next" && nextUrl ? `${nextUrl.pathname}${nextUrl.search}` : value;
    params.push(nextValue === "" ? encodeURIComponent(key) : `${encodeURIComponent(key)}=${encodeURIComponent(nextValue)}`);
  }
  return `${parsed.origin}${parsed.pathname}${params.length ? `?${params.join("&")}` : ""}`;
}

function diffInstagramAuthorizationUrls(generatedUrl, officialUrl) {
  const generated = summarizeInstagramAuthorizationUrl(generatedUrl);
  const official = summarizeInstagramAuthorizationUrl(officialUrl);
  if (!generated.ok || !official.ok) return [{ field: "url", generated: generated.error || "ok", official: official.error || "ok" }];
  const diffs = [];
  for (const field of ["origin", "path", "next_path"]) {
    if (generated[field] !== official[field]) diffs.push({ field, generated: generated[field], official: official[field] });
  }
  for (const group of ["top_params", "next_params"]) {
    const keys = new Set([...Object.keys(generated[group] || {}), ...Object.keys(official[group] || {})]);
    for (const key of keys) {
      const generatedValue = generated[group]?.[key] ?? null;
      const officialValue = official[group]?.[key] ?? null;
      if (generatedValue !== officialValue) {
        diffs.push({ field: `${group}.${key}`, generated: generatedValue, official: officialValue });
      }
    }
  }
  return diffs;
}

function buildOrganicAuthorizationUrl({ target = "instagram", state = generateOAuthState(), env = process.env, scopes } = {}) {
  if (String(target || "").toLowerCase() === "facebook") {
    return {
      ...buildAuthorizationUrl({ state, env, scopes: scopes || META_FACEBOOK_PAGE_SCOPES }),
      provider: "facebook"
    };
  }
  return buildInstagramAuthorizationUrl({ state, env, scopes: scopes || META_INSTAGRAM_BUSINESS_SCOPES });
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
    user_id: cleanText(payload.user_id || payload.id, 120),
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

async function exchangeInstagramAuthorizationCode({ code, env = process.env, fetchImpl = fetch } = {}) {
  const config = metaConfig(env);
  if (!code) throw new Error("meta_code_required");
  if (!config.instagramAppId || !config.instagramAppSecret || !config.instagramRedirectUri) throw new Error("meta_instagram_oauth_not_configured");
  const body = new URLSearchParams({
    client_id: config.instagramAppId,
    client_secret: config.instagramAppSecret,
    grant_type: "authorization_code",
    redirect_uri: config.instagramRedirectUri,
    code
  });
  const response = await fetchImpl(`${config.instagramApiUrl}/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });
  const text = await response.text();
  const shortLived = text ? JSON.parse(text) : {};
  if (!response.ok || shortLived.error) {
    const message = sanitizeSecretText(shortLived?.error?.message || shortLived?.message || `meta_instagram_token_failed_${response.status}`);
    throw new Error(message);
  }
  let token = shortLived;
  try {
    const longLivedUrl = new URL(`${config.instagramGraphUrl}/access_token`);
    longLivedUrl.searchParams.set("grant_type", "ig_exchange_token");
    longLivedUrl.searchParams.set("client_secret", config.instagramAppSecret);
    longLivedUrl.searchParams.set("access_token", shortLived.access_token);
    const longLivedResponse = await fetchImpl(longLivedUrl.href, { method: "GET" });
    const longLivedText = await longLivedResponse.text();
    const longLived = longLivedText ? JSON.parse(longLivedText) : {};
    if (longLivedResponse.ok && !longLived.error && longLived.access_token) {
      token = { ...longLived, user_id: shortLived.user_id || longLived.user_id };
    }
  } catch (error) {
    token = shortLived;
  }
  return normalizeTokenPayload(token, shortLived.scope || META_INSTAGRAM_BUSINESS_SCOPES);
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
  buildInstagramAuthorizationUrl,
  buildOrganicAuthorizationUrl,
  decryptToken,
  diffInstagramAuthorizationUrls,
  encryptToken,
  exchangeAuthorizationCode,
  exchangeInstagramAuthorizationCode,
  fetchManagedPages,
  generateOAuthState,
  instagramOAuthStateMode,
  normalizeTokenPayload,
  redactInstagramAuthorizationUrl,
  sanitizePage,
  summarizeInstagramAuthorizationUrl,
  selectManagedPage
};
