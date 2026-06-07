const { fetchWithTimeout } = require("../_utils");

const DEFAULT_FROM = "hola@inmoradar.app";
const CLOUDFLARE_EMAIL_TIMEOUT_MS = 12000;

function cloudflareEmailConfig(env = process.env) {
  return {
    accountId: env.CLOUDFLARE_ACCOUNT_ID || "",
    apiToken: env.CLOUDFLARE_EMAIL_API_TOKEN || "",
    from: env.CLOUDFLARE_EMAIL_FROM || DEFAULT_FROM
  };
}

function isCloudflareEmailConfigured(config = cloudflareEmailConfig()) {
  return Boolean(config.accountId && config.apiToken);
}

function buildCloudflareEmailPayload({ to, from, subject, html, text, attachments, headers }) {
  return {
    to,
    from,
    subject,
    html,
    text,
    ...(Array.isArray(attachments) && attachments.length ? { attachments } : {}),
    ...(headers && typeof headers === "object" ? { headers } : {})
  };
}

async function sendCloudflareEmail(payload, options = {}) {
  const config = options.config || cloudflareEmailConfig(options.env || process.env);
  if (!isCloudflareEmailConfigured(config)) {
    const error = new Error("cloudflare_email_not_configured");
    error.status = 500;
    throw error;
  }

  const fetchImpl = options.fetchImpl || fetchWithTimeout;
  const response = await fetchImpl(
    `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/email/sending/send`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(payload),
      timeoutMs: options.timeoutMs || CLOUDFLARE_EMAIL_TIMEOUT_MS
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

module.exports = {
  DEFAULT_FROM,
  buildCloudflareEmailPayload,
  cloudflareEmailConfig,
  isCloudflareEmailConfigured,
  sendCloudflareEmail
};
