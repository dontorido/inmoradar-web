const WAITLIST_EMAIL = "hola@inmoradar.app";
const CHECKOUT_ENDPOINT = "/api/lemonsqueezy-checkout";
const PORTAL_ENDPOINT = "/api/lemonsqueezy-portal";
const CONTACT_ENDPOINT = "/api/contact";
const BROWSER_WAITLIST_ENDPOINT = "/api/waitlist/browser";
const OWNED_ANALYTICS_ENDPOINT = "/api/analytics/event";
const OWNED_ANALYTICS_SESSION_KEY = "inmoradar_owned_session_id";
const SEO_ORIGIN_SESSION_KEY = "seo_origin_session_id";
const SEO_LAST_ORIGIN_KEY = "inmoradar_seo_last_origin";
const SEO_ORIGIN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NEWS_ENDPOINT = "/api/news";
const CHROME_WEBSTORE_URL = "https://chromewebstore.google.com/detail/inmoradar/mbkjlkagblkmdnjggoggbjiohbjebaab";
const LANGUAGE_STORAGE_KEY = "inmoradar_language";
const PUBLIC_HOSTS = new Set(["inmoradar.app", "www.inmoradar.app"]);

const BROWSER_LAUNCH_WAITLIST = {
  chrome: {
    id: "chrome",
    name: "Chrome",
    status: "available",
    badge: "Disponible",
    description: "Instalaci\u00f3n autom\u00e1tica disponible en este entorno.",
    storeName: "Flujo compatible",
    storeUrl: CHROME_WEBSTORE_URL,
    label: "Chrome"
  },
  edge: {
    id: "edge",
    name: "Edge",
    status: "available",
    badge: "Compatible Chromium",
    description: "Instalaci\u00f3n autom\u00e1tica disponible en este entorno.",
    storeName: "Flujo compatible",
    storeUrl: CHROME_WEBSTORE_URL,
    label: "Edge"
  },
  firefox: {
    id: "firefox",
    name: "Firefox",
    status: "unsupported",
    badge: "No disponible",
    description: "La instalaci\u00f3n autom\u00e1tica no est\u00e1 disponible en este entorno.",
    storeName: "Firefox Add-ons",
    storeUrl: "",
    label: "Firefox"
  },
  opera: {
    id: "opera",
    name: "Opera",
    status: "unsupported",
    badge: "No disponible",
    description: "La instalaci\u00f3n autom\u00e1tica no est\u00e1 disponible en este entorno.",
    storeName: "Opera Add-ons",
    storeUrl: "",
    label: "Opera"
  },
  vivaldi: {
    id: "vivaldi",
    name: "Vivaldi",
    status: "available",
    badge: "Compatible Chromium",
    description: "Instalaci\u00f3n autom\u00e1tica disponible en este entorno.",
    storeName: "Flujo compatible",
    storeUrl: CHROME_WEBSTORE_URL,
    label: "Vivaldi"
  },
  brave: {
    id: "brave",
    name: "Brave",
    status: "available",
    badge: "Compatible Chromium",
    description: "Instalaci\u00f3n autom\u00e1tica disponible en este entorno.",
    storeName: "Flujo compatible",
    storeUrl: CHROME_WEBSTORE_URL,
    label: "Brave"
  },
  safari: {
    id: "safari",
    name: "Safari",
    status: "unsupported",
    badge: "No disponible",
    description: "La instalaci\u00f3n autom\u00e1tica no est\u00e1 disponible en este entorno.",
    storeName: "Safari Extensions",
    storeUrl: "",
    label: "Safari"
  }
};

let launchWaitlistState = {
  open: false,
  selectedBrowser: "",
  detectedBrowser: "",
  email: "",
  source: "web",
  label: "",
  status: "idle",
  error: "",
  alreadyExists: false,
  opener: null
};
let seoInternalLinkAnalyticsBound = false;
let seoScrollDepthAnalyticsBound = false;

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
    excerpt: "Madrid exige granularidad: barrio, distrito, edificio y comparables pesan más que una media municipal."
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
let remoteArticles = null;

function activeArticles() {
  if (!Array.isArray(remoteArticles) || !remoteArticles.length) return articles;
  const seen = new Set(remoteArticles.map((item) => item.slug));
  return [...remoteArticles, ...articles.filter((item) => !seen.has(item.slug))];
}

function newsTagFromMeta(meta) {
  const value = String(meta || "").toLowerCase();
  if (value.includes("alquiler")) return "Alquiler";
  if (value.includes("precio")) return "Precio m2";
  if (value.includes("analisis") || value.includes("analisis")) return "Analisis";
  if (value.includes("guia") || value.includes("guia")) return "Guias";
  return meta || "Guias";
}

function normalizeRemoteArticle(item) {
  const slug = String(item?.slug || "").replace(/^\/+|\/+$/g, "");
  return {
    slug,
    url: item?.url || `/${slug}/`,
    tag: newsTagFromMeta(item?.meta || item?.template_type),
    city: item?.city || "España",
    title: item?.title || slug,
    excerpt: item?.description || "Guía InmoRadar para analizar anuncios inmobiliarios antes de contactar."
  };
}

async function loadRemoteArticles() {
  const grids = document.querySelectorAll("[data-articles-grid]");
  const articlePage = document.querySelector("[data-article-page]");
  if (!grids.length && !articlePage) return;
  try {
    const response = await fetch(NEWS_ENDPOINT, { headers: { accept: "application/json" } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(payload.news) || !payload.news.length) return;
    remoteArticles = payload.news.map(normalizeRemoteArticle).filter((item) => item.slug && item.title);
    renderArticles();
    renderArticlePage();
  } catch {
    // Static article cards remain available if the dynamic news feed is offline.
  }
}
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
    checkoutManual: "Escríbenos y lo activamos manualmente.",
    checkoutSetupIssue: "El pago online aún no está activo. Escríbenos a hola@inmoradar.app y te lo activamos manualmente.",
    portalOpening: "Enviando enlace seguro...",
    portalVerifying: "Verificando enlace seguro...",
    portalLinkSent: "Revisa tu email. Te hemos enviado un enlace temporal.",
    portalHelp: "No hemos podido preparar el acceso. Escríbenos y te ayudamos.",
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
    checkoutSetupIssue: "Online payment is not active yet. Email us at hola@inmoradar.app and we will activate it manually.",
    portalOpening: "Sending secure link...",
    portalVerifying: "Verifying secure link...",
    portalLinkSent: "Check your email. We sent you a temporary link.",
    portalHelp: "We could not prepare access. Email us and we will help.",
    all: "All",
    read: "4 min read",
    updated: "Updated May 2026"
  }
};

const ARTICLE_TRANSLATIONS = {
  en: {
    "precio-alquiler-zaragoza": {
      tag: "Rent",
      title: "Rent price per square metre in Zaragoza",
      excerpt: "How to read a monthly rent with local reference data, floor area and real cost before messaging the advertiser."
    },
    "precio-alquiler-granada": {
      tag: "Rent",
      title: "Rent price per square metre in Granada",
      excerpt: "A guide to tell a reasonable rent from a premium that is hard to justify by location or condition."
    },
    "saber-piso-caro-granada": {
      tag: "Analysis",
      title: "How to know if a flat is overpriced in Granada",
      excerpt: "Price, likely renovation, transport and parking: four layers so you do not decide on intuition alone."
    },
    "precio-metro-cuadrado-madrid": {
      tag: "Price per m2",
      title: "Price per square metre in Madrid",
      excerpt: "Madrid requires granularity: neighbourhood, district, building and comparable listings matter more than a municipal average."
    },
    "precio-metro-cuadrado-barcelona": {
      tag: "Price per m2",
      title: "Price per square metre in Barcelona",
      excerpt: "A reading of prices by area and urban signals to understand when a premium can make sense."
    },
    "precio-metro-cuadrado-valencia": {
      tag: "Price per m2",
      title: "Price per square metre in Valencia",
      excerpt: "How to combine price, neighbourhood, transport and visible condition to prioritise visits."
    },
    "precio-metro-cuadrado-malaga": {
      tag: "Price per m2",
      title: "Price per square metre in Malaga",
      excerpt: "A tight market, location and renovation risk: what to check before booking a viewing."
    },
    "precio-metro-cuadrado-salamanca": {
      tag: "Price per m2",
      title: "Price per square metre in Salamanca",
      excerpt: "Useful references for buyers who want to compare listings without losing weeks."
    },
    "precio-metro-cuadrado-logrono": {
      tag: "Price per m2",
      title: "Price per square metre in Logrono",
      excerpt: "A simple method to read prices and avoid conclusions that are too quick."
    }
  }
};

const TEXT_TRANSLATIONS_EN = {
  "Principal": "Main",
  "Secciones": "Sections",
  "Idioma": "Language",
  "Abrir menú": "Open menu",
  "Área de clientes": "Customer area",
  "Área de clientes": "Customer area",
  "Qué analiza": "What it checks",
  "Noticias": "News",
  "Contacto": "Contact",
  "Producto": "Product",
  "Contenido": "Content",
  "Compañía": "Company",
  "Compañía": "Company",
  "Privacidad": "Privacy",
  "Términos": "Terms",
  "Términos": "Terms",
  "Empezar gratis": "Start free",
  "Instalar InmoRadar": "Install InmoRadar",
  'Instalar extensión': 'Install extension',
  "Ver condiciones de Premium": "See Premium terms",
  'Instala la extensión en tu navegador y analiza tu primer anuncio.': 'Install the extension in your browser and analyze your first listing.',
  'Solicitar soporte': 'Request support',
  "Analiza tu primer anuncio gratis": "Analyze your first listing free",
  "Disponible para navegadores compatibles": "Available for compatible browsers",
  "Analizar un anuncio": "Analyze a listing",
  "Empezar gratis": "Start free",
  "Iniciar instalación": "Start installation",
  "Ser de los primeros en probar InmoRadar": "Be among the first to try InmoRadar",
  "Ver Premium": "See Premium",
  "Volver al inicio": "Back home",
  "Online": "Online",
  "Navegadores modernos": "Modern browsers",
  "Copiloto inmobiliario para navegadores modernos.": "Analyze listings before contacting.",
  "Copiloto inmobiliario para tu navegador · Idealista, Fotocasa, Pisos.com y Habitaclia": "Real-estate listing analysis · Idealista, Fotocasa, Pisos.com and Habitaclia",
  "Descubre lo que el anuncio no te cuenta.": "Discover what the listing does not tell you.",
  "InmoRadar añade una capa de análisis sobre Idealista, Fotocasa, Pisos.com y Habitaclia para mostrarte precio real, coste inicial, zona, transporte, aparcamiento y señales clave en segundos.": "InmoRadar adds an analysis layer on top of Idealista, Fotocasa, Pisos.com and Habitaclia to help you understand price, initial cost, area, transport, parking and key signals in seconds.",
  "Analizar mi primer anuncio gratis": "Analyse my first listing for free",
  "Ver qué analiza": "See what it checks",
  "Pulsa Empezar gratis para iniciar la instalación compatible.": "Click Start free to begin the compatible installation.",
  "Precio": "Price",
  "acceso inicial sin pagar": "reference comparison",
  "Señales antes de contactar": "signals before contacting",
  "índice de valoración": "rating index",
  "Vista previa · InmoRadar": "Preview · InmoRadar",
  "Calle Goya · Madrid": "Goya Street · Madrid",
  "Piso · 78 m²": "Flat · 78 m²",
  "Oportunidad": "Opportunity",
  "Precio": "Price",
  "media 4.080": "average 4,080",
  "Entrada est.": "Est. deposit",
  "Distancia M.": "Metro distance",
  "Linea 2": "Line 2",
  "Indice InmoRadar": "InmoRadar Index",
  "Ascensor": "Lift",
  "Exterior": "Exterior",
  "Sin reforma": "No renovation",
  "ZBR baja": "Low ZBE risk",
  "Aparc. medio": "Medium parking",
  "Señal detectada": "Signal detected",
  "Precio 7% bajo la media de la zona en los últimos 90 días.": "Price 7% below the area average over the last 90 days.",
  "Busca donde ya buscas": "Search where you already search",
  "No sustituye a tus portales.": "It does not replace your portals.",
  "Los hace más claros.": "It makes them clearer.",
  "Sigues buscando en Idealista, Fotocasa, Pisos.com y Habitaclia. InmoRadar trabaja encima de esas páginas para ordenar la información, detectar señales útiles y ayudarte a priorizar qué anuncios merecen una visita.": "You keep searching on Idealista, Fotocasa, Pisos.com and Habitaclia. InmoRadar works on top of those pages to organise the information, detect useful signals and help you prioritise which listings deserve a viewing.",
  "Portales compatibles": "Compatible portals",
  "Extensión multi-navegador": "Installation",
  "Funciona en tu": "Works in your",
  "navegador favorito.": "favourite browser.",
  "InmoRadar se está preparando como extensión para navegadores modernos. Mostramos el estado real de cada navegador para que sepas cómo instalarlo hoy.": "Click Start free to begin the compatible installation flow.",
  "InmoRadar detecta el entorno compatible e inicia el flujo de instalación correspondiente.": "InmoRadar detects the compatible environment and starts the corresponding installation flow.",
  "Instalación principal para usuarios de Chromium.": "Main installation for compatible environments.",
  "Instalación automática cuando el navegador es compatible.": "Automatic installation when the browser is compatible.",
  "Disponible": "Available",
  "Funciona sobre la base Chromium de Microsoft Edge.": "Works on Microsoft Edge's Chromium base.",
  "Compatible con la base Chromium de Microsoft Edge.": "Compatible with Microsoft Edge's Chromium base.",
  "Compatible": "Compatible",
  "Versión adaptada para el ecosistema Mozilla.": "Adapted version for the Mozilla ecosystem.",
  "Beta": "Beta",
  "Compatible mediante instalación de extensiones Chromium.": "Compatible via Chromium extension installation.",
  "Compatible mediante extensiones Chromium cuando esté disponible.": "Compatible via Chromium extensions when available.",
  "Instalación manual": "Manual install",
  "Próximamente": "Coming soon",
  "Preparado para usuarios avanzados de Chromium.": "Prepared for advanced Chromium users.",
  "Instalación compatible automática.": "Automatic compatible installation.",
  "Compatible con extensiones Chromium y foco en privacidad.": "Compatible with Chromium extensions and privacy-focused browsing.",
  "InmoRadar detecta el entorno compatible y continúa con el flujo disponible.": "InmoRadar detects the compatible environment and continues with the available flow.",
  "Coste real": "Real cost",
  "Entorno urbano": "Urban context",
  "Comparativa": "Comparison",
  "Logística diaria": "Daily logistics",
  "Datos abiertos": "Open data",
  "Ejemplo real": "Real example",
  "Precio, zona y coste real": "Price, area and real cost",
  "en una sola vista.": "in one view.",
  "Una ficha para decidir si merece la pena contactar, guardar o descartar antes de invertir tiempo.": "One card to decide whether to contact, save or discard before spending time.",
  "Lo que": "What you",
  "de verdad": "really",
  "vas a pagar.": "will pay.",
  "€/m²": "€/m²",
  "Entrada": "Deposit",
  "Cuota": "Mortgage",
  "Comunidad": "Fees",
  "Lo que el anuncio": "What the listing",
  "nunca te cuenta.": "never tells you.",
  "Ruido nocturno": "Night noise",
  "Bajo": "Low",
  "Aparcamiento": "Parking",
  "Medio · ZBR no": "Medium · no ZBE",
  "Metro/Bus": "Metro/Bus",
  "240 m · 4 lineas": "240 m · 4 lines",
  "Guarda. Compara. Decide.": "Save. Compare. Decide.",
  "Inmueble": "Property",
  "Metros": "Area",
  "Lectura": "Reading",
  "Equilibrado": "Balanced",
  "Caro": "Expensive",
  "Datos enriquecidos": "Enriched data",
  "APIs propias": "Own APIs",
  "para señales urbanas.": "for urban signals.",
  "Precio de mercado, datos de edificio, logística diaria y aparcamiento con fuentes, confianza y caveats.": "Market price, building data, daily logistics and parking with sources, confidence and caveats.",
  "Referencia por operación y nivel geográfico.": "Reference by transaction type and geographic level.",
  "Cobertura": "Coverage",
  "España": "Spain",
  "Granularidad": "Granularity",
  "Barrio": "Neighbourhood",
  "Semanal": "Weekly",
  "Contexto público de dirección y edificio.": "Public context for address and building.",
  "Fuentes": "Sources",
  "Campos": "Fields",
  "señales": "signals",
  "Tiempo": "Time",
  "Trayectos a destinos habituales.": "Routes to usual destinations.",
  "Modos": "Modes",
  "Coche·Bus·Pie": "Car·Bus·Walk",
  "Picos": "Peaks",
  "Hora punta": "Rush hour",
  "Cálculo": "Calculation",
  "Multi-origen": "Multi-origin",
  "Documentación técnica": "Technical documentation",
  "Criterio en menos tiempo": "Judgement in less time",
  "Sin InmoRadar": "Without InmoRadar",
  "vs Con InmoRadar.": "vs With InmoRadar.",
  "La diferencia no es hacer magia. Es reducir pestañas, cálculos sueltos y dudas repetidas para decidir mejor qué anuncios merecen atención.": "The difference is not magic. It is reducing tabs, loose calculations and repeated doubts so you can decide better which listings deserve attention.",
  "Mucho dato disperso.": "Too much scattered data.",
  "Saltas entre el anuncio, mapas, calculadora, comparadores y notas.": "You jump between the listing, maps, calculator, comparables and notes.",
  "El precio por metro cuadrado se calcula tarde o no se calcula.": "Price per square metre is calculated late or not calculated at all.",
  "Comparar visitas depende de memoria, capturas o una hoja manual.": "Comparing visits depends on memory, screenshots or a manual spreadsheet.",
  "Es fácil dedicar tiempo a anuncios que no encajan.": "It is easy to spend time on listings that do not fit.",
  "Con InmoRadar": "With InmoRadar",
  "Una lectura accionable.": "An actionable reading.",
  "Precio real, coste inicial, zona y señales clave en la misma ficha.": "Real price, initial cost, area and key signals in the same card.",
  "Comparas el anuncio con referencias de mercado y contexto urbano.": "You compare the listing with market references and urban context.",
  "Guardas inmuebles y los ordenas por criterio, no por intuición.": "You save homes and rank them by criteria, not intuition.",
  "Priorizar visitas se vuelve más rápido y menos improvisado.": "Prioritising viewings becomes faster and less improvised.",
  "Transparencia": "Transparency",
  "No es una tasación.": "It is not a valuation.",
  "Es una capa de criterio.": "It is a layer of judgement.",
  "InmoRadar ofrece estimaciones orientativas basadas en datos visibles del anuncio, fuentes públicas y señales urbanas. Sirve para entender mejor una vivienda antes de contactar, no para sustituir una tasación profesional ni garantizar una decisión económica.": "InmoRadar provides indicative estimates based on visible listing data, public sources and urban signals. It helps you understand a home better before contacting, not replace a professional valuation or guarantee a financial decision.",
  "Para búsquedas intensivas": "For active searches",
  "Más contexto para": "More context for",
  "tu búsqueda activa.": "your active search.",
  "El checkout mostrará las condiciones vigentes antes de confirmar Premium.": "Checkout will show the current terms before confirming Premium.",
  "Opcional": "Optional",
  "según checkout": "according to checkout",
  "Condiciones visibles antes de confirmar el pago.": "Terms visible before confirming payment.",
  "Análisis ampliados de fichas.": "Expanded listing analyses.",
  "Gestión de la suscripción desde el área de clientes.": "Subscription management from the customer area.",
  "Análisis ilimitados de fichas.": "Unlimited listing analyses.",
  "Comparativa de inmuebles guardados.": "Comparison of saved homes.",
  "Señales urbanas y precio por zona.": "Urban signals and area price.",
  "Cancelación inmediata, sin permanencia.": "Immediate cancellation, no commitment.",
  "Guías para leer": "Guides to read",
  "mejor el mercado.": "the market better.",
  "Artículos sobre precio por metro cuadrado, alquiler y metodología de análisis.": "Articles about price per square metre, rent and analysis methodology.",
  "Preguntas frecuentes": "Frequently asked questions",
  "Lo que la gente": "What people",
  "siempre pregunta.": "always ask.",
  "¿Cómo instalo InmoRadar?": "How do I install InmoRadar?",
  "Pulsa Empezar gratis y se iniciará el flujo de instalación compatible con tu navegador. Después podrás analizar anuncios directamente donde ya buscas.": "Click Start free and the compatible installation flow will begin. Then you can analyze listings directly where you already search.",
  "¿InmoRadar mide datos exactos?": "Does InmoRadar measure exact data?",
  "No. Son estimaciones orientativas basadas en datos abiertos, información visible del anuncio y señales urbanas.": "No. They are indicative estimates based on open data, visible listing information and urban signals.",
  "¿Funciona con cualquier portal?": "Does it work with any portal?",
  "Compatible con Idealista, Fotocasa, Pisos.com y Habitaclia. Iremos sumando otros portales en próximas versiones.": "Compatible with Idealista, Fotocasa, Pisos.com and Habitaclia. We will add more portals in upcoming versions.",
  "¿Dónde se guardan mis inmuebles?": "Where are my saved homes stored?",
  "Localmente en el navegador salvo que actives funciones que requieran servicios externos.": "Locally in your browser unless you enable features that require external services.",
  "¿Tengo que elegir navegador?": "Do I have to choose a browser?",
  "No. El sistema detecta el entorno compatible e inicia el flujo de instalación correspondiente.": "No. The system detects the compatible environment and starts the corresponding installation flow.",
  "¿Qué pasa con Premium?": "What about Premium?",
  "Premium es opcional. Si abres el checkout, verás las condiciones vigentes antes de confirmar cualquier pago.": "Premium is optional. If you open checkout, you will see the current terms before confirming any payment.",
  "Cuéntanos qué te": "Tell us what",
  "trae por aquí.": "brings you here.",
  "Soporte, prensa, partners o feedback de producto. Leemos todo desde hola@inmoradar.app.": "Support, press, partners or product feedback. We read everything at hola@inmoradar.app.",
  "Madrid · operamos 100% remoto": "Madrid · we operate 100% remotely",
  "Nombre": "Name",
  "Email": "Email",
  "Tema": "Topic",
  "General": "General",
  "Partner": "Partner",
  "Prensa": "Press",
  "Mensaje": "Message",
  "Enviar mensaje": "Send message",
  "Tu próximo anuncio puede estar mejor explicado.": "Your next listing can be better explained.",
  "Prueba InmoRadar sobre los portales donde ya buscas y decide con más contexto antes de contactar.": "Try InmoRadar on the portals where you already search and decide with more context before contacting.",
  "Redes sociales InmoRadar": "InmoRadar social profiles",
  "Instagram de InmoRadar": "InmoRadar on Instagram",
  "TikTok de InmoRadar": "InmoRadar on TikTok"
};

const PAGE_META_TRANSLATIONS_EN = {
  "/": {
    title: "InmoRadar · Real-estate copilot for your browser",
    description: "InmoRadar adds analysis on top of Idealista, Fotocasa, Pisos.com and Habitaclia: real price, initial cost, area, transport, parking and key signals."
  },
  "/index.html": {
    title: "InmoRadar · Real-estate copilot for your browser",
    description: "InmoRadar adds analysis on top of Idealista, Fotocasa, Pisos.com and Habitaclia: real price, initial cost, area, transport, parking and key signals."
  }
};

let currentLanguage = "es";
const originalTextNodes = new WeakMap();
const originalAttributes = new WeakMap();
const originalMeta = {};

function t(key) {
  return I18N[currentLanguage]?.[key] || I18N.es[key] || key;
}

function isPublicProductionHost() {
  return PUBLIC_HOSTS.has(location.hostname);
}

function icon(name) {
  const paths = {
    Radar: '<circle cx="12" cy="12" r="5.2"/><circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none"/><path d="M12 12l3.2-3.6M12 4.5v1.6M12 17.9v1.6M4.5 12h1.6M17.9 12h1.6M8.9 8.9l1.1 1.1M15.1 15.1 14 14"/>',
    ArrowRight: '<path d="M5 12h14M13 5l7 7-7 7"/>',
    ArrowUpRight: '<path d="M7 17 17 7M8 7h9v9"/>',
    Mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    MapPin: '<path d="M12 21s7-5 7-12a7 7 0 1 0-14 0c0 7 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    Send: '<path d="M22 2 11 13"/><path d="m22 2-7 20-4-9-9-4z"/>',
    Clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    Calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/>',
    Check: '<path d="m20 6-11 11-5-5"/>'
  };
  return `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.Radar}</svg>`;
}

function socialIcon(name) {
  const icons = {
    instagram:
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="3" width="18" height="18" rx="5"></rect><circle cx="12" cy="12" r="4"></circle><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none"></circle></svg>',
    tiktok:
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14 3v10.2a4.8 4.8 0 1 1-4.8-4.8c.5 0 1 .08 1.4.22v3.05a2 2 0 1 0 1.36 1.9V3h2.04c.42 2.45 1.92 4.16 4.5 4.48v3.08A7.2 7.2 0 0 1 14 8.92"></path></svg>'
  };
  return icons[name] || icons.instagram;
}

function footerSocialHtml() {
  return `
    <div class="footer-social-row">
      <nav class="footer-social" aria-label="Redes sociales InmoRadar" data-footer-social>
        <a href="https://www.instagram.com/inmoradares/" target="_blank" rel="noopener noreferrer" aria-label="Instagram de InmoRadar" data-testid="footer-social-instagram">
          ${socialIcon("instagram")}
          <span>Instagram</span>
        </a>
        <a href="https://www.tiktok.com/@inmoradar" target="_blank" rel="noopener noreferrer" aria-label="TikTok de InmoRadar" data-testid="footer-social-tiktok">
          ${socialIcon("tiktok")}
          <span>TikTok</span>
        </a>
      </nav>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizedText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function translatedText(value) {
  return TEXT_TRANSLATIONS_EN[normalizedText(value)] || "";
}

function replaceTextPreservingSpace(node, nextText) {
  const current = String(node.data || "");
  const leading = current.match(/^\s*/)?.[0] || "";
  const trailing = current.match(/\s*$/)?.[0] || "";
  node.data = `${leading}${nextText}${trailing}`;
}

function translateTextNodes(language) {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || parent.closest("script, style, svg, [data-no-translate]")) return NodeFilter.FILTER_REJECT;
      return normalizedText(node.data) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    if (!originalTextNodes.has(node)) originalTextNodes.set(node, node.data);
    const original = originalTextNodes.get(node);
    if (language === "es") {
      node.data = original;
      return;
    }
    const value = translatedText(original);
    if (value) replaceTextPreservingSpace(node, value);
  });
}

function translateAttributes(language) {
  document.querySelectorAll("[aria-label], [title], [placeholder], [content]").forEach((node) => {
    ["aria-label", "title", "placeholder", "content"].forEach((attr) => {
      if (!node.hasAttribute(attr)) return;
      if (!originalAttributes.has(node)) originalAttributes.set(node, {});
      const originals = originalAttributes.get(node);
      if (!(attr in originals)) originals[attr] = node.getAttribute(attr);
      if (language === "es") {
        node.setAttribute(attr, originals[attr]);
        return;
      }
      const value = translatedText(originals[attr]);
      if (value) node.setAttribute(attr, value);
    });
  });
}

function translatePageMeta(language) {
  if (!originalMeta.title) originalMeta.title = document.title;
  if (!originalMeta.description) {
    originalMeta.description = document.querySelector('meta[name="description"]')?.getAttribute("content") || "";
  }
  const path = location.pathname || "/";
  const meta = PAGE_META_TRANSLATIONS_EN[path];
  document.title = language === "en" && meta?.title ? meta.title : originalMeta.title;
  const description = document.querySelector('meta[name="description"]');
  if (description) {
    description.setAttribute("content", language === "en" && meta?.description ? meta.description : originalMeta.description);
  }
}

function translateStaticContent(language) {
  translateTextNodes(language);
  translateAttributes(language);
  translatePageMeta(language);
}

function localizedArticle(item) {
  return currentLanguage === "en" ? { ...item, ...(ARTICLE_TRANSLATIONS.en[item.slug] || {}) } : item;
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
  translateStaticContent(currentLanguage);
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
    const availableArticles = activeArticles();
    const limit = Number(grid.dataset.limit || availableArticles.length);
    const filter = grid.dataset.activeFilter || "Todos";
    const items = availableArticles
      .filter((item) => filter === "Todos" || item.tag === filter)
      .slice(0, limit);
    grid.innerHTML = items.map((item, index) => articleCard(localizedArticle(item), index === 0 && grid.dataset.largeFirst === "true")).join("");
  });
}
function articleCard(item, large = false) {
  return `
    <a class="article-card ${large ? "large" : ""}" href="${escapeHtml(item.url || `/noticias/${item.slug}`)}" data-testid="article-card-${escapeHtml(item.slug)}">
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
  const availableArticles = activeArticles();
  const article = localizedArticle(availableArticles.find((item) => item.slug === slug) || articles[0]);
  const related = availableArticles.filter((item) => item.slug !== article.slug).slice(0, 3).map(localizedArticle);
  target.innerHTML = `
    <section class="page-header grid-bg">
      <div class="container article-layout">
        <a class="button ghost" href="/noticias">${currentLanguage === "en" ? "All posts" : "Todas las publicaciones"}</a>
        <p class="pill" style="margin-top:28px"><span class="dot-radar"></span>${escapeHtml(article.tag)} · ${escapeHtml(article.city)}</p>
        <h1>${escapeHtml(article.title)}</h1>
        <p class="lead">${escapeHtml(article.excerpt)}</p>
        <div class="article-meta" style="margin-top:24px"><span>${icon("Clock")} ${t("read")}</span><span>${icon("Calendar")} ${t("updated")}</span></div>
      </div>
    </section>
    <section class="section">
      <article class="container article-layout article-body">
        <p class="article-summary">${escapeHtml(article.excerpt)} ${currentLanguage === "en" ? "The key is not to look only at the total price: the reading improves when you combine euros per square metre, neighbourhood, condition, transport and parking." : "La clave es no mirar solo el precio total: la lectura mejora al cruzar euros por metro, barrio, estado, transporte y aparcamiento."}</p>
        <h2>${currentLanguage === "en" ? "Quick summary" : "Resumen rápido"}</h2>
        <p>${currentLanguage === "en" ? "A listing can look attractive by total price and still be above market if the floor area, exact location or building condition do not support it. InmoRadar organises those signals so you can decide whether it deserves a call." : "Un anuncio puede parecer atractivo por precio absoluto y seguir estando por encima de mercado si la superficie, la ubicación concreta o el estado del edificio no acompañan. InmoRadar ordena esas señales para que decidas si merece una llamada."}</p>
        <h2>${currentLanguage === "en" ? "Methodology" : "Metodología"}</h2>
        <ol class="number-list">
          <li><span>01</span><p>${currentLanguage === "en" ? "We calculate the listing price per square metre and compare it with available aggregated references." : "Calculamos el precio por metro cuadrado del anuncio y lo comparamos con referencias agregadas disponibles."}</p></li>
          <li><span>02</span><p>${currentLanguage === "en" ? "We show the geographic level used: area, district, municipality or province. We never present it as an exact street price." : "Mostramos el nivel geográfico usado: zona, distrito, municipio o provincia. Nunca lo presentamos como precio exacto de calle."}</p></li>
          <li><span>03</span><p>${currentLanguage === "en" ? "We combine initial cost, indicative financing, transport and parking to avoid an incomplete reading." : "Cruzamos coste inicial, financiación orientativa, transporte y aparcamiento para evitar una lectura incompleta."}</p></li>
          <li><span>04</span><p>${currentLanguage === "en" ? "We add caveats when confidence is low or the listing lacks data." : "Añadimos caveats cuando la confianza baja o faltan datos del anuncio."}</p></li>
        </ol>
        <h2>${currentLanguage === "en" ? "How to use it with InmoRadar" : "Cómo usarlo con InmoRadar"}</h2>
        <p>${currentLanguage === "en" ? "Open a compatible listing, review the price and area card, save the strongest candidates and compare homes before contacting. The extension does not replace a valuation or a viewing, but it helps you filter better." : "Abre un anuncio compatible, revisa la ficha de precio y zona, guarda los candidatos fuertes y compara los inmuebles antes de contactar. La extensión no sustituye una tasación ni una visita, pero ayuda a filtrar mejor."}</p>
        <div class="callout"><strong>Tip InmoRadar</strong><p>${currentLanguage === "en" ? "If a home is expensive and the building has no lift, parking is difficult or visual renovation looks likely, ask for more information before moving forward." : "Si una vivienda sale cara y además la finca no tiene ascensor, el parking es difícil o la reforma visual parece probable, pide más información antes de avanzar."}</p></div>
        <div class="article-conversion-cta">
          <strong>${currentLanguage === "en" ? "Analyze your next listing free" : "Analiza tu próximo anuncio gratis"}</strong>
          <p>${currentLanguage === "en" ? "Install InmoRadar in your compatible browser and check price, area and key signals before contacting." : "Instala InmoRadar en tu navegador compatible y revisa precio, zona y señales clave antes de contactar."}</p>
          <button class="button" type="button" data-install-button data-install-source="article_end">${currentLanguage === "en" ? "Analyze your next listing free" : "Analiza tu próximo anuncio gratis"} ${icon("ArrowRight")}</button>
        </div>
      </article>
      <div class="container">
        <div class="article-grid">${related.map((item) => articleCard(item)).join("")}</div>
      </div>
    </section>
  `;
  bindInstallButtons(target);
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

function detectLaunchBrowser() {
  const ua = navigator.userAgent || "";
  if (ua.includes("Edg/")) return "edge";
  if (ua.includes("OPR/") || /Opera/i.test(ua)) return "opera";
  if (ua.includes("Firefox/")) return "firefox";
  if (/Vivaldi/i.test(ua)) return "vivaldi";
  if (navigator.brave) return "brave";
  if (ua.includes("Safari/") && !ua.includes("Chrome/") && !ua.includes("Chromium/") && !ua.includes("Edg/") && !ua.includes("OPR/")) return "safari";
  if ((ua.includes("Chrome/") || ua.includes("Chromium/")) && !ua.includes("OPR/") && !ua.includes("Edg/")) return "chrome";
  return "unknown";
}

function emailDomain(email) {
  const parts = String(email || "").toLowerCase().split("@");
  return parts.length === 2 ? parts[1].slice(0, 120) : "";
}

function launchWaitlistAnalytics(eventName, props = {}) {
  const safeProps = {
    ...props,
    pagePath: location.pathname || "/"
  };
  delete safeProps.email;
  if (safeProps.emailDomain === undefined && props.email) safeProps.emailDomain = emailDomain(props.email);
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event: eventName, ...safeProps });
  if (typeof window.gtag === "function") {
    window.gtag("event", eventName, safeProps);
  }
}

function ownedAnalyticsSessionId() {
  try {
    const current = localStorage.getItem(OWNED_ANALYTICS_SESSION_KEY);
    if (current) return current;
    const next = window.crypto?.randomUUID?.() || `anon_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(OWNED_ANALYTICS_SESSION_KEY, next);
    return next;
  } catch (error) {
    return "anon_unavailable";
  }
}

function deviceType() {
  const width = window.innerWidth || document.documentElement.clientWidth || 0;
  if (width && width < 768) return "mobile";
  if (width && width < 1100) return "tablet";
  return "desktop";
}

function utmPayload() {
  const params = new URLSearchParams(location.search || "");
  return {
    source: params.get("utm_source") || "",
    medium: params.get("utm_medium") || "",
    campaign: params.get("utm_campaign") || "",
    term: params.get("utm_term") || "",
    content: params.get("utm_content") || ""
  };
}

function pageContextFromDom() {
  const main = document.querySelector("[data-owned-analytics], [data-article-page], .seo-reading, main");
  const path = location.pathname || "/";
  const slug = (main?.dataset?.slug || path.replace(/^\/+|\/+$/g, "")).slice(0, 180);
  const template = main?.dataset?.template || document.querySelector(".seo-reading")?.dataset?.template || "";
  const isGuide = path.startsWith("/guias/");
  const isArticle = path.startsWith("/noticias/");
  const isSeo = Boolean(template || isGuide || path.startsWith("/precio-") || path.startsWith("/saber-si-"));
  return {
    page_path: path,
    page_url: location.href.split("#")[0],
    page_type: isSeo ? "seo" : isArticle ? "article" : "public",
    content_type: main?.dataset?.contentType || (isGuide ? "guide" : isArticle ? "article" : isSeo ? "landing" : "page"),
    template_type: main?.dataset?.templateType || template || (isGuide ? "editorial_guide" : ""),
    slug,
    city: main?.dataset?.city || "",
    topic: main?.dataset?.topic || document.title.split("|")[0].trim().slice(0, 160),
    referrer: document.referrer || "",
    utm: utmPayload(),
    browser: detectLaunchBrowser(),
    device_type: deviceType()
  };
}

function stripAnalyticsPersonalData(payload = {}) {
  const copy = { ...payload };
  delete copy.email;
  delete copy.name;
  delete copy.phone;
  if (copy.metadata && typeof copy.metadata === "object") {
    const metadata = { ...copy.metadata };
    Object.keys(metadata).forEach((key) => {
      if (/email|mail|name|phone|token|secret|password|card/i.test(key)) delete metadata[key];
    });
    copy.metadata = metadata;
  }
  return copy;
}

function pushExternalAnalytics(eventName, props = {}) {
  launchWaitlistAnalytics(eventName, props);
}

function trackOwnedEvent(eventName, props = {}) {
  const payload = stripAnalyticsPersonalData({
    ...pageContextFromDom(),
    ...props,
    event_name: eventName,
    anonymous_session_id: ownedAnalyticsSessionId(),
    metadata: {
      ...(props.metadata || {})
    }
  });
  const body = JSON.stringify(payload);
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(OWNED_ANALYTICS_ENDPOINT, blob);
      return;
    }
  } catch (error) {
    // Continue with fetch fallback.
  }
  fetch(OWNED_ANALYTICS_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true
  }).catch(() => {});
}

function installCtaEventName(source = "") {
  const value = String(source || "");
  if (value.includes("editorial") || value.includes("guide")) return "guide_cta_click";
  if (value.includes("article") || value.includes("noticias")) return "article_cta_click";
  if (value.includes("seo_")) return "seo_cta_click";
  return "install_click";
}
function analyticsErrorCode(value) {
  return String(value || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9_:-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "unknown";
}

function trackConversionEvent(eventName, props = {}) {
  pushExternalAnalytics(eventName, props);
  trackOwnedEvent(eventName, props);
}

function analyticsToken(value = "", fallback = "unknown", maxLength = 80) {
  const token = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:/-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, maxLength);
  return token || fallback;
}

function isSeoAnalyticsContext(context = pageContextFromDom()) {
  const path = context.page_path || location.pathname || "/";
  return (
    context.page_type === "seo" ||
    context.page_type === "article" ||
    path.startsWith("/precio-") ||
    path.startsWith("/saber-si-") ||
    path.startsWith("/guias/") ||
    path.startsWith("/noticias")
  );
}

function seoOriginFromContext(context = pageContextFromDom(), reason = "page_view") {
  return {
    seo_origin_session_id: ownedAnalyticsSessionId(),
    page_path: context.page_path || location.pathname || "/",
    slug: context.slug || "",
    template_type: context.template_type || "",
    city: context.city || "",
    topic: context.topic || "",
    source_event: reason,
    saved_at: new Date().toISOString()
  };
}

function rememberSeoOrigin(reason = "page_view") {
  const context = pageContextFromDom();
  if (!isSeoAnalyticsContext(context)) return null;
  const origin = seoOriginFromContext(context, reason);
  try {
    localStorage.setItem(SEO_ORIGIN_SESSION_KEY, origin.seo_origin_session_id);
    localStorage.setItem(SEO_LAST_ORIGIN_KEY, JSON.stringify(origin));
  } catch (error) {
    return origin;
  }
  return origin;
}

function clearSeoOrigin() {
  try {
    localStorage.removeItem(SEO_ORIGIN_SESSION_KEY);
    localStorage.removeItem(SEO_LAST_ORIGIN_KEY);
  } catch (error) {
    // Storage can be unavailable in private or restricted contexts.
  }
}

function readSeoOrigin() {
  let origin = null;
  try {
    const raw = localStorage.getItem(SEO_LAST_ORIGIN_KEY);
    origin = raw ? JSON.parse(raw) : null;
  } catch (error) {
    clearSeoOrigin();
    return null;
  }
  if (!origin) return null;
  const savedAt = Date.parse(origin.saved_at || "");
  if (!Number.isFinite(savedAt) || Date.now() - savedAt > SEO_ORIGIN_TTL_MS) {
    clearSeoOrigin();
    return null;
  }
  return origin;
}

function seoOriginMetadata(origin = null) {
  const value = origin || rememberSeoOrigin("conversion_intent") || readSeoOrigin();
  if (!value) return {};
  return {
    seo_origin_session_id: value.seo_origin_session_id || "",
    seo_origin_page_path: value.page_path || "",
    seo_origin_slug: value.slug || "",
    seo_origin_template_type: value.template_type || "",
    seo_origin_city: value.city || "",
    seo_origin_source_event: value.source_event || ""
  };
}

function calculatorTypeFor(calculator) {
  const context = pageContextFromDom();
  return analyticsToken(calculator.dataset.calculatorType || context.template_type || "seo_calculator", "seo_calculator", 80);
}

function calculatorState(calculator) {
  const price = calculator.querySelector("[data-seo-calc-price]");
  const area = calculator.querySelector("[data-seo-calc-area]");
  const reference = Number(calculator.dataset.saleReference || 0);
  const total = Number(price?.value || 0);
  const meters = Number(area?.value || 0);
  const hasPrice = Number.isFinite(total) && total > 0;
  const hasArea = Number.isFinite(meters) && meters > 0;
  const hasResult = hasPrice && hasArea && Number.isFinite(reference) && reference > 0;
  const diff = hasResult ? ((total / meters - reference) / reference) * 100 : null;
  let resultBand = "unknown";
  let diffBand = "unknown";

  if (diff !== null) {
    if (diff < -10) {
      resultBand = "below_market";
      diffBand = "lt_minus_10";
    } else if (diff <= 10) {
      resultBand = "in_market";
      diffBand = "minus_10_to_10";
    } else {
      resultBand = "above_market";
      diffBand = "gt_10";
    }
  }

  return {
    calculator_type: calculatorTypeFor(calculator),
    has_price: hasPrice,
    has_area: hasArea,
    has_result: hasResult,
    result_band: resultBand,
    diff_band: diffBand
  };
}

function initSeoCalculatorAnalytics(root = document) {
  const calculators = root.querySelectorAll("[data-sale-reference]");
  calculators.forEach((calculator) => {
    if (calculator.dataset.analyticsBound === "true") return;
    const inputs = calculator.querySelectorAll("[data-seo-calc-price], [data-seo-calc-area]");
    const handleInput = () => {
      const state = calculatorState(calculator);
      const context = pageContextFromDom();
      if (calculator.dataset.calculatorUsedTracked !== "true" && (state.has_price || state.has_area)) {
        trackOwnedEvent("calculator_used", {
          metadata: {
            calculator_type: state.calculator_type,
            page_path: context.page_path,
            template_type: context.template_type,
            slug: context.slug,
            city: context.city,
            has_price: state.has_price,
            has_area: state.has_area
          }
        });
        calculator.dataset.calculatorUsedTracked = "true";
      }

      if (calculator.dataset.calculatorCompletedTracked !== "true" && state.has_result) {
        trackOwnedEvent("calculator_completed", {
          metadata: {
            calculator_type: state.calculator_type,
            result_band: state.result_band,
            diff_band: state.diff_band
          }
        });
        calculator.dataset.calculatorCompletedTracked = "true";
      }
    };
    inputs.forEach((input) => input.addEventListener("input", handleInput));
    calculator.dataset.analyticsBound = "true";
  });
}

function relevantInternalPath(path = "") {
  return (
    path.startsWith("/precio-") ||
    path.startsWith("/saber-si-") ||
    path.startsWith("/guias/") ||
    path.startsWith("/noticias") ||
    path === "/" ||
    path === "/que-analiza" ||
    path === "/datos" ||
    path === "/premium"
  );
}

function linkContextFor(anchor) {
  const explicit = anchor.dataset.analyticsContext || anchor.dataset.installSource || anchor.dataset.testid || "";
  if (explicit) return analyticsToken(explicit, "seo_link", 80);
  const section = anchor.closest("[data-section-id], section[id], article[data-template], nav, footer, header");
  const sectionId = section?.dataset?.sectionId || section?.id || section?.dataset?.template || section?.className || "";
  return analyticsToken(sectionId, "seo_content", 80);
}

function initSeoInternalLinkAnalytics() {
  if (seoInternalLinkAnalyticsBound) return;
  const context = pageContextFromDom();
  if (!isSeoAnalyticsContext(context)) return;
  seoInternalLinkAnalyticsBound = true;
  document.addEventListener(
    "click",
    (event) => {
      if (!isSeoAnalyticsContext()) return;
      const anchor = event.target.closest?.("a[href]");
      if (!anchor) return;
      let target;
      try {
        target = new URL(anchor.getAttribute("href"), location.href);
      } catch (error) {
        return;
      }
      if (target.origin !== location.origin) return;
      const targetPath = target.pathname || "/";
      if (!relevantInternalPath(targetPath)) return;
      if (targetPath === location.pathname && target.hash) return;
      trackOwnedEvent("seo_internal_link_click", {
        metadata: {
          target_path: targetPath,
          link_context: linkContextFor(anchor)
        }
      });
    },
    { capture: true }
  );
}

function initSeoScrollDepthAnalytics() {
  if (seoScrollDepthAnalyticsBound) return;
  const context = pageContextFromDom();
  if (!isSeoAnalyticsContext(context)) return;
  seoScrollDepthAnalyticsBound = true;
  const tracked = new Set();
  let ticking = false;
  let hasScrolled = false;
  const checkDepth = () => {
    ticking = false;
    const doc = document.documentElement;
    const body = document.body;
    const height = Math.max(doc.scrollHeight, body?.scrollHeight || 0, doc.clientHeight);
    const seen = window.scrollY + window.innerHeight;
    const percent = height ? (seen / height) * 100 : 0;
    [50, 90].forEach((depth) => {
      if (percent >= depth && !tracked.has(depth)) {
        tracked.add(depth);
        trackOwnedEvent("seo_scroll_depth", { metadata: { depth } });
      }
    });
  };
  const schedule = () => {
    hasScrolled = true;
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(checkDepth);
  };
  const scheduleAfterScroll = () => {
    if (hasScrolled) schedule();
  };
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", scheduleAfterScroll, { passive: true });
}

function initSeoInteractionAnalytics() {
  rememberSeoOrigin("page_view");
  initSeoCalculatorAnalytics(document);
  initSeoInternalLinkAnalytics();
  initSeoScrollDepthAnalytics();
}

function isInstallableBrowser(browserId) {
  return BROWSER_LAUNCH_WAITLIST[browserId]?.status === "available";
}

function installUrlForBrowser(browserId) {
  return BROWSER_LAUNCH_WAITLIST[browserId]?.storeUrl || CHROME_WEBSTORE_URL;
}

function openChromeWebStore({ browser = "chrome", source = "web", label = "" } = {}) {
  const origin = rememberSeoOrigin("chrome_store_click");
  launchWaitlistAnalytics("extension_install_click", {
    browser,
    source,
    label,
    store: "chrome_web_store"
  });
  trackOwnedEvent("chrome_store_click", {
    browser,
    source,
    metadata: { label, store: "chrome_web_store", ...seoOriginMetadata(origin) }
  });
  const url = installUrlForBrowser(browser);
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}
function launchWaitlistBrowserCards() {
  return Object.values(BROWSER_LAUNCH_WAITLIST)
    .map((browser) => {
      const detected = launchWaitlistState.detectedBrowser === browser.id;
      const selected = launchWaitlistState.selectedBrowser === browser.id;
      return `
        <button class="launch-browser-card ${selected ? "selected" : ""}" type="button" data-browser-waitlist-option="${escapeHtml(browser.id)}" aria-pressed="${selected ? "true" : "false"}">
          <span class="launch-browser-card-top">
            <strong>${escapeHtml(browser.name)}</strong>
            <span class="launch-browser-badges">
              ${detected ? '<span class="launch-browser-badge detected">Tu navegador</span>' : ""}
              <span class="launch-browser-badge">${escapeHtml(browser.badge)}</span>
            </span>
          </span>
          <span>${escapeHtml(browser.description)}</span>
          <span class="launch-browser-store">
            <span>${selected ? "Detectado" : "Ver entorno"}</span>
            ${icon("ArrowRight")}
          </span>
        </button>
      `;
    })
    .join("");
}

function launchWaitlistModalHtml() {
  const selectedBrowser = BROWSER_LAUNCH_WAITLIST[launchWaitlistState.selectedBrowser];
  const selectedInstallable = isInstallableBrowser(launchWaitlistState.selectedBrowser);
  const browserName = selectedBrowser?.name || "tu navegador";
  const submitDisabled = selectedInstallable ? false : !(launchWaitlistState.selectedBrowser && launchWaitlistState.email.includes("@") && launchWaitlistState.status !== "loading");
  if (launchWaitlistState.status === "success") {
    return `
    <div class="launch-modal-backdrop" data-launch-waitlist-backdrop>
      <section class="launch-modal launch-success" role="dialog" aria-modal="true" aria-labelledby="launch-success-title" tabindex="-1">
        <button class="launch-modal-close" type="button" data-launch-waitlist-close aria-label="Cerrar">&times;</button>
        <span class="launch-success-icon">${icon("Check")}</span>
        <h2 id="launch-success-title">Solicitud recibida</h2>
        <p>${launchWaitlistState.alreadyExists ? `Ya ten\u00edamos tu email asociado a ${escapeHtml(browserName)}.` : `Hemos recibido tu solicitud para ${escapeHtml(browserName)}.`}</p>
        <p>Gracias. Revisaremos la compatibilidad del entorno antes de cualquier comunicaci\u00f3n.</p>
        <div class="launch-modal-actions">
          <button class="button" type="button" data-launch-waitlist-success-close>Cerrar</button>
          <button class="button ghost" type="button" data-launch-waitlist-reset>Revisar otro entorno</button>
        </div>
      </section>
    </div>
  `;
  }
  return `
    <div class="launch-modal-backdrop" data-launch-waitlist-backdrop>
      <section class="launch-modal" role="dialog" aria-modal="true" aria-labelledby="launch-modal-title" aria-describedby="launch-modal-description" tabindex="-1">
        <button class="launch-modal-close" type="button" data-launch-waitlist-close aria-label="Cerrar">&times;</button>
        <div class="launch-modal-head">
          <p class="section-label">Instalar InmoRadar</p>
          <h2 id="launch-modal-title">${selectedBrowser && !selectedInstallable ? `Instalaci\u00f3n no disponible en ${escapeHtml(browserName)}` : "Empezar gratis"}</h2>
          <p id="launch-modal-description">${selectedBrowser && !selectedInstallable ? `No hemos podido iniciar la instalaci\u00f3n autom\u00e1tica en ${escapeHtml(browserName)} desde esta web.` : "Pulsa Empezar gratis para iniciar el flujo de instalaci\u00f3n compatible con tu navegador."}</p>
          <strong>Instala InmoRadar y analiza tu primer anuncio donde ya buscas.</strong>
        </div>
        <div class="launch-browser-grid" role="group" aria-label="Entorno detectado">
          ${launchWaitlistBrowserCards()}
        </div>
        <p class="launch-other-browsers">InmoRadar inicia el flujo disponible cuando el entorno es compatible.</p>
        <form class="launch-form" data-launch-waitlist-form>
          <p class="launch-selected-browser">Entorno detectado: <strong>${escapeHtml(selectedBrowser?.name || "No identificado")}</strong></p>
          <label class="field" for="launch-waitlist-email">
            <span>Tu email</span>
            <input id="launch-waitlist-email" name="email" type="email" inputmode="email" autocomplete="email" placeholder="tu@email.com" value="${escapeHtml(launchWaitlistState.email)}" ${selectedInstallable ? "" : "required"}>
          </label>
          <label class="launch-honeypot" aria-hidden="true" tabindex="-1">
            <span>Empresa</span>
            <input name="company" type="text" autocomplete="off" tabindex="-1">
          </label>
          <p class="launch-privacy">Solo usaremos tu email si solicitas soporte sobre compatibilidad o acceso. Puedes leer la <a href="/privacidad" target="_blank" rel="noopener noreferrer">pol\u00edtica de privacidad</a>.</p>
          <p class="launch-error" id="launch-waitlist-error" ${launchWaitlistState.error ? "" : "hidden"}>${escapeHtml(launchWaitlistState.error)}</p>
          <button class="button full" type="submit" ${submitDisabled ? "disabled" : ""}>${selectedInstallable ? "Iniciar instalaci\u00f3n" : launchWaitlistState.status === "loading" ? "Guardando..." : "Solicitar soporte"}</button>
        </form>
        <div class="launch-modal-actions left">
          <button class="button ghost" type="button" data-launch-waitlist-close>Seguir viendo la web</button>
        </div>
      </section>
    </div>
  `;
}

function renderLaunchWaitlistModal() {
  let host = document.querySelector("[data-launch-waitlist-modal]");
  if (!launchWaitlistState.open) {
    host?.remove();
    return;
  }
  if (!host) {
    host = document.createElement("div");
    host.dataset.launchWaitlistModal = "true";
    document.body.appendChild(host);
  }
  host.innerHTML = launchWaitlistModalHtml();
  document.body.classList.add("launch-modal-open");
  bindLaunchWaitlistModal(host);
  requestAnimationFrame(() => {
    const focusTarget =
      host.querySelector("[data-launch-waitlist-success-close]") ||
      host.querySelector("#launch-waitlist-email") ||
      host.querySelector(`[data-browser-waitlist-option="${launchWaitlistState.detectedBrowser}"]`) ||
      host.querySelector(".launch-browser-card") ||
      host.querySelector(".launch-modal");
    focusTarget?.focus?.();
  });
}

function closeLaunchWaitlistModal(closeMethod = "secondary_button") {
  if (!launchWaitlistState.open) return;
  launchWaitlistAnalytics("launch_waitlist_modal_close", {
    source: launchWaitlistState.source,
    closeMethod
  });
  const opener = launchWaitlistState.opener;
  launchWaitlistState.open = false;
  launchWaitlistState.status = "idle";
  launchWaitlistState.error = "";
  document.body.classList.remove("launch-modal-open");
  renderLaunchWaitlistModal();
  opener?.focus?.();
}

function resetLaunchWaitlistForm() {
  launchWaitlistState.status = "idle";
  launchWaitlistState.error = "";
  launchWaitlistState.email = "";
  launchWaitlistState.alreadyExists = false;
  renderLaunchWaitlistModal();
}

function openLaunchWaitlistModal({ source = "web", label = "", opener = null, browser = "" } = {}) {
  launchWaitlistState.detectedBrowser = detectLaunchBrowser();
  const detectedBrowser = BROWSER_LAUNCH_WAITLIST[launchWaitlistState.detectedBrowser] ? launchWaitlistState.detectedBrowser : "";
  launchWaitlistState.selectedBrowser = BROWSER_LAUNCH_WAITLIST[browser] ? browser : detectedBrowser;
  launchWaitlistState.email = "";
  launchWaitlistState.error = "";
  launchWaitlistState.status = "idle";
  launchWaitlistState.alreadyExists = false;
  launchWaitlistState.source = source;
  launchWaitlistState.label = label;
  launchWaitlistState.opener = opener;
  launchWaitlistState.open = true;
  launchWaitlistAnalytics("launch_waitlist_modal_open", { source, browser: launchWaitlistState.selectedBrowser });
  trackOwnedEvent("waitlist_open", { source, browser: launchWaitlistState.selectedBrowser, metadata: { label } });
  renderLaunchWaitlistModal();
}

function focusableLaunchElements(host) {
  return Array.from(host.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter((node) => !node.disabled && !node.hidden && node.offsetParent !== null);
}

function bindLaunchWaitlistModal(host) {
  host.querySelectorAll("[data-launch-waitlist-close]").forEach((button) => {
    button.addEventListener("click", () => closeLaunchWaitlistModal(button.classList.contains("launch-modal-close") ? "x" : "secondary_button"));
  });
  host.querySelector("[data-launch-waitlist-success-close]")?.addEventListener("click", () => closeLaunchWaitlistModal("success_close"));
  host.querySelector("[data-launch-waitlist-reset]")?.addEventListener("click", resetLaunchWaitlistForm);
  host.querySelector("[data-launch-waitlist-backdrop]")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeLaunchWaitlistModal("backdrop");
  });
  host.querySelectorAll("[data-browser-waitlist-option]").forEach((button) => {
    button.addEventListener("click", () => {
      const previousBrowser = launchWaitlistState.selectedBrowser;
      launchWaitlistState.selectedBrowser = button.dataset.browserWaitlistOption || "";
      launchWaitlistState.error = "";
      launchWaitlistAnalytics("launch_waitlist_browser_select", {
        browser: launchWaitlistState.selectedBrowser,
        source: launchWaitlistState.source
      });
      if (previousBrowser && previousBrowser !== launchWaitlistState.selectedBrowser) {
        launchWaitlistAnalytics("launch_waitlist_change_browser", {
          previousBrowser,
          newBrowser: launchWaitlistState.selectedBrowser,
          source: launchWaitlistState.source
        });
      }
      renderLaunchWaitlistModal();
    });
  });
  const email = host.querySelector("#launch-waitlist-email");
  email?.addEventListener("input", () => {
    launchWaitlistState.email = email.value;
    launchWaitlistState.error = "";
    const errorNode = host.querySelector("#launch-waitlist-error");
    if (errorNode) {
      errorNode.textContent = "";
      errorNode.hidden = true;
    }
    const submit = host.querySelector('[data-launch-waitlist-form] [type="submit"]');
    if (submit) {
      submit.disabled = isInstallableBrowser(launchWaitlistState.selectedBrowser) ? false : !(launchWaitlistState.selectedBrowser && launchWaitlistState.email.includes("@") && launchWaitlistState.status !== "loading");
    }
  });
  host.querySelector("[data-launch-waitlist-form]")?.addEventListener("submit", submitLaunchWaitlist);
  host.onkeydown = (event) => {
    if (event.key === "Escape") {
      closeLaunchWaitlistModal("escape");
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = focusableLaunchElements(host);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
}

async function submitLaunchWaitlist(event) {
  event.preventDefault();
  const browser = launchWaitlistState.selectedBrowser;
  const email = String(launchWaitlistState.email || "").trim();
  if (isInstallableBrowser(browser)) {
    openChromeWebStore({ browser, source: launchWaitlistState.source, label: launchWaitlistState.label });
    return;
  }
  if (!browser) {
    launchWaitlistState.error = "No hemos podido detectar un entorno compatible.";
    renderLaunchWaitlistModal();
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    launchWaitlistState.error = "Introduce un email válido.";
    renderLaunchWaitlistModal();
    launchWaitlistAnalytics("launch_waitlist_error", {
      browser,
      source: launchWaitlistState.source,
      errorCode: "INVALID_EMAIL"
    });
    return;
  }

  const params = new URLSearchParams(location.search);
  const honeypot = event.target?.company?.value || "";
  const payload = {
    email,
    browser,
    source: launchWaitlistState.source || "launch_waitlist_modal",
    page: location.pathname || "/",
    referrer: document.referrer || "",
    utm: {
      source: params.get("utm_source") || "",
      medium: params.get("utm_medium") || "",
      campaign: params.get("utm_campaign") || "",
      term: params.get("utm_term") || "",
      content: params.get("utm_content") || ""
    },
    honeypot,
    userAgent: navigator.userAgent || ""
  };
  launchWaitlistAnalytics("launch_waitlist_submit", {
    browser,
    source: launchWaitlistState.source,
    emailDomain: emailDomain(email)
  });
  launchWaitlistState.status = "loading";
  launchWaitlistState.error = "";
  renderLaunchWaitlistModal();
  try {
    const response = await fetch(BROWSER_WAITLIST_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) {
      throw new Error(result.error || "SERVER_ERROR");
    }
    launchWaitlistState.status = "success";
    launchWaitlistState.alreadyExists = Boolean(result.alreadyExists);
    launchWaitlistAnalytics("launch_waitlist_success", {
      browser,
      source: launchWaitlistState.source,
      alreadyExists: Boolean(result.alreadyExists)
    });
    trackOwnedEvent("waitlist_submit", {
      browser,
      source: launchWaitlistState.source,
      metadata: { alreadyExists: Boolean(result.alreadyExists) }
    });
    renderLaunchWaitlistModal();
  } catch (error) {
    launchWaitlistState.status = "idle";
    launchWaitlistState.error = "No hemos podido guardar tu email. Inténtalo de nuevo en unos segundos.";
    launchWaitlistAnalytics("launch_waitlist_error", {
      browser,
      source: launchWaitlistState.source,
      errorCode: error.message === "INVALID_EMAIL" ? "INVALID_EMAIL" : "SERVER_ERROR"
    });
    renderLaunchWaitlistModal();
  }
}

function ctaSourceFromElement(element) {
  return element.dataset.installSource || element.dataset.launchWaitlistSource || element.dataset.checkoutSource || element.dataset.testid || element.getAttribute("aria-label") || normalizedText(element.textContent || "web_cta").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "web_cta";
}

function handleUniversalInstallClick(event, element) {
  event.preventDefault();
  const source = element.dataset.installSource || ctaSourceFromElement(element);
  const label = normalizedText(element.textContent || "");
  const browser = element.dataset.installBrowser || detectLaunchBrowser();
  const origin = rememberSeoOrigin("install_click");
  launchWaitlistAnalytics("launch_waitlist_cta_click", { source, label, browser });
  trackOwnedEvent(installCtaEventName(source), { browser, source, metadata: { label, ...seoOriginMetadata(origin) } });
  if (isInstallableBrowser(browser)) {
    openChromeWebStore({ browser, source, label });
    return;
  }
  trackOwnedEvent("install_click", {
    browser,
    source,
    metadata: { label, status: "unsupported_browser" }
  });
  showToast("No hemos podido iniciar la instalación automática en este navegador. Prueba desde Chrome, Edge, Brave o Vivaldi.", "error");
}

function bindInstallButtons(root = document) {
  root.querySelectorAll("[data-install-button]").forEach((element) => {
    if (element.dataset.installBound === "true") return;
    if (!element.dataset.installSource) element.dataset.installSource = ctaSourceFromElement(element);
    element.addEventListener("click", (event) => handleUniversalInstallClick(event, element));
    element.dataset.installBound = "true";
  });
}

function initInstallButtons() {
  bindInstallButtons(document);
}
function initLaunchWaitlist() {
  document.querySelectorAll("[data-browser-waitlist], [data-launch-waitlist]").forEach((element) => {
    if (!element.dataset.launchWaitlistSource) element.dataset.launchWaitlistSource = ctaSourceFromElement(element);
    element.addEventListener("click", (event) => {
      event.preventDefault();
      launchWaitlistAnalytics("launch_waitlist_cta_click", {
        source: element.dataset.launchWaitlistSource,
        label: normalizedText(element.textContent || "")
      });
      openLaunchWaitlistModal({
        source: element.dataset.launchWaitlistSource,
        label: normalizedText(element.textContent || ""),
        browser: element.dataset.waitlistBrowser || "",
        opener: element
      });
    });
  });
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

function initFooterSocial() {
  document.querySelectorAll(".site-footer").forEach((footer) => {
    if (footer.querySelector("[data-footer-social]")) return;
    const footerWord = footer.querySelector(".footer-word");
    const target = footer.querySelector(".footer-meta") || footer.querySelector(".container") || footer;
    const wrapper = document.createElement("template");
    wrapper.innerHTML = footerSocialHtml().trim();
    const social = wrapper.content.firstElementChild;
    if (!social) return;
    if (footerWord) {
      footerWord.insertAdjacentElement("afterend", social);
      return;
    }
    if (target.classList.contains("footer-meta") && target.children.length > 1) {
      target.insertBefore(social, target.children[1]);
    } else {
      target.appendChild(social);
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
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      const previousText = button.textContent;
      const source = button.dataset.checkoutSource || ctaSourceFromElement(button);
      const browser = detectLaunchBrowser();
      trackOwnedEvent("premium_click", {
        source,
        browser,
        metadata: { label: normalizedText(previousText || "") }
      });
      trackConversionEvent("checkout_start", {
        source,
        label: normalizedText(previousText || ""),
        browser,
        page: location.pathname || "/"
      });
      button.disabled = true;
      button.textContent = t("checkoutOpening");
      try {
        const response = await fetch(CHECKOUT_ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ source })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.checkout_url) throw new Error(payload.message || t("checkoutSetupIssue"));
        trackConversionEvent("checkout_created", {
          source,
          browser,
          page: location.pathname || "/",
          status: "created",
          testMode: Boolean(payload.test_mode)
        });
        location.href = payload.checkout_url;
      } catch (error) {
        trackConversionEvent("checkout_error", {
          source,
          browser,
          page: location.pathname || "/",
          status: "error",
          errorCode: analyticsErrorCode(error.message)
        });
        showToast(error.message || t("checkoutSetupIssue"), "error");
        button.disabled = false;
        button.textContent = previousText;
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
  loadRemoteArticles();
  initFaq();
  initContactForm();
  initFooterSocial();
  initInstallButtons();
  initLaunchWaitlist();
  initCheckout();
  initSeoInteractionAnalytics();
  trackOwnedEvent("page_view");
}

init();
