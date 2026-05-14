const crypto = require("node:crypto");

const ACTIVE_STATUSES = new Set(["active", "on_trial"]);

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type,x-signature,x-event-name");
  res.end(JSON.stringify(payload));
}

function handleCors(req, res) {
  if (req.method !== "OPTIONS") return false;
  json(res, 204, {});
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

  const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${path}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase ${response.status}: ${text}`);
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function isPremiumActive(subscription) {
  if (!subscription) return false;
  const status = String(subscription.status || "").toLowerCase();
  if (!ACTIVE_STATUSES.has(status)) return false;
  if (!subscription.ends_at) return true;
  return new Date(subscription.ends_at).getTime() > Date.now();
}

module.exports = {
  ACTIVE_STATUSES,
  handleCors,
  hasSupabaseConfig,
  isEmail,
  isPremiumActive,
  json,
  normalizeEmail,
  readRawBody,
  supabaseFetch,
  verifyLemonSignature
};
