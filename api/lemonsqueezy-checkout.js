const crypto = require("node:crypto");
const {
  fetchWithTimeout,
  handleCors,
  hasSupabaseConfig,
  isEmail,
  isPremiumActive,
  json,
  normalizeEmail,
  readRawBody,
  supabaseFetch
} = require("./_utils");

const LEMON_API_URL = "https://api.lemonsqueezy.com/v1/checkouts";
const LEMON_BASE_API_URL = "https://api.lemonsqueezy.com/v1";
const PORTAL_TOKEN_TTL_MINUTES = 15;
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

function cloudflareEmailConfig() {
  return {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_EMAIL_API_TOKEN,
    from: process.env.CLOUDFLARE_EMAIL_FROM || "hola@inmoradar.app"
  };
}

function createPortalToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashPortalToken(token) {
  return crypto.createHash("sha256").update(String(token || ""), "utf8").digest("hex");
}

function buildCustomerPortalEmailPayload({ email, verifyUrl, from }) {
  return {
    from,
    to: email,
    subject: "Tu enlace de acceso a InmoRadar",
    text: [
      "Hola,",
      "",
      "Has pedido acceder al area de clientes de InmoRadar.",
      `Abre este enlace para gestionar tu suscripcion Premium: ${verifyUrl}`,
      "",
      `El enlace caduca en ${PORTAL_TOKEN_TTL_MINUTES} minutos y solo puede usarse una vez.`,
      "",
      "Si no has pedido este acceso, puedes ignorar este email.",
      "",
      "InmoRadar"
    ].join("\n"),
    html: `
      <div style="font-family:Inter,Arial,sans-serif;background:#0A0A0A;color:#FFFFFF;padding:32px;">
        <div style="max-width:560px;margin:0 auto;background:#111111;border:1px solid #262626;padding:28px;">
          <p style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#CCFF00;margin:0 0 16px;">InmoRadar</p>
          <h1 style="font-size:28px;line-height:1.1;margin:0 0 14px;">Acceso seguro al area de clientes</h1>
          <p style="color:#D4D4D4;line-height:1.6;margin:0 0 22px;">Usa este enlace para gestionar tu suscripcion Premium, revisar pagos o cancelar la renovacion.</p>
          <p style="margin:0 0 26px;"><a href="${verifyUrl}" style="display:inline-block;background:#CCFF00;color:#0A0A0A;text-decoration:none;font-weight:700;padding:14px 20px;border-radius:999px;">Abrir area de clientes</a></p>
          <p style="color:#A3A3A3;font-size:13px;line-height:1.6;margin:0;">El enlace caduca en ${PORTAL_TOKEN_TTL_MINUTES} minutos y solo puede usarse una vez. Si no lo has pedido, puedes ignorar este email.</p>
        </div>
      </div>
    `
  };
}

async function sendCloudflareEmail(payload) {
  const config = cloudflareEmailConfig();
  if (!config.accountId || !config.apiToken) {
    const error = new Error("cloudflare_email_not_configured");
    error.status = 500;
    throw error;
  }

  const response = await fetchWithTimeout(
    `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/email/sending/send`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(payload),
      timeoutMs: 12000
    }
  );
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.success === false) {
    const message = body?.errors?.[0]?.message || `cloudflare_email_http_${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.providerResponse = body;
    throw error;
  }
  return body;
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

async function findStoredBillingRecord(email) {
  if (!email || !hasSupabaseConfig()) {
    return {
      customerId: null,
      subscriptionId: null,
      subscription: null
    };
  }

  try {
    const params = new URLSearchParams({
      email: `eq.${email}`,
      select: "provider_customer_id,provider_subscription_id,status,renews_at,ends_at,trial_ends_at,updated_at",
      order: "updated_at.desc",
      limit: "1"
    });
    const rows = await supabaseFetch(`premium_subscriptions?${params.toString()}`, { timeoutMs: 3000 });
    const row = Array.isArray(rows) ? rows[0] : null;
    return {
      customerId: row?.provider_customer_id || null,
      subscriptionId: row?.provider_subscription_id || null,
      subscription: row || null
    };
  } catch {
    return {
      customerId: null,
      subscriptionId: null,
      subscription: null
    };
  }
}

async function getSignedCustomerPortalUrl(config, email) {
  const storedIds = await findStoredBillingRecord(email);
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

function portalTokenExpiry(now = new Date()) {
  return new Date(now.getTime() + PORTAL_TOKEN_TTL_MINUTES * 60 * 1000).toISOString();
}

function hashRequestIp(req) {
  const forwardedFor = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const ip = forwardedFor || String(req.socket?.remoteAddress || "");
  return ip ? crypto.createHash("sha256").update(ip, "utf8").digest("hex") : null;
}

async function storePortalAccessToken({ email, token, req }) {
  if (!hasSupabaseConfig()) {
    const error = new Error("supabase_not_configured");
    error.status = 500;
    throw error;
  }

  const tokenHash = hashPortalToken(token);
  await supabaseFetch("customer_portal_access_tokens", {
    method: "POST",
    headers: {
      prefer: "return=minimal"
    },
    body: JSON.stringify([
      {
        email,
        token_hash: tokenHash,
        purpose: "customer_portal",
        expires_at: portalTokenExpiry(),
        request_ip_hash: hashRequestIp(req),
        user_agent: String(req.headers["user-agent"] || "").slice(0, 300) || null
      }
    ]),
    timeoutMs: 3000
  });
  return tokenHash;
}

async function findPortalAccessToken(token) {
  if (!hasSupabaseConfig()) return null;
  const tokenHash = hashPortalToken(token);
  const params = new URLSearchParams({
    token_hash: `eq.${tokenHash}`,
    select: "email,token_hash,expires_at,used_at,created_at",
    limit: "1"
  });
  const rows = await supabaseFetch(`customer_portal_access_tokens?${params.toString()}`, { timeoutMs: 3000 });
  const row = Array.isArray(rows) ? rows[0] : null;
  return row || null;
}

async function claimPortalAccessToken(tokenHash) {
  if (!hasSupabaseConfig() || !tokenHash) return false;
  const rows = await supabaseFetch(`customer_portal_access_tokens?token_hash=eq.${encodeURIComponent(tokenHash)}&used_at=is.null`, {
    method: "PATCH",
    headers: {
      prefer: "return=representation"
    },
    body: JSON.stringify({
      used_at: new Date().toISOString()
    }),
    timeoutMs: 3000
  });
  return Array.isArray(rows) && rows.length > 0;
}

async function handlePortalMagicLinkRequest({ req, res, email }) {
  if (!isEmail(email)) {
    json(res, 400, { ok: false, error: "invalid_email" });
    return;
  }
  if (!hasSupabaseConfig()) {
    json(res, 500, {
      ok: false,
      error: "secure_portal_not_configured",
      message: "El acceso seguro de clientes necesita Supabase para guardar enlaces temporales."
    });
    return;
  }

  const billing = await findStoredBillingRecord(email);
  const genericPayload = {
    ok: true,
    link_sent: true,
    message: "Si ese email tiene una suscripcion Premium activa, recibira un enlace de acceso en unos segundos."
  };

  if (!isPremiumActive(billing.subscription)) {
    json(res, 200, genericPayload);
    return;
  }

  const token = createPortalToken();
  const verifyUrl = `${siteUrl(req)}/clientes?token=${encodeURIComponent(token)}`;
  await storePortalAccessToken({ email, token, req });
  await sendCloudflareEmail(
    buildCustomerPortalEmailPayload({
      email,
      verifyUrl,
      from: cloudflareEmailConfig().from
    })
  );

  json(res, 200, genericPayload);
}

async function handlePortalMagicLinkVerify({ res, config, token }) {
  if (!token || String(token).length < 32) {
    json(res, 400, { ok: false, error: "invalid_token" });
    return;
  }

  const accessToken = await findPortalAccessToken(token);
  const now = Date.now();
  if (!accessToken) {
    json(res, 404, { ok: false, error: "token_not_found", message: "El enlace no es valido o ya ha caducado." });
    return;
  }
  if (accessToken.used_at) {
    json(res, 410, { ok: false, error: "token_already_used", message: "Este enlace ya se ha utilizado." });
    return;
  }
  if (!accessToken.expires_at || new Date(accessToken.expires_at).getTime() <= now) {
    json(res, 410, { ok: false, error: "token_expired", message: "Este enlace ha caducado. Pide uno nuevo." });
    return;
  }

  const billing = await findStoredBillingRecord(accessToken.email);
  if (!isPremiumActive(billing.subscription)) {
    json(res, 403, { ok: false, error: "premium_required", message: "No hemos encontrado una suscripcion Premium activa." });
    return;
  }

  const claimed = await claimPortalAccessToken(accessToken.token_hash);
  if (!claimed) {
    json(res, 410, { ok: false, error: "token_already_used", message: "Este enlace ya se ha utilizado." });
    return;
  }

  const portal = await getCustomerPortal(config, accessToken.email);
  if (!portal.portalUrl) {
    json(res, 404, {
      ok: false,
      error: "customer_portal_not_found",
      message: "No hemos podido generar el portal seguro. Escribe a hola@inmoradar.app."
    });
    return;
  }

  json(res, 200, {
    ok: true,
    portal_url: portal.portalUrl,
    signed: true,
    email: accessToken.email,
    expires_in_minutes: PORTAL_TOKEN_TTL_MINUTES
  });
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
    const portalToken = String(body.token || url.searchParams.get("token") || "").trim();
    const source = String(body.source || url.searchParams.get("source") || "premium_page").slice(0, 80);
    if (email && !isEmail(email)) {
      json(res, 400, { ok: false, error: "invalid_email" });
      return;
    }

    if (isPortalRequest(req, url, body)) {
      if (portalToken) {
        await handlePortalMagicLinkVerify({ res, config, token: portalToken });
        return;
      }
      await handlePortalMagicLinkRequest({ req, res, email });
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
module.exports.buildCustomerPortalEmailPayload = buildCustomerPortalEmailPayload;
module.exports.createPortalToken = createPortalToken;
module.exports.getCustomerPortal = getCustomerPortal;
module.exports.getSignedCustomerPortalUrl = getSignedCustomerPortalUrl;
module.exports.getUnsignedCustomerPortalUrl = getUnsignedCustomerPortalUrl;
module.exports.hashPortalToken = hashPortalToken;
module.exports.lemonConfig = lemonConfig;
module.exports.lemonTestMode = lemonTestMode;
module.exports.portalTokenExpiry = portalTokenExpiry;
