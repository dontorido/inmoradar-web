const { hasSupabaseConfig, supabaseFetch } = require("./_utils");
const { googleTagManagerHead, googleTagManagerNoscript } = require("./_seo/analytics");
const { getSeedPublishedLanding } = require("./_seo/seedPublished");
const { escapeHtml, siteUrl } = require("./_seo/text");

function parseSlug(req) {
  const url = new URL(req.url, `https://${req.headers.host || "inmoradar.app"}`);
  const slug = url.searchParams.get("slug") || url.pathname.replace(/^\/+|\/+$/g, "");
  return String(slug || "").replace(/^\/+|\/+$/g, "");
}

async function fetchLanding(slug) {
  if (!hasSupabaseConfig()) return getSeedPublishedLanding(slug);
  const params = new URLSearchParams({
    select:
      "id,slug,title,meta_title,meta_description,h1,body_html,city,template_type,canonical_url,index_status,status,quality_score,source_data_json,updated_at,published_at,last_generated_at",
    slug: `eq.${slug}`,
    limit: "1"
  });
  const result = await supabaseFetch(`seo_landings?${params.toString()}`);
  const landing = Array.isArray(result) ? result[0] || null : null;
  return landing || getSeedPublishedLanding(slug);
}

function faqStructuredData(landing) {
  const faq = landing?.source_data_json?.faq;
  if (!Array.isArray(faq) || !faq.length) return "";
  const payload = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer
      }
    }))
  };
  return `<script type="application/ld+json">${JSON.stringify(payload).replace(/</g, "\\u003c")}</script>`;
}

function renderLandingHtml(landing) {
  const qualityScore = Number(landing.quality_score) || 0;
  const robots = landing.index_status === "index" && landing.status === "published" && qualityScore >= 75 ? "index,follow" : "noindex,follow";
  const canonical = landing.canonical_url || `${siteUrl()}/${landing.slug}/`;

  return `<!doctype html>
<html lang="es">
<head>
  ${googleTagManagerHead()}
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(landing.meta_title || landing.title)}</title>
  <meta name="description" content="${escapeHtml(landing.meta_description)}">
  <meta name="robots" content="${robots}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/assets/styles.css">
  <style>
    .seo-page { background: #f7f4ee; color: #171717; }
    .seo-shell { width: min(980px, calc(100% - 32px)); margin: 0 auto; padding: 32px 0 56px; }
    .seo-topbar { display: flex; justify-content: space-between; gap: 16px; align-items: center; padding: 18px 0; }
    .seo-topbar a { color: inherit; text-decoration: none; }
    .seo-landing { background: #fffdf8; border: 1px solid rgba(20, 20, 20, 0.12); border-radius: 8px; padding: clamp(22px, 4vw, 48px); }
    .seo-kicker { text-transform: uppercase; font-size: 0.76rem; letter-spacing: 0; font-weight: 700; color: #71573c; }
    .seo-landing h1 { font-size: clamp(2rem, 4vw, 3.4rem); line-height: 1.02; margin: 0 0 18px; letter-spacing: 0; }
    .seo-section { border-top: 1px solid rgba(20, 20, 20, 0.1); margin-top: 30px; padding-top: 26px; }
    .seo-section h2 { font-size: 1.45rem; line-height: 1.16; margin: 0 0 14px; letter-spacing: 0; }
    .seo-section p, .seo-section li { font-size: 1rem; line-height: 1.7; }
    .seo-data-table { width: 100%; border-collapse: collapse; margin: 18px 0; background: #ffffff; }
    .seo-data-table th, .seo-data-table td { text-align: left; vertical-align: top; border: 1px solid rgba(20, 20, 20, 0.12); padding: 12px; }
    .seo-data-table th { width: 180px; background: #f3eee4; }
    .seo-source-list { padding-left: 20px; }
    .seo-faq details { border-top: 1px solid rgba(20, 20, 20, 0.12); padding: 14px 0; }
    .seo-faq summary { cursor: pointer; font-weight: 700; }
    .seo-cta { background: #f1eadf; border: 1px solid rgba(20, 20, 20, 0.1); border-radius: 8px; padding: 22px; }
    @media (max-width: 640px) {
      .seo-topbar { align-items: flex-start; flex-direction: column; }
      .seo-data-table th, .seo-data-table td { display: block; width: 100%; }
    }
  </style>
  ${faqStructuredData(landing)}
</head>
<body class="seo-page">
  ${googleTagManagerNoscript()}
  <div class="seo-shell">
    <nav class="seo-topbar" aria-label="Principal">
      <a class="brand" href="/" aria-label="InmoRadar"><span class="brand-mark" aria-hidden="true"></span><span><strong>Inmo</strong><em>Radar</em></span></a>
      <a class="button secondary" href="/premium">Instalar InmoRadar</a>
    </nav>
    ${landing.body_html}
  </div>
</body>
</html>`;
}

async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end("Method not allowed");
    return;
  }

  try {
    const slug = parseSlug(req);
    const landing = await fetchLanding(slug);
    if (!landing) {
      res.statusCode = 404;
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.setHeader("cache-control", "no-store, max-age=0");
      res.end("<!doctype html><html lang=\"es\"><title>No encontrado</title><p>Landing no encontrada.</p></html>");
      return;
    }

    res.statusCode = 200;
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.setHeader("cache-control", landing.status === "published" ? "s-maxage=3600, stale-while-revalidate=86400" : "no-store, max-age=0");
    res.end(renderLandingHtml(landing));
  } catch (error) {
    console.error("[seo-page]", error);
    res.statusCode = 500;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end("SEO landing failed");
  }
}

module.exports = handler;
module.exports.renderLandingHtml = renderLandingHtml;
