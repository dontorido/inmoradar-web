const MAX_REPORT_PROPERTIES = 40;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanText(value, fallback = "-") {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text || fallback;
}

function formatNumber(value, decimals = 0) {
  const number = asNumber(value);
  if (number === null) return "-";
  return new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals
  }).format(number);
}

function formatEuro(value) {
  const number = asNumber(value);
  return number === null ? "-" : `${formatNumber(number)} EUR`;
}

function formatEuroM2(value) {
  const number = asNumber(value);
  return number === null ? "-" : `${formatNumber(number)} EUR/m2`;
}

function formatPercent(value) {
  const number = asNumber(value);
  if (number === null) return "-";
  return `${number > 0 ? "+" : ""}${formatNumber(number, 1)}%`;
}

function formatScore(value) {
  const number = asNumber(value);
  return number === null ? "-" : `${number.toFixed(1).replace(".", ",")}/10`;
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function marketFromProperty(property = {}) {
  return property.market || property.marketData || property.market_price || {};
}

function normalizeReportProperty(property = {}, index = 0) {
  const market = marketFromProperty(property);
  const price = asNumber(property.price);
  const surface = asNumber(property.surfaceM2 || property.area || property.surface);
  const eurM2 = asNumber(property.eurM2 || property.pricePerM2 || (price && surface ? price / surface : null));
  const reference = asNumber(market.reference || property.marketReference || property.referenceEurM2);
  const differencePct = asNumber(market.differencePct ?? property.differencePct);
  const savedAt = property.savedAt || property.updatedAt || property.createdAt || null;

  return {
    rank: index + 1,
    title: cleanText(property.address || property.title, "Inmueble guardado"),
    location: cleanText(
      property.municipality || property.zone || property.district || property.region || property.city || property.province,
      "Ubicacion no detectada"
    ),
    portal: cleanText(property.portal || property.source || "Portal"),
    operation: cleanText(property.operationType || property.operation || "venta"),
    price,
    surface,
    rooms: cleanText(property.rooms ?? property.bedrooms, "-"),
    bathrooms: cleanText(property.bathrooms, "-"),
    eurM2,
    reference,
    differencePct,
    marketLabel: cleanText(market.label || property.marketLabel || "-", "-"),
    propertyScore: asNumber(property.propertyScore),
    zoneScore: asNumber(property.zoneScore),
    parking: cleanText(property.parkingDifficultyApi?.label || property.parkingDifficultyApi?.score || property.parking || "-", "-"),
    transport: cleanText(property.transportSummary || property.commute?.work1?.driving || property.commute?.work1?.transit || "-", "-"),
    monthlyMortgage: asNumber(property.mortgageMonthly),
    downPayment: asNumber(property.total || property.downPayment?.total),
    ibi: cleanText(property.ibi || property.ibiEstimate?.annualMin || "-", "-"),
    savedAt,
    url: cleanText(property.url, "")
  };
}

function normalizeReportProperties(properties = []) {
  return (Array.isArray(properties) ? properties : [])
    .slice(0, MAX_REPORT_PROPERTIES)
    .map(normalizeReportProperty);
}

function reportSummary(rows) {
  const sortedByScore = [...rows].sort((a, b) => (b.propertyScore || 0) - (a.propertyScore || 0));
  const sortedByMarket = [...rows]
    .filter((row) => asNumber(row.differencePct) !== null)
    .sort((a, b) => a.differencePct - b.differencePct);
  const sortedByZone = [...rows].sort((a, b) => (b.zoneScore || 0) - (a.zoneScore || 0));
  return {
    count: rows.length,
    bestOverall: sortedByScore[0] || null,
    bestMarket: sortedByMarket[0] || null,
    bestZone: sortedByZone[0] || null
  };
}

function tableCell(value, align = "left") {
  return `<td style="padding:10px 12px;border-bottom:1px solid #262626;text-align:${align};vertical-align:top;color:#D4D4D4;font-size:13px;">${value}</td>`;
}

function buildRowsHtml(rows) {
  return rows
    .map((row) => {
      const title = row.url
        ? `<a href="${escapeHtml(row.url)}" style="color:#FFFFFF;text-decoration:underline;text-decoration-color:#FF4500;">${escapeHtml(row.title)}</a>`
        : escapeHtml(row.title);
      return `<tr>
        ${tableCell(`<strong style="color:#FFFFFF;">${title}</strong><br><span style="color:#A3A3A3;">${escapeHtml(row.location)} · ${escapeHtml(row.portal)}</span>`)}
        ${tableCell(formatEuro(row.price), "right")}
        ${tableCell(row.surface ? `${formatNumber(row.surface)} m2` : "-", "right")}
        ${tableCell(escapeHtml(row.rooms), "right")}
        ${tableCell(formatEuroM2(row.eurM2), "right")}
        ${tableCell(formatEuroM2(row.reference), "right")}
        ${tableCell(formatPercent(row.differencePct), "right")}
        ${tableCell(formatScore(row.propertyScore), "right")}
        ${tableCell(formatScore(row.zoneScore), "right")}
        ${tableCell(escapeHtml(row.parking), "right")}
        ${tableCell(formatEuro(row.monthlyMortgage), "right")}
        ${tableCell(formatDate(row.savedAt), "right")}
      </tr>`;
    })
    .join("");
}

function buildSavedPropertiesEmail({ email, properties, generatedAt = new Date().toISOString() }) {
  const rows = normalizeReportProperties(properties);
  const summary = reportSummary(rows);
  const subject = `Comparativa de inmuebles guardados · InmoRadar`;
  const preheader = `${summary.count} inmuebles guardados con precio, mercado, scores y costes orientativos.`;
  const summaryItems = [
    ["Inmuebles", String(summary.count)],
    ["Mejor score", summary.bestOverall ? `${summary.bestOverall.title} (${formatScore(summary.bestOverall.propertyScore)})` : "-"],
    ["Mejor vs mercado", summary.bestMarket ? `${summary.bestMarket.title} (${formatPercent(summary.bestMarket.differencePct)})` : "-"],
    ["Mejor zona", summary.bestZone ? `${summary.bestZone.title} (${formatScore(summary.bestZone.zoneScore)})` : "-"]
  ];

  const html = `<!doctype html>
<html lang="es">
<body style="margin:0;background:#0A0A0A;color:#D4D4D4;font-family:Arial,Helvetica,sans-serif;">
  <span style="display:none;visibility:hidden;opacity:0;height:0;width:0;">${escapeHtml(preheader)}</span>
  <main style="max-width:980px;margin:0 auto;padding:32px 18px;">
    <p style="margin:0 0 10px;color:#FF4500;font-size:11px;letter-spacing:.18em;text-transform:uppercase;font-weight:700;">INMORADAR · PREMIUM</p>
    <h1 style="margin:0;color:#FFFFFF;font-size:36px;line-height:1.05;letter-spacing:-.04em;">Comparativa de inmuebles guardados</h1>
    <p style="margin:14px 0 24px;color:#A3A3A3;font-size:15px;line-height:1.6;">Informe generado para ${escapeHtml(email)} el ${escapeHtml(formatDate(generatedAt))}. Incluye datos orientativos de precio, mercado, scores, aparcamiento y costes.</p>
    <section style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border:1px solid #262626;background:#262626;gap:1px;margin-bottom:24px;">
      ${summaryItems
        .map(
          ([label, value]) =>
            `<article style="background:#111;padding:16px;"><p style="margin:0 0 8px;color:#6E6E6E;font-size:10px;letter-spacing:.16em;text-transform:uppercase;font-weight:700;">${escapeHtml(label)}</p><strong style="display:block;color:#FFFFFF;font-size:16px;line-height:1.35;">${escapeHtml(value)}</strong></article>`
        )
        .join("")}
    </section>
    <section style="overflow-x:auto;border:1px solid #262626;background:#101010;">
      <table style="width:100%;min-width:920px;border-collapse:collapse;">
        <thead>
          <tr>
            ${["Inmueble", "Precio", "m2", "Hab.", "EUR/m2", "Ref.", "Dif.", "Inmueble", "Zona", "Parking", "Hipoteca", "Guardado"]
              .map((head) => `<th style="padding:11px 12px;border-bottom:1px solid #262626;text-align:left;color:#6E6E6E;font-size:10px;letter-spacing:.14em;text-transform:uppercase;">${head}</th>`)
              .join("")}
          </tr>
        </thead>
        <tbody>${buildRowsHtml(rows)}</tbody>
      </table>
    </section>
    <p style="margin:22px 0 0;color:#A3A3A3;font-size:12px;line-height:1.6;">Datos orientativos. InmoRadar no sustituye una tasacion profesional ni asesoramiento de inversion. Los precios de mercado pueden ser referencias municipales o de zona segun la fuente disponible.</p>
  </main>
</body>
</html>`;

  const text = [
    "Comparativa de inmuebles guardados · InmoRadar",
    "",
    preheader,
    "",
    ...summaryItems.map(([label, value]) => `${label}: ${value}`),
    "",
    ...rows.map(
      (row) =>
        `${row.rank}. ${row.title} | ${formatEuro(row.price)} | ${formatEuroM2(row.eurM2)} | ref ${formatEuroM2(row.reference)} | dif ${formatPercent(row.differencePct)} | inmueble ${formatScore(row.propertyScore)} | zona ${formatScore(row.zoneScore)} | ${row.url}`
    ),
    "",
    "Datos orientativos. No sustituye una tasacion profesional ni asesoramiento de inversion."
  ].join("\n");

  return { subject, html, text, rows, summary };
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function buildSavedPropertiesCsv(rows) {
  const headers = [
    "inmueble",
    "ubicacion",
    "portal",
    "precio",
    "superficie_m2",
    "habitaciones",
    "eur_m2",
    "referencia_mercado_eur_m2",
    "diferencia_mercado_pct",
    "score_inmueble",
    "score_zona",
    "parking",
    "hipoteca_mes",
    "entrada_estimada",
    "guardado",
    "url"
  ];
  const lines = rows.map((row) =>
    [
      row.title,
      row.location,
      row.portal,
      row.price,
      row.surface,
      row.rooms,
      row.eurM2,
      row.reference,
      row.differencePct,
      row.propertyScore,
      row.zoneScore,
      row.parking,
      row.monthlyMortgage,
      row.downPayment,
      row.savedAt,
      row.url
    ]
      .map(csvCell)
      .join(",")
  );
  return [headers.join(","), ...lines].join("\n");
}

function buildCloudflareEmailPayload({ email, from, report }) {
  const csv = buildSavedPropertiesCsv(report.rows);
  return {
    to: email,
    from,
    subject: report.subject,
    html: report.html,
    text: report.text,
    attachments: [
      {
        filename: "inmoradar-inmuebles-guardados.csv",
        type: "text/csv",
        disposition: "attachment",
        content: Buffer.from(csv, "utf8").toString("base64")
      }
    ],
    headers: {
      "X-InmoRadar-Report": "saved-properties"
    }
  };
}

module.exports = {
  MAX_REPORT_PROPERTIES,
  buildCloudflareEmailPayload,
  buildSavedPropertiesCsv,
  buildSavedPropertiesEmail,
  normalizeReportProperties,
  reportSummary
};
