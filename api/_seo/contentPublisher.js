const { hasSupabaseConfig, sanitizeErrorMessage, supabaseFetch } = require("../_utils");
const { runSeoLandingGeneration } = require("./generator");
const { evaluateLandingIndexability } = require("./indexability");
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
const RUN_LOCK_STALE_MS = 15 * 60 * 1000;
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

function isMissingSeoPublicationColumn(error) {
  return /column\s+"?(index_status|published_at)"?\s+does not exist/i.test(String(error?.message || error || ""));
}

function compactObject(value = {}) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function normalizeSearchTerm(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/^\/+|\/+$/g, "");
}

function normalizeSearchTerms(values = []) {
  const list = Array.isArray(values) ? values : [values];
  return [...new Set(list.map(normalizeSearchTerm).filter(Boolean))];
}

function isActiveRunLock(row, now) {
  if (String(row?.status || "").toLowerCase() !== "running") return false;
  const started = Date.parse(row.started_at || "");
  if (!Number.isFinite(started)) return true;
  return new Date(now).getTime() - started < RUN_LOCK_STALE_MS;
}

async function probeSeoLandingColumns(columns = []) {
  const availability = {};
  await Promise.all(
    columns.map(async (column) => {
      const rows = await safeSupabase(`seo_landings?select=${encodeURIComponent(column)}&limit=1`, null);
      availability[column] = Array.isArray(rows);
    })
  );
  return availability;
}

function schemaVariantFromAvailability(availability = {}, inaccessible = false) {
  if (inaccessible) return "unknown";
  const hasContentColumn = ["body_html", "body", "content_html", "html"].some((column) => availability[column]);
  if (!availability.quality_score || !availability.canonical_url || !hasContentColumn) return "minimal";
  if (!availability.index_status && availability.published_at) return "missing_index_status";
  if (availability.index_status && !availability.published_at) return "missing_published_at";
  if (!availability.index_status && !availability.published_at) return "missing_index_status";
  return "full";
}

function seoLandingSelectFromAvailability(availability = {}) {
  const requiredColumns = ["id", "slug", "title", "status", "updated_at", "last_generated_at", "source_data_json"];
  const optionalColumns = [
    "path",
    "quality_score",
    "canonical_url",
    "body_html",
    "body",
    "content_html",
    "html",
    "index_status",
    "published_at"
  ];
  const columns = [];
  for (const column of requiredColumns) {
    if (availability[column] !== false) columns.push(column);
  }
  for (const column of optionalColumns) {
    if (availability[column]) columns.push(column);
  }
  return [...new Set(columns)].join(",");
}

function publicSeoLandingRow(row = {}) {
  return compactObject({
    id: row.id ?? null,
    slug: row.slug || row.path || null,
    path: row.path || (row.slug ? `/${String(row.slug).replace(/^\/+|\/+$/g, "")}/` : null),
    title: row.title || null,
    status: row.status || null,
    quality_score: row.quality_score ?? null,
    canonical_url: row.canonical_url || null,
    index_status: row.index_status || null,
    published_at: row.published_at || null,
    updated_at: row.updated_at || null,
    last_generated_at: row.last_generated_at || null
  });
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
      if (!row?.id) {
        const existingRows = await safeSupabase(
          `seo_cron_runs?select=id,run_key,status,started_at,finished_at&run_key=eq.${encodeURIComponent(runKey)}&limit=1`,
          []
        );
        const existing = Array.isArray(existingRows) ? existingRows[0] : null;
        if (isActiveRunLock(existing, now)) {
          return { persisted: true, acquired: false, reason: "cron_already_running", existing_run: existing };
        }
        const retryRunKey = `${runKey}:retry:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
        const retryRows = await supabaseFetch("seo_cron_runs?on_conflict=run_key", {
          method: "POST",
          headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
          body: JSON.stringify([
            {
              job_name: JOB_NAME,
              run_key: retryRunKey,
              request_source: requestSource,
              status: "running",
              started_at: now
            }
          ]),
          timeoutMs: 5000
        });
        const retryRow = Array.isArray(retryRows) ? retryRows[0] : retryRows;
        if (!retryRow?.id) return { persisted: true, acquired: false, reason: "cron_retry_lock_not_acquired", existing_run: existing };
        return { persisted: true, acquired: true, id: retryRow.id, run_key: retryRow.run_key, retried_from_run_key: runKey };
      }
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
      const fullParams = new URLSearchParams({
        select: "id,template_type,status,published_at,updated_at,last_generated_at",
        status: "eq.published",
        published_at: `gte.${since}`,
        order: "published_at.desc",
        limit: "5000"
      });
      const fullRows = await safeSupabase(`seo_landings?${fullParams.toString()}`, null);
      if (Array.isArray(fullRows)) return fullRows;
      const compatibleParams = new URLSearchParams({
        select: "id,template_type,status,updated_at,last_generated_at",
        status: "eq.published",
        updated_at: `gte.${since}`,
        order: "updated_at.desc",
        limit: "5000"
      });
      return safeSupabase(`seo_landings?${compatibleParams.toString()}`, []);
    },
    async fetchSeoPublicationTotals() {
      if (!hasSupabaseConfig()) return null;
      const rows =
        (await safeSupabase("seo_landings?select=status,index_status&limit=5000", null)) ||
        (await safeSupabase("seo_landings?select=status,quality_score,source_data_json&limit=5000", []));
      return countSeoPublicationTotals(rows);
    },
    async fetchSeoLandingsSourceSnapshot({ sampleLimit = 10, searchTerms = [] } = {}) {
      if (!hasSupabaseConfig()) {
        return {
          ok: false,
          reason: "supabase_not_configured",
          schema_variant: "unknown",
          missing_columns: [],
          total_rows: 0,
          status_counts: {},
          ready_to_publish_count: 0,
          published_count: 0,
          latest_rows: [],
          ready_to_publish_examples: [],
          published_examples: [],
          search_results: []
        };
      }
      const expectedColumns = [
        "id",
        "slug",
        "path",
        "title",
        "status",
        "quality_score",
        "canonical_url",
        "body_html",
        "body",
        "content_html",
        "html",
        "index_status",
        "published_at",
        "updated_at",
        "last_generated_at",
        "source_data_json"
      ];
      const availability = await probeSeoLandingColumns(expectedColumns);
      const select = seoLandingSelectFromAvailability(availability);
      const params = new URLSearchParams({
        select,
        limit: "5000"
      });
      if (availability.updated_at) params.set("order", "updated_at.desc");
      const rows = await safeSupabase(`seo_landings?${params.toString()}`, null);
      if (!Array.isArray(rows)) {
        return {
          ok: false,
          reason: "seo_landings_unreadable",
          schema_variant: "unknown",
          missing_columns: expectedColumns.filter((column) => availability[column] === false),
          total_rows: 0,
          status_counts: {},
          ready_to_publish_count: 0,
          published_count: 0,
          latest_rows: [],
          ready_to_publish_examples: [],
          published_examples: [],
          search_results: []
        };
      }
      const normalizedLimit = Math.max(1, Math.min(50, Number(sampleLimit) || 10));
      const statusCounts = {};
      for (const row of rows) {
        const status = String(row.status || "unknown").toLowerCase();
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      }
      const publicRows = rows.map(publicSeoLandingRow);
      const searchNeedles = normalizeSearchTerms(searchTerms);
      const searchResults = searchNeedles.map((term) => {
        const matches = rows.filter((row) => {
          const publicRow = publicSeoLandingRow(row);
          const haystack = [publicRow.slug, publicRow.path, publicRow.canonical_url, publicRow.title].filter(Boolean).join(" ").toLowerCase();
          return haystack.includes(term.toLowerCase());
        });
        return {
          search: term,
          exists: matches.length > 0,
          matches: matches.slice(0, normalizedLimit).map(publicSeoLandingRow)
        };
      });
      const targetCandidateRows = Object.fromEntries(
        searchNeedles.map((term) => {
          const match = rows.find((row) => {
            const publicRow = publicSeoLandingRow(row);
            const haystack = [publicRow.slug, publicRow.path, publicRow.canonical_url, publicRow.title].filter(Boolean).join(" ").toLowerCase();
            return haystack.includes(term.toLowerCase());
          });
          return [term, match || null];
        })
      );
      const missingColumns = expectedColumns.filter((column) => availability[column] === false);

      return {
        ok: true,
        schema_variant: schemaVariantFromAvailability(availability),
        missing_columns: missingColumns,
        column_availability: availability,
        total_rows: rows.length,
        total_rows_limit: 5000,
        total_rows_may_be_capped: rows.length >= 5000,
        status_counts: statusCounts,
        ready_to_publish_count: Number(statusCounts.ready_to_publish || 0),
        published_count: Number(statusCounts.published || 0),
        draft_count: Number(statusCounts.draft || 0),
        needs_review_count: Number(statusCounts.needs_review || 0),
        noindex_count: Number(statusCounts.noindex || 0),
        latest_rows: publicRows.slice(0, normalizedLimit),
        ready_to_publish_examples: publicRows
          .filter((row) => String(row.status || "").toLowerCase() === "ready_to_publish")
          .slice(0, normalizedLimit),
        published_examples: publicRows
          .filter((row) => String(row.status || "").toLowerCase() === "published")
          .slice(0, normalizedLimit),
        search_results: searchResults,
        _target_candidate_rows: targetCandidateRows
      };
    },
    async fetchReadyToPublishLandings({ candidateLimit = 25 } = {}) {
      if (!hasSupabaseConfig()) return [];
      const params = new URLSearchParams({
        select: "*",
        status: "in.(ready_to_publish,READY_TO_PUBLISH)",
        order: "quality_score.desc,updated_at.asc",
        limit: String(Math.max(1, Math.min(25, Number(candidateLimit) || 25)))
      });
      return safeSupabase(`seo_landings?${params.toString()}`, []);
    },
    async publishReadyToPublishLanding(landing, patch) {
      if (!hasSupabaseConfig()) throw new Error("Supabase is not configured");
      const params = new URLSearchParams({
        status: "eq.ready_to_publish"
      });
      const landingId = landing.id ?? landing.landing_id;
      if (landingId !== undefined && landingId !== null && landingId !== "") {
        params.set("id", `eq.${landingId}`);
      } else if (landing.slug) {
        params.set("slug", `eq.${landing.slug}`);
      } else {
        throw new Error("landing_identifier_missing");
      }
      let rows;
      try {
        rows = await supabaseFetch(`seo_landings?${params.toString()}`, {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify(patch),
          timeoutMs: 8000
        });
      } catch (error) {
        if (!isMissingSeoPublicationColumn(error)) throw error;
        const { index_status: _indexStatus, published_at: _publishedAt, ...compatiblePatch } = patch;
        rows = await supabaseFetch(`seo_landings?${params.toString()}`, {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify(compatiblePatch),
          timeoutMs: 8000
        });
      }
      return Array.isArray(rows) ? rows[0] || null : rows || null;
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
    skipped_reason: reason || dailyPolicy.skipped_reason || null,
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

function parseJsonMaybe(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function qualityFromReadyLanding(landing = {}) {
  const sourceData = parseJsonMaybe(landing.source_data_json, {});
  return parseJsonMaybe(sourceData.quality, {});
}

function scoreFromReadyLanding(landing = {}, quality = {}) {
  const score = Number(landing.quality_score ?? quality.score ?? 0);
  return Number.isFinite(score) ? score : 0;
}

function sourceDataWithIndexability(landing = {}, indexability = {}) {
  return {
    ...parseJsonMaybe(landing.source_data_json, {}),
    indexability
  };
}

function readyLandingResult({ landing, status, reason = null, quality, indexability, saved = false, publishedAt = null }) {
  const score = scoreFromReadyLanding(landing, quality);
  return normalizeResult({
    slug: landing.slug,
    title: landing.title,
    city: landing.city,
    template_type: landing.template_type,
    status,
    reason,
    index_status: status === "published" ? "index" : landing.index_status,
    quality_score: score,
    final_score: score,
    word_count: indexability?.word_count ?? landing.word_count,
    canonical_url: landing.canonical_url,
    published_at: publishedAt || landing.published_at || null,
    quality_penalties: arrayOrEmpty(quality?.penalties),
    quality_warnings: arrayOrEmpty(quality?.warnings),
    quality_reasons: arrayOrEmpty(quality?.rejection_reasons),
    indexability_reasons: arrayOrEmpty(indexability?.reasons),
    sitemap_eligible: Boolean(indexability?.sitemap_eligible),
    sitemap_reason: indexability?.sitemap_reason || null,
    technical_indexability_status: quality?.technical_indexability_status || null,
    editorial_quality_status: quality?.editorial_quality_status || null,
    saved: Boolean(saved)
  });
}

function readyLandingPublicationBlocker({ landing, quality, indexability, config, limits, publishedThisRun }) {
  const status = String(landing.status || "").toLowerCase();
  const score = scoreFromReadyLanding(landing, quality);
  if (status !== "ready_to_publish") return `status_${status || "unknown"}`;
  if (!config.enabled) return "autogeneration_disabled";
  if (publishedThisRun >= config.max_per_run) return "execution_limit_reached";
  if (Number(limits.remaining_day || 0) - publishedThisRun <= 0) return "daily_limit_reached";
  if (Number(limits.remaining_week || 0) - publishedThisRun <= 0) return "weekly_limit_reached";
  if (score < config.min_score) return "low_score";
  if (quality?.technical_indexability_status === "blocked") return "technical_indexability_blocked";
  if (quality?.editorial_quality_status && !["pass", "ok"].includes(String(quality.editorial_quality_status).toLowerCase())) {
    return "editorial_quality_blocked";
  }
  const rejectionReasons = arrayOrEmpty(quality?.rejection_reasons);
  if (rejectionReasons.length) return rejectionReasons[0];
  if (!indexability.can_publish) return indexability.publish_reasons?.[0] || indexability.primary_reason || "quality_blocked";
  return null;
}

function diagnoseSeoLandingSource({ snapshot, config, limits }) {
  const safeSnapshot = snapshot || {};
  const readyCount = Number(safeSnapshot.ready_to_publish_count || 0);
  const cronCanSeeReadyCandidates = readyCount > 0;
  let reasonIfZero = null;
  if (!safeSnapshot.ok) reasonIfZero = safeSnapshot.reason || "seo_landings_unreadable";
  else if (Number(safeSnapshot.total_rows || 0) === 0) reasonIfZero = "seo_landings_empty";
  else if (!readyCount) reasonIfZero = "no_ready_to_publish_rows";

  return {
    cron_can_see_ready_candidates: cronCanSeeReadyCandidates,
    ready_candidate_count: readyCount,
    reason_if_zero: reasonIfZero,
    probable_next_step: cronCanSeeReadyCandidates
      ? "Run a single protected cron validation only after confirming quotas and dry_run=false."
      : "Create or restore seo_landings rows with status ready_to_publish, then rerun this read-only diagnostic."
  };
}

function candidateDiagnosisFromLanding(row, { config, limits, publishedThisRun = 0 } = {}) {
  if (!row?.exists) {
    return {
      would_be_cron_candidate: false,
      reason: "not_found"
    };
  }
  const landing = row.match || {};
  const quality = qualityFromReadyLanding(landing);
  const score = scoreFromReadyLanding(landing, quality);
  const publishCandidate = {
    ...landing,
    status: "published",
    index_status: "index",
    quality_score: score,
    word_count: landing.word_count ?? quality.word_count
  };
  const indexability = evaluateLandingIndexability(publishCandidate, { quality, minQualityScore: config.min_score });
  const blocker = readyLandingPublicationBlocker({
    landing,
    quality,
    indexability,
    config,
    limits,
    publishedThisRun
  });
  return {
    would_be_cron_candidate: !blocker,
    reason: blocker || "ready_to_publish_candidate",
    score,
    min_score: config.min_score,
    meets_min_score: score >= config.min_score,
    technical_indexability_status: quality?.technical_indexability_status || null,
    editorial_quality_status: quality?.editorial_quality_status || null,
    indexability_reasons: arrayOrEmpty(indexability.reasons),
    sitemap_eligible_after_publish: Boolean(indexability.sitemap_eligible)
  };
}

function targetLandingDiagnostics({ snapshot, config, limits, targetTerms }) {
  const bySearch = new Map((snapshot?.search_results || []).map((item) => [item.search, item]));
  const rawMatches = snapshot?._target_candidate_rows || {};
  return normalizeSearchTerms(targetTerms).map((term) => {
    const searchResult = bySearch.get(term) || { search: term, exists: false, matches: [] };
    const match = Array.isArray(searchResult.matches) ? searchResult.matches[0] || null : null;
    const rawMatch = rawMatches[term] || null;
    const diagnosis = candidateDiagnosisFromLanding(
      {
        exists: Boolean(searchResult.exists && rawMatch),
        match: rawMatch
      },
      { config, limits }
    );
    return {
      search: term,
      exists: Boolean(searchResult.exists),
      status: match?.status || null,
      slug: match?.slug || null,
      path: match?.path || null,
      title: match?.title || null,
      quality_score: match?.quality_score ?? null,
      ...diagnosis,
      match_count: Array.isArray(searchResult.matches) ? searchResult.matches.length : 0
    };
  });
}

async function publishReadyToPublishLandings({ storage, config, now, limits, candidateLimit = 25 }) {
  if (!storage?.fetchReadyToPublishLandings) return null;
  const candidates = await storage.fetchReadyToPublishLandings({ candidateLimit, config, now });
  if (!Array.isArray(candidates) || !candidates.length) return null;

  const results = [];
  let publishedCount = 0;
  let consumedRunSlots = 0;
  let failedCount = 0;

  for (const landing of candidates) {
    const quality = qualityFromReadyLanding(landing);
    const score = scoreFromReadyLanding(landing, quality);
    const publishCandidate = {
      ...landing,
      status: "published",
      index_status: "index",
      quality_score: score,
      word_count: landing.word_count ?? quality.word_count
    };
    const indexability = evaluateLandingIndexability(publishCandidate, { quality, minQualityScore: config.min_score });
    const blocker = readyLandingPublicationBlocker({
      landing,
      quality,
      indexability,
      config,
      limits,
      publishedThisRun: consumedRunSlots
    });

    if (blocker) {
      const blockedStatus = /_limit_reached$/.test(blocker) ? "blocked" : "skipped";
      results.push(readyLandingResult({ landing, status: blockedStatus, reason: blocker, quality, indexability }));
      continue;
    }

    if (config.dry_run) {
      results.push(readyLandingResult({ landing, status: "would_publish", reason: "dry_run_enabled", quality, indexability }));
      consumedRunSlots += 1;
      continue;
    }

    try {
      const patch = {
        status: "published",
        index_status: "index",
        published_at: now,
        updated_at: now,
        last_generated_at: now,
        source_data_json: sourceDataWithIndexability(landing, indexability)
      };
      const saved = storage.publishReadyToPublishLanding
        ? await storage.publishReadyToPublishLanding(landing, patch)
        : null;
      if (!saved) {
        results.push(
          readyLandingResult({
            landing,
            status: "blocked",
            reason: "status_changed_before_publish",
            quality,
            indexability
          })
        );
        continue;
      }
      publishedCount += 1;
      consumedRunSlots += 1;
      results.push(
        readyLandingResult({
          landing: { ...landing, ...patch },
          status: "published",
          quality,
          indexability,
          saved: saved || true,
          publishedAt: now
        })
      );
    } catch (error) {
      failedCount += 1;
      results.push(readyLandingResult({ landing, status: "failed", reason: safeError(error), quality, indexability }));
    }
  }

  return {
    ok: failedCount === 0,
    mode: config.dry_run ? "dry_run" : "publish",
    template_type: "ready_to_publish",
    content_type: "mixed",
    content_type_policy_note:
      "Existing ready_to_publish candidates are evaluated against total run/day/week quotas; selected_content_type only chooses generated fallback content.",
    generated_count: results.length,
    published_count: publishedCount,
    failed_count: failedCount,
    results
  };
}

function summarizeGenerationResult({ result, config, now, requestSource, rows, policy, selectedContentType, run }) {
  const normalizedResults = (Array.isArray(result.results) ? result.results : []).map(normalizeResult);
  const publishedCount = Number(result.published_count || 0);
  const publishedResults = normalizedResults.filter((item) => String(item.status || "").toLowerCase() === "published");
  let publishedLandingsDelta = publishedResults.filter((item) => String(item.template_type || "") !== "editorial_guide").length;
  let publishedNewsDelta = publishedResults.filter((item) => String(item.template_type || "") === "editorial_guide").length;
  if (publishedCount > publishedResults.length) {
    if (selectedContentType === "news") publishedNewsDelta += publishedCount - publishedResults.length;
    else publishedLandingsDelta += publishedCount - publishedResults.length;
  }
  const afterPolicy = {
    ...policy,
    published_landings_today: policy.published_landings_today + publishedLandingsDelta,
    published_news_today: policy.published_news_today + publishedNewsDelta,
    published_total_today: policy.published_total_today + publishedCount
  };
  const wouldPublishCount = config.dry_run
    ? normalizedResults.filter((item) => ["would_publish", "published"].includes(String(item.status || "")) || Number(item.final_score || 0) >= config.min_score).length
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
    if (currentLimits.remaining_day <= 0) {
      const summary = emptySummary({ config, now, requestSource, reason: "daily_limit_reached", rows, policy: dailyPolicy, run });
      summary.settings_status = settingsState;
      return finalizeSummary({ storage, run, summary, status: "completed", env, emailNotification });
    }
    const selectedContentType = dailyPolicy.selected_content_type;

    // Existing ready_to_publish rows have already passed editorial generation and are
    // promoted against total quotas; the daily content-type mix applies to fallback generation.
    const readyPublication = await publishReadyToPublishLandings({
      storage,
      config,
      now,
      limits: currentLimits,
      candidateLimit: 25
    });
    if (readyPublication) {
      const summary = summarizeGenerationResult({
        result: readyPublication,
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
    }

    const existingReadyPublication = storage?.fetchReadyToPublishLandings
      ? await runGeneration({
          mode: config.dry_run ? "dry_run" : "publish",
          template_type: "all",
          limit: 1,
          candidateLimit: 25,
          autoPublish: !config.dry_run,
          includeExistingDrafts: true,
          existingDraftsOnly: true,
          readyToPublishOnly: true,
          publishFirstEligible: true,
          maxPublishesPerRun: config.max_per_run,
          dailyPublishLimit: config.max_per_day,
          minScore: config.min_score,
          publishedToday: dailyPolicy.published_total_today,
          now
        })
      : null;
    if (Number(existingReadyPublication?.generated_count || 0) > 0) {
      const summary = summarizeGenerationResult({
        result: {
          ...existingReadyPublication,
          template_type: "ready_to_publish_existing",
          content_type: "mixed",
          content_type_policy_note:
            "Existing ready_to_publish/draft candidates are evaluated against total run/day/week quotas before selected_content_type fallback."
        },
        config,
        now,
        requestSource,
        rows,
        policy: dailyPolicy,
        selectedContentType: selectedContentType || "existing_ready",
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
    }

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
  const requestedTargetTerms = normalizeSearchTerms(
    options.searchTerms || options.search_terms || options.search || options.slug || options.path
  );
  const targetTerms = requestedTargetTerms.length
    ? requestedTargetTerms
    : ["guias/comprar-para-alquilar-rentabilidad", "guias/reforma-costes-ocultos"];
  const sourceSnapshot = storage.fetchSeoLandingsSourceSnapshot
    ? await storage.fetchSeoLandingsSourceSnapshot({
        sampleLimit: candidateLimit,
        searchTerms: targetTerms
      })
    : {
        ok: false,
        reason: "seo_landings_snapshot_unavailable",
        schema_variant: "unknown",
        missing_columns: [],
        total_rows: 0,
        status_counts: {},
        ready_to_publish_count: 0,
        published_count: 0,
        latest_rows: [],
        ready_to_publish_examples: [],
        published_examples: [],
        search_results: []
      };
  const runGeneration = options.runGeneration || runSeoLandingGeneration;
  const readyPublication = await publishReadyToPublishLandings({
    storage,
    config: { ...config, dry_run: true },
    now,
    limits,
    candidateLimit
  });
  const generation = readyPublication || (await runGeneration({
    mode: "dry_run",
    template_type: templateType,
    limit: 1,
    candidateLimit,
    autoPublish: true,
    includeExistingDrafts: true,
    existingDraftsOnly: true,
    readyToPublishOnly: true,
    publishFirstEligible: true,
    maxPublishesPerRun: config.max_per_run,
    dailyPublishLimit: config.max_per_day,
    minScore: config.min_score,
    publishedToday: dailyPolicy.published_total_today,
    now
  }));
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
  const targetDiagnostics = targetLandingDiagnostics({ snapshot: sourceSnapshot, config, limits, targetTerms });
  const publicSourceSnapshot = { ...sourceSnapshot };
  delete publicSourceSnapshot._target_candidate_rows;

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
    seo_landings_source: publicSourceSnapshot,
    target_landings: targetDiagnostics,
    publication_source_diagnosis: diagnoseSeoLandingSource({ snapshot: sourceSnapshot, config, limits }),
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
