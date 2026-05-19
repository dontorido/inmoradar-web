const { handleCors, hasSupabaseConfig, json, readRawBody, supabaseFetch } = require("./_utils");
const { extensionUsageEventFromInput } = require("../lib/extension-usage/metrics");

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return req.body ? JSON.parse(req.body) : {};
  const raw = await readRawBody(req);
  return raw ? JSON.parse(raw) : {};
}

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  res.setHeader("access-control-allow-origin", "*");

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
    return json(res, 400, {
      ok: false,
      error: "extension_usage_event_rejected",
      message: error.message
    });
  }
};
