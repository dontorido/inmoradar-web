const { hasSupabaseConfig, json, supabaseFetch } = require("../_utils");
const { runSeoLandingGeneration } = require("../_seo/generator");
const { SEO_DAILY_TARGETS, buildSeoDailyPolicySnapshot } = require("../_seo/publishingPolicy");

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


const SEO_CRON_POLICY = "publish one SEO piece per run with daily 2 landings + 2 guides target";

async function fetchRecentPublishedSeoRows(now) {
  if (!hasSupabaseConfig()) return { rows: [], warning: "supabase_not_configured" };
  const current = new Date(now);
  const start = new Date(current.getTime() - 48 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    select: "id,template_type,status,published_at,updated_at,last_generated_at",
    status: "eq.published",
    published_at: `gte.${start.toISOString()}`,
    order: "published_at.desc",
    limit: "5000"
  });
  try {
    const rows = await supabaseFetch(`seo_landings?${params.toString()}`);
    return { rows: Array.isArray(rows) ? rows : [], warning: null };
  } catch (error) {
    return { rows: [], warning: safeError(error) };
  }
}

function afterRunPolicySnapshot(policy, selectedContentType, publishedCount) {
  const didPublish = Number(publishedCount || 0);
  return {
    ...policy,
    published_landings_today: policy.published_landings_today + (selectedContentType === "landing" ? didPublish : 0),
    published_news_today: policy.published_news_today + (selectedContentType === "news" ? didPublish : 0),
    published_total_today: policy.published_total_today + didPublish
  };
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
          policy: SEO_CRON_POLICY,
          lock: cronRun
        }
      });
    }

    const now = new Date().toISOString();
    const publishedRows = await fetchRecentPublishedSeoRows(now);
    const dailyPolicy = buildSeoDailyPolicySnapshot(publishedRows.rows, { now });
    const selectedContentType = dailyPolicy.selected_content_type;

    if (!selectedContentType) {
      await finishCronRun(cronRun, {
        status: "completed",
        result_json: {
          skipped: true,
          skipped_reason: dailyPolicy.skipped_reason,
          daily_policy: dailyPolicy,
          warning: publishedRows.warning
        },
        error_message: null
      });
      return json(res, 200, {
        ok: true,
        skipped: true,
        generated_count: 0,
        published_count: 0,
        published_landings_today: dailyPolicy.published_landings_today,
        published_news_today: dailyPolicy.published_news_today,
        target_landings_per_day: SEO_DAILY_TARGETS.landings,
        target_news_per_day: SEO_DAILY_TARGETS.news,
        selected_content_type: null,
        skipped_reason: dailyPolicy.skipped_reason,
        warning: publishedRows.warning,
        cron: {
          schedule: "0 */6 * * *",
          policy: SEO_CRON_POLICY,
          lock: cronRun
        }
      });
    }

    const result = await runSeoLandingGeneration({
      mode: "publish",
      template_type: selectedContentType === "news" ? "editorial_guide" : "landing_random",
      limit: 1,
      candidateLimit: 25,
      autoPublish: true,
      includeExistingDrafts: true,
      publishFirstEligible: true,
      maxPublishesPerRun: 1,
      dailyPublishLimit: SEO_DAILY_TARGETS.total,
      publishedToday: dailyPolicy.published_total_today,
      now
    });
    const afterPolicy = afterRunPolicySnapshot(dailyPolicy, selectedContentType, result.published_count);

    await finishCronRun(cronRun, {
      status: "completed",
      result_json: {
        generated_count: result.generated_count,
        published_count: result.published_count,
        template_type: result.template_type,
        selected_content_type: selectedContentType,
        daily_policy: afterPolicy,
        warning: publishedRows.warning
      },
      error_message: null
    });

    return json(res, 200, {
      ...result,
      published_landings_today: afterPolicy.published_landings_today,
      published_news_today: afterPolicy.published_news_today,
      target_landings_per_day: SEO_DAILY_TARGETS.landings,
      target_news_per_day: SEO_DAILY_TARGETS.news,
      selected_content_type: selectedContentType,
      skipped_reason: null,
      warning: publishedRows.warning,
      cron: {
        schedule: "0 */6 * * *",
        policy: SEO_CRON_POLICY,
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
