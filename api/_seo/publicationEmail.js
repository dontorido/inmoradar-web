const { isEmail, normalizeEmail, sanitizeErrorMessage } = require("../_utils");
const {
  buildCloudflareEmailPayload,
  cloudflareEmailConfig,
  isCloudflareEmailConfigured,
  sendCloudflareEmail
} = require("../_email/cloudflareEmail");

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
  return ["draft", "needs_review", "ready_to_publish", "skipped", "would_skip"].includes(status);
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
  const reasonCounts = aggregateReasons(diagnosticResults);
  const publishedCount = safeInt(summary.published_count, 0);
  return {
    min_score: safeInt(summary.config?.min_score, null),
    published_count: publishedCount,
    draft_count: safeInt(summary.draft_count, 0),
    skipped_count: safeInt(summary.skipped_count, 0),
    failed_count: safeInt(summary.failed_count, 0),
    reason_counts: reasonCounts,
    low_score_results: diagnosticResults.slice(0, 10).map((item) => ({
      target_path: targetPathForResult(item),
      status: item.status || null,
      reason: item.reason || null,
      score: scoreForResult(item),
      quality_penalties: arrayOrEmpty(item.quality_penalties || item.penalties),
      quality_warnings: arrayOrEmpty(item.quality_warnings || item.warnings),
      quality_reasons: arrayOrEmpty(item.quality_reasons || item.rejection_reasons),
      technical_indexability_status: item.technical_indexability_status || null,
      editorial_quality_status: item.editorial_quality_status || null,
      score_components: {
        data_quality_score: item.data_quality_score ?? null,
        uniqueness_score: item.uniqueness_score ?? null,
        seo_opportunity_score: item.seo_opportunity_score ?? null,
        conversion_potential_score: item.conversion_potential_score ?? null
      }
    })),
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

function renderSeoPublicationEmail({ summary, pages, totals, config }) {
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
