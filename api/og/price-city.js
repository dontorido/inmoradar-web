const { escapeHtml } = require("../_seo/text");

function clampText(value, fallback, maxLength = 48) {
  const text = String(value || fallback || "").trim();
  return (text || fallback).slice(0, maxLength);
}

function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host || "inmoradar.app"}`);
  const city = clampText(url.searchParams.get("city"), "InmoRadar", 36);
  const value = clampText(url.searchParams.get("value"), "€/m²", 18);
  const cityUpper = city.toLocaleUpperCase("es-ES");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#0A0A0A"/>
  <rect x="64" y="64" width="1072" height="502" fill="#0D0D0D" stroke="#1F1F1F"/>
  <rect x="96" y="96" width="42" height="42" fill="none" stroke="#1F1F1F"/>
  <rect x="109" y="109" width="16" height="16" fill="none" stroke="#CCFF00" stroke-width="4"/>
  <rect x="115" y="115" width="4" height="4" fill="#CCFF00" stroke="#CCFF00" stroke-width="4"/>
  <text x="154" y="126" fill="#FFFFFF" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="800">Inmo</text>
  <text x="224" y="126" fill="#CCFF00" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="800">Radar</text>
  <text x="96" y="224" fill="#CCFF00" font-family="monospace" font-size="18" font-weight="700" letter-spacing="4">PRECIO METRO CUADRADO</text>
  <text x="96" y="342" fill="#FFFFFF" font-family="Arial, Helvetica, sans-serif" font-size="96" font-weight="900" letter-spacing="-3">${escapeHtml(value)}</text>
  <text x="96" y="430" fill="#D4D4D4" font-family="Arial, Helvetica, sans-serif" font-size="56" font-weight="800" letter-spacing="-1">EN ${escapeHtml(cityUpper)}</text>
  <text x="96" y="504" fill="#A3A3A3" font-family="Arial, Helvetica, sans-serif" font-size="26">Referencia orientativa con fuente, fecha y nivel geográfico.</text>
  <line x1="96" y1="540" x2="1104" y2="540" stroke="#1F1F1F"/>
  <text x="96" y="574" fill="#6E6E6E" font-family="monospace" font-size="16" letter-spacing="3">INMORADAR.APP</text>
</svg>`;

  res.statusCode = 200;
  res.setHeader("content-type", "image/svg+xml; charset=utf-8");
  res.setHeader("cache-control", "s-maxage=86400, stale-while-revalidate=604800");
  res.end(svg);
}

module.exports = handler;
