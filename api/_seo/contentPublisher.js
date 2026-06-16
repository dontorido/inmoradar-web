const { hasSupabaseConfig, sanitizeErrorMessage, supabaseFetch } = require("../_utils");
const { runSeoLandingGeneration } = require("./generator");
const { attachSeoPublicationEmailNotification, buildPublicationDiagnostics, countSeoPublicationTotals } = require("./publicationEmail");
const { SEO_DAILY_TARGETS, buildSeoDailyPolicySnapshot, buildSeoDailyTargets } = require("./publishingPolicy");
const {
  defaultSeoAutogenerationConditions,
  readSeoAutogenerationConditions
} = require("./autogenerationSettings");

const JOB_NAME = "seo-publish";
const SCHEDULE = "0 */4 * * *";
const SCHEDULE_INTERVAL_HOURS = 4;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const MIN_PUBLISH_SCORE = 85;

function safeError(error) {
  return sanitizeErrorMessage(error, 500);
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  const number = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(min, Math.min(max, number));
}

function nowIso(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function nextSeoPublishRun(now = new Date()) {
  const date = new Date(now);
  date.setUTCMinutes(0, 0, 0);
  const nextHour =
    Math.floor(date.getUTCHours() / SCHEDULE_INTERVAL_HOURS) * SCHEDULE_INTERVAL_HOURS + SCHEDULE_INTERVAL_HOURS;
  date.setUTCHours(nextHour);
  return date.toISOString();
}

function buildSeoContentPublicationConfig(env = process.env, overrides = {}, storedConditions = {}) {
  const conditions = {
    ...defaultSeoAutogenerationConditions(),
    ...(storedConditions || {})
  };
  const environmentEnabled =
    typeof overrides.enabled === "boolean"
      ? overrides.enabled
      : parseBoolean(env.SEO_AUTOGENERATION_ENABLED, false);
  const dryRun =
    typeof overrides.dryRun === "boolean"
      ? overrides.dryRun
      : parseBoolean(env.SEO_AUTOGENERATION_DRY_RUN, true);
  const settingsEnabled = parseBoolean(conditions.enabled, true);
  const maxPerDay = clampInt(overrides.maxPerDay ?? conditions.max_per_day ?? env.SEO_AUTOGENERATION_MAX_PER_DAY, SEO_DAILY_TARGETS.total, 0, 100);
  const maxPerWeek = clampInt(
    overrides.maxPerWeek ?? conditions.max_per_week ?? env.SEO_AUTOGENERATION_MAX_PER_WEEK,
    SEO_DAILY_TARGETS.total * 7,
    0,
    700
  );
  const maxPerRun = clampInt(overrides.maxPerRun ?? conditions.max_per_run ?? env.SEO_AUTOGENERATION_MAX_PER_RUN, 1, 1, 100);
  const minScore = clampInt(overrides.minScore ?? conditions.min_score ?? env.SEO_AUTOGENERATION_MIN_SCORE, MIN_PUBLISH_SCORE, 0, 100);
  const dailyTargets = buildSeoDailyTargets({ total: maxPerDay });

  return {
    enabled: environmentEnabled && settingsEnabled,
    environment_enabled: environmentEnabled,
    settings_enabled: settingsEnabled,
    dry_run: dryRun,
    max_per_run: maxPerRun,
    max_per_day: maxPerDay,
    max_per_week: maxPerWeek,
    min_score: minScore,
    target_landings_per_day: dailyTargets.landings,
    target_news_per_day: dailyTargets.news,
    daily_targets: dailyTargets,
    allowed_template_types: ["price_city", "rent_city", "expensive_listing_city", "editorial_guide"],
    schedule: SCHEDULE
  };
}

async function safeSupabase(path, fallback = []) {
  try {
    const rows = await supabaseFetch(path, { timeoutMs: 8000 });
    return Array.isArray(rows) ? rows : fallback;
  } catch (error) {
    return fallback;
  }
}

function createSeoContentPublicationStorage() {
  return {
    async startRun({ now, requestSource }) {
      if (!hasSupabaseConfig()) return { persisted: false, acquired: true, warning: "supabase_not_configured" };
      const runKey =
        requestSource === "cron"
          ? `${JOB_NAME}:${new Date(now).toISOString().slice(0, 13)}`
          : `${JOB_NAME}:manual:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
      const rows = await supabaseFetch("seo_cron_runs?on_conflict=run_key", {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
        body: JSON.stringify([
          {
            run_key: runKey,
            job_name: JOB_NAME,
            status: "running",
            started_at: now
          }
        ]),
        timeoutMs: 5000
      });
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row?.id) return { persisted: true, acquired: false, reason: "cron_already_running_or_completed" };
      return { persisted: true, acquired: true, id: row.id, run_key: row.run_key };
    },
    async finishRun(run, patch) {
      if (!run?.persisted || !run?.id) return null;
      return supabaseFetch(`seo_cron_runs?id=eq.${encodeURIComponent(run.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          status: patch.status,
          finished_at: patch.finished_at,
          result_json: patch.result_json || {},
          error_message: patch.error_message || null
        }),
        timeoutMs: 5000
      });
    },
    async fetchRecentRuns(limit = 10) {
      if (!hasSupabaseConfig()) return [];
      return safeSupabase(
        `seo_cron_runs?select=*&job_name=eq.${JOB_NAME}&order=started_at.desc&limit=${encodeURIComponent(String(limit))}`,
        []
      );
    },
    async fetchRecentPublishedRows({ now, days = 8 }) {
      if (!hasSupabaseConfig()) return [];
      const since = new Date(new Date(now).getTime() - days * DAY_MS).toISOString();
      const params = new URLSearchParams({
        select: "id,template_type,status,published_at,updated_at,last_generated_at",
        status: "eq.published",
        published_at: `gte.${since}`,
        order: "published_at.desc",
        limit: "5000"
      });
      return safeSupabase(`seo_landings?${params.toString()}`, []);
    },
    async fetchSeoPublicationTotals() {
      if (!hasSupabaseConfig()) return null;
      const rows = await safeSupabase("seo_landings?select=status,index_status&limit=5000", []);
      return countSeoPublicationTotals(rows);
    },
    async fetchAutogenerationConditions() {
      return readSeoAutogenerationConditions();
    }
  };
}

function weeklyPublishedCount(rows = [], now) {
  const cutoff = new Date(new Date(now).getTime() - WEEK_MS).getTime();
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const timestamp = Date.parse(row.published_at || row.updated_at || row.last_generated_at || "");
    return Number.isFinite(timestamp) && timestamp >= cutoff;
  }).length;
}

function limitSnapshot({ rows, policy, config, publishedThisRun, now }) {
  const publishedToday = Number(policy.published_total_today || 0);
  const publishedWeek = weeklyPublishedCount(rows, now);
  return {
    max_per_run: config.max_per_run,
    max_per_day: config.max_per_day,
    max_per_week: config.max_per_week,
    published_this_run: Number(publishedThisRun || 0),
    published_last_24h: publishedToday,
    published_last_7d: publishedWeek,
    remaining_run: Math.max(0, config.max_per_run - Number(publishedThisRun || 0)),
    remaining_day: Math.max(0, config.max_per_day - publishedToday),
    remaining_week: Math.max(0, config.max_per_week - publishedWeek)
  };
}

function emptySummary({ config, now, requestSource, reason, rows = [], policy = null, run = null }) {
  const dailyPolicy = policy || buildSeoDailyPolicySnapshot(rows, { now, targets: config.daily_targets });
  const limits = limitSnapshot({ rows, policy: dailyPolicy, config, publishedThisRun: 0, now });
  return {
    ok: true,
    job_name: JOB_NAME,
    request_source: requestSource,
    enabled: config.enabled,
    dry_run: config.dry_run,
    started_at: now,
    finished_at: now,
    generated_count: 0,
    published_count: 0,
    would_publish_count: 0,
    draft_count: 0,
    skipped_count: reason ? 1 : 0,
    failed_count: 0,
    reason: reason || null,
    results: reason ? [{ status: "skipped", reason, slug: null, quality_score: null }] : [],
    limits,
    config,
    daily_policy: dailyPolicy,
    published_landings_today: dailyPolicy.published_landings_today,
    published_news_today: dailyPolicy.published_news_today,
    target_landings_per_day: config.target_landings_per_day,
    target_news_per_day: config.target_news_per_day,
    selected_content_type: dailyPolicy.selected_content_type,
    skipped_reason: dailyPolicy.skipped_reason || reason || null,
    cron: {
      schedule: SCHEDULE,
      policy: `publish up to ${config.max_per_day} SEO pieces/day with configurable backoffice limits`,
      lock: run
    }
  };
}

function resultPath(item = {}) {
  if (item.target_path) return item.target_path;
  return item.slug ? `/${String(item.slug).replace(/^\/+|\/+$/g, "")}/` : null;
}

function normalizeResult(item = {}) {
  const qualityPenalties = item.quality_penalties || item.penalties || [];
  const qualityWarnings = item.quality_warnings || item.warnings || [];
  const qualityReasons = item.quality_reasons || item.rejection_reasons || [];
  return {
    ...item,
    target_path: resultPath(item),
    final_score: Number(item.final_score ?? item.quality_score ?? 0),
    quality_penalties: Array.isArray(qualityPenalties) ? qualityPenalties : [],
    quality_warnings: Array.isArray(qualityWarnings) ? qualityWarnings : [],
    quality_reasons: Array.isArray(qualityReasons) ? qualityReasons : []
  };
}

function summarizeGenerationResult({ result, config, now, requestSource, rows, policy, selectedContentType, run }) {
  const normalizedResults = (Array.isArray(result.results) ? result.results : []).map(normalizeResult);
  const publishedCount = Number(result.published_count || 0);
  const afterPolicy = {
    ...policy,
    published_landings_today: policy.published_landings_today + (selectedContentType === "landing" ? publishedCount : 0),
    published_news_today: policy.published_news_today + (selectedContentType === "news" ? publishedCount : 0),
    published_total_today: policy.published_total_today + publishedCount
  };
  const wouldPublishCount = config.dry_run
    ? normalizedResults.filter((item) => Number(item.final_score || 0) >= config.min_score).length
    : 0;
  const draftCount = normalizedResults.filter((item) => ["draft", "ready_to_publish", "needs_review"].includes(String(item.status || ""))).length;
  const failedCount = normalizedResults.filter((item) => String(item.status || "") === "failed").length;
  const skippedCount = normalizedResults.filter((item) => ["skipped", "would_skip"].includes(String(item.status || ""))).length;

  return {
    ...result,
    job_name: JOB_NAME,
    request_source: requestSource,
    enabled: config.enabled,
    dry_run: config.dry_run,
    started_at: now,
    finished_at: new Date().toISOString(),
    candidates_count: Number(result.generated_count || normalizedResults.length || 0),
    published_count: publishedCount,
    would_publish_count: wouldPublishCount,
    draft_count: draftCount,
    skipped_count: skippedCount,
    failed_count: failedCount,
    reason: null,
    results: normalizedResults,
    limits: limitSnapshot({ rows, policy: afterPolicy, config, publishedThisRun: publishedCount, now }),
    config,
    daily_policy: afterPolicy,
    published_landings_today: afterPolicy.published_landings_today,
    published_news_today: afterPolicy.published_news_today,
    target_landings_per_day: config.target_landings_per_day,
    target_news_per_day: config.target_news_per_day,
    selected_content_type: selectedContentType,
    skipped_reason: null,
    cron: {
      schedule: SCHEDULE,
      policy: `publish up to ${config.max_per_day} SEO pieces/day with configurable backoffice limits`,
      lock: run
    }
  };
}

async function finishRun(storage, run, summary, status = "completed", errorMessage = null) {
  if (!storage?.finishRun) return;
  try {
    await storage.finishRun(run, {
      status,
      finished_at: summary.finished_at || new Date().toISOString(),
      result_json: summary,
      error_message: errorMessage
    });
  } catch (error) {
    console.warn("[seo-publish] failed to update run log", safeError(error));
  }
}

async function finalizeSummary({ storage, run, summary, status = "completed", errorMessage = null, env, emailNotification }) {
  const finalSummary = await attachSeoPublicationEmailNotification({
    summary,
    storage,
    env,
    ...(emailNotification || {})
  });
  await finishRun(storage, run, finalSummary, status, errorMessage);
  return finalSummary;
}

async function resolveSeoContentPublicationConfig({ storage, env, options }) {
  if (options.settingsState) {
    return {
      config: buildSeoContentPublicationConfig(env, options.config || {}, options.settingsState.settings),
      settingsState: options.settingsState
    };
  }
  if (options.conditions) {
    return {
      config: buildSeoContentPublicationConfig(env, options.config || {}, options.conditions),
      settingsState: { ok: true, settings: options.conditions, read_only: false, reason: null, updated_at: null }
    };
  }
  const settingsState = storage.fetchAutogenerationConditions
    ? await storage.fetchAutogenerationConditions()
    : { ok: true, settings: defaultSeoAutogenerationConditions(), read_only: false, reason: null, updated_at: null };
  return {
    config: buildSeoContentPublicationConfig(env, options.config || {}, settingsState.settings),
    settingsState
  };
}

async function runSeoContentPublication(options = {}) {
  const now = nowIso(options.now);
  const requestSource = options.requestSource || "manual";
  const env = options.env || process.env;
  const storage = options.storage || createSeoContentPublicationStorage(env);
  const { config, settingsState } = await resolveSeoContentPublicationConfig({ storage, env, options });
  const runGeneration = options.runGeneration || runSeoLandingGeneration;
  const emailNotification = options.emailNotification || {};
  let run = null;

  try {
    if (storage.startRun) {
      run = await storage.startRun({ now, requestSource });
      if (run && run.acquired === false) {
        const summary = emptySummary({ config, now, requestSource, reason: run.reason || "cron_already_running_or_completed", run });
        summary.settings_status = settingsState;
        return finalizeSummary({ storage, run, summary, status: "skipped", env, emailNotification });
      }
    }

    if (!config.enabled) {
      const summary = emptySummary({ config, now, requestSource, reason: "autogeneration_disabled", run });
      summary.settings_status = settingsState;
      return finalizeSummary({ storage, run, summary, status: "skipped", env, emailNotification });
    }

    if (!config.dry_run && !options.storage && !hasSupabaseConfig()) {
      const summary = emptySummary({ config, now, requestSource, reason: "supabase_not_configured", run });
      summary.settings_status = settingsState;
      return finalizeSummary({ storage, run, summary, status: "skipped", env, emailNotification });
    }

    const rows = storage.fetchRecentPublishedRows ? await storage.fetchRecentPublishedRows({ now }) : [];
    const dailyPolicy = buildSeoDailyPolicySnapshot(rows, { now, targets: config.daily_targets });
    const currentLimits = limitSnapshot({ rows, policy: dailyPolicy, config, publishedThisRun: 0, now });
    if (currentLimits.remaining_week <= 0) {
      const summary = emptySummary({ config, now, requestSource, reason: "weekly_limit_reached", rows, policy: dailyPolicy, run });
      summary.settings_status = settingsState;
      return finalizeSummary({ storage, run, summary, status: "completed", env, emailNotification });
    }
    const selectedContentType = dailyPolicy.selected_content_type;
    if (!selectedContentType) {
      const summary = emptySummary({ config, now, requestSource, reason: dailyPolicy.skipped_reason, rows, policy: dailyPolicy, run });
      summary.settings_status = settingsState;
      return finalizeSummary({ storage, run, summary, status: "completed", env, emailNotification });
    }

    const result = await runGeneration({
      mode: config.dry_run ? "dry_run" : "publish",
      template_type: selectedContentType === "news" ? "editorial_guide" : "landing_random",
      limit: 1,
      candidateLimit: 25,
      autoPublish: !config.dry_run,
      includeExistingDrafts: true,
      publishFirstEligible: true,
      maxPublishesPerRun: config.max_per_run,
      dailyPublishLimit: config.max_per_day,
      minScore: config.min_score,
      publishedToday: dailyPolicy.published_total_today,
      now
    });
    const summary = summarizeGenerationResult({
      result,
      config,
      now,
      requestSource,
      rows,
      policy: dailyPolicy,
      selectedContentType,
      run
    });
    return finalizeSummary({
      storage,
      run,
      summary: { ...summary, settings_status: settingsState },
      status: summary.failed_count ? "failed" : "completed",
      errorMessage: summary.failed_count ? "candidate_failed" : null,
      env,
      emailNotification
    });
  } catch (error) {
    const summary = emptySummary({ config, now, requestSource, reason: "autogeneration_failed", run });
    summary.settings_status = settingsState;
    summary.ok = false;
    summary.error = safeError(error);
    summary.finished_at = new Date().toISOString();
    return finalizeSummary({ storage, run, summary, status: "failed", errorMessage: summary.error, env, emailNotification });
  }
}

async function getSeoContentPublicationStatus(options = {}) {
  const now = nowIso(options.now);
  const env = options.env || process.env;
  const storage = options.storage || createSeoContentPublicationStorage(env);
  const { config, settingsState } = await resolveSeoContentPublicationConfig({ storage, env, options });
  const [recentRuns, rows] = await Promise.all([
    storage.fetchRecentRuns ? storage.fetchRecentRuns(10) : [],
    storage.fetchRecentPublishedRows ? storage.fetchRecentPublishedRows({ now }) : []
  ]);
  const dailyPolicy = buildSeoDailyPolicySnapshot(rows, { now, targets: config.daily_targets });
  return {
    ok: true,
    job_name: JOB_NAME,
    generated_at: now,
    config,
    settings: settingsState.settings,
    settings_status: {
      read_only: Boolean(settingsState.read_only),
      table_missing: Boolean(settingsState.table_missing),
      reason: settingsState.reason || null,
      updated_at: settingsState.updated_at || null
    },
    limits: limitSnapshot({ rows, policy: dailyPolicy, config, publishedThisRun: 0, now }),
    daily_policy: dailyPolicy,
    published_landings_today: dailyPolicy.published_landings_today,
    published_news_today: dailyPolicy.published_news_today,
    target_landings_per_day: config.target_landings_per_day,
    target_news_per_day: config.target_news_per_day,
    last_run: Array.isArray(recentRuns) ? recentRuns[0] || null : null,
    recent_runs: Array.isArray(recentRuns) ? recentRuns : [],
    next_scheduled_at: nextSeoPublishRun(new Date(now)),
    pause_hint: "Set SEO_AUTOGENERATION_ENABLED=false"
  };
}

function diagnosticTemplateType(value = "all") {
  const normalized = String(value || "all").trim().toLowerCase();
  if (["landing", "landings"].includes(normalized)) return "landing_random";
  if (["news", "guide", "guides", "editorial"].includes(normalized)) return "editorial_guide";
  return normalized || "all";
}

async function getSeoContentPublicationDiagnostics(options = {}) {
  const now = nowIso(options.now);
  const env = options.env || process.env;
  const storage = options.storage || createSeoContentPublicationStorage(env);
  const { config, settingsState } = await resolveSeoContentPublicationConfig({ storage, env, options });
  const [recentRuns, rows] = await Promise.all([
    storage.fetchRecentRuns ? storage.fetchRecentRuns(10) : [],
    storage.fetchRecentPublishedRows ? storage.fetchRecentPublishedRows({ now }) : []
  ]);
  const dailyPolicy = buildSeoDailyPolicySnapshot(rows, { now, targets: config.daily_targets });
  const limits = limitSnapshot({ rows, policy: dailyPolicy, config, publishedThisRun: 0, now });
  const candidateLimit = clampInt(options.candidateLimit ?? options.candidate_limit ?? options.limit, 25, 1, 25);
  const templateType = diagnosticTemplateType(options.templateType || options.template_type || "all");
  const runGeneration = options.runGeneration || runSeoLandingGeneration;
  const generation = await runGeneration({
    mode: "dry_run",
    template_type: templateType,
    limit: 1,
    candidateLimit,
    autoPublish: true,
    includeExistingDrafts: true,
    publishFirstEligible: true,
    maxPublishesPerRun: config.max_per_run,
    dailyPublishLimit: config.max_per_day,
    minScore: config.min_score,
    publishedToday: dailyPolicy.published_total_today,
    now
  });
  const previewSummary = summarizeGenerationResult({
    result: generation,
    config: { ...config, dry_run: true },
    now,
    requestSource: "diagnostic",
    rows,
    policy: dailyPolicy,
    selectedContentType: "diagnostic",
    run: null
  });
  const diagnostics = buildPublicationDiagnostics(previewSummary);
  const notPublishedCandidates = diagnostics.evaluated_candidates.filter((item) => item.status !== "published");

  return {
    ok: true,
    read_only: true,
    writes_enabled: false,
    diagnostic_mode: "dry_run",
    job_name: JOB_NAME,
    generated_at: now,
    template_type: templateType,
    candidate_limit: candidateLimit,
    config,
    settings_status: {
      read_only: Boolean(settingsState.read_only),
      table_missing: Boolean(settingsState.table_missing),
      reason: settingsState.reason || null,
      updated_at: settingsState.updated_at || null
    },
    limits,
    daily_policy: dailyPolicy,
    latest_run: Array.isArray(recentRuns) ? recentRuns[0] || null : null,
    recent_runs: Array.isArray(recentRuns) ? recentRuns : [],
    generation_summary: {
      generated_count: previewSummary.generated_count,
      candidates_count: previewSummary.candidates_count,
      published_count: previewSummary.published_count,
      draft_count: previewSummary.draft_count,
      skipped_count: previewSummary.skipped_count,
      failed_count: previewSummary.failed_count,
      non_published_count: notPublishedCandidates.length
    },
    publication_diagnostics: diagnostics,
    counter_diagnosis: {
      skipped_count_scope: "Only statuses skipped and would_skip increment skipped_count.",
      low_score_not_counted_as_skip: notPublishedCandidates.filter((item) => item.meets_min_score === false && !item.counted_as_skip).length,
      discarded_before_skip_count: diagnostics.discarded_before_skip_count,
      explanation: diagnostics.skip_counter_explanation
    }
  };
}

module.exports = {
  JOB_NAME,
  MIN_PUBLISH_SCORE,
  SCHEDULE,
  buildSeoContentPublicationConfig,
  createSeoContentPublicationStorage,
  getSeoContentPublicationDiagnostics,
  getSeoContentPublicationStatus,
  nextSeoPublishRun,
  nextSixHourRun: nextSeoPublishRun,
  runSeoContentPublication
};
