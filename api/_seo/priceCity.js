const { canonicalForSlug, countWords, displayName, escapeHtml, formatNumber, slugify } = require("./text");
const CHROME_WEBSTORE_URL = "https://chromewebstore.google.com/detail/inmoradar/mbkjlkagblkmdnjggoggbjiohbjebaab";

function geoLevelLabel(geoLevel) {
  const labels = {
    municipality: "Referencia municipal",
    neighbourhood: "Referencia de zona",
    zone: "Referencia de zona",
    district: "Referencia de distrito",
    province: "Referencia provincial",
    autonomous_community: "Referencia autonómica",
    country: "Referencia estatal"
  };
  return labels[geoLevel] || "Referencia territorial";
}

function sourceName(source) {
  const names = {
    idealista_public_report: "Idealista public reports",
    mivau_appraisal: "MIVAU tasación",
    serpavi: "SERPAVI alquiler"
  };
  return names[source] || source;
}

function operationLabel(operation) {
  return operation === "rent" ? "Alquiler" : "Venta";
}

function sourceShortName(source) {
  if (source === "mivau_appraisal") return "MIVAU tasación";
  if (source === "serpavi") return "SERPAVI";
  if (source === "idealista_public_report") return "Idealista";
  return sourceName(source);
}

function formatPrice(record, operation) {
  if (!record?.price_eur_m2) return null;
  const decimals = operation === "rent" ? 2 : 0;
  const suffix = operation === "rent" ? " €/m²/mes" : " €/m²";
  return `${formatNumber(record.price_eur_m2, decimals)}${suffix}`;
}

function formatRawValue(record, operation) {
  if (!record?.price_eur_m2) return "—";
  return formatNumber(record.price_eur_m2, operation === "rent" ? 2 : 0);
}

function recordMeta(record) {
  if (!record) return "SIN DATO";
  return `${geoLevelLabel(record.geo_level).toUpperCase()} · ${sourceShortName(record.source).toUpperCase()} · ${String(
    record.period_label || record.period_date || "FECHA NO INDICADA"
  ).toUpperCase()}`;
}

function publishedDateLabel(date = new Date()) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  })
    .format(new Date(date))
    .replace(".", "");
}

function isoDate(date = new Date()) {
  return new Date(date).toISOString().slice(0, 10);
}

function externalIcon() {
  return `<svg class="seo-external-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M7 17 17 7"></path><path d="M7 7h10v10"></path></svg>`;
}

function icon(name) {
  const paths = {
    mapPin: '<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"></path><circle cx="12" cy="10" r="3"></circle>',
    database:
      '<ellipse cx="12" cy="5" rx="8" ry="3"></ellipse><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"></path><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"></path>',
    clock: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>',
    arrowUpRight: '<path d="M7 17 17 7"></path><path d="M7 7h10v10"></path>'
  };
  return `<svg class="seo-icon" aria-hidden="true" viewBox="0 0 24 24">${paths[name] || paths.arrowUpRight}</svg>`;
}

function faq(city) {
  return [
    {
      question: `¿El precio del metro cuadrado en ${city} es exacto?`,
      answer:
        "No. Es una referencia de mercado basada en la fuente disponible y en su nivel geográfico. Sirve para comparar anuncios, no para fijar el valor exacto de una vivienda concreta."
    },
    {
      question: `¿Sirve para comprar y alquilar en ${city}?`,
      answer:
        "Sí, cuando existen datos diferenciados de venta y alquiler. Si falta una de las dos operaciones, InmoRadar debe mostrar solo el dato disponible y mantener la página en revisión o noindex si la calidad no llega al mínimo."
    },
    {
      question: "¿Qué diferencia hay entre municipio y zona?",
      answer:
        "Una referencia municipal resume el conjunto del municipio. Una referencia de zona o barrio puede estar más cerca del anuncio, pero depende de que la fuente publique datos suficientes para esa zona."
    },
    {
      question: "¿Sustituye una tasación?",
      answer:
        "No. Una tasación considera características concretas del inmueble, estado, planta, orientación, cargas, comparables y visita técnica. Esta página solo ofrece contexto previo para filtrar mejor."
    },
    {
      question: "¿Cómo uso InmoRadar en un anuncio?",
      answer:
        "Abre el anuncio, revisa superficie y precio, calcula el €/m² y compáralo con la referencia visible. InmoRadar ayuda a ordenar esa comparación junto con señales de zona, aparcamiento, transporte y ruido."
    }
  ];
}

function sourceLinks(records) {
  if (!records.length) {
    return `<p>No hay una fuente municipal o de zona suficiente para generar una página indexable. El borrador debe quedar en noindex hasta incorporar datos verificables.</p>`;
  }

  return `<ul class="seo-source-list">
${records
  .map(
    (record) => `    <li><strong>${escapeHtml(operationLabel(record.operation))}:</strong> ${escapeHtml(
      formatPrice(record, record.operation)
    )}. Nivel geográfico: ${escapeHtml(geoLevelLabel(record.geo_level).toLowerCase())}. Fuente: <a href="${escapeHtml(
      record.source_url
    )}" target="_blank" rel="noopener nofollow">${escapeHtml(sourceName(record.source))}${externalIcon()}</a>. Fecha del dato: ${escapeHtml(
      record.period_label || record.period_date || "no indicada"
    )}.</li>`
  )
  .join("\n")}
  </ul>`;
}

function dataSummaryRows(sourceData) {
  const sale = sourceData.sale;
  const rent = sourceData.rent;
  const levels = [sale, rent]
    .filter(Boolean)
    .map((record) => geoLevelLabel(record.geo_level))
    .filter((value, index, all) => all.indexOf(value) === index)
    .join(" · ");
  const sourceDates = [sale, rent]
    .filter(Boolean)
    .map((record) => `${sourceShortName(record.source)} ${record.period_label || record.period_date || "fecha no indicada"}`)
    .join(" · ");

  return [
    ["Venta", sale ? formatPrice(sale, "sale") : "Sin dato municipal o de zona disponible"],
    ["Alquiler", rent ? formatPrice(rent, "rent") : "Sin dato municipal o de zona disponible"],
    ["Nivel geográfico", levels || "Sin referencia suficiente"],
    ["Fuente · Fecha", sourceDates || "Pendiente de fuente"]
  ];
}

function dataSummary(sourceData) {
  return `<div class="seo-data-grid" data-testid="page-precio-m2-${escapeHtml(slugify(sourceData.city || "ciudad"))}-data-summary">
${dataSummaryRows(sourceData)
  .map(
    ([label, value]) => `    <div class="seo-data-label">${escapeHtml(label)}</div>
    <div class="seo-data-value">${escapeHtml(value)}</div>`
  )
  .join("\n")}
  </div>`;
}

function bentoCell(record, operation) {
  if (!record) return "";
  const unit = operation === "rent" ? "€/M²/MES" : "€/M²";
  return `<div class="seo-stat-cell">
      <span class="seo-stat-label">${operation === "rent" ? "ALQUILER" : "VENTA"} · ${unit}</span>
      <span class="seo-stat-number">${escapeHtml(formatRawValue(record, operation))}</span>
      <span class="seo-stat-unit">${unit}</span>
      <span class="seo-stat-meta">${escapeHtml(recordMeta(record))}</span>
    </div>`;
}

function sidebar({ city, slug, sourceData, updatedLabel }) {
  const sale = sourceData.sale;
  const rent = sourceData.rent;
  const saleReference = sale?.price_eur_m2 || "";

  return `<aside class="seo-sidebar" data-testid="page-precio-m2-${escapeHtml(slug)}-sidebar">
    <nav class="seo-toc" aria-label="En esta página">
      <p class="seo-sidebar-kicker seo-sidebar-kicker-muted">→ EN ESTA PÁGINA</p>
      <a href="#datos-disponibles" data-toc-target="datos-disponibles">01 · Datos disponibles</a>
      <a href="#como-interpretarlo" data-toc-target="como-interpretarlo">02 · Cómo interpretarlo</a>
      <a href="#esta-caro" data-toc-target="esta-caro">03 · ¿Está caro este anuncio?</a>
      <a href="#factores" data-toc-target="factores">04 · Factores que justifican diferencias</a>
      <a href="#como-ayuda" data-toc-target="como-ayuda">05 · Cómo ayuda InmoRadar</a>
      <a href="#faq" data-toc-target="faq">06 · Preguntas frecuentes</a>
    </nav>

    <section class="seo-data-card" aria-label="Datos disponibles">
      <p class="seo-sidebar-kicker">→ DATOS DISPONIBLES</p>
      <div class="seo-stat-grid">
        ${bentoCell(sale, "sale")}
        ${bentoCell(rent, "rent")}
      </div>
      <div class="seo-calculator" data-sale-reference="${escapeHtml(saleReference)}" data-testid="page-precio-m2-${escapeHtml(slug)}-calculator">
        <p class="seo-sidebar-kicker">→ COMPRUEBA UN ANUNCIO</p>
        <label>
          <span>Precio total (€)</span>
          <input type="number" inputmode="decimal" min="0" step="1000" data-seo-calc-price placeholder="210000">
        </label>
        <label>
          <span>Superficie (m²)</span>
          <input type="number" inputmode="decimal" min="1" step="1" data-seo-calc-area placeholder="100">
        </label>
        <div class="seo-calc-result" aria-live="polite">
          <span class="seo-calc-label">RESULTADO</span>
          <strong data-seo-calc-value>— €/m²</strong>
          <small data-seo-calc-status>Introduce precio y superficie.</small>
        </div>
      </div>
      <p class="seo-card-note">Comparación contra la referencia de venta publicada. Solo informativo. No sustituye una tasación profesional.</p>
    </section>
  </aside>`;
}

function faqHtml(items) {
  return `<section class="seo-section seo-faq" id="faq" data-section-id="faq" aria-labelledby="faq-heading">
    <h2 id="faq-heading">Preguntas frecuentes</h2>
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

function usefulLinks() {
  return `<section class="seo-section seo-useful-links" id="enlaces-utiles" aria-labelledby="enlaces-utiles-heading">
    <h2 id="enlaces-utiles-heading">Enlaces útiles</h2>
    <div class="seo-link-bento">
      <a href="/">
        ${icon("arrowUpRight")}
        <span>Página principal de InmoRadar</span>
        <small>INMORADAR.APP</small>
      </a>
      <a href="/premium">
        ${icon("arrowUpRight")}
        <span>Funciones Premium opcionales</span>
        <small>INMORADAR.APP/PREMIUM</small>
      </a>
    </div>
  </section>`;
}

function finalCta(city) {
  return `<section class="seo-final-cta" data-testid="page-precio-m2-${escapeHtml(slugify(city))}-final-cta">
    <p class="seo-sidebar-kicker">→ ANALIZA ANTES DE CONTACTAR</p>
    <h2>Compara el precio €/m² de cada anuncio en ${escapeHtml(city)}.</h2>
    <p>Instala InmoRadar y empieza a analizar anuncios donde ya buscas.</p>
    <div class="seo-final-actions">
      <button class="seo-button seo-button-primary" type="button" data-install-button data-install-source="seo_price_city">EMPEZAR GRATIS ${icon("arrowUpRight")}</button>
      <a class="seo-button seo-button-secondary" href="/#analisis">VER QUÉ ANALIZA</a>
    </div>
  </section>`;
}

function disclaimer(publishedLabel, updatedLabel) {
  return `<aside class="seo-disclaimer">
    <p class="seo-disclaimer-kicker">→ AVISO</p>
    <p>Los datos mostrados son una referencia orientativa basada en fuentes oficiales (MIVAU, SERPAVI) en el momento de publicación. Pueden quedar desactualizados o no representar todas las zonas del municipio. Esta página no constituye una tasación profesional ni asesoramiento de inversión.</p>
    <small>PUBLICADO ${escapeHtml(publishedLabel)} · ÚLTIMA REVISIÓN ${escapeHtml(updatedLabel)}</small>
  </aside>`;
}

function sourceMetaLabel(sourceData) {
  const sources = [sourceData.sale, sourceData.rent]
    .filter(Boolean)
    .map((record) => `${sourceShortName(record.source)} ${record.period_label || record.period_date || ""}`.trim())
    .join(" · ");
  return sources || "Fuente pendiente";
}

function buildPrecioMetroCuadradoCiudad({ city, province, autonomousCommunity, slug, sourceData, publishedAt, updatedAt }) {
  const sale = sourceData.sale;
  const rent = sourceData.rent;
  const hasRent = Boolean(rent);
  const sourceRecords = sourceData.records || [];
  const faqItems = faq(city);
  const publishedLabel = publishedDateLabel(publishedAt);
  const updatedLabel = publishedDateLabel(updatedAt);
  const updatedIso = isoDate(updatedAt);
  const salePrice = sale ? formatPrice(sale, "sale") : null;
  const rentPrice = rent ? formatPrice(rent, "rent") : null;
  sourceData.city = city;

  const availabilityCopy = sourceRecords.length
    ? `La referencia disponible para ${escapeHtml(city)} procede de fuentes concretas y debe leerse con su nivel geográfico: ${escapeHtml(
        sourceRecords.map((record) => geoLevelLabel(record.geo_level).toLowerCase()).filter((value, index, all) => all.indexOf(value) === index).join(" y ")
      )}.`
    : `Ahora mismo no hay datos suficientes de ${escapeHtml(city)} para publicar una página indexable. Este borrador existe para revisar la oportunidad sin inventar cifras.`;

  const operationCopy = hasRent ? "comprar y alquilar" : "comprar";
  const rentCopy = hasRent
    ? ` Para alquiler, la referencia recogida es ${escapeHtml(rentPrice)}.`
    : " Para alquiler, la página debe indicar que falta dato cuando no exista una fuente verificable.";

  return `<article class="seo-reading" data-template="price_city" data-testid="page-precio-m2-${escapeHtml(slug)}">
  <nav class="seo-breadcrumb" aria-label="Breadcrumb">
    <a href="/">INMORADAR</a><span>/</span><a href="/precio-metro-cuadrado/${escapeHtml(slug)}/">PRECIO M²</a><span>/</span><a href="/precio-metro-cuadrado/${escapeHtml(slug)}/">${escapeHtml(
      (province || autonomousCommunity || "ESPAÑA").toUpperCase()
    )}</a><span>/</span><strong>${escapeHtml(city.toUpperCase())}</strong>
  </nav>

  <header class="seo-page-hero" data-city-specific="true">
    <p class="seo-page-eyebrow">→ PRECIO METRO CUADRADO · ${escapeHtml(city.toUpperCase())}</p>
    <h1>Precio del metro cuadrado en ${escapeHtml(city)}</h1>
    <p class="seo-lead">Referencia orientativa de precio €/m² para ${escapeHtml(
      operationCopy
    )} en ${escapeHtml(city)}. Fuente, fecha del dato y cómo comparar anuncios con InmoRadar antes de contactar.</p>
    <div class="seo-meta-row">
      <span>${icon("mapPin")}${escapeHtml(
        sourceRecords[0] ? geoLevelLabel(sourceRecords[0].geo_level).toUpperCase() : "REFERENCIA PENDIENTE"
      )}</span>
      <span>${icon("database")}${escapeHtml(sourceMetaLabel(sourceData).toUpperCase())}</span>
      <span>${icon("clock")}ACTUALIZADO ${escapeHtml(updatedIso)}</span>
    </div>
  </header>

  <div class="seo-reading-grid">
    ${sidebar({ city, slug, sourceData, updatedLabel })}

    <div class="seo-content">
      <section class="seo-section" id="datos-disponibles" data-section-id="datos-disponibles" data-city-specific="true">
        <h2>Datos disponibles para ${escapeHtml(city)}</h2>
        ${dataSummary(sourceData)}
        ${sourceLinks(sourceRecords)}
        <p>${availabilityCopy}</p>
        <p>Si el nivel geográfico indicado es una referencia municipal, el dato resume el municipio y no describe una calle concreta. Si aparece como referencia de zona, puede estar más cerca del entorno buscado, aunque sigue siendo una señal agregada y no el resultado de una valoración individual de la vivienda.</p>
      </section>

      <section class="seo-section" id="como-interpretarlo" data-section-id="como-interpretarlo" data-city-specific="true">
        <h2>Cómo interpretar el precio en ${escapeHtml(city)}</h2>
        <p>El precio por metro cuadrado es útil porque permite comparar viviendas de tamaños distintos con una unidad común. En ${escapeHtml(
          city
        )}, una vivienda pequeña puede parecer más barata por precio total y, aun así, estar por encima de la referencia por metro cuadrado. Al contrario, un piso grande puede tener un precio total alto, pero encajar mejor si el €/m² está cerca de la referencia publicada.</p>
        <p>${salePrice ? `Para venta, la referencia recogida es ${escapeHtml(salePrice)}.` : "Para venta, este borrador no debe inventar una cifra si la fuente aún no está disponible."}${rentCopy} En ambos casos, la comparación debe leerse junto con el estado del inmueble, el edificio, el barrio concreto y las condiciones visibles del anuncio.</p>
        <p>La señal más importante no es decidir si una vivienda está bien o mal solo con una cifra, sino detectar cuándo merece la pena hacer más preguntas antes de visitar, negociar o descartar. InmoRadar usa esta lógica: mostrar contexto para que el usuario pueda priorizar anuncios con más criterio.</p>
      </section>

      <section class="seo-section" id="esta-caro" data-section-id="esta-caro" data-city-specific="true">
        <h2>Cómo saber si un anuncio está caro en ${escapeHtml(city)}</h2>
        <div class="seo-formula">
          <p>FÓRMULA</p>
          <code>precio_m2 = precio_total / superficie_m2</code>
          <span>Un piso de 100 m² anunciado por 210.000 € equivale a 2.100 €/m².</span>
        </div>
        <p>Ese resultado se compara con la referencia de mercado disponible, siempre teniendo en cuenta si la fuente es municipal, de zona o de otro nivel territorial.</p>
        <p>Si el anuncio queda bastante por encima de la referencia, no significa automáticamente que sea una mala opción. Puede tener reforma reciente, ascensor, garaje, terraza, buena orientación, eficiencia energética superior, vistas o una ubicación concreta con demanda. Si queda muy por debajo, tampoco garantiza una oportunidad: puede haber limitaciones, estado deficiente, cargas, ruido, falta de luz, planta complicada o costes futuros que no se aprecian en el primer vistazo.</p>
        <p>Para ${escapeHtml(
          city
        )}, la revisión recomendable es anotar precio total, superficie útil si está disponible, superficie construida, gastos de comunidad, IBI, estado del edificio, planta, ascensor, plaza de garaje, cercanía a transporte y señales del entorno. Después, comparar el €/m² del anuncio con la referencia y decidir si compensa pedir más información.</p>
      </section>

      <section class="seo-section" id="factores" data-section-id="factores">
        <h2>Factores que pueden justificar diferencias</h2>
        <ul>
          <li>Estado del inmueble, necesidad de reforma y calidad de los acabados.</li>
          <li>Planta, ascensor, accesibilidad y orientación.</li>
          <li>Garaje, trastero, terraza, balcón o zonas comunes.</li>
          <li>Barrio concreto, calle, ruido, servicios y transporte cercano.</li>
          <li>Eficiencia energética, calefacción, climatización y costes de mantenimiento.</li>
          <li>Situación registral, cargas, disponibilidad y margen de negociación.</li>
        </ul>
        <p>Estos factores explican por qué dos anuncios en el mismo municipio pueden tener precios distintos. La referencia ayuda a ordenar la conversación, pero no sustituye la revisión del anuncio, la documentación ni una tasación profesional cuando sea necesaria.</p>
      </section>

      <section class="seo-section" id="como-ayuda" data-section-id="como-ayuda" data-city-specific="true">
        <h2>Cómo ayuda InmoRadar al buscar vivienda en ${escapeHtml(city)}</h2>
        <p>InmoRadar está pensado para analizar anuncios antes de contactar. La extensión calcula el precio €/m² del anuncio, lo compara con una referencia de mercado cuando existe, muestra la diferencia porcentual y añade señales del entorno como transporte cercano, dificultad estimada de aparcamiento, posibles señales de ruido y puntos relevantes del propio anuncio.</p>
        <p>La idea es reducir llamadas y visitas poco útiles. En lugar de mirar solo el precio total, puedes revisar si el anuncio encaja con la referencia disponible, si la zona puede tener costes prácticos para tu día a día y qué preguntas conviene hacer al anunciante.</p>
        <div class="seo-inline-cta">
          <div>
            <p class="seo-sidebar-kicker">→ AHORRA TIEMPO</p>
            <h3>Analiza anuncios antes de contactar.</h3>
          </div>
          <button class="seo-button seo-button-secondary" type="button" data-install-button data-install-source="seo_price_city_inline">EMPEZAR GRATIS</button>
        </div>
      </section>

      ${usefulLinks()}
      ${faqHtml(faqItems)}
      ${finalCta(city)}
      ${disclaimer(publishedLabel, updatedLabel)}
    </div>
  </div>
</article>`;
}

function buildPriceCityLanding(opportunity, sourceData) {
  const city = displayName(opportunity.city);
  const province = displayName(opportunity.province || "");
  const autonomousCommunity = displayName(opportunity.autonomous_community || "");
  const slug = `precio-metro-cuadrado/${slugify(city)}`;
  const citySlug = slugify(city);
  const title = `Precio del metro cuadrado en ${city}`;
  const metaTitle = `Precio del metro cuadrado en ${city} · InmoRadar`;
  const metaDescription = `Consulta una referencia de precio por metro cuadrado en ${city}, con fuente, fecha, nivel geográfico y pautas para comparar anuncios con InmoRadar.`;
  const h1 = `Precio del metro cuadrado en ${city}`;
  const faqItems = faq(city);
  const now = new Date();
  const bodyHtml = buildPrecioMetroCuadradoCiudad({
    city,
    province,
    autonomousCommunity,
    slug: citySlug,
    sourceData,
    publishedAt: now,
    updatedAt: now
  });

  return {
    slug,
    title,
    meta_title: metaTitle,
    meta_description: metaDescription,
    h1,
    body_html: bodyHtml,
    city,
    province,
    autonomous_community: autonomousCommunity,
    template_type: "price_city",
    canonical_url: canonicalForSlug(slug),
    word_count: countWords(bodyHtml),
    faq: faqItems
  };
}

module.exports = {
  buildPrecioMetroCuadradoCiudad,
  buildPriceCityLanding,
  geoLevelLabel,
  sourceName
};
