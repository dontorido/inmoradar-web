const { hasSupabaseConfig, json, supabaseFetch } = require("../_utils");
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

function safeError(error) {
  return String(error?.message || error || "unknown_error")
    .replace(/eyJ[a-zA-Z0-9._-]+/g, "[redacted-jwt]")
    .replace(/sb_secret_[a-zA-Z0-9._-]+/g, "[redacted-secret]")
    .slice(0, 500);
}

function cronRunKey(date = new Date()) {
  return `seo-publish:${date.toISOString().slice(0, 13)}`;
}

async function startCronRun() {
  if (!hasSupabaseConfig()) {
    return { enabled: false, acquired: true, reason: "supabase_not_configured" };
  }

  try {
    const row = {
      run_key: cronRunKey(),
      job_name: "seo-publish",
      status: "running",
      started_at: new Date().toISOString()
    };
    const inserted = await supabaseFetch("seo_cron_runs?on_conflict=run_key", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify([row]),
      timeoutMs: 5000
    });
    const run = Array.isArray(inserted) ? inserted[0] : inserted;
    if (!run?.id) {
      return { enabled: true, acquired: false, reason: "cron_already_running_or_completed" };
    }
    return { enabled: true, acquired: true, id: run.id, run_key: run.run_key };
  } catch (error) {
    return {
      enabled: false,
      acquired: true,
      reason: "cron_lock_unavailable",
      error: safeError(error)
    };
  }
}

async function finishCronRun(lock, patch) {
  if (!lock?.enabled || !lock?.id) return;
  try {
    await supabaseFetch(`seo_cron_runs?id=eq.${encodeURIComponent(lock.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        ...patch,
        finished_at: new Date().toISOString()
      }),
      timeoutMs: 5000
    });
  } catch (error) {
    console.warn("[cron/seo-publish] failed to update cron run", safeError(error));
  }
}

module.exports = async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    return json(res, 405, { ok: false, error: "method_not_allowed" });
  }
  if (!assertCron(req, res)) return;

  let cronRun = null;
  try {
    cronRun = await startCronRun();
    if (!cronRun.acquired) {
      return json(res, 200, {
        ok: true,
        skipped: true,
        reason: cronRun.reason,
        cron: {
          schedule: "0 */6 * * *",
          policy: "regenerate drafts first; publish one eligible landing per run",
          lock: cronRun
        }
      });
    }

    const result = await runSeoLandingGeneration({
      mode: "publish",
      template_type: "random",
      limit: 1,
      candidateLimit: 25,
      autoPublish: true,
      includeExistingDrafts: true,
      publishFirstEligible: true,
      maxPublishesPerRun: 1,
      dailyPublishLimit: 4
    });

    await finishCronRun(cronRun, {
      status: "completed",
      result_json: {
        generated_count: result.generated_count,
        published_count: result.published_count,
        template_type: result.template_type
      },
      error_message: null
    });

    return json(res, 200, {
      ...result,
      cron: {
        schedule: "0 */6 * * *",
        policy: "regenerate drafts first; publish one eligible landing per run",
        lock: cronRun
      }
    });
  } catch (error) {
    console.error("[cron/seo-publish]", error);
    await finishCronRun(cronRun, {
      status: "failed",
      result_json: {},
      error_message: safeError(error)
    });
    return json(res, 500, {
      ok: false,
      error: "seo_cron_failed",
      message: error.message
    });
  }
};
