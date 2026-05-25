const { json } = require("../_utils");
const { runSeoContentPublication } = require("../_seo/contentPublisher");

function tokenFromRequest(req) {
  const authorization = req.headers.authorization || "";
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }
  return String(req.headers["x-cron-secret"] || req.headers["x-admin-token"] || "").trim();
}

function assertCron(req, res) {
  const allowedTokens = [process.env.CRON_SECRET, process.env.ADMIN_IMPORT_TOKEN].filter(Boolean);
  if (!allowedTokens.length) {
    json(res, 500, { ok: false, error: "cron_secret_not_configured" });
    return false;
  }
  if (!allowedTokens.includes(tokenFromRequest(req))) {
    json(res, 401, { ok: false, error: "unauthorized" });
    return false;
  }
  return true;
}

module.exports = async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    return json(res, 405, { ok: false, error: "method_not_allowed" });
  }
  if (!assertCron(req, res)) return;

  const result = await runSeoContentPublication({ requestSource: "cron" });
  return json(res, result.ok === false ? 500 : 200, result);
};
