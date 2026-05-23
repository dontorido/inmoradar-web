const { handleCors, hasSupabaseConfig, json, readRawBody, supabaseFetch } = require("./_utils");
const { extensionUsageEventFromInput } = require("../lib/extension-usage/metrics");

function requestResource(req) {
  if (req.query?.resource) return req.query.resource;
  const url = new URL(req.url || "/", `https://${req.headers.host || "inmoradar.app"}`);
  return url.searchParams.get("resource") || "";
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return req.body ? JSON.parse(req.body) : {};
  const raw = await readRawBody(req);
  return raw ? JSON.parse(raw) : {};
}

function isMissingUsageSchemaColumn(error) {
  return /occurred_at|page_domain|schema cache|column/i.test(String(error?.message || error || ""));
}

async function storeExtensionUsageEvent(event) {
  try {
    await supabaseFetch("extension_usage_events", {
      method: "POST",
      body: JSON.stringify(event)
    });
    return { stored: true, degraded_schema: false };
  } catch (error) {
    if (!isMissingUsageSchemaColumn(error)) throw error;
    const legacyEvent = {
      ...event,
      metadata: {
        ...(event.metadata || {}),
        occurred_at: event.occurred_at,
        page_domain: event.page_domain,
        schema_warning: "missing_extension_usage_occurrence_columns"
      }
    };
    delete legacyEvent.occurred_at;
    delete legacyEvent.page_domain;
    await supabaseFetch("extension_usage_events", {
      method: "POST",
      body: JSON.stringify(legacyEvent)
    });
    return { stored: true, degraded_schema: true };
  }
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
    const result = await storeExtensionUsageEvent(event);
    return json(res, 200, { ok: true, accepted: true, ...result });
  } catch (error) {
    return json(res, 400, {
      ok: false,
      error: "extension_usage_event_rejected",
      message: error.message
    });
  }
}

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  res.setHeader("cache-control", "no-store, max-age=0");
  res.setHeader("access-control-allow-origin", "*");

  if (requestResource(req) === "usage") {
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
