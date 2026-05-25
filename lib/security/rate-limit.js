const crypto = require("node:crypto");

const stores = new Map();

function headerValue(req, name) {
  const headers = req?.headers || {};
  const lowerName = String(name).toLowerCase();
  const value =
    headers[name] ??
    headers[lowerName] ??
    Object.entries(headers).find(([key]) => String(key).toLowerCase() === lowerName)?.[1];
  return Array.isArray(value) ? value[0] : value;
}

function boundedNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
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

function hashedIdentity(value) {
  return crypto.createHash("sha256").update(String(value || "unknown")).digest("hex").slice(0, 32);
}

function rateLimitKeyFromRequest(req, options = {}) {
  const scope = String(options.scope || "default").replace(/[^a-zA-Z0-9:_-]/g, "_").slice(0, 80);
  const identity = options.identity || requestIp(req);
  return `${scope}:${hashedIdentity(identity)}`;
}

function storeForScope(scope) {
  if (!stores.has(scope)) stores.set(scope, new Map());
  return stores.get(scope);
}

function pruneExpired(store, now) {
  if (store.size < 5000) return;
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt <= now) store.delete(key);
  }
}

function checkRateLimit(req, options = {}) {
  const now = Date.now();
  const scope = String(options.scope || "default");
  const windowMs = boundedNumber(options.windowMs, 60_000, 1_000, 24 * 60 * 60 * 1000);
  const maxRequests = boundedNumber(options.maxRequests, 60, 1, 100_000);
  const key = rateLimitKeyFromRequest(req, { ...options, scope });
  const store = storeForScope(scope);
  pruneExpired(store, now);

  let entry = store.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs };
    store.set(key, entry);
  }
  entry.count += 1;

  const remaining = Math.max(0, maxRequests - entry.count);
  const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));

  return {
    allowed: entry.count <= maxRequests,
    limit: maxRequests,
    remaining,
    reset_at: new Date(entry.resetAt).toISOString(),
    retry_after_seconds: retryAfterSeconds,
    window_seconds: Math.ceil(windowMs / 1000)
  };
}

function setRateLimitHeaders(res, result) {
  if (!res || !result) return;
  res.setHeader("x-ratelimit-limit", String(result.limit));
  res.setHeader("x-ratelimit-remaining", String(result.remaining));
  res.setHeader("x-ratelimit-reset", result.reset_at);
  if (!result.allowed) res.setHeader("retry-after", String(result.retry_after_seconds));
}

function rateLimitPayload(result) {
  return {
    ok: false,
    error: "rate_limited",
    retry_after_seconds: result.retry_after_seconds,
    limit: result.limit,
    window_seconds: result.window_seconds
  };
}

function resetRateLimitStore() {
  stores.clear();
}

module.exports = {
  checkRateLimit,
  rateLimitKeyFromRequest,
  rateLimitPayload,
  resetRateLimitStore,
  setRateLimitHeaders
};
