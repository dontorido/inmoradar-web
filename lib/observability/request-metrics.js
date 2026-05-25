const crypto = require("node:crypto");

function safeLabel(value, fallback = "unknown", maxLength = 120) {
  const text = String(value || fallback)
    .replace(/(access_token|refresh_token|client_secret|api[_-]?key|apikey|authorization|password|secret|token)[=:][^\s&]+/gi, "$1=[redacted]")
    .replace(/(bearer\s+)[^\s]+/gi, "$1[redacted]")
    .replace(/\b[A-Za-z0-9_-]{48,}\b/g, "[redacted]")
    .replace(/authorization|cookie|password|secret|token/gi, "[redacted-key]")
    .replace(/[^a-zA-Z0-9._:/ -]/g, "_")
    .slice(0, maxLength)
    .trim();
  return text || fallback;
}

function requestId(req) {
  const headers = req?.headers || {};
  const existing = headers["x-request-id"] || headers["x-vercel-id"];
  const value = Array.isArray(existing) ? existing[0] : existing;
  return safeLabel(value || crypto.randomUUID(), "unknown", 80);
}

function requestMetricEvent(req, res, options = {}) {
  const startedAt = Number(options.startedAt || Date.now());
  const now = Date.now();
  return {
    event: "request_complete",
    request_id: requestId(req),
    route: safeLabel(options.route || "api"),
    resource: safeLabel(options.resource || "unknown"),
    action: safeLabel(options.action || ""),
    method: safeLabel(req?.method || "GET", "GET", 12),
    status: Number(res?.statusCode || options.status || 0),
    duration_ms: Math.max(0, now - startedAt),
    error: options.error ? safeLabel(options.error, "error", 120) : ""
  };
}

function shouldLog(env = process.env) {
  return env.REQUEST_METRICS_DISABLED !== "1" && (env.REQUEST_METRICS_ENABLED === "1" || env.VERCEL || env.NODE_ENV === "production");
}

function logRequestMetric(req, res, options = {}) {
  const event = requestMetricEvent(req, res, options);
  if (shouldLog(options.env || process.env)) {
    console.info("[request]", JSON.stringify(event));
  }
  return event;
}

module.exports = {
  logRequestMetric,
  requestMetricEvent
};
