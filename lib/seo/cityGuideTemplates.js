const { canonicalForSlug, countWords, displayName, escapeHtml, formatNumber, slugify } = require("../../api/_seo/text");
const { geoLevelLabel, sourceName } = require("../../api/_seo/priceCity");
const CHROME_WEBSTORE_URL = "https://chromewebstore.google.com/detail/inmoradar/mbkjlkagblkmdnjggoggbjiohbjebaab";

function sourceShortName(source) {
  if (source === "mivau_appraisal") return "MIVAU tasacion";
  if (source === "serpavi") return "SERPAVI";
  if (source === "idealista_public_report") return "Idealista";
  return sourceName(source);
}

function priceText(record, operation) {
  if (!record?.price_eur_m2) return "sin dato suficiente";
  const decimals = operation === "rent" ? 2 : 0;
  const unit = operation === "rent" ? "€/m²/mes" : "€/m²";
  return `${formatNumber(record.price_eur_m2, decimals)} ${unit}`;
}

function recordLine(record, label) {
  if (!record) {
    return `<li><strong>${escapeHtml(label)}:</strong> sin fuente verificable suficiente para publicar como contenido indexable.</li>`;
  }
  return `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(priceText(record, record.operation))}. <strong>Fuente:</strong> <a href="${escapeHtml(
    record.source_url
  )}" target="_blank" rel="noopener nofollow">${escapeHtml(sourceName(record.source))}</a>. <strong>Fecha del dato:</strong> ${escapeHtml(
    record.period_label || record.period_date || "no indicada"
  )}. Nivel geografico: ${escapeHtml(geoLevelLabel(record.geo_level).toLowerCase())}.</li>`;
}

function sourceBlock(sourceData, mode) {
  const rows = mode === "rent" ? [recordLine(sourceData.rent, "Alquiler")] : [recordLine(sourceData.sale, "Venta"), recordLine(sourceData.rent, "Alquiler")];
  return `<ul class="seo-source-list">
${rows.map((row) => `    ${row}`).join("\n")}
  </ul>`;
}

function usefulLinks() {
  return `<section class="seo-section" id="enlaces-utiles">
    <h2>Enlaces utiles</h2>
    <div class="seo-link-bento">
      <a href="/"><span>↗</span><span>Pagina principal de InmoRadar</span><small>INMORADAR.APP</small></a>
      <a href="${CHROME_WEBSTORE_URL}" target="_blank" rel="noopener noreferrer"><span>↗</span><span>Instalar InmoRadar en Chrome</span><small>CHROME WEB STORE</small></a>
    </div>
  </section>`;
}

function cta(city) {
  return `<section class="seo-final-cta" data-city-specific="true">
    <p class="seo-sidebar-kicker">→ ANALIZA ANTES DE CONTACTAR</p>
    <h2>Compara anuncios de vivienda en ${escapeHtml(city)} con mas contexto.</h2>
    <p>InmoRadar calcula el precio por metro cuadrado del anuncio, lo compara con referencias disponibles y resume señales utiles antes de llamar o visitar.</p>
    <div class="seo-final-actions">
      <button class="seo-button seo-button-primary" type="button" data-install-button data-install-source="seo_city_guide_cta">INSTALAR GRATIS EN CHROME</button>
      <a class="seo-button seo-button-secondary" href="/#analisis">VER QUE ANALIZA</a>
    </div>
  </section>`;
}

function disclaimer() {
  return `<aside class="seo-disclaimer">
    <p class="seo-disclaimer-kicker">→ AVISO</p>
    <p>Los datos mostrados son referencias orientativas basadas en fuentes concretas disponibles en el momento de generacion. Pueden quedar desactualizados o no representar todas las zonas del municipio. Esta pagina no constituye una tasacion profesional ni asesoramiento de inversion.</p>
  </aside>`;
}

function faq(city, mode) {
  if (mode === "rent") {
    return [
      {
        question: `¿El precio del alquiler por metro cuadrado en ${city} es exacto?`,
        answer:
          "No. Es una referencia agregada segun la fuente disponible. Sirve para comparar anuncios de alquiler, no para fijar una renta exacta para una vivienda concreta."
      },
      {
        question: `¿Como comparo dos alquileres en ${city}?`,
        answer:
          "Conviene dividir la renta mensual entre la superficie anunciada y revisar si el resultado se aleja mucho de la referencia publicada, siempre mirando barrio, estado, amueblamiento y gastos incluidos."
      },
      {
        question: "¿Que diferencia hay entre municipio y zona?",
        answer:
          "Una referencia municipal resume el conjunto del municipio. Una referencia de zona puede estar mas cerca del entorno del anuncio, pero tambien sigue siendo un dato agregado."
      },
      {
        question: "¿Que gastos pueden cambiar la comparacion?",
        answer:
          "Comunidad, suministros, calefaccion, garaje, trastero, muebles, duracion del contrato y actualizaciones de renta pueden hacer que dos anuncios parecidos tengan costes reales distintos."
      },
      {
        question: "¿Como ayuda InmoRadar en un anuncio de alquiler?",
        answer:
          "InmoRadar ayuda a calcular el precio por metro cuadrado, revisar la diferencia frente a referencias y ordenar señales de zona antes de contactar."
      }
    ];
  }

  return [
    {
      question: `¿Como se si un piso esta caro en ${city}?`,
      answer:
        "Calcula el precio por metro cuadrado del anuncio y comparalo con una referencia de mercado disponible. Despues revisa si estado, planta, ascensor, garaje, terraza o ubicacion justifican la diferencia."
    },
    {
      question: "¿Un anuncio por encima de mercado es necesariamente malo?",
      answer:
        "No. Puede tener caracteristicas que justifiquen parte de la diferencia. La referencia sirve para detectar preguntas importantes, no para decidir automaticamente."
    },
    {
      question: "¿Un anuncio barato garantiza una oportunidad?",
      answer:
        "Tampoco. Puede esconder reforma, ruido, poca luz, cargas, mala eficiencia energetica o costes futuros. Hay que revisar el anuncio completo."
    },
    {
      question: "¿Sirve para compra y alquiler?",
      answer:
        "Si existen datos suficientes para ambas operaciones, la comparacion puede hacerse en compra y alquiler. Si falta una fuente, la pagina debe indicarlo sin inventar cifras."
    },
    {
      question: "¿InmoRadar sustituye una tasacion?",
      answer:
        "No. InmoRadar es una ayuda previa para filtrar anuncios y preparar preguntas. Una tasacion profesional analiza la vivienda concreta con otra profundidad."
    }
  ];
}

function faqHtml(items) {
  return `<section class="seo-section seo-faq" id="faq" data-section-id="faq">
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

function rentBody({ city, slug, sourceData }) {
  const rent = sourceData.rent;
  const rentReference = rent ? priceText(rent, "rent") : "sin dato de alquiler suficiente";
  const level = rent ? geoLevelLabel(rent.geo_level).toLowerCase() : "referencia pendiente";
  const faqItems = faq(city, "rent");

  return `<article class="seo-reading" data-template="rent_city" data-testid="page-rent-m2-${escapeHtml(slug)}">
    <nav class="seo-breadcrumb" aria-label="Breadcrumb"><a href="/">INMORADAR</a><span>/</span><a href="/precio-alquiler/${escapeHtml(slug)}/">ALQUILER</a><span>/</span><strong>${escapeHtml(city.toUpperCase())}</strong></nav>
    <header class="seo-page-hero" data-city-specific="true">
      <p class="seo-page-eyebrow">→ PRECIO ALQUILER · ${escapeHtml(city.toUpperCase())}</p>
      <h1>Precio del alquiler por metro cuadrado en ${escapeHtml(city)}</h1>
      <p class="seo-lead">Referencia orientativa para comparar anuncios de alquiler en ${escapeHtml(city)} antes de contactar. La pagina muestra fuente, fecha del dato, nivel geografico y una forma practica de leer el precio mensual por metro cuadrado.</p>
      <div class="seo-meta-row"><span>REFERENCIA: ${escapeHtml(level.toUpperCase())}</span><span>DATO: ${escapeHtml(rentReference.toUpperCase())}</span></div>
    </header>

    <div class="seo-reading-grid">
      <aside class="seo-sidebar">
        <section class="seo-data-card">
          <p class="seo-sidebar-kicker">→ DATOS DISPONIBLES</p>
          <div class="seo-stat-grid">
            <div class="seo-stat-cell">
              <span class="seo-stat-label">ALQUILER · €/M²/MES</span>
              <span class="seo-stat-number">${escapeHtml(rent ? formatNumber(rent.price_eur_m2, 2) : "—")}</span>
              <span class="seo-stat-unit">€/M²/MES</span>
              <span class="seo-stat-meta">${escapeHtml(rent ? `${geoLevelLabel(rent.geo_level)} · ${sourceShortName(rent.source)} · ${rent.period_label || rent.period_date}` : "PENDIENTE DE FUENTE")}</span>
            </div>
          </div>
          <p class="seo-card-note">Referencia informativa. No sustituye una valoracion profesional ni garantiza el precio final de ningun contrato.</p>
        </section>
      </aside>

      <div class="seo-content">
        <section class="seo-section" id="datos-disponibles" data-section-id="datos-disponibles" data-city-specific="true">
          <h2>Datos de alquiler disponibles para ${escapeHtml(city)}</h2>
          ${sourceBlock(sourceData, "rent")}
          <p>Antes de responder a un anuncio de alquiler en ${escapeHtml(city)}, conviene convertir la renta mensual a precio por metro cuadrado. Esta metrica permite comparar viviendas con superficies distintas y evita que un alquiler parezca competitivo solo porque el piso es pequeño o porque el precio total encaja de primeras.</p>
          <p>Si el dato aparece como ${escapeHtml(level)}, debe leerse como una referencia agregada. No describe una calle concreta ni promete que todos los barrios de ${escapeHtml(city)} tengan el mismo comportamiento. La comparacion es mas util cuando se combina con estado del inmueble, mobiliario, gastos incluidos, transporte y disponibilidad real.</p>
        </section>

        <section class="seo-section" id="interpretar-alquiler" data-section-id="interpretar-alquiler" data-city-specific="true">
          <h2>Como interpretar un alquiler en ${escapeHtml(city)}</h2>
          <p>El primer paso es dividir la renta mensual entre la superficie anunciada. Un piso de 80 metros cuadrados anunciado por 960 euros al mes equivale a 12 euros por metro cuadrado al mes. Ese resultado se compara con la referencia disponible, pero siempre con prudencia: los anuncios pueden mezclar superficie util y construida, incluir muebles, garaje, comunidad o suministros, o tener condiciones particulares de contrato.</p>
          <p>En ${escapeHtml(city)}, un anuncio por encima de la referencia puede tener sentido si esta reformado, tiene buena eficiencia energetica, permite entrar rapido, incluye plaza de garaje, esta amueblado con calidad o se ubica en una zona especialmente demandada. Un anuncio por debajo tambien puede requerir cuidado si tiene poca luz, ruido, mala conservacion, gastos no incluidos o condiciones contractuales menos favorables.</p>
          <div class="seo-formula"><p>FORMULA</p><code>alquiler_m2 = renta_mensual / superficie_m2</code><span>La comparacion debe hacerse contra la referencia de alquiler publicada, no contra una cifra inventada para una calle concreta.</span></div>
        </section>

        <section class="seo-section" id="preguntas-anuncio" data-section-id="preguntas-anuncio" data-city-specific="true">
          <h2>Preguntas utiles antes de contactar en ${escapeHtml(city)}</h2>
          <ul>
            <li>Si la superficie anunciada es util o construida, porque cambia el calculo del alquiler por metro cuadrado.</li>
            <li>Si la comunidad, calefaccion, agua, basura, garaje o trastero estan incluidos en la renta mensual.</li>
            <li>Si el contrato permite larga estancia, actualizacion de renta clara y condiciones de entrada razonables.</li>
            <li>Si la vivienda esta amueblada, equipada y en buen estado para entrar sin gastos inmediatos.</li>
            <li>Si la zona encaja con transporte, aparcamiento, ruido y servicios necesarios para el dia a dia.</li>
          </ul>
          <p>Esta lista ayuda a que la referencia de alquiler no se lea aislada. El precio por metro cuadrado es una señal, pero el coste real de vivir en una vivienda depende de mas variables.</p>
        </section>

        <section class="seo-section" id="inmoradar" data-section-id="inmoradar" data-city-specific="true">
          <h2>Como ayuda InmoRadar con alquileres en ${escapeHtml(city)}</h2>
          <p>InmoRadar esta pensado para revisar anuncios antes de contactar. Calcula el precio por metro cuadrado, compara con referencias disponibles y añade señales de zona como transporte cercano, dificultad estimada de aparcamiento, posibles indicios de ruido y puntos relevantes del anuncio.</p>
          <p>Para alquiler, esto ayuda a priorizar anuncios que merecen visita y a preparar preguntas concretas. En lugar de mirar solo la renta mensual, puedes revisar si el precio por metro cuadrado esta en rango, si hay gastos que cambian el coste real y si la zona encaja con tus rutinas.</p>
        </section>
        ${usefulLinks()}
        ${faqHtml(faqItems)}
        ${cta(city)}
        ${disclaimer()}
      </div>
    </div>
  </article>`;
}

function expensiveBody({ city, slug, sourceData }) {
  const sale = sourceData.sale;
  const rent = sourceData.rent;
  const saleReference = sale ? priceText(sale, "sale") : "sin dato de venta suficiente";
  const rentReference = rent ? priceText(rent, "rent") : "sin dato de alquiler suficiente";
  const faqItems = faq(city, "expensive");

  return `<article class="seo-reading" data-template="expensive_listing_city" data-testid="page-expensive-${escapeHtml(slug)}">
    <nav class="seo-breadcrumb" aria-label="Breadcrumb"><a href="/">INMORADAR</a><span>/</span><a href="/saber-si-piso-esta-caro/${escapeHtml(slug)}/">ANALIZAR PRECIO</a><span>/</span><strong>${escapeHtml(city.toUpperCase())}</strong></nav>
    <header class="seo-page-hero" data-city-specific="true">
      <p class="seo-page-eyebrow">→ ANALIZAR ANUNCIO · ${escapeHtml(city.toUpperCase())}</p>
      <h1>Como saber si un piso esta caro en ${escapeHtml(city)}</h1>
      <p class="seo-lead">Guia practica para comparar el precio por metro cuadrado de un anuncio en ${escapeHtml(city)} con referencias de mercado, sin confundir una referencia municipal o de zona con una tasacion exacta.</p>
      <div class="seo-meta-row"><span>VENTA: ${escapeHtml(saleReference.toUpperCase())}</span><span>ALQUILER: ${escapeHtml(rentReference.toUpperCase())}</span></div>
    </header>

    <div class="seo-reading-grid">
      <aside class="seo-sidebar">
        <section class="seo-data-card">
          <p class="seo-sidebar-kicker">→ REFERENCIAS</p>
          <div class="seo-stat-grid">
            <div class="seo-stat-cell"><span class="seo-stat-label">VENTA</span><span class="seo-stat-number">${escapeHtml(sale ? formatNumber(sale.price_eur_m2, 0) : "—")}</span><span class="seo-stat-unit">€/M²</span><span class="seo-stat-meta">${escapeHtml(sale ? `${geoLevelLabel(sale.geo_level)} · ${sourceShortName(sale.source)} · ${sale.period_label || sale.period_date}` : "PENDIENTE")}</span></div>
            <div class="seo-stat-cell"><span class="seo-stat-label">ALQUILER</span><span class="seo-stat-number">${escapeHtml(rent ? formatNumber(rent.price_eur_m2, 2) : "—")}</span><span class="seo-stat-unit">€/M²/MES</span><span class="seo-stat-meta">${escapeHtml(rent ? `${geoLevelLabel(rent.geo_level)} · ${sourceShortName(rent.source)} · ${rent.period_label || rent.period_date}` : "PENDIENTE")}</span></div>
          </div>
        </section>
      </aside>

      <div class="seo-content">
        <section class="seo-section" id="datos-disponibles" data-section-id="datos-disponibles" data-city-specific="true">
          <h2>Referencias disponibles para ${escapeHtml(city)}</h2>
          ${sourceBlock(sourceData, "both")}
          <p>Para saber si un piso esta caro en ${escapeHtml(city)}, la primera comparacion debe hacerse con el precio por metro cuadrado. El precio total puede engañar: una vivienda pequeña puede parecer asequible y tener un precio por metro cuadrado alto, mientras que una vivienda grande puede parecer cara y estar mas cerca de mercado.</p>
          <p>La referencia publicada debe leerse con su nivel geografico. Si el dato es municipal, es una referencia municipal y no una cifra exacta para una via concreta. Si el dato es de zona, es una referencia de zona y sigue siendo agregada. Esta diferencia es importante para evitar decisiones precipitadas.</p>
        </section>

        <section class="seo-section" id="calculo" data-section-id="calculo" data-city-specific="true">
          <h2>Calcula el precio por metro cuadrado del anuncio</h2>
          <div class="seo-formula"><p>FORMULA</p><code>precio_m2 = precio_total / superficie_m2</code><span>Un piso anunciado por 240.000 euros y 100 metros cuadrados equivale a 2.400 euros por metro cuadrado.</span></div>
          <p>Con esa cifra puedes comparar el anuncio con la referencia de ${escapeHtml(city)}. Si queda bastante por encima, conviene buscar la explicacion: reforma reciente, ascensor, plaza de garaje, terraza, orientacion, eficiencia energetica, calle concreta, edificio cuidado o escasez de oferta similar. Si queda por debajo, tambien conviene revisar si hay problemas de estado, ruido, poca luz, planta complicada, cargas o gastos futuros.</p>
          <p>El objetivo no es etiquetar el anuncio como bueno o malo de forma automatica, sino detectar si el precio pide mas preguntas. La comparacion sirve para negociar mejor, priorizar visitas y descartar anuncios que no compensan el esfuerzo.</p>
        </section>

        <section class="seo-section" id="senales" data-section-id="senales" data-city-specific="true">
          <h2>Señales que conviene revisar en ${escapeHtml(city)}</h2>
          <ul>
            <li>Estado real de la vivienda, antiguedad de reforma y calidad de instalaciones.</li>
            <li>Superficie util frente a superficie construida, porque cambia mucho el calculo.</li>
            <li>Planta, ascensor, accesibilidad, orientacion, luz y ventilacion.</li>
            <li>Garaje, trastero, terraza, balcon, zonas comunes y gastos de comunidad.</li>
            <li>Transporte cercano, aparcamiento, ruido, servicios y sensacion del entorno.</li>
            <li>Documentacion, cargas, IBI, certificacion energetica y margen de negociacion.</li>
          </ul>
          <p>En ${escapeHtml(city)}, dos anuncios con el mismo precio por metro cuadrado pueden ser muy distintos si uno exige reforma y otro permite entrar a vivir. Por eso la referencia de mercado es el punto de partida, no la conclusion.</p>
        </section>

        <section class="seo-section" id="inmoradar" data-section-id="inmoradar" data-city-specific="true">
          <h2>Como ayuda InmoRadar antes de contactar en ${escapeHtml(city)}</h2>
          <p>InmoRadar ayuda a revisar anuncios con una mirada mas ordenada. Calcula el precio por metro cuadrado, compara con referencias disponibles, estima diferencias porcentuales y añade señales de transporte, aparcamiento, ruido y elementos relevantes del anuncio.</p>
          <p>Esto permite llegar al contacto con mejores preguntas: por que el precio esta por encima de referencia, si los metros son utiles o construidos, que gastos se suman, que se incluye en el precio y que aspectos del entorno pueden afectar al valor practico de la vivienda.</p>
        </section>
        ${usefulLinks()}
        ${faqHtml(faqItems)}
        ${cta(city)}
        ${disclaimer()}
      </div>
    </div>
  </article>`;
}

function buildRentCityLanding(opportunity, sourceData) {
  const city = displayName(opportunity.city);
  const slug = `precio-alquiler/${slugify(city)}`;
  const bodyHtml = rentBody({ city, slug: slugify(city), sourceData });
  return {
    slug,
    title: `Precio del alquiler por metro cuadrado en ${city}`,
    meta_title: `Precio del alquiler por metro cuadrado en ${city} · InmoRadar`,
    meta_description: `Consulta una referencia de alquiler por metro cuadrado en ${city}, con fuente, fecha y pautas para comparar anuncios antes de contactar.`,
    h1: `Precio del alquiler por metro cuadrado en ${city}`,
    body_html: bodyHtml,
    city,
    province: displayName(opportunity.province || ""),
    autonomous_community: displayName(opportunity.autonomous_community || ""),
    template_type: "rent_city",
    canonical_url: canonicalForSlug(slug),
    word_count: countWords(bodyHtml),
    faq: faq(city, "rent")
  };
}

function buildExpensiveListingCityLanding(opportunity, sourceData) {
  const city = displayName(opportunity.city);
  const slug = `saber-si-piso-esta-caro/${slugify(city)}`;
  const bodyHtml = expensiveBody({ city, slug: slugify(city), sourceData });
  return {
    slug,
    title: `Como saber si un piso esta caro en ${city}`,
    meta_title: `Como saber si un piso esta caro en ${city} · InmoRadar`,
    meta_description: `Guia para saber si un piso esta caro en ${city}: calcula €/m², compara referencias y revisa señales antes de contactar.`,
    h1: `Como saber si un piso esta caro en ${city}`,
    body_html: bodyHtml,
    city,
    province: displayName(opportunity.province || ""),
    autonomous_community: displayName(opportunity.autonomous_community || ""),
    template_type: "expensive_listing_city",
    canonical_url: canonicalForSlug(slug),
    word_count: countWords(bodyHtml),
    faq: faq(city, "expensive")
  };
}

module.exports = {
  buildExpensiveListingCityLanding,
  buildRentCityLanding
};
