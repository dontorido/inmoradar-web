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

async function callAdminMethodResource(resource, { method = "GET", query = "", body = {}, headers = {}, env = validEnv } = {}) {
  return withEnv({ ADMIN_IMPORT_TOKEN: "admin-test-token", ...env }, async () => {
    const { res, payload } = createJsonResponse();
    await adminHandler({
      method,
      url: `/api/admin?resource=${encodeURIComponent(resource)}${query ? `&${query.replace(/^&/, "")}` : ""}`,
      headers: { authorization: "Bearer admin-test-token", host: "www.inmoradar.app", ...headers },
      body
    }, res);
    return { statusCode: res.statusCode, payload: payload() };
  });
}

async function callAdminPostResource(resource, body = {}, headers = {}, env = validEnv) {
  return withEnv({ ADMIN_IMPORT_TOKEN: "admin-test-token", ...env }, async () => {
    const { res, payload } = createJsonResponse();
    await adminHandler({
      method: "POST",
      url: `/api/admin?resource=${encodeURIComponent(resource)}`,
      headers: { authorization: "Bearer admin-test-token", host: "www.inmoradar.app", ...headers },
      body
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

test("Meta autopublisher desactivado sale antes de consultar tablas", async () => {
  const previousFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async (url) => {
    fetchCalls += 1;
    throw new Error(`unexpected_fetch:${String(url)}`);
  };

  try {
    const result = await callAdminPostResource("meta/autopublisher/run", {}, {}, {
      ...validEnv,
      META_AUTOPOST_ENABLED: "false",
      SUPABASE_URL: "https://supabase.test",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test"
    });

    assert.equal(result.statusCode, 200);
    assert.equal(result.payload.ok, true);
    assert.equal(result.payload.skipped, true);
    assert.equal(result.payload.reason, "autopost_disabled");
    assert.equal(result.payload.status, "skipped");
    assert.equal(result.payload.published_count, 0);
    assert.equal(result.payload.failed_count, 0);
    assert.equal(result.payload.error_message, "autopost_disabled");
    assert.equal(fetchCalls, 0);
  } finally {
    global.fetch = previousFetch;
  }
});

test("Meta autopublisher activado puede devolver table_missing", async () => {
  const previousFetch = global.fetch;
  const fetchCalls = [];
  global.fetch = async (url, options = {}) => {
    const href = String(url);
    const method = options.method || "GET";
    fetchCalls.push({ href, method });
    if (href.includes("/meta_autopublisher_runs") && method === "POST") {
      return { ok: true, status: 200, text: async () => JSON.stringify([{ id: "run_1" }]) };
    }
    if (href.includes("/marketing_meta_settings?")) {
      return { ok: false, status: 404, text: async () => "marketing_meta_settings missing" };
    }
    if (href.includes("/meta_autopublisher_runs?id=eq.run_1") && method === "PATCH") {
      return { ok: true, status: 200, text: async () => JSON.stringify([{ id: "run_1", status: "skipped" }]) };
    }
    throw new Error(`unexpected_fetch:${href}`);
  };

  try {
    const result = await callAdminPostResource("meta/autopublisher/run", {}, {}, {
      ...validEnv,
      META_AUTOPOST_ENABLED: "true",
      SUPABASE_URL: "https://supabase.test",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test"
    });

    assert.equal(result.statusCode, 200);
    assert.equal(result.payload.ok, true);
    assert.equal(result.payload.skipped, true);
    assert.equal(result.payload.reason, "table_missing");
    assert.equal(result.payload.status, "skipped");
    assert.equal(result.payload.error_message, "table_missing");
    assert.equal(fetchCalls.some((call) => call.href.includes("/marketing_meta_settings?")), true);
    assert.equal(fetchCalls.some((call) => call.href.includes("/marketing_meta_posts?")), false);
  } finally {
    global.fetch = previousFetch;
  }
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
    /meta_instagram_public_https_image_required/
  );

  await assert.rejects(
    () => publishInstagramPost({
      accessToken: "page-token",
      instagramBusinessAccountId: "456",
      caption: "caption",
      imageUrl: "http://www.inmoradar.app/assets/inmoradar-brand-mark.jpg",
      env: validEnv,
      fetchImpl: async () => ({ ok: true, status: 200, text: async () => "{}" })
    }),
    /meta_instagram_public_https_image_required/
  );

  await assert.rejects(
    () => publishInstagramPost({
      accessToken: "page-token",
      instagramBusinessAccountId: "456",
      caption: "caption",
      imageUrl: "https://inmoradar-web-git-feature-meta.vercel.app/assets/inmoradar-brand-mark.jpg",
      env: validEnv,
      fetchImpl: async () => ({ ok: true, status: 200, text: async () => "{}" })
    }),
    /meta_instagram_public_https_image_required/
  );
});

test("publica Instagram con /me en Graph Instagram y token de Instagram Login", async () => {
  const calls = [];
  const waits = [];
  const result = await publishInstagramPost({
    accessToken: "ig-user-token",
    instagramBusinessAccountId: "",
    caption: "caption",
    imageUrl: "https://www.inmoradar.app/assets/inmoradar-brand-mark.jpg",
    env: validEnv,
    sleepImpl: async (ms) => waits.push(ms),
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, body: options.body });
      if (url.includes("/me?")) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ id: "26828053596835680", user_id: "1784143546309305", username: "inmoradares", account_type: "BUSINESS" }) };
      }
      if (url.includes("/media_publish")) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ id: "ig-media-id" }) };
      }
      if (url.includes("/ig-media-id")) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ id: "ig-media-id", permalink: "https://www.instagram.com/p/test/" }) };
      }
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: "ig-container-id" }) };
    }
  });
  assert.match(calls[0].url, /^https:\/\/graph\.instagram\.com\/v23\.0\/me\?fields=id%2Cusername%2Caccount_type%2Cuser_id/);
  assert.match(calls[1].url, /^https:\/\/graph\.instagram\.com\/v23\.0\/me\/media/);
  assert.match(calls[2].url, /^https:\/\/graph\.instagram\.com\/v23\.0\/me\/media_publish/);
  assert.match(calls[1].body, /access_token=ig-user-token/);
  assert.equal(result.external_post_id, "ig-media-id");
  assert.equal(result.published_url, "https://www.instagram.com/p/test/");
  assert.equal(result.meta_response.instagram_profile.id, "26828053596835680");
  assert.equal(result.meta_response.instagram_profile.user_id, "1784143546309305");
  assert.equal(result.meta_response.instagram_profile.username, "inmoradares");
  assert.equal(result.meta_response.publishing_user_id, "1784143546309305");
  assert.equal(result.meta_response.publish_target, "me");
  assert.equal(result.meta_response.creation_id, "ig-container-id");
  assert.equal(result.meta_response.published_media_id, "ig-media-id");
  assert.equal(result.meta_response.status, "success");
  assert.equal(result.meta_response.final_stage, "publish_media_container");
  assert.deepEqual(waits, [2000]);
});

test("Instagram permite INSTAGRAM_PUBLISH_ACCOUNT_ID explicito tras diagnostico /me", async () => {
  const calls = [];
  await publishInstagramPost({
    accessToken: "ig-user-token",
    instagramBusinessAccountId: "26828053596835680",
    caption: "caption",
    imageUrl: "https://www.inmoradar.app/assets/inmoradar-brand-mark.jpg",
    env: { ...validEnv, INSTAGRAM_PUBLISH_ACCOUNT_ID: "explicit-publish-id" },
    sleepImpl: async () => {},
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, body: options.body });
      if (url.includes("/me?")) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ id: "26828053596835680", user_id: "1784143546309305", username: "inmoradares", account_type: "BUSINESS" }) };
      }
      if (url.includes("/explicit-publish-id/media_publish")) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ id: "ig-media-id" }) };
      }
      if (url.includes("/ig-media-id")) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ id: "ig-media-id" }) };
      }
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: "ig-container-id" }) };
    }
  });
  assert.match(calls[0].url, /^https:\/\/graph\.instagram\.com\/v23\.0\/me\?/);
  assert.match(calls[1].url, /^https:\/\/graph\.instagram\.com\/v23\.0\/explicit-publish-id\/media/);
  assert.match(calls[2].url, /^https:\/\/graph\.instagram\.com\/v23\.0\/explicit-publish-id\/media_publish/);
});

test("Instagram reintenta media_publish si el container aun no esta listo y registra exito", async () => {
  const calls = [];
  const waits = [];
  let publishAttempts = 0;
  const result = await publishInstagramPost({
    accessToken: "ig-user-token",
    instagramBusinessAccountId: "26828053596835680",
    caption: "caption",
    imageUrl: "https://www.inmoradar.app/assets/inmoradar-brand-mark.jpg",
    env: validEnv,
    sleepImpl: async (ms) => waits.push(ms),
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, body: options.body });
      if (url.includes("/me?")) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ id: "26828053596835680", user_id: "17841443546309305", username: "inmoradares", account_type: "BUSINESS" }) };
      }
      if (url.includes("/media_publish")) {
        publishAttempts += 1;
        if (publishAttempts < 3) {
          return {
            ok: false,
            status: 400,
            text: async () => JSON.stringify({
              error: {
                message: "Media ID is not available",
                code: 9007,
                error_subcode: 2207027,
                error_user_msg: "The media is not ready for publishing, please wait for a moment"
              }
            })
          };
        }
        return { ok: true, status: 200, text: async () => JSON.stringify({ id: "ig-media-id" }) };
      }
      if (url.includes("/ig-media-id")) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ id: "ig-media-id", permalink: "https://www.instagram.com/p/test/" }) };
      }
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: "ig-container-id" }) };
    }
  });
  assert.equal(publishAttempts, 3);
  assert.deepEqual(waits, [2000, 4000, 6000]);
  assert.equal(result.external_post_id, "ig-media-id");
  assert.equal(result.meta_response.publish_attempts, 3);
  assert.equal(result.meta_response.status, "success");
  assert.equal(result.meta_response.published_media_id, "ig-media-id");
  assert.equal(calls.filter((call) => call.url.includes("/media_publish")).length, 3);
});

test("Instagram no reintenta media_publish para errores no transitorios", async () => {
  const waits = [];
  let publishAttempts = 0;
  await assert.rejects(
    () => publishInstagramPost({
      accessToken: "ig-user-token",
      instagramBusinessAccountId: "26828053596835680",
      caption: "caption",
      imageUrl: "https://www.inmoradar.app/assets/inmoradar-brand-mark.jpg",
      env: validEnv,
      sleepImpl: async (ms) => waits.push(ms),
      fetchImpl: async (url) => {
        if (url.includes("/me?")) {
          return { ok: true, status: 200, text: async () => JSON.stringify({ id: "26828053596835680", user_id: "17841443546309305", username: "inmoradares", account_type: "BUSINESS" }) };
        }
        if (url.includes("/media_publish")) {
          publishAttempts += 1;
          return {
            ok: false,
            status: 400,
            text: async () => JSON.stringify({ error: { message: "Permission denied", code: 10 } })
          };
        }
        return { ok: true, status: 200, text: async () => JSON.stringify({ id: "ig-container-id" }) };
      }
    }),
    (error) => {
      assert.match(error.message, /meta_instagram_publish_failed_400:publish_media_container:Permission denied/);
      assert.equal(error.meta_response.error_code, 10);
      return true;
    }
  );
  assert.equal(publishAttempts, 1);
  assert.deepEqual(waits, [2000]);
});

test("Instagram agota retries si media_publish sigue sin estar listo", async () => {
  const token = "IGQ" + "z".repeat(120);
  const waits = [];
  let publishAttempts = 0;
  await assert.rejects(
    () => publishInstagramPost({
      accessToken: token,
      instagramBusinessAccountId: "26828053596835680",
      caption: "caption",
      imageUrl: "https://www.inmoradar.app/assets/inmoradar-brand-mark.jpg",
      env: validEnv,
      sleepImpl: async (ms) => waits.push(ms),
      fetchImpl: async (url) => {
        if (url.includes("/me?")) {
          return { ok: true, status: 200, text: async () => JSON.stringify({ id: "26828053596835680", user_id: "17841443546309305", username: "inmoradares", account_type: "BUSINESS" }) };
        }
        if (url.includes("/media_publish")) {
          publishAttempts += 1;
          return {
            ok: false,
            status: 400,
            text: async () => JSON.stringify({
              error: {
                message: `The media is not ready for publishing access_token=${token}`,
                code: 9007,
                error_subcode: 2207027
              }
            })
          };
        }
        return { ok: true, status: 200, text: async () => JSON.stringify({ id: "ig-container-id" }) };
      }
    }),
    (error) => {
      assert.equal(error.message, "meta_instagram_publish_failed_400:publish_media_container:media_not_ready_after_retries");
      assert.equal(error.message.includes(token), false);
      assert.equal(JSON.stringify(error.meta_response).includes(token), false);
      assert.equal(error.meta_response.stage, "publish_media_container");
      assert.equal(error.meta_response.error_code, 9007);
      assert.equal(error.meta_response.error_subcode, 2207027);
      assert.equal(error.meta_response.error_message, "media_not_ready_after_retries");
      return true;
    }
  );
  assert.equal(publishAttempts, 3);
  assert.deepEqual(waits, [2000, 4000, 6000]);
});

test("Instagram sanea errores de create_media_container y no loguea tokens", async () => {
  const token = "IGQ" + "x".repeat(120);
  const logs = [];
  const previousWarn = console.warn;
  const previousLog = console.log;
  console.warn = (message) => logs.push(String(message));
  console.log = (message) => logs.push(String(message));
  try {
    await assert.rejects(
      () => publishInstagramPost({
        accessToken: token,
        instagramBusinessAccountId: "26828053596835680",
        caption: "caption",
        imageUrl: "https://www.inmoradar.app/assets/inmoradar-brand-mark.jpg",
        env: validEnv,
        fetchImpl: async (url) => {
          if (url.includes("/me?")) {
            return { ok: true, status: 200, text: async () => JSON.stringify({ id: "26828053596835680", user_id: "1784143546309305", username: "inmoradares", account_type: "BUSINESS" }) };
          }
          return {
            ok: false,
            status: 400,
            text: async () => JSON.stringify({ error: { message: `Unsupported post request access_token=${token}`, code: 100 } })
          };
        }
      }),
      (error) => {
        assert.match(error.message, /meta_instagram_publish_failed_400:create_media_container:/);
        assert.equal(error.message.includes(token), false);
        assert.equal(JSON.stringify(error.meta_response).includes(token), false);
        assert.equal(error.meta_response.stage, "create_media_container");
        assert.equal(error.meta_response.status, 400);
        assert.match(error.meta_response.endpoint, /^https:\/\/graph\.instagram\.com\/v23\.0\/me\/media/);
        return true;
      }
    );
    assert.equal(logs.join("\n").includes(token), false);
    assert.match(logs.join("\n"), /create_media_container/);
  } finally {
    console.warn = previousWarn;
    console.log = previousLog;
  }
});

test("publish-test Instagram guarda diagnostico saneado sin tocar Facebook Page", async () => {
  const previousFetch = global.fetch;
  const token = "IGQ" + "y".repeat(120);
  const env = {
    ...validEnv,
    SUPABASE_URL: "https://supabase.test",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-test"
  };
  const encrypted = encryptToken(token, env);
  const connection = {
    ...validConnection,
    id: "connection_1",
    status: "connected",
    instagram_business_account_id: "26828053596835680",
    scopes: [...IG_PUBLISH_SCOPES],
    access_token_encrypted: encrypted,
    user_access_token_encrypted: encrypted,
    page_access_token_encrypted: null,
    last_error: null
  };
  const fetchedUrls = [];
  let insertedPost = null;
  let patchedConnection = null;

  global.fetch = async (url, options = {}) => {
    const href = String(url);
    fetchedUrls.push(href);
    if (href.includes("/marketing_meta_posts") && options.method === "POST") {
      insertedPost = JSON.parse(options.body)[0];
      return { ok: true, status: 201, text: async () => JSON.stringify([{ id: "post_1", ...insertedPost }]) };
    }
    if (href.includes("/marketing_meta_connections?id=") && options.method === "PATCH") {
      patchedConnection = JSON.parse(options.body);
      return { ok: true, status: 200, text: async () => JSON.stringify([{ ...connection, ...patchedConnection }]) };
    }
    if (href.includes("/marketing_meta_connections?")) {
      return { ok: true, status: 200, text: async () => JSON.stringify([connection]) };
    }
    if (href.startsWith("https://graph.instagram.com/v23.0/me?")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: "26828053596835680", user_id: "1784143546309305", username: "inmoradares", account_type: "BUSINESS" }) };
    }
    if (href.startsWith("https://graph.instagram.com/v23.0/me/media")) {
      return {
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ error: { message: `Unsupported post request access_token=${token}`, code: 100 } })
      };
    }
    throw new Error(`unexpected_fetch:${href}`);
  };

  try {
    const result = await callAdminPostResource("meta/publish-test-instagram", {}, {}, env);
    assert.equal(result.statusCode, 400);
    assert.match(result.payload.message, /meta_instagram_publish_failed_400:create_media_container:/);
    assert.equal(JSON.stringify(result.payload).includes(token), false);
    assert.equal(insertedPost.status, "failed");
    assert.equal(insertedPost.meta_response.stage, "create_media_container");
    assert.equal(insertedPost.meta_response.instagram_profile.id, "26828053596835680");
    assert.equal(insertedPost.meta_response.instagram_profile.user_id, "1784143546309305");
    assert.equal(JSON.stringify(insertedPost).includes(token), false);
    assert.equal(patchedConnection.status, "connected");
    assert.equal(patchedConnection.instagram_business_account_id, "1784143546309305");
    assert.match(patchedConnection.last_error, /create_media_container/);
    assert.equal(fetchedUrls.some((href) => href.includes("graph.facebook.com") || href.includes("/feed")), false);
  } finally {
    global.fetch = previousFetch;
  }
});

test("publish-test Instagram guarda last_error saneado cuando agota retries de media_publish", async () => {
  const previousFetch = global.fetch;
  const token = "IGQ" + "r".repeat(120);
  const env = {
    ...validEnv,
    SUPABASE_URL: "https://supabase.test",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
    INSTAGRAM_PUBLISH_RETRY_DELAYS_MS: "0,0,0"
  };
  const encrypted = encryptToken(token, env);
  const connection = {
    ...validConnection,
    id: "connection_1",
    status: "connected",
    instagram_business_account_id: "26828053596835678",
    scopes: [...IG_PUBLISH_SCOPES],
    access_token_encrypted: encrypted,
    user_access_token_encrypted: encrypted,
    page_access_token_encrypted: null,
    last_error: null
  };
  let insertedPost = null;
  let patchedConnection = null;
  let publishAttempts = 0;

  global.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.includes("/marketing_meta_posts") && options.method === "POST") {
      insertedPost = JSON.parse(options.body)[0];
      return { ok: true, status: 201, text: async () => JSON.stringify([{ id: "post_1", ...insertedPost }]) };
    }
    if (href.includes("/marketing_meta_connections?id=") && options.method === "PATCH") {
      patchedConnection = JSON.parse(options.body);
      return { ok: true, status: 200, text: async () => JSON.stringify([{ ...connection, ...patchedConnection }]) };
    }
    if (href.includes("/marketing_meta_connections?")) {
      return { ok: true, status: 200, text: async () => JSON.stringify([connection]) };
    }
    if (href.startsWith("https://graph.instagram.com/v23.0/me?")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: "26828053596835678", user_id: "17841443546309305", username: "inmoradares", account_type: "BUSINESS" }) };
    }
    if (href.startsWith("https://graph.instagram.com/v23.0/me/media_publish")) {
      publishAttempts += 1;
      return {
        ok: false,
        status: 400,
        text: async () => JSON.stringify({
          error: {
            message: `Media ID is not available access_token=${token}`,
            code: 9007,
            error_subcode: 2207027,
            error_user_msg: "The media is not ready for publishing, please wait for a moment"
          }
        })
      };
    }
    if (href.startsWith("https://graph.instagram.com/v23.0/me/media")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: "ig-container-id" }) };
    }
    throw new Error(`unexpected_fetch:${href}`);
  };

  try {
    const result = await callAdminPostResource("meta/publish-test-instagram", {}, {}, env);
    assert.equal(result.statusCode, 400);
    assert.equal(result.payload.message, "meta_instagram_publish_failed_400:publish_media_container:media_not_ready_after_retries");
    assert.equal(result.payload.message.includes(token), false);
    assert.equal(insertedPost.status, "failed");
    assert.equal(insertedPost.error_message, "meta_instagram_publish_failed_400:publish_media_container:media_not_ready_after_retries");
    assert.equal(insertedPost.meta_response.stage, "publish_media_container");
    assert.equal(insertedPost.meta_response.creation_id, "ig-container-id");
    assert.equal(insertedPost.meta_response.error_message, "media_not_ready_after_retries");
    assert.equal(JSON.stringify(insertedPost).includes(token), false);
    assert.equal(patchedConnection.status, "connected");
    assert.equal(patchedConnection.last_error, "meta_instagram_publish_failed_400:publish_media_container:media_not_ready_after_retries");
    assert.equal(patchedConnection.last_error.includes(token), false);
    assert.equal(publishAttempts, 3);
  } finally {
    global.fetch = previousFetch;
  }
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
  assert.equal(calls[0].options.headers["content-type"], "application/x-www-form-urlencoded");
  assert.equal(body.get("client_id"), IG_APP_ID);
  assert.equal(body.get("client_secret"), "instagram-app-secret");
  assert.equal(body.get("client_secret") === validEnv.META_APP_SECRET, false);
  assert.equal(body.get("grant_type"), "authorization_code");
  assert.equal(body.get("redirect_uri"), "https://www.inmoradar.app/api/meta/oauth/callback");
  assert.equal(body.get("code"), "ig-code");
  assert.match(calls[1].url, /^https:\/\/graph\.instagram\.com\/access_token\?/);
  assert.equal(token.access_token, "long-ig-token");
  assert.equal(token.user_id, "1784143546309305");
  assert.deepEqual(token.scopes, ["instagram_business_basic", "instagram_business_content_publish"]);
});

test("intercambio Instagram Login registra error 400 saneado sin secretos", async () => {
  const code = "ig-code-secret-value";
  const appSecret = "instagram-app-secret";
  const accessToken = "EAAB" + "x".repeat(80);
  const logs = [];
  const originalError = console.error;
  console.error = (message, ...args) => {
    logs.push([message, ...args].map((entry) => String(entry)).join(" "));
  };

  try {
    await assert.rejects(
      () => exchangeInstagramAuthorizationCode({
        code,
        env: { ...validEnv, INSTAGRAM_APP_SECRET: appSecret },
        fetchImpl: async (url, options = {}) => {
          const body = new URLSearchParams(options.body);
          assert.equal(url, "https://api.instagram.com/oauth/access_token");
          assert.equal(options.method, "POST");
          assert.equal(options.headers["content-type"], "application/x-www-form-urlencoded");
          assert.equal(body.get("client_id"), IG_APP_ID);
          assert.equal(body.get("client_secret"), appSecret);
          assert.equal(body.get("grant_type"), "authorization_code");
          assert.equal(body.get("redirect_uri"), validEnv.INSTAGRAM_REDIRECT_URI);
          assert.equal(body.get("code"), code);
          return {
            ok: false,
            status: 400,
            text: async () => JSON.stringify({
              error_type: "OAuthException",
              error_message: `Invalid authorization code ${code} with secret ${appSecret}`,
              error_code: 400,
              access_token: accessToken,
              refresh_token: "refresh-token-secret"
            })
          };
        }
      }),
      (error) => {
        assert.match(error.message, /^meta_instagram_token_failed_400:/);
        assert.match(error.message, /Invalid authorization code \[redacted\] with secret \[redacted\]/);
        assert.equal(error.message.includes(code), false);
        assert.equal(error.message.includes(appSecret), false);
        assert.equal(error.message.includes(accessToken), false);
        return true;
      }
    );
  } finally {
    console.error = originalError;
  }

  assert.equal(logs.length, 1);
  const logLine = logs[0];
  assert.equal(logLine.includes(code), false);
  assert.equal(logLine.includes(appSecret), false);
  assert.equal(logLine.includes(accessToken), false);
  const payload = JSON.parse(logLine.replace(/^\[Meta Instagram Token Exchange\]\s*/, ""));
  assert.equal(payload.status, 400);
  assert.equal(payload.error_type, "OAuthException");
  assert.equal(payload.error_message, "Invalid authorization code [redacted] with secret [redacted]");
  assert.equal(payload.error_code, 400);
  assert.equal(payload.client_id, IG_APP_ID);
  assert.equal(payload.redirect_uri, validEnv.INSTAGRAM_REDIRECT_URI);
  assert.equal(payload.grant_type, "authorization_code");
  assert.equal(payload.instagram_app_secret_present, true);
  assert.match(payload.response_body, /"access_token":"\[redacted\]"/);
  assert.match(payload.response_body, /"refresh_token":"\[redacted\]"/);
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

test("BackOffice Social conecta Instagram con target explicito y sin endpoint legacy", () => {
  const adminHtml = fs.readFileSync(path.join(__dirname, "..", "admin.html"), "utf8");
  const adminJs = fs.readFileSync(path.join(__dirname, "..", "assets", "admin.js"), "utf8");
  const loadSocialSource = adminJs.slice(
    adminJs.indexOf("async function loadSocial"),
    adminJs.indexOf("async function saveMetaSettings")
  );

  assert.match(adminHtml, /data-admin-subsection-button="marketing-social"/);
  assert.match(adminHtml, /data-social-summary/);
  assert.match(adminHtml, /data-social-channels/);
  assert.match(adminHtml, /data-social-asset-rows/);
  assert.match(adminHtml, /data-social-asset-editor/);
  assert.match(adminHtml, /data-social-asset-upload-form/);
  assert.match(adminHtml, /data-social-queue-platform/);
  assert.match(adminHtml, /data-social-queue-rows/);
  assert.match(adminHtml, /data-social-preview/);
  assert.match(adminHtml, /data-social-settings/);
  assert.match(adminHtml, /data-social-metrics/);
  assert.match(adminHtml, /data-social-logs/);
  assert.match(adminHtml, /Cola Social/);
  assert.match(adminHtml, /Assets/);
  assert.match(adminHtml, /Vista previa del post/);
  assert.doesNotMatch(adminHtml, /Cola Meta/);
  assert.doesNotMatch(adminHtml, /Preview y publicaci/);
  assert.doesNotMatch(adminHtml, />Conectar Instagram<\/button>/);
  assert.match(adminJs, /data-meta-connect-target="instagram"[^>]*>Reconectar Instagram<\/button>/);
  assert.match(adminJs, /data-meta-connect-facebook data-meta-connect-target="facebook"[^>]*>Conectar Facebook Page<\/button>/);
  assert.match(adminJs, /function renderSocialQueue/);
  assert.match(adminJs, /function renderSocialAssets/);
  assert.match(adminJs, /function uploadSocialAsset/);
  assert.match(adminJs, /function chooseSocialAssetForPost/);
  assert.match(adminJs, /function renderSocialPreview/);
  assert.match(adminJs, /function runSocialManualPublish/);
  assert.match(adminJs, /window\.confirm\(`Publicar ahora manualmente en \$\{destination\}\?`\)/);
  assert.match(adminJs, /Publicar ahora en \$\{escapeHtml\(socialChannelLabel\(post\.channel\)\)\}/);
  assert.match(adminJs, /socialChannelIsValidated\(post\.channel\)/);
  assert.doesNotMatch(adminHtml, />Conectar Meta<\/button>/);
  assert.match(adminJs, /\/api\/meta\/oauth\/start\?target=/);
  assert.match(adminJs, /dataset\.metaConnectTarget \|\| "instagram"/);
  assert.match(loadSocialSource, /\/api\/social\/status/);
  assert.doesNotMatch(loadSocialSource, /publish-test/);
  assert.match(adminJs, /Reconectar Instagram/);
  assert.match(adminJs, /Instagram publishing/);
  assert.match(adminJs, /Published media ID/);
  assert.match(adminJs, /Pendiente permisos Page/);
  assert.match(adminJs, /Autopublisher OFF/);
  assert.doesNotMatch(adminJs, /\/api\/admin\?resource=meta\/connect/);
  assert.match(adminJs, /adminPreviewAuthMessage/);
  assert.match(adminJs, /metaOrganicStatusErrorPayload/);
});

test("Social status resume canales sin activar autopublisher ni exponer secretos", async () => {
  const previousFetch = global.fetch;
  const env = {
    ...validEnv,
    META_AUTOPOST_ENABLED: "false",
    SUPABASE_URL: "https://supabase.test",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-test"
  };
  const metaConnection = {
    ...validConnection,
    status: "connected",
    facebook_page_id: null,
    facebook_page_name: null,
    instagram_business_account_id: "1784143546309305",
    scopes: [...IG_PUBLISH_SCOPES],
    page_access_token_encrypted: null,
    last_error: null
  };
  const successfulInstagramPost = {
    id: "post_ig_1",
    source_type: "meta_organic_spike",
    platform: "instagram",
    status: "published",
    caption: "Probando publicacion automatica access_token=secret-token",
    created_at: "2026-05-27T10:05:00.000Z",
    published_at: "2026-05-27T10:06:00.000Z",
    external_post_id: "ig-media-id",
    error_message: null,
    meta_response: {
      published_media_id: "ig-media-id",
      access_token: "secret-token",
      final_stage: "publish_media_container",
      status: "success"
    }
  };
  const queuedFacebookPost = {
    id: "post_fb_1",
    source: "manual",
    platform: "facebook",
    format: "image",
    status: "scheduled",
    caption: "Facebook draft pendiente de permisos",
    media_url: "https://www.inmoradar.app/assets/inmoradar-brand-mark.jpg",
    created_at: "2026-05-27T10:00:00.000Z",
    scheduled_for: "2026-05-27T12:00:00.000Z",
    error_message: null,
    meta_response: null
  };
  const socialInstagramPost = {
    id: "social_ig_1",
    source: "manual",
    platform: "instagram",
    format: "image",
    status: "published",
    caption: "Instagram publicado desde cola",
    media_url: "https://www.inmoradar.app/assets/inmoradar-brand-mark.jpg",
    created_at: "2026-05-27T10:05:00.000Z",
    published_at: "2026-05-27T10:06:00.000Z",
    published_media_id: "ig-media-id",
    error_message: null,
    meta_response: { published_media_id: "ig-media-id" }
  };

  global.fetch = async (url, options = {}) => {
    const href = String(url);
    const method = options.method || "GET";
    if (method !== "GET") throw new Error(`unexpected_write:${href}`);
    if (href.includes("/marketing_meta_connections?")) {
      return { ok: true, status: 200, text: async () => JSON.stringify([metaConnection]) };
    }
    if (href.includes("/marketing_meta_settings?")) {
      return { ok: true, status: 200, text: async () => JSON.stringify([]) };
    }
    if (href.includes("/marketing_meta_posts?") && href.includes("source_type=eq.meta_organic_spike")) {
      return { ok: true, status: 200, text: async () => JSON.stringify([successfulInstagramPost]) };
    }
    if (href.includes("/marketing_meta_posts?")) {
      return { ok: true, status: 200, text: async () => JSON.stringify([successfulInstagramPost, queuedFacebookPost]) };
    }
    if (href.includes("/social_posts?")) {
      return { ok: true, status: 200, text: async () => JSON.stringify([socialInstagramPost, queuedFacebookPost]) };
    }
    if (href.includes("/social_media_assets?")) {
      return { ok: true, status: 200, text: async () => JSON.stringify([]) };
    }
    if (href.includes("/meta_autopublisher_runs?")) {
      return { ok: true, status: 200, text: async () => JSON.stringify([]) };
    }
    if (href.includes("/marketing_linkedin_connections?")) {
      return { ok: true, status: 200, text: async () => JSON.stringify([]) };
    }
    if (href.includes("/marketing_linkedin_settings?")) {
      return { ok: true, status: 200, text: async () => JSON.stringify([]) };
    }
    if (href.includes("/marketing_linkedin_posts?")) {
      return { ok: true, status: 200, text: async () => JSON.stringify([]) };
    }
    if (href.includes("/linkedin_autopublisher_runs?")) {
      return { ok: true, status: 200, text: async () => JSON.stringify([]) };
    }
    throw new Error(`unexpected_fetch:${href}`);
  };

  try {
    const result = await callAdminResource("social/status", { authorization: "Bearer admin-test-token" }, env);
    assert.equal(result.statusCode, 200);
    assert.equal(result.payload.ok, true);
    assert.equal(result.payload.channels.instagram.status, "validated");
    assert.equal(result.payload.channels.instagram.publishing, "validated");
    assert.equal(result.payload.channels.instagram.published_media_id, "ig-media-id");
    assert.equal(result.payload.channels.facebook.status, "pending_permissions");
    assert.equal(result.payload.channels.facebook.publishing, "not_validated");
    assert.equal(result.payload.channels.linkedin.status, "disabled");
    assert.equal(result.payload.channels.tiktok.status, "not_configured");
    assert.equal(result.payload.settings.global.autopublisher_enabled, false);
    assert.equal(result.payload.autopublisher.enabled, false);
    assert.equal(result.payload.autopublisher.reason, "autopost_disabled");
    assert.equal(result.payload.summary.publishing_validated_channels, 1);
    assert.equal(result.payload.summary.queued_posts, 1);
    assert.equal(result.payload.posts.some((post) => post.channel === "instagram" && post.published_media_id === "ig-media-id"), true);
    assert.equal(result.payload.posts.some((post) => post.channel === "facebook" && post.status === "scheduled"), true);
    assert.equal(result.payload.summary.cards.some((card) => card.key === "autopublisher_global" && card.value === "OFF"), true);
    const serialized = JSON.stringify(result.payload);
    assert.equal(serialized.includes("secret-token"), false);
    assert.equal(serialized.includes("access_token=secret-token"), false);
  } finally {
    global.fetch = previousFetch;
  }
});

test("Social media assets crea lista valida ready y sanea metadata", async () => {
  const previousFetch = global.fetch;
  const env = {
    ...validEnv,
    SUPABASE_URL: "https://supabase.test",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-test"
  };
  const rows = [];
  const assetId = "11111111-1111-4111-8111-111111111111";

  global.fetch = async (url, options = {}) => {
    const href = String(url);
    const method = options.method || "GET";
    if (href.includes("/social_media_assets")) {
      const parsed = new URL(href);
      const id = String(parsed.searchParams.get("id") || "").replace(/^eq\./, "");
      if (method === "GET") {
        return { ok: true, status: 200, text: async () => JSON.stringify(id ? rows.filter((row) => row.id === id) : rows) };
      }
      if (method === "POST") {
        const row = { id: assetId, ...JSON.parse(options.body)[0] };
        rows.unshift(row);
        return { ok: true, status: 201, text: async () => JSON.stringify([row]) };
      }
      if (method === "PATCH") {
        const patch = JSON.parse(options.body);
        const index = rows.findIndex((row) => row.id === id);
        rows[index] = { ...rows[index], ...patch };
        return { ok: true, status: 200, text: async () => JSON.stringify([rows[index]]) };
      }
    }
    throw new Error(`unexpected_fetch:${href}`);
  };

  try {
    const invalidReady = await callAdminMethodResource("social/assets", {
      method: "POST",
      body: { media_type: "image", status: "ready", title: "Ready sin URL" },
      env
    });
    assert.equal(invalidReady.statusCode, 400);
    assert.equal(invalidReady.payload.error, "social_asset_public_https_url_required");

    const created = await callAdminMethodResource("social/assets", {
      method: "POST",
      body: {
        provider: "manual",
        media_type: "image",
        status: "draft",
        title: "Logo InmoRadar",
        public_url: "https://www.inmoradar.app/assets/inmoradar-brand-mark.jpg",
        metadata: {
          access_token: "secret-token",
          prompt: "ok",
          nested: { client_secret: "hidden-secret", safe: "yes" }
        }
      },
      env
    });
    assert.equal(created.statusCode, 201);
    assert.equal(created.payload.asset.id, assetId);
    assert.equal(created.payload.asset.provider, "manual");
    assert.equal(created.payload.asset.metadata.prompt, "ok");
    assert.equal(created.payload.asset.metadata.nested.safe, "yes");
    assert.equal(JSON.stringify(created.payload).includes("secret-token"), false);
    assert.equal(JSON.stringify(created.payload).includes("hidden-secret"), false);

    const list = await callAdminMethodResource("social/assets", { method: "GET", env });
    assert.equal(list.statusCode, 200);
    assert.equal(list.payload.assets.length, 1);

    const validated = await callAdminMethodResource("social/assets", {
      method: "POST",
      query: `action=validate&id=${assetId}`,
      body: {},
      env
    });
    assert.equal(validated.statusCode, 200);
    assert.equal(validated.payload.asset.status, "ready");
  } finally {
    global.fetch = previousFetch;
  }
});

test("Social assets upload valida mime tamano sube a Storage y crea asset publico", async () => {
  const previousFetch = global.fetch;
  const env = {
    ...validEnv,
    SUPABASE_URL: "https://supabase.test",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
    SOCIAL_ASSET_MAX_IMAGE_MB: "0.000001"
  };
  const rows = [];
  let storageUpload = null;

  global.fetch = async (url, options = {}) => {
    const href = String(url);
    const method = options.method || "GET";
    if (href.includes("/storage/v1/object/social-assets/")) {
      storageUpload = { href, options };
      assert.equal(method, "POST");
      assert.equal(options.headers.apikey, "service-role-test");
      assert.equal(options.headers.authorization, "Bearer service-role-test");
      assert.equal(options.headers["content-type"], "image/png");
      assert.equal(String(options.body).includes("service-role-test"), false);
      return { ok: true, status: 200, text: async () => JSON.stringify({ Key: "social-assets/2026/05/test.png" }) };
    }
    if (href.includes("/social_media_assets")) {
      const parsed = new URL(href);
      const id = String(parsed.searchParams.get("id") || "").replace(/^eq\./, "");
      if (method === "GET") {
        return { ok: true, status: 200, text: async () => JSON.stringify(id ? rows.filter((row) => row.id === id) : rows) };
      }
      if (method === "POST") {
        const row = { id: "55555555-5555-4555-8555-555555555555", ...JSON.parse(options.body)[0] };
        rows.unshift(row);
        return { ok: true, status: 201, text: async () => JSON.stringify([row]) };
      }
    }
    throw new Error(`unexpected_fetch:${href}`);
  };

  try {
    const invalidMime = await callAdminMethodResource("social/assets/upload", {
      method: "POST",
      body: {
        filename: "asset.gif",
        mime_type: "image/gif",
        content_base64: Buffer.from("gif").toString("base64")
      },
      env
    });
    assert.equal(invalidMime.statusCode, 400);
    assert.equal(invalidMime.payload.error, "social_asset_upload_mime_not_allowed");

    const tooLarge = await callAdminMethodResource("social/assets/upload", {
      method: "POST",
      body: {
        filename: "big.png",
        mime_type: "image/png",
        content_base64: Buffer.from("xx").toString("base64")
      },
      env
    });
    assert.equal(tooLarge.statusCode, 400);
    assert.equal(tooLarge.payload.error, "social_asset_upload_too_large");

    const uploaded = await callAdminMethodResource("social/assets/upload", {
      method: "POST",
      body: {
        filename: "../Logo InmoRadar.png",
        mime_type: "image/png",
        title: "Logo upload",
        description: "Imagen subida",
        usage_notes: "Uso interno",
        content_base64: Buffer.from("x").toString("base64"),
        metadata: {
          access_token: "secret-token",
          note: "safe"
        }
      },
      env
    });
    assert.equal(uploaded.statusCode, 201);
    assert.equal(uploaded.payload.asset.status, "ready");
    assert.equal(uploaded.payload.asset.provider, "manual");
    assert.equal(uploaded.payload.asset.media_type, "image");
    assert.equal(uploaded.payload.asset.mime_type, "image/png");
    assert.equal(uploaded.payload.asset.file_size_bytes, 1);
    assert.match(uploaded.payload.asset.public_url, /^https:\/\/supabase\.test\/storage\/v1\/object\/public\/social-assets\/\d{4}\/\d{2}\//);
    assert.equal(uploaded.payload.asset.thumbnail_url, uploaded.payload.asset.public_url);
    assert.equal(JSON.stringify(uploaded.payload).includes("service-role-test"), false);
    assert.equal(JSON.stringify(uploaded.payload).includes("secret-token"), false);
    assert.equal(Boolean(storageUpload), true);
    assert.match(storageUpload.href, /\/storage\/v1\/object\/social-assets\/\d{4}\/\d{2}\/[0-9a-f-]+-Logo-InmoRadar\.png$/);

    const list = await callAdminMethodResource("social/assets", { method: "GET", env });
    assert.equal(list.statusCode, 200);
    assert.equal(list.payload.assets.some((asset) => asset.id === uploaded.payload.asset.id), true);
  } finally {
    global.fetch = previousFetch;
  }
});

test("Social post queue crea, edita y transiciona borradores sin autopublisher", async () => {
  const previousFetch = global.fetch;
  const env = {
    ...validEnv,
    SUPABASE_URL: "https://supabase.test",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-test"
  };
  const rows = [];
  const writes = [];

  global.fetch = async (url, options = {}) => {
    const href = String(url);
    const method = options.method || "GET";
    if (href.includes("/meta_autopublisher_runs") && method !== "GET") throw new Error("unexpected_autopublisher_write");
    if (href.includes("/social_posts")) {
      const parsed = new URL(href);
      const idFilter = parsed.searchParams.get("id");
      const id = idFilter ? idFilter.replace(/^eq\./, "") : "";
      if (method === "GET") {
        return { ok: true, status: 200, text: async () => JSON.stringify(id ? rows.filter((row) => row.id === id) : rows) };
      }
      if (method === "POST") {
        const row = { id: `social_${rows.length + 1}`, ...JSON.parse(options.body)[0] };
        rows.unshift(row);
        writes.push({ method, row });
        return { ok: true, status: 201, text: async () => JSON.stringify([row]) };
      }
      if (method === "PATCH") {
        const patch = JSON.parse(options.body);
        const index = rows.findIndex((row) => row.id === id);
        rows[index] = { ...rows[index], ...patch };
        writes.push({ method, id, patch });
        return { ok: true, status: 200, text: async () => JSON.stringify([rows[index]]) };
      }
    }
    throw new Error(`unexpected_fetch:${href}`);
  };

  try {
    const created = await callAdminMethodResource("social/posts", {
      method: "POST",
      body: { platform: "instagram", format: "image", topic: "test cola" },
      env
    });
    assert.equal(created.statusCode, 201);
    assert.equal(created.payload.post.status, "draft");
    assert.equal(created.payload.post.platform, "instagram");

    const id = created.payload.post.id;
    const updated = await callAdminMethodResource("social/posts", {
      method: "PATCH",
      query: `id=${id}`,
      body: {
        caption: "Caption revisado",
        media_url: "https://www.inmoradar.app/assets/inmoradar-brand-mark.jpg",
        target_url: "https://www.inmoradar.app",
        scheduled_at: "2026-05-27T12:00:00.000Z"
      },
      env
    });
    assert.equal(updated.statusCode, 200);
    assert.equal(updated.payload.post.caption, "Caption revisado");

    const approved = await callAdminMethodResource("social/posts", {
      method: "POST",
      query: `action=approve&id=${id}`,
      body: {},
      env
    });
    assert.equal(approved.statusCode, 200);
    assert.equal(approved.payload.post.status, "scheduled");
    assert.equal(Boolean(approved.payload.post.approved_at), true);

    const rejected = await callAdminMethodResource("social/posts", {
      method: "POST",
      query: `action=reject&id=${id}`,
      body: { reason: "copy_no_encaja" },
      env
    });
    assert.equal(rejected.statusCode, 200);
    assert.equal(rejected.payload.post.status, "rejected");
    assert.equal(rejected.payload.post.error_message, "copy_no_encaja");

    const second = await callAdminMethodResource("social/posts", {
      method: "POST",
      body: { platform: "facebook", caption: "Otro borrador" },
      env
    });
    const cancelled = await callAdminMethodResource("social/posts", {
      method: "POST",
      query: `action=cancel&id=${second.payload.post.id}`,
      body: {},
      env
    });
    assert.equal(cancelled.payload.post.status, "cancelled");
    assert.equal(writes.some((write) => write.method === "POST"), true);
  } finally {
    global.fetch = previousFetch;
  }
});

test("Social post queue permite asociar media_asset_id sin perder media_url manual", async () => {
  const previousFetch = global.fetch;
  const env = {
    ...validEnv,
    SUPABASE_URL: "https://supabase.test",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-test"
  };
  const assetId = "22222222-2222-4222-8222-222222222222";
  const row = {
    id: "social_1",
    platform: "instagram",
    format: "image",
    status: "draft",
    caption: "Borrador con asset",
    media_url: "https://www.inmoradar.app/assets/manual.jpg",
    target_url: "https://www.inmoradar.app"
  };

  global.fetch = async (url, options = {}) => {
    const href = String(url);
    const method = options.method || "GET";
    if (href.includes("/social_posts")) {
      if (method === "GET") return { ok: true, status: 200, text: async () => JSON.stringify([row]) };
      if (method === "PATCH") {
        Object.assign(row, JSON.parse(options.body));
        return { ok: true, status: 200, text: async () => JSON.stringify([row]) };
      }
    }
    throw new Error(`unexpected_fetch:${href}`);
  };

  try {
    const updated = await callAdminMethodResource("social/posts", {
      method: "PATCH",
      query: `id=${row.id}`,
      body: { media_asset_id: assetId },
      env
    });
    assert.equal(updated.statusCode, 200);
    assert.equal(updated.payload.post.media_asset_id, assetId);
    assert.equal(updated.payload.post.media_url, "https://www.inmoradar.app/assets/manual.jpg");
  } finally {
    global.fetch = previousFetch;
  }
});

test("Social post queue bloquea canales no validados y contenido incompleto", async () => {
  const previousFetch = global.fetch;
  const env = {
    ...validEnv,
    SUPABASE_URL: "https://supabase.test",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-test"
  };
  const encrypted = encryptToken("IGQ" + "q".repeat(80), env);
  const connection = {
    ...validConnection,
    status: "connected",
    instagram_business_account_id: "26828053596835680",
    scopes: [...IG_PUBLISH_SCOPES],
    access_token_encrypted: encrypted,
    user_access_token_encrypted: encrypted,
    page_access_token_encrypted: null,
    last_error: null
  };
  const organicSuccess = {
    id: "organic_1",
    source_type: "meta_organic_spike",
    platform: "instagram",
    status: "published",
    published_at: "2026-05-27T10:00:00.000Z",
    external_post_id: "ig-media-id",
    meta_response: { published_media_id: "ig-media-id" }
  };
  const rows = [
    { id: "fb_1", platform: "facebook", format: "image", status: "approved", caption: "FB", media_url: "https://www.inmoradar.app/assets/inmoradar-brand-mark.jpg" },
    { id: "ig_draft", platform: "instagram", format: "image", status: "draft", caption: "IG", media_url: "https://www.inmoradar.app/assets/inmoradar-brand-mark.jpg" },
    { id: "ig_no_caption", platform: "instagram", format: "image", status: "approved", caption: "", media_url: "https://www.inmoradar.app/assets/inmoradar-brand-mark.jpg" },
    { id: "ig_no_media", platform: "instagram", format: "image", status: "approved", caption: "IG", media_url: "" },
    { id: "ig_asset_processing", platform: "instagram", format: "image", status: "approved", caption: "IG asset", media_url: "", media_asset_id: "33333333-3333-4333-8333-333333333333" },
    { id: "ig_asset_video", platform: "instagram", format: "video", status: "approved", caption: "IG video", media_url: "", media_asset_id: "33333333-3333-4333-8333-444444444444" }
  ];
  const assets = [
    {
      id: "33333333-3333-4333-8333-333333333333",
      provider: "manual",
      media_type: "image",
      status: "processing",
      public_url: "https://www.inmoradar.app/assets/inmoradar-brand-mark.jpg"
    },
    {
      id: "33333333-3333-4333-8333-444444444444",
      provider: "manual",
      media_type: "video",
      status: "ready",
      public_url: "https://www.inmoradar.app/assets/social/test-video.mp4"
    }
  ];
  let graphCalls = 0;

  global.fetch = async (url, options = {}) => {
    const href = String(url);
    const method = options.method || "GET";
    if (href.startsWith("https://graph.instagram.com")) graphCalls += 1;
    if (href.includes("/social_posts")) {
      const parsed = new URL(href);
      const id = String(parsed.searchParams.get("id") || "").replace(/^eq\./, "");
      if (method === "GET") return { ok: true, status: 200, text: async () => JSON.stringify(rows.filter((row) => row.id === id)) };
      if (method === "PATCH") return { ok: true, status: 200, text: async () => JSON.stringify([rows.find((row) => row.id === id)]) };
    }
    if (href.includes("/social_media_assets")) {
      const parsed = new URL(href);
      const id = String(parsed.searchParams.get("id") || "").replace(/^eq\./, "");
      return { ok: true, status: 200, text: async () => JSON.stringify(assets.filter((asset) => !id || asset.id === id)) };
    }
    if (href.includes("/marketing_meta_connections?")) {
      return { ok: true, status: 200, text: async () => JSON.stringify([connection]) };
    }
    if (href.includes("/marketing_meta_posts?") && href.includes("source_type=eq.meta_organic_spike")) {
      return { ok: true, status: 200, text: async () => JSON.stringify([organicSuccess]) };
    }
    if (href.includes("/marketing_linkedin_connections?") || href.includes("/marketing_linkedin_settings?") || href.includes("/marketing_linkedin_posts?")) {
      return { ok: true, status: 200, text: async () => JSON.stringify([]) };
    }
    throw new Error(`unexpected_fetch:${href}`);
  };

  try {
    const facebook = await callAdminMethodResource("social/posts", { method: "POST", query: "action=publish-now&id=fb_1", body: {}, env });
    assert.equal(facebook.statusCode, 400);
    assert.equal(facebook.payload.error, "pending_page_permissions");

    const draft = await callAdminMethodResource("social/posts", { method: "POST", query: "action=publish-now&id=ig_draft", body: {}, env });
    assert.equal(draft.statusCode, 400);
    assert.equal(draft.payload.error, "social_post_status_not_publishable");

    const missingCaption = await callAdminMethodResource("social/posts", { method: "POST", query: "action=publish-now&id=ig_no_caption", body: {}, env });
    assert.equal(missingCaption.statusCode, 400);
    assert.equal(missingCaption.payload.error, "social_caption_required");

    const missingMedia = await callAdminMethodResource("social/posts", { method: "POST", query: "action=publish-now&id=ig_no_media", body: {}, env });
    assert.equal(missingMedia.statusCode, 400);
    assert.equal(missingMedia.payload.error, "social_public_https_media_url_required");

    const notReadyAsset = await callAdminMethodResource("social/posts", { method: "POST", query: "action=publish-now&id=ig_asset_processing", body: {}, env });
    assert.equal(notReadyAsset.statusCode, 400);
    assert.equal(notReadyAsset.payload.error, "social_media_asset_not_ready");

    const videoAsset = await callAdminMethodResource("social/posts", { method: "POST", query: "action=publish-now&id=ig_asset_video", body: {}, env });
    assert.equal(videoAsset.statusCode, 400);
    assert.equal(videoAsset.payload.error, "social_instagram_video_asset_not_supported_yet");
    assert.equal(graphCalls, 0);
  } finally {
    global.fetch = previousFetch;
  }
});

test("Social post queue publica manualmente Instagram aprobado sin activar automatismos", async () => {
  const previousFetch = global.fetch;
  const token = "IGQ" + "z".repeat(80);
  const env = {
    ...validEnv,
    SUPABASE_URL: "https://supabase.test",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
    INSTAGRAM_PUBLISH_RETRY_DELAYS_MS: "0"
  };
  const encrypted = encryptToken(token, env);
  const connection = {
    ...validConnection,
    status: "connected",
    instagram_business_account_id: "26828053596835680",
    scopes: [...IG_PUBLISH_SCOPES],
    access_token_encrypted: encrypted,
    user_access_token_encrypted: encrypted,
    page_access_token_encrypted: null,
    last_error: null
  };
  const organicSuccess = {
    id: "organic_1",
    source_type: "meta_organic_spike",
    platform: "instagram",
    status: "published",
    published_at: "2026-05-27T10:00:00.000Z",
    external_post_id: "ig-media-id",
    meta_response: { published_media_id: "ig-media-id" }
  };
  const row = {
    id: "ig_queue_1",
    platform: "instagram",
    format: "image",
    status: "approved",
    caption: "Publicacion manual desde cola",
    media_url: "https://www.inmoradar.app/assets/inmoradar-brand-mark.jpg",
    target_url: "https://www.inmoradar.app",
    created_at: "2026-05-27T10:00:00.000Z"
  };
  let graphCalls = 0;
  let autopublisherTouched = false;

  global.fetch = async (url, options = {}) => {
    const href = String(url);
    const method = options.method || "GET";
    if (href.includes("autopublisher_runs")) autopublisherTouched = true;
    if (href.includes("/social_posts")) {
      const parsed = new URL(href);
      const id = String(parsed.searchParams.get("id") || "").replace(/^eq\./, "");
      if (method === "GET") return { ok: true, status: 200, text: async () => JSON.stringify(id === row.id ? [row] : []) };
      if (method === "PATCH") {
        Object.assign(row, JSON.parse(options.body));
        return { ok: true, status: 200, text: async () => JSON.stringify([row]) };
      }
    }
    if (href.includes("/marketing_meta_connections?")) {
      return { ok: true, status: 200, text: async () => JSON.stringify([connection]) };
    }
    if (href.includes("/marketing_meta_posts?") && href.includes("source_type=eq.meta_organic_spike")) {
      return { ok: true, status: 200, text: async () => JSON.stringify([organicSuccess]) };
    }
    if (href.includes("/marketing_linkedin_connections?") || href.includes("/marketing_linkedin_settings?") || href.includes("/marketing_linkedin_posts?")) {
      return { ok: true, status: 200, text: async () => JSON.stringify([]) };
    }
    if (href.startsWith("https://graph.instagram.com/v23.0/me?")) {
      graphCalls += 1;
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: "26828053596835680", user_id: "1784143546309305", username: "inmoradares", account_type: "BUSINESS" }) };
    }
    if (href.startsWith("https://graph.instagram.com/v23.0/me/media_publish")) {
      graphCalls += 1;
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: "ig-published-from-queue" }) };
    }
    if (href.startsWith("https://graph.instagram.com/v23.0/me/media")) {
      graphCalls += 1;
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: "ig-container-id" }) };
    }
    if (href.startsWith("https://graph.instagram.com/v23.0/ig-published-from-queue?")) {
      graphCalls += 1;
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: "ig-published-from-queue", permalink: "https://www.instagram.com/p/test/" }) };
    }
    throw new Error(`unexpected_fetch:${href}`);
  };

  try {
    const result = await callAdminMethodResource("social/posts", {
      method: "POST",
      query: `action=publish-now&id=${row.id}`,
      body: {},
      env
    });
    assert.equal(result.statusCode, 200);
    assert.equal(result.payload.post.status, "published");
    assert.equal(result.payload.post.published_media_id, "ig-published-from-queue");
    assert.equal(result.payload.post.meta_response.published_media_id, "ig-published-from-queue");
    assert.equal(graphCalls >= 3, true);
    assert.equal(autopublisherTouched, false);
  } finally {
    global.fetch = previousFetch;
  }
});

test("Social post queue publica Instagram usando public_url del asset ready", async () => {
  const previousFetch = global.fetch;
  const token = "IGQ" + "a".repeat(80);
  const env = {
    ...validEnv,
    SUPABASE_URL: "https://supabase.test",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
    INSTAGRAM_PUBLISH_RETRY_DELAYS_MS: "0"
  };
  const encrypted = encryptToken(token, env);
  const connection = {
    ...validConnection,
    status: "connected",
    instagram_business_account_id: "26828053596835680",
    scopes: [...IG_PUBLISH_SCOPES],
    access_token_encrypted: encrypted,
    user_access_token_encrypted: encrypted,
    page_access_token_encrypted: null,
    last_error: null
  };
  const organicSuccess = {
    id: "organic_1",
    source_type: "meta_organic_spike",
    platform: "instagram",
    status: "published",
    published_at: "2026-05-27T10:00:00.000Z",
    external_post_id: "ig-media-id",
    meta_response: { published_media_id: "ig-media-id" }
  };
  const assetUrl = "https://www.inmoradar.app/assets/from-asset.jpg";
  const asset = {
    id: "44444444-4444-4444-8444-444444444444",
    provider: "manual",
    media_type: "image",
    status: "ready",
    title: "Asset listo",
    public_url: assetUrl
  };
  const row = {
    id: "ig_queue_asset",
    platform: "instagram",
    format: "image",
    status: "approved",
    caption: "Publicacion manual con asset",
    media_url: "https://www.inmoradar.app/assets/manual-fallback.jpg",
    media_asset_id: asset.id,
    target_url: "https://www.inmoradar.app",
    created_at: "2026-05-27T10:00:00.000Z"
  };
  let createMediaImageUrl = "";

  global.fetch = async (url, options = {}) => {
    const href = String(url);
    const method = options.method || "GET";
    if (href.includes("autopublisher_runs")) throw new Error("unexpected_autopublisher_touch");
    if (href.includes("/social_posts")) {
      const parsed = new URL(href);
      const id = String(parsed.searchParams.get("id") || "").replace(/^eq\./, "");
      if (method === "GET") return { ok: true, status: 200, text: async () => JSON.stringify(id === row.id ? [row] : []) };
      if (method === "PATCH") {
        Object.assign(row, JSON.parse(options.body));
        return { ok: true, status: 200, text: async () => JSON.stringify([row]) };
      }
    }
    if (href.includes("/social_media_assets")) {
      return { ok: true, status: 200, text: async () => JSON.stringify([asset]) };
    }
    if (href.includes("/marketing_meta_connections?")) {
      return { ok: true, status: 200, text: async () => JSON.stringify([connection]) };
    }
    if (href.includes("/marketing_meta_posts?") && href.includes("source_type=eq.meta_organic_spike")) {
      return { ok: true, status: 200, text: async () => JSON.stringify([organicSuccess]) };
    }
    if (href.includes("/marketing_linkedin_connections?") || href.includes("/marketing_linkedin_settings?") || href.includes("/marketing_linkedin_posts?")) {
      return { ok: true, status: 200, text: async () => JSON.stringify([]) };
    }
    if (href.startsWith("https://graph.instagram.com/v23.0/me?")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: "26828053596835680", user_id: "1784143546309305", username: "inmoradares", account_type: "BUSINESS" }) };
    }
    if (href.startsWith("https://graph.instagram.com/v23.0/me/media_publish")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: "ig-published-from-asset" }) };
    }
    if (href.startsWith("https://graph.instagram.com/v23.0/me/media")) {
      createMediaImageUrl = new URLSearchParams(options.body).get("image_url");
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: "ig-container-id" }) };
    }
    if (href.startsWith("https://graph.instagram.com/v23.0/ig-published-from-asset?")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: "ig-published-from-asset", permalink: "https://www.instagram.com/p/test/" }) };
    }
    throw new Error(`unexpected_fetch:${href}`);
  };

  try {
    const result = await callAdminMethodResource("social/posts", {
      method: "POST",
      query: `action=publish-now&id=${row.id}`,
      body: {},
      env
    });
    assert.equal(result.statusCode, 200);
    assert.equal(result.payload.post.status, "published");
    assert.equal(result.payload.post.published_media_id, "ig-published-from-asset");
    assert.equal(createMediaImageUrl, assetUrl);
    assert.equal(JSON.stringify(result.payload).includes(token), false);
  } finally {
    global.fetch = previousFetch;
  }
});

test("Social post queue avisa con SQL pendiente si falta tabla", async () => {
  const previousFetch = global.fetch;
  const env = {
    ...validEnv,
    SUPABASE_URL: "https://supabase.test",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-test"
  };
  global.fetch = async (url) => {
    const href = String(url);
    if (href.includes("/social_posts")) {
      return { ok: false, status: 404, text: async () => JSON.stringify({ message: "relation social_posts does not exist" }) };
    }
    throw new Error(`unexpected_fetch:${href}`);
  };
  try {
    const list = await callAdminMethodResource("social/posts", { method: "GET", env });
    assert.equal(list.statusCode, 200);
    assert.equal(list.payload.table_missing, true);
    assert.equal(list.payload.pending_sql, "database/social-post-queue.sql");

    const create = await callAdminMethodResource("social/posts", {
      method: "POST",
      body: { platform: "instagram" },
      env
    });
    assert.equal(create.statusCode, 503);
    assert.equal(create.payload.error, "social_posts_table_missing");
    assert.equal(create.payload.pending_sql, "database/social-post-queue.sql");
  } finally {
    global.fetch = previousFetch;
  }
});

test("Social posts y assets endpoints estan protegidos por admin token", async () => {
  const { res, payload } = createJsonResponse();
  await withEnv({ ADMIN_IMPORT_TOKEN: "admin-test-token", ...validEnv }, async () => {
    await adminHandler({
      method: "POST",
      url: "/api/admin?resource=social/posts",
      headers: { host: "www.inmoradar.app" },
      body: { platform: "instagram" }
    }, res);
  });
  assert.equal(res.statusCode, 401);
  assert.equal(payload().error, "unauthorized");

  const { res: assetRes, payload: assetPayload } = createJsonResponse();
  await withEnv({ ADMIN_IMPORT_TOKEN: "admin-test-token", ...validEnv }, async () => {
    await adminHandler({
      method: "POST",
      url: "/api/admin?resource=social/assets",
      headers: { host: "www.inmoradar.app" },
      body: { media_type: "image" }
    }, assetRes);
  });
  assert.equal(assetRes.statusCode, 401);
  assert.equal(assetPayload().error, "unauthorized");

  const { res: uploadRes, payload: uploadPayload } = createJsonResponse();
  await withEnv({ ADMIN_IMPORT_TOKEN: "admin-test-token", ...validEnv }, async () => {
    await adminHandler({
      method: "POST",
      url: "/api/admin?resource=social/assets/upload",
      headers: { host: "www.inmoradar.app" },
      body: { mime_type: "image/png", content_base64: "eA==" }
    }, uploadRes);
  });
  assert.equal(uploadRes.statusCode, 401);
  assert.equal(uploadPayload().error, "unauthorized");
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

test("Meta organic status queda neutro sin ultimo intento o meta_response", async () => {
  const previousFetch = global.fetch;
  const env = {
    ...validEnv,
    SUPABASE_URL: "https://supabase.test",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-test"
  };
  const connection = {
    ...validConnection,
    status: "connected",
    instagram_business_account_id: "26828053596835680",
    scopes: [...IG_PUBLISH_SCOPES],
    access_token_encrypted: "encrypted-ig-token",
    user_access_token_encrypted: "encrypted-ig-token",
    page_access_token_encrypted: null,
    last_error: null
  };
  let postRows = [];

  global.fetch = async (url) => {
    const href = String(url);
    if (href.includes("/marketing_meta_connections?")) {
      return { ok: true, status: 200, text: async () => JSON.stringify([connection]) };
    }
    if (href.includes("/marketing_meta_posts?")) {
      return { ok: true, status: 200, text: async () => JSON.stringify(postRows) };
    }
    throw new Error(`unexpected_fetch:${href}`);
  };

  try {
    const emptyResult = await callAdminResource("meta/status", { authorization: "Bearer admin-test-token" }, env);
    assert.equal(emptyResult.statusCode, 200);
    assert.equal(emptyResult.payload.status, "connected");
    assert.equal(emptyResult.payload.last_attempt, null);
    assert.equal(emptyResult.payload.last_error, null);
    assert.equal(emptyResult.payload.storage.posts_error, null);
    assert.deepEqual(emptyResult.payload.missing_scopes, []);
    assert.equal(emptyResult.payload.instagram_account_id, "26828053596835680");

    postRows = [{
      id: "post_1",
      source_type: "meta_organic_spike",
      platform: "instagram",
      status: "published",
      created_at: "2026-05-27T10:00:00.000Z",
      error_message: null,
      meta_response: null
    }];

    const nullMetaResponseResult = await callAdminResource("meta/status", { authorization: "Bearer admin-test-token" }, env);
    assert.equal(nullMetaResponseResult.statusCode, 200);
    assert.equal(nullMetaResponseResult.payload.status, "connected");
    assert.equal(nullMetaResponseResult.payload.last_error, null);
    assert.equal(nullMetaResponseResult.payload.last_attempt.meta_response, null);
    assert.equal(nullMetaResponseResult.payload.instagram_publishing.validated, false);
    assert.equal(nullMetaResponseResult.payload.instagram_publishing.status, "pending_manual_test");

    postRows = [{
      id: "post_2",
      source_type: "meta_organic_spike",
      platform: "instagram",
      status: "published",
      created_at: "2026-05-27T10:05:00.000Z",
      published_at: "2026-05-27T10:06:00.000Z",
      external_post_id: "ig-media-id",
      error_message: null,
      meta_response: {
        published_media_id: "ig-media-id",
        final_stage: "publish_media_container",
        status: "success"
      }
    }];

    const validatedResult = await callAdminResource("meta/status", { authorization: "Bearer admin-test-token" }, env);
    assert.equal(validatedResult.statusCode, 200);
    assert.equal(validatedResult.payload.instagram_publishing.validated, true);
    assert.equal(validatedResult.payload.instagram_publishing.status, "validated");
    assert.equal(validatedResult.payload.instagram_publishing.published_media_id, "ig-media-id");
    assert.equal(validatedResult.payload.instagram_publishing.last_attempt_at, "2026-05-27T10:06:00.000Z");
    assert.equal(validatedResult.payload.facebook_page_publishing.status, "pending_page_permissions");
    assert.equal(validatedResult.payload.facebook_page_publishing.available, false);
  } finally {
    global.fetch = previousFetch;
  }
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
