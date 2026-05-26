const test = require("node:test");
const assert = require("node:assert/strict");

const {
  META_POST_STATUSES,
  META_REQUIRED_SCOPES,
  buildAuthorizationUrl,
  buildCaption,
  defaultBrandImageUrl,
  defaultSettings,
  duplicateForPlatform,
  encryptToken,
  imageUrlForLanding,
  isEligibleLanding,
  missingRequiredScopes,
  pickNextLanding,
  publishFacebookPost,
  publishInstagramPost,
  sanitizeMetaPayload,
  sanitizeSecretText,
  shouldRunAutopublisher,
  summarizeConnection
} = require("../lib/meta/services");
const {
  buildFacebookOrganicTestPost,
  buildInstagramOrganicTestPost,
  decodeOrganicOAuthState,
  encodeOrganicOAuthState,
  maskSecret,
  validateMetaOrganicEnv
} = require("../lib/meta/organic");

const validEnv = {
  META_APP_ID: "meta-app-id",
  META_APP_SECRET: "meta-app-secret",
  META_REDIRECT_URI: "https://www.inmoradar.app/api/meta/oauth/callback",
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
  scopes: META_REQUIRED_SCOPES,
  access_token_encrypted: "encrypted-token",
  page_access_token_encrypted: "encrypted-page-token",
  token_expires_at: new Date(Date.now() + 3600_000).toISOString()
};

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
  assert.ok(missing.includes("pages_manage_posts"));
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

test("OAuth Meta genera URL con permisos esperados", () => {
  const { url, scopes } = buildAuthorizationUrl({ state: "state", env: validEnv });
  assert.match(url, /facebook\.com\/v23\.0\/dialog\/oauth/);
  assert.ok(scopes.includes("pages_manage_posts"));
  assert.ok(scopes.includes("instagram_business_content_publish"));
  assert.ok(url.includes(encodeURIComponent("https://www.inmoradar.app/api/meta/oauth/callback")));
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
  assert.equal(ok.redirect_uri, "https://www.inmoradar.app/api/meta/oauth/callback");
  assert.equal(ok.facebook_page_id, "123");
  assert.equal(ok.instagram_account_id, "456");

  const missing = validateMetaOrganicEnv({ META_APP_ID: "app" });
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.missing, ["META_APP_SECRET"]);
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
  assert.equal(maskSecret("abc123456789xyz"), "abc123...9xyz");
  assert.throws(() => decodeOrganicOAuthState(`${state}x`, validEnv, { now: 1770000000000 }), /meta_oauth_state_invalid/);
});
