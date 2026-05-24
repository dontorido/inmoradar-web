const { fetchWithTimeout, handleCors, hasSupabaseConfig, json, supabaseFetch } = require("./_utils");
const { siteUrl } = require("./_seo/text");

const SERVICE_STATUS = new Set(["operational", "degraded", "down", "unknown"]);

function cleanStatus(value, fallback = "unknown") {
  const status = String(value || "").toLowerCase();
  return SERVICE_STATUS.has(status) ? status : fallback;
}

function isProductionRuntime(env = process.env) {
  const runtime = String(env.VERCEL_ENV || env.NODE_ENV || "").toLowerCase();
  return runtime === "production";
}

function requestOrigin(req) {
  const rawHost = String(req.headers?.host || "").trim().toLowerCase();
  const forwardedProto = String(req.headers?.["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase();
  const proto = forwardedProto === "http" || forwardedProto === "https" ? forwardedProto : "https";
  const localHost = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/;
  const publicHost = /^(www\.)?inmoradar\.app$/;
  const vercelPreview = /\.vercel\.app$/;

  if (localHost.test(rawHost)) return `http://${rawHost}`;
  if (publicHost.test(rawHost) || vercelPreview.test(rawHost)) return `${proto}://${rawHost}`;
  return siteUrl();
}

function serviceResult({ id, name, status, message, latencyMs = null, checkedAt, critical = false, degradeWhenUnknown = false }) {
  return {
    id,
    name,
    status: cleanStatus(status),
    message,
    latency_ms: Number.isFinite(latencyMs) ? Math.max(0, Math.round(latencyMs)) : null,
    checked_at: checkedAt,
    critical: Boolean(critical),
    degrade_when_unknown: Boolean(degradeWhenUnknown)
  };
}

async function checkHttpService({ id, name, origin, path, messageOk, messageFail, validate, critical = false, fetchImpl }) {
  const checkedAt = new Date().toISOString();
  const startedAt = Date.now();
  try {
    const response = await fetchImpl(`${origin}${path}`, {
      headers: { accept: "application/json,text/html,application/xml,text/xml,*/*" },
      timeoutMs: 4500
    });
    const latencyMs = Date.now() - startedAt;
    const valid = validate ? await validate(response) : response.ok;
    if (response.ok && valid) {
      return serviceResult({ id, name, status: "operational", message: messageOk, latencyMs, checkedAt, critical });
    }
    const status = response.status >= 500 ? "down" : "degraded";
    return serviceResult({ id, name, status, message: messageFail, latencyMs, checkedAt, critical });
  } catch (error) {
    return serviceResult({ id, name, status: critical ? "down" : "degraded", message: messageFail, checkedAt, critical });
  }
}

function apiService() {
  return serviceResult({
    id: "api",
    name: "API",
    status: "operational",
    message: "El endpoint de estado responde.",
    checkedAt: new Date().toISOString(),
    critical: true
  });
}

async function checkInternalData({ supabaseFetchImpl = supabaseFetch } = {}) {
  const checkedAt = new Date().toISOString();
  if (!hasSupabaseConfig()) {
    return serviceResult({
      id: "internal_data",
      name: "Datos internos",
      status: "unknown",
      message: "No verificado en este entorno.",
      checkedAt,
      degradeWhenUnknown: true
    });
  }

  const startedAt = Date.now();
  try {
    const rows = await supabaseFetchImpl("market_price_sources?select=id&limit=1", { timeoutMs: 3500 });
    return serviceResult({
      id: "internal_data",
      name: "Datos internos",
      status: Array.isArray(rows) ? "operational" : "degraded",
      message: Array.isArray(rows) ? "La lectura interna basica responde." : "No se pudo verificar la lectura interna.",
      latencyMs: Date.now() - startedAt,
      checkedAt
    });
  } catch (error) {
    return serviceResult({
      id: "internal_data",
      name: "Datos internos",
      status: "degraded",
      message: "No se pudo verificar la lectura interna.",
      latencyMs: Date.now() - startedAt,
      checkedAt
    });
  }
}

async function checkWeb(origin, fetchImpl) {
  return checkHttpService({
    id: "public_web",
    name: "Web publica",
    origin,
    path: "/",
    messageOk: "La web publica responde.",
    messageFail: "La web publica no respondio como se esperaba.",
    critical: true,
    fetchImpl,
    validate: async (response) => {
      const text = await response.text().catch(() => "");
      return /InmoRadar/i.test(text);
    }
  });
}

async function checkSitemap(origin, fetchImpl) {
  return checkHttpService({
    id: "sitemap",
    name: "Sitemap",
    origin,
    path: "/sitemap.xml",
    messageOk: "El sitemap publico se puede leer.",
    messageFail: "El sitemap publico no respondio como se esperaba.",
    fetchImpl,
    validate: async (response) => {
      const text = await response.text().catch(() => "");
      return /<urlset[\s>]/i.test(text);
    }
  });
}

async function checkExtensionVersion(origin, fetchImpl) {
  return checkHttpService({
    id: "extension_version",
    name: "Versionado de extension",
    origin,
    path: "/api/extension-version",
    messageOk: "El versionado de extension responde.",
    messageFail: "El versionado de extension no respondio como se esperaba.",
    fetchImpl,
    validate: async (response) => {
      const payload = await response.json().catch(() => ({}));
      return Boolean(payload.latestVersion || payload.minimumRequiredVersion);
    }
  });
}

function unknownAffectsGlobalStatus(service, options = {}) {
  if (cleanStatus(service.status) !== "unknown") return false;
  return Boolean(service.critical || (options.production && service.degrade_when_unknown));
}

function globalStatusFor(services, options = {}) {
  const rows = Array.isArray(services) ? services : [];
  if (rows.some((service) => service.critical && service.status === "down")) return "down";
  if (
    rows.some((service) => {
      const status = cleanStatus(service.status);
      if (status === "operational") return false;
      if (status === "unknown") return unknownAffectsGlobalStatus(service, options);
      return true;
    })
  ) {
    return "degraded";
  }
  return "operational";
}

async function buildStatusPayload(req, options = {}) {
  const fetchImpl = options.fetchImpl || fetchWithTimeout;
  const origin = requestOrigin(req);
  const services = await Promise.all([
    checkWeb(origin, fetchImpl),
    apiService(),
    checkSitemap(origin, fetchImpl),
    checkInternalData({ supabaseFetchImpl: options.supabaseFetchImpl }),
    checkExtensionVersion(origin, fetchImpl)
  ]);
  const updatedAt = new Date().toISOString();

  return {
    ok: true,
    service: "inmoradar",
    status: globalStatusFor(services, { production: isProductionRuntime(options.env) }),
    updated_at: updatedAt,
    services
  };
}

async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== "GET") {
    return json(res, 405, {
      ok: false,
      status: "degraded",
      error: "method_not_allowed",
      updated_at: new Date().toISOString(),
      services: [apiService()]
    });
  }

  try {
    return json(res, 200, await buildStatusPayload(req));
  } catch (error) {
    return json(res, 200, {
      ok: false,
      service: "inmoradar",
      status: "degraded",
      updated_at: new Date().toISOString(),
      services: [
        serviceResult({
          id: "api",
          name: "API",
          status: "degraded",
          message: "No se pudo completar la comprobacion publica.",
          checkedAt: new Date().toISOString(),
          critical: true
        })
      ]
    });
  }
}

module.exports = handler;
module.exports._internal = {
  buildStatusPayload,
  checkInternalData,
  cleanStatus,
  globalStatusFor,
  isProductionRuntime,
  requestOrigin,
  serviceResult
};
