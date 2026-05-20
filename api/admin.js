const { assertAdmin, fetchWithTimeout, handleCors, hasSupabaseConfig, json, readRawBody, supabaseFetch } = require("./_utils");
const { runSeoLandingGeneration } = require("./_seo/generator");
const {
  KPI_SCHEMA_VERSION,
  KPI_SETTINGS_SCHEMA,
  coerceKpiSettings,
  defaultKpiSettings
} = require("./_kpi/settings");
const { generateSocialVideoProject, MUSIC_STYLES, TOPICS, VISUAL_BACKDROPS } = require("../lib/social-video/generator");
const { getVideoBrandingConfig } = require("../lib/social-video/branding");
const {
  RUNWAY_VIDEO_PRICING,
  buildRunwayTextToVideoRequest,
  createRunwayTextToVideo,
  estimateRunwayCost,
  getRunwayTask,
  runwaySettings
} = require("../lib/social-video/runway");
const { summarizeExtensionUsage } = require("../lib/extension-usage/metrics");
const { buildRevenueEventFromLemonPayload, summarizeMonthlyRevenue } = require("../lib/sales/revenue");
const {
  normalizeReleaseArtifactInput,
  normalizeReleaseTarget,
  releaseConnectors
} = require("../lib/operations/releases");
const {
  chromeWebStoreConfig,
  decodeInlineArtifactPayload,
  fetchChromeItemStatus,
  publishChromeItem,
  uploadChromePackage
} = require("../lib/operations/chromeWebStore");

const LANDING_SELECT =
  "id,opportunity_id,slug,title,meta_title,city,province,autonomous_community,template_type,status,index_status,quality_score,word_count,canonical_url,published_at,last_generated_at,created_at,updated_at";

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return req.body ? JSON.parse(req.body) : {};
  const raw = await readRawBody(req);
  if (!raw) return {};
  return JSON.parse(raw);
}

function clampLimit(value, fallback = 50, max = 100) {
  const parsed = Number.parseInt(String(value || fallback), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, parsed));
}

function clampPage(value) {
  const parsed = Number.parseInt(String(value || 1), 10);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, parsed);
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = String(row[key] || "unknown");
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function average(rows, key) {
  const values = rows.map((row) => Number(row[key])).filter(Number.isFinite);
  if (!values.length) return 0;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

function normalizeSlug(slug) {
  return String(slug || "").trim().replace(/^\/+|\/+$/g, "");
}

function sanitizeSearch(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[%*,()]/g, "")
    .slice(0, 80);
}

async function safeFetch(path, fallback = []) {
  try {
    const rows = await supabaseFetch(path);
    return Array.isArray(rows) ? rows : fallback;
  } catch (error) {
    return { error: error.message, rows: fallback };
  }
}

function isProductionRuntime() {
  const runtime = String(process.env.VERCEL_ENV || process.env.NODE_ENV || "").toLowerCase();
  return runtime === "production";
}

function lemonTestMode() {
  const explicit = process.env.LEMONSQUEEZY_TEST_MODE;
  if (explicit !== undefined && explicit !== "") {
    return String(explicit).toLowerCase() !== "false";
  }
  return !isProductionRuntime();
}

function routeFromRequest(req) {
  const url = new URL(req.url || "/", `https://${req.headers.host || "inmoradar.app"}`);
  const resource = url.searchParams.get("resource");
  if (resource) return { url, resource };

  const pathname = url.pathname.replace(/^\/api\/admin\/?/, "").replace(/\/+$/, "");
  return { url, resource: pathname || "summary" };
}

async function handleSummary() {
  const revenueSince = new Date();
  revenueSince.setUTCMonth(revenueSince.getUTCMonth() - 11);
  revenueSince.setUTCDate(1);
  revenueSince.setUTCHours(0, 0, 0, 0);

  const [
    premiumResult,
    recentPremiumResult,
    revenueResult,
    legacyRevenueResult,
    landingResult,
    recentLandingResult,
    opportunityResult,
    parkingResult
  ] = await Promise.all([
      safeFetch("premium_subscriptions?select=status,updated_at&limit=1000"),
      safeFetch(
        "premium_subscriptions?select=email,status,renews_at,ends_at,trial_ends_at,provider,provider_subscription_id,event_name,updated_at,created_at&order=updated_at.desc&limit=8"
      ),
      safeFetch(
        `premium_revenue_events?select=amount_cents,currency,occurred_at,event_name&occurred_at=gte.${revenueSince.toISOString()}&order=occurred_at.asc&limit=5000`
      ),
      safeFetch("premium_subscriptions?select=email,event_name,raw_event,created_at,updated_at&limit=1000"),
      safeFetch("seo_landings?select=status,index_status,quality_score,published_at&limit=1000"),
      safeFetch(
        "seo_landings?select=id,slug,title,city,template_type,status,index_status,quality_score,word_count,updated_at,published_at&order=updated_at.desc&limit=8"
      ),
      safeFetch("seo_landing_opportunities?select=status,template_type&limit=1000"),
      safeFetch("parking_difficulty_cache?select=score,label,confidence_score,perspective,expires_at&limit=1000")
    ]);

  const premiumRows = Array.isArray(premiumResult) ? premiumResult : premiumResult.rows;
  const revenueRows = Array.isArray(revenueResult) ? revenueResult : revenueResult.rows;
  const legacyRevenueRows = Array.isArray(legacyRevenueResult) ? legacyRevenueResult : legacyRevenueResult.rows;
  const legacyRevenueEvents = legacyRevenueRows
    .map((row) => buildRevenueEventFromLemonPayload(row.raw_event, row.event_name))
    .filter(Boolean);
  const useLegacyRevenue = !revenueRows.length && legacyRevenueEvents.length;
  const revenue = {
    ...summarizeMonthlyRevenue(useLegacyRevenue ? legacyRevenueEvents : revenueRows, { months: 12 }),
    source: useLegacyRevenue ? "premium_subscriptions.raw_event" : "premium_revenue_events",
    table_missing: !Array.isArray(revenueResult) && /premium_revenue_events/.test(revenueResult.error || ""),
    error: revenueResult.error || null
  };
  const landingRows = Array.isArray(landingResult) ? landingResult : landingResult.rows;
  const opportunityRows = Array.isArray(opportunityResult) ? opportunityResult : opportunityResult.rows;
  const parkingRows = Array.isArray(parkingResult) ? parkingResult : parkingResult.rows;
  const validParkingRows = parkingRows.filter((row) => !row.expires_at || new Date(row.expires_at).getTime() > Date.now());

  return {
    ok: true,
    generated_at: new Date().toISOString(),
    env: {
      supabase_configured: true,
      lemonsqueezy_checkout_configured: Boolean(
        process.env.LEMONSQUEEZY_API_KEY &&
          process.env.LEMONSQUEEZY_STORE_ID &&
          process.env.LEMONSQUEEZY_VARIANT_ID
      ),
      lemonsqueezy_test_mode: lemonTestMode(),
      lemonsqueezy_webhook_configured: Boolean(process.env.LEMONSQUEEZY_WEBHOOK_SECRET)
    },
    premium: {
      total: premiumRows.length,
      by_status: countBy(premiumRows, "status"),
      recent: Array.isArray(recentPremiumResult) ? recentPremiumResult : recentPremiumResult.rows,
      error: premiumResult.error || recentPremiumResult.error || null
    },
    revenue,
    seo: {
      total_landings: landingRows.length,
      by_status: countBy(landingRows, "status"),
      by_index_status: countBy(landingRows, "index_status"),
      published: landingRows.filter((row) => row.status === "published" && row.index_status === "index").length,
      ready_to_publish: landingRows.filter((row) => row.status === "ready_to_publish").length,
      opportunities_by_status: countBy(opportunityRows, "status"),
      recent_landings: Array.isArray(recentLandingResult) ? recentLandingResult : recentLandingResult.rows,
      error: landingResult.error || recentLandingResult.error || opportunityResult.error || null
    },
    parking: {
      total_cache_rows: parkingRows.length,
      valid_cache_rows: validParkingRows.length,
      average_score: average(validParkingRows, "score"),
      average_confidence: average(validParkingRows, "confidence_score"),
      by_label: countBy(validParkingRows, "label"),
      by_perspective: countBy(validParkingRows, "perspective"),
      error: parkingResult.error || null
    }
  };
}

async function handleParkingSummary() {
  const [result, assessmentResult] = await Promise.all([
    safeFetch(
      "parking_difficulty_cache?select=id,geohash,city,radius_m,perspective,score,label,confidence_score,calculated_at,expires_at&order=calculated_at.desc&limit=100"
    ),
    safeFetch(
      "parking_assessments?select=id,source_url,address_text,street,zone_name,district,municipality,profile,overall_score,overall_label,confidence_score,confidence_label,status,last_checked_at&order=last_checked_at.desc&limit=100"
    )
  ]);
  const rows = Array.isArray(result) ? result : result.rows;
  const assessmentRows = Array.isArray(assessmentResult) ? assessmentResult : assessmentResult.rows;
  const validRows = rows.filter((row) => !row.expires_at || new Date(row.expires_at).getTime() > Date.now());

  return {
    ok: true,
    generated_at: new Date().toISOString(),
    total_cache_rows: rows.length,
    valid_cache_rows: validRows.length,
    expired_cache_rows: rows.length - validRows.length,
    average_score: average(validRows, "score"),
    average_confidence: average(validRows, "confidence_score"),
    by_label: countBy(validRows, "label"),
    by_perspective: countBy(validRows, "perspective"),
    assessments_total: assessmentRows.length,
    assessments_recent: assessmentRows,
    recent: assessmentRows.length ? assessmentRows : rows,
    error: result.error || assessmentResult.error || null
  };
}

async function handlePremiumSubscriptions(url) {
  const limit = clampLimit(url.searchParams.get("limit"), 50, 100);
  const status = String(url.searchParams.get("status") || "").trim().toLowerCase();
  const q = sanitizeSearch(url.searchParams.get("q"));
  const provider = sanitizeSearch(url.searchParams.get("provider"));
  const eventName = sanitizeSearch(url.searchParams.get("event_name"));
  const params = new URLSearchParams({
    select:
      "email,status,renews_at,ends_at,trial_ends_at,provider,provider_customer_id,provider_subscription_id,provider_order_id,product_id,variant_id,event_name,created_at,updated_at",
    order: "updated_at.desc",
    limit: String(limit)
  });

  if (status && status !== "all") params.set("status", `eq.${status}`);
  if (provider) params.set("provider", `ilike.*${provider}*`);
  if (eventName) params.set("event_name", `ilike.*${eventName}*`);
  if (q) {
    params.set(
      "or",
      `(${[
        `email.ilike.*${q}*`,
        `status.ilike.*${q}*`,
        `provider.ilike.*${q}*`,
        `provider_customer_id.ilike.*${q}*`,
        `provider_subscription_id.ilike.*${q}*`,
        `provider_order_id.ilike.*${q}*`,
        `product_id.ilike.*${q}*`,
        `variant_id.ilike.*${q}*`,
        `event_name.ilike.*${q}*`
      ].join(",")})`
    );
  }

  const rows = await supabaseFetch(`premium_subscriptions?${params.toString()}`);
  return {
    ok: true,
    count: Array.isArray(rows) ? rows.length : 0,
    subscriptions: Array.isArray(rows) ? rows : []
  };
}

async function handleExtensionUsageSummary() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({
    select:
      "event_name,anonymous_id_hash,session_id_hash,browser_name,browser_version,platform,country,extension_version,duration_seconds,active_seconds,created_at",
    created_at: `gte.${since}`,
    order: "created_at.desc",
    limit: "5000"
  });

  try {
    const rows = await supabaseFetch(`extension_usage_events?${params.toString()}`);
    return {
      ok: true,
      generated_at: new Date().toISOString(),
      window_days: 30,
      ...summarizeExtensionUsage(Array.isArray(rows) ? rows : [])
    };
  } catch (error) {
    return {
      ok: false,
      generated_at: new Date().toISOString(),
      window_days: 30,
      total_events: 0,
      unique_users_30d: 0,
      active_users_7d: 0,
      active_users_24h: 0,
      sessions_30d: 0,
      active_seconds_30d: 0,
      average_session_seconds: 0,
      by_browser: [],
      by_country: [],
      by_extension_version: [],
      by_event_name: [],
      table_missing: /extension_usage_events/.test(error.message),
      error: error.message
    };
  }
}

async function fetchLanding(slug) {
  const rows = await supabaseFetch(
    `seo_landings?slug=eq.${encodeURIComponent(slug)}&select=${LANDING_SELECT}&limit=1`
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function patchLanding(slug, patch) {
  const rows = await supabaseFetch(`seo_landings?slug=eq.${encodeURIComponent(slug)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(patch)
  });
  return Array.isArray(rows) ? rows[0] || null : rows;
}

function opportunityFromLanding(landing) {
  return {
    id: landing.opportunity_id || null,
    keyword: landing.title || `precio metro cuadrado ${landing.city}`,
    city: landing.city,
    province: landing.province,
    autonomous_community: landing.autonomous_community,
    intent: "informational",
    template_type: landing.template_type,
    search_priority: Number(landing.quality_score) || 0,
    status: landing.status,
    existing_landing_id: landing.id,
    existing_landing_slug: landing.slug,
    existing_landing_status: landing.status,
    existing_landing_quality_score: Number(landing.quality_score) || 0
  };
}

async function handleSeoLandingAction(body) {
  const action = String(body.action || "").trim();
  const slug = normalizeSlug(body.slug);
  if (!slug) return { status: 400, payload: { ok: false, error: "slug_required" } };
  if (!["publish", "noindex", "archive", "regenerate"].includes(action)) {
    return { status: 400, payload: { ok: false, error: "invalid_action" } };
  }

  const landing = await fetchLanding(slug);
  if (!landing) return { status: 404, payload: { ok: false, error: "landing_not_found" } };

  if (action === "publish") {
    const score = Number(landing.quality_score) || 0;
    if (score < 75) {
      return {
        status: 409,
        payload: { ok: false, error: "quality_too_low", message: "Quality score must be at least 75." }
      };
    }
    const updated = await patchLanding(slug, {
      status: "published",
      index_status: "index",
      published_at: landing.published_at || new Date().toISOString()
    });
    return { status: 200, payload: { ok: true, action, landing: updated } };
  }

  if (action === "noindex") {
    const updated = await patchLanding(slug, { status: "noindex", index_status: "noindex" });
    return { status: 200, payload: { ok: true, action, landing: updated } };
  }

  if (action === "archive") {
    const updated = await patchLanding(slug, { status: "archived", index_status: "noindex" });
    return { status: 200, payload: { ok: true, action, landing: updated } };
  }

  const result = await runSeoLandingGeneration({
    mode: "generate",
    limit: 1,
    template_type: landing.template_type,
    opportunities: [opportunityFromLanding(landing)],
    autoPublish: false
  });
  return { status: 200, payload: { ok: true, action, result } };
}

async function handleReleaseArtifacts(req, url) {
  if (req.method === "GET") {
    const rawTarget = url.searchParams.get("target");
    const target = rawTarget ? normalizeReleaseTarget(rawTarget) : "";
    const limit = clampLimit(url.searchParams.get("limit"), 50, 100);
    const params = new URLSearchParams({
      select:
        "id,target,version,title,channel,status,artifact_kind,connector_target,file_name,mime_type,file_size_bytes,sha256,storage_path,notes,created_at,updated_at",
      order: "created_at.desc",
      limit: String(limit)
    });
    if (target) params.set("target", `eq.${target}`);
    const result = await safeFetch(`release_artifacts?${params.toString()}`);
    const rows = Array.isArray(result) ? result : result.rows;
    return {
      status: 200,
      payload: {
        ok: true,
        target: target || "all",
        artifacts: rows,
        connectors: releaseConnectors(),
        table_missing: !Array.isArray(result) && /release_artifacts/.test(result.error || ""),
        error: Array.isArray(result) ? null : result.error || null
      }
    };
  }

  if (req.method !== "POST") {
    return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
  }

  const input = await readJsonBody(req);
  const artifact = normalizeReleaseArtifactInput(input);
  const rows = await supabaseFetch("release_artifacts", {
    method: "POST",
    headers: {
      prefer: "return=representation"
    },
    body: JSON.stringify(artifact)
  });

  return {
    status: 200,
    payload: {
      ok: true,
      artifact: Array.isArray(rows) ? rows[0] : artifact,
      connectors: releaseConnectors()
    }
  };
}

function chromeFetch(url, options = {}) {
  return fetchWithTimeout(url, {
    ...options,
    timeoutMs: Number(process.env.CHROME_WEBSTORE_TIMEOUT_MS || 60000)
  });
}

function appendReleaseNote(existingNotes, note) {
  const stamp = new Date().toISOString();
  const notes = [existingNotes, `[${stamp}] ${note}`].filter(Boolean).join("\n");
  return notes.slice(-4000);
}

function summarizeChromeStatus(payload = {}) {
  const published = payload.publishedItemRevisionStatus?.state;
  const submitted = payload.submittedItemRevisionStatus?.state;
  const upload = payload.lastAsyncUploadState;
  return [
    published ? `publicado=${published}` : "",
    submitted ? `revision=${submitted}` : "",
    upload ? `upload=${upload}` : "",
    payload.takenDown ? "retirado=true" : "",
    payload.warned ? "aviso=true" : ""
  ]
    .filter(Boolean)
    .join(", ") || "estado recibido";
}

async function releaseArtifactById(id) {
  const cleanId = String(id || "").trim();
  if (!cleanId) return null;
  const params = new URLSearchParams({
    id: `eq.${cleanId}`,
    select: "*",
    limit: "1"
  });
  const rows = await supabaseFetch(`release_artifacts?${params.toString()}`);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function patchReleaseArtifact(id, patch) {
  const cleanId = String(id || "").trim();
  if (!cleanId) throw new Error("release_artifact_id_required");
  const rows = await supabaseFetch(`release_artifacts?id=eq.${encodeURIComponent(cleanId)}`, {
    method: "PATCH",
    headers: {
      prefer: "return=representation"
    },
    body: JSON.stringify({
      ...patch,
      updated_at: new Date().toISOString()
    })
  });
  return Array.isArray(rows) ? rows[0] : null;
}

function assertChromeReleaseArtifact(artifact) {
  if (!artifact) throw new Error("release_artifact_not_found");
  const connector = String(artifact.connector_target || "").toLowerCase();
  if (artifact.target !== "extension" || connector !== "chrome") {
    throw new Error("chrome_release_artifact_required");
  }
}

async function handleChromeOperation(req) {
  if (req.method !== "POST") {
    return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
  }

  const input = await readJsonBody(req);
  const action = String(input.action || "").trim().toLowerCase();
  const config = chromeWebStoreConfig();
  if (!config.configured) {
    return {
      status: 400,
      payload: {
        ok: false,
        error: "chrome_webstore_not_configured",
        message: `Faltan variables de entorno para Chrome Web Store: ${config.missing.join(", ")}`,
        missing: config.missing
      }
    };
  }

  const chromeOptions = { config, fetchImpl: chromeFetch };
  const artifact = input.artifact_id ? await releaseArtifactById(input.artifact_id) : null;

  if (action === "status") {
    const chromeStatus = await fetchChromeItemStatus(chromeOptions);
    let updated = null;
    if (artifact) {
      assertChromeReleaseArtifact(artifact);
      updated = await patchReleaseArtifact(artifact.id, {
        notes: appendReleaseNote(artifact.notes, `Chrome status: ${summarizeChromeStatus(chromeStatus)}`)
      });
    }
    return {
      status: 200,
      payload: {
        ok: true,
        action,
        message: `Estado de Chrome leido: ${summarizeChromeStatus(chromeStatus)}.`,
        artifact: updated,
        chrome_status: chromeStatus
      }
    };
  }

  if (!artifact) {
    return { status: 400, payload: { ok: false, error: "artifact_id_required", message: "Selecciona un artefacto de Chrome." } };
  }
  assertChromeReleaseArtifact(artifact);

  if (action === "upload") {
    const packageBuffer = decodeInlineArtifactPayload(artifact);
    const chromeUpload = await uploadChromePackage(packageBuffer, {
      ...chromeOptions,
      mimeType: artifact.mime_type || "application/zip"
    });
    const uploadState = chromeUpload.uploadState || "UPLOAD_SUBMITTED";
    const updated = await patchReleaseArtifact(artifact.id, {
      status: uploadState === "UPLOAD_FAILED" ? "failed" : "submitted",
      notes: appendReleaseNote(artifact.notes, `Chrome upload: ${uploadState}${chromeUpload.crxVersion ? ` version=${chromeUpload.crxVersion}` : ""}`)
    });
    return {
      status: 200,
      payload: {
        ok: true,
        action,
        message: `ZIP enviado a Chrome Web Store (${uploadState}). Comprueba el estado antes de enviarlo a revision.`,
        artifact: updated,
        chrome_upload: chromeUpload
      }
    };
  }

  if (action === "publish") {
    const chromePublish = await publishChromeItem({
      ...chromeOptions,
      publishType: input.publish_type || input.publishType || "DEFAULT_PUBLISH",
      deployPercentage: input.deploy_percentage ?? input.deployPercentage,
      skipReview: input.skip_review === true || input.skipReview === true
    });
    const updated = await patchReleaseArtifact(artifact.id, {
      status: "submitted",
      notes: appendReleaseNote(artifact.notes, `Chrome publish: ${chromePublish.state || "submitted"}`)
    });
    return {
      status: 200,
      payload: {
        ok: true,
        action,
        message: "Extension enviada a revision/publicacion en Chrome Web Store.",
        artifact: updated,
        chrome_publish: chromePublish
      }
    };
  }

  return {
    status: 400,
    payload: { ok: false, error: "unsupported_chrome_action", message: `Accion de Chrome no soportada: ${action || "-"}` }
  };
}

async function handleSeoLandings(req, url) {
  if (req.method === "POST") {
    return handleSeoLandingAction(await readJsonBody(req));
  }

  const pageSize = clampLimit(url.searchParams.get("limit"), 10, 50);
  const page = clampPage(url.searchParams.get("page"));
  const offset = (page - 1) * pageSize;
  const status = String(url.searchParams.get("status") || "").trim().toLowerCase();
  const params = new URLSearchParams({
    select: LANDING_SELECT,
    order: "updated_at.desc",
    limit: String(pageSize + 1),
    offset: String(offset)
  });
  if (status && status !== "all") params.set("status", `eq.${status}`);

  const rows = await supabaseFetch(`seo_landings?${params.toString()}`);
  const allRows = Array.isArray(rows) ? rows : [];
  const hasNextPage = allRows.length > pageSize;
  const landings = allRows.slice(0, pageSize);
  return {
    status: 200,
    payload: {
      ok: true,
      count: landings.length,
      page,
      page_size: pageSize,
      has_next_page: hasNextPage,
      has_previous_page: page > 1,
      from: landings.length ? offset + 1 : 0,
      to: offset + landings.length,
      landings
    }
  };
}

async function handleSeoGenerate(req) {
  if (req.method !== "POST") {
    return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
  }
  const body = await readJsonBody(req);
  const result = await runSeoLandingGeneration({
    mode: body.mode || "dry_run",
    limit: body.limit || 5,
    candidateLimit: body.candidateLimit,
    template_type: body.template_type || "random",
    autoPublish: body.autoPublish === true,
    includeExistingDrafts: body.includeExistingDrafts === true,
    publishFirstEligible: body.publishFirstEligible === true,
    dailyPublishLimit: typeof body.dailyPublishLimit === "number" ? body.dailyPublishLimit : undefined,
    maxPublishesPerRun: typeof body.maxPublishesPerRun === "number" ? body.maxPublishesPerRun : undefined
  });
  return { status: 200, payload: result };
}

async function readKpiSettings() {
  try {
    const rows = await supabaseFetch(
      "kpi_settings?id=eq.default&select=id,schema_version,settings_json,updated_at&limit=1"
    );
    const row = Array.isArray(rows) ? rows[0] || null : null;
    return {
      ok: true,
      row,
      settings: coerceKpiSettings(row?.settings_json || {}),
      updated_at: row?.updated_at || null,
      table_missing: false,
      error: null
    };
  } catch (error) {
    return {
      ok: false,
      row: null,
      settings: defaultKpiSettings(),
      updated_at: null,
      table_missing: /kpi_settings/.test(error.message),
      error: error.message
    };
  }
}

async function saveKpiSettings(body) {
  const settings = coerceKpiSettings(body.settings || body.values || {});
  const now = new Date().toISOString();
  const rows = await supabaseFetch("kpi_settings?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify([
      {
        id: "default",
        schema_version: KPI_SCHEMA_VERSION,
        settings_json: settings,
        updated_by: "backoffice",
        updated_at: now
      }
    ])
  });
  const row = Array.isArray(rows) ? rows[0] || null : null;
  return {
    ok: true,
    schema_version: KPI_SCHEMA_VERSION,
    schema: KPI_SETTINGS_SCHEMA,
    defaults: defaultKpiSettings(),
    settings: coerceKpiSettings(row?.settings_json || settings),
    updated_at: row?.updated_at || now
  };
}

async function handleKpiSettings(req) {
  if (req.method === "GET") {
    const result = await readKpiSettings();
    return {
      status: 200,
      payload: {
        ok: true,
        schema_version: KPI_SCHEMA_VERSION,
        schema: KPI_SETTINGS_SCHEMA,
        defaults: defaultKpiSettings(),
        settings: result.settings,
        updated_at: result.updated_at,
        table_missing: result.table_missing,
        error: result.error
      }
    };
  }

  if (req.method === "POST") {
    return { status: 200, payload: await saveKpiSettings(await readJsonBody(req)) };
  }

  return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
}

async function handleSocialVideoGenerate(req) {
  if (req.method === "GET") {
    return {
      status: 200,
      payload: {
        ok: true,
        branding: getVideoBrandingConfig(),
        topics: Object.entries(TOPICS).map(([value, config]) => ({ value, label: config.label })),
        visual_backdrops: Object.entries(VISUAL_BACKDROPS).map(([value, config]) => ({ value, label: config.label })),
        music_styles: Object.entries(MUSIC_STYLES).map(([value, config]) => ({ value, label: config.label }))
      }
    };
  }

  if (req.method !== "POST") {
    return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
  }

  const body = await readJsonBody(req);
  return {
    status: 200,
    payload: generateSocialVideoProject(body)
  };
}

function runwayPublicConfig() {
  const settings = runwaySettings();
  return {
    ok: true,
    provider: "runway",
    enabled: settings.enabled,
    api_secret_configured: settings.apiSecretConfigured,
    dry_run_only: settings.dryRunOnly,
    default_model: settings.model,
    default_duration_seconds: settings.durationSeconds,
    default_ratio: settings.ratio,
    max_cost_usd: settings.maxCostUsd,
    daily_budget_usd: settings.dailyBudgetUsd,
    credit_usd: 0.01,
    pricing: RUNWAY_VIDEO_PRICING
  };
}

async function readSocialVideoJob(id) {
  const params = new URLSearchParams({
    id: `eq.${id}`,
    select: "*",
    limit: "1"
  });
  const rows = await supabaseFetch(`social_video_jobs?${params.toString()}`);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function insertSocialVideoJob(job) {
  const rows = await supabaseFetch("social_video_jobs", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(job)
  });
  return Array.isArray(rows) ? rows[0] || null : rows;
}

async function patchSocialVideoJob(id, patch) {
  const rows = await supabaseFetch(`social_video_jobs?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      ...patch,
      updated_at: new Date().toISOString()
    })
  });
  return Array.isArray(rows) ? rows[0] || null : rows;
}

async function runwayCreditsSpentToday() {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const params = new URLSearchParams({
    select: "estimated_credits,status",
    provider: "eq.runway",
    created_at: `gte.${since.toISOString()}`
  });
  const rows = await supabaseFetch(`social_video_jobs?${params.toString()}`);
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => String(row.status || "").toLowerCase() !== "failed")
    .reduce((sum, row) => sum + Number(row.estimated_credits || 0), 0);
}

function socialVideoJobPayload(job, extra = {}) {
  return {
    ok: true,
    job: {
      id: job.id,
      project_id: job.project_id,
      provider: job.provider,
      provider_task_id: job.provider_task_id,
      status: job.status,
      model: job.model,
      duration_seconds: job.duration_seconds,
      ratio: job.ratio,
      estimated_credits: Number(job.estimated_credits || 0),
      estimated_cost_usd: Number(job.estimated_cost_usd || 0),
      result_url: job.result_url || null,
      failure: job.failure || null,
      created_at: job.created_at,
      updated_at: job.updated_at
    },
    ...extra
  };
}

function runwayOutputUrl(output) {
  const first = Array.isArray(output) ? output[0] : output;
  if (typeof first === "string") return first;
  if (first && typeof first === "object") return first.url || first.uri || first.download_url || null;
  return null;
}

async function handleSocialVideoRender(req, url) {
  const settings = runwaySettings();

  if (req.method === "GET") {
    const jobId = String(url.searchParams.get("job_id") || "").trim();
    if (!jobId) return { status: 400, payload: { ok: false, error: "job_id_required" } };
    const job = await readSocialVideoJob(jobId);
    if (!job) return { status: 404, payload: { ok: false, error: "social_video_job_not_found" } };
    if (!job.provider_task_id || ["succeeded", "failed"].includes(String(job.status || "").toLowerCase())) {
      return { status: 200, payload: socialVideoJobPayload(job) };
    }

    const task = await getRunwayTask({
      apiSecret: settings.apiSecret,
      taskId: job.provider_task_id,
      fetchImpl: fetchWithTimeout
    });
    const status = String(task.status || "").toLowerCase();
    const outputUrl = runwayOutputUrl(task.output);
    const failure = task.failure || task.error || null;
    const updated = await patchSocialVideoJob(job.id, {
      status,
      result_url: outputUrl || job.result_url || null,
      failure: failure ? String(failure) : null,
      raw_response: task
    });
    return { status: 200, payload: socialVideoJobPayload(updated || job, { runway_status: task.status || null }) };
  }

  if (req.method !== "POST") {
    return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
  }

  const body = await readJsonBody(req);
  const project = body.project || {};
  const model = body.model || settings.model;
  const durationSeconds = body.duration_seconds || settings.durationSeconds;
  const estimate = estimateRunwayCost({ model, durationSeconds });
  const request = buildRunwayTextToVideoRequest({
    project,
    model: estimate.model,
    durationSeconds: estimate.duration_seconds,
    ratio: body.ratio || settings.ratio,
    sceneIndex: body.scene_index || 0
  });
  const estimatePayload = {
    ok: true,
    dry_run: Boolean(body.dry_run),
    provider: "runway",
    request,
    estimate,
    max_cost_usd: settings.maxCostUsd,
    daily_budget_usd: settings.dailyBudgetUsd
  };

  if (body.dry_run) {
    return { status: 200, payload: estimatePayload };
  }
  if (!settings.enabled || settings.dryRunOnly) {
    return { status: 403, payload: { ...estimatePayload, ok: false, error: "runway_render_disabled" } };
  }
  if (!settings.apiSecretConfigured) {
    return { status: 500, payload: { ...estimatePayload, ok: false, error: "runway_api_secret_missing" } };
  }
  if (estimate.estimated_cost_usd > settings.maxCostUsd) {
    return { status: 400, payload: { ...estimatePayload, ok: false, error: "runway_estimate_above_max_cost" } };
  }
  if (Number(body.confirm_cost_usd || 0) < estimate.estimated_cost_usd) {
    return { status: 400, payload: { ...estimatePayload, ok: false, error: "runway_cost_confirmation_required" } };
  }

  const usedCredits = await runwayCreditsSpentToday();
  const budgetCredits = Math.floor(settings.dailyBudgetUsd / 0.01);
  if (usedCredits + estimate.estimated_credits > budgetCredits) {
    return {
      status: 400,
      payload: {
        ...estimatePayload,
        ok: false,
        error: "runway_daily_budget_exceeded",
        used_credits_today: usedCredits,
        budget_credits: budgetCredits
      }
    };
  }

  const job = await insertSocialVideoJob({
    project_id: project.id || null,
    provider: "runway",
    status: "queued",
    model: request.model,
    duration_seconds: request.duration,
    ratio: request.ratio,
    prompt_text: request.promptText,
    estimated_credits: estimate.estimated_credits,
    estimated_cost_usd: estimate.estimated_cost_usd,
    raw_request: request
  });

  try {
    const task = await createRunwayTextToVideo({
      apiSecret: settings.apiSecret,
      fetchImpl: fetchWithTimeout,
      request
    });
    const updated = await patchSocialVideoJob(job.id, {
      provider_task_id: task.id || task.task_id || null,
      status: String(task.status || "submitted").toLowerCase(),
      raw_response: task
    });
    return { status: 200, payload: socialVideoJobPayload(updated || job, { estimate }) };
  } catch (error) {
    await patchSocialVideoJob(job.id, {
      status: "failed",
      failure: error.message
    }).catch(() => {});
    return { status: 502, payload: { ...estimatePayload, ok: false, error: "runway_create_failed", message: error.message } };
  }
}

async function handleSocialVideoRenderContent(req, res, url) {
  if (req.method !== "GET") return json(res, 405, { ok: false, error: "method_not_allowed" });
  const jobId = String(url.searchParams.get("job_id") || "").trim();
  if (!jobId) return json(res, 400, { ok: false, error: "job_id_required" });
  const job = await readSocialVideoJob(jobId);
  if (!job || !job.result_url) return json(res, 404, { ok: false, error: "runway_result_not_ready" });

  const response = await fetchWithTimeout(job.result_url, { timeoutMs: 30000 });
  if (!response.ok) return json(res, 502, { ok: false, error: "runway_result_fetch_failed", status: response.status });
  const contentType = response.headers.get("content-type") || "video/mp4";
  const buffer = Buffer.from(await response.arrayBuffer());
  res.statusCode = 200;
  res.setHeader("content-type", contentType);
  res.setHeader("cache-control", "no-store, max-age=0");
  res.setHeader("content-length", String(buffer.length));
  res.end(buffer);
}

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!assertAdmin(req, res)) return;
  if (!hasSupabaseConfig()) {
    return json(res, 500, { ok: false, error: "supabase_not_configured" });
  }

  const { url, resource } = routeFromRequest(req);

  try {
    if (resource === "summary") {
      if (req.method !== "GET") return json(res, 405, { ok: false, error: "method_not_allowed" });
      return json(res, 200, await handleSummary());
    }
    if (resource === "premium/subscriptions") {
      if (req.method !== "GET") return json(res, 405, { ok: false, error: "method_not_allowed" });
      return json(res, 200, await handlePremiumSubscriptions(url));
    }
    if (resource === "extension/usage") {
      if (req.method !== "GET") return json(res, 405, { ok: false, error: "method_not_allowed" });
      return json(res, 200, await handleExtensionUsageSummary());
    }
    if (resource === "seo/landings") {
      if (!["GET", "POST"].includes(req.method)) return json(res, 405, { ok: false, error: "method_not_allowed" });
      const result = await handleSeoLandings(req, url);
      return json(res, result.status, result.payload);
    }
    if (resource === "seo/generate-landings") {
      const result = await handleSeoGenerate(req);
      return json(res, result.status, result.payload);
    }
    if (resource === "kpis/settings") {
      const result = await handleKpiSettings(req);
      return json(res, result.status, result.payload);
    }
    if (resource === "parking/summary") {
      if (req.method !== "GET") return json(res, 405, { ok: false, error: "method_not_allowed" });
      return json(res, 200, await handleParkingSummary());
    }
    if (resource === "operations/releases") {
      const result = await handleReleaseArtifacts(req, url);
      return json(res, result.status, result.payload);
    }
    if (resource === "operations/chrome") {
      const result = await handleChromeOperation(req);
      return json(res, result.status, result.payload);
    }
    if (resource === "social-video/generate") {
      const result = await handleSocialVideoGenerate(req);
      return json(res, result.status, result.payload);
    }
    if (resource === "social-video/runway-config") {
      if (req.method !== "GET") return json(res, 405, { ok: false, error: "method_not_allowed" });
      return json(res, 200, runwayPublicConfig());
    }
    if (resource === "social-video/render") {
      const result = await handleSocialVideoRender(req, url);
      return json(res, result.status, result.payload);
    }
    if (resource === "social-video/render-content") {
      return handleSocialVideoRenderContent(req, res, url);
    }

    return json(res, 404, { ok: false, error: "admin_resource_not_found", resource });
  } catch (error) {
    console.error("[admin]", resource, error);
    return json(res, 500, {
      ok: false,
      error: "admin_request_failed",
      message: error.message
    });
  }
};
