const crypto = require("node:crypto");
const { fetchWithTimeout, hasSupabaseConfig, readRawBody, supabaseFetch } = require("../../api/_utils");

const CONTACT_TO_EMAIL = "hola@inmoradar.app";
const CONTACT_FALLBACK_FROM_EMAIL = "noreply@inmoradar.app";
const RESEND_CONTACT_FROM_EMAIL = `InmoRadar <${CONTACT_FALLBACK_FROM_EMAIL}>`;

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function escapeEmailHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function emailAddressOnly(value) {
  const text = String(value || "").trim();
  const match = text.match(/<([^>]+)>/);
  return (match ? match[1] : text).toLowerCase();
}

function cloudflareContactEmailConfig() {
  const configuredFrom =
    process.env.CLOUDFLARE_CONTACT_EMAIL_FROM ||
    process.env.CLOUDFLARE_EMAIL_FROM ||
    CONTACT_FALLBACK_FROM_EMAIL;
  const from =
    emailAddressOnly(configuredFrom) === CONTACT_TO_EMAIL
      ? CONTACT_FALLBACK_FROM_EMAIL
      : configuredFrom;

  return {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_EMAIL_API_TOKEN,
    from,
    to: CONTACT_TO_EMAIL
  };
}

function resendContactEmailConfig() {
  return {
    apiToken: process.env.RESEND_API_KEY,
    from:
      process.env.RESEND_CONTACT_EMAIL_FROM ||
      process.env.RESEND_EMAIL_FROM ||
      RESEND_CONTACT_FROM_EMAIL,
    to: CONTACT_TO_EMAIL
  };
}

function buildContactEmailPayload(item) {
  const topic = item.topic || "general";
  const subject = `Nuevo mensaje InmoRadar Â· ${topic}`;
  const lines = [
    "Nuevo mensaje desde el formulario de InmoRadar",
    "",
    `Nombre: ${item.name}`,
    `Email: ${item.email}`,
    `Tema: ${topic}`,
    `Fecha: ${item.created_at}`,
    "",
    item.message
  ];

  return {
    to: cloudflareContactEmailConfig().to,
    from: cloudflareContactEmailConfig().from,
    subject,
    text: lines.join("\n"),
    html: `<!doctype html>
<html lang="es">
<body style="margin:0;background:#FAFAFA;color:#09090B;font-family:Arial,Helvetica,sans-serif;">
  <main style="max-width:680px;margin:0 auto;padding:32px 18px;">
    <p style="margin:0 0 10px;color:#FF4500;font-size:11px;letter-spacing:.18em;text-transform:uppercase;font-weight:700;">INMORADAR Â· CONTACTO</p>
    <h1 style="margin:0 0 20px;color:#09090B;font-size:32px;line-height:1.05;letter-spacing:-.04em;">Nuevo mensaje</h1>
    <section style="background:#FFFFFF;border:1px solid #E4E4E7;border-radius:20px;padding:22px;">
      <p><strong>Nombre:</strong> ${escapeEmailHtml(item.name)}</p>
      <p><strong>Email:</strong> <a href="mailto:${escapeEmailHtml(item.email)}">${escapeEmailHtml(item.email)}</a></p>
      <p><strong>Tema:</strong> ${escapeEmailHtml(topic)}</p>
      <p><strong>Fecha:</strong> ${escapeEmailHtml(item.created_at)}</p>
      <hr style="border:0;border-top:1px solid #E4E4E7;margin:20px 0;">
      <p style="white-space:pre-wrap;line-height:1.55;">${escapeEmailHtml(item.message)}</p>
    </section>
  </main>
</body>
</html>`,
    reply_to: item.email,
    headers: {
      "X-InmoRadar-Contact": "website"
    }
  };
}

function buildResendContactEmailPayload(item) {
  const payload = buildContactEmailPayload(item);
  const config = resendContactEmailConfig();
  return {
    to: [config.to],
    from: config.from,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
    reply_to: item.email,
    headers: payload.headers
  };
}

function buildMinimalContactEmailPayload(item) {
  const config = cloudflareContactEmailConfig();
  return {
    to: config.to,
    from: config.from,
    subject: "Nuevo mensaje InmoRadar",
    text: [
      "Nuevo mensaje desde el formulario de InmoRadar",
      "",
      `Nombre: ${item.name}`,
      `Email: ${item.email}`,
      `Tema: ${item.topic || "general"}`,
      `Fecha: ${item.created_at}`,
      "",
      item.message
    ].join("\n")
  };
}

async function postResendContactEmail(config, payload) {
  const response = await fetchWithTimeout("https://api.resend.com/emails", {
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

async function postCloudflareContactEmail(config, payload) {
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
  return { response, body };
}

async function sendResendContactEmail(item) {
  const config = resendContactEmailConfig();
  if (!config.apiToken) {
    return { ok: false, skipped: true, reason: "resend_not_configured" };
  }

  const payload = buildResendContactEmailPayload(item);
  const { response, body } = await postResendContactEmail(config, payload);
  if (!response.ok || body?.error) {
    return {
      ok: false,
      skipped: false,
      provider: "resend",
      reason: body?.message || body?.error?.message || `resend_http_${response.status}`,
      status: response.status
    };
  }

  return { ok: true, provider: "resend", response: body };
}

async function sendContactEmail(item) {
  const resendNotification = await sendResendContactEmail(item);
  if (!resendNotification.skipped) return resendNotification;

  const config = cloudflareContactEmailConfig();
  if (!config.accountId || !config.apiToken) {
    return { ok: false, skipped: true, reason: "email_provider_not_configured" };
  }

  const payload = buildContactEmailPayload(item);
  let { response, body } = await postCloudflareContactEmail(config, payload);
  const firstReason = body?.errors?.[0]?.message || `cloudflare_email_http_${response.status}`;

  if (!response.ok && firstReason === "email.sending.error.email.invalid") {
    ({ response, body } = await postCloudflareContactEmail(config, buildMinimalContactEmailPayload(item)));
  }

  if (!response.ok || body?.success === false) {
    return {
      ok: false,
      skipped: false,
      reason: body?.errors?.[0]?.message || `cloudflare_email_http_${response.status}`,
      status: response.status
    };
  }

  return { ok: true, provider: "cloudflare_email_service", response: body };
}

async function contactPayload(req) {
  let payload = {};
  try {
    const raw = await readRawBody(req);
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    return {
      status: 400,
      body: { ok: false, error: "invalid_json", message: "No se ha podido leer el mensaje." }
    };
  }

  const name = String(payload.name || "").trim().slice(0, 120);
  const email = String(payload.email || "").trim().toLowerCase().slice(0, 180);
  const topic = String(payload.topic || "general").trim().slice(0, 60);
  const message = String(payload.message || "").trim().slice(0, 4000);

  if (!name || !isEmail(email) || message.length < 4) {
    return {
      status: 400,
      body: { ok: false, error: "invalid_contact_payload", message: "Revisa los campos del formulario." }
    };
  }

  const item = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name,
    email,
    topic,
    message,
    created_at: new Date().toISOString()
  };

  if (hasSupabaseConfig()) {
    try {
      await supabaseFetch("contact_messages", {
        method: "POST",
        headers: { prefer: "return=minimal" },
        body: JSON.stringify(item),
        timeoutMs: 3500
      });
    } catch (error) {
      console.warn("[contact] Supabase insert failed", error.message);
    }
  }

  let emailNotification = { ok: false, skipped: true, reason: "not_attempted" };
  try {
    emailNotification = await sendContactEmail(item);
    if (!emailNotification.ok && !emailNotification.skipped) {
      console.warn("[contact] Email notification failed", emailNotification.reason || "unknown_error");
    }
  } catch (error) {
    emailNotification = { ok: false, skipped: false, reason: error.message || "email_send_failed" };
    console.warn("[contact] Email notification failed", error.message);
  }

  return {
    status: 200,
    body: {
      ok: true,
      ...item,
      notification_email: CONTACT_TO_EMAIL,
      email_notification: {
        ok: Boolean(emailNotification.ok),
        skipped: Boolean(emailNotification.skipped),
        reason: emailNotification.ok ? null : emailNotification.reason || null
      }
    }
  };
}

module.exports = {
  buildContactEmailPayload,
  buildResendContactEmailPayload,
  contactPayload
};
