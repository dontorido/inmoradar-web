const { isEmail, normalizeEmail, sanitizeErrorMessage } = require("../_utils");
const {
  buildCloudflareEmailPayload,
  cloudflareEmailConfig,
  isCloudflareEmailConfigured,
  sendCloudflareEmail
} = require("../_email/cloudflareEmail");
const { formatMadridDateTime } = require("../_formatters/madridDateTime");

const DEFAULT_SITE_URL = "https://inmoradar.app";
const COPY_URL_PATH = "/copiar-url";
const SEARCH_CONSOLE_URL = "https://search.google.com/search-console/index?resource_id=sc-domain%3Ainmoradar.app";

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function cleanText(value, fallback = "") {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text || fallback;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function unique(values) {
  return [...new Set((values || []).map((value) => cleanText(value)).filter(Boolean))];
}

function safeInt(value, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function siteUrlFromEnv(env = process.env) {
  const raw = env.PUBLIC_SITE_URL || env.SITE_URL || DEFAULT_SITE_URL;
  try {
    const url = new URL(String(raw));
    if (/^www\.inmoradar\.app$/i.test(url.hostname)) url.hostname = "inmoradar.app";
    return url.origin.replace(/\/+$/, "");
  } catch {
    return DEFAULT_SITE_URL;
  }
}

function normalizePublishedUrl(value, siteUrl = DEFAULT_SITE_URL) {
  if (!value) return null;
  try {
    const url = new URL(String(value), siteUrl);
    if (/^www\.inmoradar\.app$/i.test(url.hostname)) url.hostname = "inmoradar.app";
    return url.toString();
  } catch {
    return value;
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redactKnownSecrets(message, env = process.env) {
  let clean = String(message || "");
  const secrets = [
    env.CLOUDFLARE_EMAIL_API_TOKEN,
    env.SUPABASE_SERVICE_ROLE_KEY,
    env.ADMIN_IMPORT_TOKEN,
    env.CRON_SECRET
  ].filter((value) => value && String(value).length >= 4);
  for (const secret of secrets) {
    clean = clean.replace(new RegExp(escapeRegExp(secret), "g"), "[redacted]");
  }
  return clean;
}

function safeEmailError(error, env = process.env) {
  return redactKnownSecrets(sanitizeErrorMessage(error, 300), env);
}

function buildSeoPublicationEmailConfig(env = process.env) {
  const cloudflare = cloudflareEmailConfig(env);
  const recipient = normalizeEmail(env.SEO_PUBLICATION_EMAIL_TO || "");
  return {
    enabled: parseBoolean(env.SEO_PUBLICATION_EMAIL_ENABLED, false),
    recipient: isEmail(recipient) ? recipient : "",
    from: cleanText(env.SEO_PUBLICATION_EMAIL_FROM || cloudflare.from || "hola@inmoradar.app"),
    site_url: siteUrlFromEnv(env),
    cloudflare
  };
}

function targetPathForResult(item = {}) {
  if (item.target_path) return item.target_path;
  const slug = item.slug || item.path;
  return slug ? `/${String(slug).replace(/^\/+|\/+$/g, "")}/` : null;
}

function absoluteUrlForPath(path, siteUrl) {
  if (!path) return null;
  try {
    return normalizePublishedUrl(new URL(path, siteUrl).toString(), siteUrl);
  } catch {
    return path;
  }
}

function copyUrlPageUrl(publishedUrl, siteUrl = DEFAULT_SITE_URL) {
  const base = siteUrlFromEnv({ PUBLIC_SITE_URL: siteUrl });
  const url = normalizePublishedUrl(publishedUrl, base) || base;
  return `${base}${COPY_URL_PATH}?url=${encodeURIComponent(url)}`;
}

function scoreForResult(item = {}) {
  const score = Number(item.final_score ?? item.quality_score ?? item.score ?? 0);
  return Number.isFinite(score) ? score : 0;
}

function minScoreForSummary(summary = {}) {
  const raw = summary.config?.min_score ?? summary.min_score ?? summary.minScore;
  const score = Number(raw);
  return Number.isFinite(score) ? score : null;
}

function publishedPagesFromSummary(summary = {}) {
  const results = Array.isArray(summary.results) ? summary.results : [];
  const explicitlyPublished = results.filter((item) => String(item.status || "").toLowerCase() === "published");
  const source = explicitlyPublished.length ? explicitlyPublished : Number(summary.published_count || 0) > 0 ? results : [];
  return source
    .filter((item) => item && (String(item.status || "").toLowerCase() === "published" || !explicitlyPublished.length))
    .map((item) => {
      const targetPath = targetPathForResult(item);
      const slug = cleanText(item.slug || (targetPath ? targetPath.replace(/^\/+|\/+$/g, "") : ""), "sin-slug");
      return {
        title: cleanText(item.title || item.h1 || item.city || item.template_type || item.page_type, "Pagina SEO"),
        slug,
        city: cleanText(item.city || item.municipality) || null,
        template_type: cleanText(item.template_type || item.page_type) || null,
        index_status: cleanText(item.index_status || item.technical_indexability_status) || null,
        target_path: targetPath,
        url: absoluteUrlForPath(item.canonical_url || targetPath, summary.site_url || DEFAULT_SITE_URL),
        score: scoreForResult(item)
      };
    })
    .filter((item) => item.target_path || item.url || item.slug);
}

function countSeoPublicationTotals(rows = []) {
  const allRows = Array.isArray(rows) ? rows : [];
  const statusOf = (row) => String(row.status || "").toLowerCase();
  const indexStatusOf = (row) => String(row.index_status || "").toLowerCase();
  return {
    total_landings: allRows.length,
    published_landings: allRows.filter((row) => statusOf(row) === "published").length,
    indexable_landings: allRows.filter((row) => statusOf(row) === "published" && indexStatusOf(row) === "index").length,
    drafts: allRows.filter((row) => statusOf(row) === "draft").length,
    pending_review: allRows.filter((row) => ["pending", "needs_review", "ready_to_publish", "review"].includes(statusOf(row))).length
  };
}

async function fetchSeoPublicationTotals(storage) {
  if (storage && typeof storage.fetchSeoPublicationTotals === "function") {
    const totals = await storage.fetchSeoPublicationTotals();
    if (totals && typeof totals === "object") return totals;
  }
  return null;
}

function resultReasons(item = {}) {
  return unique([
    item.reason,
    ...arrayOrEmpty(item.quality_reasons),
    ...arrayOrEmpty(item.rejection_reasons),
    ...arrayOrEmpty(item.quality_penalties),
    ...arrayOrEmpty(item.penalties),
    ...arrayOrEmpty(item.quality_warnings),
    ...arrayOrEmpty(item.warnings)
  ]);
}

function isNonPublishedDiagnosticResult(item = {}) {
  const status = String(item.status || "").toLowerCase();
  return ["draft", "needs_review", "ready_to_publish", "skipped", "would_skip", "failed"].includes(status);
}

function skipCounterStatus(item = {}) {
  return ["skipped", "would_skip"].includes(String(item.status || "").toLowerCase());
}

function draftCounterStatus(item = {}) {
  return ["draft", "needs_review", "ready_to_publish"].includes(String(item.status || "").toLowerCase());
}

function exactNonPublicationReason(item = {}, summary = {}) {
  const status = String(item.status || "").toLowerCase();
  if (status === "published") return null;
  if (item.reason) return item.reason;

  const qualityReasons = arrayOrEmpty(item.quality_reasons || item.rejection_reasons);
  const indexabilityReasons = arrayOrEmpty(item.indexability_reasons);
  const technicalReason = indexabilityReasons.find((reason) => reason !== "quality_score_below_threshold");
  if (technicalReason) return technicalReason;

  const minScore = minScoreForSummary(summary);
  const score = scoreForResult(item);
  if (minScore !== null && score < minScore) return "score_below_publish_threshold";
  if (qualityReasons.length) return qualityReasons[0];
  if (indexabilityReasons.length) return indexabilityReasons[0];
  if (summary.dry_run || summary.mode === "dry_run") return "diagnostic_dry_run_only";
  if (status === "draft") return "draft_created_for_review";
  if (status === "needs_review") return "needs_editorial_review";
  if (status === "ready_to_publish") return "ready_but_not_published_by_run";
  if (status === "failed") return "candidate_failed";
  if (skipCounterStatus(item)) return "candidate_skipped";
  return "not_published";
}

function publicationDiagnosticCandidate(item = {}, summary = {}) {
  const status = String(item.status || "").toLowerCase() || null;
  const minScore = minScoreForSummary(summary);
  const score = scoreForResult(item);
  const countedAsSkip = skipCounterStatus(item);
  const countedAsDraft = draftCounterStatus(item);
  const notPublished = status !== "published";
  const reason = exactNonPublicationReason(item, summary);
  return {
    target_path: targetPathForResult(item),
    slug: item.slug || null,
    title: item.title || null,
    city: item.city || item.municipality || null,
    template_type: item.template_type || item.page_type || null,
    status,
    reason,
    original_reason: item.reason || null,
    score,
    min_score: minScore,
    meets_min_score: minScore === null ? null : score >= minScore,
    counted_as_skip: countedAsSkip,
    counted_as_draft: countedAsDraft,
    discarded_before_skip: Boolean(notPublished && !countedAsSkip),
    quality_penalties: arrayOrEmpty(item.quality_penalties || item.penalties),
    quality_warnings: arrayOrEmpty(item.quality_warnings || item.warnings),
    quality_reasons: arrayOrEmpty(item.quality_reasons || item.rejection_reasons),
    indexability_reasons: arrayOrEmpty(item.indexability_reasons),
    technical_indexability_status: item.technical_indexability_status || null,
    editorial_quality_status: item.editorial_quality_status || null,
    sitemap_eligible: typeof item.sitemap_eligible === "boolean" ? item.sitemap_eligible : null,
    sitemap_reason: item.sitemap_reason || null,
    score_components: {
      data_quality_score: item.data_quality_score ?? null,
      uniqueness_score: item.uniqueness_score ?? null,
      seo_opportunity_score: item.seo_opportunity_score ?? null,
      conversion_potential_score: item.conversion_potential_score ?? null
    }
  };
}

function aggregateReasons(results = []) {
  const counts = new Map();
  for (const item of results) {
    for (const reason of resultReasons(item)) {
      counts.set(reason, (counts.get(reason) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason));
}

function nextStepsForNoPublication(reasonCounts = []) {
  const reasons = reasonCounts.map((item) => item.reason).join(" | ");
  const steps = [];
  if (/sin fuente visible|source/i.test(reasons)) {
    steps.push("Asegurar que cada plantilla muestra fuente y fecha del dato dentro del contenido visible.");
  }
  if (/menos de 500 palabras|longitud/i.test(reasons)) {
    steps.push("Ampliar el contenido especifico hasta al menos 700 palabras utiles antes de publicar.");
  }
  if (/genericas|absolutas|contenido especifico/i.test(reasons)) {
    steps.push("Anadir bloques especificos de ciudad y retirar afirmaciones absolutas.");
  }
  if (/canonical|mojibake|encoding/i.test(reasons)) {
    steps.push("Corregir problemas tecnicos de canonical o encoding antes de indexar.");
  }
  if (/quality_score_below|score_below|threshold/i.test(reasons)) {
    steps.push("Mejorar datos, plantilla y unicidad hasta superar el umbral configurado; no bajar el quality gate.");
  }
  if (!steps.length) {
    steps.push("Revisar publication_diagnostics.low_score_results para ver penalizaciones, warnings y score de cada candidato.");
  }
  return unique(steps);
}

function buildPublicationDiagnostics(summary = {}) {
  const results = Array.isArray(summary.results) ? summary.results : [];
  const diagnosticResults = results.filter(isNonPublishedDiagnosticResult);
  const evaluatedCandidates = results.map((item) => publicationDiagnosticCandidate(item, summary));
  const lowScoreResults = diagnosticResults
    .map((item) => publicationDiagnosticCandidate(item, summary))
    .filter((item) => item.meets_min_score === false || item.status !== "published");
  const reasonCounts = aggregateReasons(diagnosticResults);
  const publishedCount = safeInt(summary.published_count, 0);
  const notCountedAsSkip = evaluatedCandidates.filter((item) => item.status !== "published" && !item.counted_as_skip);
  return {
    min_score: minScoreForSummary(summary),
    evaluated_candidates_count: results.length,
    published_count: publishedCount,
    draft_count: safeInt(summary.draft_count, 0),
    skipped_count: safeInt(summary.skipped_count, 0),
    failed_count: safeInt(summary.failed_count, 0),
    non_published_count: evaluatedCandidates.filter((item) => item.status !== "published").length,
    not_counted_as_skip_count: notCountedAsSkip.length,
    discarded_before_skip_count: evaluatedCandidates.filter((item) => item.discarded_before_skip).length,
    skip_counter_explanation: "skipped_count only counts candidates whose result status is skipped or would_skip; low-score ready_to_publish/needs_review/draft candidates can be non-published without incrementing skip.",
    reason_counts: reasonCounts,
    evaluated_candidates: evaluatedCandidates.slice(0, 25),
    low_score_results: lowScoreResults.slice(0, 10),
    next_steps: publishedCount === 0 ? nextStepsForNoPublication(reasonCounts) : []
  };
}

function formatMetric(value) {
  return value === null || value === undefined ? "No disponible" : String(value);
}

function pageMetaLine(page = {}) {
  return [
    page.city ? `Ciudad: ${page.city}` : null,
    page.template_type ? `Template: ${page.template_type}` : null,
    page.index_status ? `Indexacion: ${page.index_status}` : null
  ]
    .filter(Boolean)
    .join(" | ");
}

function publishedLast24h(summary = {}, fallback = 0) {
  return safeInt(
    summary.limits?.published_last_24h ?? summary.published_last_24h ?? summary.daily_policy?.published_total_today,
    fallback
  );
}

function nextScheduledAt(summary = {}) {
  const explicit = summary.next_scheduled_at || summary.cron?.next_scheduled_at || summary.cron?.next_run_at;
  if (explicit) return explicit;

  const timestamp = Date.parse(summary.finished_at || summary.started_at || "");
  if (!Number.isFinite(timestamp)) return "Cada 4 horas";
  const date = new Date(timestamp);
  date.setUTCMinutes(0, 0, 0);
  const nextHour = Math.floor(date.getUTCHours() / 4) * 4 + 4;
  date.setUTCHours(nextHour);
  return date.toISOString();
}

function nextScheduledLabel(summary = {}) {
  const value = nextScheduledAt(summary);
  if (value === "Cada 4 horas") return value;
  return formatMadridDateTime(value, "No disponible");
}

function dailyLimit(summary = {}) {
  return safeInt(summary.limits?.max_per_day ?? summary.config?.max_per_day, null);
}

function remainingToday(summary = {}, publishedLast24hValue = null) {
  const explicit = safeInt(summary.limits?.remaining_day, null);
  if (explicit !== null) return explicit;
  const limit = dailyLimit(summary);
  if (limit === null || publishedLast24hValue === null) return null;
  return Math.max(0, limit - publishedLast24hValue);
}

function lastResult(summary = {}) {
  return cleanText(
    summary.status ||
      summary.result_status ||
      summary.run_status ||
      (summary.ok === false ? "failed" : summary.reason || summary.skipped_reason ? "skipped" : "completed"),
    "completed"
  );
}

function scoreLabel(value) {
  const score = Number(value);
  return Number.isFinite(score) ? `${Math.round(score)}/100` : "No disponible";
}

function emailButtonHtml({ href, label, variant = "orange" }) {
  const variants = {
    orange: "background:#FF5A0A;color:#FFFFFF;border:1px solid #FF5A0A;",
    black: "background:#0A0A0A;color:#FFFFFF;border:1px solid #0A0A0A;",
    light: "background:#FFFFFF;color:#0B0B0C;border:1px solid #DED8D2;"
  };
  return `<a href="${escapeHtml(href)}" style="${variants[variant] || variants.light}border-radius:999px;display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:900;line-height:1.2;padding:15px 20px;text-decoration:none;">${escapeHtml(label)}</a>`;
}

function emailKpiCardHtml(label, value, detail) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;border:1px solid #DED8D2;border-radius:24px;">
    <tr>
      <td style="padding:18px 16px 17px;">
        <p style="color:#7A726B;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:900;letter-spacing:2px;line-height:1.2;margin:0 0 10px;text-transform:uppercase;">${escapeHtml(label)}</p>
        <p style="color:#0B0B0C;font-family:Arial,Helvetica,sans-serif;font-size:28px;font-weight:900;letter-spacing:0;line-height:1;margin:0 0 8px;">${escapeHtml(value)}</p>
        <p style="color:#5E5A57;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;line-height:1.35;margin:0;">${escapeHtml(detail)}</p>
      </td>
    </tr>
  </table>`;
}

function summaryMetricCell(label, value) {
  return `<td class="metric-cell" width="25%" style="padding:0 8px 10px 0;vertical-align:top;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F7F5F3;border:1px solid #E7E0DA;border-radius:16px;">
      <tr>
        <td style="padding:13px 12px 12px;">
          <p style="color:#7A726B;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:900;letter-spacing:1.3px;line-height:1.2;margin:0 0 7px;text-transform:uppercase;">${escapeHtml(label)}</p>
          <p style="color:#0B0B0C;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:900;line-height:1.25;margin:0;">${escapeHtml(value)}</p>
        </td>
      </tr>
    </table>
  </td>`;
}

function detailRow(label, value) {
  return `<tr>
    <td style="border-bottom:1px solid #EEE8E2;color:#7A726B;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:900;letter-spacing:1.5px;line-height:1.3;padding:13px 12px 13px 0;text-transform:uppercase;vertical-align:top;width:34%;">${escapeHtml(label)}</td>
    <td style="border-bottom:1px solid #EEE8E2;color:#0B0B0C;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:800;line-height:1.45;padding:13px 0;vertical-align:top;">${escapeHtml(value)}</td>
  </tr>`;
}

function renderSeoPublicationEmailLegacy({ summary, pages, totals, config }) {
  const publishedCount = safeInt(summary.published_count, 0);
  const pageLabel = publishedCount === 1 ? "pagina SEO publicada" : "paginas SEO publicadas";
  const subject = `[InmoRadar] ${publishedCount} ${pageLabel}`;
  const primaryPage = pages[0] || {};
  const primaryHref = absoluteUrlForPath(primaryPage.url || primaryPage.target_path || "/", config.site_url || DEFAULT_SITE_URL);
  const copyHref = copyUrlPageUrl(primaryHref, config.site_url || DEFAULT_SITE_URL);
  const last24h = publishedLast24h(summary, publishedCount);
  const nextLaunch = nextScheduledAt(summary);
  const rows = pages.length
    ? pages
        .map((page) => {
          const href = absoluteUrlForPath(page.url || page.target_path || "", config.site_url || DEFAULT_SITE_URL) || "";
          const label = page.target_path || page.slug || page.url || "Sin URL";
          const meta = pageMetaLine(page);
          return `<tr>
            <td style="padding:16px 0;border-bottom:1px solid #eee7dc;">
              <a href="${escapeHtml(href)}" style="color:#171717;text-decoration:none;font-weight:800;font-size:15px;line-height:1.35;">${escapeHtml(
                page.title || label
              )}</a>
              <div style="margin-top:6px;color:#7a4a1f;font-size:13px;font-weight:700;">${escapeHtml(label)}</div>
              <div style="margin-top:6px;color:#766e63;font-size:12px;">${escapeHtml(meta || "Lista para revision")}</div>
            </td>
            <td style="padding:16px 0 16px 18px;border-bottom:1px solid #eee7dc;text-align:right;vertical-align:top;">
              <span style="display:inline-block;background:#eef8ef;color:#176534;border:1px solid #cde9d1;border-radius:999px;padding:6px 10px;font-size:12px;font-weight:800;">Score ${escapeHtml(
                page.score
              )}</span>
            </td>
          </tr>`;
        })
        .join("")
    : `<tr>
        <td style="padding:16px 0;border-bottom:1px solid #eee7dc;color:#766e63;">Sin detalle de paginas</td>
        <td style="padding:16px 0;border-bottom:1px solid #eee7dc;text-align:right;">-</td>
      </tr>`;
  const html = `<!doctype html>
<html>
<body style="margin:0;background:#f6f1e9;color:#171717;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;color:transparent;">
    ${escapeHtml(publishedCount)} ${escapeHtml(pageLabel)} tras superar el quality gate de InmoRadar.
  </div>
  <main style="max-width:680px;margin:0 auto;padding:28px 16px;">
    <section style="background:#171717;border-radius:24px 24px 0 0;padding:28px 28px 24px;color:#fff;">
      <p style="margin:0 0 18px;color:#f4c77c;font-size:13px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;">InmoRadar</p>
      <h1 style="margin:0;font-size:30px;line-height:1.15;letter-spacing:-.03em;">Nueva pagina SEO publicada</h1>
      <p style="margin:14px 0 0;color:#e8dccb;font-size:16px;line-height:1.55;">
        La automatizacion publico ${escapeHtml(publishedCount)} ${escapeHtml(pageLabel.replace("SEO ", ""))} despues de superar los controles de calidad.
      </p>
    </section>

    <section style="background:#ffffff;border:1px solid #eadfce;border-top:0;border-radius:0 0 24px 24px;padding:28px;box-shadow:0 12px 32px rgba(23,23,23,.08);">
      <p style="margin:0 0 10px;color:#7a4a1f;font-size:12px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;">Pagina destacada</p>
      <h2 style="margin:0 0 8px;font-size:22px;line-height:1.25;color:#171717;">${escapeHtml(
        primaryPage.title || "Pagina SEO publicada"
      )}</h2>
      <p style="margin:0 0 18px;color:#766e63;font-size:14px;line-height:1.6;">${escapeHtml(
        primaryPage.target_path || primaryPage.slug || "URL disponible en el backoffice"
      )}</p>
      <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 22px;border-collapse:collapse;">
        <tr>
          <td style="padding:0 8px 8px 0;"><span style="display:inline-block;background:#eef8ef;color:#176534;border:1px solid #cde9d1;border-radius:999px;padding:8px 12px;font-size:12px;font-weight:800;">Publicada</span></td>
          <td style="padding:0 8px 8px 0;"><span style="display:inline-block;background:#fdf6e7;color:#7a4a1f;border:1px solid #f2d7a2;border-radius:999px;padding:8px 12px;font-size:12px;font-weight:800;">Quality gate superado</span></td>
          <td style="padding:0 0 8px 0;"><span style="display:inline-block;background:#f3f1ee;color:#5c5750;border:1px solid #e4ddd4;border-radius:999px;padding:8px 12px;font-size:12px;font-weight:800;">Score ${escapeHtml(
            primaryPage.score ?? "OK"
          )}</span></td>
        </tr>
      </table>
      <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0;border-collapse:collapse;">
        <tr>
          <td style="padding:0 8px 8px 0;">
            <a href="${escapeHtml(primaryHref)}" style="display:inline-block;background:#171717;color:#ffffff;text-decoration:none;border-radius:14px;padding:13px 18px;font-size:14px;font-weight:900;white-space:nowrap;">Ver URL publicada</a>
          </td>
          <td style="padding:0 8px 8px 0;">
            <a href="${escapeHtml(copyHref)}" style="display:inline-block;background:#ffffff;color:#171717;text-decoration:none;border:1px solid #d9cdbb;border-radius:14px;padding:12px 17px;font-size:14px;font-weight:900;white-space:nowrap;">Copiar URL</a>
          </td>
          <td style="padding:0 0 8px 0;">
            <a href="${escapeHtml(SEARCH_CONSOLE_URL)}" style="display:inline-block;background:#fdf6e7;color:#7a4a1f;text-decoration:none;border:1px solid #f2d7a2;border-radius:14px;padding:12px 17px;font-size:14px;font-weight:900;white-space:nowrap;">Abrir Search Console</a>
          </td>
        </tr>
      </table>
    </section>

    <section style="margin-top:18px;background:#fff;border:1px solid #eadfce;border-radius:20px;padding:24px;">
      <h3 style="margin:0 0 14px;font-size:18px;color:#171717;">Paginas publicadas</h3>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
        <tbody>${rows}</tbody>
      </table>
    </section>

    <section style="margin-top:18px;background:#fff;border:1px solid #eadfce;border-radius:20px;padding:24px;">
      <h3 style="margin:0 0 10px;font-size:18px;color:#171717;">Revision recomendada</h3>
      <p style="margin:0 0 14px;color:#5c5750;line-height:1.65;">
        Antes de aumentar cadencia o limites, conviene revisar que la pagina esta bien preparada para indexacion y conversion.
      </p>
      <p style="margin:0;color:#5c5750;line-height:1.8;font-size:14px;">
        Canonical correcto &nbsp;·&nbsp; Sitemap actualizado &nbsp;·&nbsp; Vista movil &nbsp;·&nbsp; Title, H1 y meta &nbsp;·&nbsp; Tildes y caracteres
      </p>
    </section>

    <section style="margin-top:18px;background:#fff;border:1px solid #eadfce;border-radius:20px;padding:24px;">
      <h3 style="margin:0 0 10px;font-size:18px;color:#171717;">Resumen operativo</h3>
      <p style="margin:0;color:#5c5750;line-height:1.75;font-size:14px;">
        Ejecucion: ${escapeHtml(summary.job_name || "seo")}<br>
        Publicadas en esta ejecucion: ${escapeHtml(publishedCount)}<br>
        Drafts: ${escapeHtml(formatMetric(summary.draft_count))}<br>
        Skipped: ${escapeHtml(formatMetric(summary.skipped_count))}<br>
        Fallidas: ${escapeHtml(formatMetric(summary.failed_count))}<br>
        Ultima ejecucion: ${escapeHtml(summary.finished_at || summary.started_at || "No disponible")}<br>
        Modo: ${escapeHtml(summary.dry_run ? "simulacion" : "publicacion real")}<br>
        Min score: ${escapeHtml(config.min_score ?? summary.config?.min_score ?? "No disponible")}
      </p>
    </section>

    <section style="margin-top:18px;background:#fff;border:1px solid #eadfce;border-radius:20px;padding:24px;">
      <h3 style="margin:0 0 10px;font-size:18px;color:#171717;">Resumen ultimas 24 horas</h3>
      <p style="margin:0;color:#5c5750;line-height:1.75;font-size:14px;">
        Publicadas ultimas 24 horas: ${escapeHtml(formatMetric(last24h))}<br>
        Landings hoy: ${escapeHtml(formatMetric(summary.published_landings_today))} / ${escapeHtml(formatMetric(summary.target_landings_per_day))}<br>
        Guias hoy: ${escapeHtml(formatMetric(summary.published_news_today))} / ${escapeHtml(formatMetric(summary.target_news_per_day))}<br>
        Siguiente lanzamiento programado: ${escapeHtml(nextLaunch)}
      </p>
    </section>

    <section style="margin-top:18px;background:#fff;border:1px solid #eadfce;border-radius:20px;padding:24px;">
      <h3 style="margin:0 0 10px;font-size:18px;color:#171717;">Totales SEO</h3>
      <p style="margin:0;color:#5c5750;line-height:1.75;font-size:14px;">
        Landings publicadas: ${escapeHtml(formatMetric(totals?.published_landings))}<br>
        Landings indexables: ${escapeHtml(formatMetric(totals?.indexable_landings))}<br>
        Drafts: ${escapeHtml(formatMetric(totals?.drafts))}<br>
        Pendientes/review: ${escapeHtml(formatMetric(totals?.pending_review))}
      </p>
    </section>

    <p style="margin:22px 0 0;text-align:center;color:#8a8175;font-size:12px;line-height:1.6;">
      InmoRadar · Analiza pisos antes de contactar
    </p>
  </main>
</body>
</html>`;
  const text = [
    "InmoRadar - Nueva pagina SEO publicada",
    "",
    `Se han publicado ${publishedCount} ${pageLabel} tras superar el quality gate.`,
    "",
    "Acciones:",
    `- Ver URL publicada: ${primaryHref}`,
    `- Copiar URL: ${copyHref}`,
    `- Abrir Search Console: ${SEARCH_CONSOLE_URL}`,
    "",
    "Paginas publicadas:",
    ...(pages.length ? pages : [{ target_path: "Sin detalle", score: "-" }]).map((page) => {
      const meta = pageMetaLine(page);
      return `- ${page.title || "Pagina SEO"} | ${page.target_path || page.slug || page.url || "Sin URL"} | score ${page.score}${meta ? ` | ${meta}` : ""}`;
    }),
    "",
    "Revision recomendada:",
    "- Canonical correcto",
    "- Sitemap actualizado",
    "- Vista movil",
    "- Title, H1 y meta description",
    "- Tildes y caracteres",
    "",
    "Resumen operativo:",
    `- job: ${summary.job_name || "seo"}`,
    `- request_source: ${summary.request_source || "unknown"}`,
    `- finished_at: ${summary.finished_at || summary.started_at || "No disponible"}`,
    `- draft_count: ${formatMetric(summary.draft_count)}`,
    `- skipped_count: ${formatMetric(summary.skipped_count)}`,
    `- failed_count: ${formatMetric(summary.failed_count)}`,
    `- min_score: ${config.min_score ?? summary.config?.min_score ?? "No disponible"}`,
    "",
    "Resumen ultimas 24 horas:",
    `- publicadas ultimas 24 horas: ${formatMetric(last24h)}`,
    `- landings hoy: ${formatMetric(summary.published_landings_today)} / ${formatMetric(summary.target_landings_per_day)}`,
    `- guias hoy: ${formatMetric(summary.published_news_today)} / ${formatMetric(summary.target_news_per_day)}`,
    `- siguiente lanzamiento programado: ${nextLaunch}`,
    "",
    "Totales SEO:",
    `- landings publicadas: ${formatMetric(totals?.published_landings)}`,
    `- landings indexables: ${formatMetric(totals?.indexable_landings)}`,
    `- drafts: ${formatMetric(totals?.drafts)}`,
    `- pendientes/review: ${formatMetric(totals?.pending_review)}`
  ].join("\n");
  return { subject, html, text };
}

function renderSeoPublicationEmail({ summary, pages, totals, config }) {
  const publishedCount = safeInt(summary.published_count, 0);
  const pageLabel = publishedCount === 1 ? "pagina SEO publicada" : "paginas SEO publicadas";
  const subject = `[InmoRadar] ${publishedCount} ${pageLabel}`;
  const primaryPage = pages[0] || {};
  const primaryHref = absoluteUrlForPath(primaryPage.url || primaryPage.target_path || "/", config.site_url || DEFAULT_SITE_URL);
  const copyHref = copyUrlPageUrl(primaryHref, config.site_url || DEFAULT_SITE_URL);
  const last24h = publishedLast24h(summary, null);
  const limitDay = dailyLimit(summary);
  const remainingDay = remainingToday(summary, last24h);
  const nextLaunch = nextScheduledLabel(summary);
  const resultStatus = lastResult(summary);
  const publishedPath = primaryPage.target_path || primaryPage.slug || primaryPage.url || "No disponible";
  const pageTitle = primaryPage.title || "URL SEO publicada";
  const pageScore = scoreLabel(primaryPage.score);
  const indexStatus = primaryPage.index_status || "No disponible";
  const templateType = primaryPage.template_type || "No disponible";
  const city = primaryPage.city || "No disponible";

  const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escapeHtml(subject)}</title>
  <style>
    body { margin:0 !important; padding:0 !important; background:#F3F1EF; }
    table { border-collapse:separate; }
    a { text-decoration:none; }
    @media screen and (max-width: 620px) {
      .container { width:100% !important; }
      .outer-pad { padding:18px 12px !important; }
      .hero-pad { padding:34px 22px 30px !important; }
      .hero-title { font-size:42px !important; line-height:.98 !important; }
      .section-pad { padding:24px 22px !important; }
      .kpi-cell { display:block !important; width:100% !important; padding:0 0 10px !important; }
      .metric-cell { display:block !important; width:100% !important; padding:0 0 10px !important; }
      .button-cell { display:block !important; width:100% !important; padding:0 0 10px !important; text-align:left !important; }
    }
  </style>
</head>
<body style="background:#F3F1EF;margin:0;padding:0;">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;visibility:hidden;">Nueva URL SEO publicada tras superar los controles de calidad de InmoRadar.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F3F1EF;">
    <tr>
      <td class="outer-pad" align="center" style="padding:30px 14px;">
        <table role="presentation" class="container" width="680" cellpadding="0" cellspacing="0" border="0" style="max-width:680px;width:680px;">
          <tr>
            <td style="padding:0 0 14px;">
              <p style="color:#0B0B0C;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:900;letter-spacing:0;line-height:1;margin:0;">Inmo<span style="color:#FF5A0A;">Radar</span></p>
            </td>
          </tr>
          <tr>
            <td class="hero-pad" style="background:#FAF8F6;background-image:radial-gradient(#DED8D2 1px, transparent 1px);background-size:18px 18px;border:1px solid #DED8D2;border-radius:30px;padding:44px 40px 38px;">
              <p style="color:#FF5A0A;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:900;letter-spacing:2.4px;line-height:1.2;margin:0 0 20px;text-transform:uppercase;">INMORADAR · SEO AUTOGENERATION</p>
              <h1 class="hero-title" style="color:#0B0B0C;font-family:Arial,Helvetica,sans-serif;font-size:58px;font-weight:900;letter-spacing:0;line-height:.94;margin:0 0 20px;">Nueva URL SEO publicada.</h1>
              <p style="color:#3A3632;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:1.55;margin:0 0 24px;max-width:560px;">La automatización ha publicado una nueva página tras superar los controles de calidad. Revisa la URL, copia el enlace o abre Search Console para inspeccionarla.</p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="button-cell" style="padding:0 10px 0 0;">${emailButtonHtml({ href: primaryHref, label: "Ver URL publicada", variant: "orange" })}</td>
                  <td class="button-cell" style="padding:0 10px 0 0;">${emailButtonHtml({ href: copyHref, label: "Copiar URL", variant: "black" })}</td>
                  <td class="button-cell">${emailButtonHtml({ href: SEARCH_CONSOLE_URL, label: "Abrir Search Console", variant: "light" })}</td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 0 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="kpi-cell" width="50%" style="padding:0 7px 12px 0;">${emailKpiCardHtml("Score", pageScore, `Min score: ${formatMetric(config.min_score ?? summary.config?.min_score)}`)}</td>
                  <td class="kpi-cell" width="50%" style="padding:0 0 12px 7px;">${emailKpiCardHtml("Estado", "Publicada", resultStatus)}</td>
                </tr>
                <tr>
                  <td class="kpi-cell" width="50%" style="padding:0 7px 0 0;">${emailKpiCardHtml("Indexación", indexStatus, `Indexacion: ${indexStatus}`)}</td>
                  <td class="kpi-cell" width="50%" style="padding:0 0 0 7px;">${emailKpiCardHtml("Siguiente lanzamiento", nextLaunch, "Hora Madrid")}</td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="section-pad" style="padding:42px 26px 18px;">
              <p style="color:#FF5A0A;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:900;letter-spacing:2.4px;line-height:1.2;margin:0 0 14px;text-transform:uppercase;">Resumen últimas 24 horas</p>
              <h2 style="color:#0B0B0C;font-family:Arial,Helvetica,sans-serif;font-size:36px;font-weight:900;letter-spacing:0;line-height:1.04;margin:0 0 18px;">Publicación completada<br>sin perder contexto.</h2>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  ${summaryMetricCell("Publicadas 24h", formatMetric(last24h))}
                  ${summaryMetricCell("Límite diario", formatMetric(limitDay))}
                  ${summaryMetricCell("Restantes hoy", formatMetric(remainingDay))}
                  ${summaryMetricCell("Último resultado", resultStatus)}
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:0 0 18px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;border:1px solid #DED8D2;border-radius:28px;">
                <tr>
                  <td class="section-pad" style="padding:30px 30px 28px;">
                    <p style="color:#FF5A0A;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:900;letter-spacing:2.4px;line-height:1.2;margin:0 0 14px;text-transform:uppercase;">Página publicada</p>
                    <h2 style="color:#0B0B0C;font-family:Arial,Helvetica,sans-serif;font-size:32px;font-weight:900;letter-spacing:0;line-height:1.08;margin:0 0 10px;">${escapeHtml(pageTitle)}</h2>
                    <p style="color:#5E5A57;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:800;line-height:1.45;margin:0 0 18px;word-break:break-word;">${escapeHtml(publishedPath)}</p>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      ${detailRow("Ciudad", city)}
                      ${detailRow("Template", `Template: ${templateType}`)}
                      ${detailRow("Score", pageScore)}
                      ${detailRow("Indexacion", `Indexacion: ${indexStatus}`)}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:0 0 18px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0A0A0A;border-radius:28px;">
                <tr>
                  <td class="section-pad" style="padding:30px 30px 28px;">
                    <p style="color:#FF8A4C;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:900;letter-spacing:2.4px;line-height:1.2;margin:0 0 14px;text-transform:uppercase;">Acción recomendada</p>
                    <h2 style="color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;font-size:30px;font-weight:900;letter-spacing:0;line-height:1.06;margin:0 0 16px;">Revisa antes de<br>subir la cadencia.</h2>
                    <p style="color:#E8E0D8;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.62;margin:0 0 22px;max-width:560px;">Revisa la URL publicada y, si todo está correcto, abre Search Console para comprobar su estado de indexación.</p>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td class="button-cell" style="padding:0 10px 0 0;">${emailButtonHtml({ href: primaryHref, label: "Ver URL publicada", variant: "orange" })}</td>
                        <td class="button-cell">${emailButtonHtml({ href: SEARCH_CONSOLE_URL, label: "Abrir Search Console", variant: "light" })}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="section-pad" style="padding:18px 26px 12px;">
              <p style="color:#7A726B;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.7;margin:0;">
                Total landings publicadas: ${escapeHtml(formatMetric(totals?.published_landings))} · Total landings indexables: ${escapeHtml(formatMetric(totals?.indexable_landings))} · Drafts: ${escapeHtml(formatMetric(totals?.drafts))} · Pendientes/review: ${escapeHtml(formatMetric(totals?.pending_review))}
              </p>
              <p style="color:#7A726B;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.7;margin:10px 0 0;">
                Ejecución: ${escapeHtml(summary.job_name || "seo")} · Modo: ${escapeHtml(summary.dry_run ? "simulación" : "publicación real")} · Última ejecución: ${escapeHtml(formatMadridDateTime(summary.finished_at || summary.started_at, "No disponible"))}
              </p>
            </td>
          </tr>

          <tr>
            <td style="border-top:1px solid #DED8D2;padding:22px 0 4px;">
              <p style="color:#0B0B0C;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:900;letter-spacing:2px;line-height:1.2;margin:0 0 7px;text-transform:uppercase;">INMORADAR</p>
              <p style="color:#5E5A57;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.45;margin:0;">Analiza anuncios antes de contactar.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  const text = [
    "InmoRadar - Nueva URL SEO publicada",
    "",
    "La automatización ha publicado una nueva página tras superar los controles de calidad.",
    "",
    "Acciones:",
    `- Ver URL publicada: ${primaryHref}`,
    `- Copiar URL: ${copyHref}`,
    `- Abrir Search Console: ${SEARCH_CONSOLE_URL}`,
    "",
    "Resumen últimas 24 horas:",
    `- Publicadas 24h: ${formatMetric(last24h)}`,
    `- Límite diario: ${formatMetric(limitDay)}`,
    `- Restantes hoy: ${formatMetric(remainingDay)}`,
    `- Último resultado: ${resultStatus}`,
    `- Siguiente lanzamiento: ${nextLaunch}`,
    "",
    "Página publicada:",
    `- title: ${pageTitle}`,
    `- path: ${publishedPath}`,
    `- ciudad: ${city}`,
    `- template_type: ${templateType}`,
    `- score: ${pageScore}`,
    `- index_status: ${indexStatus}`,
    "",
    "Acción recomendada:",
    "Revisa la URL publicada y, si todo está correcto, abre Search Console para comprobar su estado de indexación.",
    "",
    "Resumen operativo:",
    `- job: ${summary.job_name || "seo"}`,
    `- request_source: ${summary.request_source || "unknown"}`,
    `- estado: ${resultStatus}`,
    `- finished_at: ${formatMadridDateTime(summary.finished_at || summary.started_at, "No disponible")}`,
    `- draft_count: ${formatMetric(summary.draft_count)}`,
    `- skipped_count: ${formatMetric(summary.skipped_count)}`,
    `- failed_count: ${formatMetric(summary.failed_count)}`,
    `- min_score: ${config.min_score ?? summary.config?.min_score ?? "No disponible"}`,
    "",
    "Totales SEO:",
    `- total landings publicadas: ${formatMetric(totals?.published_landings)}`,
    `- total landings indexables: ${formatMetric(totals?.indexable_landings)}`,
    `- drafts: ${formatMetric(totals?.drafts)}`,
    `- pendientes/review: ${formatMetric(totals?.pending_review)}`
  ].join("\n");
  return { subject, html, text };
}

function buildSeoPublicationEmailPayload(summary, context = {}) {
  const config = context.config || buildSeoPublicationEmailConfig(context.env || process.env);
  const summaryWithSite = { ...summary, site_url: config.site_url };
  const pages = context.pages || publishedPagesFromSummary(summaryWithSite);
  const totals = context.totals || null;
  const email = renderSeoPublicationEmail({ summary: summaryWithSite, pages, totals, config });
  return buildCloudflareEmailPayload({
    to: config.recipient,
    from: config.from,
    subject: email.subject,
    html: email.html,
    text: email.text,
    headers: { "X-InmoRadar-Notification": "seo-publication" }
  });
}

async function sendSeoPublicationEmail(summary, context = {}) {
  const env = context.env || process.env;
  const config = context.config || buildSeoPublicationEmailConfig(env);
  const totals =
    Object.prototype.hasOwnProperty.call(context, "totals") ? context.totals : await fetchSeoPublicationTotals(context.storage).catch(() => null);
  const summaryWithSite = { ...summary, site_url: config.site_url };
  const pages = context.pages || publishedPagesFromSummary(summaryWithSite);
  const payload = buildSeoPublicationEmailPayload(summaryWithSite, { ...context, config, pages, totals });
  if (context.transport) {
    return context.transport({ payload, summary: summaryWithSite, pages, totals, config });
  }
  return sendCloudflareEmail(payload, { env, fetchImpl: context.fetchImpl, config: config.cloudflare });
}

async function maybeSendSeoPublicationEmail({ summary, storage, env = process.env, fetchImpl, transport } = {}) {
  const config = buildSeoPublicationEmailConfig(env);
  const base = {
    enabled: config.enabled,
    attempted: false,
    sent: false,
    reason: config.enabled ? null : "email_disabled",
    recipient: config.recipient || null
  };
  const publishedCount = safeInt(summary?.published_count, 0);

  if (!config.enabled) return base;
  if (summary?.dry_run) return { ...base, reason: "dry_run" };
  if (publishedCount <= 0) return { ...base, reason: "no_published_pages" };
  if (!config.recipient) return { ...base, reason: "email_recipient_missing", recipient: null };
  if (!config.from) return { ...base, reason: "email_from_missing" };
  if (!isCloudflareEmailConfigured(config.cloudflare) && !transport) {
    return { ...base, reason: "cloudflare_email_not_configured" };
  }

  try {
    await sendSeoPublicationEmail(summary, { storage, env, fetchImpl, transport, config });
    return { ...base, attempted: true, sent: true, reason: null };
  } catch (error) {
    return { ...base, attempted: true, sent: false, reason: safeEmailError(error, env) || "email_send_failed" };
  }
}

function warningCode(reason) {
  return cleanText(reason, "email_send_failed")
    .replace(/[^a-z0-9_:-]+/gi, "_")
    .slice(0, 100);
}

async function attachSeoPublicationEmailNotification({ summary, storage, env = process.env, fetchImpl, transport } = {}) {
  const publicationDiagnostics = buildPublicationDiagnostics(summary);
  const emailNotification = await maybeSendSeoPublicationEmail({ summary, storage, env, fetchImpl, transport });
  const nextSummary = {
    ...summary,
    publication_diagnostics: publicationDiagnostics,
    email_notification: emailNotification
  };
  if (
    emailNotification.enabled &&
    Number(summary?.published_count || 0) > 0 &&
    !emailNotification.sent &&
    emailNotification.reason !== "dry_run"
  ) {
    nextSummary.warnings = unique([
      ...(Array.isArray(summary.warnings) ? summary.warnings : []),
      `seo_publication_email_${warningCode(emailNotification.reason)}`
    ]);
  }
  return nextSummary;
}

module.exports = {
  attachSeoPublicationEmailNotification,
  buildPublicationDiagnostics,
  publicationDiagnosticCandidate,
  buildSeoPublicationEmailConfig,
  buildSeoPublicationEmailPayload,
  countSeoPublicationTotals,
  copyUrlPageUrl,
  maybeSendSeoPublicationEmail,
  publishedPagesFromSummary,
  renderSeoPublicationEmail,
  safeEmailError,
  SEARCH_CONSOLE_URL,
  sendSeoPublicationEmail
};
