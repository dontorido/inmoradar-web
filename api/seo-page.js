const { hasSupabaseConfig, supabaseFetch } = require("./_utils");
const { googleTagManagerHead, googleTagManagerNoscript } = require("./_seo/analytics");
const { getSeedPublishedLanding } = require("./_seo/seedPublished");
const { escapeHtml, siteUrl, stripHtml } = require("./_seo/text");

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
  try {
    const result = await supabaseFetch(`seo_landings?${params.toString()}`);
    const landing = Array.isArray(result) ? result[0] || null : null;
    return landing || getSeedPublishedLanding(slug);
  } catch (error) {
    console.warn("[seo-page] Supabase landing lookup failed, using seed fallback", error.message);
    return getSeedPublishedLanding(slug);
  }
}

function jsonLd(payload) {
  return `<script type="application/ld+json">${JSON.stringify(payload).replace(/</g, "\\u003c")}</script>`;
}

function structuredData(landing, canonical) {
  const faq = landing?.source_data_json?.faq || [];
  const sources = landing?.source_data_json?.sources || [];
  const published = landing.published_at || landing.last_generated_at || landing.updated_at || new Date().toISOString();
  const modified = landing.updated_at || landing.last_generated_at || published;
  const description = landing.meta_description || stripHtml(landing.body_html).slice(0, 155);
  const sourceOrganizations = [...new Set(sources.map((source) => source.source).filter(Boolean))].map((name) => ({
    "@type": "Organization",
    name
  }));

  const graph = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "InmoRadar", item: siteUrl() },
        { "@type": "ListItem", position: 2, name: "Precio m²", item: `${siteUrl()}/precio-metro-cuadrado/` },
        { "@type": "ListItem", position: 3, name: landing.province || landing.autonomous_community || "España" },
        { "@type": "ListItem", position: 4, name: landing.city, item: canonical }
      ]
    },
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: landing.title,
      description,
      url: canonical,
      datePublished: published,
      dateModified: modified,
      author: { "@type": "Organization", name: "InmoRadar" },
      publisher: { "@type": "Organization", name: "InmoRadar" }
    },
    {
      "@context": "https://schema.org",
      "@type": "AdministrativeArea",
      name: landing.city,
      containedInPlace: landing.province || landing.autonomous_community || "España"
    }
  ];

  if (faq.length) {
    graph.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer }
      }))
    });
  }

  if (sources.length) {
    graph.push({
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: `Referencias de precio por metro cuadrado en ${landing.city}`,
      description,
      temporalCoverage: sources.map((source) => source.period_label || source.period_date).filter(Boolean).join(" / "),
      sourceOrganization: sourceOrganizations,
      distribution: sources
        .filter((source) => source.source_url)
        .map((source) => ({
          "@type": "DataDownload",
          name: source.source,
          contentUrl: source.source_url
        }))
    });
  }

  return graph.map(jsonLd).join("\n  ");
}

function ogImageUrl(landing) {
  const sources = landing?.source_data_json?.sources || [];
  const sale = sources.find((source) => source.operation === "sale" && source.price_eur_m2);
  const value = sale
    ? `${Number(sale.price_eur_m2).toLocaleString("es-ES", { maximumFractionDigits: 0 })} €/m²`
    : "€/m²";
  const params = new URLSearchParams({
    city: landing.city || "InmoRadar",
    value
  });
  return `${siteUrl()}/api/og/price-city?${params.toString()}`;
}

function brandMarkIcon() {
  return `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5.2"/><circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none"/><path d="M12 12l3.2-3.6M12 4.5v1.6M12 17.9v1.6M4.5 12h1.6M17.9 12h1.6M8.9 8.9l1.1 1.1M15.1 15.1 14 14"/></svg>`;
}

function seoPageScript() {
  return `<script>
  (() => {
    const calculators = document.querySelectorAll("[data-sale-reference]");
    const format = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });
    calculators.forEach((calculator) => {
      const reference = Number(calculator.dataset.saleReference || 0);
      const price = calculator.querySelector("[data-seo-calc-price]");
      const area = calculator.querySelector("[data-seo-calc-area]");
      const value = calculator.querySelector("[data-seo-calc-value]");
      const status = calculator.querySelector("[data-seo-calc-status]");
      const update = () => {
        const total = Number(price.value);
        const meters = Number(area.value);
        if (!total || !meters || meters <= 0 || !reference) {
          value.textContent = "— €/m²";
          status.textContent = "Introduce precio y superficie.";
          status.dataset.tone = "neutral";
          return;
        }
        const priceM2 = total / meters;
        const diff = ((priceM2 - reference) / reference) * 100;
        value.textContent = format.format(priceM2) + " €/m²";
        const diffText = Math.round(diff).toLocaleString("es-ES", { maximumFractionDigits: 0 });
        if (diff <= -10) {
          status.textContent = "MUY BUEN PRECIO · " + diffText + "%";
          status.dataset.tone = "good";
        } else if (diff <= 10) {
          status.textContent = "EN MERCADO · " + diffText + "%";
          status.dataset.tone = "neutral";
        } else {
          status.textContent = "POR ENCIMA DE MERCADO · +" + diffText + "%";
          status.dataset.tone = "bad";
        }
      };
      price.addEventListener("input", update);
      area.addEventListener("input", update);
      update();
    });

    const links = Array.from(document.querySelectorAll(".seo-toc a[data-toc-target]"));
    const sections = links
      .map((link) => document.querySelector('[data-section-id="' + link.dataset.tocTarget + '"]'))
      .filter(Boolean);
    if (!links.length || !sections.length || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      links.forEach((link) => {
        link.classList.toggle("is-active", link.dataset.tocTarget === visible.target.dataset.sectionId);
      });
    }, { rootMargin: "-20% 0px -55% 0px", threshold: [0.15, 0.3, 0.6] });
    sections.forEach((section) => observer.observe(section));
  })();
  </script>`;
}

function renderLandingHtml(landing) {
  const qualityScore = Number(landing.quality_score) || 0;
  const robots = landing.index_status === "index" && landing.status === "published" && qualityScore >= 75 ? "index,follow" : "noindex,follow";
  const canonical = landing.canonical_url || `${siteUrl()}/${landing.slug}/`;
  const title = landing.meta_title || `${landing.title} · InmoRadar`;
  const description = landing.meta_description || stripHtml(landing.body_html).slice(0, 155);
  const imageUrl = ogImageUrl(landing);

  return `<!doctype html>
<html lang="es">
<head>
  ${googleTagManagerHead()}
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="${robots}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:image" content="${escapeHtml(imageUrl)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="${escapeHtml(imageUrl)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <link rel="icon" href="/assets/favicon-32.png?v=20260519b" type="image/png" sizes="32x32">
  <link rel="stylesheet" href="/assets/styles.css">
  <style>
    .seo-page {
      --display: "Cabinet Grotesk", "IBM Plex Sans", sans-serif;
      --body: "IBM Plex Sans", sans-serif;
      --mono: "JetBrains Mono", monospace;
      background: #171717;
      color: #D4D4D4;
      font-family: var(--body);
      letter-spacing: 0.005em;
    }
    .seo-page::selection,
    .seo-page ::selection { background: #1F1F1F; color: #FFFFFF; }
    .seo-page a {
      color: #FFFFFF;
      text-decoration: underline;
      text-decoration-color: rgba(255,69,0,.55);
      text-decoration-thickness: 1.5px;
      text-underline-offset: 4px;
      transition: color 120ms ease, text-decoration-color 120ms ease, border-color 120ms ease, background 120ms ease;
    }
    .seo-page a:hover { color: #FF4500; text-decoration-color: #FF4500; }
    .seo-shell { width: min(1100px, calc(100% - 40px)); margin: 0 auto; padding: 96px 0; }
    .seo-global-footer {
      border-top: 1px solid #1F1F1F;
      color: #737373;
      padding: 28px 0;
    }
    .seo-global-footer .footer-grid { width: min(1100px, calc(100% - 40px)); }
    .seo-breadcrumb {
      color: #6E6E6E;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      font-family: var(--mono);
      font-size: 10.5px;
      font-weight: 600;
      letter-spacing: .22em;
      margin-bottom: 24px;
      text-transform: uppercase;
    }
    .seo-breadcrumb a, .seo-breadcrumb strong { color: inherit; font-weight: 600; text-decoration: none; }
    .seo-breadcrumb span { color: #2A2A2A; }
    .seo-page-eyebrow,
    .seo-sidebar-kicker,
    .seo-disclaimer-kicker {
      color: #FF4500;
      font-family: var(--mono);
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: .22em;
      line-height: 1.4;
      margin: 0 0 12px;
      text-transform: uppercase;
    }
    .seo-sidebar-kicker-muted { color: #6E6E6E; }
    .seo-page-hero h1 {
      color: #FFFFFF;
      font-family: var(--display);
      font-size: clamp(48px, 8vw, 72px);
      font-weight: 900;
      letter-spacing: -0.03em;
      line-height: 1.05;
      margin: 0;
      max-width: 860px;
    }
    .seo-lead {
      color: #FFFFFF;
      font-size: 19px;
      line-height: 1.6;
      margin: 24px 0 0;
      max-width: 68ch;
    }
    .seo-meta-row {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 24px;
    }
    .seo-meta-row span {
      align-items: center;
      border: 1px solid #1F1F1F;
      color: #A3A3A3;
      display: inline-flex;
      font-family: var(--mono);
      font-size: 10px;
      font-weight: 600;
      gap: 8px;
      letter-spacing: .2em;
      min-height: 32px;
      padding: 6px 10px;
      text-transform: uppercase;
    }
    .seo-icon, .seo-external-icon {
      fill: none;
      height: 14px;
      stroke: currentColor;
      stroke-linecap: square;
      stroke-linejoin: miter;
      stroke-width: 1.8;
      width: 14px;
    }
    .seo-external-icon { display: inline-block; height: 11px; margin-left: 5px; vertical-align: baseline; width: 11px; }
    .seo-reading-grid {
      display: grid;
      gap: 48px;
      grid-template-columns: minmax(0, 8fr) minmax(300px, 4fr);
      margin-top: 56px;
    }
    .seo-content { grid-column: 1; grid-row: 1; min-width: 0; }
    .seo-sidebar {
      align-self: start;
      grid-column: 2;
      grid-row: 1;
      position: sticky;
      top: 112px;
    }
    .seo-toc {
      background: #171717;
      margin-bottom: 24px;
    }
    .seo-toc a {
      border-bottom: 1px solid #1F1F1F;
      color: #A3A3A3;
      display: block;
      font-size: 13px;
      line-height: 1.4;
      padding: 8px 0;
      text-decoration: none;
    }
    .seo-toc a.is-active {
      border-left: 2px solid #FF4500;
      color: #FFFFFF;
      padding-left: 10px;
    }
    .seo-data-card,
    .seo-inline-cta,
    .seo-final-cta {
      background: #1D1D1D;
      border: 1px solid #1F1F1F;
      border-radius: 0;
    }
    .seo-data-card { padding: 28px; }
    .seo-stat-grid {
      border: 1px solid #1F1F1F;
      display: grid;
      gap: 1px;
      grid-template-columns: 1fr;
      margin-top: 20px;
    }
    .seo-stat-cell {
      background: #1D1D1D;
      display: grid;
      gap: 6px;
      padding: 18px;
    }
    .seo-stat-label,
    .seo-stat-meta,
    .seo-card-note,
    .seo-calculator label span,
    .seo-calc-label {
      color: #6E6E6E;
      font-family: var(--mono);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: .2em;
      text-transform: uppercase;
    }
    .seo-stat-number {
      color: #FFFFFF;
      font-family: var(--display);
      font-size: 40px;
      font-weight: 900;
      letter-spacing: -0.03em;
      line-height: 1;
    }
    .seo-stat-unit {
      color: #A3A3A3;
      font-family: var(--mono);
      font-size: 11px;
    }
    .seo-calculator { display: grid; gap: 12px; margin-top: 24px; }
    .seo-calculator label { display: grid; gap: 7px; }
    .seo-calculator input {
      background: #1A1A1A;
      border: 1px solid #1F1F1F;
      border-radius: 0;
      color: #FFFFFF;
      font-family: var(--body);
      font-size: 14px;
      height: 40px;
      outline: none;
      padding: 0 12px;
    }
    .seo-calculator input:focus { border-color: #FF4500; }
    .seo-calc-result {
      background: #1A1A1A;
      border: 1px solid #1F1F1F;
      display: grid;
      gap: 6px;
      padding: 14px 16px;
    }
    .seo-calc-result strong {
      color: #FFFFFF;
      font-family: var(--display);
      font-size: 28px;
      font-weight: 900;
      letter-spacing: -0.03em;
      line-height: 1;
    }
    .seo-calc-result small { color: #FFFFFF; font-family: var(--mono); font-size: 11px; letter-spacing: .12em; text-transform: uppercase; }
    .seo-calc-result small[data-tone="good"] { color: #9BD64F; }
    .seo-calc-result small[data-tone="bad"] { color: #F08A8A; }
    .seo-card-note {
      line-height: 1.6;
      margin: 24px 0 0;
      text-transform: none;
    }
    .seo-section { margin-top: 80px; scroll-margin-top: 110px; }
    .seo-section:first-child { margin-top: 0; }
    .seo-section h2,
    .seo-final-cta h2 {
      color: #FFFFFF;
      font-family: var(--display);
      font-size: clamp(32px, 4vw, 48px);
      font-weight: 700;
      letter-spacing: -0.02em;
      line-height: 1.15;
      margin: 0 0 24px;
      max-width: 760px;
    }
    .seo-section h3 {
      color: #FFFFFF;
      font-family: var(--display);
      font-size: clamp(20px, 2vw, 24px);
      font-weight: 700;
      line-height: 1.25;
      margin: 0;
    }
    .seo-section p,
    .seo-section li {
      color: #D4D4D4;
      font-family: var(--body);
      font-size: 17px;
      line-height: 1.75;
      margin: 0 0 1.2em;
      max-width: 68ch;
    }
    .seo-section strong { color: #FFFFFF; font-weight: 600; }
    .seo-section code {
      background: #1A1A1A;
      border: 1px solid #262626;
      color: #FF4500;
      font-family: var(--mono);
      font-size: .92em;
      padding: 2px 6px;
    }
    .seo-section ul { display: grid; gap: 12px; list-style: none; margin: 0 0 1.2em; padding: 0; }
    .seo-section li { display: grid; grid-template-columns: 6px minmax(0, 1fr); gap: 12px; margin: 0; }
    .seo-section li::before {
      background: #FF4500;
      content: "";
      height: 6px;
      margin-top: 11px;
      width: 6px;
    }
    .seo-data-grid {
      border: 1px solid #1F1F1F;
      display: grid;
      gap: 1px;
      grid-template-columns: minmax(140px, .6fr) minmax(0, 1fr);
      margin: 24px 0;
      max-width: 760px;
    }
    .seo-data-label,
    .seo-data-value {
      background: #1D1D1D;
      padding: 14px 18px;
    }
    .seo-data-label {
      color: #6E6E6E;
      font-family: var(--mono);
      font-size: 10.5px;
      font-weight: 600;
      letter-spacing: .22em;
      text-transform: uppercase;
    }
    .seo-data-value {
      color: #FFFFFF;
      font-size: 15px;
      line-height: 1.5;
    }
    .seo-source-list { margin-top: 18px; }
    .seo-source-list li {
      display: block;
      padding-left: 18px;
      position: relative;
    }
    .seo-source-list li::before {
      left: 0;
      margin-top: 10px;
      position: absolute;
      top: 0;
    }
    .seo-formula {
      background: #1D1D1D;
      border-left: 3px solid #FF4500;
      margin: 32px 0;
      max-width: 68ch;
      padding: 20px 24px;
    }
    .seo-formula p {
      color: #FF4500;
      font-family: var(--mono);
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: .22em;
      margin: 0;
      text-transform: uppercase;
    }
    .seo-formula code {
      background: transparent;
      border: 0;
      color: #FFFFFF;
      display: block;
      font-family: var(--mono);
      font-size: 18px;
      margin-top: 8px;
      padding: 0;
    }
    .seo-formula span {
      color: #A3A3A3;
      display: block;
      font-size: 14px;
      line-height: 1.6;
      margin-top: 12px;
      max-width: 60ch;
    }
    .seo-inline-cta {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      justify-content: space-between;
      margin: 48px 0;
      max-width: 760px;
      padding: 24px 28px;
    }
    .seo-inline-cta .seo-sidebar-kicker { margin-bottom: 8px; }
    .seo-button {
      align-items: center;
      border-radius: 0;
      display: inline-flex;
      font-family: var(--mono);
      font-size: 11px;
      font-weight: 700;
      gap: 8px;
      justify-content: center;
      letter-spacing: .14em;
      min-height: 44px;
      padding: 0 18px;
      text-decoration: none;
      text-transform: uppercase;
    }
    .seo-button-secondary { border: 1px solid #262626; color: #FFFFFF; }
    .seo-button-secondary:hover { border-color: #FF4500; color: #FF4500; }
    .seo-button-primary {
      background: #FF4500;
      border: 1px solid #FF4500;
      box-shadow: 0 0 24px rgba(204,255,0,.18);
      color: #0A0A0A;
    }
    .seo-button-primary:hover { background: #FFFFFF; border-color: #FFFFFF; color: #0A0A0A; }
    .seo-link-bento {
      border: 1px solid #1F1F1F;
      display: grid;
      gap: 1px;
      max-width: 760px;
    }
    .seo-link-bento a {
      align-items: center;
      background: #171717;
      display: grid;
      gap: 14px;
      grid-template-columns: 16px minmax(0, 1fr) auto;
      padding: 16px 18px;
      text-decoration: none;
    }
    .seo-link-bento a:hover { background: #1D1D1D; }
    .seo-link-bento .seo-icon { color: #FF4500; }
    .seo-link-bento a:hover .seo-icon { color: #FFFFFF; }
    .seo-link-bento span { color: #FFFFFF; font-size: 15px; }
    .seo-link-bento small {
      color: #6E6E6E;
      font-family: var(--mono);
      font-size: 10px;
      letter-spacing: .18em;
      overflow: hidden;
      text-overflow: ellipsis;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .seo-faq details {
      border-top: 1px solid #1F1F1F;
      max-width: 760px;
      padding: 18px 0;
    }
    .seo-faq details:last-child { border-bottom: 1px solid #1F1F1F; }
    .seo-faq summary {
      color: #FFFFFF;
      cursor: pointer;
      font-family: var(--display);
      font-size: 18px;
      font-weight: 700;
      line-height: 1.35;
    }
    .seo-faq summary:hover { color: #FF4500; }
    .seo-faq p { color: #D4D4D4; font-size: 16px; margin-top: 12px; }
    .seo-final-cta {
      margin-top: 96px;
      padding: 48px 32px;
      text-align: center;
    }
    .seo-final-cta h2 { margin-left: auto; margin-right: auto; }
    .seo-final-cta p:not(.seo-sidebar-kicker) {
      color: #A3A3A3;
      font-size: 16px;
      line-height: 1.6;
      margin: 12px auto 0;
      max-width: 55ch;
    }
    .seo-final-actions { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin-top: 26px; }
    .seo-disclaimer {
      border-top: 1px solid #1F1F1F;
      margin-top: 64px;
      max-width: 68ch;
      padding: 24px 0;
    }
    .seo-disclaimer p:not(.seo-disclaimer-kicker) {
      color: #A3A3A3;
      font-size: 13px;
      line-height: 1.6;
      margin: 12px 0 0;
    }
    .seo-disclaimer small {
      color: #6E6E6E;
      display: block;
      font-family: var(--mono);
      font-size: 9.5px;
      letter-spacing: .22em;
      margin-top: 12px;
      text-transform: uppercase;
    }
    @media (max-width: 900px) {
      .seo-shell { padding: 56px 0; width: min(100% - 32px, 720px); }
      .seo-reading-grid { display: flex; flex-direction: column; gap: 40px; margin-top: 36px; }
      .seo-sidebar { order: 1; position: static; }
      .seo-content { order: 2; }
      .seo-toc { display: none; }
      .seo-section { margin-top: 64px; }
      .seo-section p, .seo-section li { font-size: 16px; }
      .seo-data-grid { grid-template-columns: 1fr; }
      .seo-link-bento a { align-items: start; grid-template-columns: 16px minmax(0, 1fr); }
      .seo-link-bento small { grid-column: 2; white-space: normal; }
    }
    @media (prefers-reduced-motion: reduce) {
      * { scroll-behavior: auto !important; transition: none !important; }
    }
  </style>
  ${structuredData(landing, canonical)}
</head>
<body class="seo-page">
  ${googleTagManagerNoscript()}
  <header class="site-header">
    <nav class="nav" aria-label="Principal">
      <a class="brand" href="/" aria-label="InmoRadar">
        <span class="brand-mark" aria-hidden="true">${brandMarkIcon()}</span>
        <span><strong>Inmo</strong><em>Radar</em></span>
      </a>
      <div class="nav-links">
        <a href="/#analisis">Qué analiza</a>
        <a href="/#api">APIs</a>
        <a href="/#noticias">Noticias</a>
        <a href="/#faq">FAQ</a>
      </div>
      <div class="nav-actions">
        <a class="button secondary" href="/premium">Premium</a>
      </div>
    </nav>
  </header>
  <main class="seo-shell">
    ${landing.body_html}
  </main>
  <footer class="seo-global-footer">
    <div class="container footer-grid">
      <a class="brand" href="/"><span class="brand-mark" aria-hidden="true">${brandMarkIcon()}</span><span><strong>Inmo</strong><em>Radar</em></span></a>
      <div class="footer-links">
        <a href="/privacidad">Privacidad</a>
        <a href="/terminos">Términos</a>
        <a href="/#noticias">Noticias</a>
        <a href="mailto:hola@inmoradar.app">Contacto</a>
      </div>
      <span>© InmoRadar</span>
    </div>
  </footer>
  ${seoPageScript()}
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
