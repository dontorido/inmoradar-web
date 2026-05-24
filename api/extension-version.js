const { handleCors, hasSupabaseConfig, json, readRawBody, supabaseFetch } = require("./_utils");
const { extensionUsageEventFromInput, firstListingAnalysisEventFrom } = require("../lib/extension-usage/metrics");

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return req.body ? JSON.parse(req.body) : {};
  const raw = await readRawBody(req);
  return raw ? JSON.parse(raw) : {};
}

async function hasPriorListingAnalysis(anonymousIdHash) {
  if (!anonymousIdHash) return true;
  const hash = encodeURIComponent(anonymousIdHash);
  const rows = await supabaseFetch(
    `extension_usage_events?select=id&anonymous_id_hash=eq.${hash}&event_name=in.(analysis_completed,first_listing_analysis)&limit=1`
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function shouldPersistFirstListingAnalysis(event) {
  if (event.event_name !== "analysis_completed" || !event.anonymous_id_hash) return false;
  try {
    return !(await hasPriorListingAnalysis(event.anonymous_id_hash));
  } catch {
    return false;
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
    const persistFirstAnalysis = await shouldPersistFirstListingAnalysis(event);
    await supabaseFetch("extension_usage_events", {
      method: "POST",
      body: JSON.stringify(event)
    });

    const firstAnalysisEvent = persistFirstAnalysis ? firstListingAnalysisEventFrom(event) : null;
    if (firstAnalysisEvent) {
      await supabaseFetch("extension_usage_events", {
        method: "POST",
        body: JSON.stringify(firstAnalysisEvent)
      });
    }

    return json(res, 200, {
      ok: true,
      accepted: true,
      derived_event: firstAnalysisEvent?.event_name || null
    });
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

  if (req.query?.resource === "usage") {
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
