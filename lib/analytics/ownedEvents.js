const { hasSupabaseConfig, supabaseFetch } = require("../../api/_utils");

const ALLOWED_OWNED_ANALYTICS_EVENTS = new Set([
  "page_view",
  "install_click",
  "chrome_store_click",
  "waitlist_open",
  "waitlist_submit",
  "premium_click",
  "checkout_start",
  "checkout_created",
  "checkout_error",
  "seo_cta_click",
  "guide_cta_click",
  "article_cta_click"
]);

const MAX_BODY_BYTES = 24 * 1024;
const MAX_METADATA_KEYS = 24;
const REDACTED_METADATA_KEYS = new Set([
  "email",
  "e_mail",
  "mail",
  "name",
  "full_name",
  "phone",
  "telephone",
  "password",
  "token",
  "secret",
  "authorization",
  "card",
  "credit_card"
]);
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

function cleanText(value, maxLength = 240) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanToken(value, maxLength = 80) {
  return cleanText(value, maxLength)
    .toLowerCase()
    .replace(/[^a-z0-9._:/-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, maxLength);
}

function cleanEventName(value) {
  const eventName = cleanToken(value, 80);
  return ALLOWED_OWNED_ANALYTICS_EVENTS.has(eventName) ? eventName : "";
}

function cleanUrl(value, maxLength = 500) {
  const text = cleanText(value, maxLength);
  if (EMAIL_PATTERN.test(text)) return "";
  return text;
}

function normalizeUtm(payload = {}) {
  const raw = payload.utm && typeof payload.utm === "object" ? payload.utm : {};
  return {
    source: cleanText(raw.source || payload.utm_source || payload.utmSource || "", 120),
    medium: cleanText(raw.medium || payload.utm_medium || payload.utmMedium || "", 120),
    campaign: cleanText(raw.campaign || payload.utm_campaign || payload.utmCampaign || "", 160),
    term: cleanText(raw.term || payload.utm_term || payload.utmTerm || "", 160),
    content: cleanText(raw.content || payload.utm_content || payload.utmContent || "", 160)
  };
}

function sanitizeMetadataValue(value, depth = 0) {
  if (depth > 2) return null;
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 12).map((item) => sanitizeMetadataValue(item, depth + 1)).filter((item) => item !== null);
  }
  if (typeof value === "object") {
    const result = {};
    Object.entries(value).slice(0, MAX_METADATA_KEYS).forEach(([key, nested]) => {
      const safeKey = cleanToken(key, 60);
      if (!safeKey || REDACTED_METADATA_KEYS.has(safeKey) || safeKey.includes("email")) return;
      const safeValue = sanitizeMetadataValue(nested, depth + 1);
      if (safeValue !== null) result[safeKey] = safeValue;
    });
    return result;
  }
  const text = cleanText(value, 240);
  if (!text || EMAIL_PATTERN.test(text)) return null;
  return text;
}

function sanitizeMetadata(metadata = {}) {
  const raw = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
  return sanitizeMetadataValue(raw) || {};
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

function buildOwnedAnalyticsEvent(payload = {}) {
  const eventName = cleanEventName(payload.event_name || payload.eventName);
  if (!eventName) {
    return { error: { ok: false, error: "INVALID_EVENT_NAME", message: "Evento no permitido." } };
  }

  const anonymousSessionId = cleanToken(payload.anonymous_session_id || payload.anonymousSessionId, 120);
  const pagePath = cleanUrl(payload.page_path || payload.pagePath || payload.path || "/", 300) || "/";
  const metadata = sanitizeMetadata(payload.metadata || {});

  return {
    event: {
      event_name: eventName,
      anonymous_session_id: anonymousSessionId || null,
      page_path: pagePath,
      page_url: cleanUrl(payload.page_url || payload.pageUrl || "", 500) || null,
      page_type: cleanToken(payload.page_type || payload.pageType || "public", 60) || null,
      content_type: cleanToken(payload.content_type || payload.contentType || "", 80) || null,
      template_type: cleanToken(payload.template_type || payload.templateType || "", 80) || null,
      slug: cleanToken(payload.slug || "", 180) || null,
      city: cleanText(payload.city || "", 120) || null,
      topic: cleanText(payload.topic || "", 160) || null,
      source: cleanToken(payload.source || "web", 120) || "web",
      referrer: cleanUrl(payload.referrer || "", 500) || null,
      utm: normalizeUtm(payload),
      browser: cleanToken(payload.browser || "unknown", 40) || "unknown",
      device_type: cleanToken(payload.device_type || payload.deviceType || "unknown", 30) || "unknown",
      metadata,
      occurred_at: payload.occurred_at ? cleanText(payload.occurred_at, 40) : new Date().toISOString(),
      created_at: new Date().toISOString()
    }
  };
}

async function saveOwnedAnalyticsEvent(event) {
  if (!hasSupabaseConfig()) return { tracked: false, reason: "supabase_not_configured" };
  await supabaseFetch("owned_analytics_events", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(event),
    timeoutMs: 3500
  });
  return { tracked: true };
}

async function ownedAnalyticsEventPayload(req) {
  if (req.method !== "POST") {
    return { status: 405, body: { ok: false, error: "METHOD_NOT_ALLOWED" } };
  }

  let payload = {};
  try {
    payload = await parseBody(req);
  } catch (error) {
    const code = error.message === "payload_too_large" ? "PAYLOAD_TOO_LARGE" : "INVALID_JSON";
    return { status: 400, body: { ok: false, error: code, message: "Payload invalido." } };
  }

  const { event, error } = buildOwnedAnalyticsEvent(payload);
  if (error) return { status: 400, body: error };

  try {
    const result = await saveOwnedAnalyticsEvent(event);
    return { status: 200, body: { ok: true, tracked: result.tracked, reason: result.reason || null } };
  } catch (error) {
    console.warn("[owned-analytics] save failed", {
      message: error.message,
      event_name: event.event_name,
      page_path: event.page_path
    });
    return { status: 200, body: { ok: true, tracked: false, reason: "storage_error" } };
  }
}

module.exports = {
  ALLOWED_OWNED_ANALYTICS_EVENTS,
  MAX_BODY_BYTES,
  buildOwnedAnalyticsEvent,
  cleanEventName,
  cleanText,
  cleanToken,
  normalizeUtm,
  ownedAnalyticsEventPayload,
  sanitizeMetadata,
  saveOwnedAnalyticsEvent
};