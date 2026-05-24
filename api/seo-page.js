const { hasSupabaseConfig, supabaseFetch } = require("./_utils");
const { googleTagManagerHead, googleTagManagerNoscript } = require("./_seo/analytics");
const { getSeedPublishedLanding } = require("./_seo/seedPublished");
const { buildPrecioMetroCuadradoCiudad } = require("./_seo/priceCity");
const { SEO_INDEX_MIN_SCORE } = require("./_seo/quality");
const { buildExpensiveListingCityLanding, buildRentCityLanding } = require("../lib/seo/cityGuideTemplates");
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

function seoSocialLinks() {
  return `
      <nav class="footer-social" aria-label="Redes sociales InmoRadar" data-footer-social>
        <a href="https://www.instagram.com/inmoradares/" target="_blank" rel="noopener noreferrer" aria-label="Instagram de InmoRadar">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="3" width="18" height="18" rx="5"></rect><circle cx="12" cy="12" r="4"></circle><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none"></circle></svg>
          <span>Instagram</span>
        </a>
        <a href="https://www.tiktok.com/@inmoradar" target="_blank" rel="noopener noreferrer" aria-label="TikTok de InmoRadar">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14 3v10.2a4.8 4.8 0 1 1-4.8-4.8c.5 0 1 .08 1.4.22v3.05a2 2 0 1 0 1.36 1.9V3h2.04c.42 2.45 1.92 4.16 4.5 4.48v3.08A7.2 7.2 0 0 1 14 8.92"></path></svg>
          <span>TikTok</span>
        </a>
      </nav>`;
}

function siteHeaderHtml() {
  return `<header class="site-header" data-site-header>
    <nav class="nav container" aria-label="Principal">
      <a class="brand" href="/" aria-label="InmoRadar">
        <span class="brand-mark" aria-hidden="true">${brandMarkIcon()}</span>
        <span><strong>Inmo</strong><em>Radar</em></span>
      </a>
      <div class="nav-links" aria-label="Secciones">
        <a href="/que-analiza">Qué analiza</a>
        <a href="/datos">APIs</a>
        <a href="/noticias">Noticias</a>
        <a href="/faq">FAQ</a>
        <a href="/contacto">Contacto</a>
      </div>
      <div class="nav-actions">
        <div class="language-switch" aria-label="Idioma">
          <button type="button" data-lang="es" aria-pressed="true"><span class="flag flag-es" aria-hidden="true"></span><span>ES</span></button>
          <button type="button" data-lang="en" aria-pressed="false"><span class="flag flag-en" aria-hidden="true"></span><span>EN</span></button>
        </div>
        <a class="client-link" href="/clientes" aria-label="Área de clientes" title="Área de clientes"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 21a8 8 0 0 0-16 0"></path><circle cx="12" cy="7" r="4"></circle></svg></a>
        <button class="button" type="button" data-install-button data-install-source="seo_nav">Empezar gratis</button>
      </div>
      <button class="mobile-toggle" type="button" data-mobile-toggle aria-label="Abrir menú" aria-expanded="false">
        <span aria-hidden="true">${brandMarkIcon()}</span>
      </button>
    </nav>
    <div class="mobile-panel" data-mobile-panel>
      <a href="/que-analiza">Qué analiza</a>
      <a href="/datos">APIs</a>
      <a href="/noticias">Noticias</a>
      <a href="/clientes">Clientes</a>
      <a href="/faq">FAQ</a>
      <a href="/contacto">Contacto</a>
    </div>
  </header>`;
}

function siteFooterHtml() {
  return `<footer class="site-footer">
    <div class="container">
      <div class="footer-top">
        <div>
          <a class="brand" href="/"><span class="brand-mark" aria-hidden="true">${brandMarkIcon()}</span><span><strong>Inmo</strong><em>Radar</em></span></a>
          <p class="footer-tagline">Analiza anuncios antes de contactar.</p>
          <button class="button" type="button" data-install-button data-install-source="seo_footer">Empezar gratis</button>
        </div>
        <div class="footer-col"><h4>Producto</h4><a href="/que-analiza">Qué analiza</a><a href="/datos">APIs</a></div>
        <div class="footer-col"><h4>Contenido</h4><a href="/noticias">Noticias</a><a href="/faq">FAQ</a></div>
        <div class="footer-col"><h4>Compañía</h4><a href="/contacto">Contacto</a><a href="/privacidad">Privacidad</a><a href="/terminos">Términos</a></div>
        <span class="footer-status">Online</span>
      </div>
      <div class="footer-word">INMORADAR</div>
      <div class="footer-social-row">
        ${seoSocialLinks()}
      </div>
      <div class="footer-meta"><span>&copy; <span data-year></span> InmoRadar</span><span>v1.0 · Navegadores modernos</span></div>
    </div>
  </footer>`;
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

function sourceRecordsFromLanding(landing) {
  const sources = Array.isArray(landing?.source_data_json?.sources) ? landing.source_data_json.sources : [];
  return sources
    .map((source) => ({
      source: source.source,
      operation: source.operation,
      source_url: source.source_url,
      period_label: source.period_label,
      period_date: source.period_date,
      geo_level: source.geo_level,
      price_eur_m2: Number.parseFloat(String(source.price_eur_m2 || "").replace(",", "."))
    }))
    .filter((source) => source.operation && source.source && source.source_url && Number.isFinite(source.price_eur_m2));
}

function citySourceDataFromLanding(landing) {
  const records = sourceRecordsFromLanding(landing);
  return {
    sale: records.find((record) => record.operation === "sale") || null,
    rent: records.find((record) => record.operation === "rent") || null,
    records,
    sources: records,
    city: landing.city || ""
  };
}

function buildDynamicPriceCityBodyHtml(landing) {
  if (landing?.template_type !== "price_city") return null;
  const sourceData = citySourceDataFromLanding(landing);
  const records = sourceData.records || [];
  if (!records.length || !landing.city) return null;

  if (!sourceData.sale && !sourceData.rent) return null;

  try {
    return buildPrecioMetroCuadradoCiudad({
      city: landing.city,
      province: landing.province || "",
      autonomousCommunity: landing.autonomous_community || "",
      slug: String(landing.slug || "").replace(/^precio-metro-cuadrado\//, ""),
      sourceData,
      publishedAt: landing.published_at || landing.last_generated_at || landing.updated_at || new Date(),
      updatedAt: landing.updated_at || landing.last_generated_at || landing.published_at || new Date()
    });
  } catch (error) {
    console.warn("[seo-page] Dynamic price city body render failed", error.message);
    return null;
  }
}

function buildDynamicCityGuideLanding(landing) {
  if (!["rent_city", "expensive_listing_city"].includes(landing?.template_type)) return null;
  if (!landing.city) return null;
  const sourceData = citySourceDataFromLanding(landing);
  if (!sourceData.records.length || (!sourceData.sale && !sourceData.rent)) return null;
  const opportunity = {
    city: landing.city,
    province: landing.province || "",
    autonomous_community: landing.autonomous_community || "",
    template_type: landing.template_type
  };
  try {
    return landing.template_type === "rent_city"
      ? buildRentCityLanding(opportunity, sourceData)
      : buildExpensiveListingCityLanding(opportunity, sourceData);
  } catch (error) {
    console.warn("[seo-page] Dynamic city guide render failed", error.message);
    return null;
  }
}
function normalizeLandingBodyHtml(bodyHtml = "") {
  const legacy = {
    upperChromeFree: ["INSTALAR", "GRATIS", "EN", "CHROME"].join(" "),
    titleChromeFree: ["Instalar", "gratis", "en", "Chrome"].join(" "),
    upperChrome: ["INSTALAR", "EN", "CHROME"].join(" "),
    titleChrome: ["Instalar", "en", "Chrome"].join(" ")
  };
  return String(bodyHtml || "")
    .replace(new RegExp(legacy.upperChromeFree, "g"), "EMPEZAR GRATIS")
    .replace(new RegExp(legacy.titleChromeFree, "g"), "Empezar gratis")
    .replace(new RegExp(legacy.upperChrome, "g"), "EMPEZAR GRATIS")
    .replace(new RegExp(legacy.titleChrome, "g"), "Empezar gratis")
    .replace(/INSTALAR INMORADAR PREMIUM/g, "EMPEZAR GRATIS")
    .replace(/Instalar InmoRadar Premium/g, "Empezar gratis")
    .replace(/INSTALAR INMORADAR/g, "EMPEZAR GRATIS")
    .replace(/Instalar InmoRadar/g, "Empezar gratis");
}
function renderLandingHtml(landing) {
  const qualityScore = Number(landing.quality_score) || 0;
  const qualityGate = landing?.source_data_json?.quality_gate || null;
  const gateAllowsIndex = !qualityGate || qualityGate.can_index !== false;
  const robots = landing.index_status === "index" && landing.status === "published" && qualityScore >= SEO_INDEX_MIN_SCORE && gateAllowsIndex ? "index,follow" : "noindex,follow";
  const canonical = landing.canonical_url || `${siteUrl()}/${landing.slug}/`;
  const dynamicLanding = buildDynamicCityGuideLanding(landing);
  const renderedLanding = dynamicLanding
    ? {
        ...landing,
        title: dynamicLanding.title || landing.title,
        meta_title: dynamicLanding.meta_title || landing.meta_title,
        meta_description: dynamicLanding.meta_description || landing.meta_description,
        h1: dynamicLanding.h1 || landing.h1,
        source_data_json: {
          ...(landing.source_data_json || {}),
          faq: dynamicLanding.faq || landing.source_data_json?.faq || []
        }
      }
    : landing;
  const title = renderedLanding.meta_title || `${renderedLanding.title} · InmoRadar`;
  const dynamicBodyHtml = buildDynamicPriceCityBodyHtml(landing);
  const bodyHtml = normalizeLandingBodyHtml(dynamicBodyHtml || dynamicLanding?.body_html || landing.body_html);
  const description = renderedLanding.meta_description || stripHtml(bodyHtml).slice(0, 155);
  const imageUrl = ogImageUrl(renderedLanding);

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
      --display: "Cabinet Grotesk", Outfit, Inter, sans-serif;
      --body: Satoshi, Inter, ui-sans-serif, system-ui, sans-serif;
      --mono: "JetBrains Mono", ui-monospace, monospace;
      --seo-bg: #FAFAFA;
      --seo-surface: #FFFFFF;
      --seo-ink: #09090B;
      --seo-muted: #52525B;
      --seo-line: #E4E4E7;
      --seo-accent: #FF4500;
      --seo-accent-soft: #FFF1EB;
      background: var(--seo-bg);
      color: var(--seo-muted);
      font-family: var(--body);
      letter-spacing: 0;
      text-rendering: geometricPrecision;
      overflow-x: hidden;
    }
    .seo-page::selection,
    .seo-page ::selection { background: var(--seo-accent); color: #FFFFFF; }
    .seo-shell a:not(.seo-button) {
      color: #09090B;
      text-decoration: underline;
      text-decoration-color: rgba(255,69,0,.42);
      text-decoration-thickness: 1.5px;
      text-underline-offset: 4px;
      transition: color 140ms ease, text-decoration-color 140ms ease, border-color 140ms ease, background 140ms ease, transform 140ms ease;
    }
    .seo-shell a:not(.seo-button):hover { color: #FF4500; text-decoration-color: #FF4500; }
    .seo-page .site-header a { text-decoration: none; }
    .seo-shell { width: min(1180px, calc(100% - 48px)); margin: 0 auto; padding: 88px 0 104px; }
    .seo-breadcrumb {
      align-items: center;
      color: #71717A;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      font-family: var(--mono);
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: .18em;
      margin-bottom: 28px;
      text-transform: uppercase;
    }
    .seo-breadcrumb a,
    .seo-breadcrumb strong { color: inherit; font-weight: 700; text-decoration: none; }
    .seo-breadcrumb a:hover { color: #09090B; }
    .seo-breadcrumb span { color: #D4D4D8; }
    .seo-page-hero {
      background: linear-gradient(135deg, rgba(255,255,255,.96), rgba(255,241,235,.72));
      border: 1px solid var(--seo-line);
      border-radius: 40px;
      box-shadow: 0 28px 90px -62px rgba(9,9,11,.48);
      overflow: hidden;
      padding: clamp(34px, 6vw, 72px);
      position: relative;
    }
    .seo-page-hero::after {
      background-image: linear-gradient(rgba(9,9,11,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(9,9,11,.045) 1px, transparent 1px);
      background-size: 56px 56px;
      content: "";
      inset: 0;
      opacity: .62;
      pointer-events: none;
      position: absolute;
    }
    .seo-page-hero > * { position: relative; z-index: 1; }
    .seo-page-eyebrow,
    .seo-sidebar-kicker,
    .seo-disclaimer-kicker {
      color: #FF4500;
      font-family: var(--mono);
      font-size: 10.5px;
      font-weight: 800;
      letter-spacing: .22em;
      line-height: 1.4;
      margin: 0 0 12px;
      text-transform: uppercase;
    }
    .seo-sidebar-kicker-muted { color: #71717A; }
    .seo-page-hero h1 {
      color: #09090B;
      font-family: var(--display);
      font-size: clamp(48px, 7vw, 82px);
      font-weight: 900;
      letter-spacing: -0.045em;
      line-height: .94;
      margin: 0;
      max-width: 920px;
    }
    .seo-lead {
      color: #52525B;
      font-size: clamp(18px, 2vw, 21px);
      line-height: 1.55;
      margin: 26px 0 0;
      max-width: 72ch;
    }
    .seo-meta-row { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 26px; }
    .seo-meta-row span {
      align-items: center;
      background: #FFFFFF;
      border: 1px solid #E4E4E7;
      border-radius: 999px;
      color: #52525B;
      display: inline-flex;
      font-family: var(--mono);
      font-size: 10px;
      font-weight: 700;
      gap: 8px;
      letter-spacing: .16em;
      min-height: 34px;
      padding: 7px 12px;
      text-transform: uppercase;
    }
    .seo-hero-badges {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      margin-top: 34px;
    }
    .seo-meta-row .seo-hero-badge {
      align-items: flex-start;
      background: rgba(255,255,255,.86);
      border-radius: 22px;
      display: grid;
      gap: 5px;
      min-height: 104px;
      padding: 17px 18px;
    }
    .seo-hero-badge small,
    .seo-hero-badge em {
      color: #71717A;
      font-family: var(--mono);
      font-size: 9.5px;
      font-style: normal;
      font-weight: 800;
      letter-spacing: .18em;
      line-height: 1.35;
      text-transform: uppercase;
    }
    .seo-hero-badge strong {
      color: var(--seo-ink);
      font-family: var(--display);
      font-size: clamp(21px, 2.4vw, 30px);
      font-weight: 900;
      letter-spacing: -.035em;
      line-height: 1.02;
    }
    .seo-icon, .seo-external-icon {
      fill: none;
      height: 14px;
      stroke: currentColor;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-width: 2;
      width: 14px;
    }
    .seo-external-icon { display: inline-block; height: 11px; margin-left: 5px; vertical-align: baseline; width: 11px; }
    .seo-reading-grid {
      display: grid;
      gap: 56px;
      grid-template-columns: minmax(0, 8fr) minmax(310px, 4fr);
      margin-top: 64px;
    }
    .seo-content { counter-reset: seo-section; grid-column: 1; grid-row: 1; min-width: 0; }
    .seo-sidebar { align-self: start; grid-column: 2; grid-row: 1; position: sticky; top: 112px; }
    .seo-toc,
    .seo-data-card,
    .seo-product-card,
    .seo-inline-cta,
    .seo-final-cta {
      background: #FFFFFF;
      border: 1px solid #E4E4E7;
      border-radius: 28px;
      box-shadow: 0 18px 60px -44px rgba(9, 9, 11, .42);
    }
    .seo-primary-cards {
      display: grid;
      gap: 22px;
      grid-template-columns: minmax(0, 1.05fr) minmax(320px, .95fr);
      margin: 28px 0 76px;
    }
    .seo-product-card { padding: clamp(24px, 3.8vw, 36px); }
    .seo-product-card h2 {
      color: var(--seo-ink);
      font-family: var(--display);
      font-size: clamp(28px, 3.8vw, 42px);
      font-weight: 900;
      letter-spacing: -.04em;
      line-height: .98;
      margin: 0 0 22px;
      max-width: 12em;
    }
    .seo-stat-grid-wide { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .seo-compact-data {
      margin-bottom: 0;
      margin-top: 22px;
      max-width: none;
    }
    .seo-check-card .seo-calculator { margin-top: 18px; }
    .seo-toc { margin-bottom: 20px; padding: 18px; }
    .seo-toc a {
      border-bottom: 1px solid #E4E4E7;
      color: #52525B;
      display: block;
      font-size: 13px;
      font-weight: 700;
      line-height: 1.4;
      padding: 10px 0;
      text-decoration: none;
    }
    .seo-toc a:last-child { border-bottom: 0; }
    .seo-toc a.is-active {
      background: #FFF1EB;
      border-left: 3px solid #FF4500;
      border-radius: 14px;
      color: #09090B;
      margin: 6px -6px;
      padding-left: 12px;
    }
    .seo-data-card { padding: 28px; }
    .seo-stat-grid { display: grid; gap: 12px; grid-template-columns: 1fr; margin-top: 20px; }
    .seo-stat-cell {
      background: #FAFAFA;
      border: 1px solid #E4E4E7;
      border-radius: 22px;
      display: grid;
      gap: 6px;
      padding: 20px;
    }
    .seo-stat-label,
    .seo-stat-meta,
    .seo-card-note,
    .seo-calculator label span,
    .seo-calc-label {
      color: #71717A;
      font-family: var(--mono);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: .18em;
      text-transform: uppercase;
    }
    .seo-stat-number {
      color: #09090B;
      font-family: var(--display);
      font-size: 44px;
      font-weight: 900;
      letter-spacing: -0.045em;
      line-height: .95;
    }
    .seo-stat-unit { color: #52525B; font-family: var(--mono); font-size: 11px; }
    .seo-calculator { display: grid; gap: 12px; margin-top: 24px; }
    .seo-calculator label { display: grid; gap: 7px; }
    .seo-calculator input {
      background: #FAFAFA;
      border: 1px solid #E4E4E7;
      border-radius: 16px;
      color: #09090B;
      font-family: var(--body);
      font-size: 14px;
      height: 44px;
      outline: none;
      padding: 0 14px;
    }
    .seo-calculator input:focus { border-color: #FF4500; box-shadow: 0 0 0 4px rgba(255,69,0,.12); }
    .seo-calc-result {
      background: #09090B;
      border: 1px solid #18181B;
      border-radius: 20px;
      color: #FFFFFF;
      display: grid;
      gap: 7px;
      padding: 16px 18px;
    }
    .seo-calc-result strong {
      color: #FFFFFF;
      font-family: var(--display);
      font-size: 30px;
      font-weight: 900;
      letter-spacing: -0.04em;
      line-height: 1;
    }
    .seo-calc-result small { color: rgba(255,255,255,.72); font-family: var(--mono); font-size: 11px; letter-spacing: .12em; text-transform: uppercase; }
    .seo-calc-result small[data-tone="good"] { color: #86EFAC; }
    .seo-calc-result small[data-tone="bad"] { color: #FDA4AF; }
    .seo-card-note { line-height: 1.6; margin: 20px 0 0; text-transform: none; }
    .seo-section[data-section-id] { counter-increment: seo-section; }
    .seo-section[data-section-id] > h2::before {
      color: var(--seo-accent);
      content: "[" counter(seo-section, decimal-leading-zero) "]";
      display: block;
      font-family: var(--mono);
      font-size: 11px;
      font-weight: 900;
      letter-spacing: .24em;
      line-height: 1;
      margin-bottom: 14px;
    }
    .seo-section { margin-top: 88px; scroll-margin-top: 112px; }
    .seo-section:first-child { margin-top: 0; }
    .seo-section h2,
    .seo-final-cta h2 {
      color: #09090B;
      font-family: var(--display);
      font-size: clamp(34px, 4.2vw, 54px);
      font-weight: 900;
      letter-spacing: -0.04em;
      line-height: .98;
      margin: 0 0 24px;
      max-width: 800px;
    }
    .seo-section h3 {
      color: #09090B;
      font-family: var(--display);
      font-size: clamp(20px, 2vw, 26px);
      font-weight: 800;
      letter-spacing: -0.025em;
      line-height: 1.18;
      margin: 0;
    }
    .seo-section p,
    .seo-section li {
      color: #52525B;
      font-family: var(--body);
      font-size: 17px;
      line-height: 1.78;
      margin: 0 0 1.2em;
      max-width: 70ch;
    }
    .seo-section strong { color: #09090B; font-weight: 800; }
    .seo-section code {
      background: #FFF1EB;
      border: 1px solid #FFE1D1;
      border-radius: 8px;
      color: #B83100;
      font-family: var(--mono);
      font-size: .92em;
      padding: 2px 7px;
    }
    .seo-section ul { display: grid; gap: 12px; list-style: none; margin: 0 0 1.2em; padding: 0; }
    .seo-section li { display: grid; grid-template-columns: 7px minmax(0, 1fr); gap: 14px; margin: 0; }
    .seo-section li::before { background: #FF4500; border-radius: 50%; content: ""; height: 7px; margin-top: 12px; width: 7px; }
    .seo-data-grid {
      border: 1px solid #E4E4E7;
      border-radius: 24px;
      display: grid;
      gap: 1px;
      grid-template-columns: minmax(150px, .6fr) minmax(0, 1fr);
      margin: 26px 0;
      max-width: 800px;
      overflow: hidden;
    }
    .seo-data-label,
    .seo-data-value { background: #FFFFFF; padding: 16px 20px; }
    .seo-data-label { color: #71717A; font-family: var(--mono); font-size: 10.5px; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; }
    .seo-data-value { color: #09090B; font-size: 15.5px; line-height: 1.5; }
    .seo-source-list { margin-top: 18px; }
    .seo-source-list li { display: block; padding-left: 20px; position: relative; }
    .seo-source-list li::before { left: 0; margin-top: 10px; position: absolute; top: 0; }
    .seo-formula {
      background: #FFF1EB;
      border: 1px solid #FFE1D1;
      border-left: 4px solid #FF4500;
      border-radius: 24px;
      margin: 34px 0;
      max-width: 72ch;
      padding: 22px 26px;
    }
    .seo-formula p { color: #B83100; font-family: var(--mono); font-size: 10.5px; font-weight: 800; letter-spacing: .22em; margin: 0; text-transform: uppercase; }
    .seo-formula code { background: transparent; border: 0; color: #09090B; display: block; font-family: var(--mono); font-size: 18px; margin-top: 8px; padding: 0; }
    .seo-formula span { color: #52525B; display: block; font-size: 14px; line-height: 1.6; margin-top: 12px; max-width: 62ch; }
    .seo-inline-cta { align-items: center; display: flex; flex-wrap: wrap; gap: 16px; justify-content: space-between; margin: 52px 0; max-width: 820px; padding: 26px 30px; }
    .seo-inline-cta .seo-sidebar-kicker { margin-bottom: 8px; }
    .seo-button {
      align-items: center;
      border-radius: 999px;
      cursor: pointer;
      display: inline-flex;
      font-family: var(--body);
      font-size: 14px;
      font-weight: 900;
      gap: 8px;
      justify-content: center;
      letter-spacing: 0;
      min-height: 48px;
      padding: 0 22px;
      text-decoration: none;
      transition: background 140ms ease, border-color 140ms ease, color 140ms ease, transform 140ms ease, box-shadow 140ms ease;
    }
    .seo-button:hover { transform: translateY(-1px); }
    .seo-button-secondary { background: #FFFFFF; border: 1px solid #E4E4E7; color: #09090B; }
    .seo-button-secondary:hover { border-color: #09090B; color: #09090B; }
    .seo-button-primary { background: #FF4500; border: 1px solid #FF4500; box-shadow: 0 18px 38px -22px rgba(255,69,0,.7); color: #FFFFFF; }
    .seo-button-primary:hover { background: #E63E00; border-color: #E63E00; color: #FFFFFF; }
    .seo-link-bento { display: grid; gap: 12px; max-width: 820px; }
    .seo-link-bento a {
      align-items: center;
      background: #FFFFFF;
      border: 1px solid #E4E4E7;
      border-radius: 22px;
      display: grid;
      gap: 14px;
      grid-template-columns: 18px minmax(0, 1fr) auto;
      padding: 18px 20px;
      text-decoration: none;
    }
    .seo-link-bento a:hover { background: #FFF1EB; border-color: #FFE1D1; transform: translateY(-1px); }
    .seo-link-bento .seo-icon { color: #FF4500; }
    .seo-link-bento span { color: #09090B; font-size: 15.5px; font-weight: 800; }
    .seo-link-bento small { color: #71717A; font-family: var(--mono); font-size: 10px; letter-spacing: .16em; overflow: hidden; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
    .seo-faq details { border-top: 1px solid #E4E4E7; max-width: 820px; padding: 20px 0; }
    .seo-faq details:last-child { border-bottom: 1px solid #E4E4E7; }
    .seo-faq summary { color: #09090B; cursor: pointer; font-family: var(--display); font-size: 20px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.3; }
    .seo-faq summary:hover { color: #FF4500; }
    .seo-faq p { color: #52525B; font-size: 16px; margin-top: 12px; }
    .seo-final-cta { margin-top: 104px; padding: 52px 34px; text-align: center; }
    .seo-final-cta h2 { margin-left: auto; margin-right: auto; }
    .seo-final-cta p:not(.seo-sidebar-kicker) { color: #52525B; font-size: 16px; line-height: 1.6; margin: 12px auto 0; max-width: 58ch; }
    .seo-final-actions { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; margin-top: 28px; }
    .seo-disclaimer { border-top: 1px solid #E4E4E7; margin-top: 68px; max-width: 72ch; padding: 26px 0; }
    .seo-disclaimer p:not(.seo-disclaimer-kicker) { color: #52525B; font-size: 13.5px; line-height: 1.65; margin: 12px 0 0; }
    .seo-disclaimer small { color: #71717A; display: block; font-family: var(--mono); font-size: 9.5px; letter-spacing: .2em; margin-top: 12px; text-transform: uppercase; }
    @media (max-width: 900px) {
      .seo-shell { padding: 56px 0 72px; width: min(100% - 32px, 720px); }
      .seo-primary-cards { grid-template-columns: 1fr; margin: 22px 0 52px; }
      .seo-hero-badges { grid-template-columns: 1fr 1fr; }
      .seo-reading-grid { display: flex; flex-direction: column; gap: 42px; margin-top: 40px; }
      .seo-sidebar { order: 1; position: static; }
      .seo-content { order: 2; }
      .seo-toc { display: none; }
      .seo-section { margin-top: 68px; }
      .seo-page-hero h1 { font-size: clamp(42px, 14vw, 58px); }
      .seo-section p, .seo-section li { font-size: 16px; }
      .seo-data-grid, .seo-stat-grid-wide { grid-template-columns: 1fr; }
      .seo-link-bento a { align-items: start; grid-template-columns: 18px minmax(0, 1fr); }
      .seo-link-bento small { grid-column: 2; white-space: normal; }
      .seo-button { width: 100%; }
      .seo-page-hero { border-radius: 28px; padding: 30px 22px; }
      .seo-hero-badges { grid-template-columns: 1fr; }
      .seo-inline-cta { align-items: stretch; }
    }
    @media (max-width: 560px) {
      .seo-shell { padding: 38px 0 56px; width: min(100% - 24px, 560px); }
      .seo-breadcrumb { font-size: 9px; gap: 6px; letter-spacing: .1em; margin-bottom: 18px; overflow-wrap: anywhere; }
      .seo-page-hero { border-radius: 22px; padding: 24px 16px; }
      .seo-page-hero h1 {
        font-size: clamp(32px, 10.5vw, 42px);
        letter-spacing: 0;
        line-height: 1;
        overflow-wrap: anywhere;
      }
      .seo-lead { font-size: 16px; line-height: 1.5; margin-top: 18px; }
      .seo-meta-row { display: grid; gap: 8px; margin-top: 20px; }
      .seo-meta-row span { border-radius: 16px; justify-content: flex-start; letter-spacing: .08em; min-width: 0; overflow-wrap: anywhere; white-space: normal; width: 100%; }
      .seo-hero-badges { gap: 10px; margin-top: 22px; }
      .seo-meta-row .seo-hero-badge { min-height: auto; padding: 14px; }
      .seo-hero-badge strong { font-size: clamp(22px, 8vw, 28px); letter-spacing: 0; overflow-wrap: anywhere; }
      .seo-product-card,
      .seo-data-card,
      .seo-inline-cta,
      .seo-final-cta {
        border-radius: 22px;
        padding: 20px 16px;
      }
      .seo-product-card h2,
      .seo-section h2,
      .seo-final-cta h2 {
        font-size: clamp(28px, 9vw, 36px);
        letter-spacing: 0;
        line-height: 1.04;
        overflow-wrap: anywhere;
      }
      .seo-reading-grid { gap: 32px; margin-top: 32px; }
      .seo-section { margin-top: 52px; }
      .seo-section p,
      .seo-section li { font-size: 15.5px; line-height: 1.68; }
      .seo-section li { gap: 10px; grid-template-columns: 6px minmax(0, 1fr); }
      .seo-stat-cell { border-radius: 18px; padding: 16px; }
      .seo-stat-number { font-size: clamp(30px, 11vw, 38px); letter-spacing: 0; overflow-wrap: anywhere; }
      .seo-stat-label,
      .seo-stat-meta,
      .seo-data-label,
      .seo-card-note,
      .seo-calculator label span,
      .seo-calc-label { letter-spacing: .1em; }
      .seo-data-grid { border-radius: 18px; margin: 18px 0; }
      .seo-data-label,
      .seo-data-value { overflow-wrap: anywhere; padding: 12px 14px; }
      .seo-formula { border-radius: 18px; margin: 26px 0; overflow-x: auto; padding: 18px; }
      .seo-formula p { letter-spacing: .12em; }
      .seo-formula code { font-size: 15px; overflow-wrap: anywhere; white-space: normal; }
      .seo-calc-result strong { font-size: 26px; letter-spacing: 0; overflow-wrap: anywhere; }
      .seo-link-bento a { border-radius: 18px; padding: 15px; }
      .seo-final-actions { align-items: stretch; flex-direction: column; }
    }
    @media (max-width: 480px) {
      .seo-page .site-header .nav { gap: 12px; }
      .seo-page .site-header .language-switch { display: none; }
      .seo-page .site-header .mobile-toggle { flex: 0 0 40px; height: 40px; width: 40px; }
    }
    @media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; transition: none !important; } }
  </style>
  ${structuredData(renderedLanding, canonical)}
</head>
<body class="seo-page">
  ${googleTagManagerNoscript()}
  ${siteHeaderHtml()}
  <main class="seo-shell" data-owned-analytics data-page-type="seo" data-content-type="${escapeHtml(String(renderedLanding.template_type || "").includes("guide") ? "guide" : "landing")}" data-template-type="${escapeHtml(renderedLanding.template_type || "")}" data-slug="${escapeHtml(renderedLanding.slug || "")}" data-city="${escapeHtml(renderedLanding.city || "")}" data-topic="${escapeHtml(renderedLanding.title || renderedLanding.h1 || "")}">
    ${bodyHtml}
  </main>
  ${siteFooterHtml()}
  ${seoPageScript()}
  <script src="/assets/app.js" defer></script>
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
