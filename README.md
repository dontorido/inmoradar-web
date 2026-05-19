# InmoRadar Web

Web estatica de lanzamiento para InmoRadar.

## Incluye

- `index.html`: landing principal.
- `premium.html`: pagina de conversion Premium.
- `privacidad.html`: politica de privacidad inicial.
- `terminos.html`: terminos de uso iniciales.
- `success.html`: retorno tras pago correcto.
- `cancel.html`: retorno tras pago cancelado.
- `assets/app.js`: abre el checkout Premium desde el endpoint backend.
- `assets/hero-inmoradar.png`: visual principal local.
- `robots.txt` y `sitemap.xml`.
- `_redirects` y `vercel.json` para que `/premium`, `/privacidad`, `/terminos`, `/success` y `/cancel` funcionen en Netlify/Vercel.
- `api/check-premium.js`: endpoint para que la extension compruebe si un email tiene Premium.
- `api/lemonsqueezy-checkout.js`: crea checkouts y abre el Customer Portal de Lemon Squeezy en modo prueba o produccion sin exponer la API key.
- `api/lemonsqueezy-webhook.js`: webhook preparado para sincronizar suscripciones de Lemon Squeezy.
- `api/check-premium.js?resource=saved-properties-email-report`: envio Premium de comparativa de inmuebles guardados por Cloudflare Email Service.
- `admin.html`, `assets/admin.js` y `assets/admin.css`: backoffice protegido por `ADMIN_IMPORT_TOKEN`.
- `api/admin.js`: backoffice API compacta para Premium, SEO, KPIs, Parking y estado de integraciones. Se usa una sola serverless function para respetar el limite de Vercel Hobby.
- `lib/social-video/*`: generador de guion, storyboard, preview vertical y paquete exportable para Videos IA, con personas de fondo, musica y branding global obligatorio.
- `database/premium-subscriptions.sql`: tabla Supabase para guardar suscripciones Premium.
- `database/saved-property-email-reports.sql`: auditoria y limite diario de emails Premium enviados.
- `database/kpi-settings.sql`: tabla Supabase para guardar reglas, pesos, umbrales y visibilidad de KPIs.
- `api/market-price.js`: endpoint agregado para que la extension consulte precios de mercado por zona.
- `database/market-price-sources.sql`: tabla Supabase `market_price_sources` y seed minimo de mercado.
- `database/seo-landings.sql`: tablas `seo_landing_opportunities` y `seo_landings`, con seed de 5 oportunidades `price_city`.
- `database/seo-cron-runs.sql`: registro y bloqueo suave para evitar ejecuciones SEO solapadas.
- `api/admin.js?resource=seo/generate-landings`: generador admin protegido por `ADMIN_IMPORT_TOKEN`.
- `api/cron/seo-publish.js`: cron protegido por `CRON_SECRET` o `ADMIN_IMPORT_TOKEN` para regenerar drafts y publicar una landing elegible.
- `.github/workflows/seo-cron.yml`: ejecuta el endpoint SEO cada 6 horas desde GitHub Actions; Vercel Hobby queda con un cron diario compatible.
- `api/seo-page.js`: render publico de landings SEO por slug.
- `api/sitemap.js`: sitemap dinamico con landings publicadas e indexables.
- `scripts/seo-generate.js`: dry run local del generador SEO.
- La home incluye una seccion `Noticias` para enlazar publicaciones y guias nuevas.
- `api/parking-difficulty.js`: Parking Difficulty Score con Overpass/OpenStreetMap, perspectiva visitante/residente, scoring y cache en memoria + Supabase.
- `api/_parking/*`: servicios internos para scoring, parser Overpass, adaptadores municipales y cache.
- `types/parking.ts`: tipos TypeScript preparados para migrar el endpoint a TS.
- `database/parking-difficulty.sql`: tablas preparadas para zonas de aparcamiento regulado y cache persistente.
- `tests/parking-difficulty.test.js`: tests basicos del scoring, parser y cache.

## Checkout

El checkout Premium se crea en backend mediante Lemon Squeezy:

```text
POST /api/lemonsqueezy-checkout
```

Por defecto usa `LEMONSQUEEZY_TEST_MODE=true`, asi que sirve para probar compras sin cobrar dinero real. Los botones con `data-checkout-button` llaman a este endpoint y redirigen al `checkout_url` devuelto por Lemon Squeezy.

## Probar en local

Puedes abrir directamente:

```text
index.html
```

O servir la carpeta con cualquier servidor estatico.

## Publicar

Ver `DEPLOY.md`.

## Dominios

Ver `DOMINIOS.md`.

## Variables de entorno para Premium

La oferta comercial visible en la web es: **2 dias gratis** y despues **1,99 EUR/semana**.

Configurar en Vercel:

```text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
LEMONSQUEEZY_API_KEY=
LEMONSQUEEZY_STORE_ID=
LEMONSQUEEZY_VARIANT_ID=
LEMONSQUEEZY_TEST_MODE=true
LEMONSQUEEZY_WEBHOOK_SECRET=
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_EMAIL_API_TOKEN=
CLOUDFLARE_EMAIL_FROM=hola@inmoradar.app
ADMIN_IMPORT_TOKEN=
CRON_SECRET=
PUBLIC_SITE_URL=https://inmoradar.app
```

El endpoint de checkout quedara en:

```text
https://www.inmoradar.app/api/lemonsqueezy-checkout
```

Portal de cliente para gestionar o cancelar suscripcion:

```text
POST /api/lemonsqueezy-portal
```

Este endpoint reutiliza la funcion de checkout mediante rewrite de Vercel y devuelve el Customer Portal oficial de Lemon Squeezy. Si el email tiene una suscripcion en Lemon, devuelve una URL firmada de 24 horas; si no, cae al portal generico `/billing` con magic link. El cliente puede cancelar la renovacion, cambiar tarjeta y ver facturas. Si una suscripcion queda `cancelled` pero tiene `ends_at` futuro, InmoRadar mantiene Premium hasta el final del periodo ya pagado.

## Backoffice

Acceso:

```text
https://www.inmoradar.app/admin
```

El panel no indexa y los datos se cargan desde endpoints protegidos con `ADMIN_IMPORT_TOKEN`. Permite:

- ver estado de Supabase y Lemon Squeezy;
- revisar suscripciones Premium sincronizadas por webhook;
- revisar landings SEO, quality score, estado e indexacion;
- generar un draft SEO;
- publicar una landing elegible;
- cambiar una landing a `noindex` o regenerarla;
- administrar reglas KPI: pesos de inmueble/zona, umbrales de precio, caps por nivel geografico, costes, entorno, parking y visibilidad de KPIs estaticos.
- generar paquetes de video IA con escenas humanas cotidianas, musica, logo InmoRadar arriba derecha y firma `Inmoradar.app` abajo derecha en todas las escenas.

Migracion KPI:

```bash
database/kpi-settings.sql
```

Endpoint admin KPI:

```text
GET/POST /api/admin?resource=kpis/settings
Authorization: Bearer ADMIN_IMPORT_TOKEN
```

El endpoint publico `/api/kpi-settings` devuelve los valores activos sin secretos. `property-assessment` ya usa la configuracion guardada para umbrales de precio, caps por precision geografica y formula de `price_score`.

El endpoint de comprobacion quedara en:

```text
https://www.inmoradar.app/api/check-premium?email=usuario@email.com
```

El webhook de Lemon Squeezy debe apuntar a:

```text
https://www.inmoradar.app/api/lemonsqueezy-webhook
```

## Endpoint de mercado

La extension consulta:

```text
https://www.inmoradar.app/api/market-price?operation=sale&municipality=Logrono&zone=Casco%20Antiguo&listing_price_total=210000&listing_area_m2=100
```

El endpoint devuelve solo datos agregados procesados. No expone `raw_payload` ni redistribuye el dataset bruto al frontend.

## Endpoint Parking Difficulty

MVP disponible en:

```text
https://www.inmoradar.app/api/parking-difficulty?lat=40.356&lng=-3.520&city=Rivas-Vaciamadrid&perspective=visitor
```

Tambien acepta direccion si no hay coordenadas:

```text
https://www.inmoradar.app/api/parking-difficulty?address=Calle%20Juan%20Gris,%2026,%20Rivas-Vaciamadrid&city=Rivas-Vaciamadrid
```

Para probar sin depender de Overpass:

```text
https://www.inmoradar.app/api/parking-difficulty?lat=40.356&lng=-3.520&city=Rivas-Vaciamadrid&mock=1
```

Devuelve un indice orientativo de dificultad para aparcar de 1 a 10 con `label`, `confidence_score`, perspectiva `visitor|resident`, senales, explicaciones, fuentes y disclaimer. Usa OpenStreetMap/Overpass para parkings, plazas, calles peatonales, living streets y densidad de amenities; Madrid deja preparado el adaptador SER municipal sin afirmar calle regulada si no hay geometria.

La cache persistente vive en `parking_difficulty_cache`. Ejecuta `database/parking-difficulty.sql` en Supabase para activar columnas `city`, `perspective`, RLS e indice unico por contexto. El TTL normal de OSM/heuristica es 7 dias.

Variable opcional:

```text
OVERPASS_URL=https://overpass-api.de/api/interpreter
```

Tests:

```bash
node --test tests/parking-difficulty.test.js
```

## SEO programatico controlado

Primera fase implementada solo para `price_city`. El generador no publica por defecto, calcula `quality_score` y deja `noindex` cualquier landing que no este publicada, ademas de cualquier landing por debajo de 75. Las landings publicas renderizadas por `api/seo-page.js` incluyen el mismo Google Tag Manager activo en la web.

Migracion:

```bash
database/seo-landings.sql
database/seo-cron-runs.sql
```

Dry run local:

```bash
npm run seo:generate -- --limit=5 --dry-run
```

Endpoint admin SEO:

```text
POST /api/admin?resource=seo/generate-landings
Authorization: Bearer ADMIN_IMPORT_TOKEN
```

Body:

```json
{
  "mode": "dry_run",
  "limit": 5,
  "template_type": "price_city",
  "autoPublish": false
}
```

Para generar borradores reales en Supabase, usar `mode: "generate"`. Para publicar automaticamente una pagina desde el endpoint admin, debe usarse `mode: "publish"`, `autoPublish: true`, `quality_score >= 85` y, por defecto, no debe existir otra landing publicada ese mismo dia.

Cron de publicacion controlada:

```text
GET /api/cron/seo-publish
Authorization: Bearer CRON_SECRET
```

GitHub Actions lo ejecuta cada 6 horas (`0 */6 * * *`) usando el secreto `CRON_SECRET` del repo. Vercel Hobby tambien conserva un cron diario compatible (`0 7 * * *`) porque ese plan no permite crons mas frecuentes. El cron intenta primero landings existentes en `draft`, `needs_review` o `ready_to_publish`, las regenera con datos frescos y publica como maximo una por ejecucion si llega a `quality_score >= 85`. Si no hay datos reales suficientes, la landing queda `noindex` y el cron pasa a la siguiente candidata.

El cron usa `seo_cron_runs` para registrar ejecuciones y evitar solapes dentro de la misma hora. Si esa tabla todavia no existe, el cron no se bloquea: sigue publicando con modo degradado y lo indica en la respuesta.
