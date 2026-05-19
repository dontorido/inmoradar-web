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
const { buildCloudflareEmailPayload, buildSavedPropertiesEmail } = require("./_reports/savedPropertiesEmail");

const DAILY_REPORT_LIMIT = 5;

function requestUrl(req) {
  return new URL(req.url || "/", `https://${req.headers.host || "www.inmoradar.app"}`);
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return req.body ? JSON.parse(req.body) : {};
  const rawBody = await readRawBody(req);
  return rawBody ? JSON.parse(rawBody) : {};
}

async function findSubscription(email) {
  if (!hasSupabaseConfig()) return null;
  const rows = await supabaseFetch(
    `premium_subscriptions?email=eq.${encodeURIComponent(email)}&select=email,status,renews_at,ends_at,provider,provider_subscription_id,updated_at&limit=1`
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

function cloudflareEmailConfig() {
  return {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_EMAIL_API_TOKEN,
    from: process.env.CLOUDFLARE_EMAIL_FROM || "hola@inmoradar.app"
  };
}

async function countReportsToday(email) {
  if (!hasSupabaseConfig()) return 0;
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  try {
    const rows = await supabaseFetch(
      `saved_property_email_reports?email=eq.${encodeURIComponent(email)}&created_at=gte.${encodeURIComponent(since.toISOString())}&select=id&limit=20`,
      { timeoutMs: 2500 }
    );
    return Array.isArray(rows) ? rows.length : 0;
  } catch {
    return 0;
  }
}

async function logReportAttempt({ email, report, status, providerResponse = null, errorText = null }) {
  if (!hasSupabaseConfig()) return;
  try {
    await supabaseFetch("saved_property_email_reports", {
      method: "POST",
      body: JSON.stringify([
        {
          email,
          properties_count: report?.summary?.count || report?.rows?.length || 0,
          status,
          provider: "cloudflare_email_service",
          provider_response_json: providerResponse || null,
          error_text: errorText || null
        }
      ]),
      timeoutMs: 2500
    });
  } catch {
    // El envio del email no debe fallar solo porque falte la tabla de auditoria.
  }
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

async function handleSavedPropertiesEmailReport(req, res) {
  if (req.method !== "POST") {
    json(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  const body = await readJsonBody(req);
  const email = normalizeEmail(body.email);
  const properties = Array.isArray(body.properties) ? body.properties : [];
  if (!isEmail(email)) {
    json(res, 400, { ok: false, error: "invalid_email" });
    return;
  }
  if (!properties.length) {
    json(res, 400, { ok: false, error: "properties_required" });
    return;
  }

  const subscription = await findSubscription(email);
  if (!isPremiumActive(subscription)) {
    json(res, 403, {
      ok: false,
      premium: false,
      error: "premium_required",
      message: "El envio por email esta disponible solo para usuarios Premium."
    });
    return;
  }

  const sentToday = await countReportsToday(email);
  if (sentToday >= DAILY_REPORT_LIMIT) {
    json(res, 429, {
      ok: false,
      error: "daily_report_limit_reached",
      message: `Has alcanzado el limite de ${DAILY_REPORT_LIMIT} emails diarios.`
    });
    return;
  }

  const report = buildSavedPropertiesEmail({ email, properties });
  const payload = buildCloudflareEmailPayload({
    email,
    from: cloudflareEmailConfig().from,
    report
  });

  try {
    const providerResponse = await sendCloudflareEmail(payload);
    await logReportAttempt({ email, report, status: "sent", providerResponse });
    json(res, 200, {
      ok: true,
      premium: true,
      email,
      properties_count: report.summary.count,
      provider: "cloudflare_email_service",
      delivered: providerResponse?.result?.delivered || [],
      queued: providerResponse?.result?.queued || [],
      sent_at: new Date().toISOString()
    });
  } catch (error) {
    await logReportAttempt({
      email,
      report,
      status: "failed",
      providerResponse: error.providerResponse || null,
      errorText: error.message
    });
    json(res, error.status || 500, {
      ok: false,
      premium: true,
      error: error.message || "email_send_failed",
      message:
        error.message === "cloudflare_email_not_configured"
          ? "Faltan las variables de Cloudflare Email Service en Vercel."
          : "No se ha podido enviar el informe ahora."
    });
  }
}

async function handlePremiumCheck(req, res) {
  let email = normalizeEmail(requestUrl(req).searchParams.get("email") || req.query?.email);
  if (!email && req.method === "POST") {
    const body = await readJsonBody(req);
    email = normalizeEmail(body.email);
  }

  if (!isEmail(email)) {
    json(res, 400, { ok: false, premium: false, error: "invalid_email" });
    return;
  }

  if (!hasSupabaseConfig()) {
    json(res, 200, {
      ok: true,
      premium: false,
      email,
      status: "not_configured",
      message: "Premium todavia no esta conectado."
    });
    return;
  }

  const subscription = await findSubscription(email);
  const premium = isPremiumActive(subscription);

  json(res, 200, {
    ok: true,
    premium,
    email,
    status: subscription?.status || "not_found",
    renews_at: subscription?.renews_at || null,
    ends_at: subscription?.ends_at || null,
    checked_at: new Date().toISOString()
  });
}

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!["GET", "POST"].includes(req.method)) {
    json(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    const resource = requestUrl(req).searchParams.get("resource");
    if (resource === "saved-properties-email-report") {
      await handleSavedPropertiesEmailReport(req, res);
      return;
    }
    await handlePremiumCheck(req, res);
  } catch (error) {
    console.error("[check-premium]", error);
    json(res, 500, {
      ok: false,
      premium: false,
      error: "premium_check_failed"
    });
  }
};

module.exports._private = {
  buildSavedPropertiesEmail,
  cloudflareEmailConfig,
  countReportsToday,
  findSubscription
};
