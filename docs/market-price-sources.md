# Fuentes de precio de mercado

Objetivo: que InmoRadar responda a "¿es un buen precio?" con una referencia lo más cercana posible sin usar APIs de pago.

## Estrategia

1. Priorizar siempre la granularidad:
   `neighbourhood` -> `district` -> `municipality` -> `province` -> `autonomous_community` -> `country`.
2. Cuando haya varias fuentes para el mismo nivel y zona, la API construye un consenso ponderado en vez de elegir una sola fuente.
3. Si solo existe referencia municipal/provincial/autonómica, la UI debe mostrar esa precisión y moderar el score. Nunca se comunica como "precio de calle".

## Fuentes gratuitas razonables

- Informes públicos de Idealista: útiles para venta y alquiler, con páginas por provincia/municipio y en algunas ciudades por distrito o barrio.
- Índice público de Fotocasa: útil como segunda fuente de contraste cuando haya datos por zona o municipio.
- SERPAVI / MIVAU: buena base oficial para alquiler, normalmente municipal o superior.
- MIVAU tasaciones: base oficial para venta, normalmente menos granular que los portales, útil como respaldo.
- Catastro / CartoCiudad: no dan precio de mercado, pero ayudan a normalizar ubicación y códigos administrativos.

## Importar informes públicos a Supabase

1. Copia el ejemplo:

```bash
cp data/market-price-report-sources.sample.json data/market-price-report-sources.json
```

2. Edita `data/market-price-report-sources.json` y activa las fuentes quitando `"disabled": true`.

Ejemplo:

```json
{
  "source": "idealista_public_report",
  "operation": "sale",
  "country": "ES",
  "autonomous_community": "Madrid",
  "province": "Madrid",
  "municipality": "Madrid",
  "row_geo_level": "district",
  "period_label": "abril 2026",
  "period_date": "2026-04-01",
  "url": "https://www.idealista.com/sala-de-prensa/informes-precio-vivienda/venta/madrid/madrid-provincia/madrid/"
}
```

3. Genera el CSV:

```bash
npm run market:import-public -- --out=market-price-public-reports.csv
```

4. Revisa antes de subir:

```bash
npm run market:import-public -- --dry-run
```

5. Sube `market-price-public-reports.csv` a Supabase en la tabla `market_price_sources`.

## Campos importantes

- `source`: `idealista_public_report`, `fotocasa_index`, `serpavi`, `mivau_appraisal`.
- `operation`: `sale` o `rent`.
- `geo_level`: nivel de la fila importada.
- `price_eur_m2`: precio de referencia.
- `period_label` y `period_date`: periodo del informe.
- `source_url`: URL pública usada.
- `confidence_score`: opcional. Si falta, el importador lo estima según `geo_level`.

## Cómo lo usa la API

`GET /api/market-price` busca primero referencias de barrio/distrito. Si encuentra varias fuentes del mismo nivel geográfico, devuelve:

- `market.source = "market_consensus"`
- `market.sources = [...]`
- `market.price_range_eur_m2 = { min, max }`
- `market.source_count`

Si solo hay MIVAU municipal, la respuesta sigue siendo válida, pero con precisión municipal y caveats. El score queda capado para evitar falsos "chollos".
