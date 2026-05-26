const MAX_REPORT_PROPERTIES = 40;
const DEFAULT_SITE_URL = "https://www.inmoradar.app";
const FALLBACK = "—";
const PREHEADER =
  "Compara precio, zona, mercado y coste real de tus inmuebles guardados en una sola vista.";

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

function money(value) {
  const number = asNumber(value);
  return number !== null && number > 0 ? number : null;
}

function cleanText(value, fallback = FALLBACK) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text || fallback;
}

function safeUrl(value) {
  const url = cleanText(value, "");
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function normalizeSiteUrl(value) {
  const url = safeUrl(value) || DEFAULT_SITE_URL;
  return url.replace(/\/+$/, "");
}

function formatNumber(value, decimals = 0) {
  const number = asNumber(value);
  if (number === null) return FALLBACK;
  return new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals
  }).format(number);
}

function formatEuro(value) {
  const number = asNumber(value);
  return number === null ? FALLBACK : `${formatNumber(number)} €`;
}

function formatEuroM2(value) {
  const number = asNumber(value);
  return number === null ? FALLBACK : `${formatNumber(number)} €/m²`;
}

function formatPercent(value) {
  const number = asNumber(value);
  if (number === null) return FALLBACK;
  return `${number > 0 ? "+" : ""}${formatNumber(number, 1)}%`;
}

function formatScoreNumber(value) {
  const number = asNumber(value);
  return number === null ? FALLBACK : number.toFixed(1).replace(".", ",");
}

function formatScore(value) {
  const formatted = formatScoreNumber(value);
  return formatted === FALLBACK ? FALLBACK : `${formatted}/10`;
}

function formatDate(value) {
  if (!value) return FALLBACK;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return FALLBACK;
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function marketFromProperty(property = {}) {
  return property.market || property.marketData || property.market_price || {};
}

function averageMoney(a, b) {
  const left = money(a);
  const right = money(b);
  if (left && right) return (left + right) / 2;
  return left || right || null;
}

function monthlyCost(property = {}) {
  const explicit = money(property.monthlyTotal || property.totalMonthly || property.monthlyCost);
  if (explicit) return explicit;
  const mortgage = money(property.mortgageMonthly);
  const community = money(property.communityFee);
  const ibiMonthly = money(property.ibiMonthly);
  const ibiAnnual =
    money(property.ibiEstimate?.annualAverage) ||
    averageMoney(property.ibiEstimate?.annualMin, property.ibiEstimate?.annualMax);
  const parts = [mortgage, community, ibiMonthly || (ibiAnnual ? ibiAnnual / 12 : null)].filter(Boolean);
  return parts.length ? Math.round(parts.reduce((sum, value) => sum + value, 0)) : null;
}

function signalText(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.title || value.label || value.detail || value.text || "";
}

function topSignal(property = {}, market = {}) {
  const explicit = signalText(property.topSignal);
  if (explicit) return explicit;
  const marketLabel = market.label || property.marketLabel;
  const marketDiff = market.differencePct ?? property.differencePct;
  if (marketLabel && asNumber(marketDiff) !== null) return `${marketLabel}: ${formatPercent(marketDiff)} vs mercado`;
  const good = signalText(property.prosCons?.good?.[0]);
  if (good) return good;
  const bad = signalText(property.prosCons?.bad?.[0]);
  if (bad) return `Alerta: ${bad}`;
  return "Sin señal destacada";
}

function statusLabel(value) {
  const labels = {
    pending: "Pendiente",
    favorite: "Favorito",
    contacted: "Contactado",
    visited: "Visitado",
    discarded: "Descartado"
  };
  return labels[String(value || "pending")] || "Pendiente";
}

function normalizeReportProperty(property = {}, index = 0) {
  const market = marketFromProperty(property);
  const price = asNumber(property.price);
  const surface = asNumber(property.surfaceM2 || property.area || property.surface || property.sizeM2);
  const eurM2 = asNumber(property.eurM2 || property.pricePerM2 || (price && surface ? price / surface : null));
  const reference = asNumber(market.reference || property.marketReference || property.referenceEurM2);
  const differencePct = asNumber(market.differencePct ?? property.differencePct ?? property.marketDiff);
  const savedAt = property.savedAt || property.updatedAt || property.createdAt || null;
  const imageUrl = safeUrl(
    property.heroImage ||
      property.imageUrl ||
      property.image ||
      property.imageUrls?.[0] ||
      property.image_urls?.[0] ||
      property.imageCandidates?.[0]
  );

  return {
    rank: index + 1,
    id: cleanText(property.id || property.url || `${property.address || property.title}-${property.price}`, ""),
    title: cleanText(property.address || property.title, "Inmueble guardado"),
    location: cleanText(
      property.municipality || property.zone || property.district || property.region || property.city || property.province,
      "Zona no detectada"
    ),
    portal: cleanText(property.portal || property.source || "Portal"),
    operation: cleanText(property.operationType || property.operation || "venta"),
    price,
    surface,
    rooms: cleanText(property.rooms ?? property.bedrooms),
    bathrooms: cleanText(property.bathrooms),
    eurM2,
    reference,
    differencePct,
    marketLabel: cleanText(market.label || property.marketLabel),
    propertyScore: asNumber(property.propertyScore ?? property.score ?? property.inmoRadarScore),
    zoneScore: asNumber(property.zoneScore ?? property.areaScore),
    parking: cleanText(property.parkingDifficultyApi?.label || property.parkingDifficultyApi?.score || property.parking),
    transport: cleanText(property.transportSummary || property.commute?.work1?.driving || property.commute?.work1?.transit),
    monthlyMortgage: asNumber(property.mortgageMonthly ?? property.mortgage),
    monthlyTotal: monthlyCost(property),
    downPayment: asNumber(property.total || property.downPayment?.total),
    ibi: cleanText(property.ibi || property.ibiEstimate?.annualMin),
    decisionStatus: cleanText(property.decisionStatus || "pending", "pending"),
    decisionStatusLabel: statusLabel(property.decisionStatus),
    notes: cleanText(property.notes || "", ""),
    topSignal: topSignal(property, market),
    savedAt,
    url: safeUrl(property.url),
    imageUrl
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

function badgeToneFromScore(value) {
  const number = asNumber(value);
  if (number === null) return "neutral";
  if (number >= 7.5) return "good";
  if (number >= 6) return "neutral";
  if (number >= 4.5) return "warning";
  return "danger";
}

function badgeToneFromMarketDiff(value) {
  const number = asNumber(value);
  if (number === null) return "neutral";
  if (number <= -5) return "good";
  if (number <= 5) return "neutral";
  if (number <= 15) return "warning";
  return "danger";
}

function badgeToneFromParking(value) {
  const text = String(value || "").toLowerCase();
  if (!text || text === FALLBACK) return "neutral";
  if (/incluido|garaje|fácil|facil|buena|baja/.test(text)) return "good";
  if (/media|normal|zona azul/.test(text)) return "neutral";
  if (/difícil|dificil|alta|complicada|mala/.test(text)) return "danger";
  return "warning";
}

function badgeStyle(tone = "neutral") {
  const styles = {
    good: "background:#EAF6EE;border:1px solid #CBE8D6;color:#14723B;",
    neutral: "background:#F7F5F3;border:1px solid #DED8D2;color:#48433F;",
    warning: "background:#FFF3D6;border:1px solid #F4D28E;color:#8A5A00;",
    danger: "background:#FFE4DF;border:1px solid #FFB8AA;color:#AA2C10;"
  };
  return `${styles[tone] || styles.neutral}border-radius:999px;padding:7px 10px;font-size:11px;line-height:1;font-weight:900;display:inline-block;`;
}

function buttonHtml({ href, label, variant = "orange" }) {
  const safeHref = escapeHtml(href);
  const style =
    variant === "orange"
      ? "background:#FF5A0A;color:#FFFFFF;border:1px solid #FF5A0A;"
      : "background:#0A0A0A;color:#FFFFFF;border:1px solid #0A0A0A;";
  return `<a href="${safeHref}" style="${style}border-radius:999px;display:inline-block;font-size:14px;font-weight:900;line-height:1.2;padding:15px 20px;text-decoration:none;">${escapeHtml(label)}</a>`;
}

function kpiCardHtml(label, value, detail) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;border:1px solid #DED8D2;border-radius:24px;">
    <tr>
      <td style="padding:18px 16px 17px;">
        <p style="color:#7A726B;font-size:10px;font-weight:900;letter-spacing:2px;line-height:1.2;margin:0 0 10px;text-transform:uppercase;">${escapeHtml(label)}</p>
        <p style="color:#0B0B0C;font-size:28px;font-weight:900;letter-spacing:0;line-height:1;margin:0 0 8px;">${escapeHtml(value)}</p>
        <p style="color:#5E5A57;font-size:12px;font-weight:700;line-height:1.35;margin:0;">${escapeHtml(detail)}</p>
      </td>
    </tr>
  </table>`;
}

function metricCell(label, value) {
  return `<td class="metric-cell" width="33.333%" style="padding:0 8px 10px 0;vertical-align:top;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F7F5F3;border:1px solid #E7E0DA;border-radius:16px;">
      <tr>
        <td style="padding:12px 12px 11px;">
          <p style="color:#7A726B;font-size:10px;font-weight:900;letter-spacing:1.3px;line-height:1.2;margin:0 0 7px;text-transform:uppercase;">${escapeHtml(label)}</p>
          <p style="color:#0B0B0C;font-size:15px;font-weight:900;line-height:1.25;margin:0;">${escapeHtml(value)}</p>
        </td>
      </tr>
    </table>
  </td>`;
}

function buildMetricsGrid(row) {
  const mortgage = row.monthlyMortgage || row.monthlyTotal;
  const metrics = [
    ["Precio", formatEuro(row.price)],
    ["m²", formatNumber(row.surface)],
    ["Hab.", row.rooms],
    ["€/m²", formatEuroM2(row.eurM2)],
    ["Ref. mercado", formatEuroM2(row.reference)],
    ["Dif. mercado", formatPercent(row.differencePct)],
    ["Score", formatScore(row.propertyScore)],
    ["Score zona", formatScore(row.zoneScore)],
    ["Parking", row.parking],
    ["Hipoteca", formatEuro(mortgage)],
    ["Guardado", formatDate(row.savedAt)]
  ];
  const rows = [];
  for (let index = 0; index < metrics.length; index += 3) {
    const cells = metrics.slice(index, index + 3).map(([label, value]) => metricCell(label, value));
    while (cells.length < 3) cells.push('<td class="metric-cell" width="33.333%" style="padding:0 8px 10px 0;">&nbsp;</td>');
    rows.push(`<tr>${cells.join("")}</tr>`);
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows.join("")}</table>`;
}

function buildPropertyCardsHtml(rows) {
  if (!rows.length) {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;border:1px solid #DED8D2;border-radius:24px;">
      <tr>
        <td style="padding:24px;">
          <p style="color:#0B0B0C;font-size:20px;font-weight:900;line-height:1.2;margin:0 0 8px;">Aún no hay inmuebles guardados.</p>
          <p style="color:#5E5A57;font-size:14px;line-height:1.55;margin:0;">Cuando guardes anuncios desde la extensión, aparecerán aquí con precio, mercado, zona, parking y coste mensual estimado.</p>
        </td>
      </tr>
    </table>`;
  }

  return rows
    .map((row) => {
      const propertyHref = row.url || DEFAULT_SITE_URL;
      const title = `<a href="${escapeHtml(propertyHref)}" style="color:#0B0B0C;text-decoration:none;">${escapeHtml(row.title)}</a>`;
      const note = row.notes
        ? `<tr>
            <td style="padding:2px 22px 19px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FAF8F6;border:1px solid #E7E0DA;border-radius:18px;">
                <tr>
                  <td style="padding:13px 14px;">
                    <p style="color:#7A726B;font-size:10px;font-weight:900;letter-spacing:1.5px;line-height:1.2;margin:0 0 6px;text-transform:uppercase;">Nota</p>
                    <p style="color:#48433F;font-size:13px;line-height:1.5;margin:0;">${escapeHtml(row.notes)}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`
        : "";
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;border:1px solid #DED8D2;border-radius:26px;margin:0 0 14px;">
        <tr>
          <td style="padding:22px 22px 12px;">
            <p style="color:#FF5A0A;font-size:10px;font-weight:900;letter-spacing:2px;line-height:1.2;margin:0 0 10px;text-transform:uppercase;">${escapeHtml(row.portal)} · ${escapeHtml(row.decisionStatusLabel)}</p>
            <h3 style="color:#0B0B0C;font-size:23px;font-weight:900;letter-spacing:0;line-height:1.08;margin:0 0 9px;">${title}</h3>
            <p style="color:#5E5A57;font-size:14px;line-height:1.45;margin:0 0 15px;">${escapeHtml(row.location)} · ${escapeHtml(row.operation)} · ${escapeHtml(formatNumber(row.surface))} m² · ${escapeHtml(row.rooms)} hab.</p>
            <p style="margin:0 0 16px;">
              <span style="${badgeStyle(badgeToneFromScore(row.propertyScore))}">Score ${escapeHtml(formatScore(row.propertyScore))}</span>
              <span style="display:inline-block;width:6px;">&nbsp;</span>
              <span style="${badgeStyle(badgeToneFromScore(row.zoneScore))}">Zona ${escapeHtml(formatScore(row.zoneScore))}</span>
              <span style="display:inline-block;width:6px;">&nbsp;</span>
              <span style="${badgeStyle(badgeToneFromMarketDiff(row.differencePct))}">${escapeHtml(formatPercent(row.differencePct))} vs mercado</span>
              <span style="display:inline-block;width:6px;">&nbsp;</span>
              <span style="${badgeStyle(badgeToneFromParking(row.parking))}">Parking ${escapeHtml(row.parking)}</span>
            </p>
            ${buildMetricsGrid(row)}
          </td>
        </tr>
        ${note}
        <tr>
          <td style="padding:0 22px 22px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="color:#5E5A57;font-size:13px;line-height:1.5;padding:0 14px 0 0;vertical-align:middle;">
                  <strong style="color:#0B0B0C;">Señal:</strong> ${escapeHtml(row.topSignal)}
                </td>
                <td align="right" style="vertical-align:middle;width:124px;">
                  <a href="${escapeHtml(propertyHref)}" style="background:#0A0A0A;border-radius:999px;color:#FFFFFF;display:inline-block;font-size:12px;font-weight:900;line-height:1.2;padding:11px 14px;text-decoration:none;">Ver anuncio</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>`;
    })
    .join("");
}

function insightRow(text) {
  return `<tr>
    <td width="20" style="padding:7px 0;vertical-align:top;">
      <span style="background:#FF5A0A;border-radius:999px;display:inline-block;height:8px;width:8px;">&nbsp;</span>
    </td>
    <td style="color:#FFFFFF;font-size:14px;font-weight:800;line-height:1.45;padding:4px 0;">${escapeHtml(text)}</td>
  </tr>`;
}

function buildSavedPropertiesEmail({
  email,
  properties,
  generatedAt = new Date().toISOString(),
  reportUrl = "",
  siteUrl = DEFAULT_SITE_URL,
  previewImageUrl = ""
}) {
  const rows = normalizeReportProperties(properties);
  const summary = reportSummary(rows);
  const baseUrl = normalizeSiteUrl(siteUrl);
  const safeReportUrl = safeUrl(reportUrl);
  const dashboardUrl = baseUrl;
  const savedPropertiesUrl = safeReportUrl || `${baseUrl}/inmuebles-guardados`;
  const subject = "Comparativa de inmuebles guardados · InmoRadar";
  const generatedAtLabel = formatDate(generatedAt);
  const bestScoreValue = summary.bestOverall ? formatScoreNumber(summary.bestOverall.propertyScore) : FALLBACK;
  const bestMarketValue = summary.bestMarket ? formatPercent(summary.bestMarket.differencePct) : FALLBACK;
  const bestZoneValue = summary.bestZone ? formatScoreNumber(summary.bestZone.zoneScore) : FALLBACK;
  const bestScoreLabel = bestScoreValue === FALLBACK ? FALLBACK : `${bestScoreValue}/10`;
  const bestZoneLabel = bestZoneValue === FALLBACK ? FALLBACK : `${bestZoneValue}/10`;
  const previewUrl = safeUrl(previewImageUrl);

  const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escapeHtml(subject)}</title>
  <style>
    body { margin:0 !important; padding:0 !important; background:#F3F1EF; }
    table { border-collapse:separate; }
    img { border:0; line-height:100%; outline:none; text-decoration:none; }
    a { text-decoration:none; }
    @media screen and (max-width: 620px) {
      .container { width:100% !important; }
      .outer-pad { padding:18px 12px !important; }
      .hero-pad { padding:34px 22px 30px !important; }
      .hero-title { font-size:42px !important; line-height:.98 !important; }
      .section-pad { padding:24px 22px !important; }
      .kpi-cell { display:block !important; width:100% !important; padding:0 0 10px !important; }
      .metric-cell { display:block !important; width:100% !important; padding:0 0 10px !important; }
      .button-cell { display:block !important; width:100% !important; padding:0 0 10px !important; text-align:left !important; }
      .mobile-hide { display:none !important; }
    }
  </style>
</head>
<body style="background:#F3F1EF;margin:0;padding:0;">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;visibility:hidden;">${escapeHtml(PREHEADER)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F3F1EF;">
    <tr>
      <td class="outer-pad" align="center" style="padding:30px 14px;">
        <table role="presentation" class="container" width="680" cellpadding="0" cellspacing="0" border="0" style="max-width:680px;width:680px;">
          <tr>
            <td style="padding:0 0 14px;">
              <p style="color:#0B0B0C;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:900;letter-spacing:0;line-height:1;margin:0;">Inmo<span style="color:#FF5A0A;">Radar</span></p>
            </td>
          </tr>
          <tr>
            <td class="hero-pad" style="background:#FAF8F6;background-image:radial-gradient(#DED8D2 1px, transparent 1px);background-size:18px 18px;border:1px solid #DED8D2;border-radius:30px;padding:44px 40px 38px;">
              <p style="color:#FF5A0A;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:900;letter-spacing:2.4px;line-height:1.2;margin:0 0 20px;text-transform:uppercase;">INMORADAR · COMPARATIVA</p>
              <h1 class="hero-title" style="color:#0B0B0C;font-family:Arial,Helvetica,sans-serif;font-size:58px;font-weight:900;letter-spacing:0;line-height:.94;margin:0 0 20px;">Compara lo que<br>el anuncio<br>no te cuenta.</h1>
              <p style="color:#3A3632;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:1.55;margin:0 0 16px;max-width:550px;">Precio, mercado, zona, parking y coste hipotecario en una sola vista para priorizar mejor tus inmuebles guardados.</p>
              <p style="color:#5E5A57;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:800;line-height:1.45;margin:0 0 24px;">Informe generado para ${escapeHtml(email)} · ${escapeHtml(generatedAtLabel)}</p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="button-cell" style="padding:0 10px 0 0;">${buttonHtml({ href: dashboardUrl, label: "Abrir InmoRadar", variant: "orange" })}</td>
                  <td class="button-cell">${buttonHtml({ href: savedPropertiesUrl, label: "Ver inmuebles guardados", variant: "black" })}</td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 0 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="kpi-cell" width="50%" style="padding:0 7px 12px 0;">${kpiCardHtml("INMUEBLES", String(summary.count), "guardados")}</td>
                  <td class="kpi-cell" width="50%" style="padding:0 0 12px 7px;">${kpiCardHtml("MEJOR SCORE", bestScoreLabel, summary.bestOverall?.title || FALLBACK)}</td>
                </tr>
                <tr>
                  <td class="kpi-cell" width="50%" style="padding:0 7px 0 0;">${kpiCardHtml("MEJOR VS MERCADO", bestMarketValue, summary.bestMarket?.title || FALLBACK)}</td>
                  <td class="kpi-cell" width="50%" style="padding:0 0 0 7px;">${kpiCardHtml("MEJOR ZONA", bestZoneLabel, summary.bestZone?.title || FALLBACK)}</td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="section-pad" style="padding:42px 26px 28px;">
              <p style="color:#FF5A0A;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:900;letter-spacing:2.4px;line-height:1.2;margin:0 0 14px;text-transform:uppercase;">LECTURA RÁPIDA</p>
              <h2 style="color:#0B0B0C;font-family:Arial,Helvetica,sans-serif;font-size:38px;font-weight:900;letter-spacing:0;line-height:1.04;margin:0 0 16px;">Guarda, compara y <span style="color:#FF5A0A;">decide</span><br>con más contexto.</h2>
              <p style="color:#5E5A57;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.62;margin:0;max-width:570px;">InmoRadar ordena tus inmuebles guardados para ayudarte a entender mejor precio por metro cuadrado, referencia de mercado, calidad de zona, aparcamiento y coste mensual estimado.</p>
            </td>
          </tr>

          ${previewUrl ? `<tr>
            <td style="padding:0 0 18px;">
              <img src="${escapeHtml(previewUrl)}" width="680" alt="Vista de InmoRadar" style="border:1px solid #DED8D2;border-radius:26px;display:block;height:auto;width:100%;">
            </td>
          </tr>` : ""}

          <tr>
            <td style="padding:0 0 12px;">
              ${buildPropertyCardsHtml(rows)}
            </td>
          </tr>

          <tr>
            <td style="padding:8px 0 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0A0A0A;border-radius:28px;">
                <tr>
                  <td class="section-pad" style="padding:30px 30px 28px;">
                    <p style="color:#FF8A4C;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:900;letter-spacing:2.4px;line-height:1.2;margin:0 0 14px;text-transform:uppercase;">LO QUE EL ANUNCIO NO TE CUENTA</p>
                    <h2 style="color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;font-size:32px;font-weight:900;letter-spacing:0;line-height:1.05;margin:0 0 18px;">Más <span style="color:#FF5A0A;">criterio</span><br>antes de contactar.</h2>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      ${[
                        "Precio frente a referencia de mercado",
                        "Lectura rápida de zona",
                        "Señales de aparcamiento",
                        "Coste hipotecario estimado"
                      ]
                        .map(insightRow)
                        .join("")}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="section-pad" style="padding:28px 26px 10px;">
              <p style="color:#5E5A57;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.65;margin:0 0 12px;">InmoRadar ofrece estimaciones orientativas basadas en datos visibles del anuncio, referencias de mercado y señales urbanas. No sustituye una tasación profesional ni asesoramiento financiero o de inversión.</p>
              <p style="color:#0B0B0C;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:900;line-height:1.35;margin:0;">No es una tasación. Es una capa de criterio.</p>
            </td>
          </tr>

          <tr>
            <td style="border-top:1px solid #DED8D2;padding:22px 0 4px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:0 0 10px;vertical-align:top;">
                    <p style="color:#0B0B0C;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:900;letter-spacing:2px;line-height:1.2;margin:0 0 7px;text-transform:uppercase;">INMORADAR</p>
                    <p style="color:#5E5A57;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.45;margin:0;">Analiza anuncios antes de contactar.</p>
                  </td>
                  <td align="right" style="padding:0 0 10px;vertical-align:top;">
                    <a href="${escapeHtml(`${baseUrl}/privacidad`)}" style="color:#0B0B0C;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:800;text-decoration:none;">Privacidad</a>
                    <span style="color:#B8B0A8;font-family:Arial,Helvetica,sans-serif;font-size:12px;"> · </span>
                    <a href="${escapeHtml(`${baseUrl}/terminos`)}" style="color:#0B0B0C;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:800;text-decoration:none;">Términos</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    subject,
    "",
    PREHEADER,
    "",
    `Abrir InmoRadar: ${dashboardUrl}`,
    `Ver inmuebles guardados: ${savedPropertiesUrl}`,
    "",
    `Inmuebles: ${summary.count}`,
    `Mejor score: ${bestScoreLabel} · ${summary.bestOverall?.title || FALLBACK}`,
    `Mejor vs mercado: ${bestMarketValue} · ${summary.bestMarket?.title || FALLBACK}`,
    `Mejor zona: ${bestZoneLabel} · ${summary.bestZone?.title || FALLBACK}`,
    "",
    ...rows.map(
      (row) =>
        `${row.rank}. ${row.title} | ${row.location} | ${row.portal} | ${formatEuro(row.price)} | ${formatEuroM2(row.eurM2)} | ref ${formatEuroM2(row.reference)} | dif ${formatPercent(row.differencePct)} | score ${formatScore(row.propertyScore)} | zona ${formatScore(row.zoneScore)} | parking ${row.parking} | hipoteca ${formatEuro(row.monthlyMortgage || row.monthlyTotal)} | guardado ${formatDate(row.savedAt)} | nota ${row.notes || FALLBACK} | ${row.url || FALLBACK}`
    ),
    "",
    "InmoRadar ofrece estimaciones orientativas basadas en datos visibles del anuncio, referencias de mercado y señales urbanas. No sustituye una tasación profesional ni asesoramiento financiero o de inversión.",
    "No es una tasación. Es una capa de criterio."
  ]
    .filter(Boolean)
    .join("\n");

  return {
    subject,
    html,
    text,
    rows,
    summary,
    reportUrl: safeReportUrl,
    previewImageUrl: previewUrl,
    generatedAt
  };
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
    "coste_mensual_estimado",
    "entrada_estimada",
    "estado",
    "senal",
    "notas",
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
      row.monthlyTotal,
      row.downPayment,
      row.decisionStatusLabel,
      row.topSignal,
      row.notes,
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
  PREHEADER,
  buildCloudflareEmailPayload,
  buildSavedPropertiesCsv,
  buildSavedPropertiesEmail,
  normalizeReportProperties,
  reportSummary
};
