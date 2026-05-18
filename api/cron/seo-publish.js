const { json } = require("../_utils");
const { runSeoLandingGeneration } = require("../_seo/generator");

function tokenFromRequest(req) {
  const authorization = req.headers.authorization || "";
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }
  return String(req.headers["x-cron-secret"] || req.headers["x-admin-token"] || "").trim();
}

function assertCron(req, res) {
  const expected = process.env.CRON_SECRET || process.env.ADMIN_IMPORT_TOKEN;
  if (!expected) {
    json(res, 500, { ok: false, error: "cron_secret_not_configured" });
    return false;
  }
  if (tokenFromRequest(req) !== expected) {
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

  try {
    const result = await runSeoLandingGeneration({
      mode: "publish",
      template_type: "price_city",
      limit: 1,
      candidateLimit: 10,
      autoPublish: true,
      includeExistingDrafts: true,
      publishFirstEligible: true,
      maxPublishesPerRun: 1,
      dailyPublishLimit: 4
    });

    return json(res, 200, {
      ...result,
      cron: {
        schedule: "0 */6 * * *",
        policy: "regenerate drafts first; publish one eligible landing per run"
      }
    });
  } catch (error) {
    console.error("[cron/seo-publish]", error);
    return json(res, 500, {
      ok: false,
      error: "seo_cron_failed",
      message: error.message
    });
  }
};
