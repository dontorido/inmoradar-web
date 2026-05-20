const test = require("node:test");
const assert = require("node:assert/strict");

const {
  chromeAccessToken,
  chromePublishBody,
  chromeWebStoreConfig,
  decodeInlineArtifactPayload,
  fetchChromeItemStatus,
  publishChromeItem,
  uploadChromePackage
} = require("../lib/operations/chromeWebStore");

test("chromeWebStoreConfig exige credenciales reales de Chrome", () => {
  const config = chromeWebStoreConfig({
    CHROME_WEBSTORE_PUBLISHER_ID: "pub",
    CHROME_WEBSTORE_ITEM_ID: "item",
    CHROME_WEBSTORE_CLIENT_ID: "client",
    CHROME_WEBSTORE_CLIENT_SECRET: "secret",
    CHROME_WEBSTORE_REFRESH_TOKEN: "refresh"
  });

  assert.equal(config.configured, true);
  assert.equal(config.itemName, "publishers/pub/items/item");
  assert.deepEqual(config.missing, []);
});

test("chromeAccessToken refresca token sin exponer secretos", async () => {
  const calls = [];
  const token = await chromeAccessToken(
    chromeWebStoreConfig({
      CHROME_WEBSTORE_PUBLISHER_ID: "pub",
      CHROME_WEBSTORE_ITEM_ID: "item",
      CHROME_WEBSTORE_CLIENT_ID: "client",
      CHROME_WEBSTORE_CLIENT_SECRET: "secret",
      CHROME_WEBSTORE_REFRESH_TOKEN: "refresh"
    }),
    async (url, options) => {
      calls.push({ url, body: options.body });
      return {
        ok: true,
        text: async () => JSON.stringify({ access_token: "token_123" })
      };
    }
  );

  assert.equal(token, "token_123");
  assert.equal(calls[0].url, "https://oauth2.googleapis.com/token");
  assert.match(calls[0].body, /grant_type=refresh_token/);
});

test("chromePublishBody soporta staged publish y porcentaje", () => {
  assert.deepEqual(chromePublishBody({ publishType: "STAGED_PUBLISH", deployPercentage: 25 }), {
    publishType: "STAGED_PUBLISH",
    deployInfos: [{ deployPercentage: 25 }]
  });
});

test("decodeInlineArtifactPayload recupera el ZIP guardado inline", () => {
  const buffer = decodeInlineArtifactPayload({
    artifact_payload: {
      encoding: "base64",
      content_base64: Buffer.from("zip-bytes").toString("base64")
    }
  });

  assert.equal(buffer.toString("utf8"), "zip-bytes");
});

test("Chrome Web Store usa endpoints v2 oficiales para status, upload y publish", async () => {
  const calls = [];
  const config = chromeWebStoreConfig({
    CHROME_WEBSTORE_PUBLISHER_ID: "pub",
    CHROME_WEBSTORE_ITEM_ID: "item",
    CHROME_WEBSTORE_ACCESS_TOKEN: "token"
  });
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, method: options.method || "GET", body: options.body });
    return {
      ok: true,
      text: async () => JSON.stringify({ ok: true, uploadState: "UPLOAD_SUCCEEDED", state: "IN_REVIEW" })
    };
  };

  await fetchChromeItemStatus({ config, fetchImpl });
  await uploadChromePackage(Buffer.from("zip"), { config, fetchImpl, mimeType: "application/zip" });
  await publishChromeItem({ config, fetchImpl, publishType: "DEFAULT_PUBLISH" });

  assert.equal(calls[0].url, "https://chromewebstore.googleapis.com/v2/publishers/pub/items/item:fetchStatus");
  assert.equal(calls[1].url, "https://chromewebstore.googleapis.com/upload/v2/publishers/pub/items/item:upload");
  assert.equal(calls[1].method, "POST");
  assert.equal(calls[2].url, "https://chromewebstore.googleapis.com/v2/publishers/pub/items/item:publish");
  assert.equal(calls[2].method, "POST");
});
