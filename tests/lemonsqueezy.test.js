const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const {
  buildCheckoutPayload,
  getSignedCustomerPortalUrl,
  getUnsignedCustomerPortalUrl
} = require("../api/lemonsqueezy-checkout");
const { isPremiumActive, verifyLemonSignature } = require("../api/_utils");

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

test("getUnsignedCustomerPortalUrl construye el portal de cliente desde la tienda", async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    assert.equal(url, "https://api.lemonsqueezy.com/v1/stores/123");
    assert.equal(options.headers.authorization, "Bearer test_key");
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        data: {
          attributes: {
            url: "https://inmoradar.lemonsqueezy.com"
          }
        }
      })
    };
  };

  try {
    const portalUrl = await getUnsignedCustomerPortalUrl({ storeId: "123", apiKey: "test_key" });
    assert.equal(portalUrl, "https://inmoradar.lemonsqueezy.com/billing");
  } finally {
    global.fetch = originalFetch;
  }
});

test("getSignedCustomerPortalUrl usa el filtro por email de suscripciones", async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    assert.match(url, /^https:\/\/api\.lemonsqueezy\.com\/v1\/subscriptions\?/);
    assert.match(url, /filter%5Buser_email%5D=sergio%40example\.com/);
    assert.equal(options.headers.authorization, "Bearer test_key");
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        data: [
          {
            type: "subscriptions",
            id: "sub_123",
            attributes: {
              urls: {
                customer_portal: "https://inmoradar.lemonsqueezy.com/billing?expires=1&signature=signed"
              }
            }
          }
        ]
      })
    };
  };

  try {
    const portalUrl = await getSignedCustomerPortalUrl(
      { storeId: "123", apiKey: "test_key" },
      "sergio@example.com"
    );
    assert.equal(portalUrl, "https://inmoradar.lemonsqueezy.com/billing?expires=1&signature=signed");
  } finally {
    global.fetch = originalFetch;
  }
});

test("isPremiumActive mantiene acceso si la suscripcion cancelada aun no ha vencido", () => {
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  assert.equal(isPremiumActive({ status: "cancelled", ends_at: future }), true);
  assert.equal(isPremiumActive({ status: "cancelled", ends_at: past }), false);
  assert.equal(isPremiumActive({ status: "expired", ends_at: future }), false);
});
