const { fetchWithTimeout, sanitizeErrorMessage } = require("./_utils");

const DEFAULT_TO_EMAIL = "hola@inmoradar.app";
const DEFAULT_FROM_EMAIL = "noreply@inmoradar.app";
const DEFAULT_SITE_URL = "https://www.inmoradar.app";
const DAY_MS = 24 * 60 * 60 * 1000;
const DIRECT_SOURCE_LABEL = "Directo / no atribuido";

const RELIABLE_INSTALL_ACTIVATION_EVENTS = new Set([
  "extension_installed",
  "extension_install",
  "extension_opened",
  "extension_opened_without_listing",
  "listing_detected",
  "analysis_started",
  "analysis_completed",
  "page_analyzed",
  "page_analysis_completed"
]);

const UNRELIABLE_INSTALL_EVENTS = new Set([
  "install_click",
  "chrome_store_click",
  "seo_cta_click",
  "guide_cta_click",
  "article_cta_click",
  "waitlist_open",
  "waitlist_submit",
  "premium_click",
  "checkout_start",
  "checkout_created",
  "checkout_error",
  "cta_clicked",
  "heartbeat",
  "session_started",
  "session_ended",
  "listing_not_detected",
  "error"
]);

function cleanText(value, fallback = "No disponible") {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text || fallback;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeToken(value, fallback = "", maxLength = 80) {
  const text = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, maxLength);
  return text || fallback;
}

function boolish(value) {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;
  const text = String(value).trim().toLowerCase();
  return Boolean(text && !["0", "false", "no", "null", "undefined"].includes(text));
}

function mergedMetadata(event = {}, input = {}) {
  const eventMetadata = event.metadata && typeof event.metadata === "object" ? event.metadata : {};
  const inputMetadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
  return { ...inputMetadata, ...eventMetadata };
}

function emailAddressOnly(value) {
  const text = String(value || "").trim();
  const match = text.match(/<([^>]+)>/);
  return (match ? match[1] : text).toLowerCase();
}

function avoidSameMailbox(from, to) {
  return emailAddressOnly(from) === emailAddressOnly(to) ? DEFAULT_FROM_EMAIL : from;
}

function safeUrl(value, fallback = DEFAULT_SITE_URL) {
  try {
    return new URL(String(value || fallback)).toString().replace(/\/+$/, "");
  } catch {
    return fallback;
  }
}

function dashboardUrlFromEnv(env = process.env) {
  if (env.INSTALL_NOTIFICATION_DASHBOARD_URL) return safeUrl(env.INSTALL_NOTIFICATION_DASHBOARD_URL);
  const siteUrl = safeUrl(env.PUBLIC_SITE_URL || env.SITE_URL || DEFAULT_SITE_URL);
  return `${siteUrl}/admin`;
}

function installNotificationConfig(env = process.env) {
  const to = env.EMAIL_TO_INSTALL_NOTIFICATIONS || env.INSTALL_NOTIFICATION_EMAIL_TO || DEFAULT_TO_EMAIL;
  return {
    to,
    dashboardUrl: dashboardUrlFromEnv(env),
    cloudflare: {
      accountId: env.CLOUDFLARE_ACCOUNT_ID,
      apiToken: env.CLOUDFLARE_EMAIL_API_TOKEN,
      from: avoidSameMailbox(
        env.CLOUDFLARE_INSTALL_NOTIFICATION_EMAIL_FROM || env.CLOUDFLARE_EMAIL_FROM || DEFAULT_FROM_EMAIL,
        to
      )
    },
    resend: {
      apiToken: env.RESEND_API_KEY,
      from: avoidSameMailbox(
        env.RESEND_INSTALL_NOTIFICATION_EMAIL_FROM || env.RESEND_EMAIL_FROM || `InmoRadar <${DEFAULT_FROM_EMAIL}>`,
        to
      )
    }
  };
}

function isReliableInstallActivationEvent(event = {}, input = {}) {
  if (!event.anonymous_id_hash) return false;
  const eventName = normalizeToken(event.event_name, "", 48);
  if (!eventName || UNRELIABLE_INSTALL_EVENTS.has(eventName)) return false;
  if (!RELIABLE_INSTALL_ACTIVATION_EVENTS.has(eventName)) return false;

  if (eventName === "extension_installed" || eventName === "extension_install") {
    const metadata = mergedMetadata(event, input);
    const reason = normalizeToken(metadata.reason || metadata.install_reason || input.reason || input.install_reason, "", 32);
    const hasPreviousVersion = boolish(
      metadata.has_previous_version ||
        metadata.hasPreviousVersion ||
        input.has_previous_version ||
        input.hasPreviousVersion ||
        input.previous_version ||
        input.previousVersion
    );
    if (reason && reason !== "install") return false;
    if (hasPreviousVersion) return false;
  }

  return true;
}

function createdMs(row) {
  const ms = new Date(row?.created_at).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function formatMetric(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "No disponible";
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(number);
}

function formatDateTime(value, timeZone = "Europe/Madrid") {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "No disponible";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone
  }).format(date);
}

function normalizeComparableText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sourceLabelFromMetadata(metadata = {}) {
  const utm = metadata.utm && typeof metadata.utm === "object" ? metadata.utm : {};
  const rawSource =
    metadata.install_source ||
    metadata.acquisition_source ||
    metadata.acquisitionSource ||
    metadata.utm_source ||
    utm.source ||
    metadata.source ||
    "";
  const rawMedium = metadata.utm_medium || utm.medium || "";
  const source = normalizeComparableText(`${rawSource} ${rawMedium}`);

  if (!source) return DIRECT_SOURCE_LABEL;
  if (/chrome web store|chrome store|chromewebstore|chrome_web_store|webstore|cws/.test(source)) {
    return "Chrome Web Store";
  }
  if (/google|seo|organic|busqueda|search/.test(source)) return "SEO / Google";
  if (/^extension$/.test(source)) return DIRECT_SOURCE_LABEL;
  if (/direct|none|not set|unknown|sin atribuir|no atribuido/.test(source)) return DIRECT_SOURCE_LABEL;

  return cleanText(rawSource || rawMedium, DIRECT_SOURCE_LABEL)
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function campaignFromMetadata(metadata = {}) {
  const utm = metadata.utm && typeof metadata.utm === "object" ? metadata.utm : {};
  return cleanText(metadata.campaign || metadata.utm_campaign || utm.campaign);
}

function earliestInstallRows(rows = []) {
  const byUser = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row?.anonymous_id_hash) continue;
    const current = byUser.get(row.anonymous_id_hash);
    if (!current || createdMs(row) < createdMs(current)) byUser.set(row.anonymous_id_hash, row);
  }
  return Array.from(byUser.values());
}

function summarizeInstallMetrics(rows = [], now = new Date()) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const reliableRows = safeRows.filter((row) => isReliableInstallActivationEvent(row));
  const installs = earliestInstallRows(reliableRows);
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const cutoff7d = nowMs - 7 * DAY_MS;
  const activeUsers7d = new Set(
    reliableRows
      .filter((row) => row.anonymous_id_hash && createdMs(row) >= cutoff7d && createdMs(row) <= nowMs)
      .map((row) => row.anonymous_id_hash)
  ).size;
  const sourceCounts = installs.reduce((acc, row) => {
    const label = sourceLabelFromMetadata(row.metadata || {});
    acc.set(label, (acc.get(label) || 0) + 1);
    return acc;
  }, new Map());
  const sourceSummary = Array.from(sourceCounts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return {
    totalInstalls: installs.length,
    installs7d: installs.filter((row) => createdMs(row) >= cutoff7d && createdMs(row) <= nowMs).length,
    activeUsers7d,
    sourceSummary,
    topSource: sourceSummary[0]?.label || null
  };
}

function buildInstallNotificationPayload({ event = {}, input = {}, eventCreatedAt, metrics = null, env = process.env } = {}) {
  const metadata = mergedMetadata(event, input);
  const sourceLabel = sourceLabelFromMetadata(metadata);
  const campaign = campaignFromMetadata(metadata);
  const topSource = metrics?.topSource || sourceLabel;
  return {
    subject: "Nueva instalacion de InmoRadar",
    preheader: "InmoRadar suma una instalacion o activacion fiable.",
    dashboardUrl: dashboardUrlFromEnv(env),
    event: {
      eventName: event.event_name || "extension_usage",
      createdAt: eventCreatedAt || new Date().toISOString(),
      sourceLabel,
      campaign
    },
    metrics,
    quickRead:
      topSource === "Chrome Web Store"
        ? "Nueva senal fiable desde Chrome Web Store. Revisa adquisicion y activacion en el dashboard."
        : "Nueva senal fiable registrada. Revisa fuente, totales y usuarios activos en el dashboard."
  };
}

function renderInstallNotificationEmail(payload = {}) {
  const metrics = payload.metrics || null;
  const event = payload.event || {};
  const source = cleanText(event.sourceLabel);
  const campaign = cleanText(event.campaign);
  const eventDate = formatDateTime(event.createdAt);
  const dashboardUrl = payload.dashboardUrl || DEFAULT_SITE_URL;
  const totalInstalls = formatMetric(metrics?.totalInstalls);
  const installs7d = formatMetric(metrics?.installs7d);
  const activeUsers7d = formatMetric(metrics?.activeUsers7d);
  const channelTop = cleanText(metrics?.topSource);
  const sourceSummary = metrics?.sourceSummary || [];

  const html = `<!doctype html>
<html lang="es">
<body style="margin:0;background:#f7f7f6;background-image:radial-gradient(#dedbd3 1px, transparent 1px);background-size:18px 18px;color:#111111;font-family:Arial,Helvetica,sans-serif;">
  <main style="max-width:720px;margin:0 auto;padding:28px 16px;">
    <p style="margin:0 0 18px;color:#111111;font-size:22px;font-weight:900;">Inmo<span style="color:#ff5a1f;">Radar</span></p>
    <span style="display:inline-block;background:#fff4ec;border:1px solid #ffd4bd;color:#a33a0b;border-radius:999px;padding:8px 12px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;font-weight:800;">ANALISIS INMOBILIARIO ANTES DE CONTACTAR</span>
    <h1 style="margin:18px 0 14px;color:#111111;font-size:46px;line-height:1;font-weight:900;">Nuevo usuario detectado.</h1>
    <p style="margin:0 0 22px;color:#4d4943;font-size:16px;line-height:1.55;">Se ha registrado una instalacion o activacion fiable de la extension.</p>
    <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;background:#ff5a1f;color:#ffffff;text-decoration:none;border-radius:999px;padding:14px 22px;font-size:14px;font-weight:800;">Ver dashboard</a>
    <section style="margin-top:24px;background:#ffffff;border:1px solid #e9e3da;border-radius:24px;padding:22px;">
      <p style="margin:0 0 8px;color:#6d665d;font-size:12px;font-weight:800;">Vista previa - InmoRadar</p>
      <p style="margin:0;color:#111111;font-size:18px;font-weight:900;">+1 nueva alta de extension</p>
      <p style="margin:12px 0 0;color:#4d4943;line-height:1.65;">Fecha/hora: ${escapeHtml(eventDate)}<br>Fuente estimada: ${escapeHtml(source)}<br>Campana: ${escapeHtml(campaign)}</p>
    </section>
    <section style="margin-top:16px;background:#ffffff;border:1px solid #e9e3da;border-radius:24px;padding:22px;">
      <p style="margin:0 0 12px;color:#111111;font-size:16px;font-weight:900;">Metricas</p>
      <p style="margin:0;color:#4d4943;line-height:1.7;">Total: ${escapeHtml(totalInstalls)}<br>Ultimos 7 dias: ${escapeHtml(installs7d)}<br>Activos 7d: ${escapeHtml(activeUsers7d)}<br>Canal top: ${escapeHtml(channelTop)}</p>
    </section>
    <section style="margin-top:16px;background:#111111;border-radius:24px;padding:22px;">
      <p style="margin:0 0 8px;color:#ffb28b;font-size:11px;letter-spacing:.14em;text-transform:uppercase;font-weight:800;">Lectura rapida</p>
      <p style="margin:0;color:#ffffff;font-size:15px;line-height:1.6;">${escapeHtml(payload.quickRead)}</p>
    </section>
    <p style="margin:18px 0 0;color:#756f67;font-size:12px;line-height:1.55;">Privacidad: este aviso usa metricas anonimas. No incluye IP, user-agent completo, email de usuario ni datos personales innecesarios.</p>
  </main>
</body>
</html>`;

  const text = [
    payload.subject || "Nueva instalacion de InmoRadar",
    "",
    payload.preheader || "InmoRadar suma una instalacion o activacion fiable.",
    "",
    `Fecha/hora: ${eventDate}`,
    `Fuente estimada: ${source}`,
    `Campana: ${campaign}`,
    `Total instalaciones: ${totalInstalls}`,
    `Instalaciones ultimos 7 dias: ${installs7d}`,
    `Usuarios activos ultimos 7 dias: ${activeUsers7d}`,
    `Canal top: ${channelTop}`,
    "",
    "Resumen por fuente:",
    ...(sourceSummary.length ? sourceSummary : [{ label: "No disponible", count: null }]).map(
      (item) => `- ${item.label}: ${formatMetric(item.count)}`
    ),
    "",
    `Lectura rapida: ${payload.quickRead}`,
    "",
    `Dashboard: ${dashboardUrl}`,
    "",
    "Privacidad: no se incluye IP, user-agent completo, email de usuario ni datos personales innecesarios."
  ].join("\n");

  return { subject: payload.subject || "Nueva instalacion de InmoRadar", html, text };
}

function buildResendInstallEmailPayload({ payload, from, to }) {
  const email = renderInstallNotificationEmail(payload);
  return {
    to: [to],
    from,
    subject: email.subject,
    html: email.html,
    text: email.text,
    headers: { "X-InmoRadar-Notification": "extension-install" }
  };
}

function buildCloudflareInstallEmailPayload({ payload, from, to }) {
  const email = renderInstallNotificationEmail(payload);
  return {
    to,
    from,
    subject: email.subject,
    html: email.html,
    text: email.text,
    headers: { "X-InmoRadar-Notification": "extension-install" }
  };
}

async function sendInstallNotificationEmail(payload, options = {}) {
  const env = options.env || process.env;
  const config = installNotificationConfig(env);
  const fetchImpl = options.fetchImpl || fetchWithTimeout;

  if (config.resend.apiToken) {
    const resendPayload = buildResendInstallEmailPayload({ payload, from: config.resend.from, to: config.to });
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.resend.apiToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(resendPayload),
      timeoutMs: 12000
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.error) {
      return {
        ok: false,
        skipped: false,
        provider: "resend",
        reason: sanitizeErrorMessage(body?.message || body?.error?.message || `resend_http_${response.status}`),
        status: response.status
      };
    }
    return { ok: true, provider: "resend", response: body };
  }

  if (!config.cloudflare.accountId || !config.cloudflare.apiToken) {
    return { ok: false, skipped: true, reason: "email_provider_not_configured" };
  }

  const cloudflarePayload = buildCloudflareInstallEmailPayload({
    payload,
    from: config.cloudflare.from,
    to: config.to
  });
  const response = await fetchImpl(
    `https://api.cloudflare.com/client/v4/accounts/${config.cloudflare.accountId}/email/sending/send`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.cloudflare.apiToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(cloudflarePayload),
      timeoutMs: 12000
    }
  );
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.success === false) {
    return {
      ok: false,
      skipped: false,
      provider: "cloudflare_email_service",
      reason: sanitizeErrorMessage(body?.errors?.[0]?.message || `cloudflare_email_http_${response.status}`),
      status: response.status
    };
  }

  return { ok: true, provider: "cloudflare_email_service", response: body };
}

async function hasPriorExtensionUsageEvent({ anonymousIdHash, beforeCreatedAt, supabaseFetch }) {
  if (!anonymousIdHash || typeof supabaseFetch !== "function") return true;
  const params = new URLSearchParams({
    select: "event_name",
    order: "created_at.asc",
    limit: "100"
  });
  params.set("anonymous_id_hash", `eq.${anonymousIdHash}`);
  if (beforeCreatedAt) params.set("created_at", `lt.${beforeCreatedAt}`);
  const rows = await supabaseFetch(`extension_usage_events?${params.toString()}`);
  return (Array.isArray(rows) ? rows : []).some((row) =>
    isReliableInstallActivationEvent({ event_name: row.event_name, anonymous_id_hash: anonymousIdHash })
  );
}

async function loadInstallMetricRows({ supabaseFetch, limit = 10000 }) {
  if (typeof supabaseFetch !== "function") return null;
  const params = new URLSearchParams({
    select: "event_name,anonymous_id_hash,metadata,created_at",
    order: "created_at.asc",
    limit: String(limit)
  });
  const rows = await supabaseFetch(`extension_usage_events?${params.toString()}`);
  return Array.isArray(rows) ? rows : [];
}

async function notifyReliableInstallActivation({
  event,
  input = {},
  eventCreatedAt,
  supabaseFetch,
  env = process.env,
  logger = console,
  sendEmail = sendInstallNotificationEmail
} = {}) {
  if (!isReliableInstallActivationEvent(event, input)) {
    return { ok: false, skipped: true, reason: "not_reliable_install_activation_event" };
  }

  let metrics = null;
  try {
    const rows = await loadInstallMetricRows({ supabaseFetch });
    if (rows) metrics = summarizeInstallMetrics(rows, new Date(eventCreatedAt || Date.now()));
  } catch (error) {
    logger.warn("[extension-usage] install notification metrics unavailable", sanitizeErrorMessage(error));
  }

  const payload = buildInstallNotificationPayload({ event, input, eventCreatedAt, metrics, env });
  try {
    const result = await sendEmail(payload, { env });
    if (!result.ok && !result.skipped) {
      logger.warn("[extension-usage] install notification email failed", {
        provider: result.provider,
        reason: result.reason,
        event_name: event.event_name || "extension_usage",
        timestamp: eventCreatedAt
      });
    }
    return result;
  } catch (error) {
    const reason = sanitizeErrorMessage(error);
    logger.warn("[extension-usage] install notification email failed", {
      reason,
      event_name: event.event_name || "extension_usage",
      timestamp: eventCreatedAt
    });
    return { ok: false, skipped: false, reason };
  }
}

async function notifyReliableInstallActivationOnce({
  event,
  input = {},
  eventCreatedAt,
  supabaseFetch,
  logger = console,
  ...options
} = {}) {
  if (!isReliableInstallActivationEvent(event, input)) {
    return { ok: false, skipped: true, reason: "not_reliable_install_activation_event" };
  }

  try {
    const hasPrior = await hasPriorExtensionUsageEvent({
      anonymousIdHash: event.anonymous_id_hash,
      beforeCreatedAt: eventCreatedAt,
      supabaseFetch
    });
    if (hasPrior) return { ok: false, skipped: true, reason: "already_seen_install_activation" };
  } catch (error) {
    logger.warn("[extension-usage] install notification dedupe check failed", sanitizeErrorMessage(error));
    return { ok: false, skipped: true, reason: "dedupe_check_failed" };
  }

  return notifyReliableInstallActivation({ event, input, eventCreatedAt, supabaseFetch, logger, ...options });
}

function scheduleReliableInstallActivationNotification(options = {}) {
  const logger = options.logger || console;
  const task = Promise.resolve()
    .then(() => notifyReliableInstallActivationOnce(options))
    .catch((error) => {
      const reason = sanitizeErrorMessage(error);
      logger.warn("[extension-usage] install notification task failed", reason);
      return { ok: false, skipped: false, reason };
    });

  if (typeof globalThis.waitUntil === "function") {
    globalThis.waitUntil(task);
  }

  return task;
}

module.exports = {
  DIRECT_SOURCE_LABEL,
  buildCloudflareInstallEmailPayload,
  buildInstallNotificationPayload,
  buildResendInstallEmailPayload,
  campaignFromMetadata,
  hasPriorExtensionUsageEvent,
  installNotificationConfig,
  isReliableInstallActivationEvent,
  notifyReliableInstallActivation,
  notifyReliableInstallActivationOnce,
  renderInstallNotificationEmail,
  scheduleReliableInstallActivationNotification,
  sendInstallNotificationEmail,
  sourceLabelFromMetadata,
  summarizeInstallMetrics
};
