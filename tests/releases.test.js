const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeReleaseArtifactInput, normalizeReleaseTarget, releaseConnectors } = require("../lib/operations/releases");

test("normalizeReleaseArtifactInput prepara artefactos de backoffice", () => {
  const artifact = normalizeReleaseArtifactInput({
    target: "extension",
    version: "1.0.11",
    title: "Extension production build",
    channel: "stable",
    status: "ready",
    artifact_kind: "bundle",
    connector_target: "chrome",
    file_name: "inmoradar-1.0.11.zip",
    mime_type: "application/zip",
    file_size_bytes: 1024,
    sha256: "a".repeat(64),
    notes: "Ready for store upload"
  });

  assert.equal(artifact.target, "extension");
  assert.equal(artifact.channel, "stable");
  assert.equal(artifact.status, "ready");
  assert.equal(artifact.connector_target, "chrome");
  assert.equal(artifact.sha256, "a".repeat(64));
});

test("normalizeReleaseArtifactInput exige version y titulo", () => {
  assert.throws(() => normalizeReleaseArtifactInput({ target: "web", title: "Sin version" }), /release_version_required/);
  assert.throws(() => normalizeReleaseArtifactInput({ target: "web", version: "1.0.0" }), /release_title_required/);
});

test("normalizeReleaseTarget cae a web si el target no existe", () => {
  assert.equal(normalizeReleaseTarget("extension"), "extension");
  assert.equal(normalizeReleaseTarget("unknown"), "web");
});

test("releaseConnectors no expone secretos y marca configuracion", () => {
  const connectors = releaseConnectors({
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_123",
    CHROME_WEBSTORE_PUBLISHER_ID: "pub",
    CHROME_WEBSTORE_ITEM_ID: "item",
    CHROME_WEBSTORE_CLIENT_ID: "client",
    CHROME_WEBSTORE_CLIENT_SECRET: "secret",
    CHROME_WEBSTORE_REFRESH_TOKEN: "refresh"
  });

  assert.equal(connectors.extension.find((item) => item.id === "chrome").configured, true);
  assert.equal(connectors.extension.find((item) => item.id === "edge").configured, false);
  assert.equal(connectors.backoffice.find((item) => item.id === "supabase").configured, true);
  assert.equal(JSON.stringify(connectors).includes("sb_secret_123"), false);
});
