const { canonicalForSlug, countWords, displayName, escapeHtml, slugify } = require("./text");
const { CHROME_WEBSTORE_URL } = require("./priceCity");

const EDITORIAL_GUIDE_TOPICS = [
  {
    key: "errores-comprar-piso",
    keyword: "errores al comprar piso",
    title: "Errores al comprar piso en España",
    metaTitle: "Errores al comprar piso en España | InmoRadar",
    metaDescription:
      "Guía para detectar errores frecuentes al comprar vivienda en España: precio por metro cuadrado, entrada, hipoteca, zona y señales del anuncio.",
    hook: "Comprar piso no empieza en la visita. Empieza entendiendo si el anuncio merece una llamada.",
    checklist: ["Mirar solo el precio total", "No calcular entrada y cuota", "Comparar barrios sin contexto", "Ignorar reforma, ruido o aparcamiento"],
    cta: "Pasa el piso por InmoRadar antes de llamar y usa los números como filtro inicial."
  },
  {
    key: "antes-de-llamar-por-un-piso",
    keyword: "que mirar antes de llamar por un piso",
    title: "Qué mirar antes de llamar por un piso en España",
    metaTitle: "Qué mirar antes de llamar por un piso en España | InmoRadar",
    metaDescription:
      "Checklist práctico para revisar un anuncio antes de contactar: precio, euros por metro cuadrado, entrada, cuota, transporte y aparcamiento.",
    hook: "La llamada llega demasiado pronto cuando el anuncio todavía no se ha entendido.",
    checklist: ["Precio por metro cuadrado", "Entrada estimada", "Cuota orientativa", "Transporte y zona", "Aparcamiento y entorno"],
    cta: "Instala InmoRadar en tu navegador compatible y revisa el anuncio donde ya estás buscando."
  },
  {
    key: "comparar-dos-pisos",
    keyword: "como comparar dos pisos",
    title: "Cómo comparar dos pisos en España sin perder criterio",
    metaTitle: "Cómo comparar dos pisos en España | InmoRadar",
    metaDescription:
      "Método sencillo para comparar dos viviendas: coste real, superficie, zona, transporte, aparcamiento y señales que no siempre se ven en las fotos.",
    hook: "Dos pisos pueden costar lo mismo y exigir decisiones muy distintas.",
    checklist: ["Normalizar por metro cuadrado", "Revisar coste inicial", "Cruzar zona y transporte", "Separar pros de contras"],
    cta: "Guarda ambos anuncios en InmoRadar y compáralos con la misma escala."
  },
  {
    key: "entrada-hipoteca-primera-vivienda",
    keyword: "entrada hipoteca primera vivienda",
    title: "Entrada e hipoteca al comprar primera vivienda en España",
    metaTitle: "Entrada e hipoteca para primera vivienda en España | InmoRadar",
    metaDescription:
      "Guía orientativa para entender entrada, cuota y gastos antes de enamorarte de una primera vivienda anunciada online.",
    hook: "El precio del anuncio no es el dinero que necesitas para empezar.",
    checklist: ["Entrada inicial", "Gastos asociados", "Cuota mensual", "Margen para imprevistos"],
    cta: "Usa InmoRadar como primera capa de criterio antes de pedir información."
  },
  {
    key: "senales-alerta-anuncio-inmobiliario",
    keyword: "señales de alerta anuncio inmobiliario",
    title: "Señales de alerta en anuncios inmobiliarios en España",
    metaTitle: "Señales de alerta en anuncios inmobiliarios en España | InmoRadar",
    metaDescription:
      "Aprende a leer señales de alerta en anuncios de vivienda: metros, precio, zona, reforma, fotos, transporte y costes ocultos.",
    hook: "Un anuncio puede parecer perfecto y aun así esconder preguntas importantes.",
    checklist: ["Fotos demasiado parciales", "Metros poco claros", "Precio bajo sin explicación", "Zona descrita de forma vaga"],
    cta: "Antes de contactar, revisa el anuncio con InmoRadar y prepara preguntas concretas."
  },
  {
    key: "precio-metro-cuadrado-comparar",
    keyword: "precio metro cuadrado comparar viviendas",
    title: "Cómo usar el precio por metro cuadrado en España",
    metaTitle: "Cómo usar el precio por metro cuadrado en España | InmoRadar",
    metaDescription:
      "Guía para usar el precio por metro cuadrado como señal inicial, sin confundir referencias agregadas con tasaciones exactas.",
    hook: "El precio por metro cuadrado no decide por ti, pero cambia la conversación.",
    checklist: ["Dividir precio entre metros", "Comparar con referencia disponible", "Entender el nivel geográfico", "Revisar estado y extras"],
    cta: "InmoRadar calcula esta capa directamente sobre el anuncio."
  },
  {
    key: "coste-real-comprar-vivienda",
    keyword: "coste real comprar vivienda",
    title: "Coste real de comprar vivienda en España",
    metaTitle: "Coste real de comprar vivienda en España | InmoRadar",
    metaDescription:
      "Una guía para mirar más allá del precio del anuncio: entrada, cuota, gastos, reforma, comunidad, transporte y coste diario.",
    hook: "El coste real de una vivienda no cabe en una sola cifra.",
    checklist: ["Entrada y gastos", "Cuota mensual", "Comunidad e IBI", "Reforma probable", "Coste de movilidad"],
    cta: "Analiza tu primer anuncio gratis con InmoRadar y evita revisar pisos a ciegas."
  },
  {
    key: "zona-transporte-aparcamiento",
    keyword: "zona transporte aparcamiento vivienda",
    title: "Zona, transporte y aparcamiento antes de comprar en España",
    metaTitle: "Zona, transporte y aparcamiento antes de comprar en España | InmoRadar",
    metaDescription:
      "Cómo valorar zona, transporte, ruido y aparcamiento antes de decidir si un anuncio inmobiliario merece una visita.",
    hook: "Una buena vivienda puede volverse incómoda si la logística diaria no encaja.",
    checklist: ["Distancia al transporte", "Ruido y calles cercanas", "Aparcamiento realista", "Servicios diarios"],
    cta: "InmoRadar cruza señales urbanas para que el anuncio no sea solo fotos y precio."
  },
  {
    key: "reforma-costes-ocultos",
    keyword: "reforma costes ocultos vivienda",
    title: "Reforma y costes ocultos al comprar vivienda en España",
    metaTitle: "Reforma y costes ocultos en vivienda en España | InmoRadar",
    metaDescription:
      "Guía para detectar indicios de reforma y costes ocultos antes de llamar por un piso anunciado online.",
    hook: "Lo barato puede dejar de serlo cuando aparece la reforma.",
    checklist: ["Cocina y baños antiguos", "Instalaciones sin detalle", "Certificado energético", "Comunidad y derramas"],
    cta: "Usa InmoRadar como filtro previo y valida lo importante antes de visitar."
  },
  {
    key: "comprar-para-alquilar-rentabilidad",
    keyword: "comprar para alquilar rentabilidad",
    title: "Comprar para alquilar en España: qué mirar antes",
    metaTitle: "Comprar para alquilar en España: qué mirar antes | InmoRadar",
    metaDescription:
      "Guía para revisar una vivienda orientada a alquiler: precio, renta esperada, zona, liquidez, reforma y riesgos de sobrepagar.",
    hook: "La rentabilidad empieza antes de comprar, no cuando ya tienes las llaves.",
    checklist: ["Precio de compra", "Renta comparable", "Reforma necesaria", "Demanda de zona", "Riesgo de vacío"],
    cta: "Compara anuncios con InmoRadar antes de decidir cuál merece más análisis."
  }
];

function guideTopicForOpportunity(opportunity = {}) {
  const keyword = slugify(opportunity.keyword || "");
  return (
    EDITORIAL_GUIDE_TOPICS.find((topic) => keyword.includes(topic.key) || keyword.includes(slugify(topic.keyword))) ||
    EDITORIAL_GUIDE_TOPICS[0]
  );
}

function editorialGuideSlugForOpportunity(opportunity = {}) {
  return `guias/${guideTopicForOpportunity(opportunity).key}`;
}

function editorialGuideOpportunities() {
  return EDITORIAL_GUIDE_TOPICS.map((topic, index) => ({
    keyword: topic.keyword,
    city: "España",
    province: null,
    autonomous_community: null,
    intent: "informational",
    template_type: "editorial_guide",
    search_priority: 95 - index * 3,
    status: "pending"
  }));
}

function buildEditorialGuideSourceData(opportunity, now = new Date().toISOString()) {
  const date = new Date(now);
  const periodLabel = Number.isNaN(date.getTime()) ? String(now).slice(0, 10) : date.toISOString().slice(0, 10);
  return {
    hasRealData: true,
    hasProvincialOnly: false,
    records: [
      {
        operation: "editorial",
        source: "inmoradar_editorial",
        source_url: `${canonicalForSlug("metodologia").replace(/\/$/, "")}`,
        period_label: periodLabel,
        period_date: periodLabel,
        geo_level: "country"
      }
    ],
    sources: [
      {
        operation: "editorial",
        source: "inmoradar_editorial",
        source_url: `${canonicalForSlug("metodologia").replace(/\/$/, "")}`,
        period_label: periodLabel,
        period_date: periodLabel,
        geo_level: "country"
      }
    ],
    isEditorialGuide: true
  };
}

function sourceNote(dateLabel, sourceUrl = canonicalForSlug("metodologia")) {
  return `<aside class="seo-disclaimer">
    <p class="seo-disclaimer-kicker">-> CRITERIO EDITORIAL</p>
    <p><strong>Fuente y fecha del dato:</strong> <a href="${escapeHtml(sourceUrl)}">metodologia editorial de InmoRadar</a>. Fecha del dato: ${escapeHtml(dateLabel)}.</p>
    <p><strong>Fuente:</strong> metodología editorial de InmoRadar, basada en lectura de anuncios, criterios de comparación y señales urbanas. <strong>Fecha del dato:</strong> ${escapeHtml(
      dateLabel
    )}. Esta guía es orientativa: no es tasación, asesoramiento financiero ni recomendación de compra.</p>
  </aside>`;
}

function faq(topic) {
  return [
    {
      question: "¿InmoRadar decide si debo comprar una vivienda?",
      answer:
        "No. InmoRadar ordena señales del anuncio para que decidas con más criterio antes de contactar. La decisión final debe validarse con visita, documentación y profesionales cuando proceda."
    },
    {
      question: "¿El precio por metro cuadrado es suficiente?",
      answer:
        "No. Sirve como primera comparación, pero hay que cruzarlo con estado, zona, transporte, coste inicial, comunidad, reforma y tus necesidades reales."
    },
    {
      question: "¿Puedo usar esta guía para cualquier portal?",
      answer:
        "Sí. El criterio aplica a anuncios de Idealista, Fotocasa, Pisos.com, Habitaclia y otros portales, aunque InmoRadar automatiza la lectura en portales compatibles."
    },
    {
      question: "¿Qué hago si falta un dato?",
      answer:
        "No lo inventes. Si el anuncio no deja claro superficie, gastos, garaje, estado o zona exacta, conviene pedir información antes de visitar."
    },
    {
      question: `¿Cómo encaja esta guía con ${topic.title}?`,
      answer:
        "Úsala como checklist previo: primero detecta señales, después compara alternativas y solo entonces decide si merece la pena llamar."
    }
  ];
}

function faqHtml(items) {
  return `<section class="seo-section seo-faq" id="faq" data-guide-specific="true">
    <h2>Preguntas frecuentes</h2>
${items
  .map(
    (item) => `    <details>
      <summary>${escapeHtml(item.question)}</summary>
      <p>${escapeHtml(item.answer)}</p>
    </details>`
  )
  .join("\n")}
  </section>`;
}

function checklistHtml(topic) {
  return `<ul>
${topic.checklist.map((item) => `    <li>${escapeHtml(item)}.</li>`).join("\n")}
  </ul>`;
}

function commercialCtaHtml(position = "intermediate") {
  const isFinal = position === "final";
  const title = isFinal ? "Compara mejor antes de llamar o escribir" : "Analiza el anuncio antes de contactar";
  const actionLabel = isFinal ? "Usa InmoRadar gratis para revisar el anuncio" : "Analiza el anuncio gratis";
  const installSource = isFinal ? "seo_editorial_guide_commercial_final" : "seo_editorial_guide_commercial_intermediate";

  return `<section class="seo-commercial-cta" data-guide-specific="true" data-guide-commercial-cta="${escapeHtml(position)}">
          <div class="seo-commercial-copy">
            <p class="seo-commercial-kicker">-> INMORADAR GRATIS</p>
            <h2>${escapeHtml(title)}</h2>
            <p>¿Estás buscando vivienda en Idealista, Fotocasa u otros portales? Usa InmoRadar gratis para ver información útil del anuncio que muchas veces no aparece clara: precio por m², señales de riesgo, resumen del inmueble y comparación antes de contactar.</p>
            <p class="seo-commercial-disclaimer">InmoRadar es una herramienta independiente y no está afiliada oficialmente a portales inmobiliarios.</p>
          </div>
          <div class="seo-commercial-actions">
            <a class="seo-button seo-button-primary" href="${escapeHtml(CHROME_WEBSTORE_URL)}" target="_blank" rel="noopener noreferrer" data-install-button data-install-source="${escapeHtml(installSource)}">${escapeHtml(actionLabel)}</a>
            <a class="seo-button seo-button-secondary" href="/que-analiza">Ver qué analiza</a>
          </div>
        </section>`;
}

function buildEditorialGuideLanding(opportunity, sourceData = {}) {
  const topic = guideTopicForOpportunity(opportunity);
  const city = displayName(opportunity.city || "España");
  const dateLabel = sourceData.records?.[0]?.period_label || new Date().toISOString().slice(0, 10);
  const sourceUrl = sourceData.records?.[0]?.source_url || canonicalForSlug("metodologia");
  const slug = `guias/${topic.key}`;
  const faqItems = faq(topic);
  const bodyHtml = `<article class="seo-reading" data-template="editorial_guide" data-testid="page-editorial-guide-${escapeHtml(topic.key)}">
    <nav class="seo-breadcrumb" aria-label="Breadcrumb"><a href="/">INMORADAR</a><span>/</span><a href="/noticias">NOTICIAS</a><span>/</span><strong>${escapeHtml(
      topic.title.toUpperCase()
    )}</strong></nav>
    <header class="seo-page-hero" data-guide-specific="true">
      <p class="seo-page-eyebrow">-> GUÍA INMORADAR · ${escapeHtml(city.toUpperCase())}</p>
      <h1>${escapeHtml(topic.title)}</h1>
      <p class="seo-lead">${escapeHtml(topic.hook)} Esta guía ayuda a compradores en ${escapeHtml(
        city
      )} a revisar anuncios con calma, separar intuición de números y preparar mejores preguntas antes de contactar.</p>
      <div class="seo-meta-row"><span>LECTURA: 4-6 MIN</span><span>ACTUALIZADA: ${escapeHtml(dateLabel)}</span></div>
    </header>

    <div class="seo-reading-grid">
      <aside class="seo-sidebar">
        <section class="seo-data-card">
          <p class="seo-sidebar-kicker">-> CHECKLIST RÁPIDO</p>
          ${checklistHtml(topic)}
          <p class="seo-card-note">Úsalo como filtro, no como decisión final. Si falta un dato del anuncio, hay que comprobarlo.</p>
        </section>
      </aside>

      <div class="seo-content">
        <section class="seo-section" id="por-que-importa" data-guide-specific="true">
          <h2>Por qué importa antes de contactar</h2>
          <p>En ${escapeHtml(
            city
          )}, muchas búsquedas empiezan por fotos, precio total y una sensación rápida de oportunidad. El problema es que esos tres elementos no explican el coste real de una vivienda. Un anuncio puede parecer barato por precio absoluto y salir caro por metro cuadrado. Otro puede parecer caro y, sin embargo, compensar si tiene mejor zona, menos reforma, transporte cercano o gastos más previsibles.</p>
          <p>La utilidad de InmoRadar está en añadir una capa de criterio donde ya buscas. Antes de llamar, conviene convertir el anuncio en preguntas concretas: cuánto cuesta por metro cuadrado, qué entrada exige, qué cuota orientativa tendría, qué señales da la zona, si el aparcamiento será un problema y qué elementos del anuncio necesitan validación.</p>
        </section>

        <section class="seo-section" id="checklist" data-guide-specific="true">
          <h2>Checklist práctico</h2>
          ${checklistHtml(topic)}
          <p>Este checklist no sustituye una visita ni una tasación. Sirve para ordenar la primera lectura. Si dos anuncios parecen parecidos, el checklist ayuda a descubrir cuál merece más tiempo y cuál exige demasiadas comprobaciones antes incluso de llamar.</p>
        </section>

        ${commercialCtaHtml("intermediate")}

        <section class="seo-section" id="como-leer-numeros" data-guide-specific="true">
          <h2>Cómo leer los números sin caer en conclusiones rápidas</h2>
          <p>Empieza por el precio por metro cuadrado, pero no lo uses de forma aislada. La superficie puede ser útil o construida, la zona puede estar descrita de forma imprecisa y el estado real de la vivienda puede cambiar mucho el coste final. Por eso la lectura mejora cuando mezclas datos de precio con contexto de zona, transporte, ruido, aparcamiento, comunidad, posible reforma y comparación con alternativas cercanas.</p>
          <p>También conviene separar estimación de certeza. Una cuota orientativa ayuda a saber si el anuncio encaja con tu presupuesto, pero no reemplaza la oferta bancaria. Una referencia de mercado ayuda a detectar desviaciones, pero no dice el valor exacto de una calle o de una vivienda concreta. La idea es llamar con mejores preguntas, no comprar con una respuesta automática.</p>
        </section>

        <section class="seo-section" id="ejemplo-uso" data-guide-specific="true">
          <h2>Ejemplo de uso con InmoRadar</h2>
          <p>Imagina dos viviendas en ${escapeHtml(
            city
          )}. La primera cuesta menos, pero tiene menos metros, peor comunicación y una reforma probable. La segunda exige más entrada inicial, pero ofrece mejor transporte y menos señales de coste futuro. Si solo miras el precio total, la primera gana. Si miras coste real, zona y señales del anuncio, la decisión cambia.</p>
          <p>InmoRadar resume esa lectura en una ficha: precio, euros por metro cuadrado, entrada estimada, cuota orientativa, zona, transporte, aparcamiento y señales clave. No decide por ti, pero te da un punto de partida más limpio para saber si merece la pena contactar.</p>
        </section>

        <section class="seo-section" id="cta" data-guide-specific="true">
          <h2>Analiza antes de contactar</h2>
          <p>${escapeHtml(topic.cta)} Pulsa Empezar gratis para iniciar el flujo de instalación compatible y analizar anuncios donde ya buscas.</p>
          <div class="seo-final-actions">
            <button class="seo-button seo-button-primary" type="button" data-install-button data-install-source="seo_editorial_guide">EMPEZAR GRATIS</button>
            <a class="seo-button seo-button-secondary" href="/noticias">VER MÁS GUÍAS</a>
          </div>
        </section>
        ${faqHtml(faqItems)}
        ${commercialCtaHtml("final")}
        ${sourceNote(dateLabel, sourceUrl)}
      </div>
    </div>
  </article>`;

  return {
    slug,
    title: topic.title,
    meta_title: topic.metaTitle,
    meta_description: topic.metaDescription,
    h1: topic.title,
    body_html: bodyHtml,
    city,
    province: displayName(opportunity.province || ""),
    autonomous_community: displayName(opportunity.autonomous_community || ""),
    template_type: "editorial_guide",
    canonical_url: canonicalForSlug(slug),
    word_count: countWords(bodyHtml),
    faq: faqItems
  };
}

module.exports = {
  EDITORIAL_GUIDE_TOPICS,
  buildEditorialGuideLanding,
  buildEditorialGuideSourceData,
  editorialGuideOpportunities,
  editorialGuideSlugForOpportunity
};
