const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const {
  buildCheckoutPayload,
  getCustomerPortal,
  lemonConfig,
  lemonTestMode,
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

test("lemonConfig usa modo real por defecto en producción", () => {
  const previousEnv = {
    VERCEL_ENV: process.env.VERCEL_ENV,
    NODE_ENV: process.env.NODE_ENV,
    LEMONSQUEEZY_TEST_MODE: process.env.LEMONSQUEEZY_TEST_MODE
  };

  try {
    process.env.VERCEL_ENV = "production";
    delete process.env.LEMONSQUEEZY_TEST_MODE;
    assert.equal(lemonTestMode(), false);
    assert.equal(lemonConfig().testMode, false);

    process.env.LEMONSQUEEZY_TEST_MODE = "true";
    assert.equal(lemonTestMode(), true);

    process.env.LEMONSQUEEZY_TEST_MODE = "false";
    assert.equal(lemonTestMode(), false);
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
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

test("getSignedCustomerPortalUrl usa el customer portal si la suscripcion no aparece", async () => {
  const originalFetch = global.fetch;
  const requested = [];
  global.fetch = async (url, options) => {
    requested.push(url);
    assert.equal(options.headers.authorization, "Bearer test_key");

    if (url.startsWith("https://api.lemonsqueezy.com/v1/subscriptions?")) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: [] })
      };
    }

    assert.match(url, /^https:\/\/api\.lemonsqueezy\.com\/v1\/customers\?/);
    assert.match(url, /filter%5Bemail%5D=cliente%40example\.com/);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        data: [
          {
            type: "customers",
            id: "cus_123",
            attributes: {
              urls: {
                customer_portal: "https://inmoradar.lemonsqueezy.com/billing?expires=1&signature=customer"
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
      "cliente@example.com"
    );
    assert.equal(portalUrl, "https://inmoradar.lemonsqueezy.com/billing?expires=1&signature=customer");
    assert.equal(requested.length, 2);
  } finally {
    global.fetch = originalFetch;
  }
});

test("getCustomerPortal no cae al portal generico si no hay enlace firmado", async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (url.startsWith("https://api.lemonsqueezy.com/v1/subscriptions?")) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: [] })
      };
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: [] })
    };
  };

  try {
    const portal = await getCustomerPortal(
      { storeId: "123", apiKey: "test_key" },
      "sincompra@example.com"
    );
    assert.equal(portal.portalUrl, null);
    assert.equal(portal.signed, false);
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
