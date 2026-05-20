const { handleCors, hasSupabaseConfig, isEmail, json, normalizeEmail, readRawBody, supabaseFetch } = require("./_utils");

const LEMON_API_URL = "https://api.lemonsqueezy.com/v1/checkouts";
const LEMON_BASE_API_URL = "https://api.lemonsqueezy.com/v1";
let portalUrlCache = {
  expiresAt: 0,
  value: null
};

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
    testMode: lemonTestMode()
  };
}

function isProductionRuntime() {
  const runtime = String(process.env.VERCEL_ENV || process.env.NODE_ENV || "").toLowerCase();
  return runtime === "production";
}

function lemonTestMode() {
  const explicit = process.env.LEMONSQUEEZY_TEST_MODE;
  if (explicit !== undefined && explicit !== "") {
    return String(explicit).toLowerCase() !== "false";
  }
  return !isProductionRuntime();
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
          links_color: "#FF4500",
          borders_color: "#262626",
          button_color: "#FF4500",
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
  return lemonRequest(LEMON_API_URL, apiKey, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

async function lemonRequest(url, apiKey, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      accept: "application/vnd.api+json",
      "content-type": "application/vnd.api+json",
      authorization: `Bearer ${apiKey}`,
      ...(options.headers || {})
    }
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

async function getUnsignedCustomerPortalUrl(config) {
  if (portalUrlCache.expiresAt > Date.now() && portalUrlCache.value) {
    return portalUrlCache.value;
  }

  const store = await lemonRequest(`${LEMON_BASE_API_URL}/stores/${encodeURIComponent(config.storeId)}`, config.apiKey);
  const baseUrl = String(store?.data?.attributes?.url || "").replace(/\/+$/, "");
  if (!baseUrl) {
    throw new Error("No se ha podido obtener la URL de la tienda de Lemon Squeezy.");
  }

  const portalUrl = `${baseUrl}/billing`;
  portalUrlCache = {
    expiresAt: Date.now() + 10 * 60 * 1000,
    value: portalUrl
  };
  return portalUrl;
}

async function findStoredBillingIds(email) {
  if (!email || !hasSupabaseConfig()) {
    return {
      customerId: null,
      subscriptionId: null
    };
  }

  try {
    const params = new URLSearchParams({
      email: `eq.${email}`,
      select: "provider_customer_id,provider_subscription_id,status,updated_at",
      order: "updated_at.desc",
      limit: "1"
    });
    const rows = await supabaseFetch(`premium_subscriptions?${params.toString()}`, { timeoutMs: 3000 });
    const row = Array.isArray(rows) ? rows[0] : null;
    return {
      customerId: row?.provider_customer_id || null,
      subscriptionId: row?.provider_subscription_id || null
    };
  } catch {
    return {
      customerId: null,
      subscriptionId: null
    };
  }
}

async function getSignedCustomerPortalUrl(config, email) {
  const storedIds = await findStoredBillingIds(email);
  const urls = [];
  if (storedIds.subscriptionId) {
    urls.push(`${LEMON_BASE_API_URL}/subscriptions/${encodeURIComponent(storedIds.subscriptionId)}`);
  }
  if (storedIds.customerId) {
    urls.push(`${LEMON_BASE_API_URL}/customers/${encodeURIComponent(storedIds.customerId)}`);
  }

  if (email) {
    const subscriptionParams = new URLSearchParams({
      "filter[store_id]": String(config.storeId),
      "filter[user_email]": email,
      "page[size]": "1"
    });
    urls.push(`${LEMON_BASE_API_URL}/subscriptions?${subscriptionParams.toString()}`);

    const customerParams = new URLSearchParams({
      "filter[store_id]": String(config.storeId),
      "filter[email]": email,
      "page[size]": "1"
    });
    urls.push(`${LEMON_BASE_API_URL}/customers?${customerParams.toString()}`);
  }

  for (const url of urls) {
    try {
      const data = await lemonRequest(url, config.apiKey, { method: "GET" });
      const subscription = Array.isArray(data?.data) ? data.data[0] : data?.data;
      const portalUrl = subscription?.attributes?.urls?.customer_portal;
      if (portalUrl) return portalUrl;
    } catch {
      // Si el ID local estuviera desfasado, probamos el siguiente metodo.
    }
  }

  return null;
}

async function getCustomerPortal(config, email) {
  const signedUrl = isEmail(email) ? await getSignedCustomerPortalUrl(config, email) : null;
  if (signedUrl) {
    return {
      portalUrl: signedUrl,
      signed: true
    };
  }

  return {
    portalUrl: null,
    signed: false
  };
}

function isPortalRequest(req, url, body) {
  const resource = url.searchParams.get("resource");
  const mode = body.mode || body.action || url.searchParams.get("mode");
  return resource === "portal" || mode === "portal";
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

    if (isPortalRequest(req, url, body)) {
      const portal = await getCustomerPortal(config, email);
      if (!portal.portalUrl) {
        json(res, 404, {
          ok: false,
          error: "customer_portal_not_found",
          message: "No hemos encontrado una suscripcion Premium para ese email. Usa el mismo email de compra o escribe a hola@inmoradar.app.",
          test_mode: Boolean(config.testMode)
        });
        return;
      }

      json(res, 200, {
        ok: true,
        portal_url: portal.portalUrl,
        signed: portal.signed,
        test_mode: Boolean(config.testMode)
      });
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
module.exports.getCustomerPortal = getCustomerPortal;
module.exports.getSignedCustomerPortalUrl = getSignedCustomerPortalUrl;
module.exports.getUnsignedCustomerPortalUrl = getUnsignedCustomerPortalUrl;
module.exports.lemonConfig = lemonConfig;
module.exports.lemonTestMode = lemonTestMode;
