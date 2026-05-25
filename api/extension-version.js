const { handleCors, hasSupabaseConfig, json, readRawBody, supabaseFetch } = require("./_utils");
const {
  isReliableInstallActivationEvent,
  scheduleReliableInstallActivationNotification
} = require("./_extensionInstallNotification");
const { logRequestMetric } = require("../lib/observability/request-metrics");
const { extensionUsageEventFromInput } = require("../lib/extension-usage/metrics");
const { checkDurableRateLimit } = require("../lib/security/durable-rate-limit");
const { rateLimitPayload, setRateLimitHeaders } = require("../lib/security/rate-limit");

const MAX_EXTENSION_USAGE_BODY_BYTES = 16 * 1024;
const DEFAULT_EXTENSION_USAGE_RATE_LIMIT = 120;
const DEFAULT_EXTENSION_USAGE_RATE_LIMIT_WINDOW_MS = 60 * 1000;

function resourceFromRequest(req) {
  if (req.query?.resource) return String(req.query.resource);
  const url = new URL(req.url || "/api/extension-version", `https://${req.headers?.host || "inmoradar.app"}`);
  return String(url.searchParams.get("resource") || "");
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    if (Buffer.byteLength(req.body, "utf8") > MAX_EXTENSION_USAGE_BODY_BYTES) {
      throw new Error("payload_too_large");
    }
    return req.body ? JSON.parse(req.body) : {};
  }
  const raw = await readRawBody(req);
  if (Buffer.byteLength(raw, "utf8") > MAX_EXTENSION_USAGE_BODY_BYTES) {
    throw new Error("payload_too_large");
  }
  return raw ? JSON.parse(raw) : {};
}

async function handleExtensionUsage(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { ok: false, error: "method_not_allowed" });
  }
  const rateLimit = await checkDurableRateLimit(req, {
    scope: "extension_usage",
    maxRequests: process.env.EXTENSION_USAGE_RATE_LIMIT_MAX || DEFAULT_EXTENSION_USAGE_RATE_LIMIT,
    windowMs: process.env.EXTENSION_USAGE_RATE_LIMIT_WINDOW_MS || DEFAULT_EXTENSION_USAGE_RATE_LIMIT_WINDOW_MS
  });
  setRateLimitHeaders(res, rateLimit);
  if (!rateLimit.allowed) {
    return json(res, 429, rateLimitPayload(rateLimit));
  }
  if (!hasSupabaseConfig()) {
    return json(res, 503, { ok: false, error: "supabase_not_configured" });
  }

  try {
    const body = await readJsonBody(req);
    const event = extensionUsageEventFromInput(body, req.headers || {});
    const eventCreatedAt = new Date().toISOString();
    await supabaseFetch("extension_usage_events", {
      method: "POST",
      body: JSON.stringify(event)
    });
    if (isReliableInstallActivationEvent(event, body)) {
      scheduleReliableInstallActivationNotification({
        event,
        input: body,
        eventCreatedAt,
        supabaseFetch
      });
    }
    return json(res, 200, { ok: true, accepted: true });
  } catch (error) {
    const invalidPayload = error.message === "payload_too_large" ? "payload_too_large" : "invalid_json";
    return json(res, 400, {
      ok: false,
      error: "extension_usage_event_rejected",
      reason: invalidPayload,
      message: "Payload invalido."
    });
  }
}

module.exports = async function handler(req, res) {
  const startedAt = Date.now();
  const resource = resourceFromRequest(req) || "version";
  try {
    if (handleCors(req, res)) return;

    res.setHeader("cache-control", "no-store, max-age=0");

    if (resource === "usage") {
      return handleExtensionUsage(req, res);
    }

    if (req.method !== "GET") {
      json(res, 405, { ok: false, error: "method_not_allowed" });
      return;
    }

    json(res, 200, {
      latestVersion: "1.0.10",
      minimumRequiredVersion: "1.0.0",
      forceUpdate: false,
      message: "Hay una nueva versión de InmoRadar disponible.",
      forceUpdateMessage: "Esta versión de InmoRadar ya no es compatible. Actualiza para seguir usando el servicio.",
      changelogUrl: "https://www.inmoradar.app/changelog",
      checkedAt: new Date().toISOString()
    });
  } finally {
    logRequestMetric(req, res, { route: "api/extension-version", resource, startedAt });
  }
};

module.exports._internal = {
  DEFAULT_EXTENSION_USAGE_RATE_LIMIT,
  DEFAULT_EXTENSION_USAGE_RATE_LIMIT_WINDOW_MS,
  MAX_EXTENSION_USAGE_BODY_BYTES,
  resourceFromRequest
};
