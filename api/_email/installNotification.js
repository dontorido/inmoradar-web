const { fetchWithTimeout, sanitizeErrorMessage } = require("../_utils");

const DEFAULT_TO_EMAIL = "hola@inmoradar.app";
const DEFAULT_FROM_EMAIL = "noreply@inmoradar.app";
const DEFAULT_SITE_URL = "https://www.inmoradar.app";
const DAY_MS = 24 * 60 * 60 * 1000;
const DIRECT_SOURCE_LABEL = "Directo / no atribuido";
const UNRELIABLE_INSTALL_EVENT_NAMES = new Set([
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
  "checkout_error"
]);

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function cleanText(value, fallback = "No disponible") {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text || fallback;
}

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatMetric(value) {
  const number = asNumber(value);
  if (number === null) return "No disponible";
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(number);
}

function formatDateTime(value, timeZone = "Europe/Madrid") {
  if (!value) return "No disponible";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "No disponible";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone
  }).format(date);
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

function emailAddressOnly(value) {
  const text = String(value || "").trim();
  const match = text.match(/<([^>]+)>/);
  return (match ? match[1] : text).toLowerCase();
}

function avoidSameMailbox(from, to) {
  return emailAddressOnly(from) === emailAddressOnly(to) ? DEFAULT_FROM_EMAIL : from;
}

function installNotificationConfig(env = process.env) {
  const to = env.EMAIL_TO_INSTALL_NOTIFICATIONS || env.INSTALL_NOTIFICATION_EMAIL_TO || DEFAULT_TO_EMAIL;
  const cloudflareFrom = avoidSameMailbox(
    env.CLOUDFLARE_INSTALL_NOTIFICATION_EMAIL_FROM || env.CLOUDFLARE_EMAIL_FROM || DEFAULT_FROM_EMAIL,
    to
  );
  const resendFrom =
    env.RESEND_INSTALL_NOTIFICATION_EMAIL_FROM ||
    env.RESEND_EMAIL_FROM ||
    `InmoRadar <${DEFAULT_FROM_EMAIL}>`;

  return {
    to,
    dashboardUrl: dashboardUrlFromEnv(env),
    cloudflare: {
      accountId: env.CLOUDFLARE_ACCOUNT_ID,
      apiToken: env.CLOUDFLARE_EMAIL_API_TOKEN,
      from: cloudflareFrom
    },
    resend: {
      apiToken: env.RESEND_API_KEY,
      from: resendFrom
    }
  };
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
    metadata.referrer_domain ||
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

function isReliableInstallActivationEvent(event = {}) {
  if (!event.anonymous_id_hash) return false;
  const eventName = String(event.event_name || "").trim().toLowerCase();
  return !UNRELIABLE_INSTALL_EVENT_NAMES.has(eventName);
}

function createdMs(row) {
  const ms = new Date(row?.created_at).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function earliestInstallRows(rows = []) {
  const byUser = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row?.anonymous_id_hash) continue;
    const current = byUser.get(row.anonymous_id_hash);
    if (!current || createdMs(row) < createdMs(current)) {
      byUser.set(row.anonymous_id_hash, row);
    }
  }
  return Array.from(byUser.values());
}

function summarizeInstallMetrics(rows = [], now = new Date()) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const installs = earliestInstallRows(safeRows);
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const cutoff7d = nowMs - 7 * DAY_MS;
  const activeUsers7d = new Set(
    safeRows
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

function buildQuickRead(metrics, sourceLabel) {
  if (!metrics) {
    return "Nueva instalacion registrada. Revisa la fuente de adquisicion y la evolucion de usuarios en el dashboard.";
  }
  const hasSeo = (metrics.sourceSummary || []).some((item) => item.label === "SEO / Google" && item.count > 0);
  const topSource = metrics.topSource || sourceLabel;
  if (topSource === "Chrome Web Store" && hasSeo) {
    return "Buena señal: Chrome Web Store sigue siendo el canal principal y SEO empieza a aportar instalaciones. Mantén separados instalacion real, clic hacia Chrome Store y activacion efectiva para no mezclar metricas.";
  }
  return "Nueva instalacion registrada. Revisa la fuente de adquisicion y la evolucion de usuarios en el dashboard.";
}

function buildInstallNotificationPayload({ event = {}, eventCreatedAt, metrics = null, env = process.env } = {}) {
  const metadata = event.metadata && typeof event.metadata === "object" ? event.metadata : {};
  const sourceLabel = sourceLabelFromMetadata(metadata);
  const campaign = campaignFromMetadata(metadata);
  const dashboardUrl = dashboardUrlFromEnv(env);

  return {
    subject: "🎉 Nueva instalación de InmoRadar",
    preheader: "InmoRadar suma una nueva instalación. Revisa fuente, totales y usuarios activos.",
    dashboardUrl,
    event: {
      eventName: event.event_name || "extension_usage",
      createdAt: eventCreatedAt || new Date().toISOString(),
      sourceLabel,
      campaign
    },
    metrics,
    quickRead: buildQuickRead(metrics, sourceLabel)
  };
}

function metricCard(label, value) {
  return `<td style="width:25%;padding:14px 12px;border-right:1px solid #E7E2DA;vertical-align:top;">
    <p style="margin:0 0 6px;color:#7B756C;font-size:10px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;">${escapeHtml(label)}</p>
    <strong style="display:block;color:#111111;font-size:24px;line-height:1.05;">${escapeHtml(value)}</strong>
  </td>`;
}

function sourceRowsHtml(sourceSummary = []) {
  const rows = sourceSummary.length
    ? sourceSummary
    : [
        { label: "Chrome Web Store", count: null },
        { label: "SEO / Google", count: null },
        { label: DIRECT_SOURCE_LABEL, count: null }
      ];

  return rows
    .map(
      (row) => `<tr>
        <td style="padding:12px 0;border-bottom:1px solid #ECE7DF;color:#171717;font-size:14px;font-weight:700;">${escapeHtml(row.label)}</td>
        <td style="padding:12px 0;border-bottom:1px solid #ECE7DF;color:#171717;font-size:14px;text-align:right;">${escapeHtml(formatMetric(row.count))}</td>
      </tr>`
    )
    .join("");
}

function renderInstallNotificationEmail(payload = {}) {
  const subject = payload.subject || "🎉 Nueva instalación de InmoRadar";
  const preheader =
    payload.preheader || "InmoRadar suma una nueva instalación. Revisa fuente, totales y usuarios activos.";
  const metrics = payload.metrics || null;
  const sourceSummary = metrics?.sourceSummary || [];
  const topSource = metrics?.topSource || null;
  const dashboardUrl = payload.dashboardUrl || DEFAULT_SITE_URL;
  const event = payload.event || {};
  const source = cleanText(event.sourceLabel);
  const campaign = cleanText(event.campaign);
  const eventDate = formatDateTime(event.createdAt);
  const totalInstalls = formatMetric(metrics?.totalInstalls);
  const installs7d = formatMetric(metrics?.installs7d);
  const activeUsers7d = formatMetric(metrics?.activeUsers7d);
  const channelTop = cleanText(topSource);
  const quickRead = payload.quickRead || buildQuickRead(metrics, source);

  const html = `<!doctype html>
<html lang="es">
<body style="margin:0;background:#f7f7f6;background-image:radial-gradient(#dedbd3 1px, transparent 1px);background-size:18px 18px;color:#111111;font-family:Arial,Helvetica,sans-serif;">
  <span style="display:none;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${escapeHtml(preheader)}</span>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#f7f7f6;background-image:radial-gradient(#dedbd3 1px, transparent 1px);background-size:18px 18px;">
    <tr>
      <td align="center" style="padding:28px 14px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:720px;border-collapse:collapse;">
          <tr>
            <td style="padding:8px 0 22px;">
              <p style="margin:0;color:#111111;font-size:22px;font-weight:900;letter-spacing:-.02em;">Inmo<span style="color:#ff5a1f;">Radar</span></p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 18px;">
              <span style="display:inline-block;background:#fff4ec;border:1px solid #ffd4bd;color:#a33a0b;border-radius:999px;padding:8px 12px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;font-weight:800;">ANÁLISIS INMOBILIARIO ANTES DE CONTACTAR · EXTENSIÓN CHROME</span>
            </td>
          </tr>
          <tr>
            <td style="padding:0;">
              <h1 style="margin:0;color:#111111;font-size:48px;line-height:.98;letter-spacing:-.03em;font-weight:900;">Nuevo usuario detectado.</h1>
              <p style="margin:16px 0 24px;color:#4d4943;font-size:17px;line-height:1.55;max-width:650px;">Alguien acaba de instalar InmoRadar. Aquí tienes la señal de crecimiento y el resumen actualizado de adquisición.</p>
              <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;background:#ff5a1f;color:#ffffff;text-decoration:none;border-radius:999px;padding:14px 22px;font-size:14px;font-weight:800;">Ver dashboard</a>
            </td>
          </tr>
          <tr>
            <td style="padding:26px 0 0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;background:#ffffff;border:1px solid #e9e3da;border-radius:24px;">
                <tr>
                  <td style="padding:24px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                      <tr>
                        <td style="vertical-align:top;padding:0 18px 0 0;">
                          <strong style="display:block;color:#ff5a1f;font-size:64px;line-height:.9;letter-spacing:-.05em;">+1</strong>
                          <p style="margin:10px 0 0;color:#111111;font-size:18px;font-weight:900;">Nueva alta de extensión</p>
                        </td>
                        <td style="vertical-align:top;padding:4px 0 0;color:#4d4943;font-size:14px;line-height:1.7;">
                          <p style="margin:0;"><strong style="color:#111111;">Fecha/hora:</strong> ${escapeHtml(eventDate)}</p>
                          <p style="margin:0;"><strong style="color:#111111;">Fuente estimada:</strong> ${escapeHtml(source)}</p>
                          <p style="margin:0;"><strong style="color:#111111;">Campaña:</strong> ${escapeHtml(campaign)}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 0 0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;background:#ffffff;border:1px solid #e9e3da;border-radius:24px;overflow:hidden;">
                <tr>
                  <td style="padding:18px 20px;border-bottom:1px solid #ece7df;">
                    <p style="margin:0;color:#6d665d;font-size:12px;font-weight:800;">Vista previa · InmoRadar</p>
                  </td>
                </tr>
                <tr>
                  <td>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                      <tr>
                        ${metricCard("Total", totalInstalls)}
                        ${metricCard("Últimos 7 días", installs7d)}
                        ${metricCard("Activos 7d", activeUsers7d)}
                        ${metricCard("Canal top", channelTop)}
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 0 0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;background:#ffffff;border:1px solid #e9e3da;border-radius:24px;">
                <tr>
                  <td style="padding:22px;">
                    <p style="margin:0 0 10px;color:#111111;font-size:16px;font-weight:900;">Resumen por fuente</p>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                      ${sourceRowsHtml(sourceSummary)}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 0 0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;background:#111111;border-radius:24px;">
                <tr>
                  <td style="padding:22px;">
                    <p style="margin:0 0 8px;color:#ffb28b;font-size:11px;letter-spacing:.14em;text-transform:uppercase;font-weight:800;">Lectura rápida</p>
                    <p style="margin:0;color:#ffffff;font-size:15px;line-height:1.6;">${escapeHtml(quickRead)}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 0 0;">
              <p style="margin:0;color:#756f67;font-size:12px;line-height:1.55;">Privacidad: este aviso usa métricas anónimas de la extensión. No incluye IP, user-agent completo, email de usuario ni datos personales innecesarios.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    subject,
    "",
    preheader,
    "",
    `Fecha/hora: ${eventDate}`,
    `Fuente estimada: ${source}`,
    `Campaña: ${campaign}`,
    `Total instalaciones: ${totalInstalls}`,
    `Instalaciones últimos 7 días: ${installs7d}`,
    `Usuarios activos últimos 7 días: ${activeUsers7d}`,
    `Canal top: ${channelTop}`,
    "",
    "Resumen por fuente:",
    ...(sourceSummary.length ? sourceSummary : [{ label: "No disponible", count: null }]).map(
      (item) => `- ${item.label}: ${formatMetric(item.count)}`
    ),
    "",
    `Lectura rápida: ${quickRead}`,
    "",
    `Dashboard: ${dashboardUrl}`,
    "",
    "Privacidad: no se incluye IP, user-agent completo, email de usuario ni datos personales innecesarios."
  ].join("\n");

  return { subject, preheader, html, text };
}

function buildCloudflareInstallEmailPayload({ payload, from, to }) {
  const email = renderInstallNotificationEmail(payload);
  return {
    to,
    from,
    subject: email.subject,
    html: email.html,
    text: email.text,
    headers: {
      "X-InmoRadar-Notification": "extension-install"
    }
  };
}

function buildResendInstallEmailPayload({ payload, from, to }) {
  const email = renderInstallNotificationEmail(payload);
  return {
    to: [to],
    from,
    subject: email.subject,
    html: email.html,
    text: email.text,
    headers: {
      "X-InmoRadar-Notification": "extension-install"
    }
  };
}

async function postResendEmail(config, payload, fetchImpl = fetchWithTimeout) {
  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.apiToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload),
    timeoutMs: 12000
  });
  const body = await response.json().catch(() => null);
  return { response, body };
}

async function postCloudflareEmail(config, payload, fetchImpl = fetchWithTimeout) {
  const response = await fetchImpl(
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
  return { response, body };
}

async function sendInstallNotificationEmail(payload, options = {}) {
  const env = options.env || process.env;
  const config = installNotificationConfig(env);
  const fetchImpl = options.fetchImpl || fetchWithTimeout;

  if (config.resend.apiToken) {
    const resendPayload = buildResendInstallEmailPayload({
      payload,
      from: config.resend.from,
      to: config.to
    });
    const { response, body } = await postResendEmail(config.resend, resendPayload, fetchImpl);
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
  const { response, body } = await postCloudflareEmail(config.cloudflare, cloudflarePayload, fetchImpl);
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

async function hasPriorExtensionUsageEvent({ anonymousIdHash, supabaseFetch }) {
  if (!anonymousIdHash || typeof supabaseFetch !== "function") return true;
  const params = new URLSearchParams({
    select: "id",
    limit: "1"
  });
  params.set("anonymous_id_hash", `eq.${anonymousIdHash}`);
  const rows = await supabaseFetch(`extension_usage_events?${params.toString()}`);
  return Array.isArray(rows) && rows.length > 0;
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
  eventCreatedAt,
  supabaseFetch,
  env = process.env,
  logger = console,
  sendEmail = sendInstallNotificationEmail
} = {}) {
  if (!isReliableInstallActivationEvent(event)) {
    return { ok: false, skipped: true, reason: "not_reliable_install_activation_event" };
  }

  let metrics = null;
  try {
    const rows = await loadInstallMetricRows({ supabaseFetch });
    if (rows) metrics = summarizeInstallMetrics(rows, new Date(eventCreatedAt || Date.now()));
  } catch (error) {
    logger.warn("[extension-usage] Install notification metrics unavailable", sanitizeErrorMessage(error));
  }

  const payload = buildInstallNotificationPayload({ event, eventCreatedAt, metrics, env });

  try {
    const result = await sendEmail(payload, { env });
    if (result.ok) {
      logger.info("[extension-usage] Install notification email sent", {
        provider: result.provider,
        event_name: event.event_name || "extension_usage",
        timestamp: eventCreatedAt
      });
    } else if (result.skipped) {
      logger.info("[extension-usage] Install notification email skipped", {
        reason: result.reason,
        event_name: event.event_name || "extension_usage",
        timestamp: eventCreatedAt
      });
    } else {
      logger.warn("[extension-usage] Install notification email failed", {
        provider: result.provider,
        reason: result.reason,
        event_name: event.event_name || "extension_usage",
        timestamp: eventCreatedAt
      });
    }
    return result;
  } catch (error) {
    const reason = sanitizeErrorMessage(error);
    logger.warn("[extension-usage] Install notification email failed", {
      reason,
      event_name: event.event_name || "extension_usage",
      timestamp: eventCreatedAt
    });
    return { ok: false, skipped: false, reason };
  }
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
  renderInstallNotificationEmail,
  sendInstallNotificationEmail,
  sourceLabelFromMetadata,
  summarizeInstallMetrics
};
