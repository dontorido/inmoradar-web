const WAITLIST_EMAIL = "hola@inmoradar.app";
const CHECKOUT_ENDPOINT = "/api/lemonsqueezy-checkout";
const PORTAL_ENDPOINT = "/api/lemonsqueezy-portal";
const CONTACT_ENDPOINT = "/api/contact";
const LANGUAGE_STORAGE_KEY = "inmoradar_language";

const articles = [
  {
    slug: "precio-alquiler-zaragoza",
    tag: "Alquiler",
    city: "Zaragoza",
    title: "Precio del alquiler por metro cuadrado en Zaragoza",
    excerpt: "Cómo leer una renta mensual con referencia de zona, superficie y coste real antes de escribir al anunciante."
  },
  {
    slug: "precio-alquiler-granada",
    tag: "Alquiler",
    city: "Granada",
    title: "Precio del alquiler por metro cuadrado en Granada",
    excerpt: "Una guía para distinguir una renta razonable de una prima difícil de justificar por ubicación o estado."
  },
  {
    slug: "saber-piso-caro-granada",
    tag: "Análisis",
    city: "Granada",
    title: "Cómo saber si un piso está caro en Granada",
    excerpt: "Precio, reforma probable, transporte y aparcamiento: cuatro capas para no decidir solo por intuición."
  },
  {
    slug: "precio-metro-cuadrado-madrid",
    tag: "Precio m2",
    city: "Madrid",
    title: "Precio del metro cuadrado en Madrid",
    excerpt: "Madrid exige granularidad: barrio, distrito, edificio y comparables pesan mas que una media municipal."
  },
  {
    slug: "precio-metro-cuadrado-barcelona",
    tag: "Precio m2",
    city: "Barcelona",
    title: "Precio del metro cuadrado en Barcelona",
    excerpt: "Lectura de precios por zona y señales urbanas para entender cuándo una prima puede tener sentido."
  },
  {
    slug: "precio-metro-cuadrado-valencia",
    tag: "Precio m2",
    city: "Valencia",
    title: "Precio del metro cuadrado en Valencia",
    excerpt: "Cómo cruzar precio, barrio, transporte y estado visual para priorizar visitas."
  },
  {
    slug: "precio-metro-cuadrado-malaga",
    tag: "Precio m2",
    city: "Málaga",
    title: "Precio del metro cuadrado en Málaga",
    excerpt: "Mercado tensionado, ubicación y reforma: qué mirar antes de reservar una visita."
  },
  {
    slug: "precio-metro-cuadrado-salamanca",
    tag: "Precio m2",
    city: "Salamanca",
    title: "Precio del metro cuadrado en Salamanca",
    excerpt: "Referencias útiles para compradores que quieren comparar anuncios sin perder semanas."
  },
  {
    slug: "precio-metro-cuadrado-logrono",
    tag: "Precio m2",
    city: "Logroño",
    title: "Precio del metro cuadrado en Logroño",
    excerpt: "Una metodología sencilla para interpretar precios y evitar conclusiones demasiado rápidas."
  }
];

const I18N = {
  es: {
    navAnalysis: "Qué analiza",
    navApis: "APIs",
    navPremium: "Premium",
    navNews: "Noticias",
    navFaq: "FAQ",
    navContact: "Contacto",
    navCta: "Empezar gratis",
    contactSuccess: "Mensaje enviado. Te respondemos en menos de 24h.",
    contactError: "Revisa los campos del formulario.",
    contactSending: "Enviando...",
    contactSent: "Enviado - enviar otro",
    checkoutPreparing: "Preparando checkout seguro...",
    checkoutOpening: "Abriendo checkout...",
    checkoutManual: "Escribenos y lo activamos manualmente.",
    portalOpening: "Enviando enlace seguro...",
    portalVerifying: "Verificando enlace seguro...",
    portalLinkSent: "Revisa tu email. Te hemos enviado un enlace temporal.",
    portalHelp: "No hemos podido preparar el acceso. Escribenos y te ayudamos.",
    all: "Todos",
    read: "Lectura 4 min",
    updated: "Actualizado may 2026"
  },
  en: {
    navAnalysis: "What it checks",
    navApis: "APIs",
    navPremium: "Premium",
    navNews: "News",
    navFaq: "FAQ",
    navContact: "Contact",
    navCta: "Start free",
    contactSuccess: "Message sent. We will reply in under 24h.",
    contactError: "Please review the form fields.",
    contactSending: "Sending...",
    contactSent: "Sent - send another",
    checkoutPreparing: "Preparing secure checkout...",
    checkoutOpening: "Opening checkout...",
    checkoutManual: "Email us and we will activate it manually.",
    portalOpening: "Sending secure link...",
    portalVerifying: "Verifying secure link...",
    portalLinkSent: "Check your email. We sent you a temporary link.",
    portalHelp: "We could not prepare access. Email us and we will help.",
    all: "All",
    read: "4 min read",
    updated: "Updated May 2026"
  }
};

let currentLanguage = "es";

function t(key) {
  return I18N[currentLanguage]?.[key] || I18N.es[key] || key;
}

function icon(name) {
  const paths = {
    Radar: '<circle cx="12" cy="12" r="8"/><path d="M12 12l5-5M12 4v3M12 17v3M4 12h3M17 12h3"/>',
    ArrowRight: '<path d="M5 12h14M13 5l7 7-7 7"/>',
    ArrowUpRight: '<path d="M7 17 17 7M8 7h9v9"/>',
    Mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    MapPin: '<path d="M12 21s7-5 7-12a7 7 0 1 0-14 0c0 7 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    Send: '<path d="M22 2 11 13"/><path d="m22 2-7 20-4-9-9-4z"/>',
    Clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    Calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/>'
  };
  return `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.Radar}</svg>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function applyLanguage(language) {
  currentLanguage = language === "en" ? "en" : "es";
  document.documentElement.lang = currentLanguage;
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, currentLanguage);
  } catch {
    // Storage may be blocked.
  }
  document.querySelectorAll("[data-i18n-key]").forEach((node) => {
    const value = t(node.dataset.i18nKey);
    if (value) node.textContent = value;
  });
  document.querySelectorAll("[data-lang]").forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.lang === currentLanguage ? "true" : "false");
  });
  renderArticles();
  renderArticlePage();
}

function initLanguage() {
  let language = "es";
  try {
    language = localStorage.getItem(LANGUAGE_STORAGE_KEY) || "es";
  } catch {
    language = "es";
  }
  applyLanguage(language);
  document.querySelectorAll("[data-lang]").forEach((button) => {
    button.addEventListener("click", () => applyLanguage(button.dataset.lang));
  });
}

function initHeader() {
  const header = document.querySelector("[data-site-header]");
  const toggle = document.querySelector("[data-mobile-toggle]");
  const panel = document.querySelector("[data-mobile-panel]");
  const onScroll = () => header?.classList.toggle("is-scrolled", window.scrollY > 8);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
  toggle?.addEventListener("click", () => {
    const open = !panel.classList.contains("open");
    panel.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  });
}

function renderArticles() {
  document.querySelectorAll("[data-articles-grid]").forEach((grid) => {
    const limit = Number(grid.dataset.limit || articles.length);
    const filter = grid.dataset.activeFilter || "Todos";
    const items = articles
      .filter((item) => filter === "Todos" || item.tag === filter)
      .slice(0, limit);
    grid.innerHTML = items.map((item, index) => articleCard(item, index === 0 && grid.dataset.largeFirst === "true")).join("");
  });
}

function articleCard(item, large = false) {
  return `
    <a class="article-card ${large ? "large" : ""}" href="/noticias/${escapeHtml(item.slug)}" data-testid="article-card-${escapeHtml(item.slug)}">
      <div>
        <div class="article-meta"><span>${escapeHtml(item.tag)}</span><span>${icon("ArrowUpRight")}</span></div>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.excerpt)}</p>
      </div>
      <div class="article-meta"><span>${t("read")}</span><span>${t("updated")}</span></div>
    </a>
  `;
}

function initArticleFilters() {
  const wrap = document.querySelector("[data-news-filters]");
  const grid = document.querySelector("[data-articles-grid]");
  if (!wrap || !grid) return;
  wrap.addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter]");
    if (!button) return;
    wrap.querySelectorAll("[data-filter]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    grid.dataset.activeFilter = button.dataset.filter;
    renderArticles();
  });
}

function renderArticlePage() {
  const target = document.querySelector("[data-article-page]");
  if (!target) return;
  const slug = target.dataset.slug || new URLSearchParams(location.search).get("slug") || location.pathname.split("/").filter(Boolean).pop();
  const article = articles.find((item) => item.slug === slug) || articles[0];
  const related = articles.filter((item) => item.slug !== article.slug).slice(0, 3);
  target.innerHTML = `
    <section class="page-header grid-bg">
      <div class="container article-layout">
        <a class="button ghost" href="/noticias">${currentLanguage === "en" ? "All posts" : "Todas las públicaciones"}</a>
        <p class="pill" style="margin-top:28px"><span class="dot-radar"></span>${escapeHtml(article.tag)} · ${escapeHtml(article.city)}</p>
        <h1>${escapeHtml(article.title)}</h1>
        <p class="lead">${escapeHtml(article.excerpt)}</p>
        <div class="article-meta" style="margin-top:24px"><span>${icon("Clock")} ${t("read")}</span><span>${icon("Calendar")} ${t("updated")}</span></div>
      </div>
    </section>
    <section class="section">
      <article class="container article-layout article-body">
        <p class="article-summary">${escapeHtml(article.excerpt)} La clave es no mirar solo el precio total: la lectura mejora al cruzar euros por metro, barrio, estado, transporte y aparcamiento.</p>
        <h2>Resumen rápido</h2>
        <p>Un anuncio puede parecer atractivo por precio absoluto y seguir estando por encima de mercado si la superficie, la ubicación concreta o el estado del edificio no acompañan. InmoRadar ordena esas señales para que decidas si merece una llamada.</p>
        <h2>Metodología</h2>
        <ol class="number-list">
          <li><span>01</span><p>Calculamos el precio por metro cuadrado del anuncio y lo comparamos con referencias agregadas disponibles.</p></li>
          <li><span>02</span><p>Mostramos el nivel geográfico usado: zona, distrito, municipio o provincia. Nunca lo presentamos como precio exacto de calle.</p></li>
          <li><span>03</span><p>Cruzamos coste inicial, financiación orientativa, transporte y aparcamiento para evitar una lectura incompleta.</p></li>
          <li><span>04</span><p>Añadimos caveats cuando la confianza baja o faltan datos del anuncio.</p></li>
        </ol>
        <h2>Cómo usarlo con InmoRadar</h2>
        <p>Abre un anuncio compatible, revisa la ficha de precio y zona, guarda los candidatos fuertes y compara los inmuebles antes de contactar. La extensión no sustituye una tasación ni una visita, pero ayuda a filtrar mejor.</p>
        <div class="callout"><strong>Tip InmoRadar</strong><p>Si una vivienda sale cara y además la finca no tiene ascensor, el parking es difícil o la reforma visual parece probable, pide más información antes de avanzar.</p></div>
      </article>
      <div class="container">
        <div class="article-grid">${related.map((item) => articleCard(item)).join("")}</div>
      </div>
    </section>
  `;
}

function initFaq() {
  document.querySelectorAll("[data-faq-trigger]").forEach((trigger) => {
    trigger.addEventListener("click", () => {
      const panel = document.getElementById(trigger.getAttribute("aria-controls"));
      const open = trigger.getAttribute("aria-expanded") === "true";
      trigger.setAttribute("aria-expanded", open ? "false" : "true");
      panel?.classList.toggle("open", !open);
    });
  });
}

function showToast(message, tone = "success") {
  let toast = document.querySelector("[data-toast]");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    toast.dataset.toast = "true";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.toggle("error", tone === "error");
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3800);
}

function initContactForm() {
  const form = document.querySelector("[data-contact-form]");
  if (!form) return;
  let topic = form.querySelector("[data-topic].active")?.dataset.topic || "general";
  form.querySelectorAll("[data-topic]").forEach((button) => {
    button.addEventListener("click", () => {
      topic = button.dataset.topic;
      form.querySelectorAll("[data-topic]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
    });
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = form.querySelector("[data-contact-submit]");
    const payload = {
      name: String(form.name.value || "").trim(),
      email: String(form.email.value || "").trim(),
      topic,
      message: String(form.message.value || "").trim()
    };
    if (!payload.name || !payload.email || payload.message.length < 4) {
      showToast(t("contactError"), "error");
      return;
    }
    submit.disabled = true;
    submit.textContent = t("contactSending");
    try {
      const response = await fetch(CONTACT_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error("contact_failed");
      showToast(t("contactSuccess"));
      form.reset();
      submit.textContent = t("contactSent");
    } catch {
      showToast("No hemos podido enviar el mensaje. Escribe a hola@inmoradar.app.", "error");
      submit.textContent = "Enviar";
    } finally {
      submit.disabled = false;
    }
  });
}

function initCheckout() {
  async function openPortalFromToken(token) {
    try {
      showToast(t("portalVerifying"));
      const response = await fetch(PORTAL_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.portal_url) throw new Error(payload.message || t("portalHelp"));
      location.href = payload.portal_url;
    } catch (error) {
      showToast(error.message || t("portalHelp"), "error");
      const status = document.querySelector("[data-portal-status]");
      if (status) {
        status.textContent = error.message || t("portalHelp");
        status.dataset.tone = "error";
      }
    }
  }

  const portalToken = new URLSearchParams(location.search).get("token");
  if (portalToken) openPortalFromToken(portalToken);

  document.querySelectorAll("[data-checkout-button]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        showToast(t("checkoutPreparing"));
        const response = await fetch(CHECKOUT_ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ source: button.dataset.checkoutSource || "web" })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.checkout_url) throw new Error("checkout_failed");
        showToast(t("checkoutOpening"));
        location.href = payload.checkout_url;
      } catch {
        location.href = `mailto:${WAITLIST_EMAIL}?subject=Quiero%20InmoRadar%20Premium`;
      } finally {
        button.disabled = false;
      }
    });
  });
  document.querySelectorAll("[data-portal-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = String(new FormData(form).get("email") || "").trim();
      const submit = form.querySelector("[type='submit']");
      const status = form.querySelector("[data-portal-status]") || document.querySelector("[data-portal-status]");
      if (submit) submit.disabled = true;
      try {
        showToast(t("portalOpening"));
        const response = await fetch(PORTAL_ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || t("portalHelp"));
        const message = payload.message || t("portalLinkSent");
        showToast(t("portalLinkSent"));
        if (status) {
          status.textContent = message;
          status.dataset.tone = "success";
        }
      } catch (error) {
        const message = error.message || t("portalHelp");
        showToast(message, "error");
        if (status) {
          status.textContent = message;
          status.dataset.tone = "error";
        }
      } finally {
        if (submit) submit.disabled = false;
      }
    });
  });
}

function init() {
  document.querySelectorAll("[data-year]").forEach((node) => {
    node.textContent = String(new Date().getFullYear());
  });
  document.querySelectorAll("[data-icon]").forEach((node) => {
    node.innerHTML = icon(node.dataset.icon);
  });
  initHeader();
  initLanguage();
  initArticleFilters();
  initFaq();
  initContactForm();
  initCheckout();
}

init();
