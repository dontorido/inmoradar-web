const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const { buildCheckoutPayload } = require("../api/lemonsqueezy-checkout");
const { verifyLemonSignature } = require("../api/_utils");

function mockReq() {
  return {
    headers: {
      host: "www.inmoradar.app"
    },
    url: "/api/lemonsqueezy-checkout"
  };
}

test("buildCheckoutPayload crea checkout de Lemon en test mode", () => {
  const payload = buildCheckoutPayload({
    config: {
      storeId: "123",
      variantId: "456",
      testMode: true
    },
    email: "sergio@example.com",
    source: "premium_test",
    req: mockReq()
  });

  assert.equal(payload.data.type, "checkouts");
  assert.equal(payload.data.attributes.test_mode, true);
  assert.deepEqual(payload.data.attributes.product_options.enabled_variants, [456]);
  assert.equal(payload.data.attributes.product_options.redirect_url, "https://www.inmoradar.app/success");
  assert.equal(payload.data.attributes.checkout_options.locale, "es");
  assert.equal(payload.data.attributes.checkout_data.email, "sergio@example.com");
  assert.equal(payload.data.attributes.checkout_data.custom.app, "inmoradar");
  assert.equal(payload.data.attributes.checkout_data.custom.source, "premium_test");
  assert.equal(payload.data.relationships.store.data.id, "123");
  assert.equal(payload.data.relationships.variant.data.id, "456");
});

test("verifyLemonSignature valida HMAC SHA256 de Lemon Squeezy", () => {
  const secret = "test_webhook_secret";
  const rawBody = JSON.stringify({ data: { id: "sub_1" } });
  const signature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

  assert.equal(verifyLemonSignature(rawBody, signature, secret), true);
  assert.equal(verifyLemonSignature(rawBody, "bad-signature", secret), false);
});
