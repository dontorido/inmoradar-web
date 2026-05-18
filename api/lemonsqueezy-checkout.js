const { handleCors, isEmail, json, normalizeEmail, readRawBody } = require("./_utils");

const LEMON_API_URL = "https://api.lemonsqueezy.com/v1/checkouts";

function siteUrl(req) {
  const configured = process.env.PUBLIC_SITE_URL || process.env.SITE_URL;
  if (configured) return String(configured).replace(/\/+$/, "");
  const host = req.headers.host || "inmoradar.app";
  const protocol = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https";
  return `${protocol}://${host}`.replace(/\/+$/, "");
}

function lemonConfig() {
  return {
    apiKey: process.env.LEMONSQUEEZY_API_KEY,
    storeId: process.env.LEMONSQUEEZY_STORE_ID,
    variantId: process.env.LEMONSQUEEZY_VARIANT_ID,
    testMode: String(process.env.LEMONSQUEEZY_TEST_MODE || "true").toLowerCase() !== "false"
  };
}

function configMissing(config) {
  return ["apiKey", "storeId", "variantId"].filter((key) => !config[key]);
}

async function parseBody(req) {
  if (req.method !== "POST") return {};
  const rawBody = await readRawBody(req);
  if (!rawBody) return {};
  try {
    return JSON.parse(rawBody);
  } catch {
    return {};
  }
}

function requestUrl(req) {
  return new URL(req.url || "/", `https://${req.headers.host || "inmoradar.app"}`);
}

function buildCheckoutPayload({ config, email, source, req }) {
  const baseUrl = siteUrl(req);
  const custom = {
    app: "inmoradar",
    plan: "premium_weekly",
    source: source || "premium_page"
  };
  if (email) custom.email = email;

  return {
    data: {
      type: "checkouts",
      attributes: {
        test_mode: config.testMode,
        product_options: {
          redirect_url: `${baseUrl}/success`,
          receipt_button_text: "Abrir InmoRadar",
          receipt_link_url: baseUrl,
          receipt_thank_you_note: "Gracias por probar InmoRadar Premium.",
          enabled_variants: [Number(config.variantId)]
        },
        checkout_options: {
          media: false,
          logo: true,
          desc: true,
          discount: true,
          skip_trial: false,
          subscription_preview: true,
          locale: "es",
          background_color: "#0A0A0A",
          headings_color: "#FFFFFF",
          primary_text_color: "#FFFFFF",
          secondary_text_color: "#A3A3A3",
          links_color: "#CCFF00",
          borders_color: "#262626",
          button_color: "#CCFF00",
          button_text_color: "#0A0A0A"
        },
        checkout_data: {
          ...(email ? { email } : {}),
          custom
        }
      },
      relationships: {
        store: {
          data: {
            type: "stores",
            id: String(config.storeId)
          }
        },
        variant: {
          data: {
            type: "variants",
            id: String(config.variantId)
          }
        }
      }
    }
  };
}

async function createLemonCheckout(payload, apiKey) {
  const response = await fetch(LEMON_API_URL, {
    method: "POST",
    headers: {
      accept: "application/vnd.api+json",
      "content-type": "application/vnd.api+json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const detail = data?.errors?.[0]?.detail || data?.errors?.[0]?.title || text || "Lemon Squeezy checkout failed";
    const error = new Error(detail);
    error.status = response.status;
    error.payload = data;
    throw error;
  }
  return data;
}

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!["GET", "POST"].includes(req.method)) {
    json(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    const config = lemonConfig();
    const missing = configMissing(config);
    if (missing.length) {
      json(res, 500, {
        ok: false,
        error: "lemonsqueezy_not_configured",
        missing
      });
      return;
    }

    const url = requestUrl(req);
    const body = await parseBody(req);
    const email = normalizeEmail(body.email || url.searchParams.get("email"));
    const source = String(body.source || url.searchParams.get("source") || "premium_page").slice(0, 80);
    if (email && !isEmail(email)) {
      json(res, 400, { ok: false, error: "invalid_email" });
      return;
    }

    const payload = buildCheckoutPayload({ config, email, source, req });
    const checkout = await createLemonCheckout(payload, config.apiKey);
    const checkoutUrl = checkout?.data?.attributes?.url;
    if (!checkoutUrl) {
      json(res, 502, { ok: false, error: "checkout_url_missing" });
      return;
    }

    json(res, 200, {
      ok: true,
      checkout_url: checkoutUrl,
      test_mode: Boolean(checkout?.data?.attributes?.test_mode ?? config.testMode),
      checkout_id: checkout?.data?.id || null
    });
  } catch (error) {
    console.error("[lemonsqueezy-checkout]", error);
    json(res, error.status || 500, {
      ok: false,
      error: "checkout_failed",
      message: error.message
    });
  }
};

module.exports.buildCheckoutPayload = buildCheckoutPayload;
module.exports.lemonConfig = lemonConfig;
