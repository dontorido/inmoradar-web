# Auditoria integral nocturna - Estabilidad, seguridad, rendimiento y modularidad InmoRadar

Fecha: 2026-05-24
Rama: `feature/system-architecture-hardening-audit`
Base: `origin/main` en el commit `576d270 Document extension analytics production deploy`
Produccion: no tocada. Sin deploys. Sin credenciales reales. Sin publicaciones externas.

## 1. Resumen ejecutivo

El sistema esta funcional y con una base de tests muy saludable: en la linea base pasan 234 tests. La arquitectura actual concentra mucha logica en pocas piezas grandes, especialmente `api/admin.js`, `assets/admin.js` y `api/market-price.js`. Aun asi, el proyecto ya tiene buenas defensas: kill switches para SEO/Meta/LinkedIn/Runway, service role solo en backend, sanitizacion Meta, RLS habilitado en SQL y tests amplios.

Durante esta tarea se aplicaron mejoras de bajo riesgo:

- Saneador comun de errores en `api/_utils.js`.
- Supabase, admin, health, cron SEO y autogeneracion SEO usan el saneador compartido.
- El endpoint publico de uso de extension acepta `?resource=usage` desde la URL y rechaza JSON mayor de 16 KB antes de tocar Supabase.
- El servidor local `scripts/serve-static.js` se sincronizo con rewrites operativas clave de `vercel.json`.
- Se anadieron tests de sanitizacion, extension usage y rewrites locales.

No se han activado automatismos peligrosos. `META_AUTOPOST_ENABLED` no se ha tocado. No se han llamado endpoints reales de Meta, Instagram, Facebook, Google Search Console, Chrome Web Store, LinkedIn ni Runway.

## 2. Estado actual del sistema

InmoRadar es una web estatica con APIs serverless en Vercel. Usa:

- `api/` para endpoints publicos, privados y cron.
- `assets/` para frontend publico y backoffice.
- `lib/` para modulos de dominio ya parcialmente extraidos.
- `database/` para SQL declarativo no ejecutado desde esta tarea.
- `tests/` con suite Node nativa.
- `scripts/` para servidor local, SEO generation e importaciones.

La salud inicial fue buena:

- `node --check api/admin.js`: OK con Node bundled.
- `node --check assets/admin.js`: OK con Node bundled.
- `node --check api/sitemap.js`: OK con Node bundled.
- `node --check api/seo-page.js`: OK con Node bundled.
- `api/news.js`: no existe como archivo; `/api/news` reescribe a `/api/sitemap?format=news`.
- `node --test tests/*.test.js`: 234 pass, 0 fail.
- `git diff --check`: OK.

Nota operativa: el `node.exe` del PATH dio "Acceso denegado" en este entorno; se uso el Node bundled de Codex:
`C:\Users\SergioTorio\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`.

## 3. Mapa de carpetas y responsabilidades

- `api/`: funciones serverless. Mezcla APIs publicas, admin, cron y helpers internos.
- `api/_seo/`: generacion, calidad, fuentes, politica editorial 2+2 y autogeneracion SEO.
- `api/_parking/`: calculo y fuentes de dificultad de aparcamiento.
- `api/_photo/`: analisis de fotos con OpenAI.
- `api/_address/`: inteligencia de direccion con idealista/maps y Catastro.
- `api/_kpi/`: schema y coercion de KPIs.
- `api/_reports/`: reportes por email.
- `lib/analytics/`: aprendizaje de eventos propios.
- `lib/extension-usage/`: normalizacion y resumen de uso de extension.
- `lib/meta/`: settings, OAuth, contenido, imagenes y publicacion Meta.
- `lib/linkedin/`: OAuth, settings, generacion y publicacion LinkedIn.
- `lib/operations/`: releases, Chrome Web Store, alertas nocturnas.
- `lib/social-video/`: estrategia, Runway, proyectos y branding.
- `lib/viraliza/`: motor de planificacion human-in-the-loop.
- `database/`: SQL idempotente propuesto/aplicable manualmente.
- `assets/admin.*`: backoffice monolitico frontend.
- `assets/app.js`: web publica, noticias, analitica propia, waitlist.
- `scripts/serve-static.js`: servidor local y rewrites.

## 4. Mapa de endpoints

Publicos principales:

- `/api/health`, `/api/status`, `/api`.
- `/api/market-price` y rewrites: `/api/contact`, `/api/address-intelligence`, `/api/property-assessment`, `/api/parking-assessment`, `/api/kpi-settings`, `/api/photo-condition-analysis`, `/api/waitlist/browser`, `/api/analytics/event`.
- `/api/check-premium` y `/api/saved-properties/email-report`.
- `/api/lemonsqueezy-checkout`, `/api/lemonsqueezy-portal`, `/api/lemonsqueezy-webhook`.
- `/api/extension-version`, `/api/extension-usage`.
- `/api/sitemap`, `/api/news`.
- `/api/seo-page` para rutas SEO publicas.
- `/api/parking-difficulty`.
- `/api/og/price-city`.

Privados/admin:

- `/api/admin?resource=summary`.
- `premium/subscriptions`, `seo/landings`, `seo/generate-landings`, `seo-autogenerate/run`.
- `analytics/summary`, `analytics/pages`, `analytics/learning`.
- `extension/usage`, `kpis/settings`, `parking/summary`.
- `operations/releases`, `operations/chrome`.
- `linkedin/*`, `meta/*`, `social-video/*`, `viraliza/*`.

Cron:

- `/api/cron/seo-publish`.
- `/api/admin?resource=seo-autogenerate/run` acepta admin o cron token.
- `/api/admin?resource=meta/autopublisher/run` acepta admin o cron token.
- `/api/admin?resource=linkedin/autopublisher/run` acepta admin o cron token.

## 5. Mapa de modulos

Modulos reales existentes:

- SEO programatico: `api/_seo/*`, `lib/seo/*`, `api/seo-page.js`, `api/sitemap.js`, `api/cron/seo-publish.js`.
- Backoffice: `api/admin.js`, `assets/admin.js`, `admin.html`, `assets/admin.css`.
- Analitica propia: `lib/analytics/*`, `lib/extension-usage/*`, `api/extension-version.js`, recursos admin.
- Social/Meta: `lib/meta/*`, recursos `meta/*` en `api/admin.js`.
- Social/LinkedIn: `lib/linkedin/services.js`, recursos `linkedin/*`.
- Video social/Runway: `lib/social-video/*`, recursos `social-video/*`.
- Parking/address/photo intelligence: `api/_parking/*`, `api/_address/*`, `api/_photo/*`, `api/parking-difficulty.js`.
- Monetizacion: Lemon Squeezy y premium en `api/lemonsqueezy-*`, `api/check-premium.js`, `lib/sales/revenue.js`.
- Operaciones: releases, Chrome Web Store, status page, nightly alerts.

## 6. Flujo SEO

Generacion:

- Manual desde backoffice: `assets/admin.js` -> `/api/admin?resource=seo/generate-landings` -> `api/_seo/generator.js`.
- Autogeneracion controlada: `/api/admin?resource=seo-autogenerate/run` -> `api/_seo/autogeneration.js`.
- Cron legacy/operativo: `/api/cron/seo-publish` -> `runSeoLandingGeneration`.

Validacion:

- `api/_seo/quality.js` calcula calidad.
- `api/_seo/publishingPolicy.js` aplica politica diaria 2 landings + 2 guias.
- Dedupe por slug/titulo/meta/h1 se valida en generacion y tests.

Publicacion:

- Status `published`, `index_status=index`, `published_at`.
- El cron usa lock `seo_cron_runs` por hora para reducir solapes.

Sitemap/news:

- `/api/sitemap` consulta `seo_landings` publicadas, indexables y `quality_score >= 75`, limite 500.
- `/api/news` es rewrite a `/api/sitemap?format=news`.

Render publico:

- `/api/seo-page?slug=...` busca landing en Supabase y cae a seed fallback.
- Robots por pagina: `index,follow` solo si publicada, indexable y score >= 75.

Backoffice:

- `seo/landings` lista, pagina, filtra y permite acciones `publish`, `noindex`, `archive`, `regenerate`.

## 7. Flujo de analitica

Extension:

- Extension -> `/api/extension-usage` -> `api/extension-version.js?resource=usage` -> `extensionUsageEventFromInput` -> `extension_usage_events`.
- Se hash/anonymiza install/session.
- Mejora aplicada: limite 16 KB y soporte robusto de query desde URL.

Web publica:

- `assets/app.js` emite eventos consentidos a `/api/analytics/event`.
- `lib/analytics/ownedEvents.js` limita cuerpo a 24 KB, lista eventos permitidos y redacciona metadata sensible.

Base de datos:

- `owned_analytics_events`.
- `extension_usage_events`.

Backoffice/KPIs:

- `api/admin?resource=analytics/*` calcula resumen, paginas y aprendizaje.
- `api/admin?resource=extension/usage` resume uso, sesiones, usuarios, activacion y series temporales.
- `api/_kpi/settings.js` parametriza thresholds de KPIs.

## 8. Flujo Meta/social

Settings:

- `lib/meta/settings.js` define defaults seguros. `META_AUTOPOST_ENABLED` por defecto false.
- `marketing_meta_settings.autopost_enabled` tambien debe estar true para publicar.

OAuth:

- `lib/meta/oauth.js` construye URL y cifra tokens con AES-256-GCM.
- Conexion guarda tokens cifrados en `marketing_meta_connections`.

Paginas:

- `fetchManagedPages` lee Pages y cuenta Instagram asociada.
- `sanitizePage` evita devolver `access_token`.

Borradores:

- `generateNextMetaPost` elige landing publicada/indexable/calidad >= 75 y crea draft.

Publicacion:

- `publishMetaPostById` valida conexion, settings, kill switch, imagen publica para Instagram, Page ID, scopes y frecuencia.
- `publishToPlatform` llama Graph solo si todo esta listo.

Kill switch:

- Publicacion real requiere `META_AUTOPOST_ENABLED=true` y `autopost_enabled=true`. No se cambio.

## 9. Flujo de seguridad

Auth:

- Admin: `ADMIN_IMPORT_TOKEN` por bearer o `x-admin-token`.
- Cron/admin especial: `CRON_SECRET` o `ADMIN_IMPORT_TOKEN` para rutas automaticas.
- Publicos: health, sitemap/news, SEO pages, calculadoras, analitica, waitlist, extension usage.

Variables:

- Service role solo backend via `api/_utils.js`.
- Integraciones externas por env, con checks de configuracion.

Service role:

- `supabaseFetch` usa `SUPABASE_SERVICE_ROLE_KEY`.
- Las claves `sb_secret_...` no se mandan como JWT bearer; se usan como `apikey`.
- Mejora aplicada: errores Supabase fallidos se saneam antes de salir.

CORS:

- `json()` aplica `access-control-allow-origin: *`. Es practico para extension/publicos, pero en admin aumenta dependencia en secreto bearer.

Logs:

- Meta ya saneaba secretos.
- Mejora aplicada: admin, cron SEO, health y autogeneration comparten saneador general.

## 10. Riesgos criticos

1. `api/admin.js` concentra muchas capacidades mutables bajo un unico token. Si `ADMIN_IMPORT_TOKEN` se filtra, el blast radius es alto.
2. El service role se usa en muchas funciones serverless. No se ha detectado exposicion directa al cliente, pero cualquier error no saneado o endpoint admin comprometido puede saltarse RLS.
3. Los endpoints de publicacion externa existen y son potentes. Los kill switches actuales reducen el riesgo, pero conviene mantener doble confirmacion y tests.
4. No hay rate limiting durable centralizado para endpoints publicos de escritura. Hay limites de cuerpo en varios endpoints, pero no cuota por IP/session.

## 11. Riesgos medios

- `api/admin.js` (~4000 lineas) y `assets/admin.js` son monolitos con muchas responsabilidades.
- Validacion de metodos no esta centralizada; algunas rutas lo hacen en el handler, otras en subhandlers.
- `readRawBody` compartido no tiene limite global; varios endpoints implementan limites propios, otros no.
- CORS wildcard en respuestas JSON de admin.
- Consultas admin con `limit=1000/5000` pueden tensionar Vercel si crece el dataset.
- Sitemap/news, render SEO y social comparten criterios de indexacion pero no un contrato unico.
- `scripts/serve-static.js` se habia quedado por detras de `vercel.json`; mitigado para rutas clave.
- Muchos errores persistidos usan `error.message`; tras esta tarea Supabase y catch compartidos estan saneados, pero conviene extenderlo a todos los modulos externos.

## 12. Riesgos bajos

- Textos, dominios y marca InmoRadar estan hardcodeados en varios modulos.
- `database/seo-landings.sql` contiene seed textual historico con posible encoding antiguo en algunas cadenas.
- `_redirects` no esta tan completo como `vercel.json`; puede ser intencional si Vercel es unico runtime, pero conviene decidir fuente de verdad.
- Tests muy buenos, pero no hay una capa de contrato HTTP comun para todos los endpoints.

## 13. Quick wins implementables

- Router declarativo admin `resource -> handler -> allowedMethods -> auth`.
- Helper comun `safeJsonBody(req, { maxBytes })`.
- Helper comun `methodNotAllowed(res, allowed)`.
- Helper de `safeErrorPayload`.
- Contrato unico para landings indexables/publicables.
- Repositorios Supabase por modulo.
- Snapshot de rewrites generado desde `vercel.json` para servidor local.
- Tests de CORS/admin no exposicion de secretos.
- Tests de rate-limit conceptual o local in-memory para endpoints publicos.

## 14. Quick wins implementados durante esta tarea

- `sanitizeErrorMessage` en `api/_utils.js`.
- Saneado de errores Supabase antes de lanzar excepciones.
- `api/admin.js` usa saneador en `safeFetch`, catch general y fallos directos de LinkedIn/SEO autogeneration.
- `api/health.js`, `api/cron/seo-publish.js` y `api/_seo/autogeneration.js` reutilizan saneador comun.
- `api/extension-version.js` acepta `resource=usage` desde URL, limita POST de uso extension a 16 KB y devuelve errores genericos.
- `scripts/serve-static.js` se sincroniza con rewrites operativas de Vercel.
- Tests anadidos/reforzados:
  - `tests/security-sanitization.test.js`.
  - `tests/extension-usage.test.js`.
  - `tests/status.test.js`.

## 15. Cambios que NO conviene hacer todavia

- Reescribir `api/admin.js` entero.
- Cambiar auth/RLS de produccion sin revision manual.
- Activar `META_AUTOPOST_ENABLED`.
- Ejecutar migraciones multi-tenant.
- Introducir Redis/colas externas.
- Cambiar DNS, dominios o env reales.
- Cambiar pricing, textos comerciales o landings fuera del alcance tecnico.
- Reorganizar carpetas globalmente sin fase de compatibilidad.

## 16. Propuesta de arquitectura modular

Objetivo: conservar endpoints externos, pero mover la logica a contratos por dominio.

```
lib/
  config/
  db/
  http/
  logging/
  security/
  validation/
  modules/
    seo/
    sitemap/
    analytics/
    social/
    backoffice/
    projects/
    jobs/

api/
  admin/
  public/
  webhooks/
  cron/
```

Primer paso recomendado: extraer sin cambiar rutas.

## 17. Propuesta de estructura ideal

```
lib/config/site.js
lib/config/env.js
lib/db/supabaseClient.js
lib/http/json.js
lib/http/body.js
lib/http/router.js
lib/security/errors.js
lib/security/adminAuth.js
lib/modules/seo/service.js
lib/modules/seo/repository.js
lib/modules/seo/publicationPolicy.js
lib/modules/analytics/service.js
lib/modules/social/metaService.js
lib/modules/backoffice/adminResources.js
lib/modules/projects/projectContext.js
```

## 18. Propuesta de separacion por modulos

- Admin router: solo auth, metodo, dispatch y errores.
- Repositories: cada tabla con funciones `list`, `get`, `upsert`, `patch`.
- Services: reglas de negocio.
- Presenters: payloads de backoffice y publico.
- Jobs: procesos idempotentes con locks.
- Integrations: Meta, LinkedIn, Lemon, Chrome, Runway, OpenAI.

## 19. Propuesta para sistema multi-proyecto

Parametrizar:

- Dominio canonico.
- Nombre/marca.
- Modulos activos.
- SEO templates activos.
- Social settings.
- Analytics settings.
- Textos legales.
- Assets.
- Tema visual.

Modelo conceptual futuro:

```
projects
project_settings
project_modules
seo_landings.project_id
analytics_events.project_id
extension_usage_events.project_id
social_accounts.project_id
social_posts.project_id
```

No se recomienda aplicar migraciones reales ahora.

## 20. Propuesta para duplicar/reutilizar el backoffice

- Crear `projectContext` con `projectId`, `brand`, `domain`, `modules`.
- Convertir `assets/admin.js` en capas: shell, API client, widgets por modulo.
- Mover copies/labels a config por proyecto.
- Mantener endpoints legacy y anadir versionados internos.
- Probar con un proyecto fixture antes de tocar datos reales.

## 21. Plan de migracion por fases

Fase 1: seguridad y contratos HTTP.

- Saneador comun, body limits, method map, tests de auth/errores.

Fase 2: admin resources.

- Dividir `api/admin.js` por recursos internos sin cambiar URL publica.

Fase 3: repositorios.

- `seoRepository`, `analyticsRepository`, `socialRepository`, `operationsRepository`.

Fase 4: config por proyecto.

- `projectContext` single-project con defaults InmoRadar.

Fase 5: multi-proyecto documental.

- SQL de propuesta, tests de project isolation, sin migrar produccion.

Fase 6: migracion real opcional.

- Solo con backup, migracion reversible y revision manual.

## 22. Tests recomendados

Seguridad:

- Admin no devuelve tokens aunque integraciones fallen.
- CORS/admin: documentar o limitar origen.
- Kill switches Meta/LinkedIn/Runway.
- Body limit uniforme.

SEO:

- Contrato comun `isIndexableLanding`.
- Sitemap/news/social usan el mismo filtro.
- Canonical y robots por estado.
- Race conditions en cron/autogeneration.

Rendimiento:

- Paginacion admin.
- Limites maximos por recurso.
- Tests de payload maximo.

Modularidad:

- Repositories devuelven estructuras estables.
- Router admin declara metodos y auth.

## 23. Checklist de aceptacion

- [x] Rama nueva desde `origin/main`.
- [x] Main intacto.
- [x] Sin deploy.
- [x] Sin credenciales reales.
- [x] Sin publicaciones externas.
- [x] Tests linea base ejecutados.
- [x] Mejoras seguras aplicadas.
- [x] Tests nuevos anadidos.
- [x] Documentacion tecnica generada.
- [ ] Commit final creado al cierre de la tarea.
- [x] Verificacion final completa ejecutada al cierre.

## 24. Lista de comandos ejecutados

- `git status -sb`
- `git branch --show-current`
- `git log --oneline -5`
- `git remote -v`
- `git fetch origin main`
- `git switch -c feature/system-architecture-hardening-audit origin/main`
- `rg --files`
- `Get-Content -Raw package.json`
- `node --check api/admin.js` con Node bundled
- `node --check assets/admin.js` con Node bundled
- `node --check api/sitemap.js` con Node bundled
- `node --check api/seo-page.js` con Node bundled
- `node --test tests/*.test.js` con Node bundled
- `git diff --check`
- `rg` sobre env vars, Supabase, fetches, resources y rewrites
- Tests dedicados tras cambios: `tests/security-sanitization.test.js`, `tests/extension-usage.test.js`, `tests/status.test.js`

## 25. Resultado final

Resultado tecnico hasta este punto:

- Diagnostico integral completado.
- Cambios de bajo riesgo implementados y probados localmente.
- No se han hecho cambios peligrosos.
- Quedan pendientes de revision por la manana:
  - Aceptar la politica de CORS/admin.
  - Decidir si `vercel.json` debe ser la unica fuente de rewrites.
  - Priorizar extraccion gradual de `api/admin.js`.
  - Definir si multi-proyecto sera clon separado o tenant real.

## Informe de cierre

Rama usada: `feature/system-architecture-hardening-audit`.

Commits creados: pendiente de commit final tras verificacion final.

Archivos modificados:

- `api/_utils.js`
- `api/admin.js`
- `api/cron/seo-publish.js`
- `api/health.js`
- `api/_seo/autogeneration.js`
- `api/extension-version.js`
- `scripts/serve-static.js`
- `tests/extension-usage.test.js`
- `tests/status.test.js`

Archivos anadidos:

- `tests/security-sanitization.test.js`
- `AUDITORIA_ARQUITECTURA_SEGURIDAD_RENDIMIENTO_MODULARIDAD.md`
- `PLAN_REFACTORIZACION_MODULAR_INMORADAR.md`

Cambios solo documentados:

- Arquitectura modular objetivo.
- Plan multi-proyecto.
- Riesgos CORS/rate limiting/admin monolith.
- Indices/SQL futuro solo como recomendacion, sin ejecutar.

Riesgos mitigados:

- Exposicion accidental de secretos en errores compartidos.
- POST publico de uso extension sin limite propio.
- Desalineacion de rewrites locales con rutas Vercel clave.

Riesgos pendientes:

- Monolito admin.
- Rate limiting durable.
- CORS wildcard.
- Repositorios Supabase por modulo.
- Project context/multi-proyecto.

Verificaciones manuales:

- Se revisaron rutas Vercel, `_redirects`, servidor local, robots, sitemap/news, SEO render, cron SEO, admin resources, Meta, LinkedIn, extension usage y analitica.

Tests ejecutados:

- `node --check api/admin.js`: OK.
- `node --check assets/admin.js`: OK.
- `node --check api/sitemap.js`: OK.
- `node --check api/news.js`: no existe; `/api/news` se sirve via rewrite a `/api/sitemap?format=news`.
- `node --check api/seo-page.js`: OK.
- `node --check scripts/serve-static.js`: OK.
- `node --test tests/*.test.js`: 239 pass, 0 fail.
- `git diff --check`: OK.

Resultado de cada test:

- Suite completa Node: 239 tests pass.
- Tests nuevos incluidos dentro de la suite: sanitizacion de secretos, limite de extension usage, query `resource=usage` por URL y rewrites locales clave.

Que revisar por la manana:

1. Diff completo de la rama.
2. Decidir si se acepta el saneador comun como patron.
3. Validar que el limite 16 KB para extension usage es suficiente.
4. Confirmar si el servidor local debe mantenerse sincronizado manualmente o generado desde `vercel.json`.
5. Elegir siguiente fase: admin router declarativo o body limits compartidos.

Prompt sugerido para la siguiente fase:

```text
Continuar en la rama feature/system-architecture-hardening-audit. Sin deploy y sin tocar produccion. Extrae un router declarativo interno para api/admin.js que mantenga exactamente las mismas URLs y payloads, empezando solo por recursos de bajo riesgo: alerts, summary, extension/usage, kpis/settings y parking/summary. Anade tests de metodo permitido, auth requerida y errores saneados para cada recurso migrado. No muevas todavia Meta, LinkedIn, SEO generation ni Social Video.
```

## Evolucion posterior: router declarativo read-only para api/admin.js

Fecha: 2026-05-24
Rama: `feature/admin-router-readonly-refactor`

Se anadio un router declarativo interno en `api/_admin/router.js` para empezar a reducir el dispatch manual de `api/admin.js` sin cambiar la interfaz externa del backoffice.

Recursos migrados al router:

- `alerts`: `GET`, pre-gate de Supabase, conserva respuesta `{ ok, generated_at, alerts }`.
- `summary`: `GET`, post-gate de Supabase, conserva respuesta de resumen general.
- `extension/usage`: `GET`, post-gate de Supabase, conserva ventanas, limites y payload de uso de extension.
- `parking/summary`: `GET`, post-gate de Supabase, conserva resumen de cache y assessments.

Que no se extrajo:

- Los handlers de dominio siguen dentro de `api/admin.js`. Moverlos a ficheros dedicados obligaba a arrastrar helpers, imports y dependencias compartidas, lo que subia el riesgo de esta fase.
- Recursos con escritura o efectos externos quedaron en flujo legacy: SEO generation, Meta, LinkedIn, Social Video, Viraliza actions, releases, Chrome operations y Kpis write.
- Recursos read-only mas complejos como `analytics/*` se dejaron legacy porque ya tienen su propio comportamiento sin Supabase configurado y conviene moverlos como lote completo.

Riesgos mitigados:

- El dispatch de cuatro recursos read-only ya no depende de una cadena creciente de `if (resource === ...)`.
- El router devuelve `null` para recursos no migrados, asi que el fallback legacy sigue intacto.
- Los metodos no soportados de rutas registradas devuelven el mismo `405 { ok:false, error:"method_not_allowed" }`.
- Se preservo el comportamiento historico del gate de Supabase: `summary`, `extension/usage` y `parking/summary` siguen devolviendo `supabase_not_configured` antes de validar metodo si Supabase falta.

Riesgos pendientes:

- `api/admin.js` sigue conteniendo los handlers y la mayoria de recursos mutables.
- La autorizacion sigue centralizada en `api/admin.js`; el router aun no declara auth por recurso.
- No hay contrato comun para body parsing o write resources.
- Los recursos de integraciones externas siguen en legacy por prudencia.

Como migrar el siguiente grupo:

1. Migrar un lote pequeno y homogeneo, por ejemplo `analytics/summary`, `analytics/pages`, `analytics/learning`.
2. Mantener el mismo patron: auth en `api/admin.js`, router declarativo, fallback legacy.
3. Anadir tests de payload, metodo, fallback y errores saneados antes de mover codigo.
4. Solo despues mover handlers a ficheros `api/_admin/*.js` o `lib/modules/backoffice/*`.

Criterios para migrar recursos write:

- Deben tener tests de metodo, body invalido, auth, error saneado y no exposicion de secretos.
- Deben ser idempotentes o documentar claramente sus efectos.
- No deben llamar servicios externos reales durante tests.
- Deben conservar exactamente status codes y payloads.
- Deben mantener kill switches existentes.

Endpoints todavia legacy principales:

- `analytics/summary`
- `analytics/pages`
- `analytics/learning`
- `premium/subscriptions`
- `seo/landings`
- `seo/generate-landings`
- `seo-autogenerate/run`
- `linkedin/*`
- `meta/*`
- `kpis/settings`
- `operations/releases`
- `operations/chrome`
- `social-video/*`
- `viraliza/*`

Verificacion de esta evolucion:

- `node --check api/admin.js`: OK.
- `node --check api/_admin/router.js`: OK.
- `node --test tests/admin-router.test.js tests/extension-usage.test.js tests/status.test.js tests/security-sanitization.test.js`: 34 pass, 0 fail.

## Evolucion posterior: router declarativo analytics read-only

Fecha: 2026-05-24
Rama: `feature/admin-router-analytics-readonly`

Se amplio el router declarativo interno de `api/admin.js` para cubrir el lote read-only de analytics owned. La fachada publica sigue siendo `api/admin.js`: auth, CORS, catch general, saneado de errores y fallback legacy no se movieron.

Recursos migrados:

- `analytics/summary`: `GET`, pre-gate global de Supabase, conserva ventanas por `days`, `from`, `to`, resumen, top pages, agrupaciones y recomendaciones.
- `analytics/pages`: `GET`, pre-gate global de Supabase, conserva `page_limit`, ventanas, warning y lista de paginas.
- `analytics/learning`: `GET`, pre-gate global de Supabase, conserva summary, pages, recomendaciones y bloques de aprendizaje.

Que no se extrajo:

- Los handlers `handleOwnedAnalyticsSummary`, `handleOwnedAnalyticsPages` y `handleOwnedAnalyticsLearning` siguen en `api/admin.js`. Extraerlos ahora obligaba a mover tambien helpers de ventana temporal, carga de eventos, agrupaciones y dependencias de learning, lo que hacia crecer el riesgo de la fase.
- No se creo `api/_admin/handlers/analytics.js` todavia por prudencia. El paso realizado reduce dispatch manual sin cambiar fronteras internas sensibles.
- No se tocaron consultas, limites, interpretacion de metricas ni labels del backoffice.

Por que analytics era una zona adecuada:

- Son recursos read-only y no disparan integraciones externas.
- Ya tenian comportamiento controlado sin Supabase configurado.
- Tenian tests previos de ventanas, rangos, defaults y aprendizaje.
- Aportan valor operativo al backoffice y reducen otra zona relevante del monolito sin entrar aun en escritura.

Riesgos mitigados:

- `analytics/summary`, `analytics/pages` y `analytics/learning` ya no dependen de ramas manuales `if (resource === ...)` en el flujo principal.
- Los metodos no soportados de los tres recursos quedan resueltos por el router antes del gate global de Supabase, conservando el `405` anterior.
- Recursos analytics no registrados siguen cayendo al flujo legacy.
- Los errores de Supabase siguen saneados antes de llegar al payload.

Riesgos pendientes:

- `api/admin.js` todavia contiene los handlers analytics y muchos helpers compartidos.
- El router no declara permisos por recurso; la autorizacion sigue siendo centralizada.
- Recursos write y side-effect siguen en legacy.
- Aun no existe un contrato comun para handlers extraidos por modulo.

Como continuar con recursos write:

1. Completar antes otro lote read-only, preferentemente SEO read-only o settings read-only.
2. Crear fixtures de payload antes de mover cualquier handler con escritura.
3. Exigir tests de metodo, body invalido, auth, error saneado y no exposicion de secretos.
4. Mantener kill switches y no ejecutar integraciones externas reales.
5. Mover write handlers solo cuando el coste de fallback legacy sea bajo y reversible.

Endpoints todavia legacy principales:

- `premium/subscriptions`
- `seo/landings`
- `seo/generate-landings`
- `seo-autogenerate/run`
- `linkedin/*`
- `meta/*`
- `kpis/settings`
- `operations/releases`
- `operations/chrome`
- `social-video/*`
- `viraliza/*`

Verificacion de esta evolucion:

- `node --check api/admin.js`: OK con Node bundled.
- `node --check api/_admin/router.js`: OK con Node bundled.
- `node --check assets/admin.js`: OK con Node bundled.
- `node --check api/sitemap.js`: OK con Node bundled.
- `node --check api/seo-page.js`: OK con Node bundled.
- `node --check scripts/serve-static.js`: OK con Node bundled.
- `api/_admin/handlers/analytics.js`: no existe; no se creo en esta fase.
- `node --test tests/admin-router.test.js`: 16 pass, 0 fail.
- `node --test tests/owned-analytics.test.js`: 16 pass, 0 fail.
- `node --test tests/*.test.js`: 255 pass, 0 fail.
- `git diff --check`: OK; solo avisos de CRLF propios de Git en Windows.

## Evolucion posterior: router declarativo SEO read-only

Fecha: 2026-05-25
Rama: `feature/admin-router-seo-readonly`

Se amplio el router declarativo interno para cubrir solo la lectura segura de SEO dentro del admin. La migracion se limito a `GET seo/landings`; no se tocaron generacion, publicacion, autogeneracion, sitemap operativo, cron ni acciones de escritura.

Recursos SEO migrados:

- `seo/landings` `GET`: listado paginado de landings con `limit`, `page`, `status`, resumen SEO y oportunidades. Sigue en el grupo post-Supabase y conserva payload, codigos y query params.

Recursos SEO no migrados:

- `seo/landings` `POST`: acciones `publish`, `noindex`, `archive` y `regenerate`; modifica estado o puede lanzar generacion.
- `seo/generate-landings`: ejecuta generacion manual, aunque pueda hacerlo en dry-run.
- `seo-autogenerate/run`: estado y ejecucion comparten recurso; puede lanzar autogeneracion cuando recibe `run=1` o POST, y tambien acepta token cron.

Por que no se migraron:

- SEO mezcla lectura, escritura, publicacion y generacion bajo pocos recursos.
- `seo/landings` es un recurso mixto: `GET` es lectura, `POST` es escritura. Para conservar comportamiento, el router permite fallback legacy cuando el metodo no coincide en recursos mixtos.
- `seo-autogenerate/run` tiene una lectura de status, pero comparte la misma entrada con ejecucion cron/admin. Se deja legacy para no acercar el router read-only a procesos automaticos.

Riesgos reducidos:

- El listado SEO read-only deja de depender de una rama manual en el dispatch principal.
- `POST seo/landings` sigue cayendo al flujo legacy y conserva sus respuestas.
- `PUT` u otros metodos no soportados siguen devolviendo `405`.
- Errores de Supabase en `GET seo/landings` siguen saneados por el catch general.
- Arrays vacios y datos incompletos siguen devolviendo payload estable.

Riesgos pendientes:

- Los handlers SEO siguen dentro de `api/admin.js`.
- `seo/landings` continua mezclando lectura y escritura en el mismo handler.
- La autogeneracion SEO sigue teniendo doble modo status/ejecucion en el mismo recurso.
- Aun no hay un contrato separado para operaciones SEO write con fixtures de payload.

Que queda dentro de `api/admin.js`:

- `handleSeoLandings` completo.
- `handleSeoLandingAction`.
- `handleSeoGenerate`.
- `handleSeoAutogeneration`.
- Helpers locales para landings, calidad, daily policy y acciones SEO.

Criterios para migrar SEO write en el futuro:

1. Separar primero handlers `GET` y `POST` en funciones explicitas, sin cambiar URL.
2. Cubrir cada accion con tests de auth, metodo, body invalido, payload de exito y error saneado.
3. Mantener dry-run por defecto en generacion durante tests.
4. No ejecutar publicacion real ni integraciones externas.
5. Mantener kill switches y limites diarios/semanales.
6. No tocar sitemap ni robots salvo tests de lectura.

Advertencias especificas:

- No mover `seo-autogenerate/run` al router read-only mientras comparta status y ejecucion.
- No migrar `regenerate` hasta tener fixtures y limites claros.
- No mezclar esta linea de trabajo con cambios de contenido publico, canonical, robots o sitemap.

Verificacion de esta evolucion:

- `node --check api/admin.js`: OK con Node bundled.
- `node --check api/_admin/router.js`: OK con Node bundled.
- `node --check assets/admin.js`: OK con Node bundled.
- `node --check api/sitemap.js`: OK con Node bundled.
- `node --check api/seo-page.js`: OK con Node bundled.
- `node --check scripts/serve-static.js`: OK con Node bundled.
- `api/_admin/handlers/seo.js`: no existe; no se creo en esta fase.
- `node --test tests/admin-router.test.js`: 22 pass, 0 fail.
- `node --test tests/seo.test.js`: 17 pass, 0 fail.
- `node --test tests/*.test.js`: 261 pass, 0 fail.
- `git diff --check`: OK; solo avisos de CRLF propios de Git en Windows.

## Evolucion posterior: router declarativo settings/KPIs read-only

Fecha: 2026-05-25
Rama: `feature/admin-router-settings-kpis-readonly`

Se amplio el router declarativo para cubrir la lectura segura de configuracion KPI. La migracion se limito a `GET kpis/settings`; no se tocaron guardado de settings, activacion de modulos, recalculos persistentes ni integraciones externas.

Recursos migrados:

- `kpis/settings` `GET`: devuelve schema, defaults, settings normalizados, `updated_at`, `table_missing` y `error`. Sigue en el grupo post-Supabase y conserva payload/codigos.

Recursos no migrados:

- `kpis/settings` `POST`: guarda configuracion en `kpi_settings` y actualiza `updated_at`.
- `linkedin/settings`: mezcla lectura y escritura dentro de una integracion externa.
- `meta/settings`: mezcla lectura y escritura dentro de una integracion externa.
- Settings de Runway/social-video: forman parte de generacion de video y presupuesto/coste.

Metodos mantenidos en legacy:

- `POST kpis/settings`: sigue cayendo al flujo legacy.
- `PUT/PATCH/DELETE kpis/settings`: siguen devolviendo `405` desde el handler legacy.

Riesgos reducidos:

- Otra rama manual de dispatch read-only sale del flujo principal de `api/admin.js`.
- El router ya cubre un recurso mixto adicional sin capturar escritura.
- Errores de Supabase en lectura KPI siguen saneados antes de llegar al payload.
- Ausencia de fila o tabla mantiene defaults y payload estable.

Riesgos pendientes:

- `handleKpiSettings`, `readKpiSettings` y `saveKpiSettings` siguen dentro de `api/admin.js`.
- `kpis/settings` mantiene GET y POST en el mismo handler.
- Los settings de LinkedIn y Meta siguen legacy por prudencia.
- Aun no hay contrato comun para handlers de configuracion.

Que queda dentro de `api/admin.js`:

- Lectura y escritura de `kpi_settings`.
- Lectura/escritura de settings de LinkedIn y Meta.
- Settings de operaciones y video ligados a acciones con efectos externos.

Cuando migrar escritura de settings:

1. Separar helpers `read` y `save` en modulo dedicado con tests.
2. Cubrir `POST` con body invalido, coercion, payload de error y payload de exito.
3. Probar que no se exponen secretos en errores.
4. Confirmar que `updated_at` y `updated_by` se conservan.
5. Mantener fallback legacy hasta cubrir todos los metodos.

Advertencias:

- No mover settings de Meta/LinkedIn mientras convivan con autopublishing y OAuth.
- No mover settings de video si puede alterar costes o proveedor externo.
- No cambiar defaults KPI sin una tarea funcional explicita.

Verificacion de esta evolucion:

- `node --check api/admin.js`: OK con Node bundled.
- `node --check api/_admin/router.js`: OK con Node bundled.
- `node --check assets/admin.js`: OK con Node bundled.
- `node --check api/sitemap.js`: OK con Node bundled.
- `node --check api/seo-page.js`: OK con Node bundled.
- `node --check scripts/serve-static.js`: OK con Node bundled.
- `node --test tests/admin-router.test.js`: 25 pass, 0 fail.
- `node --test tests/*.test.js`: 264 pass, 0 fail.
- `git diff --check`: OK; solo avisos de CRLF propios de Git en Windows.

## Evolucion posterior: router declarativo operations read-only

Fecha: 2026-05-25
Rama: `feature/admin-router-operations-readonly`

Se amplio el router declarativo para cubrir solo lectura operativa segura. La migracion se limito a `GET operations/releases`; no se tocaron acciones de Chrome Web Store, subida/publicacion de artefactos, jobs, reparaciones ni escritura operativa.

Recursos migrados:

- `operations/releases` `GET`: lista artefactos operativos con `target` y `limit`, devuelve conectores y estado de tabla. Sigue en el grupo post-Supabase y conserva payload/codigos.

Recursos no migrados:

- `operations/releases` `POST`: crea artefactos en `release_artifacts`.
- `operations/chrome`: solo acepta acciones POST y puede consultar/subir/publicar contra Chrome Web Store y actualizar artefactos.

Metodos mantenidos en legacy:

- `POST operations/releases`: sigue cayendo al flujo legacy.
- `PUT/PATCH/DELETE operations/releases`: siguen devolviendo `405` desde el handler legacy.
- `GET/POST operations/chrome`: queda completamente en legacy.

Riesgos reducidos:

- Otra rama read-only sale del dispatch manual de `api/admin.js`.
- El recurso mixto `operations/releases` conserva escritura en legacy mediante `fallbackOnMethodMismatch`.
- Errores de Supabase en lectura operativa siguen saneados.
- Respuestas con tabla vacia mantienen payload estable.

Riesgos pendientes:

- `handleReleaseArtifacts` sigue mezclando lectura y creacion de artefactos.
- `handleChromeOperation` sigue en `api/admin.js` y concentra acciones externas delicadas.
- No hay todavia contrato separado para operaciones write ni para conectores externos.

Advertencias sobre endpoints operativos:

- No migrar `operations/chrome` al router read-only: incluso su accion `status` puede llamar API externa y actualizar notas del artefacto.
- No migrar operaciones que creen artefactos, cambien estado, suban paquetes, publiquen o escriban notas.
- No ejecutar endpoints operativos reales durante tests.

Que queda dentro de `api/admin.js`:

- `handleReleaseArtifacts` completo.
- `handleChromeOperation`.
- Helpers de Chrome status, upload, publish y patch de artefactos.

Verificacion de esta evolucion:

- `node --check api/admin.js`: OK con Node bundled.
- `node --check api/_admin/router.js`: OK con Node bundled.
- `node --check assets/admin.js`: OK con Node bundled.
- `node --check api/sitemap.js`: OK con Node bundled.
- `node --check api/seo-page.js`: OK con Node bundled.
- `node --check scripts/serve-static.js`: OK con Node bundled.
- `node --test tests/admin-router.test.js`: 30 pass, 0 fail.
- `node --test tests/*.test.js`: 269 pass, 0 fail.
- `git diff --check`: OK; solo avisos de CRLF propios de Git en Windows.

## Evolucion posterior: router declarativo premium/subscriptions read-only

Fecha: 2026-05-25
Rama: `feature/admin-router-premium-readonly`

Se amplio el router declarativo para cubrir solo la lectura local segura de suscripciones Premium. La migracion se limito a `GET premium/subscriptions`; no se tocaron checkout, portal de cliente, Lemon Squeezy, webhooks, emails ni cambios de estado premium.

Recursos migrados:

- `premium/subscriptions` `GET`: lista filas locales de `premium_subscriptions` con filtros `limit`, `status`, `q`, `provider` y `event_name`. Sigue en el grupo post-Supabase y conserva payload/codigos.

Recursos no migrados:

- `api/lemonsqueezy-checkout`: checkout, portal magic link y portal de cliente.
- `api/lemonsqueezy-webhook`: escritura de suscripciones y revenue events.
- `api/check-premium`: comprobacion publica de premium y envio de reportes.
- Cualquier flujo de billing externo, portal, email o sincronizacion remota.

Metodos mantenidos en legacy o comportamiento conservado:

- `POST/PUT/PATCH/DELETE premium/subscriptions`: no existen como escritura admin; siguen devolviendo `405`.
- Recursos de checkout, portal, webhook y billing externo permanecen fuera del router admin.

Dependencias externas detectadas:

- Lemon Squeezy vive en endpoints separados y no fue tocado.
- `GET premium/subscriptions` no llama proveedor externo: solo lee Supabase.
- `summary` sigue exponiendo flags de configuracion Lemon, sin llamar APIs externas.

Riesgos reducidos:

- El listado Premium read-only sale del dispatch manual de `api/admin.js`.
- El router no abre rutas write premium ni billing externo.
- Errores de Supabase en lectura premium siguen saneados por el catch general.
- Datos vacios devuelven payload estable.

Riesgos pendientes:

- `handlePremiumSubscriptions` sigue dentro de `api/admin.js`.
- Los endpoints Lemon/portal/webhook siguen separados y deben mantenerse con revisiones de seguridad propias.
- Billing externo no debe entrar al router admin hasta tener contratos y fixtures especificos.

Advertencias:

- No migrar checkout, portal ni webhooks a este router.
- No mezclar premium read-only con cambios de planes, estados o sincronizacion remota.
- No devolver secretos ni mensajes crudos de proveedor en ningun flujo billing.

Que queda dentro de `api/admin.js`:

- `handlePremiumSubscriptions`.
- Lecturas de revenue y premium usadas por `summary` y `alerts`.

Verificacion de esta evolucion:

- `node --check api/admin.js`: OK con Node bundled.
- `node --check api/_admin/router.js`: OK con Node bundled.
- `node --check assets/admin.js`: OK con Node bundled.
- `node --check api/sitemap.js`: OK con Node bundled.
- `node --check api/seo-page.js`: OK con Node bundled.
- `node --check scripts/serve-static.js`: OK con Node bundled.
- `node --test tests/admin-router.test.js`: 33 pass, 0 fail.
- `node --test tests/*.test.js`: 272 pass, 0 fail.
- `git diff --check`: OK; solo avisos de CRLF propios de Git en Windows.

## Cierre de fase read-only y frontera hacia write interno

Fecha: 2026-05-25
Rama: `feature/admin-legacy-inventory-write-plan`

Se reviso el legacy restante de `api/admin.js` despues de migrar los lotes read-only de bajo riesgo. En esta fase no se movio ningun handler adicional: el analisis confirma que no queda un recurso read-only puro, local y fuera de zonas excluidas que convenga migrar de forma generica.

Read-only ya migrado:

- `alerts` `GET`
- `summary` `GET`
- `extension/usage` `GET`
- `parking/summary` `GET`
- `analytics/summary` `GET`
- `analytics/pages` `GET`
- `analytics/learning` `GET`
- `seo/landings` `GET`
- `kpis/settings` `GET`
- `operations/releases` `GET`
- `premium/subscriptions` `GET`

Read-only que podria parecer migrable pero queda fuera:

- `linkedin` dashboard y settings GET: integracion social sensible.
- `meta` dashboard/settings GET: integracion social con tokens, paginas y kill switch.
- `social-video/runway-config` GET: configuracion de proveedor de video y modulo excluido.
- `social-video/projects` GET: recurso mixto con escritura de estado.
- `viraliza/performance`, `viraliza/learning` y `viraliza/daily-plan` GET: modulo social/contenido excluido y calculos acoplados.
- `seo-autogenerate/run` status: comparte recurso con ejecucion cron/generacion.

No se debe migrar aun:

- generacion SEO;
- publicacion/noindex/archive de landings;
- cron SEO;
- Chrome Web Store;
- billing externo, checkout, portal y webhooks;
- Meta, LinkedIn, social-video y viraliza;
- jobs, reparaciones, importaciones y acciones bulk.

Principales zonas de riesgo pendientes:

- SEO write y generacion: impacto publico, sitemap/indexabilidad y contenido.
- Operaciones Chrome: proveedor externo, publicacion y parcheo de artefactos.
- Social/Meta/LinkedIn: OAuth, tokens, publicacion y kill switches.
- Social-video/Runway: llamadas externas, costes y estado de render.
- Viraliza: contenido/growth y escrituras de modulo aun no aislado.

Frontera clara:

- Router declarativo actual: lectura local estable, sin efectos persistentes ni proveedores.
- Legacy: escritura, recursos mixtos, integraciones, cron-like, generacion, publicacion y billing.

Proximos pasos:

- Usar `ADMIN_LEGACY_ROUTE_INVENTORY.md` como mapa de lo que queda en `api/admin.js`.
- Usar `PLAN_PRIMER_LOTE_WRITE_INTERNO.md` para migrar solo el primer write interno de bajo riesgo.
- Primer candidato recomendado: `kpis/settings` `POST`.
- Segundo candidato posible, en fase separada o como opcional muy controlado: `operations/releases` `POST`.

Verificacion de esta evolucion:

- `node --check api/admin.js`: OK con Node bundled.
- `node --check api/_admin/router.js`: OK con Node bundled.
- `node --check assets/admin.js`: OK con Node bundled.
- `node --check api/sitemap.js`: OK con Node bundled.
- `node --check api/seo-page.js`: OK con Node bundled.
- `node --check scripts/serve-static.js`: OK con Node bundled.
- `node --test tests/admin-router.test.js`: 33 pass, 0 fail.
- `node --test tests/*.test.js`: 272 pass, 0 fail.
- `git diff --check`: OK; solo avisos de CRLF propios de Git en Windows.

## Evolucion posterior: primer write interno kpis/settings

Fecha: 2026-05-25
Rama: `feature/admin-router-kpis-settings-write`

Se migro `POST kpis/settings` al router declarativo como primer write interno de bajo riesgo. El cambio conserva `handleKpiSettings(req)` en `api/admin.js` y mueve solo el dispatch, manteniendo auth, Supabase service role, payloads, codigos y saneado de errores en el mismo flujo.

Por que era buen primer candidato:

- escritura local en `kpi_settings`;
- sin APIs externas;
- sin publicacion ni generacion;
- sin billing;
- sin integraciones sociales;
- sin Chrome Web Store;
- body pequeno y validacion existente mediante `coerceKpiSettings`;
- rollback sencillo revirtiendo el commit o restaurando la fila anterior.

Riesgos mitigados:

- El router ya no es solo read-only y queda probado con un write interno acotado.
- `POST kpis/settings` no abre rutas write genericas ni wildcards.
- JSON mal formado y errores Supabase siguen saneados.
- Campos desconocidos mantienen la semantica de coercion/ignorados.
- Metodos no soportados conservan `405`.

Riesgos pendientes:

- `saveKpiSettings` sigue dentro de `api/admin.js`.
- `operations/releases POST` sigue en legacy.
- SEO write, Chrome, billing, Meta, LinkedIn, social-video y Viraliza siguen fuera del router write.

Frontera con writes peligrosos:

- No migrar generacion SEO, publicacion/noindex/archive, cron, Chrome, billing ni integraciones sociales en el mismo lote.
- El siguiente write debe ser unico, local, testeable y sin proveedores.

Verificacion de esta evolucion:

- `node --check api/admin.js`: OK con Node bundled.
- `node --check api/_admin/router.js`: OK con Node bundled.
- `node --check assets/admin.js`: OK con Node bundled.
- `node --check api/sitemap.js`: OK con Node bundled.
- `node --check api/seo-page.js`: OK con Node bundled.
- `node --check scripts/serve-static.js`: OK con Node bundled.
- `node --test tests/admin-router.test.js`: 37 pass, 0 fail.
- `node --test tests/*.test.js`: 276 pass, 0 fail.
- `git diff --check`: OK; solo avisos de CRLF propios de Git en Windows.

## Evolucion posterior: segundo write interno operations/releases

Fecha: 2026-05-25
Rama: `feature/admin-router-operations-releases-write`

Se migro `POST operations/releases` al router declarativo como segundo write interno de bajo riesgo. El cambio conserva `handleReleaseArtifacts(req, url)` en `api/admin.js` y mueve solo el dispatch, manteniendo auth, service role, payloads, codigos y saneado de errores en el mismo flujo.

Por que era candidato aceptable:

- escritura local en `release_artifacts`;
- validacion/normalizacion existente con `normalizeReleaseArtifactInput`;
- no llama Chrome Web Store;
- no sube paquetes;
- no publica releases externamente;
- no toca `operations/chrome`;
- no genera binarios ni modifica ZIPs;
- rollback sencillo revirtiendo el commit o borrando/restaurando la fila creada.

Por que `operations/chrome` sigue fuera:

- puede llamar Chrome Web Store;
- puede consultar status remoto;
- puede subir paquetes;
- puede enviar a revision/publicacion;
- puede parchear artefactos como resultado de una accion externa;
- requiere credenciales, fixtures y guardas especificas de proveedor.

Riesgos mitigados:

- El segundo write interno queda probado sin abrir wildcards.
- `operations/releases POST` no invoca Chrome ni Google APIs.
- Body vacio, campos obligatorios ausentes, JSON mal formado y errores Supabase siguen saneados.
- `PUT operations/releases` conserva `405`.
- `operations/chrome` conserva legacy y comportamiento propio.

Riesgos pendientes:

- `handleReleaseArtifacts` sigue dentro de `api/admin.js`.
- `operations/chrome` sigue siendo una zona critica legacy.
- SEO write, billing, Meta, LinkedIn, social-video y Viraliza siguen fuera del router write.

Frontera con writes peligrosos:

- No migrar Chrome, SEO publish/noindex/archive/regenerate, billing, OAuth, Runway ni social en el mismo patron sin fase dedicada.
- Despues de dos writes internos, conviene pausar y evaluar extraccion de handlers/contratos antes de seguir.

Verificacion de esta evolucion:

- `node --check api/admin.js`: OK con Node bundled.
- `node --check api/_admin/router.js`: OK con Node bundled.
- `node --check assets/admin.js`: OK con Node bundled.
- `node --check api/sitemap.js`: OK con Node bundled.
- `node --check api/seo-page.js`: OK con Node bundled.
- `node --check scripts/serve-static.js`: OK con Node bundled.
- `node --test tests/admin-router.test.js`: 41 pass, 0 fail.
- `node --test tests/*.test.js`: 280 pass, 0 fail.
- `git diff --check`: OK; solo avisos de CRLF propios de Git en Windows.
