const { hasSupabaseConfig, supabaseFetch } = require("./_utils");
const { getSeedPublishedLanding } = require("./_seo/seedPublished");
const { escapeHtml, siteUrl } = require("./_seo/text");

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
  "/terminos",
  "/saber-si-piso-esta-caro/"
];

async function fetchPublishedLandings() {
  const seed = await getSeedPublishedLanding("precio-metro-cuadrado/logrono");
  if (!hasSupabaseConfig()) return seed ? [seed] : [];
  const params = new URLSearchParams({
    select: "slug,title,meta_description,city,template_type,quality_score,updated_at,published_at,last_generated_at",
    index_status: "eq.index",
    status: "eq.published",
    quality_score: "gte.75",
    order: "published_at.desc",
    limit: "500"
  });
  let landings = [];
  try {
    const rows = await supabaseFetch(`seo_landings?${params.toString()}`);
    landings = Array.isArray(rows) ? rows : [];
  } catch (error) {
    console.warn("[sitemap] Supabase landing lookup failed, using seed fallback", error.message);
  }
  if (seed && !landings.some((landing) => landing.slug === seed.slug)) {
    landings.unshift(seed);
  }
  return landings.sort((left, right) => publishedTime(right) - publishedTime(left));
}

function publishedTime(landing) {
  const value = landing.published_at || landing.updated_at || landing.last_generated_at;
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function urlEntry(loc, lastmod) {
  return `  <url>
    <loc>${escapeHtml(loc)}</loc>${lastmod ? `\n    <lastmod>${escapeHtml(lastmod.slice(0, 10))}</lastmod>` : ""}
  </url>`;
}

function newsMeta(landing) {
  if (landing.template_type === "price_city") return "Precio por m²";
  if (landing.template_type === "rent_city") return "Alquiler";
  if (landing.template_type === "expensive_listing_city") return "Analisis de precio";
  if (landing.template_type === "editorial_guide") return "Guias";
  if (landing.template_type === "parking_city") return "Aparcamiento";
  if (landing.template_type === "noise_city") return "Ruido";
  return "Guía inmobiliaria";
}

function newsDescription(landing) {
  if (landing.meta_description) return landing.meta_description;
  if (landing.template_type === "price_city") {
    return `Referencia de precio por metro cuadrado en ${landing.city || "España"} con fuente, fecha del dato y pautas para comparar anuncios.`;
  }
  if (landing.template_type === "rent_city") {
    return `Referencia de alquiler por metro cuadrado en ${landing.city || "España"} con fuente, fecha del dato y pautas para comparar anuncios.`;
  }
  if (landing.template_type === "expensive_listing_city") {
    return `Guía para saber si un piso está caro en ${landing.city || "España"} comparando precio por metro cuadrado y señales del anuncio.`;
  }
  if (landing.template_type === "editorial_guide") {
    return landing.meta_description || "Guía editorial de InmoRadar para analizar anuncios inmobiliarios antes de contactar.";
  }
  return "Guía publicada por InmoRadar para buscar vivienda con más contexto antes de contactar.";
}

function newsItem(landing) {
  const slug = String(landing.slug || "").replace(/^\/+|\/+$/g, "");
  return {
    slug,
    url: `/${slug}/`,
    title: landing.title || slug,
    description: newsDescription(landing),
    meta: newsMeta(landing),
    city: landing.city || null,
    template_type: landing.template_type || null,
    published_at: landing.published_at || landing.updated_at || landing.last_generated_at || null,
    updated_at: landing.updated_at || landing.last_generated_at || null
  };
}

module.exports = async function handler(req, res) {
  if (!["GET", "HEAD"].includes(req.method)) {
    res.statusCode = 405;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end("Method not allowed");
    return;
  }

  try {
    const url = new URL(req.url || "/", `https://${req.headers.host || "inmoradar.app"}`);
    const baseUrl = siteUrl();
    const landings = await fetchPublishedLandings();
    if (url.searchParams.get("format") === "news") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.setHeader("cache-control", "no-store, max-age=0");
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      res.end(JSON.stringify({ ok: true, latest_limit: 5, news: landings.slice(0, 60).map(newsItem) }));
      return;
    }

    const entries = [
      ...STATIC_PATHS.map((pathname) => urlEntry(`${baseUrl}${pathname === "/" ? "/" : pathname}`)),
      ...landings.map((landing) =>
        urlEntry(`${baseUrl}/${landing.slug.replace(/^\/+|\/+$/g, "")}/`, landing.published_at || landing.updated_at || landing.last_generated_at)
      )
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join("\n")}
</urlset>`;

    res.statusCode = 200;
    res.setHeader("content-type", "application/xml; charset=utf-8");
    res.setHeader("cache-control", "s-maxage=3600, stale-while-revalidate=86400");
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    res.end(xml);
  } catch (error) {
    console.error("[sitemap]", error);
    res.statusCode = 500;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end("sitemap_failed");
  }
};
