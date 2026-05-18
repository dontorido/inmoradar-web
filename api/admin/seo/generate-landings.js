const { handleCors, json, readRawBody } = require("../../_utils");
const { runSeoLandingGeneration } = require("../../_seo/generator");

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

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return req.body ? JSON.parse(req.body) : {};
  const raw = await readRawBody(req);
  if (!raw) return {};
  return JSON.parse(raw);
}

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== "POST") {
    return json(res, 405, { ok: false, error: "method_not_allowed" });
  }
  if (!assertAdmin(req, res)) return;

  try {
    const body = await readJsonBody(req);
    const result = await runSeoLandingGeneration({
      mode: body.mode || "dry_run",
      limit: body.limit || 5,
      template_type: body.template_type || "price_city",
      autoPublish: body.autoPublish === true
    });
    return json(res, 200, result);
  } catch (error) {
    console.error("[seo/generate-landings]", error);
    return json(res, 500, {
      ok: false,
      error: "seo_generation_failed",
      message: error.message
    });
  }
};
