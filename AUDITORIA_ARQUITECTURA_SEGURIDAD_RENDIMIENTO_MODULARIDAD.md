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
