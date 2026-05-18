const { canonicalForSlug, countWords, displayName, escapeHtml, formatNumber, slugify } = require("./text");

function geoLevelLabel(geoLevel) {
  const labels = {
    municipality: "referencia municipal",
    neighbourhood: "referencia de zona",
    zone: "referencia de zona",
    district: "referencia de distrito",
    province: "referencia provincial",
    autonomous_community: "referencia autonómica",
    country: "referencia estatal"
  };
  return labels[geoLevel] || "referencia territorial";
}

function sourceName(source) {
  const names = {
    idealista_public_report: "Idealista public reports",
    mivau_appraisal: "MIVAU appraisal / tasación",
    serpavi: "SERPAVI alquiler"
  };
  return names[source] || source;
}

function formatPrice(record, operation) {
  if (!record?.price_eur_m2) return null;
  const decimals = operation === "rent" ? 2 : 0;
  const suffix = operation === "rent" ? " €/m²/mes" : " €/m²";
  return `${formatNumber(record.price_eur_m2, decimals)}${suffix}`;
}

function sourceRows(records) {
  if (!records.length) {
    return `<p>No hay una fuente municipal o de zona suficiente para generar una página indexable. El borrador debe quedar en noindex hasta incorporar datos verificables.</p>`;
  }

  return `<ul class="seo-source-list">
${records
  .map((record) => {
    const operationLabel = record.operation === "rent" ? "Alquiler" : "Venta";
    return `    <li><strong>${operationLabel}:</strong> ${escapeHtml(formatPrice(record, record.operation))}. Nivel geográfico: ${escapeHtml(
      geoLevelLabel(record.geo_level)
    )}. Fuente: <a href="${escapeHtml(record.source_url)}" rel="nofollow noopener">${escapeHtml(sourceName(record.source))}</a>. Fecha del dato: ${escapeHtml(
      record.period_label || record.period_date || "no indicada"
    )}.</li>`;
  })
  .join("\n")}
  </ul>`;
}

function dataTable(sourceData) {
  const sale = sourceData.sale;
  const rent = sourceData.rent;
  return `<table class="seo-data-table">
    <tbody>
      <tr><th>Venta</th><td>${sale ? escapeHtml(formatPrice(sale, "sale")) : "Sin dato municipal o de zona disponible"}</td></tr>
      <tr><th>Alquiler</th><td>${rent ? escapeHtml(formatPrice(rent, "rent")) : "Sin dato municipal o de zona disponible"}</td></tr>
      <tr><th>Nivel geográfico</th><td>${escapeHtml(
        [sale, rent]
          .filter(Boolean)
          .map((record) => geoLevelLabel(record.geo_level))
          .filter((value, index, all) => all.indexOf(value) === index)
          .join(" y ") || "sin referencia suficiente"
      )}</td></tr>
      <tr><th>Fuente y fecha</th><td>${escapeHtml(
        [sale, rent]
          .filter(Boolean)
          .map((record) => `${sourceName(record.source)} (${record.period_label || record.period_date || "fecha no indicada"})`)
          .join(" · ") || "pendiente de fuente"
      )}</td></tr>
    </tbody>
  </table>`;
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

function faqHtml(items) {
  return `<section class="seo-section seo-faq" aria-labelledby="faq-heading">
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

function buildPriceCityLanding(opportunity, sourceData) {
  const city = displayName(opportunity.city);
  const province = displayName(opportunity.province || "");
  const autonomousCommunity = displayName(opportunity.autonomous_community || "");
  const slug = `precio-metro-cuadrado/${slugify(city)}`;
  const title = `Precio del metro cuadrado en ${city}`;
  const metaTitle = `Precio m² en ${city}: venta y alquiler`;
  const metaDescription = `Consulta una referencia de precio por metro cuadrado en ${city}, con fuente, fecha, nivel geográfico y pautas para comparar anuncios con InmoRadar.`;
  const h1 = `Precio del metro cuadrado en ${city}`;
  const salePrice = sourceData.sale ? formatPrice(sourceData.sale, "sale") : null;
  const rentPrice = sourceData.rent ? formatPrice(sourceData.rent, "rent") : null;
  const sourceRecords = sourceData.records || [];
  const faqItems = faq(city);

  const availableIntro = sourceRecords.length
    ? `La referencia disponible para ${escapeHtml(city)} procede de fuentes concretas y debe leerse con su nivel geográfico: ${escapeHtml(
        sourceRecords.map((record) => geoLevelLabel(record.geo_level)).filter((value, index, all) => all.indexOf(value) === index).join(" y ")
      )}.`
    : `Ahora mismo no hay datos suficientes de ${escapeHtml(city)} para publicar una página indexable. Este borrador existe para revisar la oportunidad sin inventar cifras.`;

  const bodyHtml = `<article class="seo-landing" data-template="price_city">
  <header class="seo-hero" data-city-specific="true">
    <p class="seo-kicker">InmoRadar · datos inmobiliarios</p>
    <h1>${escapeHtml(h1)}</h1>
    <p>Antes de contactar por un anuncio en ${escapeHtml(
      city
    )}, conviene comparar su precio por metro cuadrado con una referencia de mercado. Esta página reúne el dato disponible, su fuente y una forma práctica de interpretarlo sin convertirlo en una tasación ni en una promesa de precio exacto.</p>
    <p>${availableIntro}</p>
  </header>

  <section class="seo-section" data-city-specific="true">
    <h2>Datos disponibles para ${escapeHtml(city)}</h2>
    ${dataTable(sourceData)}
    ${sourceRows(sourceRecords)}
    <p>Si el nivel geográfico indicado es una referencia municipal, el dato resume el municipio y no describe una calle concreta. Si aparece como referencia de zona, puede estar más cerca del entorno buscado, aunque sigue siendo una señal agregada y no el resultado de una valoración individual de la vivienda.</p>
  </section>

  <section class="seo-section" data-city-specific="true">
    <h2>Cómo interpretar el precio en ${escapeHtml(city)}</h2>
    <p>El precio por metro cuadrado es útil porque permite comparar viviendas de tamaños distintos con una unidad común. En ${escapeHtml(
      city
    )}, una vivienda pequeña puede parecer más barata por precio total y, aun así, estar por encima de la referencia por metro cuadrado. Al contrario, un piso grande puede tener un precio total alto, pero encajar mejor si el €/m² está cerca de la referencia publicada.</p>
    <p>${salePrice ? `Para venta, la referencia recogida es ${escapeHtml(salePrice)}.` : "Para venta, este borrador no debe inventar una cifra si la fuente aún no está disponible."} ${
      rentPrice ? `Para alquiler, la referencia recogida es ${escapeHtml(rentPrice)}.` : "Para alquiler, la página debe indicar que falta dato cuando no exista una fuente verificable."
    } En ambos casos, la comparación debe leerse junto con el estado del inmueble, el edificio, el barrio concreto y las condiciones visibles del anuncio.</p>
    <p>La señal más importante no es decidir si una vivienda está bien o mal solo con una cifra, sino detectar cuándo merece la pena hacer más preguntas antes de visitar, negociar o descartar. InmoRadar usa esta lógica: mostrar contexto para que el usuario pueda priorizar anuncios con más criterio.</p>
  </section>

  <section class="seo-section" data-city-specific="true">
    <h2>Cómo saber si un anuncio está caro en ${escapeHtml(city)}</h2>
    <p>La fórmula básica es sencilla: <strong>precio_m2 = precio_total / superficie_m2</strong>. Un piso de 100 m² anunciado por 210.000 € equivale a 2.100 €/m². Ese resultado se compara con la referencia de mercado disponible, siempre teniendo en cuenta si la fuente es municipal, de zona o de otro nivel territorial.</p>
    <p>Si el anuncio queda bastante por encima de la referencia, no significa automáticamente que sea una mala opción. Puede tener reforma reciente, ascensor, garaje, terraza, buena orientación, eficiencia energética superior, vistas o una ubicación concreta con demanda. Si queda muy por debajo, tampoco garantiza una oportunidad: puede haber limitaciones, estado deficiente, cargas, ruido, falta de luz, planta complicada o costes futuros que no se aprecian en el primer vistazo.</p>
    <p>Para ${escapeHtml(
      city
    )}, la revisión recomendable es anotar precio total, superficie útil si está disponible, superficie construida, gastos de comunidad, IBI, estado del edificio, planta, ascensor, plaza de garaje, cercanía a transporte y señales del entorno. Después, comparar el €/m² del anuncio con la referencia y decidir si compensa pedir más información.</p>
  </section>

  <section class="seo-section">
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

  <section class="seo-section seo-cta" data-city-specific="true">
    <h2>Cómo ayuda InmoRadar al buscar vivienda en ${escapeHtml(city)}</h2>
    <p>InmoRadar está pensado para analizar anuncios antes de contactar. La extensión calcula el precio €/m² del anuncio, lo compara con una referencia de mercado cuando existe, muestra la diferencia porcentual y añade señales del entorno como transporte cercano, dificultad estimada de aparcamiento, posibles señales de ruido y puntos relevantes del propio anuncio.</p>
    <p>La idea es reducir llamadas y visitas poco útiles. En lugar de mirar solo el precio total, puedes revisar si el anuncio encaja con la referencia disponible, si la zona puede tener costes prácticos para tu día a día y qué preguntas conviene hacer al anunciante.</p>
    <p><a class="button" href="/premium">Instalar InmoRadar</a> <a class="button secondary" href="/">Analiza anuncios antes de contactar</a></p>
  </section>

  <section class="seo-section">
    <h2>Enlaces útiles</h2>
    <p>También puedes revisar la <a href="/">página principal de InmoRadar</a> o consultar el <a href="/premium">acceso Premium</a> si estás comparando varios anuncios durante una búsqueda intensiva.</p>
  </section>

  ${faqHtml(faqItems)}
</article>`;

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
  buildPriceCityLanding,
  geoLevelLabel,
  sourceName
};
