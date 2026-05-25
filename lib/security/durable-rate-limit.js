const crypto = require("node:crypto");
const { checkRateLimit } = require("./rate-limit");

const DEFAULT_DURABLE_RATE_LIMIT_TIMEOUT_MS = 750;

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

function sanitizeScope(value) {
  return String(value || "default")
    .replace(/[^a-zA-Z0-9:_-]/g, "_")
    .slice(0, 80);
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

function requestIdentity(req) {
  return [
    requestIp(req),
    String(headerValue(req, "user-agent") || "").slice(0, 160),
    String(headerValue(req, "origin") || headerValue(req, "host") || "").slice(0, 160)
  ].join("|");
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function environmentName(env = process.env) {
  return sanitizeScope(env.VERCEL_ENV || env.NODE_ENV || "development");
}

function durableRateLimitKey(req, options = {}) {
  const env = options.env || process.env;
  const scope = sanitizeScope(options.scope);
  const salt = String(options.hashSalt || env.RATE_LIMIT_HASH_SALT || "");
  const identity = options.identity || requestIdentity(req);
  const identityHash = sha256(`${scope}:${identity}:${salt}`).slice(0, 32);
  return `rl:v1:${environmentName(env)}:${scope}:${identityHash}`;
}

function normalizeUpstashUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function upstashConfigured(env = process.env) {
  return Boolean(normalizeUpstashUrl(env.UPSTASH_REDIS_REST_URL) && String(env.UPSTASH_REDIS_REST_TOKEN || "").trim());
}

function memoryResult(req, options = {}) {
  const result = checkRateLimit(req, options);
  const resetMs = Math.max(1000, Number(result.retry_after_seconds || 1) * 1000);
  return {
    ...result,
    resetMs,
    durable: false
  };
}

function parsePipelineResultItem(item) {
  if (!item || typeof item !== "object") return item;
  if (item.error) throw new Error("upstash_rate_limit_command_error");
  return item.result;
}

function sanitizeDurableRateLimitError(error) {
  const text = String(error?.message || error || "unknown_error")
    .replace(/(bearer\s+)[^\s]+/gi, "$1[redacted]")
    .replace(/(token=)[^&\s]+/gi, "$1[redacted]")
    .replace(/(UPSTASH_REDIS_REST_TOKEN=)[^&\s]+/gi, "$1[redacted]")
    .replace(/\b[A-Za-z0-9_-]{48,}\b/g, "[redacted]");
  if (/upstash_rate_limit_/i.test(text)) return text.slice(0, 120);
  return "upstash_rate_limit_unavailable";
}

function logDurableRateLimitFallback(error, options = {}) {
  if (options.logErrors === false) return;
  const logger = options.logger || console;
  const warn = typeof logger.warn === "function" ? logger.warn.bind(logger) : typeof logger === "function" ? logger : null;
  if (!warn) return;
  warn("[rate-limit] durable fallback", {
    scope: sanitizeScope(options.scope),
    error: sanitizeDurableRateLimitError(error)
  });
}

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      ...options,
      signal: options.signal || controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function upstashPipeline(commands, options = {}) {
  const env = options.env || process.env;
  const url = normalizeUpstashUrl(env.UPSTASH_REDIS_REST_URL);
  const token = String(env.UPSTASH_REDIS_REST_TOKEN || "").trim();
  const fetchImpl = options.fetch || global.fetch;
  if (!url || !token || typeof fetchImpl !== "function") {
    throw new Error("upstash_rate_limit_not_configured");
  }

  const response = await fetchWithTimeout(
    fetchImpl,
    `${url}/pipeline`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(commands)
    },
    boundedNumber(options.timeoutMs, DEFAULT_DURABLE_RATE_LIMIT_TIMEOUT_MS, 100, 5000)
  );

  if (!response.ok) {
    throw new Error(`upstash_rate_limit_http_${response.status || "error"}`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error("upstash_rate_limit_invalid_response");
  }
  return payload.map(parsePipelineResultItem);
}

async function checkDurableRateLimit(req, options = {}) {
  const env = options.env || process.env;
  const maxRequests = boundedNumber(options.maxRequests, 60, 1, 100_000);
  const windowMs = boundedNumber(options.windowMs, 60_000, 1_000, 24 * 60 * 60 * 1000);
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));

  if (!upstashConfigured(env)) {
    return memoryResult(req, { ...options, maxRequests, windowMs });
  }

  try {
    const key = durableRateLimitKey(req, options);
    const [countResult, _expireResult, ttlResult] = await upstashPipeline(
      [
        ["INCR", key],
        ["EXPIRE", key, windowSeconds, "NX"],
        ["TTL", key]
      ],
      { ...options, env }
    );
    const count = boundedNumber(countResult, 1, 1, Number.MAX_SAFE_INTEGER);
    const ttlSeconds = boundedNumber(ttlResult, windowSeconds, 1, windowSeconds);
    const remaining = Math.max(0, maxRequests - count);
    const resetMs = ttlSeconds * 1000;
    const retryAfterSeconds = Math.max(1, ttlSeconds);

    return {
      allowed: count <= maxRequests,
      limit: maxRequests,
      remaining,
      resetMs,
      reset_at: new Date(Date.now() + resetMs).toISOString(),
      retry_after_seconds: retryAfterSeconds,
      window_seconds: windowSeconds,
      durable: true
    };
  } catch (error) {
    logDurableRateLimitFallback(error, options);
    return memoryResult(req, { ...options, maxRequests, windowMs });
  }
}

module.exports = {
  checkDurableRateLimit,
  durableRateLimitKey,
  sanitizeDurableRateLimitError,
  upstashConfigured
};
