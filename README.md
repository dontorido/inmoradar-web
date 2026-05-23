# InmoRadar Web

Web estatica publica para InmoRadar.

## Incluye

- `index.html`: landing principal.
- `premium.html`: pagina de conversion Premium.
- `privacidad.html`: politica de privacidad inicial.
- `terminos.html`: terminos de uso iniciales.
- `success.html`: retorno tras pago correcto.
- `cancel.html`: retorno tras pago cancelado.
- `assets/app.js`: gestiona el CTA universal de instalacion/waitlist por navegador y el checkout Premium desde backend.
- `assets/hero-inmoradar.png`: visual principal local.
- `robots.txt` y `sitemap.xml`.
- `_redirects` y `vercel.json` para que `/premium`, `/privacidad`, `/terminos`, `/success` y `/cancel` funcionen en Netlify/Vercel.
- `api/check-premium.js`: endpoint para que la extension compruebe si un email tiene Premium.
- `api/lemonsqueezy-checkout.js`: crea checkouts y abre el Customer Portal de Lemon Squeezy en modo prueba o produccion sin exponer la API key.
- `api/lemonsqueezy-webhook.js`: webhook preparado para sincronizar suscripciones de Lemon Squeezy.
- `api/check-premium.js?resource=saved-properties-email-report`: envio Premium de comparativa de inmuebles guardados por Cloudflare Email Service.
- `lib/browser-waitlist.js`: logica de lista de espera para Opera, Firefox y Safari. La ruta publica `/api/waitlist/browser` reescribe internamente a `api/market-price.js?resource=browser-waitlist` para no anadir otra serverless function en Vercel Hobby.
- `admin.html`, `assets/admin.js` y `assets/admin.css`: backoffice protegido por `ADMIN_IMPORT_TOKEN`.
- `api/admin.js`: backoffice API compacta para Premium, SEO, KPIs, Parking y estado de integraciones. Se usa una sola serverless function para respetar el limite de Vercel Hobby.
- `lib/social-video/*`: generador de guion, storyboard, preview vertical y paquete exportable para Videos IA, con personas de fondo, musica y branding global obligatorio.
- `database/premium-subscriptions.sql`: tabla Supabase para guardar suscripciones Premium.
- `database/saved-property-email-reports.sql`: auditoria y limite diario de emails Premium enviados.
- `database/browser-waitlist-leads.sql`: tabla Supabase para leads de aviso en navegadores no disponibles.
- `database/viraliza.sql`: tablas Supabase de Viraliza, incluidas cuentas reales importadas manualmente (`viral_creators`) y acciones/resultados manuales (`viral_actions`).
- `database/kpi-settings.sql`: tabla Supabase para guardar reglas, pesos, umbrales y visibilidad de KPIs.
- `api/market-price.js`: endpoint agregado para que la extension consulte precios de mercado por zona.
- `database/market-price-sources.sql`: tabla Supabase `market_price_sources` y seed minimo de mercado.
- `database/seo-landings.sql`: tablas `seo_landing_opportunities` y `seo_landings`, reutilizadas para landings programaticas y guias editoriales (`template_type=editorial_guide`).
- `database/seo-cron-runs.sql`: registro y bloqueo suave para evitar ejecuciones SEO solapadas.
- `api/admin.js?resource=seo/generate-landings`: generador admin protegido por `ADMIN_IMPORT_TOKEN`.
- `api/cron/seo-publish.js`: cron protegido por `CRON_SECRET` o `ADMIN_IMPORT_TOKEN` para publicar una pieza SEO por ejecucion siguiendo la politica diaria 2 landings + 2 guias.
- `.github/workflows/seo-cron.yml`: ejecuta el endpoint SEO cada 6 horas desde GitHub Actions; Vercel Hobby queda con un cron diario compatible.
- `api/seo-page.js`: render publico de landings SEO por slug.
- `api/sitemap.js`: sitemap dinamico y feed `/api/news` con landings/guias publicadas e indexables.
- `scripts/seo-generate.js`: dry run local del generador SEO.
- La home incluye una seccion `Noticias` para enlazar publicaciones y guias nuevas.
- `api/parking-difficulty.js`: Parking Difficulty Score con Overpass/OpenStreetMap, perspectiva visitante/residente, scoring y cache en memoria + Supabase.
- `api/_parking/*`: servicios internos para scoring, parser Overpass, adaptadores municipales y cache.
- `types/parking.ts`: tipos TypeScript preparados para migrar el endpoint a TS.
- `database/parking-difficulty.sql`: tablas preparadas para zonas de aparcamiento regulado y cache persistente.
- `tests/parking-difficulty.test.js`: tests basicos del scoring, parser y cache.
- `tests/browser-waitlist.test.js`: tests focalizados de validacion de email/navegador y honeypot de la waitlist Opera, Firefox y Safari.
- `tests/viraliza.test.js`: tests del motor Viraliza, plan diario con cuentas reales y acciones human-in-the-loop.

## Chrome Web Store

La extension para navegadores compatibles esta disponible en:

```text
https://chromewebstore.google.com/detail/inmoradar/mbkjlkagblkmdnjggoggbjiohbjebaab
```

El CTA principal de venta es **Empezar gratis**. El CTA universal detecta navegador: Chrome, Edge, Brave y Vivaldi abren Chrome Web Store; Opera, Firefox, Safari y navegadores desconocidos abren waitlist mediante `/api/waitlist/browser`. Premium se presenta como upgrade posterior con botones **Activar Premium**.

## Checkout

El checkout Premium se crea en backend mediante Lemon Squeezy:

```text
POST /api/lemonsqueezy-checkout
```

Por defecto usa `LEMONSQUEEZY_TEST_MODE=true`, asi que sirve para probar compras sin cobrar dinero real. Los botones con `data-checkout-button` llaman a este endpoint y redirigen al `checkout_url` devuelto por Lemon Squeezy. El frontend registra eventos no bloqueantes `checkout_start`, `checkout_created` y `checkout_error` en `dataLayer`/`gtag`; queda pendiente persistencia backend propia de funnel si se habilita una tabla o recurso existente adecuado.

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

El portal de cliente usa magic link propio. El usuario introduce su email, InmoRadar valida que exista una suscripcion Premium activa y envia un enlace temporal al email de compra mediante Cloudflare Email. Ese enlace caduca a los 15 minutos, se guarda hasheado en `customer_portal_access_tokens` y solo puede usarse una vez. Al abrirlo, el backend solicita a Lemon Squeezy una URL `customer_portal` firmada y redirige al portal oficial. No se envia al usuario al portal generico `/billing` por conocer solo un email.

SQL necesario:

```text
database/customer-portal-access-tokens.sql
```

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
- usar Viraliza con cuentas reales importadas manualmente, plan diario de perfiles a revisar, comentarios/DM sugeridos y registro manual de resultados.

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


## Analytics propio y aprendizaje de contenidos

InmoRadar mantiene GTM/dataLayer para analitica externa y anade tracking propio anonimo en Supabase para cruzar SEO, instalacion, waitlist, checkout y Premium sin guardar IP, emails ni datos de pago en la tabla de eventos.

SQL necesario si no esta ejecutado:

```bash
database/owned-analytics-events.sql
```

Ruta publica de eventos:

```text
POST /api/analytics/event
```

Internamente se reescribe a `api/market-price.js?resource=owned-analytics-event` para no crear otra serverless function en Vercel Hobby. El frontend usa `anonymous_session_id` en `localStorage`, envia eventos best-effort y nunca bloquea navegacion, instalacion ni checkout.

Eventos permitidos:

```text
page_view, install_click, chrome_store_click, waitlist_open, waitlist_submit,
premium_click, checkout_start, checkout_created, checkout_error,
seo_cta_click, guide_cta_click, article_cta_click
```

Recursos admin protegidos:

```text
GET /api/admin?resource=analytics/summary
GET /api/admin?resource=analytics/pages
GET /api/admin?resource=analytics/learning
```

El BackOffice muestra en Ventas > Funnel y SEO Performance el ranking de paginas, ciudades, temas, templates y recomendaciones para orientar futuros contenidos.
## Viraliza con cuentas reales

Viraliza sigue siendo human-in-the-loop: no hace scraping, no sigue cuentas, no publica comentarios y no envia DMs automaticamente. El BackOffice solo propone acciones para que el usuario revise y ejecute manualmente.

SQL necesario si no esta ejecutado:

```bash
database/viraliza.sql
```

Recursos admin protegidos por `ADMIN_IMPORT_TOKEN`:

```text
GET/POST /api/admin?resource=viraliza/creators
POST /api/admin?resource=viraliza/creators/import
GET /api/admin?resource=viraliza/daily-plan
GET /api/admin?resource=viraliza/performance
GET /api/admin?resource=viraliza/learning
POST /api/admin?resource=viraliza/actions
```

Formato JSON de import manual:

```json
[
  {
    "platform": "tiktok",
    "handle": "@cuenta_real",
    "display_name": "Nombre de cuenta",
    "profile_url": "https://www.tiktok.com/@cuenta_real",
    "category": "asesor_hipotecario",
    "city": "Madrid",
    "topics": ["hipoteca", "comprar piso", "primera vivienda"],
    "followers_count": 25000,
    "avg_views": 12000,
    "avg_comments": 80,
    "posting_frequency": "3-5/semana",
    "notes": "Cuenta real revisada manualmente"
  }
]
```

Flujo operativo:

1. Importar o guardar cuentas reales revisadas manualmente.
2. Pulsar `Actualizar plan de hoy` en Marketing -> Viraliza.
3. Abrir perfiles, revisar contexto y copiar comentario o DM solo si encaja.
4. Registrar manualmente revisado, comentado, seguido, DM enviado o descartado.
5. Volver despues de 24h y anotar likes, respuestas, visitas de perfil, installs atribuidas, estado final y notas.
6. Revisar `Aprendizaje` para ver score medio, top cuentas, top plataformas, tipos de comentario y recomendaciones para manana.

El score Viraliza es orientativo y pondera mas las respuestas, instalaciones atribuidas y visitas de perfil que los likes. Un DM con respuesta pesa mas que un comentario sin respuesta. El sistema aprende desde `viral_actions`, pero no publica ni envia nada por si solo.

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

El generador soporta landings programaticas (`price_city`, `rent_city`, `expensive_listing_city`) y guias editoriales (`editorial_guide`) guardadas en `seo_landings`. No publica por defecto, calcula `quality_score` y deja `noindex` cualquier pieza que no este publicada, ademas de cualquier contenido por debajo de 75. Las paginas publicas renderizadas por `api/seo-page.js` incluyen el mismo Google Tag Manager activo en la web.

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

Para generar borradores reales en Supabase, usar `mode: "generate"`. Para publicar automaticamente una pagina desde el endpoint admin, debe usarse `mode: "publish"`, `autoPublish: true` y `quality_score >= 85`. `template_type=random` o `landing_random` limita a landings programaticas; `template_type=editorial_guide` genera guias editoriales.

Cron de publicacion controlada:

```text
GET /api/cron/seo-publish
Authorization: Bearer CRON_SECRET
```

GitHub Actions lo ejecuta cada 6 horas (`0 */6 * * *`) usando el secreto `CRON_SECRET` del repo. Vercel Hobby tambien conserva un cron diario compatible (`0 7 * * *`) porque ese plan no permite crons mas frecuentes. La politica diaria usa fecha natural Europe/Madrid: maximo 2 landings programaticas y 2 guias editoriales al dia, con maximo 4 publicaciones totales. Cada ejecucion publica como maximo una pieza; si ya hay 2 landings, prioriza guia; si ya hay 2 guias, prioriza landing; si ambas cuotas estan llenas responde `skipped: true`.

El cron usa `seo_cron_runs` para registrar ejecuciones y evitar solapes dentro de la misma hora. Si esa tabla todavia no existe, el cron no se bloquea: sigue publicando con modo degradado y lo indica en la respuesta. No hay SQL nuevo para la politica 2+2: se distingue landing vs guia con `template_type` dentro de `seo_landings`.

### Configurar CRON_SECRET para SEO cron

Para que el cron SEO funcione en producción hay dos sitios que deben compartir el mismo secreto:

1. En Vercel debe existir `CRON_SECRET` o, como fallback operativo, `ADMIN_IMPORT_TOKEN` para proteger `/api/cron/seo-publish`.
2. En GitHub Actions debe existir el repository secret `CRON_SECRET`.
3. La ruta en GitHub es: Settings -> Secrets and variables -> Actions -> New repository secret.
4. El nombre debe ser `CRON_SECRET`.
5. El valor debe coincidir con el `CRON_SECRET` configurado en Vercel.
6. `.github/workflows/seo-cron.yml` falla de forma explícita si `CRON_SECRET` está vacío.
7. Si falta, GitHub Actions no publicará landings/noticias desde el workflow SEO.

No documentar valores reales de secretos en el repo.
