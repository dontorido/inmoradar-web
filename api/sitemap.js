const {
  buildNewsFeed,
  buildSitemapReport,
  buildSitemapXml,
  logSitemapReport,
  summarizeSitemapReport
} = require("./_seo/sitemap");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end("Method not allowed");
    return;
  }

  try {
    const url = new URL(req.url || "/", `https://${req.headers.host || "inmoradar.app"}`);
    const report = await buildSitemapReport();
    logSitemapReport(report, url.searchParams.get("format") === "news" ? "news-feed" : "public");

    if (url.searchParams.get("format") === "news") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.setHeader("cache-control", "no-store, max-age=0");
      res.end(
        JSON.stringify({
          ok: true,
          latest_limit: 5,
          sitemap: summarizeSitemapReport(report),
          news: buildNewsFeed(report)
        })
      );
      return;
    }

    res.statusCode = 200;
    res.setHeader("content-type", "application/xml; charset=utf-8");
    res.setHeader("cache-control", "s-maxage=300, stale-while-revalidate=3600");
    res.end(buildSitemapXml(report));
  } catch (error) {
    console.error("[SEO Sitemap]", error);
    res.statusCode = 500;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end("sitemap_failed");
  }
};
