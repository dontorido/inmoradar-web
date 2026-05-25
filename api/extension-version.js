const { handleCors, hasSupabaseConfig, json, readRawBody, supabaseFetch } = require("./_utils");
const { extensionUsageEventFromInput } = require("../lib/extension-usage/metrics");

const MAX_EXTENSION_USAGE_BODY_BYTES = 16 * 1024;

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
  if (!hasSupabaseConfig()) {
    return json(res, 503, { ok: false, error: "supabase_not_configured" });
  }

  try {
    const body = await readJsonBody(req);
    const event = extensionUsageEventFromInput(body, req.headers || {});
    await supabaseFetch("extension_usage_events", {
      method: "POST",
      body: JSON.stringify(event)
    });
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
  if (handleCors(req, res)) return;

  res.setHeader("cache-control", "no-store, max-age=0");
  res.setHeader("access-control-allow-origin", "*");

  if (resourceFromRequest(req) === "usage") {
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
};

module.exports._internal = {
  MAX_EXTENSION_USAGE_BODY_BYTES,
  resourceFromRequest
};
