# Validacion dashboard adquisicion backoffice

Fecha: 2026-05-25

## Resumen ejecutivo

La rama `feature/backoffice-dashboard-acquisition-redesign` queda validada a nivel de diff, checks estaticos, tests y smoke local de HTML servido. El cambio convierte la seccion visible `Ventas` en `Dashboard` y reorganiza la vista principal alrededor de adquisicion, uso de extension y rendimiento SEO sin tocar SEO write, sitemap, extension, rate limiting, billing ni integraciones externas.

La recomendacion es abrir PR para revision y validar visualmente en Vercel Preview/backoffice autenticado antes de mergear.

## Rama y commits

- Rama: `feature/backoffice-dashboard-acquisition-redesign`
- Commit runtime: `9444dde Redesign admin dashboard acquisition view`
- Base confirmada tras `git fetch origin main`: `origin/main` en `2fa8c4c`
- Commit de validacion documental: pendiente al crear este documento

## Archivos tocados

- `admin.html`
- `assets/admin.js`
- `assets/admin.css`
- `api/_admin/handlers/analytics.js`
- `tests/owned-analytics.test.js`
- `DASHBOARD_ACQUISITION_REDESIGN_CHECK.md`

## Cambios revisados

- El menu visible muestra `Dashboard` donde antes aparecia `Ventas`.
- La vista incluye cabecera con subtitulo y filtros `Desde`, `Hasta`, `Aplicar`, `Hoy`, `7d` y `30d`.
- Los filtros sincronizan el rango de `extension/usage` y `analytics/*`.
- Los KPIs superiores se renderizan con valores seguros cuando faltan datos.
- `Evolucion diaria` sigue dentro del bloque de uso de extension.
- Se anade tabla `Adquisicion por fuente`.
- Se anade tabla `Rendimiento por landing`.
- `analytics/summary` conserva el payload anterior y anade `top_sources` de forma aditiva.
- Los estados vacios cubren arrays vacios, campos nulos, ausencia de `top_sources` y ausencia de landings.

## Validacion funcional de datos

### Filtros

- `Hoy`, `7d` y `30d` generan rangos validos.
- `Desde/Hasta` usan normalizacion existente y corrigen orden de fechas por la misma funcion de analytics.
- El rango se aplica a analytics y extension usage.
- El filtro `Hasta` via backend analytics sigue usando el dia completo cuando llega como fecha explicita.
- No se introducen query params incompatibles.

### KPIs

- `Usuarios`, `Nuevos usuarios`, `Sesiones`, `Analisis`, `Activacion extension` y `Media sesion` salen de `extension/usage`.
- `CTA instalacion` y `Clic Chrome Store` salen de analytics propio.
- No se llama `Instalaciones` a clics o intencion.

### Tablas

- `Adquisicion por fuente` usa `top_sources`.
- `Rendimiento por landing` usa `top_pages/pages` ya existentes.
- Conversiones no disponibles se muestran como `-`.
- Activaciones y analisis por fuente quedan en `-` hasta que exista atribucion web-extension.

## Validacion local / visual

Se levanto temporalmente el servidor estatico con `scripts/serve-static.js` en un job local y se comprobo `http://127.0.0.1:4175/admin`.

Resultado:

- El HTML servido contiene el tab `Dashboard`.
- La cabecera contiene filtros `Desde`, `Hasta`, `Aplicar`, `Hoy`, `7d`, `30d`.
- Existe el contenedor `data-dashboard-kpis`.
- Existen las secciones `Adquisicion por fuente` y `Rendimiento por landing`.
- La seccion `Uso de la extension` y `Evolucion diaria` siguen presentes.

Limitacion:

- No se genero captura visual real porque el entorno no expone navegador/Playwright usable en este hilo.
- Falta validacion visual final en Vercel Preview o backoffice autenticado, especialmente responsive desktop/tablet/movil y consola JS con datos reales.

## Checks y tests

Se uso Node bundled porque `node.exe` del PATH devuelve `Acceso denegado`.

Checks:

- `node --check api/admin.js`: OK
- `node --check api/_admin/router.js`: OK
- `node --check api/_admin/handlers/analytics.js`: OK
- `node --check assets/admin.js`: OK

Tests:

- `node --test tests/admin-router.test.js`: 46 pass, 0 fail
- `node --test tests/owned-analytics.test.js`: 17 pass, 0 fail
- `node --test tests/extension-usage.test.js`: 9 pass, 0 fail
- `node --test tests/security-operational.test.js`: 16 pass, 0 fail
- `node --test tests/*.test.js`: 302 pass, 0 fail

Diff hygiene:

- `git diff --check origin/main...HEAD`: OK
- `git diff --check`: OK, solo avisos CRLF habituales al revisar working copy

## Zonas sensibles no tocadas

Confirmado por diff:

- No SEO write.
- No generacion/publicacion SEO.
- No sitemap operativo.
- No robots/canonical.
- No extension, ZIPs ni manifests.
- No rate limiting.
- No Chrome Web Store.
- No Meta, LinkedIn, Runway, Viraliza.
- No checkout, billing, Lemon Squeezy, webhooks, cron ni jobs.
- No schema ni migraciones.

## Riesgos detectados

- La validacion visual completa queda pendiente de preview/backoffice autenticado.
- Las tablas de adquisicion muestran `-` en activacion/analisis por fuente porque aun no existe atribucion directa web-extension.
- Los paneles Premium siguen debajo del dashboard; los filtros globales estan orientados a adquisicion/uso/SEO y no filtran revenue historico.

## Recomendacion

Abrir PR sin merge automatico:

1. Revisar visualmente en Vercel Preview/backoffice.
2. Confirmar consola sin errores JS.
3. Confirmar llamadas API esperadas: `extension/usage`, `analytics/summary`, `analytics/pages`, `analytics/learning`.
4. Confirmar responsive basico.
5. Mergear si no aparecen problemas visuales.
