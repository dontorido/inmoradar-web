# PROJECT_CONTEXT.md

Estado documentado: 2026-05-22.

Este archivo resume el estado actual de `inmoradar-web` para que otro asistente pueda orientarse antes de proponer cambios. Esta basado en los archivos presentes en el repositorio y en el arbol local visible en este momento. No contiene secretos ni valores reales de variables de entorno.

## 1. Resumen del proyecto

`inmoradar-web` es la web publica, API serverless y backoffice de InmoRadar.

InmoRadar es un copiloto inmobiliario para navegador. La web usa el CTA principal **Empezar gratis** y un CTA universal: Chrome, Edge, Brave y Vivaldi abren Chrome Web Store; Opera, Firefox, Safari y navegadores desconocidos abren waitlist. Premium se presenta como upgrade posterior con botones **Activar Premium**. La web presenta el producto, enlaza la instalacion publica en Chrome Web Store, gestiona captacion, Premium, contenidos SEO y contacto. Las APIs dan soporte a la extension y al backoffice: comprobacion Premium, precios de mercado, analisis de inmueble, parking, uso de extension, SEO programatico, releases y generacion de videos sociales.

El backoffice vive en `admin.html` y esta protegido por `ADMIN_IMPORT_TOKEN`. Agrupa Ventas, Marketing, KPIs y Operaciones.

## 2. Stack tecnico real detectado

- Frontend publico: HTML estatico, CSS y JavaScript vanilla.
- Backoffice: HTML estatico (`admin.html`) + JavaScript vanilla (`assets/admin.js`) + CSS (`assets/admin.css` y `assets/admin-video-busy.css`).
- Backend: funciones serverless CommonJS en `api/*.js`, pensadas para Vercel.
- Base de datos: Supabase via REST, usando `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` desde backend.
- Pagos: Lemon Squeezy para checkout, portal y webhooks de suscripcion.
- Email: Cloudflare Email Service para informes Premium y portal; Resend aparece como opcion para contacto.
- IA/video: Runway para clips de video; OpenAI Responses con vision para analisis visual de fotos.
- Datos externos: Overpass/OpenStreetMap, Nominatim, Photon, fuentes publicas de precio.
- Tests: `node:test` nativo de Node, sin framework externo.
- Scripts: Node.js sin build step.
- TypeScript: hay archivos `.ts` de tipos/config (`types/parking.ts`, `lib/viraliza/types.ts`), pero no hay compilacion TypeScript declarada en `package.json`.
- Dependencias npm: `package.json` no declara dependencias.

## 3. Estructura de carpetas

- `.github/workflows/`: automatizaciones GitHub Actions. Contiene el cron SEO que llama a produccion.
- `api/`: funciones serverless y modulos internos de API.
- `api/_address/`: inteligencia de direccion y cache.
- `api/_kpi/`: esquema y defaults de KPIs.
- `api/_parking/`: calculo, senales, cache, Overpass y adaptadores municipales para parking.
- `api/_photo/`: analisis visual de fotos con modelo de vision y cache.
- `api/_reports/`: construccion del email de comparativa de inmuebles guardados.
- `api/_seo/`: generador, autogeneracion, calidad, textos, fuentes de mercado y render SEO.
- `api/cron/`: cron serverless de publicacion SEO.
- `api/og/`: endpoint de imagen Open Graph para landings de precio.
- `api/market-price.js?resource=browser-waitlist`: recurso interno que atiende la lista de espera de Opera, Firefox y Safari sin crear una serverless function adicional.
- `assets/`: CSS, JS, imagenes, favicons, assets de marca y capturas Chrome Web Store.
- `data/`: datos de entrada para importadores de mercado.
- `database/`: SQL de tablas Supabase.
- `docs/`: documentacion tecnica puntual.
- `lib/`: logica compartida por APIs y tests.
- `lib/extension-usage/`: normalizacion y resumen de eventos anonimos de la extension.
- `lib/operations/`: releases y conector Chrome Web Store.
- `lib/sales/`: eventos y resumen de ingresos.
- `lib/browser-waitlist.js`: validacion, saneado, honeypot y persistencia Supabase de la waitlist para Opera, Firefox y Safari.
- `lib/social-video/`: generador de proyectos de video, estrategia, branding, Runway y persistencia.
- `lib/viraliza/`: motor de rutina diaria de viralizacion, plan con cuentas reales importadas manualmente y aprendizaje human-in-the-loop.
- `scripts/`: servidor local estatico, generador SEO e importador de informes publicos.
- `tests/`: tests con `node:test`.
- `tools/`: utilidades para capturas Chrome Web Store.
- `types/`: tipos preparados para migraciones futuras.

## 4. Paginas HTML principales

- `index.html`: home publica.
- `que-analiza.html`: explicacion de analisis.
- `datos.html`: APIs/datos.
- `premium.html`: pagina Premium y formulario de portal.
- `clientes.html`: area de clientes.
- `noticias.html`: listado de noticias/guias.
- `article.html`: plantilla para articulo por slug.
- `faq.html`: preguntas frecuentes.
- `contacto.html`: contacto.
- `privacidad.html`: politica de privacidad.
- `terminos.html`: terminos.
- `success.html`: retorno tras pago correcto y portal por magic link.
- `cancel.html`: retorno tras checkout cancelado.
- `metodologia.html`: metodologia.
- `admin.html`: backoffice.

Rutas limpias definidas en `vercel.json` y `scripts/serve-static.js`: `/`, `/que-analiza`, `/datos`, `/premium`, `/clientes`, `/noticias`, `/noticias/:slug`, `/faq`, `/contacto`, `/privacidad`, `/terminos`, `/success`, `/cancel`, `/admin` y `/backoffice/marketing/viraliza`.

## 5. Endpoints de /api

### Publicos o semipublicos

- `GET /api/health`: estado de API, Supabase, tablas principales, Lemon Squeezy y Cloudflare Email.
- `GET /api/extension-version`: version minima y ultima de la extension.
- `POST /api/extension-usage`: rewrite a `api/extension-version.js?resource=usage`; guarda eventos anonimos de uso de extension.
- `GET /api/check-premium?email=...`: comprueba si un email tiene Premium activo en Supabase.
- `POST /api/check-premium`: comprueba Premium por body.
- `POST /api/saved-properties/email-report`: rewrite a `api/check-premium.js?resource=saved-properties-email-report`; envia informe Premium de inmuebles guardados por Cloudflare Email.
- `POST /api/lemonsqueezy-checkout`: crea checkout Lemon Squeezy.
- `POST /api/lemonsqueezy-portal`: rewrite a `api/lemonsqueezy-checkout.js?resource=portal`; envia o valida magic link para el portal de cliente.
- `POST /api/lemonsqueezy-webhook`: recibe eventos de Lemon Squeezy, valida firma y actualiza `premium_subscriptions` y `premium_revenue_events`.
- `GET /api/market-price`: devuelve referencia agregada de precio de mercado.
- `POST /api/contact`: rewrite a `api/market-price.js?resource=contact`; guarda/envia contacto.
- `GET /api/kpi-settings`: rewrite a `api/market-price.js?resource=kpi-settings`; devuelve ajustes KPI activos sin secretos.
- `GET /api/address-intelligence`: rewrite a `api/market-price.js?resource=address-intelligence`; inteligencia de direccion.
- `GET /api/property-assessment`: rewrite a `api/market-price.js?resource=property-assessment`; evaluacion de anuncio.
- `GET /api/parking-assessment`: rewrite a `api/market-price.js?resource=parking-assessment`; parking integrado en assessment.
- `POST /api/photo-condition-analysis`: rewrite a `api/market-price.js?resource=photo-condition-analysis`; analisis visual de fotos.
- `GET /api/parking-difficulty`: endpoint especifico de Parking Difficulty Score con lat/lng o direccion.
- `GET /api/sitemap` y `/sitemap.xml`: sitemap dinamico.
- `GET /api/news`: rewrite a sitemap con formato news.
- `GET /api/seo-page?slug=...`: render publico de landings SEO.
- `GET /api/og/price-city`: imagen Open Graph para landings.
- `POST /api/waitlist/browser`: ruta publica de lista de espera para Opera, Firefox y Safari. En `vercel.json` reescribe a `api/market-price.js?resource=browser-waitlist` para respetar el limite de Vercel Hobby. Valida email y navegador, aplica honeypot basico y guarda leads en `browser_waitlist_leads` (`database/browser-waitlist-leads.sql`) desde backend.
- `POST /api/analytics/event`: ruta publica de analytics propio anonimo. En `vercel.json` reescribe a `api/market-price.js?resource=owned-analytics-event` para evitar otra serverless function. Acepta solo eventos allowlist, sanea metadata y guarda en `owned_analytics_events` (`database/owned-analytics-events.sql`) si Supabase esta configurado.

### Backoffice

Todos pasan por `api/admin.js` y requieren `ADMIN_IMPORT_TOKEN`.

- `GET /api/admin?resource=summary`: resumen general de Premium, SEO, KPIs, integraciones, ingresos y extension.
- `GET /api/admin?resource=alerts`: alertas operativas del BackOffice; diagnostica `CRON_SECRET`, Supabase, publicaciones SEO recientes, leads de waitlist, actividad Premium y avisos report-driven de mantenimiento nocturno sin crear otra serverless function.
- `GET /api/admin?resource=premium/subscriptions`: listado filtrable de suscripciones.
- `GET /api/admin?resource=extension/usage`: resumen de uso de extension.
- `GET /api/admin?resource=analytics/summary`: resumen de funnel propio: visitas, clicks de instalacion, waitlist, checkout y recomendaciones.
- `GET /api/admin?resource=analytics/pages`: ranking de paginas por conversion.
- `GET /api/admin?resource=analytics/learning`: aprendizaje de contenidos ganadores y paginas a revisar.
- `GET/POST /api/admin?resource=seo/landings`: listado y acciones sobre landings SEO.
- `POST /api/admin?resource=seo/generate-landings`: genera o publica landings.
- `GET/POST /api/admin?resource=seo-autogenerate/run`: estado y ejecucion protegida de autogeneracion SEO cada 6 horas; acepta `dry_run` solo con token admin.
- `GET/POST /api/admin?resource=kpis/settings`: lee/guarda configuracion KPI.
- `GET /api/admin?resource=parking/summary`: resumen de cache parking.
- `GET/POST /api/admin?resource=operations/releases`: gestiona artefactos de release.
- `POST /api/admin?resource=operations/chrome`: operaciones Chrome Web Store: status, upload y publish.
- `POST /api/admin?resource=social-video/generate`: crea storyboard/proyecto de video.
- `GET/POST /api/admin?resource=social-video/projects`: biblioteca de proyectos de video.
- `GET/POST /api/admin?resource=viraliza`: rutina diaria, acciones, comentarios contextuales y aprendizaje.
- `GET/POST /api/admin?resource=viraliza/creators`: lista o guarda cuentas reales revisadas manualmente.
- `POST /api/admin?resource=viraliza/creators/import`: importa un array JSON de cuentas reales.
- `GET /api/admin?resource=viraliza/daily-plan`: genera plan diario de cuentas concretas, comentarios y DMs sugeridos.
- `GET /api/admin?resource=viraliza/performance`: resume acciones, replies, likes, visitas, installs, top creadores, plataformas, tipos de comentario y recomendaciones.
- `GET /api/admin?resource=viraliza/learning`: devuelve aprendizaje semanal con winners, losers, insights y siguientes acciones.
- `POST /api/admin?resource=viraliza/actions`: registra acciones/resultados manuales sobre creadores.
- `GET/POST /api/admin?resource=meta...`: BackOffice Meta para conexion, Pages, ajustes y cola existente.
- `GET/POST /api/meta/...`: spike organica protegida para OAuth, estado y posts de prueba en Facebook/Instagram, sin Ads API.
- `GET /api/admin?resource=social-video/runway-config`: configuracion publica de Runway para UI.
- `GET/POST /api/admin?resource=social-video/render`: estima, lanza o consulta jobs Runway.
- `GET /api/admin?resource=social-video/render-content`: descarga proxy del clip resultante para usarlo en canvas.

### Crons

- `POST /api/admin?resource=seo-autogenerate/run`: cron SEO protegido por `CRON_SECRET` o `ADMIN_IMPORT_TOKEN`, reutilizando `api/admin.js` para no crear otra funcion serverless.
- `POST /api/cron/seo-publish`: cron SEO anterior protegido por `CRON_SECRET` o `ADMIN_IMPORT_TOKEN`, conservado como fallback.

## 6. Backoffice: archivos y flujo general

Archivos principales:

- `admin.html`: estructura de panel, login por token, tabs y formularios.
- `assets/admin.js`: estado, llamadas a `/api/admin`, render de secciones y handlers.
- `assets/admin.css`: estilos del panel.
- `assets/admin-video-busy.css`: estados visuales de trabajo para video.
- `api/admin.js`: router backend compacto para no multiplicar serverless functions en Vercel Hobby.

Flujo:

1. El usuario entra en `/admin` o `/backoffice/marketing/viraliza`.
2. Introduce token admin.
3. `assets/admin.js` guarda el token localmente y llama a `/api/admin?resource=...`.
4. `api/admin.js` valida `ADMIN_IMPORT_TOKEN` via `assertAdmin`.
5. Cada recurso lee o escribe en Supabase o llama a servicios internos.

Alertas de mantenimiento nocturno: `api/admin.js?resource=alerts` reutiliza `lib/operations/nightlyMaintenanceAlerts.js` para leer, si existe, `NIGHTLY_MAINTENANCE_REPORT.md` o `NIGHTLY_REFACTOR_REPORT.md` en la raiz del repo desplegado/local. El helper no crea tablas ni endpoints; convierte el informe en alertas `nightly_maintenance` cuando la automatizacion se detiene por repo sucio, cambios paralelos en archivos sensibles, tests fallidos, rama no subida, informe ausente marcado en el estado o decision humana requerida.


Viraliza con cuentas reales:

- Persistencia: `database/viraliza.sql` define `viral_creators` y `viral_actions`, ademas de rutinas, keywords, comentarios, hooks, videos guardados y resultados agregados.
- UI: `admin.html` + `assets/admin.js` muestran import manual/JSON, plan diario, comentarios/DM sugeridos, formulario de resultados y panel de aprendizaje.
- API: todo pasa por `api/admin.js`; no se crea una serverless function nueva.
- Aprendizaje: `lib/viraliza/engine.js` calcula score por accion, rendimiento por creador/plataforma/tipo de comentario y recomendaciones para el siguiente dia a partir de `viral_actions`.
- Operativa: el sistema recomienda; el usuario abre perfiles, copia textos, publica/envia manualmente y registra resultados.
- Limitacion actual: no hay scraping ni integraciones con credenciales sociales. Las cuentas deben cargarse manualmente.
Secciones actuales:

- Ventas: resumen Premium, tabla de suscriptores, ingresos mensuales y uso de extension.
- Marketing: Vision general, SEO y Noticias, Viraliza y Videos IA. Viraliza permite importar cuentas reales, generar un plan diario de perfiles a revisar y registrar resultados manuales sin scraping ni publicacion automatica.
- KPIs: configuracion de reglas/pesos/visibilidad de KPIs.
- Operaciones: Parking, Web, Extension y Backoffice.

## 7. Integracion Premium

Archivos:

- `premium.html`, `success.html`, `cancel.html`.
- `assets/app.js`.
- `api/lemonsqueezy-checkout.js`.
- `api/lemonsqueezy-webhook.js`.
- `api/check-premium.js`.
- `lib/sales/revenue.js`.
- `database/premium-subscriptions.sql`.
- `database/premium-revenue-events.sql`.
- `database/customer-portal-access-tokens.sql`.
- `database/saved-property-email-reports.sql`.

Flujo checkout:

1. Botones con `data-install-button`, `data-browser-waitlist` y `data-checkout-button` se gestionan desde `assets/app.js`: CTA universal de instalacion/waitlist, waitlist por navegador y checkout Premium quedan separados. El CTA de instalacion visible es `Empezar gratis`; los botones de pago usan `Activar Premium`.
2. `POST /api/lemonsqueezy-checkout` crea checkout con Lemon Squeezy. El frontend envia eventos no bloqueantes `checkout_start`, `checkout_created` y `checkout_error` a `dataLayer`/`gtag`; no hay persistencia backend propia de estos eventos todavia.
3. Lemon Squeezy redirige a `success.html` o `cancel.html`.
4. Webhook `POST /api/lemonsqueezy-webhook` valida firma y sincroniza Supabase.
5. La extension consulta `GET /api/check-premium?email=...`.

Portal cliente:

1. El usuario introduce email en `premium.html` o `success.html`.
2. `POST /api/lemonsqueezy-portal` envia magic link por Cloudflare Email.
3. Al abrir el token, el backend solicita URL firmada de portal Lemon Squeezy.

Ingresos:

- `premium_revenue_events` guarda eventos monetarios.
- `lib/sales/revenue.js` resume ingresos mensuales para el backoffice.

## 8. SEO: landings, sitemap, cron y scripts

Archivos:

- `api/_seo/generator.js`, `autogeneration.js`, `quality.js`, `priceCity.js`, `marketSources.js`, `text.js`, `analytics.js`, `seedPublished.js`, `publishingPolicy.js`, `editorialGuides.js`.
- `lib/seo/cityGuideTemplates.js`.
- `api/seo-page.js`.
- `api/sitemap.js`.
- `api/cron/seo-publish.js`.
- `scripts/seo-generate.js`.
- `.github/workflows/seo-cron.yml`.
- `database/seo-landings.sql`.
- `database/seo-cron-runs.sql`.

Landings:

- Rutas en `vercel.json`: `/precio-metro-cuadrado/:city`, `/precio-alquiler/:city`, `/saber-si-piso-esta-caro/:city`, `/guias/:slug`.
- `api/seo-page.js` renderiza por `slug`.
- El generador controla `quality_score`, `status` e `index_status`.
- `seo_landings` guarda tanto landings programaticas como guias editoriales; `template_type=editorial_guide` se considera noticia/guia para cuotas y feed.

Sitemap:

- `/sitemap.xml` reescribe a `/api/sitemap`.
- Incluye landings y guias publicadas e indexables. `/api/news` reutiliza `api/sitemap.js?format=news` para alimentar home y `/noticias`.

Autogeneracion SEO:

- GitHub Actions llama `/api/admin?resource=seo-autogenerate/run` cada 6 horas con `CRON_SECRET`.
- Vercel Cron esta desactivado en `vercel.json` para mantener compatibilidad con Vercel Hobby.
- Alcance fase 1: solo `price_city` (`/precio-metro-cuadrado/[ciudad]/`) y `expensive_listing_city` (`/saber-si-piso-esta-caro/[ciudad]/`).
- No genera barrios, comparativas, coste oculto, guias largas, paginas sin ciudad ni experimentos.
- Limites duros en codigo: 1 publicacion por ejecucion, 3 en 24h, 10 en 7 dias, `final_score >= 80`, una pagina por ciudad/tipo, `target_path` nuevo, title/H1/meta description unicos, datos reales con fuente y fecha, y bloqueo por similitud excesiva.
- `SEO_AUTOGENERATION_ENABLED=false` actua como kill switch. Con `SEO_AUTOGENERATION_DRY_RUN=false` puede publicar automaticamente si todos los controles pasan.
- Las ejecuciones se registran en `seo_cron_runs` con `job_name=seo-autogeneration`; `result_json` incluye published/draft/skipped/failed y reason por candidato.

Cron anterior:

- `/api/cron/seo-publish` queda conservado como fallback operativo. Su politica diaria usaba Europe/Madrid: 2 landings programaticas + 2 guias editoriales al dia, maximo una publicacion por ejecucion y 4 publicaciones totales.

Configurar CRON_SECRET para SEO cron:

1. En Vercel debe existir `CRON_SECRET` o, como fallback operativo, `ADMIN_IMPORT_TOKEN` para `/api/admin/seo-autogenerate/run`.
2. En GitHub Actions debe existir el secret `CRON_SECRET`.
3. Ruta: GitHub -> Settings -> Secrets and variables -> Actions -> New repository secret.
4. Nombre: `CRON_SECRET`.
5. Valor: debe coincidir con el `CRON_SECRET` configurado en Vercel.
6. `.github/workflows/seo-cron.yml` falla si `CRON_SECRET` esta vacio.
7. Si falta, no se publicaran landings/noticias desde GitHub Actions.

Scripts:

- `npm run seo:generate -- --limit=5 --dry-run`.
- `npm run market:import-public`.

## 9. Parking Difficulty Score

Archivos:

- `api/parking-difficulty.js`.
- `api/_parking/calculateParkingDifficulty.js`.
- `api/_parking/parkingSignals.js`.
- `api/_parking/parseOverpassParkingSignals.js`.
- `api/_parking/overpassClient.js`.
- `api/_parking/municipalAdapters.js`.
- `api/_parking/cache.js`.
- `api/_parking/intelligence.js`.
- `database/parking-difficulty.sql`.
- `database/parking-assessments.sql`.
- `types/parking.ts`.
- `tests/parking-difficulty.test.js`.
- `tests/parking-intelligence.test.js`.

Logica general:

1. Recibe coordenadas o direccion.
2. Si falta lat/lng, intenta geocodificar con Nominatim y Photon.
3. Consulta Overpass/OpenStreetMap salvo `mock=1`.
4. Parseo de senales: parkings, amenities, peatonalizacion, living streets y otros indicadores.
5. Agrega senales municipales si hay adaptador.
6. Calcula score 1-10, label, confianza, explicacion, fuentes y disclaimer.
7. Usa cache en memoria y, si existe Supabase, `parking_difficulty_cache`.

Tambien existe `parkingAssessmentPayload` en `api/_parking/intelligence.js`, usado por `/api/parking-assessment`.

## 10. Generador de videos sociales

Archivos:

- `lib/social-video/generator.js`: genera proyecto, escenas, overlays, preview/export y configuraciones de temas.
- `lib/social-video/videoStrategyInmoRadar.js`: estrategia growth, series, brief, guion, captions, hashtags, variantes A/B y quality check.
- `lib/social-video/branding.js`: branding obligatorio de video.
- `lib/social-video/projects.js`: normalizacion y resumen de proyectos persistidos.
- `lib/social-video/runway.js`: configuracion, coste, payload y llamadas a Runway.
- `api/admin.js`: recursos `social-video/*`.
- `database/social-video-projects.sql`.
- `database/social-video-jobs.sql`.
- `docs/runway-video.md`.
- `tests/social-video.test.js`.

Flujo actual:

1. En Marketing > Videos IA se define brief, tema, tono, duracion, datos del inmueble y estrategia.
2. `social-video/generate` crea storyboard/proyecto con escenas, overlays, prompt y texto para redes.
3. El proyecto puede guardarse en `social_video_projects`.
4. Runway primero estima coste.
5. Si el coste esta confirmado y dentro de limites, `social-video/render` crea job en Runway.
6. `social-video/render` tambien consulta estado por `job_id`.
7. `social-video/render-content` descarga el clip generado para usarlo como fondo.
8. El compositor local monta el video final vertical con marca, textos, progreso y musica.

Notas actuales:

- Runway esta apagado por defecto.
- El backend limita clips Runway a duraciones compatibles y controla coste por render y presupuesto diario.
- El storyboard puede tener mas duracion que el clip Runway; el compositor reutiliza/ajusta el clip.

## 10.5 Analytics propio y aprendizaje SEO/venta

Archivos:

- `database/owned-analytics-events.sql`: tabla `owned_analytics_events`, indices y RLS sin politicas publicas de escritura.
- `lib/analytics/ownedEvents.js`: validacion, saneado y guardado best-effort de eventos anonimos.
- `lib/analytics/learning.js`: resumen por pagina, scoring y recomendaciones de contenido.
- `assets/app.js`: genera `anonymous_session_id`, mantiene GTM/dataLayer y envia eventos no bloqueantes a `/api/analytics/event`.
- `api/market-price.js`: aloja el recurso interno `owned-analytics-event` sin nueva funcion serverless.
- `api/admin.js`: recursos `analytics/summary`, `analytics/pages` y `analytics/learning`.
- `admin.html` y `assets/admin.js`: panel Ventas > Funnel y SEO Performance.
- `tests/owned-analytics.test.js`.

Eventos permitidos: `page_view`, `install_click`, `chrome_store_click`, `waitlist_open`, `waitlist_submit`, `premium_click`, `checkout_start`, `checkout_created`, `checkout_error`, `seo_cta_click`, `guide_cta_click` y `article_cta_click`.

Privacidad: no se guarda IP, email, user agent completo ni datos de pago en `owned_analytics_events`. La metadata elimina claves sensibles y valores con formato email. El tracking es best-effort y no bloquea navegacion ni checkout.

Uso del aprendizaje: el BackOffice detecta paginas, templates, ciudades y temas con mejor tasa de instalacion o checkout, y propone repetir contenidos ganadores o mejorar CTAs de paginas con trafico sin conversion.

SQL pendiente tras deploy: ejecutar `database/owned-analytics-events.sql` en Supabase.
## 11. Variables de entorno usadas

Solo nombres detectados o documentados; no incluir valores:

- `ADMIN_IMPORT_TOKEN`
- `ALLOW_LEMONSQUEEZY_TEST_MODE_IN_PRODUCTION`
- `API_FETCH_TIMEOUT_MS`
- `CHROME_WEBSTORE_ACCESS_TOKEN`
- `CHROME_WEBSTORE_CLIENT_ID`
- `CHROME_WEBSTORE_CLIENT_SECRET`
- `CHROME_WEBSTORE_ITEM_ID`
- `CHROME_WEBSTORE_PUBLISHER_ID`
- `CHROME_WEBSTORE_REFRESH_TOKEN`
- `CHROME_WEBSTORE_TIMEOUT_MS`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_CONTACT_EMAIL_FROM`
- `CLOUDFLARE_EMAIL_API_TOKEN`
- `CLOUDFLARE_EMAIL_FROM`
- `CRON_SECRET`
- `EXTENSION_USAGE_HASH_SECRET`
- `LEMONSQUEEZY_API_KEY`
- `LEMONSQUEEZY_STORE_ID`
- `LEMONSQUEEZY_TEST_MODE`
- `LEMONSQUEEZY_VARIANT_ID`
- `LEMONSQUEEZY_WEBHOOK_SECRET`
- `NODE_ENV`
- `OPENAI_API_KEY`
- `OPENAI_VISION_MODEL`
- `OVERPASS_URL`
- `PUBLIC_SITE_URL`
- `RESEND_API_KEY`
- `RESEND_CONTACT_EMAIL_FROM`
- `RESEND_EMAIL_FROM`
- `RUNWAY_API_SECRET`
- `RUNWAY_DAILY_BUDGET_USD`
- `RUNWAY_DEFAULT_DURATION_SECONDS`
- `RUNWAY_DEFAULT_MODEL`
- `RUNWAY_DEFAULT_RATIO`
- `RUNWAY_DRY_RUN_ONLY`
- `RUNWAY_MAX_COST_USD`
- `RUNWAY_RENDER_ENABLED`
- `RUNWAYML_API_SECRET`
- `SEO_AUTOGENERATION_CANDIDATE_LIMIT`
- `SEO_AUTOGENERATION_DRY_RUN`
- `SEO_AUTOGENERATION_ENABLED`
- `SEO_AUTOGENERATION_MAX_PER_DAY`
- `SEO_AUTOGENERATION_MAX_PER_RUN`
- `SEO_AUTOGENERATION_MAX_PER_WEEK` (default 10, maximo seguro 40)
- `SEO_AUTOGENERATION_MIN_SCORE`
- `SEO_AUTOGENERATION_TARGET_CITIES`
- `SITE_URL`
- `SUPABASE_FETCH_TIMEOUT_MS`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_URL`
- `VERCEL_ENV`

## 12. Scripts disponibles en package.json

- `npm run market:import-public`: ejecuta `node scripts/import-market-public-reports.js`.
- `npm run seo:generate`: ejecuta `node scripts/seo-generate.js`.
- `npm run serve`: ejecuta `node scripts/serve-static.js`.
- `npm test`: ejecuta `node --test tests/*.test.js`.

No hay script de build.

## LinkedIn Autopublisher

- Destino real: `https://www.linkedin.com/company/inmoradar-app/`.
- Modulo: `lib/linkedin/services.js`, rutas en `api/admin.js`, UI en `admin.html` + `assets/admin.js`.
- Tipo MVP activo: `precio_sexy_coste_oculto`.
- Scheduler: el workflow existente llama `POST /api/admin?resource=linkedin/daily`; tambien existe alias `/api/admin/linkedin/autopublisher/run`.
- Reglas: `LINKEDIN_AUTOPOST_ENABLED=false` por defecto, frecuencia cada 2 dias, hora `10:00`, zona `Europe/Madrid`, maximo 1 post por dia.
- Storage: usa `marketing_linkedin_connections`, `marketing_linkedin_settings`, `marketing_linkedin_posts` y `linkedin_autopublisher_runs`.
- Seguridad: tokens cifrados backend-only, sin tokens en frontend/logs, author siempre `organization_urn`.
- Permiso MVP: `w_organization_social`. `r_organization_social` queda como opcional posterior.

## 13. Como probar en local

Opcion estatica simple:

```bash
npm run serve
```

Por defecto levanta `http://127.0.0.1:4173`.

Tambien se puede abrir `index.html` directamente para revisar paginas estaticas, pero las APIs y rewrites funcionan mejor con `npm run serve`.

Pruebas recomendadas:

```bash
npm test
node --test tests/parking-difficulty.test.js
node --test tests/social-video.test.js
node --test tests/seo.test.js
```

Comprobaciones manuales utiles:

- `GET http://127.0.0.1:4173/api/health`
- `GET http://127.0.0.1:4173/admin`
- `GET http://127.0.0.1:4173/api/parking-difficulty?lat=40.356&lng=-3.520&city=Rivas-Vaciamadrid&mock=1`
- `npm run seo:generate -- --limit=5 --dry-run`

Para probar flujos con Supabase, Lemon, Runway, Cloudflare u OpenAI hacen falta sus variables en el entorno local o en Vercel.

## 14. Riesgos tecnicos actuales o zonas delicadas

- Hay muchas responsabilidades en `api/admin.js`; cambiar un recurso puede afectar varias secciones del backoffice.
- Vercel Hobby tiene limite de serverless functions; por eso se usan rewrites y routers compactos. No crear endpoints nuevos sin revisar el limite.
- El arbol local visible al crear este archivo tiene cambios no confirmados y archivos sin trackear. Revisar `git status` antes de editar.
- Supabase se usa via REST con service role desde backend; nunca mover estas llamadas al frontend.
- Las migraciones SQL no se ejecutan automaticamente. Si falta una tabla, muchas pantallas entran en modo degradado.
- Lemon Squeezy depende de firma de webhook; no relajar `LEMONSQUEEZY_WEBHOOK_SECRET`.
- Runway genera coste real; mantener estimacion, confirmacion manual, limites por render y presupuesto diario.
- OpenAI Vision debe seguir siendo backend-only. No exponer `OPENAI_API_KEY` al frontend ni extension.
- Parking usa fuentes externas con timeouts y fallback. Overpass/Nominatim/Photon pueden fallar o rate-limit.
- Varias cadenas del repo muestran mojibake en consola; cuidado con codificacion al editar textos en espanol.
- `DEPLOY.md` y `docs/runway-video.md` pueden diferir en detalles de ratio Runway; confirmar con `lib/social-video/runway.js` antes de cambiar comportamiento.
- El flujo Chrome Web Store guarda artefactos pequenos inline; para paquetes grandes esta pendiente Supabase Storage.
- La waitlist de Opera, Firefox y Safari es publica y no tiene rate limit persistente todavia; mantiene honeypot y deduplicacion, pero conviene vigilar abuso si empieza a recibir spam.

## 15. Recomendaciones para futuros cambios

- Antes de tocar funcionalidad, leer `README.md`, `vercel.json`, `api/admin.js` y el modulo especifico implicado.
- Mantener cambios acotados y evitar refactors amplios en `api/admin.js` salvo que haya tests.
- Si se anade una tabla Supabase, crear SQL en `database/`, modo degradado en UI/API y test.
- Si se anade un endpoint publico, revisar `vercel.json`, `scripts/serve-static.js` y el limite de funciones.
- Si se modifica Premium, probar checkout, webhook, `check-premium` y portal.
- Si se modifica SEO, probar `npm run seo:generate -- --dry-run`, `api/seo-page` y sitemap.
- Si se modifica Parking, ejecutar `tests/parking-difficulty.test.js` y `tests/parking-intelligence.test.js`.
- Si se modifica Videos IA/Runway, ejecutar `tests/social-video.test.js` y comprobar limites de coste/duracion.
- Si se modifica Viraliza, ejecutar `tests/viraliza.test.js` y validar que sigue siendo human-in-the-loop.
- No incluir secretos en docs, commits, fixtures ni capturas.
- Documentar en este archivo cualquier nueva integracion que cambie arquitectura o flujo operativo.
