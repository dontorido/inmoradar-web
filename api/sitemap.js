const { hasSupabaseConfig, supabaseFetch } = require("./_utils");
const { getSeedPublishedLanding } = require("./_seo/seedPublished");
const { escapeHtml, siteUrl } = require("./_seo/text");

const STATIC_PATHS = ["/", "/premium", "/privacidad", "/terminos"];

async function fetchPublishedLandings() {
  const seed = await getSeedPublishedLanding("precio-metro-cuadrado/logrono");
  if (!hasSupabaseConfig()) return seed ? [seed] : [];
  const params = new URLSearchParams({
    select: "slug,updated_at,published_at,last_generated_at",
    index_status: "eq.index",
    status: "eq.published",
    order: "published_at.desc",
    limit: "500"
  });
  const rows = await supabaseFetch(`seo_landings?${params.toString()}`);
  const landings = Array.isArray(rows) ? rows : [];
  if (seed && !landings.some((landing) => landing.slug === seed.slug)) {
    landings.unshift(seed);
  }
  return landings;
}

function urlEntry(loc, lastmod) {
  return `  <url>
    <loc>${escapeHtml(loc)}</loc>${lastmod ? `\n    <lastmod>${escapeHtml(lastmod.slice(0, 10))}</lastmod>` : ""}
  </url>`;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end("Method not allowed");
    return;
  }

  try {
    const baseUrl = siteUrl();
    const landings = await fetchPublishedLandings();
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
    res.end(xml);
  } catch (error) {
    console.error("[sitemap]", error);
    res.statusCode = 500;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end("sitemap_failed");
  }
};
