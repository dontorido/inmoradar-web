const crypto = require("node:crypto");

const ACTIVE_STATUSES = new Set(["active", "on_trial"]);

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store, max-age=0");
  if (!res.__corsHandled) {
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
    res.setHeader("access-control-allow-headers", "authorization,content-type,x-admin-token,x-cron-secret,x-signature,x-event-name");
  }
  res.end(JSON.stringify(payload));
}

function requestHeader(req, name) {
  const headers = req?.headers || {};
  const lowerName = String(name).toLowerCase();
  const value =
    headers[name] ??
    headers[lowerName] ??
    Object.entries(headers).find(([key]) => String(key).toLowerCase() === lowerName)?.[1];
  return Array.isArray(value) ? value[0] : value;
}

function normalizedOrigin(value) {
  const origin = String(value || "").trim();
  if (!origin) return "";
  try {
    return new URL(origin).origin;
  } catch {
    return "";
  }
}

function splitOriginList(value) {
  return String(value || "")
    .split(",")
    .map((entry) => normalizedOrigin(entry))
    .filter(Boolean);
}

function defaultAdminOrigins(env = process.env) {
  const origins = [
    "https://inmoradar.app",
    "https://www.inmoradar.app",
    ...splitOriginList(env.ADMIN_CORS_ORIGINS || env.CORS_ALLOWED_ORIGINS)
  ];
  if (env.VERCEL_URL) origins.push(`https://${env.VERCEL_URL}`);
  if (env.VERCEL_BRANCH_URL) origins.push(`https://${env.VERCEL_BRANCH_URL}`);
  if (env.NODE_ENV !== "production" && env.VERCEL_ENV !== "production") {
    origins.push("http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:3000");
  }
  return Array.from(new Set(origins.map(normalizedOrigin).filter(Boolean)));
}

function applyCorsHeaders(req, res, options = {}) {
  const policy = options.policy || "public";
  const origin = normalizedOrigin(requestHeader(req, "origin"));
  const methods = options.methods || "GET,POST,OPTIONS";
  const headers = options.headers || "authorization,content-type,x-admin-token,x-cron-secret,x-signature,x-event-name";

  res.__corsHandled = true;
  res.setHeader("access-control-allow-methods", methods);
  res.setHeader("access-control-allow-headers", headers);
  res.setHeader("access-control-max-age", "600");

  if (policy === "admin") {
    if (origin && defaultAdminOrigins(options.env || process.env).includes(origin)) {
      res.setHeader("access-control-allow-origin", origin);
      res.setHeader("vary", "Origin");
    }
    return;
  }

  res.setHeader("access-control-allow-origin", options.origin || "*");
}

function handleCors(req, res, options = {}) {
  applyCorsHeaders(req, res, options);
  if (req.method !== "OPTIONS") return false;
  json(res, 204, {});
  return true;
}

function sanitizeErrorMessage(error, maxLength = 500) {
  return String(error?.message || error || "unknown_error")
    .replace(/(access_token=)[^&\s]+/gi, "$1[redacted]")
    .replace(/(refresh_token=)[^&\s]+/gi, "$1[redacted]")
    .replace(/(client_secret=)[^&\s]+/gi, "$1[redacted]")
    .replace(/(api[_-]?key=)[^&\s]+/gi, "$1[redacted]")
    .replace(/(apikey=)[^&\s]+/gi, "$1[redacted]")
    .replace(/(authorization:\s*bearer\s+)[^\s]+/gi, "$1[redacted]")
    .replace(/(bearer\s+)[^\s]+/gi, "$1[redacted]")
    .replace(/eyJ[a-zA-Z0-9._-]+/g, "[redacted-jwt]")
    .replace(/sb_secret_[a-zA-Z0-9._-]+/g, "[redacted-secret]")
    .replace(/\b[A-Za-z0-9_-]{96,}\b/g, "[redacted-token]")
    .slice(0, maxLength);
}

async function fetchWithTimeout(url, options = {}) {
  const timeoutMs = Number(options.timeoutMs || process.env.API_FETCH_TIMEOUT_MS || 10000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const { timeoutMs: _timeoutMs, ...fetchOptions } = options;

  try {
    return await fetch(url, {
      ...fetchOptions,
      signal: fetchOptions.signal || controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`fetch_timeout_${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function adminTokenFromRequest(req) {
  const authorization = req.headers.authorization || "";
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }
  return String(req.headers["x-admin-token"] || "").trim();
}

function assertAdmin(req, res) {
  const expected = process.env.ADMIN_IMPORT_TOKEN;
  if (!expected) {
    json(res, 500, { ok: false, error: "admin_token_not_configured" });
    return false;
  }
  if (adminTokenFromRequest(req) !== expected) {
    json(res, 401, { ok: false, error: "unauthorized" });
    return false;
  }
  return true;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function verifyLemonSignature(rawBody, signature, secret) {
  if (!rawBody || !signature || !secret) return false;
  const expected = Buffer.from(
    crypto.createHmac("sha256", secret).update(rawBody).digest("hex"),
    "hex"
  );
  const received = Buffer.from(signature, "hex");
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

function supabaseConfig() {
  return {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY
  };
}

function normalizeSupabaseUrl(url) {
  return String(url || "").replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
}

function hasSupabaseConfig() {
  const config = supabaseConfig();
  return Boolean(config.url && config.key);
}

async function supabaseFetch(path, options = {}) {
  const { url, key } = supabaseConfig();
  if (!url || !key) {
    throw new Error("Supabase is not configured");
  }

  const headers = {
    apikey: key,
    "content-type": "application/json",
    ...(options.headers || {})
  };

  // Supabase secret keys (`sb_secret_...`) are backend-only API keys and should not be
  // sent as JWT bearer tokens. Legacy JWT `service_role` keys still use Authorization.
  if (!String(key).startsWith("sb_secret_") && !String(key).startsWith("sb_publishable_")) {
    headers.authorization = `Bearer ${key}`;
  }

  const response = await fetchWithTimeout(`${normalizeSupabaseUrl(url)}/rest/v1/${path}`, {
    ...options,
    headers,
    timeoutMs: options.timeoutMs || process.env.SUPABASE_FETCH_TIMEOUT_MS || 9000
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(sanitizeErrorMessage(`Supabase ${response.status}: ${text}`));
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function isPremiumActive(subscription) {
  if (!subscription) return false;
  const status = String(subscription.status || "").toLowerCase();
  const endsAt = subscription.ends_at ? new Date(subscription.ends_at).getTime() : null;
  if (ACTIVE_STATUSES.has(status)) {
    return !endsAt || endsAt > Date.now();
  }
  if (status === "cancelled") {
    return Boolean(endsAt && endsAt > Date.now());
  }
  return false;
}

module.exports = {
  ACTIVE_STATUSES,
  adminTokenFromRequest,
  applyCorsHeaders,
  assertAdmin,
  defaultAdminOrigins,
  fetchWithTimeout,
  handleCors,
  hasSupabaseConfig,
  isEmail,
  isPremiumActive,
  json,
  normalizeEmail,
  readRawBody,
  sanitizeErrorMessage,
  supabaseFetch,
  verifyLemonSignature
};
