const { hasSupabaseConfig, supabaseFetch } = require("../_utils");
const { getSeedPublishedLanding } = require("./seedPublished");
const { escapeHtml, siteUrl, stripHtml } = require("./text");

const STATIC_PATHS = [
  "/",
  "/que-analiza",
  "/datos",
  "/metodologia",
  "/noticias",
  "/premium",
  "/clientes",
  "/faq",
  "/contacto",
  "/privacidad",
  "/terminos"
];

const PUBLIC_SEO_PREFIXES = new Set([
  "precio-metro-cuadrado",
  "precio-alquiler",
  "saber-si-piso-esta-caro",
  "guias"
]);

const ROBOTS_BLOCKED_PREFIXES = [
  "/admin",
  "/api/admin/",
  "/api/cron/"
];

function normalizeSlug(value) {
  return String(value || "").trim().replace(/^\/+|\/+$/g, "");
}

function normalizePath(value) {
  const slug = normalizeSlug(value);
  return slug ? `/${slug}/` : "/";
}

function normalizeUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function isoDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function sitemapLastmod(landing = {}) {
  return isoDate(landing.updated_at || landing.last_generated_at || landing.published_at || landing.created_at);
}

function landingWordCount(landing = {}) {
  const stored = Number(landing.word_count || 0);
  if (Number.isFinite(stored) && stored > 0) return stored;
  return stripHtml(landing.body_html || "").split(/\s+/).filter(Boolean).length;
}

function publicSeoRouteAvailable(slug) {
  const parts = normalizeSlug(slug).split("/");
  return parts.length === 2 && PUBLIC_SEO_PREFIXES.has(parts[0]) && Boolean(parts[1]);
}

function isBlockedByRobots(pathname) {
  const path = normalizePath(pathname);
  return ROBOTS_BLOCKED_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix));
}

function canonicalForSlugWithBase(baseUrl, slug) {
  return `${normalizeUrl(baseUrl)}/${normalizeSlug(slug)}/`;
}

function canonicalMatches(landing, loc, baseUrl) {
  const expected = canonicalForSlugWithBase(baseUrl, landing.slug);
  const canonical = landing.canonical_url || expected;
  return normalizeUrl(canonical) === normalizeUrl(expected) && normalizeUrl(loc) === normalizeUrl(expected);
}

function contentIsComplete(landing) {
  return Boolean(
    landing.title &&
      landing.meta_title &&
      landing.meta_description &&
      landing.h1 &&
      landing.body_html &&
      landingWordCount(landing) >= 150
  );
}

function exclusion(slug, reason, landing = {}) {
  return {
    slug: normalizeSlug(slug),
    url: normalizePath(slug),
    reason,
    status: landing.status || null,
    index_status: landing.index_status || null,
    quality_score: landing.quality_score ?? null,
    updated_at: landing.updated_at || landing.last_generated_at || landing.published_at || null
  };
}

function validateLandingForSitemap(landing, context) {
  const slug = normalizeSlug(landing.slug);
  const pathname = normalizePath(slug);
  const loc = `${context.baseUrl}${pathname}`;
  if (!slug) return { ok: false, reason: "slug_required", loc };
  if (context.seenSlugs.has(slug)) return { ok: false, reason: "duplicate_slug", loc };
  if (context.seenUrls.has(loc)) return { ok: false, reason: "duplicate_url", loc };
  if (String(landing.status || "").toLowerCase() !== "published") return { ok: false, reason: "not_published", loc };
  if (String(landing.index_status || "").toLowerCase() !== "index") return { ok: false, reason: "noindex", loc };
  if ((Number(landing.quality_score) || 0) < 75) return { ok: false, reason: "quality_below_75", loc };
  if (!contentIsComplete(landing)) return { ok: false, reason: "content_incomplete", loc };
  if (!publicSeoRouteAvailable(slug)) return { ok: false, reason: "route_not_public", loc };
  if (isBlockedByRobots(pathname)) return { ok: false, reason: "blocked_by_robots", loc };
  if (!canonicalMatches(landing, loc, context.baseUrl)) return { ok: false, reason: "canonical_mismatch", loc };
  if (!sitemapLastmod(landing)) return { ok: false, reason: "invalid_lastmod", loc };
  return { ok: true, loc };
}

function publishedTime(landing) {
  const value = landing.published_at || landing.updated_at || landing.last_generated_at || landing.created_at;
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

async function fetchPublishedLandings() {
  const seed = await getSeedPublishedLanding("precio-metro-cuadrado/logrono");
  if (!hasSupabaseConfig()) return seed ? [seed] : [];
  const params = new URLSearchParams({
    select:
      "id,slug,title,meta_title,meta_description,h1,body_html,city,template_type,canonical_url,index_status,status,quality_score,word_count,updated_at,published_at,last_generated_at,created_at",
    order: "published_at.desc",
    limit: "5000"
  });
  let landings = [];
  try {
    const rows = await supabaseFetch(`seo_landings?${params.toString()}`);
    landings = Array.isArray(rows) ? rows : [];
  } catch (error) {
    console.warn("[SEO Sitemap] Supabase landing lookup failed, using seed fallback", error.message);
  }
  if (seed && !landings.some((landing) => normalizeSlug(landing.slug) === seed.slug)) {
    landings.unshift(seed);
  }
  return landings.sort((left, right) => publishedTime(right) - publishedTime(left));
}

function staticEntries(baseUrl) {
  return STATIC_PATHS.map((pathname) => ({
    type: "static",
    loc: `${baseUrl}${pathname === "/" ? "/" : pathname}`,
    pathname: pathname === "/" ? "/" : `${pathname}/`.replace(/\/+$/, ""),
    lastmod: null
  }));
}

async function buildSitemapReport(options = {}) {
  const baseUrl = normalizeUrl(options.baseUrl || siteUrl());
  const generatedAt = options.now || new Date().toISOString();
  const landings = Array.isArray(options.landings) ? options.landings : await fetchPublishedLandings();
  const entries = staticEntries(baseUrl);
  const includedSeo = [];
  const excluded = [];
  const errors = [];
  const context = { baseUrl, seenSlugs: new Set(), seenUrls: new Set(entries.map((entry) => entry.loc)) };

  for (const landing of landings) {
    try {
      const validation = validateLandingForSitemap(landing, context);
      if (!validation.ok) {
        excluded.push(exclusion(landing.slug, validation.reason, landing));
        continue;
      }
      const slug = normalizeSlug(landing.slug);
      const pathname = normalizePath(slug);
      const entry = {
        type: "seo",
        loc: validation.loc,
        pathname,
        slug,
        title: landing.title || slug,
        template_type: landing.template_type || null,
        city: landing.city || null,
        lastmod: sitemapLastmod(landing),
        landing
      };
      context.seenSlugs.add(slug);
      context.seenUrls.add(validation.loc);
      entries.push(entry);
      includedSeo.push(entry);
    } catch (error) {
      const item = exclusion(landing?.slug, "validation_error", landing || {});
      item.message = String(error.message || error).slice(0, 300);
      excluded.push(item);
      errors.push(item);
    }
  }

  const lastModifiedAt = entries
    .map((entry) => entry.lastmod)
    .filter(Boolean)
    .sort()
    .at(-1) || null;

  return {
    ok: errors.length === 0,
    generated_at: generatedAt,
    base_url: baseUrl,
    sitemap_url: `${baseUrl}/sitemap.xml`,
    dynamic: true,
    write_mode: "dynamic-serverless",
    static_count: STATIC_PATHS.length,
    included_count: entries.length,
    excluded_count: excluded.length,
    errors_count: errors.length,
    last_modified_at: lastModifiedAt,
    seo: {
      total: landings.length,
      included: includedSeo.length,
      excluded: excluded.length
    },
    entries,
    included_seo: includedSeo,
    excluded,
    errors
  };
}

function urlEntry(entry) {
  return `  <url>
    <loc>${escapeHtml(entry.loc)}</loc>${entry.lastmod ? `\n    <lastmod>${escapeHtml(entry.lastmod)}</lastmod>` : ""}
  </url>`;
}

function buildSitemapXml(report) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${report.entries.map(urlEntry).join("\n")}
</urlset>`;
}

function newsMeta(landing) {
  if (landing.template_type === "price_city") return "Precio por m2";
  if (landing.template_type === "rent_city") return "Alquiler";
  if (landing.template_type === "expensive_listing_city") return "Analisis de precio";
  if (landing.template_type === "editorial_guide") return "Guias";
  if (landing.template_type === "parking_city") return "Aparcamiento";
  if (landing.template_type === "noise_city") return "Ruido";
  return "Guia inmobiliaria";
}

function newsDescription(landing) {
  if (landing.meta_description) return landing.meta_description;
  if (landing.template_type === "price_city") {
    return `Referencia de precio por metro cuadrado en ${landing.city || "Espana"} con fuente, fecha del dato y pautas para comparar anuncios.`;
  }
  if (landing.template_type === "rent_city") {
    return `Referencia de alquiler por metro cuadrado en ${landing.city || "Espana"} con fuente, fecha del dato y pautas para comparar anuncios.`;
  }
  if (landing.template_type === "expensive_listing_city") {
    return `Guia para saber si un piso esta caro en ${landing.city || "Espana"} comparando precio por metro cuadrado y senales del anuncio.`;
  }
  if (landing.template_type === "editorial_guide") {
    return landing.meta_description || "Guia editorial de InmoRadar para analizar anuncios inmobiliarios antes de contactar.";
  }
  return "Guia publicada por InmoRadar para buscar vivienda con mas contexto antes de contactar.";
}

function newsItem(entry) {
  const landing = entry.landing || {};
  return {
    slug: entry.slug,
    url: entry.pathname,
    title: landing.title || entry.slug,
    description: newsDescription(landing),
    meta: newsMeta(landing),
    city: landing.city || null,
    template_type: landing.template_type || null,
    published_at: landing.published_at || landing.updated_at || landing.last_generated_at || null,
    updated_at: landing.updated_at || landing.last_generated_at || null
  };
}

function buildNewsFeed(report) {
  return report.included_seo.slice(0, 60).map(newsItem);
}

function summarizeSitemapReport(report) {
  return {
    ok: report.ok,
    generated_at: report.generated_at,
    sitemap_url: report.sitemap_url,
    dynamic: report.dynamic,
    write_mode: report.write_mode,
    included_count: report.included_count,
    excluded_count: report.excluded_count,
    errors_count: report.errors_count,
    last_modified_at: report.last_modified_at,
    seo: report.seo
  };
}

function logSitemapReport(report, context = "") {
  const suffix = context ? ` (${context})` : "";
  console.log(
    `[SEO Sitemap] Regenerated sitemap${suffix}: ${report.included_count} URLs included, ${report.excluded_count} excluded, ${report.errors_count} errors.`
  );
  if (report.excluded.length) {
    console.warn(
      `[SEO Sitemap] Excluded URLs: ${report.excluded
        .slice(0, 10)
        .map((item) => `${item.url || item.slug}:${item.reason}`)
        .join(", ")}`
    );
  }
}

async function refreshSeoSitemap(context = "seo-change") {
  const report = await buildSitemapReport();
  logSitemapReport(report, context);
  return summarizeSitemapReport(report);
}

module.exports = {
  STATIC_PATHS,
  buildNewsFeed,
  buildSitemapReport,
  buildSitemapXml,
  logSitemapReport,
  refreshSeoSitemap,
  summarizeSitemapReport,
  validateLandingForSitemap
};
