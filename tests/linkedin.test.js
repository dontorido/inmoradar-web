const test = require("node:test");
const assert = require("node:assert/strict");

const {
  approveLinkedInPostState,
  buildAuthorizationUrl,
  createPost,
  defaultSettings,
  failLinkedInPostState,
  generateLinkedInPost,
  hasPostForDay,
  imageBufferFromSource,
  linkedInHeaders,
  markLinkedInPostManuallyPublishedState,
  publishPost,
  scheduleLinkedInPostState,
  shouldRunAutopublisher,
  summarizeConnection,
  validateImageMime,
  validatePublishInput
} = require("../lib/linkedin/services");

const validEnv = {
  LINKEDIN_CLIENT_ID: "client-id",
  LINKEDIN_CLIENT_SECRET: "client-secret",
  LINKEDIN_REDIRECT_URI: "https://www.inmoradar.app/admin",
  LINKEDIN_ORGANIZATION_URN: "urn:li:organization:123456",
  LINKEDIN_AUTO_PUBLISH_ENABLED: "true",
  LINKEDIN_API_VERSION: "202605"
};

const validConnection = {
  status: "connected",
  organization_urn: "urn:li:organization:123456",
  access_token_encrypted: "encrypted-token",
  token_expires_at: new Date(Date.now() + 3600_000).toISOString()
};

test("crea ajustes por defecto seguros", () => {
  const settings = defaultSettings(validEnv);
  assert.equal(settings.daily_generation_enabled, true);
  assert.equal(settings.autopost_enabled, false);
  assert.equal(settings.frequency_days, 2);
  assert.equal(settings.max_posts_per_day, 1);
  assert.equal(settings.active_post_type, "precio_sexy_coste_oculto");
  assert.equal(settings.approval_required, true);
  assert.equal(settings.daily_post_time, "10:00");
  assert.equal(settings.timezone, "Europe/Madrid");
});

test("genera post precio sexy / coste oculto con precio, headline y costes ocultos", () => {
  const post = generateLinkedInPost("precio_sexy_coste_oculto", defaultSettings(validEnv));
  assert.equal(post.post_type, "precio_sexy_coste_oculto");
  assert.equal(post.price_display, "895 €/mes");
  assert.ok(post.headline.includes("alquilarias"));
  assert.ok(post.hidden_costs.includes("zona complicada para aparcar"));
  assert.ok(post.body.includes("El precio mensual no siempre es el coste real"));
  assert.ok(post.cta.includes("https://inmoradar.app"));
  assert.ok(post.image_prompt.includes("overlay"));
  assert.ok(post.hashtags.length >= 3);
  assert.ok(post.image_url.startsWith("data:image/svg+xml"));
  assert.equal(post.status, "ready");
});

test("no duplica post del mismo dia", () => {
  const posts = [{ created_at: "2026-05-22T07:00:00.000Z", status: "pending_review" }];
  assert.equal(hasPostForDay(posts, "2026-05-22T21:00:00.000Z"), true);
  assert.equal(hasPostForDay(posts, "2026-05-23T07:00:00.000Z"), false);
});

test("no publica sin conexion valida", () => {
  assert.throws(
    () => validatePublishInput({ post: { body: "x", image_url: "https://example.com/a.png" }, connection: null, settings: { auto_publish_enabled: true }, env: validEnv }),
    /linkedin_connection_not_ready/
  );
});

test("no publica sin organization urn", () => {
  assert.throws(
    () => validatePublishInput({
      post: { body: "x", image_url: "https://example.com/a.png" },
      connection: { ...validConnection, organization_urn: "" },
      settings: { auto_publish_enabled: true },
      env: { ...validEnv, LINKEDIN_ORGANIZATION_URN: "" }
    }),
    /linkedin_organization_urn_missing/
  );
});

test("no publica si automatico esta desactivado", () => {
  assert.throws(
    () => validatePublishInput({ post: { body: "x", image_url: "https://example.com/a.png" }, connection: validConnection, settings: { autopost_enabled: false }, env: validEnv }),
    /linkedin_auto_publish_disabled/
  );
});

test("no publica mas de una vez al dia y respeta every_2_days", () => {
  const settings = { ...defaultSettings(validEnv), autopost_enabled: true };
  const todayPost = [{ status: "published", published_at: "2026-05-23T08:00:00.000Z" }];
  assert.equal(shouldRunAutopublisher({ posts: todayPost, settings, connection: validConnection, env: validEnv, now: "2026-05-23T10:00:00.000Z" }).reason, "max_posts_per_day_reached");
  const yesterdayPost = [{ status: "published", published_at: "2026-05-22T08:00:00.000Z" }];
  assert.equal(shouldRunAutopublisher({ posts: yesterdayPost, settings, connection: validConnection, env: validEnv, now: "2026-05-23T10:00:00.000Z" }).reason, "frequency_not_due");
  const oldPost = [{ status: "published", published_at: "2026-05-20T08:00:00.000Z" }];
  assert.equal(shouldRunAutopublisher({ posts: oldPost, settings, connection: validConnection, env: validEnv, now: "2026-05-23T10:00:00.000Z" }).ok, true);
});

test("aprueba, programa y marca publicacion manual", () => {
  const base = { id: "post_1", status: "draft" };
  const approved = approveLinkedInPostState(base, { userId: "admin", now: "2026-05-22T09:00:00.000Z" });
  assert.equal(approved.status, "pending_review");
  assert.equal(approved.approved_by_user_id, "admin");

  const scheduled = scheduleLinkedInPostState(approved, "2026-05-23T09:30:00.000Z");
  assert.equal(scheduled.status, "scheduled");
  assert.equal(scheduled.scheduled_at, "2026-05-23T09:30:00.000Z");

  const manual = markLinkedInPostManuallyPublishedState(scheduled, "2026-05-23T10:00:00.000Z");
  assert.equal(manual.status, "manually_published");
  assert.equal(manual.manually_published_at, "2026-05-23T10:00:00.000Z");
});

test("error de LinkedIn marca failed", () => {
  const failed = failLinkedInPostState({ id: "post_1", status: "publishing" }, "forbidden");
  assert.equal(failed.status, "failed");
  assert.equal(failed.error_message, "forbidden");
});

test("headers oficiales de LinkedIn incluyen version y Rest.li", () => {
  const headers = linkedInHeaders("token", "202605");
  assert.equal(headers.Authorization, "Bearer token");
  assert.equal(headers["Linkedin-Version"], "202605");
  assert.equal(headers["X-Restli-Protocol-Version"], "2.0.0");
});

test("OAuth genera URL con scopes de publicacion", () => {
  const { url, scopes } = buildAuthorizationUrl({ state: "state", env: validEnv });
  assert.ok(url.startsWith("https://www.linkedin.com/oauth/v2/authorization"));
  assert.ok(scopes.includes("w_organization_social"));
  assert.equal(scopes.includes("r_organization_social"), false);
});

test("la subida automatica limita formatos de imagen", async () => {
  await assert.rejects(() => imageBufferFromSource("data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C/svg%3E").then(({ mime }) => validateImageMime(mime)), /linkedin_image_format_must_be_jpg_png_webp/);
  assert.equal(validateImageMime("image/png"), "image/png");
});

test("usa organization_urn como author en Posts API", async () => {
  let capturedBody = null;
  const fetchImpl = async () => ({
    ok: true,
    status: 201,
    headers: { get: (name) => (name.toLowerCase() === "x-restli-id" ? "urn:li:share:1" : null) },
    text: async () => "{}"
  });
  const wrappedFetch = async (url, options) => {
    capturedBody = JSON.parse(options.body);
    return fetchImpl(url, options);
  };
  await createPost({ accessToken: "token", ownerUrn: "urn:li:organization:123456", post: { body: "x" }, fetchImpl: wrappedFetch, env: validEnv });
  assert.equal(capturedBody.author, "urn:li:organization:123456");
  assert.equal(capturedBody.visibility, "PUBLIC");
  assert.equal(capturedBody.distribution.feedDistribution, "MAIN_FEED");
});

test("guarda failed si API falla", async () => {
  await assert.rejects(
    () => publishPost({
      accessToken: "token",
      ownerUrn: "urn:li:organization:123456",
      post: { body: "x", text: "x" },
      env: validEnv,
      fetchImpl: async () => ({
        ok: false,
        status: 403,
        headers: { get: () => null },
        text: async () => JSON.stringify({ message: "forbidden" })
      })
    }),
    /linkedin_post_create_failed/
  );
  const failed = failLinkedInPostState({ status: "publishing" }, "linkedin_post_create_failed");
  assert.equal(failed.status, "failed");
});

test("no expone token en resumen de conexion", () => {
  const summary = summarizeConnection({ ...validConnection, access_token: "plain-token", refresh_token: "refresh-token" }, validEnv);
  assert.equal("access_token" in summary, false);
  assert.equal("refresh_token" in summary, false);
  assert.equal(JSON.stringify(summary).includes("plain-token"), false);
});

test("boton publicar solo se controla si connected", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync(require("node:path").join(__dirname, "..", "assets", "admin.js"), "utf8");
  assert.ok(source.includes('data-linkedin-post-action="publish_now"'));
  assert.ok(source.includes('state.linkedin.connection?.status === "connected"'));
  assert.ok(source.includes("button.hidden = !connected"));
});
