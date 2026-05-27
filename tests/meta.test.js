const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const adminHandler = require("../api/admin");

const {
  META_FACEBOOK_PAGE_SCOPES,
  META_POST_STATUSES,
  META_REQUIRED_SCOPES,
  buildAuthorizationUrl,
  buildInstagramAuthorizationUrl,
  buildCaption,
  defaultBrandImageUrl,
  defaultSettings,
  diffInstagramAuthorizationUrls,
  duplicateForPlatform,
  encryptToken,
  exchangeInstagramAuthorizationCode,
  instagramOAuthStateMode,
  imageUrlForLanding,
  isEligibleLanding,
  missingRequiredScopes,
  pickNextLanding,
  publishFacebookPost,
  publishInstagramPost,
  redactInstagramAuthorizationUrl,
  sanitizeMetaPayload,
  sanitizeSecretText,
  shouldRunAutopublisher,
  summarizeInstagramAuthorizationUrl,
  summarizeConnection
} = require("../lib/meta/services");
const {
  buildFacebookOrganicTestPost,
  buildInstagramOrganicTestPost,
  decodeOrganicOAuthState,
  encodeOrganicOAuthState,
  maskSecret,
  metaOrganicOAuthScopes,
  validateMetaOrganicEnv
} = require("../lib/meta/organic");

const IG_APP_ID = "1438690814675569";
const OLD_IG_APP_ID = "14386908146755569";

const validEnv = {
  META_APP_ID: "meta-app-id",
  META_APP_SECRET: "meta-app-secret",
  META_REDIRECT_URI: "https://www.inmoradar.app/api/meta/oauth/callback",
  INSTAGRAM_APP_ID: IG_APP_ID,
  INSTAGRAM_APP_SECRET: "instagram-app-secret",
  INSTAGRAM_REDIRECT_URI: "https://www.inmoradar.app/api/meta/oauth/callback",
  INSTAGRAM_GRAPH_VERSION: "v23.0",
  META_ACCESS_TOKEN_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef",
  META_AUTOPOST_ENABLED: "true",
  META_FACEBOOK_PAGE_ID: "123",
  META_FACEBOOK_PAGE_NAME: "InmoRadar",
  META_INSTAGRAM_ACCOUNT_ID: "456",
  PUBLIC_SITE_URL: "https://www.inmoradar.app"
};

const validConnection = {
  status: "connected",
  facebook_user_id: "user_1",
  facebook_page_id: "123",
  facebook_page_name: "InmoRadar",
  instagram_business_account_id: "456",
  scopes: [...META_REQUIRED_SCOPES, ...META_FACEBOOK_PAGE_SCOPES],
  access_token_encrypted: "encrypted-token",
  page_access_token_encrypted: "encrypted-page-token",
  token_expires_at: new Date(Date.now() + 3600_000).toISOString()
};

async function withEnv(patch, callback) {
  const previous = new Map();
  for (const key of Object.keys(patch)) {
    previous.set(key, process.env[key]);
    if (patch[key] === undefined) delete process.env[key];
    else process.env[key] = patch[key];
  }
  try {
    return await callback();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function createJsonResponse() {
  const chunks = [];
  const res = {
    statusCode: 0,
    headers: {},
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
    end(chunk) {
      if (chunk) chunks.push(String(chunk));
    }
  };
  return {
    res,
    payload() {
      return JSON.parse(chunks.join("") || "{}");
    }
  };
}

function createRawResponse() {
  const chunks = [];
  const res = {
    statusCode: 0,
    headers: {},
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
    getHeader(name) {
      return this.headers[String(name).toLowerCase()];
    },
    end(chunk) {
      if (chunk) chunks.push(String(chunk));
    }
  };
  return { res, body: () => chunks.join("") };
}

function parseInstagramLoginUrl(url) {
  const parsed = new URL(url);
  const next = parsed.searchParams.get("next");
  return {
    parsed,
    next,
    nextUrl: new URL(next || "/", "https://www.instagram.com")
  };
}

const IG_PUBLISH_SCOPES = ["instagram_business_basic", "instagram_business_content_publish"];
const IG_FORBIDDEN_OAUTH_SCOPES = [
  "instagram_business_manage_messages",
  "instagram_manage_comments",
  "instagram_business_manage_insights"
];

function assertOnlyInstagramPublishScopes(url) {
  const { nextUrl } = parseInstagramLoginUrl(url);
  const expected = IG_PUBLISH_SCOPES.join(",");
  assert.equal(nextUrl.searchParams.get("scope"), expected);
  const decoded = decodeURIComponent(url);
  for (const scope of IG_FORBIDDEN_OAUTH_SCOPES) {
    assert.equal(decoded.includes(scope), false, `unexpected Instagram OAuth scope: ${scope}`);
  }
}

function assertCleanInstagramLoginTopLevel(url) {
  const { parsed, nextUrl } = parseInstagramLoginUrl(url);
  assert.deepEqual(
    Array.from(parsed.searchParams.keys()),
    ["force_authentication", "platform_app_id", "next"]
  );
  assert.equal(parsed.searchParams.has("force_authentication"), true);
  assert.equal(parsed.searchParams.get("platform_app_id"), IG_APP_ID);
  assert.equal(parsed.searchParams.has("client_id"), false);
  assert.equal(parsed.searchParams.has("redirect_uri"), false);
  assert.equal(parsed.searchParams.has("response_type"), false);
  assert.equal(parsed.searchParams.has("scope"), false);
  assert.equal(parsed.searchParams.has("force_reauth"), false);
  assert.equal(nextUrl.searchParams.get("client_id"), IG_APP_ID);
  assert.equal(decodeURIComponent(url).includes(OLD_IG_APP_ID), false);
}

async function callMetaOAuthStartRedirect(query = "", env = validEnv) {
  return withEnv({ ADMIN_IMPORT_TOKEN: "admin-test-token", ...env }, async () => {
    const { res, body } = createRawResponse();
    await adminHandler({
      method: "GET",
      url: `/api/admin?resource=meta/oauth/start${query ? `&${query.replace(/^&/, "")}` : ""}`,
      headers: { authorization: "Bearer admin-test-token", host: "www.inmoradar.app" }
    }, res);
    return { statusCode: res.statusCode, headers: res.headers, body: body() };
  });
}

async function callMetaOAuthStart(query = "", env = validEnv) {
  return withEnv({ ADMIN_IMPORT_TOKEN: "admin-test-token", ...env }, async () => {
    const { res, payload } = createJsonResponse();
    await adminHandler({
      method: "GET",
      url: `/api/admin?resource=meta/oauth/start&format=json${query ? `&${query.replace(/^&/, "")}` : ""}`,
      headers: { authorization: "Bearer admin-test-token", host: "www.inmoradar.app" }
    }, res);
    return { statusCode: res.statusCode, payload: payload() };
  });
}

async function callAdminResource(resource, headers = {}, env = validEnv) {
  return withEnv({ ADMIN_IMPORT_TOKEN: "admin-test-token", ...env }, async () => {
    const { res, payload } = createJsonResponse();
    await adminHandler({
      method: "GET",
      url: `/api/admin?resource=${encodeURIComponent(resource)}`,
      headers: { host: "www.inmoradar.app", ...headers }
    }, res);
    return { statusCode: res.statusCode, payload: payload() };
  });
}

async function callLegacyMetaConnect(query = "", env = validEnv) {
  return withEnv({ ADMIN_IMPORT_TOKEN: "admin-test-token", ...env }, async () => {
    const { res, payload } = createJsonResponse();
    await adminHandler({
      method: "GET",
      url: `/api/admin?resource=meta/connect${query ? `&${query.replace(/^&/, "")}` : ""}`,
      headers: { authorization: "Bearer admin-test-token", host: "www.inmoradar.app" }
    }, res);
    return { statusCode: res.statusCode, payload: payload() };
  });
}

const expensiveLanding = {
  slug: "saber-si-piso-esta-caro/granada",
  title: "Como saber si un piso esta caro en Granada",
  h1: "Como saber si un piso esta caro en Granada",
  meta_description: "Guia practica para comparar antes de contactar.",
  city: "Granada",
  template_type: "expensive_listing_city",
  status: "published",
  index_status: "index",
  quality_score: 92,
  canonical_url: "https://www.inmoradar.app/saber-si-piso-esta-caro/granada/",
  published_at: "2026-05-23T08:00:00.000Z"
};

test("crea ajustes Meta por defecto seguros", () => {
  const settings = defaultSettings(validEnv);
  assert.equal(settings.autopost_enabled, false);
  assert.equal(settings.frequency_days, 1);
  assert.equal(settings.max_per_day, 1);
  assert.equal(settings.preferred_time, "10:00");
  assert.equal(settings.timezone, "Europe/Madrid");
  assert.equal(settings.facebook_enabled, true);
  assert.equal(settings.instagram_enabled, true);
});

test("no publica si kill switch esta apagado", () => {
  const decision = shouldRunAutopublisher({
    posts: [],
    settings: { ...defaultSettings(validEnv), autopost_enabled: true },
    connection: validConnection,
    platform: "facebook",
    env: { ...validEnv, META_AUTOPOST_ENABLED: "false" }
  });
  assert.equal(decision.ok, false);
  assert.equal(decision.reason, "META_AUTOPOST_ENABLED=false");
});

test("no publica si falta conexion", () => {
  const decision = shouldRunAutopublisher({
    posts: [],
    settings: { ...defaultSettings(validEnv), autopost_enabled: true },
    connection: { ...validConnection, status: "needs_connection" },
    platform: "facebook",
    env: validEnv
  });
  assert.equal(decision.ok, false);
  assert.equal(decision.reason, "missing_connection");
});

test("no publica si faltan permisos Meta", () => {
  const missing = missingRequiredScopes(["pages_show_list"]);
  assert.ok(missing.includes("instagram_business_content_publish"));
  const decision = shouldRunAutopublisher({
    posts: [],
    settings: { ...defaultSettings(validEnv), autopost_enabled: true },
    connection: { ...validConnection, scopes: ["pages_show_list"] },
    platform: "instagram",
    env: validEnv
  });
  assert.equal(decision.ok, false);
  assert.match(decision.reason, /missing_permissions/);
});

test("no publica si falta configuracion de entorno Meta", () => {
  const decision = shouldRunAutopublisher({
    posts: [],
    settings: { ...defaultSettings(validEnv), autopost_enabled: true },
    connection: validConnection,
    platform: "facebook",
    env: { ...validEnv, META_APP_SECRET: "" }
  });
  assert.equal(decision.ok, false);
  assert.equal(decision.reason, "meta_env_not_configured");
});

test("genera caption valido para landing saber si piso esta caro", () => {
  const content = buildCaption({ landing: expensiveLanding, platform: "facebook", env: validEnv });
  assert.match(content.caption, /¿Un piso en Granada/);
  assert.match(content.caption, /InmoRadar analiza precio/);
  assert.match(content.caption, /utm_source=facebook/);
  assert.equal(content.utm_campaign, "seo_city_granada");
  assert.doesNotMatch(content.caption, /Ã|Â|�/);
});

test("anade UTM correcto por plataforma", () => {
  const facebook = buildCaption({ landing: expensiveLanding, platform: "facebook", env: validEnv });
  const instagram = buildCaption({ landing: expensiveLanding, platform: "instagram", env: validEnv });
  assert.match(facebook.caption, /utm_source=facebook/);
  assert.match(instagram.caption, /utm_source=instagram/);
  assert.match(instagram.caption, /utm_medium=social/);
  assert.match(instagram.caption, /utm_campaign=seo_city_granada/);
});

test("evita duplicados por plataforma y source_url", () => {
  const posts = [{ platform: "facebook", status: "published", source_url: expensiveLanding.canonical_url }];
  assert.equal(duplicateForPlatform(posts, "facebook", expensiveLanding, validEnv), true);
  assert.equal(duplicateForPlatform(posts, "instagram", expensiveLanding, validEnv), false);
});

test("respeta limite diario por plataforma", () => {
  const posts = [{ platform: "facebook", status: "published", published_at: "2026-05-23T08:00:00.000Z" }];
  const decision = shouldRunAutopublisher({
    posts,
    settings: { ...defaultSettings(validEnv), autopost_enabled: true },
    connection: validConnection,
    platform: "facebook",
    now: "2026-05-23T10:00:00.000Z",
    env: validEnv
  });
  assert.equal(decision.ok, false);
  assert.equal(decision.reason, "max_per_day_reached");
});

test("selecciona solo landings publicadas, indexables y con calidad suficiente", () => {
  const draft = { ...expensiveLanding, slug: "draft", status: "draft", canonical_url: "https://www.inmoradar.app/draft/" };
  const noindex = { ...expensiveLanding, slug: "noindex", index_status: "noindex", canonical_url: "https://www.inmoradar.app/noindex/" };
  const lowQuality = { ...expensiveLanding, slug: "low", quality_score: 45, canonical_url: "https://www.inmoradar.app/low/" };
  const winner = { ...expensiveLanding, slug: "precio-metro-cuadrado/granada", template_type: "price_city", quality_score: 98, canonical_url: "https://www.inmoradar.app/precio-metro-cuadrado/granada/" };
  assert.equal(isEligibleLanding(draft, { env: validEnv }), false);
  assert.equal(isEligibleLanding(noindex, { env: validEnv }), false);
  assert.equal(isEligibleLanding(lowQuality, { env: validEnv }), false);
  assert.equal(pickNextLanding({ landings: [draft, noindex, lowQuality, winner], posts: [], platform: "facebook", env: validEnv }).slug, winner.slug);
});

test("no expone tokens en resumen de conexion", () => {
  const encrypted = encryptToken("plain-meta-token", validEnv);
  const summary = summarizeConnection({ ...validConnection, access_token: "plain", access_token_encrypted: encrypted }, validEnv);
  assert.equal("access_token" in summary, false);
  assert.equal("access_token_encrypted" in summary, false);
  assert.equal(JSON.stringify(summary).includes("plain-meta-token"), false);
});

test("publica Facebook Page con link y devuelve respuesta saneada", async () => {
  let captured = null;
  const result = await publishFacebookPost({
    accessToken: "page-token",
    pageId: "123",
    caption: "caption",
    link: "https://www.inmoradar.app/?utm_source=facebook",
    imageUrl: "https://www.inmoradar.app/assets/inmoradar-brand-mark.jpg",
    env: validEnv,
    fetchImpl: async (url, options) => {
      captured = { url, body: options.body };
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: "123_789", access_token: "leak" }) };
    }
  });
  assert.match(captured.url, /123\/feed/);
  assert.match(captured.body, /message=caption/);
  assert.equal(result.external_post_id, "123_789");
  assert.equal(JSON.stringify(result).includes("page-token"), false);
  assert.equal(JSON.stringify(result).includes("leak"), false);
});

test("Instagram requiere imagen publica", async () => {
  await assert.rejects(
    () => publishInstagramPost({
      accessToken: "page-token",
      instagramBusinessAccountId: "456",
      caption: "caption",
      imageUrl: "data:image/svg+xml,%3Csvg%3E%3C/svg%3E",
      env: validEnv,
      fetchImpl: async () => ({ ok: true, status: 200, text: async () => "{}" })
    }),
    /meta_instagram_public_image_required/
  );
});

test("publica Instagram con Graph Instagram y token de Instagram Login", async () => {
  const calls = [];
  const result = await publishInstagramPost({
    accessToken: "ig-user-token",
    instagramBusinessAccountId: "1784143546309305",
    caption: "caption",
    imageUrl: "https://www.inmoradar.app/assets/inmoradar-brand-mark.jpg",
    env: validEnv,
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, body: options.body });
      if (url.includes("/media_publish")) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ id: "ig-media-id" }) };
      }
      if (url.includes("/ig-media-id")) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ id: "ig-media-id", permalink: "https://www.instagram.com/p/test/" }) };
      }
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: "ig-container-id" }) };
    }
  });
  assert.match(calls[0].url, /^https:\/\/graph\.instagram\.com\/v23\.0\/1784143546309305\/media/);
  assert.match(calls[1].url, /^https:\/\/graph\.instagram\.com\/v23\.0\/1784143546309305\/media_publish/);
  assert.match(calls[0].body, /access_token=ig-user-token/);
  assert.equal(result.external_post_id, "ig-media-id");
  assert.equal(result.published_url, "https://www.instagram.com/p/test/");
});

test("OAuth Facebook Page usa Meta App ID y dialog de Facebook", () => {
  const { url, scopes } = buildAuthorizationUrl({ state: "state", env: validEnv, scopes: META_FACEBOOK_PAGE_SCOPES });
  const parsed = new URL(url);
  assert.match(url, /facebook\.com\/v23\.0\/dialog\/oauth/);
  assert.equal(parsed.searchParams.get("client_id"), "meta-app-id");
  assert.equal(scopes.includes("pages_manage_posts"), true);
  assert.equal(scopes.includes("instagram_business_basic"), false);
  assert.equal(scopes.includes("instagram_business_content_publish"), false);
  assert.ok(url.includes(encodeURIComponent("https://www.inmoradar.app/api/meta/oauth/callback")));
});

test("OAuth Instagram Login usa URL de insercion con accounts/login y next third_party", () => {
  const { url, scopes, provider } = buildInstagramAuthorizationUrl({ state: "state", env: validEnv });
  const { parsed, nextUrl } = parseInstagramLoginUrl(url);
  assert.equal(provider, "instagram");
  assert.equal(parsed.origin, "https://www.instagram.com");
  assert.equal(parsed.pathname, "/accounts/login/");
  assertCleanInstagramLoginTopLevel(url);
  assert.equal(parsed.searchParams.get("platform_app_id") === validEnv.META_APP_ID, false);
  assertOnlyInstagramPublishScopes(url);
  assert.equal(nextUrl.pathname, "/oauth/authorize/third_party/");
  assert.equal(nextUrl.searchParams.get("client_id"), IG_APP_ID);
  assert.equal(nextUrl.searchParams.get("redirect_uri"), "https://www.inmoradar.app/api/meta/oauth/callback");
  assert.equal(nextUrl.searchParams.get("scope"), "instagram_business_basic,instagram_business_content_publish");
  assert.equal(nextUrl.searchParams.get("response_type"), "code");
  assert.equal(nextUrl.searchParams.get("state"), "state");
  assert.equal(url.includes("facebook.com"), false);
  assert.equal(url.includes("api.instagram.com/oauth/authorize"), false);
  assert.equal(url.includes("www.instagram.com/oauth/authorize"), false);
  assert.deepEqual(scopes, ["instagram_business_basic", "instagram_business_content_publish"]);
});

test("OAuth Instagram fuerza scopes minimos aunque la URL oficial traiga mensajes comentarios o insights", async () => {
  const broadScope = "instagram_business_basic,instagram_business_manage_messages,instagram_manage_comments,instagram_business_content_publish,instagram_business_manage_insights";
  const officialUrl = `https://www.instagram.com/accounts/login/?force_reauth=true&client_id=${IG_APP_ID}&redirect_uri=${encodeURIComponent("https://example.com/wrong")}&response_type=code&platform_app_id=${OLD_IG_APP_ID}&scope=${encodeURIComponent(broadScope)}&logger_id=official-logger&next=${encodeURIComponent(`/oauth/authorize/third_party/?client_id=${OLD_IG_APP_ID}&redirect_uri=${encodeURIComponent("https://example.com/callback")}&response_type=code&scope=${encodeURIComponent(broadScope)}&config_id=official-config`)}`;
  const { url, scopes } = buildInstagramAuthorizationUrl({
    state: "state",
    env: { ...validEnv, INSTAGRAM_OFFICIAL_EMBED_URL: officialUrl }
  });
  const { parsed, nextUrl } = parseInstagramLoginUrl(url);

  assertCleanInstagramLoginTopLevel(url);
  assertOnlyInstagramPublishScopes(url);
  assert.equal(parsed.searchParams.has("logger_id"), false);
  assert.equal(nextUrl.searchParams.get("config_id"), "official-config");
  assert.equal(nextUrl.searchParams.get("client_id"), IG_APP_ID);
  assert.equal(nextUrl.searchParams.get("redirect_uri"), "https://www.inmoradar.app/api/meta/oauth/callback");
  assert.equal(nextUrl.searchParams.get("response_type"), "code");
  assert.deepEqual(scopes, IG_PUBLISH_SCOPES);

  const started = await callMetaOAuthStart("target=instagram", { ...validEnv, INSTAGRAM_OFFICIAL_EMBED_URL: officialUrl });
  assert.equal(started.statusCode, 200);
  assertCleanInstagramLoginTopLevel(started.payload.url);
  assertOnlyInstagramPublishScopes(started.payload.url);
  assert.deepEqual(started.payload.scopes, IG_PUBLISH_SCOPES);
});

test("OAuth Instagram conserva extras del next oficial y permite comparar diferencias", () => {
  const officialUrl = `https://www.instagram.com/accounts/login/?force_authentication&platform_app_id=${IG_APP_ID}&logger_id=official-logger&next=${encodeURIComponent(`/oauth/authorize/third_party/?config_id=official-config&client_id=${IG_APP_ID}&redirect_uri=${encodeURIComponent("https://example.com/callback")}&response_type=code&scope=instagram_business_basic%2Cinstagram_business_content_publish`)}`;
  const { url } = buildInstagramAuthorizationUrl({
    state: "state",
    env: { ...validEnv, INSTAGRAM_OFFICIAL_EMBED_URL: officialUrl }
  });
  const { parsed, nextUrl } = parseInstagramLoginUrl(url);
  assertCleanInstagramLoginTopLevel(url);
  assertOnlyInstagramPublishScopes(url);
  assert.equal(parsed.searchParams.has("logger_id"), false);
  assert.equal(parsed.searchParams.get("platform_app_id"), IG_APP_ID);
  assert.equal(nextUrl.searchParams.get("config_id"), "official-config");
  assert.equal(nextUrl.searchParams.get("client_id"), IG_APP_ID);
  assert.equal(nextUrl.searchParams.get("redirect_uri"), "https://www.inmoradar.app/api/meta/oauth/callback");
  assert.equal(nextUrl.searchParams.get("state"), "state");

  const summary = summarizeInstagramAuthorizationUrl(url);
  assert.equal(summary.path, "/accounts/login/");
  assert.equal(summary.next_path, "/oauth/authorize/third_party/");
  assert.match(summary.next_params.state, /\[present:5\]/);
  assert.equal(redactInstagramAuthorizationUrl(url).includes("state"), true);
  const diffs = diffInstagramAuthorizationUrls(url, officialUrl);
  assert.ok(diffs.some((item) => item.field === "next_params.redirect_uri"));
  assert.ok(diffs.some((item) => item.field === "next_params.state"));
});

test("OAuth Instagram puede mover state a cookie si la URL oficial no acepta state", async () => {
  assert.equal(instagramOAuthStateMode({ ...validEnv, INSTAGRAM_OAUTH_STATE_MODE: "cookie" }), "cookie");
  const { statusCode, headers } = await callMetaOAuthStartRedirect("", { ...validEnv, INSTAGRAM_OAUTH_STATE_MODE: "cookie" });
  assert.equal(statusCode, 302);
  const { nextUrl } = parseInstagramLoginUrl(headers.location);
  assert.equal(nextUrl.searchParams.has("state"), false);
  const cookie = Array.isArray(headers["set-cookie"]) ? headers["set-cookie"].join(";") : String(headers["set-cookie"] || "");
  assert.match(cookie, /inmoradar_meta_oauth_state=/);
  const encodedState = cookie.match(/inmoradar_meta_oauth_state=([^;]+)/)?.[1] || "";
  const decoded = decodeOrganicOAuthState(decodeURIComponent(encodedState), validEnv, { now: Date.now() });
  assert.equal(decoded.target, "instagram");
});

test("intercambio Instagram Login usa api.instagram.com y secreto Instagram", async () => {
  const calls = [];
  const token = await exchangeInstagramAuthorizationCode({
    code: "ig-code",
    env: validEnv,
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      if (url === "https://api.instagram.com/oauth/access_token") {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            access_token: "short-ig-token",
            user_id: "1784143546309305",
            scope: "instagram_business_basic,instagram_business_content_publish"
          })
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ access_token: "long-ig-token", token_type: "bearer", expires_in: 5184000 })
      };
    }
  });
  const body = new URLSearchParams(calls[0].options.body);
  assert.equal(calls[0].url, "https://api.instagram.com/oauth/access_token");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(body.get("client_id"), IG_APP_ID);
  assert.equal(body.get("client_secret"), "instagram-app-secret");
  assert.equal(body.get("client_secret") === validEnv.META_APP_SECRET, false);
  assert.equal(body.get("redirect_uri"), "https://www.inmoradar.app/api/meta/oauth/callback");
  assert.match(calls[1].url, /^https:\/\/graph\.instagram\.com\/access_token\?/);
  assert.equal(token.access_token, "long-ig-token");
  assert.equal(token.user_id, "1784143546309305");
  assert.deepEqual(token.scopes, ["instagram_business_basic", "instagram_business_content_publish"]);
});

test("acepta scopes legacy de Instagram como equivalentes para status", () => {
  const missing = missingRequiredScopes([
    "pages_show_list",
    "pages_read_engagement",
    "pages_manage_posts",
    "instagram_basic",
    "instagram_content_publish"
  ]);
  assert.deepEqual(missing, []);
});

test("imagen por defecto para Meta es publica y statuses incluyen skipped y failed", () => {
  assert.equal(defaultBrandImageUrl(validEnv), "https://www.inmoradar.app/assets/inmoradar-brand-mark.jpg");
  assert.equal(imageUrlForLanding(expensiveLanding, "instagram", validEnv), "https://www.inmoradar.app/assets/inmoradar-brand-mark.jpg");
  assert.ok(META_POST_STATUSES.includes("skipped"));
  assert.ok(META_POST_STATUSES.includes("failed"));
});

test("sanea payloads Meta para no devolver tokens", () => {
  const clean = sanitizeMetaPayload({ id: "1", access_token: "secret", nested: { app_secret: "nope", ok: true } });
  assert.equal(clean.id, "1");
  assert.equal(clean.access_token, undefined);
  assert.equal(clean.nested.app_secret, undefined);
  assert.equal(clean.nested.ok, true);
});

test("sanea mensajes de error que incluyan tokens", async () => {
  const token = "EAAB" + "x".repeat(80);
  const cleanMessage = sanitizeSecretText(`Meta error access_token=${token} authorization: bearer ${token}`);
  assert.equal(cleanMessage.includes(token), false);
  assert.match(cleanMessage, /\[redacted\]/);

  await assert.rejects(
    () => publishFacebookPost({
      accessToken: token,
      pageId: "123",
      caption: "caption",
      link: "https://www.inmoradar.app/?utm_source=facebook",
      env: validEnv,
      fetchImpl: async () => ({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ error: { message: `bad access_token=${token}` } })
      })
    }),
    (error) => {
      assert.equal(String(error.message).includes(token), false);
      assert.match(error.message, /access_token=\[redacted\]/);
      return true;
    }
  );
});

test("valida variables requeridas para spike organica Meta", () => {
  const ok = validateMetaOrganicEnv(validEnv);
  assert.equal(ok.ok, true);
  assert.equal(ok.target, "instagram");
  assert.equal(ok.redirect_uri, "https://www.inmoradar.app/api/meta/oauth/callback");
  assert.equal(ok.facebook_page_id, "123");
  assert.equal(ok.instagram_account_id, "456");

  const facebook = validateMetaOrganicEnv(validEnv, { target: "facebook" });
  assert.equal(facebook.ok, true);
  assert.equal(facebook.target, "facebook");
  assert.equal(facebook.redirect_uri, "https://www.inmoradar.app/api/meta/oauth/callback");

  const missing = validateMetaOrganicEnv({ META_APP_ID: "app" });
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.missing, ["INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET", "INSTAGRAM_REDIRECT_URI"]);

  const missingFacebook = validateMetaOrganicEnv({ META_APP_ID: "app", META_REDIRECT_URI: "https://www.inmoradar.app/api/meta/oauth/callback" }, { target: "facebook" });
  assert.equal(missingFacebook.ok, false);
  assert.deepEqual(missingFacebook.missing, ["META_APP_SECRET"]);
});

test("construye payloads de publicacion organica de prueba", () => {
  const facebook = buildFacebookOrganicTestPost(validEnv);
  assert.equal(facebook.platform, "facebook");
  assert.equal(facebook.link, "https://www.inmoradar.app");
  assert.match(facebook.caption, /publicacion automatica de InmoRadar/);

  const instagram = buildInstagramOrganicTestPost(validEnv);
  assert.equal(instagram.platform, "instagram");
  assert.match(instagram.caption, /Analiza pisos antes de contactar/);
  assert.equal(instagram.image_url, "https://www.inmoradar.app/assets/inmoradar-brand-mark.jpg");
});

test("firma state OAuth organico sin exponer secretos", () => {
  const state = encodeOrganicOAuthState({ returnTo: "/backoffice/marketing/meta", issuedAt: 1770000000000, nonce: "nonce" }, validEnv);
  const decoded = decodeOrganicOAuthState(state, validEnv, { now: 1770000000000 });
  assert.equal(decoded.returnTo, "/backoffice/marketing/meta");
  assert.equal(decoded.nonce, "nonce");
  assert.equal(decoded.target, "instagram");
  assert.equal(maskSecret("abc123456789xyz"), "abc123...9xyz");
  assert.throws(() => decodeOrganicOAuthState(`${state}x`, validEnv, { now: 1770000000000 }), /meta_oauth_state_invalid/);
});

test("OAuth organico por defecto no pide scopes legacy ni Page scopes", async () => {
  const { statusCode, payload } = await callMetaOAuthStart();
  assert.equal(statusCode, 200);
  const { parsed, nextUrl } = parseInstagramLoginUrl(payload.url);
  const scope = nextUrl.searchParams.get("scope");
  assert.equal(parsed.origin, "https://www.instagram.com");
  assert.equal(parsed.pathname, "/accounts/login/");
  assert.equal(parsed.searchParams.has("force_authentication"), true);
  assert.equal(parsed.searchParams.get("platform_app_id"), IG_APP_ID);
  assert.equal(nextUrl.pathname, "/oauth/authorize/third_party/");
  assert.equal(nextUrl.searchParams.get("client_id"), IG_APP_ID);
  assert.equal(payload.url.includes("facebook.com"), false);
  assert.equal(payload.url.includes("api.instagram.com/oauth/authorize"), false);
  assert.equal(payload.url.includes("www.instagram.com/oauth/authorize"), false);
  assert.equal(scope, "instagram_business_basic,instagram_business_content_publish");
  assert.equal(scope.includes("instagram_basic"), false);
  assert.equal(scope.includes("instagram_content_publish"), false);
  assert.equal(scope.includes("pages_manage_posts"), false);
  assert.deepEqual(payload.scopes, ["instagram_business_basic", "instagram_business_content_publish"]);
  assert.equal(payload.provider, "instagram");
});

test("OAuth organico usa INSTAGRAM_APP_ID desde env y no fallback", async () => {
  const logs = [];
  const originalLog = console.log;
  console.log = (message, ...args) => {
    logs.push([message, ...args].map((entry) => String(entry)).join(" "));
  };
  try {
    const { statusCode, payload } = await callMetaOAuthStart();
    assert.equal(statusCode, 200);
    assertCleanInstagramLoginTopLevel(payload.url);
    assert.equal(decodeURIComponent(payload.url).includes(OLD_IG_APP_ID), false);
  } finally {
    console.log = originalLog;
  }
  assert.ok(logs.some((line) => line.includes("instagram_app_id_source=env fallback=none")));
});

test("OAuth organico falla claro si falta INSTAGRAM_APP_ID", async () => {
  const { statusCode, payload } = await callMetaOAuthStart("", { ...validEnv, INSTAGRAM_APP_ID: undefined });
  assert.equal(statusCode, 500);
  assert.equal(payload.error, "meta_oauth_not_configured");
  assert.ok(payload.missing.includes("INSTAGRAM_APP_ID"));
});

test("OAuth organico solo activa legacy con flag explicito", async () => {
  assert.deepEqual(metaOrganicOAuthScopes({ env: validEnv }), ["instagram_business_basic", "instagram_business_content_publish"]);
  assert.deepEqual(
    metaOrganicOAuthScopes({ env: { ...validEnv, META_ENABLE_LEGACY_INSTAGRAM_SCOPES: "true" } }),
    ["instagram_basic", "instagram_content_publish"]
  );

  const { payload } = await callMetaOAuthStart("", { ...validEnv, META_ENABLE_LEGACY_INSTAGRAM_SCOPES: "true" });
  const { nextUrl } = parseInstagramLoginUrl(payload.url);
  const scope = nextUrl.searchParams.get("scope");
  assert.equal(scope, "instagram_basic,instagram_content_publish");
});

test("OAuth organico Facebook Page queda en flujo separado", async () => {
  const { payload } = await callMetaOAuthStart("target=facebook");
  const parsed = new URL(payload.url);
  const scope = parsed.searchParams.get("scope");
  assert.match(payload.url, /facebook\.com\/v23\.0\/dialog\/oauth/);
  assert.equal(parsed.searchParams.get("client_id"), "meta-app-id");
  assert.equal(scope, "pages_show_list,pages_read_engagement,pages_manage_posts");
  assert.equal(scope.includes("instagram_business_basic"), false);
  assert.equal(scope.includes("instagram_business_content_publish"), false);
  assert.equal(payload.target, "facebook");
  assert.equal(payload.provider, "facebook");
});

test("OAuth organico no mezcla scopes aunque pidan target meta/all", async () => {
  const { payload } = await callMetaOAuthStart("target=meta");
  const { parsed, nextUrl } = parseInstagramLoginUrl(payload.url);
  const scope = nextUrl.searchParams.get("scope");
  assert.equal(payload.target, "instagram");
  assert.equal(parsed.origin, "https://www.instagram.com");
  assert.equal(parsed.pathname, "/accounts/login/");
  assert.equal(parsed.searchParams.get("platform_app_id"), IG_APP_ID);
  assert.equal(payload.url.includes("api.instagram.com/oauth/authorize"), false);
  assert.equal(payload.url.includes("www.instagram.com/oauth/authorize"), false);
  assert.equal(scope, "instagram_business_basic,instagram_business_content_publish");
  assert.equal(scope.includes("pages_show_list"), false);
  assert.equal(scope.includes("pages_manage_posts"), false);
});

test("BackOffice conecta Instagram con target explicito y sin endpoint legacy", () => {
  const adminHtml = fs.readFileSync(path.join(__dirname, "..", "admin.html"), "utf8");
  const adminJs = fs.readFileSync(path.join(__dirname, "..", "assets", "admin.js"), "utf8");

  assert.match(adminHtml, /data-meta-connect-target="instagram"[^>]*>Conectar Instagram<\/button>/);
  assert.match(adminHtml, /data-meta-connect-target="facebook"[^>]*>Conectar Facebook Page<\/button>/);
  assert.doesNotMatch(adminHtml, />Conectar Meta<\/button>/);
  assert.match(adminJs, /\/api\/meta\/oauth\/start\?target=/);
  assert.match(adminJs, /dataset\.metaConnectTarget \|\| "instagram"/);
  assert.doesNotMatch(adminJs, /\/api\/admin\?resource=meta\/connect/);
  assert.match(adminJs, /adminPreviewAuthMessage/);
  assert.match(adminJs, /metaOrganicStatusErrorPayload/);
});

test("Meta organic status usa la misma proteccion admin que BackOffice", async () => {
  const envWithoutSupabase = {
    ...validEnv,
    SUPABASE_URL: undefined,
    SUPABASE_SERVICE_ROLE_KEY: undefined
  };

  const metaStatus = await callAdminResource("meta/status", {}, envWithoutSupabase);
  const adminSummary = await callAdminResource("summary", {}, envWithoutSupabase);
  assert.equal(metaStatus.statusCode, 401);
  assert.equal(metaStatus.payload.error, "unauthorized");
  assert.equal(adminSummary.statusCode, 401);
  assert.equal(adminSummary.payload.error, "unauthorized");

  const authorizedMetaStatus = await callAdminResource(
    "meta/status",
    { authorization: "Bearer admin-test-token" },
    envWithoutSupabase
  );
  assert.equal(authorizedMetaStatus.statusCode, 500);
  assert.equal(authorizedMetaStatus.payload.error, "supabase_not_configured");
});

test("endpoint legacy meta/connect queda blindado a Instagram-only por defecto", async () => {
  const { statusCode, payload } = await callLegacyMetaConnect("scopes=pages_show_list,instagram_basic,instagram_content_publish");
  assert.equal(statusCode, 200);
  const { parsed, nextUrl } = parseInstagramLoginUrl(payload.url);
  const scope = nextUrl.searchParams.get("scope");
  assert.equal(parsed.origin, "https://www.instagram.com");
  assert.equal(parsed.searchParams.get("platform_app_id"), IG_APP_ID);
  assert.equal(nextUrl.searchParams.get("client_id"), IG_APP_ID);
  assert.equal(payload.url.includes("api.instagram.com/oauth/authorize"), false);
  assert.equal(payload.url.includes("www.instagram.com/oauth/authorize"), false);
  assert.equal(scope, "instagram_business_basic,instagram_business_content_publish");
  assert.equal(scope.includes("pages_show_list"), false);
  assert.equal(scope.includes("instagram_basic"), false);
  assert.equal(scope.includes("instagram_content_publish"), false);
  assert.equal(payload.target, "instagram");
});
