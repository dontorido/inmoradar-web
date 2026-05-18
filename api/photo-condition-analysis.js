const { handleCors, json, readRawBody } = require("./_utils");
const { buildPhotoConditionAnalysisResponse } = require("./_photo/analysis");

function clientKey(req) {
  return (
    req.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.headers?.["x-real-ip"] ||
    req.headers?.["cf-connecting-ip"] ||
    "anonymous"
  );
}

async function jsonBodyFromRequest(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const rawBody = await readRawBody(req);
  if (!rawBody) return {};
  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
}

async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== "POST") {
    json(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    const body = await jsonBodyFromRequest(req);
    if (body === null) {
      json(res, 400, { ok: false, error: "invalid_json", message: "El cuerpo de la peticion no es JSON valido." });
      return;
    }

    const result = await buildPhotoConditionAnalysisResponse(body, { clientKey: clientKey(req) });
    json(res, result.status, result.body);
  } catch (error) {
    console.error("[photo-condition-analysis]", {
      message: error?.message || String(error),
      stack: process.env.NODE_ENV !== "production" ? error?.stack : undefined
    });
    json(res, 500, {
      ok: false,
      reason: "photo_analysis_failed",
      message: "No se ha podido analizar visualmente el inmueble en este momento."
    });
  }
}

module.exports = handler;
