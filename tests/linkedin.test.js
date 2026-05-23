const test = require("node:test");
const assert = require("node:assert/strict");

const {
  approveLinkedInPostState,
  buildAuthorizationUrl,
  defaultSettings,
  failLinkedInPostState,
  generateLinkedInPost,
  hasPostForDay,
  imageBufferFromSource,
  linkedInHeaders,
  markLinkedInPostManuallyPublishedState,
  scheduleLinkedInPostState,
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
  assert.equal(settings.auto_publish_enabled, false);
  assert.equal(settings.approval_required, true);
  assert.equal(settings.daily_post_time, "09:30");
  assert.equal(settings.timezone, "Europe/Madrid");
});

test("genera borrador diario con texto, CTA, hashtags e imagen", () => {
  const post = generateLinkedInPost({ source_type: "auto", scheduled_at: "2026-05-22T09:30:00.000Z" }, defaultSettings(validEnv));
  assert.ok(post.hook);
  assert.ok(post.body.includes("InmoRadar"));
  assert.ok(post.cta.includes("https://inmoradar.app"));
  assert.ok(post.hashtags.length >= 3);
  assert.ok(post.image_url.startsWith("data:image/svg+xml"));
  assert.equal(post.status, "pending_review");
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

test("no publica sin imagen", () => {
  assert.throws(
    () => validatePublishInput({ post: { body: "x" }, connection: validConnection, settings: { auto_publish_enabled: true }, env: validEnv }),
    /linkedin_image_required/
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
    () => validatePublishInput({ post: { body: "x", image_url: "https://example.com/a.png" }, connection: validConnection, settings: { auto_publish_enabled: false }, env: validEnv }),
    /linkedin_auto_publish_disabled/
  );
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
});

test("la subida automatica limita formatos de imagen", async () => {
  await assert.rejects(() => imageBufferFromSource("data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C/svg%3E").then(({ mime }) => validateImageMime(mime)), /linkedin_image_format_must_be_jpg_png_webp/);
  assert.equal(validateImageMime("image/png"), "image/png");
});