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
const { buildCloudflareEmailPayload, buildSavedPropertiesEmail } = require("./_reports/savedPropertiesEmail");

const DAILY_REPORT_LIMIT = 5;
const REPORT_ACCESS_TTL_DAYS = 14;
const REPORT_PROVIDER = "cloudflare_email_service";
const SHARE_REPORT_PROVIDER = "cloudflare_email_service_share";

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

function publicSiteUrl(req) {
  const explicit = process.env.PUBLIC_SITE_URL || process.env.INMORADAR_SITE_URL || process.env.SITE_URL;
  if (explicit) return String(explicit).replace(/\/+$/, "");
  const host = req.headers.host || "www.inmoradar.app";
  const protocol = /localhost|127\.0\.0\.1/i.test(host) ? "http" : "https";
  return `${protocol}://${host}`;
}

function createReportToken() {
  return `imr_${crypto.randomBytes(32).toString("base64url")}`;
}

function hashReportToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function reportUrlForToken(req, token) {
  return `${publicSiteUrl(req)}/inmuebles-guardados?token=${encodeURIComponent(token)}`;
}

function reportExpiresAt() {
  const date = new Date();
  date.setDate(date.getDate() + REPORT_ACCESS_TTL_DAYS);
  return date.toISOString();
}

function reportAccessJson(report) {
  return {
    generated_at: report.generatedAt,
    summary: report.summary,
    rows: report.rows,
    report_url: report.reportUrl,
    preview_image_url: report.previewImageUrl
  };
}

function legacyReportAccessMarker(tokenHash) {
  return `report_access:${tokenHash}`;
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

async function createReportAccess({ email, report, tokenHash, expiresAt, provider = REPORT_PROVIDER }) {
  if (!hasSupabaseConfig()) throw new Error("Supabase is not configured");
  const reportJson = reportAccessJson(report);
  try {
    await supabaseFetch("saved_property_email_reports", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify([
        {
          email,
          properties_count: report.summary.count,
          status: "sent",
          provider,
          access_token_hash: tokenHash,
          access_token_expires_at: expiresAt,
          report_json: reportJson
        }
      ]),
      timeoutMs: 3000
    });
    return { mode: "modern" };
  } catch (modernError) {
    await supabaseFetch("saved_property_email_reports", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify([
        {
          email,
          properties_count: report.summary.count,
          status: "sent",
          provider,
          provider_response_json: {
            access_token_hash: tokenHash,
            access_token_expires_at: expiresAt,
            report_json: reportJson,
            storage_mode: "legacy_provider_response_json"
          },
          error_text: legacyReportAccessMarker(tokenHash)
        }
      ]),
      timeoutMs: 3000
    });
    return { mode: "legacy", fallback_from: modernError.message || "modern_report_access_failed" };
  }
}

async function findSavedPropertiesReportByTokenHash(tokenHash) {
  let record = null;
  try {
    const modernRows = await supabaseFetch(
      `saved_property_email_reports?access_token_hash=eq.${encodeURIComponent(tokenHash)}&status=eq.sent&select=email,properties_count,provider,report_json,access_token_expires_at,created_at,status&limit=1`,
      { timeoutMs: 3000 }
    );
    record = Array.isArray(modernRows) ? modernRows[0] || null : null;
  } catch {
    record = null;
  }
  if (record?.report_json) return record;

  const legacyRows = await supabaseFetch(
    `saved_property_email_reports?error_text=eq.${encodeURIComponent(legacyReportAccessMarker(tokenHash))}&status=eq.sent&select=email,properties_count,provider,provider_response_json,created_at,status&limit=1`,
    { timeoutMs: 3000 }
  );
  const legacyRecord = Array.isArray(legacyRows) ? legacyRows[0] || null : null;
  const legacyJson = legacyRecord?.provider_response_json || null;
  if (!legacyJson?.report_json) return null;
  return {
    email: legacyRecord.email,
    properties_count: legacyRecord.properties_count,
    provider: legacyRecord.provider,
    report_json: legacyJson.report_json,
    access_token_expires_at: legacyJson.access_token_expires_at || null,
    created_at: legacyRecord.created_at,
    status: legacyRecord.status
  };
}

async function updateReportAccess({ tokenHash, storageMode = "modern", status, providerResponse = null, errorText = null }) {
  if (!hasSupabaseConfig() || !tokenHash) return;
  try {
    const query =
      storageMode === "legacy"
        ? `saved_property_email_reports?error_text=eq.${encodeURIComponent(legacyReportAccessMarker(tokenHash))}`
        : `saved_property_email_reports?access_token_hash=eq.${encodeURIComponent(tokenHash)}`;
    const body =
      storageMode === "legacy"
        ? {
            status,
            ...(status === "failed" ? { error_text: errorText || null } : {})
          }
        : {
            status,
            provider_response_json: providerResponse || null,
            error_text: errorText || null
          };
    await supabaseFetch(query, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(body),
      timeoutMs: 2500
    });
  } catch {
    // No bloquea el resultado del envio.
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
  const privacyAccepted = body.privacyAccepted === true;
  if (!isEmail(email)) {
    json(res, 400, { ok: false, error: "invalid_email" });
    return;
  }
  if (!privacyAccepted) {
    json(res, 400, {
      ok: false,
      error: "privacy_required",
      message: "Debes aceptar la politica de privacidad para enviar el informe."
    });
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

  const accessToken = createReportToken();
  const tokenHash = hashReportToken(accessToken);
  const expiresAt = reportExpiresAt();
  const report = buildSavedPropertiesEmail({
    email,
    properties,
    reportUrl: reportUrlForToken(req, accessToken),
    siteUrl: publicSiteUrl(req)
  });
  const reportAccess = await createReportAccess({ email, report, tokenHash, expiresAt });
  const payload = buildCloudflareEmailPayload({
    email,
    from: cloudflareEmailConfig().from,
    report
  });

  try {
    const providerResponse = await sendCloudflareEmail(payload);
    await updateReportAccess({ tokenHash, storageMode: reportAccess.mode, status: "sent", providerResponse });
    json(res, 200, {
      ok: true,
      premium: true,
      email,
      properties_count: report.summary.count,
      report_url: report.reportUrl,
      expires_at: expiresAt,
      provider: REPORT_PROVIDER,
      delivered: providerResponse?.result?.delivered || [],
      queued: providerResponse?.result?.queued || [],
      sent_at: new Date().toISOString()
    });
  } catch (error) {
    await updateReportAccess({
      tokenHash,
      storageMode: reportAccess.mode,
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

async function handleSavedPropertiesShare(req, res) {
  if (req.method !== "POST") {
    json(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  const body = await readJsonBody(req);
  const token = body.token || requestUrl(req).searchParams.get("token") || req.query?.token || "";
  const email = normalizeEmail(body.email || body.recipientEmail);
  if (!/^imr_[A-Za-z0-9_-]{32,120}$/.test(token)) {
    json(res, 400, { ok: false, error: "invalid_token" });
    return;
  }
  if (!isEmail(email)) {
    json(res, 400, { ok: false, error: "invalid_email" });
    return;
  }
  if (!hasSupabaseConfig()) {
    json(res, 503, { ok: false, error: "report_store_not_configured" });
    return;
  }

  const sourceTokenHash = hashReportToken(token);
  const sourceRecord = await findSavedPropertiesReportByTokenHash(sourceTokenHash);
  if (!sourceRecord?.report_json) {
    json(res, 404, { ok: false, error: "report_not_found" });
    return;
  }
  if (sourceRecord.access_token_expires_at && new Date(sourceRecord.access_token_expires_at).getTime() < Date.now()) {
    json(res, 410, { ok: false, error: "report_expired" });
    return;
  }

  const properties = Array.isArray(sourceRecord.report_json.rows) ? sourceRecord.report_json.rows : [];
  if (!properties.length) {
    json(res, 400, { ok: false, error: "properties_required" });
    return;
  }

  const accessToken = createReportToken();
  const tokenHash = hashReportToken(accessToken);
  const expiresAt = reportExpiresAt();
  const report = buildSavedPropertiesEmail({
    email,
    properties,
    reportUrl: reportUrlForToken(req, accessToken),
    siteUrl: publicSiteUrl(req)
  });
  const reportAccess = await createReportAccess({
    email,
    report,
    tokenHash,
    expiresAt,
    provider: SHARE_REPORT_PROVIDER
  });
  const payload = buildCloudflareEmailPayload({
    email,
    from: cloudflareEmailConfig().from,
    report
  });

  try {
    const providerResponse = await sendCloudflareEmail(payload);
    await updateReportAccess({ tokenHash, storageMode: reportAccess.mode, status: "sent", providerResponse });
    json(res, 200, {
      ok: true,
      shared: true,
      email,
      properties_count: report.summary.count,
      report_url: report.reportUrl,
      expires_at: expiresAt,
      provider: SHARE_REPORT_PROVIDER,
      delivered: providerResponse?.result?.delivered || [],
      queued: providerResponse?.result?.queued || [],
      sent_at: new Date().toISOString()
    });
  } catch (error) {
    await updateReportAccess({
      tokenHash,
      storageMode: reportAccess.mode,
      status: "failed",
      providerResponse: error.providerResponse || null,
      errorText: error.message
    });
    json(res, error.status || 500, {
      ok: false,
      shared: false,
      error: error.message || "email_send_failed",
      message:
        error.message === "cloudflare_email_not_configured"
          ? "Faltan las variables de Cloudflare Email Service en Vercel."
          : "No se ha podido compartir el informe ahora."
    });
  }
}

async function handleSavedPropertiesReport(req, res) {
  if (req.method !== "GET") {
    json(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }
  const token = requestUrl(req).searchParams.get("token") || req.query?.token || "";
  if (!/^imr_[A-Za-z0-9_-]{32,120}$/.test(token)) {
    json(res, 400, { ok: false, error: "invalid_token" });
    return;
  }
  if (!hasSupabaseConfig()) {
    json(res, 503, { ok: false, error: "report_store_not_configured" });
    return;
  }
  const tokenHash = hashReportToken(token);
  const record = await findSavedPropertiesReportByTokenHash(tokenHash);
  if (!record?.report_json) {
    json(res, 404, { ok: false, error: "report_not_found" });
    return;
  }
  if (record.access_token_expires_at && new Date(record.access_token_expires_at).getTime() < Date.now()) {
    json(res, 410, { ok: false, error: "report_expired" });
    return;
  }
  json(res, 200, {
    ok: true,
    properties_count: record.properties_count || record.report_json?.rows?.length || 0,
    expires_at: record.access_token_expires_at || null,
    created_at: record.created_at || null,
    report: record.report_json
  });
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
    if (resource === "saved-properties-report") {
      await handleSavedPropertiesReport(req, res);
      return;
    }
    if (resource === "saved-properties-share") {
      await handleSavedPropertiesShare(req, res);
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
  findSavedPropertiesReportByTokenHash,
  findSubscription,
  SHARE_REPORT_PROVIDER
};
