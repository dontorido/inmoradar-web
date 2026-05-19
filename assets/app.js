const WAITLIST_EMAIL = "hola@inmoradar.app";
const CHECKOUT_ENDPOINT = "/api/lemonsqueezy-checkout";
const PORTAL_ENDPOINT = "/api/lemonsqueezy-portal";
const LANGUAGE_STORAGE_KEY = "inmoradar_language";

const I18N = {
  es: {
    "nav.home": "Inicio",
    "nav.analysis": "Qu\u00e9 analiza",
    "nav.apis": "APIs",
    "nav.news": "Noticias",
    "nav.premium": "Premium",
    "nav.faq": "FAQ",
    "nav.freeAccess": "2 d\u00edas gratis",
    "footer.privacy": "Privacidad",
    "footer.terms": "T\u00e9rminos",
    "footer.news": "Noticias",
    "footer.contact": "Contacto",
    "home.hero.eyebrow": "Extensi\u00f3n Chrome para buscar vivienda con m\u00e1s criterio",
    "home.hero.title": "Analiza inmuebles antes de contactar.",
    "home.hero.lead": "InmoRadar convierte cada anuncio en una ficha clara: precio real, entrada estimada, zona, aparcamiento, transporte y se\u00f1ales que conviene revisar.",
    "home.hero.ctaPrimary": "Probar 2 d\u00edas gratis",
    "home.hero.ctaSecondary": "Ver qu\u00e9 analiza",
    "home.metric.freeValue": "2 d\u00edas",
    "home.metric.freeLabel": "acceso gratis por defecto",
    "home.metric.priceValue": "1,99 €",
    "home.metric.priceLabel": "Premium semanal despu\u00e9s",
    "home.metric.scoreLabel": "\u00edndice de valoraci\u00f3n",
    "home.freeNote": "Los 2 d\u00edas gratis son acceso inicial para todos. No tienes que pagar Premium para probar InmoRadar; si despu\u00e9s quieres seguir analizando, activas Premium.",
    "news.kicker": "Noticias",
    "news.title": "Publicaciones y gu\u00edas inmobiliarias.",
    "news.lead": "En esta secci\u00f3n iremos enlazando las nuevas p\u00e1ginas de datos, gu\u00edas y an\u00e1lisis publicados por InmoRadar.",
    "news.sample.meta": "Precio por m2",
    "news.sample.title": "Precio del metro cuadrado en Logro\u00f1o",
    "news.sample.desc": "Referencia de venta y alquiler con fuente, fecha del dato y pautas para comparar anuncios antes de contactar.",
    "news.archive": "Archivo",
    "news.previous": "Publicaciones anteriores",
    "analysis.kicker": "An\u00e1lisis inmediato",
    "analysis.title": "Precio, zona y coste real en una sola vista.",
    "analysis.lead": "Dise\u00f1ado para compradores, inquilinos e inversores peque\u00f1os que quieren filtrar mejor antes de llamar, escribir o visitar.",
    "analysis.card1.title": "Coste real",
    "analysis.card1.copy": "Precio, superficie, €/m2, entrada estimada, hipoteca orientativa, comunidad e IBI cuando hay datos suficientes.",
    "analysis.card2.title": "Entorno",
    "analysis.card2.copy": "Ruido esperado, dificultad para aparcar, rotaci\u00f3n, ZBR, servicios cercanos y transporte p\u00fablico.",
    "analysis.card3.title": "Comparativa",
    "analysis.card3.copy": "Guarda inmuebles y compara precio, metros, habitaciones, zona, log\u00edstica diaria y valoraci\u00f3n.",
    "api.kicker": "Datos enriquecidos",
    "api.title": "APIs propias para se\u00f1ales urbanas.",
    "api.lead": "InmoRadar consulta servicios propios para precio de mercado, datos de edificio y dificultad de aparcamiento. Cada anuncio gana contexto \u00fatil sin prometer mediciones exactas.",
    "api.signal1": "Comparaci\u00f3n por zona y operaci\u00f3n para detectar precio alto, medio u oportunidad.",
    "api.signal2": "Datos p\u00fablicos de edificio como a\u00f1o, ascensor, plantas y contexto de direcci\u00f3n cuando est\u00e1n disponibles.",
    "api.signal3": "Tiempos orientativos a trabajo, colegio y destinos habituales.",
    "premium.kicker": "Premium",
    "premium.title": "Para b\u00fasquedas intensivas.",
    "premium.lead": "Empieza con 2 d\u00edas de acceso inicial gratuito para todos. Despu\u00e9s, si quieres seguir, activa Premium por 1,99 \u20ac a la semana mientras dure tu b\u00fasqueda.",
    "premium.card.kicker": "Acceso inicial",
    "premium.card.price": "1,99 \u20ac",
    "premium.card.period": "/ semana",
    "premium.card.li1": "2 d\u00edas gratis por defecto, sin activar Premium.",
    "premium.card.li2": "Premium semanal solo si decides continuar.",
    "premium.card.li3": "An\u00e1lisis ilimitados de fichas.",
    "premium.card.li4": "Comparativa de inmuebles guardados.",
    "premium.card.cta": "Ver Premium",
    "faq.q1": "Los 2 d\u00edas gratis, \u00bfson una prueba Premium?",
    "faq.a1": "No. Son acceso inicial gratuito para todos los usuarios. No se cobra nada ni tienes que activar Premium para probarlo durante esos 2 d\u00edas.",
    "faq.q2": "\u00bfInmoRadar mide datos exactos?",
    "faq.a2": "No. Ofrece estimaciones orientativas basadas en datos abiertos, informaci\u00f3n visible del anuncio y se\u00f1ales urbanas.",
    "faq.q3": "\u00bfFunciona con cualquier portal?",
    "faq.a3": "La primera versi\u00f3n est\u00e1 orientada a Idealista y se ir\u00e1 ampliando a otros portales compatibles.",
    "faq.q4": "\u00bfD\u00f3nde se guardan mis inmuebles?",
    "faq.a4": "La extensi\u00f3n guarda la lista localmente en tu navegador, salvo que actives funciones que requieran servicios externos.",
    "premiumPage.navCta": "Activar Premium",
    "premiumPage.eyebrow": "Plan Premium \u00b7 despu\u00e9s del acceso inicial",
    "premiumPage.title": "InmoRadar Premium",
    "premiumPage.lead": "Todos los usuarios tienen 2 d\u00edas de acceso inicial gratuito por defecto. Cuando termine ese periodo, puedes seguir analizando inmuebles con Premium semanal.",
    "premiumPage.freeNote": "Importante: los 2 d\u00edas gratis no son una prueba Premium de pago. Son acceso inicial gratuito para probar InmoRadar antes de decidir si quieres continuar.",
    "premiumPage.cardKicker": "Premium semanal",
    "premiumPage.cardCopy": "Despu\u00e9s de los 2 d\u00edas gratuitos, Premium mantiene el an\u00e1lisis activo por 1,99 \u20ac por semana, sin permanencia.",
    "premiumPage.li1": "2 d\u00edas gratis por defecto para todos.",
    "premiumPage.li2": "An\u00e1lisis ilimitado durante tu b\u00fasqueda si activas Premium.",
    "premiumPage.li3": "Costes estimados de compra o alquiler.",
    "premiumPage.li4": "Valoraci\u00f3n de inmueble, zona y precio de mercado.",
    "premiumPage.li5": "Comparativa guardada y log\u00edstica diaria.",
    "premiumPage.checkout": "Activar Premium",
    "premiumPage.support": "Contactar soporte",
    "premiumPage.billingKicker": "Ya eres Premium",
    "premiumPage.billingTitle": "Gestiona tu suscripci\u00f3n.",
    "premiumPage.billingCopy": "Cambia tarjeta, revisa facturas o cancela la renovaci\u00f3n desde el portal seguro de Lemon Squeezy.",
    "premiumPage.emailLabel": "Email de compra",
    "premiumPage.emailPlaceholder": "tu@email.com",
    "premiumPage.manage": "Gestionar o cancelar",
    "privacy.kicker": "Privacidad",
    "privacy.title": "Politica de privacidad",
    "privacy.updated": "Ultima actualizacion: 14 de mayo de 2026.",
    "privacy.intro": "InmoRadar es una extension de navegador y una web de apoyo para analizar anuncios inmobiliarios. Esta politica explica que datos se usan y con que finalidad.",
    "privacy.h1": "Datos que puede tratar la extension",
    "privacy.li1": "Texto visible del anuncio inmobiliario para detectar precio, superficie, habitaciones, ubicacion aproximada y senales del inmueble.",
    "privacy.li2": "Direcciones habituales configuradas por el usuario, como trabajo o colegio, para preparar calculos de logistica diaria.",
    "privacy.li3": "Inmuebles guardados por el usuario para mostrarlos en una lista comparativa.",
    "privacy.h2": "Almacenamiento local",
    "privacy.local": "Las direcciones habituales y la lista de inmuebles se guardan en chrome.storage.local, dentro del navegador del usuario. No vendemos datos personales ni los usamos para publicidad.",
    "privacy.h3": "Servicios externos",
    "privacy.external": "InmoRadar puede consultar servicios externos de mapas, geocodificacion, rutas o analisis para calcular ubicaciones aproximadas, transporte, tiempos o contexto del inmueble.",
    "privacy.h4": "Pagos",
    "privacy.payments": "Cuando se active la suscripcion Premium, el pago se gestionara mediante un proveedor externo como Lemon Squeezy o Stripe. InmoRadar no almacenara datos completos de tarjeta.",
    "privacy.contactTitle": "Contacto",
    "privacy.contactCopy": "Para consultas de privacidad, escribe a",
    "terms.kicker": "Legal",
    "terms.title": "Terminos de uso",
    "terms.updated": "Ultima actualizacion: 14 de mayo de 2026.",
    "terms.h1": "Servicio",
    "terms.service": "InmoRadar ayuda a interpretar anuncios inmobiliarios mediante estimaciones y resumenes automaticos. El servicio no sustituye una tasacion, una medicion oficial, una revision legal ni el asesoramiento de un profesional.",
    "terms.h2": "Estimaciones",
    "terms.estimates": "Los resultados pueden contener errores o depender de datos incompletos del anuncio. El usuario debe verificar precio, superficie, cargas, costes, estado del inmueble, informacion urbanistica y cualquier dato relevante antes de tomar decisiones.",
    "terms.h3": "Premium",
    "terms.premium": "InmoRadar puede ofrecer 2 dias de acceso inicial gratuito por defecto para todos los usuarios. Ese acceso inicial no es una prueba Premium de pago. Una vez finalizado, el usuario puede continuar con Premium por 1,99 € por semana, sin permanencia, mediante el proveedor de pagos configurado.",
    "terms.h4": "Uso aceptable",
    "terms.acceptable": "No esta permitido intentar desactivar limites tecnicos, revender el servicio, automatizar consultas abusivas ni usar InmoRadar para recopilar datos de portales de forma contraria a sus condiciones.",
    "terms.h5": "Responsabilidad",
    "terms.liability": "InmoRadar se ofrece como herramienta orientativa. No garantizamos disponibilidad continua ni exactitud absoluta de los datos o estimaciones.",
    "terms.contactTitle": "Contacto",
    "terms.contactCopy": "Para soporte, escribe a",
    "success.home": "Volver al inicio",
    "success.kicker": "Premium",
    "success.title": "Premium activado",
    "success.copy1": "Gracias por activar InmoRadar Premium. Vuelve a la extension para seguir analizando inmuebles.",
    "success.copy2": "La suscripcion se sincroniza mediante Lemon Squeezy y puede tardar unos segundos en aparecer como activa.",
    "success.cta": "Ir a InmoRadar",
    "success.manageLabel": "Gestionar suscripcion",
    "success.portal": "Abrir portal",
    "cancel.viewPremium": "Ver Premium",
    "cancel.kicker": "Premium",
    "cancel.title": "Pago cancelado",
    "cancel.copy": "No se ha activado ninguna suscripcion. Puedes volver al plan Premium cuando quieras.",
    "cancel.cta": "Volver a Premium",
    "checkout.preparing": "Preparando checkout seguro de Lemon Squeezy...",
    "checkout.openingTest": "Abriendo checkout de prueba...",
    "checkout.opening": "Abriendo checkout...",
    "checkout.manual": "Escribenos y lo activamos manualmente.",
    "portal.opening": "Abriendo portal seguro de Lemon Squeezy...",
    "portal.magic": "Te llevamos al portal de Lemon Squeezy. Si te lo pide, confirma tu email con magic link.",
    "portal.help": "Escribenos y te ayudamos con la baja.",
    "news.metaFallback": "Guia inmobiliaria",
    "news.archiveCount": "publicaciones anteriores"
  },
  en: {
    "nav.home": "Home",
    "nav.analysis": "What it checks",
    "nav.apis": "APIs",
    "nav.news": "News",
    "nav.premium": "Premium",
    "nav.faq": "FAQ",
    "nav.freeAccess": "2 days free",
    "footer.privacy": "Privacy",
    "footer.terms": "Terms",
    "footer.news": "News",
    "footer.contact": "Contact",
    "home.hero.eyebrow": "Chrome extension for sharper home searches",
    "home.hero.title": "Analyze homes before you contact.",
    "home.hero.lead": "InmoRadar turns each listing into a clear brief: real price, estimated cash needed, area context, parking, transport and signals worth checking.",
    "home.hero.ctaPrimary": "Try 2 days free",
    "home.hero.ctaSecondary": "See what it checks",
    "home.metric.freeValue": "2 days",
    "home.metric.freeLabel": "free access by default",
    "home.metric.priceValue": "€1.99",
    "home.metric.priceLabel": "weekly Premium after that",
    "home.metric.scoreLabel": "rating index",
    "home.freeNote": "The 2 free days are initial access for everyone. You do not need to pay for Premium to try InmoRadar; if you want to keep analyzing after that, you activate Premium.",
    "news.kicker": "News",
    "news.title": "Real-estate posts and guides.",
    "news.lead": "This section links to new data pages, guides and analysis published by InmoRadar.",
    "news.sample.meta": "Price per m2",
    "news.sample.title": "Price per square meter in Logrono",
    "news.sample.desc": "Sale and rent reference with source, data date and guidance for comparing listings before contacting.",
    "news.archive": "Archive",
    "news.previous": "Previous posts",
    "analysis.kicker": "Instant analysis",
    "analysis.title": "Price, area and real cost in one view.",
    "analysis.lead": "Built for buyers, renters and small investors who want to filter better before calling, writing or visiting.",
    "analysis.card1.title": "Real cost",
    "analysis.card1.copy": "Price, surface, €/m2, estimated down payment, mortgage estimate, community fees and property tax when data is available.",
    "analysis.card2.title": "Surroundings",
    "analysis.card2.copy": "Expected noise, parking difficulty, churn, low-emission zones, nearby services and public transport.",
    "analysis.card3.title": "Comparison",
    "analysis.card3.copy": "Save homes and compare price, meters, rooms, area, daily logistics and score.",
    "api.kicker": "Enriched data",
    "api.title": "Own APIs for urban signals.",
    "api.lead": "InmoRadar uses own services for market price, building data and parking difficulty. Each listing gets useful context without promising exact measurements.",
    "api.signal1": "Comparison by area and operation to detect expensive, average or opportunity pricing.",
    "api.signal2": "Public building data such as year, lift, floors and address context when available.",
    "api.signal3": "Indicative travel times to work, school and your usual destinations.",
    "premium.kicker": "Premium",
    "premium.title": "For intensive searches.",
    "premium.lead": "Start with 2 days of initial free access for everyone. After that, if you want to continue, activate Premium for €1.99 per week while your search lasts.",
    "premium.card.kicker": "Initial access",
    "premium.card.price": "€1.99",
    "premium.card.period": "/ week",
    "premium.card.li1": "2 free days by default, without activating Premium.",
    "premium.card.li2": "Weekly Premium only if you decide to continue.",
    "premium.card.li3": "Unlimited listing analyses.",
    "premium.card.li4": "Saved-home comparison.",
    "premium.card.cta": "See Premium",
    "faq.q1": "Are the 2 free days a Premium trial?",
    "faq.a1": "No. They are initial free access for every user. You are not charged and do not need to activate Premium to try it during those 2 days.",
    "faq.q2": "Does InmoRadar measure exact data?",
    "faq.a2": "No. It provides indicative estimates based on open data, visible listing information and urban signals.",
    "faq.q3": "Does it work with every portal?",
    "faq.a3": "The first version is focused on Idealista and will expand to other compatible portals.",
    "faq.q4": "Where are my saved homes stored?",
    "faq.a4": "The extension stores the list locally in your browser unless you enable features that require external services.",
    "premiumPage.navCta": "Activate Premium",
    "premiumPage.eyebrow": "Premium plan · after initial access",
    "premiumPage.title": "InmoRadar Premium",
    "premiumPage.lead": "Every user gets 2 days of initial free access by default. When that period ends, you can keep analyzing homes with weekly Premium.",
    "premiumPage.freeNote": "Important: the 2 free days are not a paid Premium trial. They are free initial access so you can try InmoRadar before deciding whether to continue.",
    "premiumPage.cardKicker": "Weekly Premium",
    "premiumPage.cardCopy": "After the 2 free days, Premium keeps analysis active for €1.99 per week, with no lock-in.",
    "premiumPage.li1": "2 free days by default for everyone.",
    "premiumPage.li2": "Unlimited analysis during your search if you activate Premium.",
    "premiumPage.li3": "Estimated buying or rental costs.",
    "premiumPage.li4": "Home, area and market-price assessment.",
    "premiumPage.li5": "Saved comparison and daily logistics.",
    "premiumPage.checkout": "Activate Premium",
    "premiumPage.support": "Contact support",
    "premiumPage.billingKicker": "Already Premium",
    "premiumPage.billingTitle": "Manage your subscription.",
    "premiumPage.billingCopy": "Change card, review invoices or cancel renewal from the secure Lemon Squeezy portal.",
    "premiumPage.emailLabel": "Purchase email",
    "premiumPage.emailPlaceholder": "you@email.com",
    "premiumPage.manage": "Manage or cancel",
    "privacy.kicker": "Privacy",
    "privacy.title": "Privacy policy",
    "privacy.updated": "Last updated: May 14, 2026.",
    "privacy.intro": "InmoRadar is a browser extension and support website for analyzing property listings. This policy explains what data is used and why.",
    "privacy.h1": "Data the extension may process",
    "privacy.li1": "Visible listing text to detect price, surface, rooms, approximate location and property signals.",
    "privacy.li2": "Usual addresses configured by the user, such as work or school, to prepare daily logistics calculations.",
    "privacy.li3": "Homes saved by the user to show them in a comparison list.",
    "privacy.h2": "Local storage",
    "privacy.local": "Usual addresses and saved homes are stored in chrome.storage.local inside the user's browser. We do not sell personal data or use it for advertising.",
    "privacy.h3": "External services",
    "privacy.external": "InmoRadar may query external map, geocoding, routing or analysis services to calculate approximate locations, transport, travel times or property context.",
    "privacy.h4": "Payments",
    "privacy.payments": "When Premium is activated, payment is handled by an external provider such as Lemon Squeezy or Stripe. InmoRadar does not store full card details.",
    "privacy.contactTitle": "Contact",
    "privacy.contactCopy": "For privacy questions, write to",
    "terms.kicker": "Legal",
    "terms.title": "Terms of use",
    "terms.updated": "Last updated: May 14, 2026.",
    "terms.h1": "Service",
    "terms.service": "InmoRadar helps interpret property listings through automatic estimates and summaries. The service does not replace a valuation, official measurement, legal review or professional advice.",
    "terms.h2": "Estimates",
    "terms.estimates": "Results may contain errors or depend on incomplete listing data. Users should verify price, surface, charges, costs, condition, planning information and any relevant data before making decisions.",
    "terms.h3": "Premium",
    "terms.premium": "InmoRadar may offer 2 days of initial free access by default for every user. That initial access is not a paid Premium trial. Once it ends, the user can continue with Premium for €1.99 per week, with no lock-in, through the configured payment provider.",
    "terms.h4": "Acceptable use",
    "terms.acceptable": "You may not try to disable technical limits, resell the service, automate abusive queries or use InmoRadar to collect portal data against their terms.",
    "terms.h5": "Liability",
    "terms.liability": "InmoRadar is provided as an indicative tool. We do not guarantee continuous availability or absolute accuracy of data or estimates.",
    "terms.contactTitle": "Contact",
    "terms.contactCopy": "For support, write to",
    "success.home": "Back home",
    "success.kicker": "Premium",
    "success.title": "Premium activated",
    "success.copy1": "Thanks for activating InmoRadar Premium. Go back to the extension to keep analyzing homes.",
    "success.copy2": "The subscription syncs through Lemon Squeezy and may take a few seconds to appear as active.",
    "success.cta": "Go to InmoRadar",
    "success.manageLabel": "Manage subscription",
    "success.portal": "Open portal",
    "cancel.viewPremium": "View Premium",
    "cancel.kicker": "Premium",
    "cancel.title": "Payment cancelled",
    "cancel.copy": "No subscription has been activated. You can return to Premium whenever you want.",
    "cancel.cta": "Back to Premium",
    "checkout.preparing": "Preparing secure Lemon Squeezy checkout...",
    "checkout.openingTest": "Opening test checkout...",
    "checkout.opening": "Opening checkout...",
    "checkout.manual": "Email us and we will activate it manually.",
    "portal.opening": "Opening secure Lemon Squeezy portal...",
    "portal.magic": "We are taking you to the Lemon Squeezy portal. If asked, confirm your email with the magic link.",
    "portal.help": "Email us and we will help you cancel.",
    "news.metaFallback": "Real-estate guide",
    "news.archiveCount": "previous posts"
  }
};

let currentLanguage = "es";

function t(key) {
  return I18N[currentLanguage]?.[key] || I18N.es[key] || key;
}

function applyLanguage(language) {
  currentLanguage = language === "en" ? "en" : "es";
  document.documentElement.lang = currentLanguage;
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, currentLanguage);
  } catch {
    // Ignore storage restrictions.
  }

  document.querySelectorAll("[data-i18n]").forEach((node) => {
    const key = node.getAttribute("data-i18n");
    const value = t(key);
    if (value) node.textContent = value;
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    const key = node.getAttribute("data-i18n-placeholder");
    const value = t(key);
    if (value) node.setAttribute("placeholder", value);
  });

  document.querySelectorAll("[data-lang]").forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.lang === currentLanguage ? "true" : "false");
  });
}

function initLanguageSwitcher() {
  let initial = "es";
  try {
    initial = localStorage.getItem(LANGUAGE_STORAGE_KEY) || document.documentElement.lang || "es";
  } catch {
    initial = document.documentElement.lang || "es";
  }
  applyLanguage(initial);

  document.querySelectorAll("[data-lang]").forEach((button) => {
    button.addEventListener("click", () => applyLanguage(button.dataset.lang));
  });
}

function showCheckoutStatus(message) {
  document.querySelectorAll("[data-checkout-status]").forEach((node) => {
    node.textContent = message;
  });
}

function setCheckoutButtonsLoading(isLoading) {
  document.querySelectorAll("[data-checkout-button]").forEach((button) => {
    button.disabled = isLoading;
    button.setAttribute("aria-busy", isLoading ? "true" : "false");
  });
}

function showPortalStatus(message) {
  document.querySelectorAll("[data-portal-status]").forEach((node) => {
    node.textContent = message;
  });
}

function setPortalFormsLoading(isLoading) {
  document.querySelectorAll("[data-portal-form] button").forEach((button) => {
    button.disabled = isLoading;
    button.setAttribute("aria-busy", isLoading ? "true" : "false");
  });
}

async function openCheckout(source) {
  showCheckoutStatus(t("checkout.preparing"));
  setCheckoutButtonsLoading(true);

  try {
    const response = await fetch(CHECKOUT_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ source })
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload.checkout_url) {
      if (payload.error === "lemonsqueezy_not_configured") {
        throw new Error("Falta configurar Lemon Squeezy en Vercel.");
      }
      throw new Error(payload.message || "No se ha podido crear el checkout.");
    }

    showCheckoutStatus(payload.test_mode ? t("checkout.openingTest") : t("checkout.opening"));
    window.location.href = payload.checkout_url;
  } catch (error) {
    showCheckoutStatus(`${error.message} ${t("checkout.manual")}`);
    window.location.href = `mailto:${WAITLIST_EMAIL}?subject=Quiero%20InmoRadar%20Premium&body=Hola,%20quiero%20activar%20InmoRadar%20Premium.`;
  } finally {
    setCheckoutButtonsLoading(false);
  }
}

async function openCustomerPortal(email) {
  showPortalStatus(t("portal.opening"));
  setPortalFormsLoading(true);

  try {
    const response = await fetch(PORTAL_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ email })
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload.portal_url) {
      if (payload.error === "lemonsqueezy_not_configured") {
        throw new Error("Falta configurar Lemon Squeezy en Vercel.");
      }
      throw new Error(payload.message || "No se ha podido abrir el portal.");
    }

    showPortalStatus(t("portal.magic"));
    window.location.href = payload.portal_url;
  } catch (error) {
    showPortalStatus(`${error.message} ${t("portal.help")}`);
    window.location.href = `mailto:${WAITLIST_EMAIL}?subject=Gestionar%20o%20cancelar%20InmoRadar%20Premium&body=Hola,%20quiero%20gestionar%20o%20cancelar%20mi%20suscripci%C3%B3n%20Premium.%0AEmail%20de%20compra:%20${encodeURIComponent(email || "")}`;
  } finally {
    setPortalFormsLoading(false);
  }
}

document.querySelectorAll("[data-checkout-button]").forEach((button) => {
  button.addEventListener("click", () => {
    const source = button.dataset.checkoutSource || "premium_page";
    openCheckout(source);
  });
});

document.querySelectorAll("[data-portal-form]").forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const email = String(data.get("email") || "").trim();
    openCustomerPortal(email);
  });
});

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderNewsItem(item, className) {
  return `
    <article class="${className}">
      <div>
        <span class="news-meta">${escapeHtml(item.meta || t("news.metaFallback"))}</span>
        <h3><a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a></h3>
      </div>
      <p>${escapeHtml(item.description)}</p>
    </article>
  `;
}

function archiveLoopItems(items) {
  const base = [];
  while (base.length < Math.max(items.length, 4)) {
    base.push(...items);
  }
  const visibleLoop = base.slice(0, Math.max(items.length, 4));
  return [...visibleLoop, ...visibleLoop];
}

function renderLatestAndArchiveNews(items) {
  const list = document.querySelector("[data-news-list]");
  const archive = document.querySelector("[data-news-archive]");
  const archiveTrack = document.querySelector("[data-news-track]");
  const archiveCount = document.querySelector("[data-news-archive-count]");
  if (!list || !Array.isArray(items) || !items.length) return;

  const latest = items.slice(0, 5);
  const older = items.slice(5);

  list.innerHTML = latest.map((item) => renderNewsItem(item, "news-item")).join("");

  if (!archive || !archiveTrack) return;
  if (!older.length) {
    archive.hidden = true;
    archiveTrack.innerHTML = "";
    return;
  }

  archive.hidden = false;
  if (archiveCount) {
    archiveCount.textContent = `${older.length} ${t("news.archiveCount")}`;
  }
  archiveTrack.innerHTML = archiveLoopItems(older)
    .map((item) => renderNewsItem(item, "news-archive-item"))
    .join("");
}

async function loadPublishedNews() {
  const list = document.querySelector("[data-news-list]");
  if (!list) return;

  try {
    const response = await fetch("/api/news", {
      headers: { accept: "application/json" },
      cache: "no-store"
    });
    const payload = await response.json();
    if (response.ok && payload.ok) renderLatestAndArchiveNews(payload.news);
  } catch {
    // Si falla la API, se mantiene el contenido editorial estatico.
  }
}

initLanguageSwitcher();
loadPublishedNews();

document.querySelectorAll("[data-year]").forEach((node) => {
  node.textContent = String(new Date().getFullYear());
});
