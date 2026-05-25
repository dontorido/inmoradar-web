const crypto = require("node:crypto");
const { hasSupabaseConfig, isEmail, normalizeEmail, supabaseFetch } = require("../api/_utils");
const { checkDurableRateLimit } = require("./security/durable-rate-limit");
const { rateLimitPayload, setRateLimitHeaders } = require("./security/rate-limit");

const ALLOWED_BROWSERS = new Set(["chrome", "edge", "firefox", "safari", "opera", "vivaldi", "brave"]);
const MAX_TEXT = 500;
const MAX_BODY_BYTES = 16 * 1024;
const DEFAULT_BROWSER_WAITLIST_RATE_LIMIT = 10;
const DEFAULT_BROWSER_WAITLIST_RATE_LIMIT_WINDOW_MS = 60 * 1000;

function cleanText(value, maxLength = MAX_TEXT) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeBrowser(value) {
  const browser = cleanText(value, 40).toLowerCase();
  return ALLOWED_BROWSERS.has(browser) ? browser : "";
}

function waitlistError(code, message) {
  return { ok: false, error: code, message };
}

function normalizeUtm(payload = {}) {
  const raw = payload.utm && typeof payload.utm === "object" ? payload.utm : {};
  return {
    source: cleanText(raw.source || payload.utmSource || payload.utm_source || "", 160),
    medium: cleanText(raw.medium || payload.utmMedium || payload.utm_medium || "", 160),
    campaign: cleanText(raw.campaign || payload.utmCampaign || payload.utm_campaign || "", 160),
    term: cleanText(raw.term || payload.utmTerm || payload.utm_term || "", 160),
    content: cleanText(raw.content || payload.utmContent || payload.utm_content || "", 160)
  };
}

function headerValue(req, name) {
  const headers = req?.headers || {};
  const lowerName = String(name).toLowerCase();
  const value =
    headers[name] ??
    headers[lowerName] ??
    Object.entries(headers).find(([key]) => String(key).toLowerCase() === lowerName)?.[1];
  return Array.isArray(value) ? value[0] : value;
}

function requestIp(req) {
  const forwarded = String(headerValue(req, "x-forwarded-for") || "").split(",")[0].trim();
  const direct =
    forwarded ||
    String(headerValue(req, "x-real-ip") || "").trim() ||
    String(headerValue(req, "x-vercel-forwarded-for") || "").split(",")[0].trim() ||
    String(req?.socket?.remoteAddress || req?.connection?.remoteAddress || "").trim();
  return direct.replace(/[^a-fA-F0-9:., _-]/g, "").slice(0, 80) || "unknown";
}

function waitlistRateLimitIdentity(req, payload = {}) {
  return [
    requestIp(req),
    String(headerValue(req, "user-agent") || "").slice(0, 160),
    normalizeEmail(payload.email),
    cleanText(payload.anonymous_session_id || payload.anonymousSessionId || "", 120),
    cleanText(payload.anonymous_install_id || payload.anonymousInstallId || "", 120)
  ].join("|");
}

function honeypotFilled(payload = {}) {
  return Boolean(cleanText(payload.honeypot || payload.website || payload.company || "", 200));
}

function readLimitedBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error("payload_too_large"));
        req.destroy();
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function parseBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return req.body ? JSON.parse(req.body) : {};
  const raw = await readLimitedBody(req);
  return raw ? JSON.parse(raw) : {};
}

function buildWaitlistLead(payload = {}, req = { headers: {} }) {
  if (honeypotFilled(payload)) {
    return { ignored: true };
  }

  const email = normalizeEmail(payload.email);
  const browser = normalizeBrowser(payload.browser);

  if (!email || !isEmail(email)) {
    return { error: waitlistError("INVALID_EMAIL", "Introduce un email valido.") };
  }
  if (!browser) {
    return { error: waitlistError("INVALID_BROWSER", "Elige un navegador valido.") };
  }

  return {
    lead: {
      id: crypto.randomUUID(),
      email,
      browser,
      source: cleanText(payload.source || "launch_waitlist_modal", 120),
      page: cleanText(payload.page || payload.pagePath || payload.page_path || "/", 300),
      referrer: cleanText(payload.referrer || "", 500),
      utm: normalizeUtm(payload),
      user_agent: cleanText(payload.userAgent || payload.user_agent || req.headers?.["user-agent"] || "", 500),
      created_at: new Date().toISOString()
    }
  };
}

function leadLookupPath(lead) {
  return `browser_waitlist_leads?select=id&email=eq.${encodeURIComponent(lead.email)}&browser=eq.${encodeURIComponent(lead.browser)}&limit=1`;
}

async function saveWaitlistLead(lead) {
  if (!hasSupabaseConfig()) throw new Error("supabase_not_configured");

  const existing = await supabaseFetch(leadLookupPath(lead), { method: "GET" });
  if (Array.isArray(existing) && existing[0]?.id) {
    return { alreadyExists: true };
  }

  await supabaseFetch("browser_waitlist_leads", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(lead)
  });
  return { alreadyExists: false };
}

async function browserWaitlistPayload(req, res = null) {
  if (req.method !== "POST") {
    return { status: 405, body: waitlistError("METHOD_NOT_ALLOWED", "Metodo no permitido.") };
  }

  let payload = {};
  try {
    payload = await parseBody(req);
  } catch (error) {
    const code = error.message === "payload_too_large" ? "PAYLOAD_TOO_LARGE" : "INVALID_JSON";
    return { status: 400, body: waitlistError(code, "Payload invalido.") };
  }

  const rateLimit = await checkDurableRateLimit(req, {
    scope: "browser_waitlist",
    identity: waitlistRateLimitIdentity(req, payload),
    maxRequests: process.env.WAITLIST_BROWSER_RATE_LIMIT_MAX || DEFAULT_BROWSER_WAITLIST_RATE_LIMIT,
    windowMs: process.env.WAITLIST_BROWSER_RATE_LIMIT_WINDOW_MS || DEFAULT_BROWSER_WAITLIST_RATE_LIMIT_WINDOW_MS
  });
  setRateLimitHeaders(res, rateLimit);
  if (!rateLimit.allowed) {
    return { status: 429, body: rateLimitPayload(rateLimit) };
  }

  const { lead, error, ignored } = buildWaitlistLead(payload, req);
  if (ignored) {
    return { status: 200, body: { ok: true, alreadyExists: false } };
  }
  if (error) return { status: 400, body: error };

  try {
    const result = await saveWaitlistLead(lead);
    return { status: 200, body: { ok: true, alreadyExists: result.alreadyExists } };
  } catch (error) {
    console.error("Browser waitlist save failed", {
      message: error.message,
      browser: lead.browser,
      source: lead.source,
      page: lead.page
    });
    return { status: 500, body: waitlistError("SERVER_ERROR", "No hemos podido guardar tu email.") };
  }
}

module.exports = {
  ALLOWED_BROWSERS,
  DEFAULT_BROWSER_WAITLIST_RATE_LIMIT,
  DEFAULT_BROWSER_WAITLIST_RATE_LIMIT_WINDOW_MS,
  MAX_BODY_BYTES,
  browserWaitlistPayload,
  buildWaitlistLead,
  cleanText,
  honeypotFilled,
  normalizeBrowser,
  normalizeUtm,
  saveWaitlistLead,
  waitlistRateLimitIdentity
};
