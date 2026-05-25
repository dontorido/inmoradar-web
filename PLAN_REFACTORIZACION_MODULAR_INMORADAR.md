# Plan de refactorizacion modular InmoRadar

Fecha: 2026-05-24
Rama: `feature/system-architecture-hardening-audit`
Principio rector: extraer sin cambiar contratos publicos.

## 1. Arquitectura objetivo

La arquitectura objetivo separa transporte HTTP, seguridad, persistencia, servicios de dominio e integraciones externas.

```
api/
  admin.js                  # compatibilidad publica; delega a router interno
  public/
  webhooks/
  cron/

lib/
  config/
    site.js
    env.js
    projectContext.js
  db/
    supabaseClient.js
    repositories/
  http/
    json.js
    body.js
    router.js
  security/
    adminAuth.js
    errors.js
  modules/
    seo/
    sitemap/
    analytics/
    extensionUsage/
    social/
    linkedin/
    backoffice/
    operations/
    projects/
    jobs/
```

## 2. Fases

### Fase 1 - Hardening compartido

Objetivo: consolidar piezas pequenas sin mover funcionalidad.

- `sanitizeErrorMessage` comun.
- `safeJsonBody(req, { maxBytes })`.
- `requireMethod(req, allowed)`.
- `adminAuth` y `adminOrCronAuth`.
- Tests de errores saneados, metodos y auth.

Riesgo: bajo.
Duracion estimada: 0.5-1 dia.
Criterio de aceptacion: todos los endpoints mantienen payloads actuales; tests cubren no exposicion de secretos.

### Fase 2 - Router admin declarativo

Objetivo: reducir complejidad de `api/admin.js` sin cambiar URLs.

Contrato sugerido:

```js
{
  resource: "extension/usage",
  methods: ["GET"],
  auth: "admin",
  handler: handleExtensionUsageSummary
}
```

Riesgo: medio si se migran recursos grandes; bajo si se empieza por recursos read-only.
Duracion estimada: 1-2 dias por lote.
Criterio de aceptacion: tests por recurso para auth, metodo, respuesta ok y error saneado.

### Fase 3 - Repositories Supabase

Objetivo: sacar queries repetidas de handlers.

Repositorios iniciales:

- `seoRepository`.
- `analyticsRepository`.
- `extensionUsageRepository`.
- `socialRepository`.
- `operationsRepository`.
- `premiumRepository`.

Riesgo: medio.
Duracion estimada: 2-4 dias por dominio.
Criterio de aceptacion: tests unitarios con `global.fetch` mock y sin cambiar SQL real.

### Fase 4 - Contratos SEO compartidos

Objetivo: evitar criterios divergentes entre sitemap, news, social y render publico.

Funciones:

- `isPublishedIndexableLanding(landing)`.
- `landingCanonical(landing, context)`.
- `landingNewsItem(landing, context)`.
- `landingRobots(landing)`.

Riesgo: medio por impacto SEO.
Duracion estimada: 1-2 dias.
Criterio de aceptacion: tests de sitemap/news/render/social sobre el mismo fixture.

### Fase 5 - Backoffice por modulos

Objetivo: hacer `assets/admin.js` reutilizable por paneles.

Separacion:

- API client comun.
- Store/state por modulo.
- Renderers por modulo.
- Acciones por modulo.
- Widgets compartidos: table, stat, chart, pagination, toast.

Riesgo: medio-alto si se hace masivo.
Duracion estimada: 1-2 semanas incremental.
Criterio de aceptacion: cambios por modulo, screenshots o tests DOM cuando aplique.

### Fase 6 - Project context single-project

Objetivo: preparar multi-proyecto sin migrar datos.

Crear:

- `lib/config/projectContext.js`.
- Defaults InmoRadar.
- `siteUrl(projectContext)`.
- `brandConfig(projectContext)`.
- `moduleFlags(projectContext)`.

Riesgo: bajo si solo reemplaza lecturas hardcodeadas internas.
Duracion estimada: 1-2 dias.
Criterio de aceptacion: todos los tests actuales pasan; no cambia HTML publico salvo URLs equivalentes.

### Fase 7 - Multi-proyecto documental y fixtures

Objetivo: simular segundo proyecto sin tocar Supabase real.

- Fixtures `project: inmoradar` y `project: demo`.
- Tests con dos contextos.
- SQL propuesta en `database/proposals/`.

Riesgo: bajo si no hay migraciones.
Duracion estimada: 2-3 dias.
Criterio de aceptacion: ningun endpoint real exige `project_id` todavia.

### Fase 8 - Multi-tenant real opcional

Objetivo: aplicar `project_id` en tablas.

Tablas candidatas:

- `seo_landings`.
- `seo_landing_opportunities`.
- `owned_analytics_events`.
- `extension_usage_events`.
- `marketing_meta_connections`.
- `marketing_meta_settings`.
- `marketing_meta_posts`.
- `marketing_linkedin_*`.
- `social_video_*`.
- `kpi_settings`.

Riesgo: alto.
Duracion estimada: 1-3 semanas con backup y staging.
Criterio de aceptacion: migracion reversible, backfill probado, RLS revisada, queries filtradas por proyecto.

## 3. Orden recomendado

1. Hardening compartido.
2. Router admin declarativo para recursos read-only.
3. Repositorios de analytics y extension usage.
4. Contratos SEO compartidos.
5. Repositorios SEO.
6. Backoffice por modulos.
7. Project context single-project.
8. Multi-proyecto con fixtures.
9. Migracion real solo tras decision explicita.

## 4. Riesgo por fase

- Fase 1: bajo.
- Fase 2: bajo/medio.
- Fase 3: medio.
- Fase 4: medio.
- Fase 5: medio/alto.
- Fase 6: bajo.
- Fase 7: bajo.
- Fase 8: alto.

## 5. Tests necesarios

- `node --check` para archivos tocados.
- `node --test tests/*.test.js`.
- Tests de admin router:
  - sin token => 401.
  - metodo invalido => 405.
  - error interno => mensaje saneado.
  - recurso inexistente => 404.
- Tests de repositories:
  - path Supabase correcto.
  - limites por defecto.
  - errores saneados.
- Tests SEO:
  - sitemap/news/render/social usan el mismo filtro.
  - canonical estable.
  - robots coherente.
- Tests multi-proyecto:
  - contexto default InmoRadar.
  - segundo contexto no cambia dominios del primero.
  - fixtures aislados.

## 6. Criterios de aceptacion globales

- Main intacto hasta PR/merge manual.
- Cero deploys desde tareas de refactor.
- Cero publicaciones externas.
- Cero secrets en respuestas o logs controlados.
- Tests existentes no bajan de cobertura funcional actual.
- Cada fase se puede revertir sin perder datos.
- Las URLs publicas existentes siguen respondiendo igual.
- El backoffice conserva flujos actuales.

## 7. Modulos reutilizables en otro proyecto

Reutilizables con poca adaptacion:

- `lib/http/*` futuro.
- `lib/security/*` futuro.
- `lib/db/*` futuro.
- `lib/analytics/*`.
- `lib/extension-usage/*`.
- `lib/operations/*`.
- `lib/social-video/*` si se parametriza branding.
- `lib/meta/*` si se parametriza app/page/project.
- `lib/linkedin/*` si se parametriza organization.

Reutilizables con adaptacion media:

- SEO generator y renderer, si templates y brand pasan a config.
- Backoffice shell, si widgets se separan de copies InmoRadar.
- KPI settings, si schema admite modulos activos.

Acoplados a InmoRadar hoy:

- Dominios `inmoradar.app`.
- Marca y assets.
- Textos de producto.
- Templates inmobiliarios.
- Datos y fuentes de mercado.
- Extension y Chrome Web Store.

## 8. Propuesta SQL documental futura

No ejecutar todavia.

```sql
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  canonical_domain text not null,
  brand_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_settings (
  project_id uuid primary key references public.projects(id) on delete cascade,
  settings_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.project_modules (
  project_id uuid references public.projects(id) on delete cascade,
  module_key text not null,
  enabled boolean not null default true,
  settings_json jsonb not null default '{}'::jsonb,
  primary key (project_id, module_key)
);
```

Backfill futuro conceptual:

```sql
-- No ejecutar sin staging:
-- alter table public.seo_landings add column project_id uuid references public.projects(id);
-- update public.seo_landings set project_id = '<inmoradar-project-id>' where project_id is null;
-- alter table public.seo_landings alter column project_id set not null;
```

## 9. Siguiente fase recomendada

Siguiente tarea tecnica recomendada:

```text
Extrae un router declarativo interno para api/admin.js manteniendo exactamente las mismas rutas publicas. Empieza por recursos read-only y de bajo riesgo: alerts, summary, extension/usage, parking/summary. Anade tests para auth, metodo no permitido, recurso no encontrado y errores saneados. No muevas Meta, LinkedIn, SEO generation ni Social Video en esta fase.
```

## 10. Fase realizada - Router admin read-only

Estado: realizada en `feature/admin-router-readonly-refactor`.

Se creo `api/_admin/router.js` como router declarativo minimo. El punto de entrada sigue siendo `api/admin.js`, que conserva auth, gate de Supabase, catch general y fallback legacy.

Recursos migrados:

- `alerts`
- `summary`
- `extension/usage`
- `parking/summary`

Estrategia aplicada:

- Dos grupos de rutas para conservar orden previo:
  - pre-Supabase: `alerts`;
  - post-Supabase: `summary`, `extension/usage`, `parking/summary`.
- El router devuelve `null` si no reconoce el recurso, permitiendo que `api/admin.js` continue con el flujo legacy.
- No se movieron handlers todavia para evitar un refactor grande.

Tests anadidos:

- Resolucion por `resource/method`.
- Fallback legacy para rutas no migradas.
- `method_not_allowed` en rutas registradas.
- Payload shape de `summary`, `alerts`, `extension/usage` y `parking/summary`.
- Comportamiento del gate de Supabase.
- Recurso legacy `kpis/settings`.
- Errores Supabase saneados dentro de recursos read-only.

## 11. Siguiente fase recomendada

Siguiente lote seguro:

- `analytics/summary`
- `analytics/pages`
- `analytics/learning`

Motivo:

- Son read-only.
- Ya tienen tests.
- Viven antes del gate global de Supabase y manejan `supabase_not_configured`, igual que `alerts`.
- No disparan integraciones externas.

Prompt recomendado:

```text
Continuar en feature/admin-router-readonly-refactor. Sin deploy ni cambios visuales. Migrar al router declarativo los recursos read-only analytics/summary, analytics/pages y analytics/learning, manteniendo auth, URLs, payloads y codigos. No mover handlers a ficheros todavia salvo que sea trivial. Anadir tests de fallback, metodo, ausencia de Supabase y errores saneados. Ejecutar node --test tests/*.test.js y git diff --check.
```

## 12. Criterios para continuar con recursos write

No migrar un recurso write hasta que cumpla:

- Tiene tests de metodo no permitido.
- Tiene tests de body invalido.
- Tiene tests de auth.
- Tiene tests de error saneado.
- No llama integraciones externas reales en test.
- Mantiene kill switch si existe.
- Es idempotente o documenta claramente su efecto.
- El payload de exito y error se compara contra fixtures o asserts estables.

Recursos write que deberian esperar:

- `seo/generate-landings`
- `seo/landings` POST actions
- `meta/*`
- `linkedin/*`
- `operations/chrome`
- `social-video/render`
- `viraliza/actions`

## 13. Estrategia para no romper backoffice

- Mantener `api/admin.js` como fachada publica hasta completar varios lotes.
- Migrar por grupos de recursos coherentes, no por carpetas.
- Evitar cambios simultaneos en `assets/admin.js`.
- Evitar cambios de textos, labels o UI.
- Antes de mover un handler a otro archivo, crear tests que cubran su payload actual.
- Dejar fallback legacy hasta que el router cubra la mayoria de recursos.

## 14. Fase realizada - Router admin analytics read-only

Estado: realizada en `feature/admin-router-analytics-readonly`.

Se amplio `api/_admin/router.js` desde el registro declarativo usado por `api/admin.js`, sin mover auth ni cambiar la fachada publica. Los handlers analytics siguen dentro de `api/admin.js` para evitar una extraccion amplia de helpers compartidos.

Recursos migrados:

- `analytics/summary`
- `analytics/pages`
- `analytics/learning`

Estrategia aplicada:

- Los tres recursos viven en el grupo pre-Supabase porque su comportamiento historico ya maneja `supabase_not_configured` como warning y payload vacio.
- El router conserva `GET` como unico metodo permitido y devuelve el mismo `405 { ok:false, error:"method_not_allowed" }` para otros metodos.
- Recursos analytics no registrados continuan en fallback legacy.
- No se cambiaron queries, limites, ventanas temporales, metricas ni payloads.

Tests anadidos o reforzados:

- Payload shape de `analytics/summary` sin Supabase.
- Payload shape de `analytics/pages` sin Supabase.
- Payload shape de `analytics/learning` sin Supabase.
- Metodo no permitido antes del gate global de Supabase.
- Fallback legacy para rutas analytics no registradas.
- Error Supabase saneado en ruta analytics migrada.

Verificacion:

- `node --test tests/admin-router.test.js`: 16 pass, 0 fail.
- `node --test tests/owned-analytics.test.js`: 16 pass, 0 fail.
- `node --test tests/*.test.js`: 255 pass, 0 fail.
- `git diff --check`: OK; solo avisos CRLF de Git en Windows.

## 15. Siguiente fase recomendada

Siguiente lote seguro:

- SEO read-only dentro del admin, por ejemplo listados o vistas de estado que no generen, publiquen ni muten landings.
- Settings read-only si el recurso separa claramente lectura de escritura.

Orden recomendado:

1. Analytics read-only.
2. SEO read-only.
3. Settings read-only.
4. Operaciones read-only.
5. Write handlers de bajo riesgo.
6. Write handlers con side effects.
7. Integraciones externas.

Criterios para pasar a recursos write:

- Payload actual cubierto por tests.
- Metodo no permitido cubierto por tests.
- Body invalido cubierto por tests.
- Auth y errores saneados cubiertos por tests.
- Sin llamadas reales a servicios externos.
- Kill switch preservado cuando exista.
- Fallback legacy disponible hasta completar el lote.

Prompt recomendado:

```text
Continuar en feature/admin-router-analytics-readonly. Sin deploy, sin cambios visuales y sin tocar produccion. Migrar al router declarativo un lote pequeno de SEO read-only del admin, manteniendo auth, URLs, query params, payloads y codigos. No mover handlers a ficheros nuevos salvo que sea trivial y testeado. No tocar generacion SEO, publicaciones, sitemap ni recursos write. Anadir tests de payload, metodo no permitido, fallback legacy y errores saneados. Ejecutar node --test tests/*.test.js y git diff --check.
```

## 16. Fase realizada - Router admin SEO read-only

Estado: realizada en `feature/admin-router-seo-readonly`.

Se migro al router declarativo solo la lectura segura de SEO:

- `seo/landings` `GET`

No se movio ningun recurso que genere, publique, archive, regenere, cambie indexacion, ejecute cron o escriba en Supabase. El handler sigue dentro de `api/admin.js`; el router solo delega el metodo read-only.

Detalle tecnico:

- `seo/landings` es un recurso mixto: `GET` lista landings y `POST` ejecuta acciones.
- Se anadio soporte de fallback por metodo en `api/_admin/router.js` para que `GET` pueda ir al router y `POST` siga en legacy.
- El comportamiento de `PUT` y otros metodos no soportados sigue devolviendo `405` desde el flujo legacy.
- No se creo `api/_admin/handlers/seo.js` para evitar arrastrar helpers SEO y acciones write.

Recursos SEO dejados en legacy:

- `seo/landings` `POST`
- `seo/generate-landings`
- `seo-autogenerate/run`

Tests anadidos o reforzados:

- Router con fallback por metodo para recursos mixtos.
- Payload shape de `GET seo/landings`.
- Arrays vacios en `GET seo/landings`.
- `POST seo/landings` sigue en legacy.
- `PUT seo/landings` mantiene `405`.
- `seo/generate-landings` sigue en legacy.
- Errores Supabase saneados en `GET seo/landings`.

Verificacion:

- `node --test tests/admin-router.test.js`: 22 pass, 0 fail.
- `node --test tests/seo.test.js`: 17 pass, 0 fail.
- `node --test tests/*.test.js`: 261 pass, 0 fail.
- `git diff --check`: OK; solo avisos CRLF de Git en Windows.

## 17. Siguiente fase recomendada

Siguiente lote prudente:

- `kpis/settings` read-only, si se separa claramente `GET` de escritura.
- `operations/releases` read-only, si `GET` puede migrarse sin capturar acciones de publicacion o Chrome.

Orden posterior recomendado:

1. Settings/KPIs read-only.
2. Operations read-only.
3. SEO write de bajo riesgo, solo despues de separar handlers y fixtures.
4. Recursos write con efectos internos.
5. Integraciones externas.
6. Meta/social al final.

Criterios para la siguiente fase:

- Mantener fallback legacy para recursos mixtos.
- No migrar `POST` hasta tener tests de body invalido y payload de error.
- No mover integraciones externas.
- No tocar UI ni textos.
- Confirmar que los metodos no soportados conservan codigos actuales.

Prompt recomendado:

```text
Continuar en feature/admin-router-seo-readonly. Sin deploy, sin cambios visuales y sin tocar produccion. Migrar al router declarativo un lote pequeno de settings/KPIs read-only u operations read-only, manteniendo auth, URLs, query params, payloads y codigos. Si un recurso mezcla GET y POST, usar fallback legacy por metodo y migrar solo GET. No tocar escritura, publicacion, Chrome Web Store, Meta, LinkedIn ni generacion SEO. Anadir tests de payload, metodo no permitido, fallback legacy y errores saneados. Ejecutar node --test tests/*.test.js y git diff --check.
```

## 18. Fase realizada - Router admin settings/KPIs read-only

Estado: realizada en `feature/admin-router-settings-kpis-readonly`.

Se migro al router declarativo solo la lectura segura de KPIs/settings:

- `kpis/settings` `GET`

No se migro ninguna escritura ni ningun setting de integraciones externas. El handler sigue dentro de `api/admin.js`; el router solo delega el metodo read-only.

Detalle tecnico:

- `kpis/settings` es un recurso mixto: `GET` lee schema/defaults/settings y `POST` guarda configuracion.
- Se reutiliza `fallbackOnMethodMismatch` para que `POST` siga en legacy.
- `PUT/PATCH/DELETE` conservan `405` desde el handler legacy.
- No se creo `api/_admin/handlers/kpis.js` ni `api/_admin/handlers/settings.js` para evitar mover helpers compartidos en esta fase.

Recursos y metodos dejados en legacy:

- `kpis/settings` `POST`
- `linkedin/settings`
- `meta/settings`
- Settings ligados a social-video/Runway

Tests anadidos o reforzados:

- Payload shape de `GET kpis/settings`.
- Fallback legacy para `POST kpis/settings`.
- `PUT kpis/settings` mantiene `405`.
- Errores Supabase saneados en `GET kpis/settings`.
- Recurso legacy alternativo sigue cayendo fuera del router.

Verificacion:

- `node --test tests/admin-router.test.js`: 25 pass, 0 fail.
- `node --test tests/*.test.js`: 264 pass, 0 fail.
- `git diff --check`: OK; solo avisos CRLF de Git en Windows.

## 19. Siguiente fase recomendada

Siguiente lote prudente:

- `operations/releases` read-only, si se migra solo `GET` y se deja `POST` en legacy.
- `premium/subscriptions` read-only, si se quiere reducir dispatch manual sin tocar billing ni portal.

Orden posterior recomendado:

1. Operations read-only.
2. Premium/subscriptions read-only.
3. SEO write de muy bajo riesgo.
4. Settings write.
5. Operations write.
6. Integraciones externas al final.

Criterios para continuar:

- Mantener `fallbackOnMethodMismatch` en recursos mixtos.
- No migrar acciones que publiquen, suban artefactos o llamen Chrome Web Store.
- No tocar billing ni portales de cliente si se migra premium.
- Anadir tests de payload, metodo no permitido y error saneado.

Prompt recomendado:

```text
Continuar en feature/admin-router-settings-kpis-readonly. Sin deploy, sin cambios visuales y sin tocar produccion. Migrar al router declarativo un lote pequeno de operations read-only o premium/subscriptions read-only, manteniendo auth, URLs, query params, payloads y codigos. Si un recurso mezcla GET y POST, usar fallback legacy por metodo y migrar solo GET. No tocar escritura, publicacion, Chrome Web Store, billing externo, Meta, LinkedIn ni generacion SEO. Anadir tests de payload, metodo no permitido, fallback legacy y errores saneados. Ejecutar node --test tests/*.test.js y git diff --check.
```

## 20. Fase realizada - Router admin operations read-only

Estado: realizada en `feature/admin-router-operations-readonly`.

Se migro al router declarativo solo la lectura operativa segura:

- `operations/releases` `GET`

No se migro ningun endpoint que ejecute jobs, repare datos, suba paquetes, publique, llame Chrome Web Store o escriba en Supabase. El handler sigue dentro de `api/admin.js`; el router solo delega el metodo read-only.

Detalle tecnico:

- `operations/releases` es un recurso mixto: `GET` lista artefactos y `POST` crea artefactos.
- Se reutiliza `fallbackOnMethodMismatch` para que `POST` siga en legacy.
- `PUT/PATCH/DELETE` conservan `405` desde el handler legacy.
- `operations/chrome` queda fuera por ser accion externa y potencialmente persistente.
- No se creo `api/_admin/handlers/operations.js` para evitar mover helpers de operaciones y conectores.

Recursos y metodos dejados en legacy:

- `operations/releases` `POST`
- `operations/chrome`
- Cualquier accion futura `operations/*` que escriba, publique o llame integraciones externas.

Tests anadidos o reforzados:

- Payload shape de `GET operations/releases`.
- Arrays vacios en `GET operations/releases`.
- Fallback legacy para `POST operations/releases`.
- `PUT operations/releases` mantiene `405`.
- `operations/chrome` sigue en legacy.
- Errores Supabase saneados en `GET operations/releases`.

Verificacion:

- `node --test tests/admin-router.test.js`: 30 pass, 0 fail.
- `node --test tests/*.test.js`: 269 pass, 0 fail.
- `git diff --check`: OK; solo avisos CRLF de Git en Windows.

## 21. Siguiente fase recomendada

Siguiente lote prudente:

- `premium/subscriptions` read-only, si se mantiene como GET puro.
- Primeros write internos de muy bajo riesgo, solo si tienen fixtures y no llaman integraciones.

Orden posterior sugerido:

1. Premium/subscriptions read-only.
2. Primeros write internos de muy bajo riesgo.
3. Settings write.
4. SEO write con efectos controlados.
5. Operations write.
6. Integraciones externas al final.

Criterios para continuar:

- No tocar billing externo ni portal de cliente si se migra premium.
- Mantener fallback legacy para recursos mixtos.
- No migrar actions que creen, publiquen, reparen o llamen proveedores.
- Cubrir payload, metodos no soportados, fallback y error saneado.

Prompt recomendado:

```text
Continuar en feature/admin-router-operations-readonly. Sin deploy, sin cambios visuales y sin tocar produccion. Migrar al router declarativo premium/subscriptions read-only si es GET puro y no llama billing externo, manteniendo auth, URLs, query params, payloads y codigos. No tocar escritura, portal de cliente, Lemon Squeezy, Chrome Web Store, Meta, LinkedIn ni generacion SEO. Anadir tests de payload, metodo no permitido, fallback legacy y errores saneados. Ejecutar node --test tests/*.test.js y git diff --check.
```

## 22. Fase realizada - Router admin premium/subscriptions read-only

Estado: realizada en `feature/admin-router-premium-readonly`.

Se migro al router declarativo solo la lectura local segura de Premium:

- `premium/subscriptions` `GET`

No se migro ningun flujo de checkout, portal, webhook, email, Lemon Squeezy ni billing externo. En esa fase el handler siguio dentro de `api/admin.js`; queda extraido despues en `feature/admin-handler-premium-readonly`.

Detalle tecnico:

- `premium/subscriptions` `GET` consulta solo `premium_subscriptions` en Supabase.
- El recurso no tiene escritura admin equivalente; metodos no GET conservan `405`.
- No se creo `api/_admin/handlers/premium.js` para evitar mover helpers sensibles de billing en esta fase; se creo despues cuando se confirmo que el handler era lectura local aislada.

Recursos y metodos dejados en legacy/fuera del router:

- `api/lemonsqueezy-checkout`
- `api/lemonsqueezy-webhook`
- `api/check-premium`
- Portal de cliente
- Checkout
- Webhooks
- Emails y reportes premium
- Cualquier sincronizacion o cambio remoto de billing

Tests anadidos o reforzados:

- Payload shape de `GET premium/subscriptions`.
- Arrays vacios en `GET premium/subscriptions`.
- Metodos no GET mantienen `405`.
- Errores Supabase saneados en `GET premium/subscriptions`.
- Recurso legacy alternativo sigue fuera del router.

Verificacion:

- `node --test tests/admin-router.test.js`: 33 pass, 0 fail.
- `node --test tests/*.test.js`: 272 pass, 0 fail.
- `git diff --check`: OK; solo avisos CRLF de Git en Windows.

## 23. Siguiente fase recomendada

Siguiente lote prudente:

- Revisar si quedan recursos read-only puros sin integraciones.
- Preparar primer lote write interno de muy bajo riesgo solo con fixtures y sin proveedores externos.

Orden posterior sugerido:

1. Continuar con mas read-only si quedan.
2. Preparar primer lote write interno de muy bajo riesgo.
3. Settings write.
4. SEO write controlado.
5. Operations write.
6. Billing externo.
7. Integraciones externas al final.

Criterios para continuar:

- No migrar writes sin tests de body invalido, payload de error y no exposicion de secretos.
- No tocar proveedores externos en la primera fase write.
- Mantener fallback legacy mientras convivan GET/POST en un recurso.
- Mantener auth en `api/admin.js`.

Prompt recomendado:

```text
Continuar en feature/admin-router-premium-readonly. Sin deploy, sin cambios visuales y sin tocar produccion. Revisar si queda algun recurso admin read-only puro sin integraciones externas; si no queda ninguno seguro, documentar el limite y preparar una propuesta para el primer lote write interno de muy bajo riesgo, sin implementarlo todavia. No tocar checkout, portal, billing externo, Meta, LinkedIn, Chrome Web Store, social-video, viraliza ni generacion SEO. Ejecutar node --test tests/*.test.js y git diff --check.
```

## 24. Fase realizada - Inventario legacy y frontera write interno

Estado: realizada en `feature/admin-legacy-inventory-write-plan`.

Se cerro la fase read-only generica con dos documentos nuevos:

- `ADMIN_LEGACY_ROUTE_INVENTORY.md`
- `PLAN_PRIMER_LOTE_WRITE_INTERNO.md`

No se migro ningun endpoint adicional. La revision indica que el read-only seguro restante esta agotado fuera de zonas excluidas. Los GET restantes pertenecen a recursos mixtos, integraciones externas, modulos sociales/contenido o cron/generacion.

Resultado del inventario:

- `seo/*`: queda en legacy salvo `GET seo/landings`; write/generacion requiere fase SEO dedicada.
- `kpis/settings`: `GET` ya esta en router; `POST` es el primer write interno recomendado.
- `operations/releases`: `GET` ya esta en router; `POST` es segundo candidato posible si se mantiene separado de Chrome.
- `operations/chrome`: queda excluido por Chrome Web Store.
- `premium/subscriptions`: `GET` ya esta en router; metodos no GET conservan `405`.
- `meta/*` y `linkedin/*`: quedan para fase de integraciones sociales.
- `social-video/*` y `viraliza/*`: quedan para fases dedicadas.

Orden recomendado posterior:

1. `kpis/settings` `POST` como primer write interno.
2. `operations/releases` `POST` solo si se confirma que no invoca Chrome ni proveedores.
3. SEO write controlado, empezando por acciones reversibles y con fixtures completas.
4. Settings write mas amplios.
5. Operations write.
6. Billing externo.
7. Meta, LinkedIn, social-video, viraliza e integraciones externas al final.

Cuando empezar con write:

- Hay un candidato local, pequeno y testeable.
- El handler tiene validacion clara.
- Hay fixture/mocks para exito, body invalido y error Supabase.
- El rollback es sencillo.
- No hay proveedor externo.
- El endpoint no publica ni genera contenido.

Cuando NO empezar con write:

- Si el cambio toca OAuth, tokens, billing, Chrome, Meta, LinkedIn, Runway o webhooks.
- Si el endpoint puede publicar, generar, borrar, reparar, importar en masa o lanzar cron.
- Si no se puede conservar payload/codigo exactos.
- Si no se puede probar sin credenciales reales.

Checklist para cada endpoint write:

- Confirmar resource/action/metodo exactos.
- Confirmar tabla y columnas afectadas.
- Confirmar que no hay llamada externa.
- Confirmar validacion de body.
- Confirmar payload y codigos legacy.
- Probar body valido.
- Probar body invalido.
- Probar error Supabase saneado.
- Probar no exposicion de secretos.
- Probar fallback de metodos no soportados.
- Mantener auth en `api/admin.js`.
- Mantener diff pequeno y reversible.

Prompt recomendado:

```text
Continuar en feature/admin-legacy-inventory-write-plan. Sin deploy, sin cambios visuales y sin tocar produccion. Migrar al router declarativo solo `POST kpis/settings` como primer write interno de bajo riesgo, manteniendo auth, URLs, query params, payloads, codigos HTTP y saneado de errores exactamente iguales. No tocar SEO, Meta, LinkedIn, Chrome Web Store, billing, social-video, viraliza ni otros writes. Anadir tests de router, body valido, body invalido, error Supabase saneado, no secretos y fallback legacy. Ejecutar node --test tests/admin-router.test.js, node --test tests/*.test.js y git diff --check.
```

## 25. Fase realizada - Primer write interno kpis/settings

Estado: realizada en `feature/admin-router-kpis-settings-write`.

Se migro al router declarativo solo:

- `kpis/settings` `POST`

No se migro ningun otro write. `operations/releases POST` queda como siguiente candidato posible, pero separado para no mezclar dos escrituras en el primer paso.

Detalle tecnico:

- El router registra `kpis/settings` con metodos `GET` y `POST`.
- `fallbackOnMethodMismatch` se mantiene para que metodos no soportados conserven el flujo legacy y `405`.
- El handler sigue dentro de `api/admin.js`.
- Auth, service role, payload, codigos y catch comun no se movieron.

Criterios para el siguiente write:

- Un solo endpoint por fase si es el segundo write.
- Escritura local y pequena.
- Sin proveedor externo.
- Sin publicacion, generacion, cron ni jobs.
- Body validado y fixtures claras.
- Error Supabase saneado.
- No exposicion de secretos.

Siguiente fase recomendada:

- `operations/releases` `POST`, solo si se confirma y prueba que no toca `operations/chrome`, no llama Chrome Web Store y solo crea artefactos locales.

Prompt recomendado:

```text
Continuar en feature/admin-router-kpis-settings-write. Sin deploy, sin produccion y sin tocar integraciones externas. Migrar al router declarativo solo `POST operations/releases` si se confirma que es escritura local pura en `release_artifacts`, sin llamar `operations/chrome` ni Chrome Web Store. Mantener auth, URLs, payloads, codigos y saneado de errores. No tocar SEO, billing, Meta, LinkedIn, social-video, Viraliza ni otros writes. Anadir tests de body valido, body invalido, error Supabase saneado, ausencia de llamadas Chrome y metodos no soportados. Ejecutar node --test tests/admin-router.test.js, node --test tests/*.test.js y git diff --check.
```

## 26. Fase realizada - Segundo write interno operations/releases

Estado: realizada en `feature/admin-router-operations-releases-write`.

Se migro al router declarativo solo:

- `operations/releases` `POST`

No se migro `operations/chrome`. El endpoint de Chrome queda completo en legacy porque puede consultar/subir/publicar contra Chrome Web Store y parchear artefactos desde acciones externas.

Detalle tecnico:

- El router registra `operations/releases` con metodos `GET` y `POST`.
- `fallbackOnMethodMismatch` mantiene metodos no soportados en el flujo legacy y conserva `405`.
- El handler sigue dentro de `api/admin.js`.
- Auth, service role, payload, codigos y catch comun no se movieron.
- El write confirmado solo inserta en `release_artifacts`.

Criterios para el siguiente paso:

- No seguir migrando writes de mayor riesgo sin pausa tecnica.
- Revisar si conviene extraer handlers pequenos fuera de `api/admin.js`.
- Definir contratos para writes antes de tocar SEO, Chrome o integraciones.
- Mantener proveedores externos al final.

Siguiente fase recomendada:

- Pausa tecnica de consolidacion: revisar `api/admin.js`, decidir si extraer `kpis/settings` y `operations/releases` a handlers internos acotados, y definir metadatos/contratos de rutas antes de nuevos writes.

Prompt recomendado:

```text
Continuar en feature/admin-router-operations-releases-write. Sin deploy, sin produccion y sin tocar integraciones externas. Hacer una pausa tecnica de consolidacion del router admin: revisar si conviene extraer handlers internos ya migrados (`kpis/settings` y `operations/releases`) fuera de `api/admin.js`, proponer contratos/metadatos de rutas y documentar el siguiente orden. No migrar nuevos endpoints write, no tocar SEO, Chrome Web Store, billing, Meta, LinkedIn, social-video ni Viraliza. Si se implementa algo, que sea una extraccion pequena y testeada sin cambio de comportamiento. Ejecutar node --test tests/admin-router.test.js, node --test tests/*.test.js y git diff --check.
```

## 27. Fase realizada - Pausa tecnica de contratos y handlers

Estado: realizada en `feature/admin-router-handler-contracts`.

Se creo:

- `ADMIN_HANDLER_CONTRACTS.md`
- `api/_admin/handlers/kpis.js`

Se extrajo del monolito:

- `kpis/settings` `GET/POST`

No se migraron nuevos endpoints ni nuevos writes.

Criterios para seguir:

- Extraer solo handlers ya cubiertos por tests.
- Preferir factories con dependencias inyectadas.
- No mover auth ni service role.
- Mantener `{ status, payload }`.
- No tocar dominios sensibles.

Orden recomendado:

1. Extraer `operations/releases` en fase separada si se define una inyeccion limpia de `safeFetch`/`clampLimit`.
2. Extraer analytics read-only si se busca reducir tamano del archivo sin tocar writes.
3. Evaluar metadatos de rutas solo si se van a usar en tests o auditoria.
4. Mantener SEO write, Chrome, billing y social al final.

Prompt recomendado:

```text
Continuar en feature/admin-router-handler-contracts. Sin deploy y sin tocar produccion. Extraer `operations/releases` a un handler interno solo si se puede inyectar `safeFetch`, `supabaseFetch`, `readJsonBody` y `clampLimit` sin tocar `operations/chrome` ni Chrome Web Store. No migrar nuevos endpoints. Mantener URLs, payloads, codigos, auth y tests. Si aumenta el riesgo, documentar y no extraer. Ejecutar node --check, node --test tests/admin-router.test.js, node --test tests/*.test.js y git diff --check.
```

## 28. Fase realizada - Extraccion handler operations/releases

Estado: realizada en `feature/admin-handler-operations-releases`.

Se creo:

- `api/_admin/handlers/operations.js`

Se extrajo del monolito:

- `operations/releases` `GET/POST`

No se migraron nuevos endpoints ni nuevos writes. `operations/chrome` sigue dentro de `api/admin.js` y fuera del handler extraido.

Criterios validados:

- Inyeccion de `safeFetch`, `supabaseFetch`, `readJsonBody` y `clampLimit`.
- Helpers puros de releases importados desde `lib/operations/releases`.
- Auth, service role y catch comun permanecen en `api/admin.js`.
- No se toca Chrome Web Store.

Orden recomendado:

1. Extraer analytics read-only si se quiere seguir reduciendo el monolito sin nuevos writes.
2. Extraer premium/subscriptions read-only solo si se mantiene separado de billing externo.
3. Considerar metadatos de rutas.
4. Mantener SEO write, Chrome, billing y social para fases dedicadas.

Prompt recomendado:

```text
Continuar en feature/admin-handler-operations-releases. Sin deploy y sin tocar produccion. Evaluar la siguiente extraccion de handlers ya migrados, priorizando analytics read-only o premium/subscriptions read-only. No migrar nuevos endpoints ni writes. Mantener auth, URLs, payloads, codigos y saneado de errores. No tocar SEO write, Chrome Web Store, billing, Meta, LinkedIn, social-video ni Viraliza. Si se extrae algo, usar factories con dependencias inyectadas y tests existentes/reforzados. Ejecutar node --check, node --test tests/admin-router.test.js, node --test tests/*.test.js y git diff --check.
```

## 29. Fase realizada - Extraccion handlers analytics read-only

Estado: realizada en `feature/admin-handler-analytics-readonly`.

Se creo:

- `api/_admin/handlers/analytics.js`

Se extrajo del monolito:

- `analytics/summary` `GET`
- `analytics/pages` `GET`
- `analytics/learning` `GET`

No se migraron nuevos endpoints ni writes. No se tocaron SEO, premium/billing, operations/chrome, Chrome Web Store, Meta, LinkedIn, social-video, Runway ni Viraliza.

Criterios validados:

- Inyeccion de `hasSupabaseConfig`, `supabaseFetch` y `clampLimit`.
- Helpers puros de learning importados desde `lib/analytics/learning`.
- Auth, service role, CORS y catch comun permanecen en `api/admin.js`.
- La ruta sigue pre-Supabase y conserva fallback sin configuracion.
- Tests cubren payloads, rangos, arrays vacios, errores Supabase saneados y factory con dependencias inyectadas.

Orden recomendado:

1. Extraer `premium/subscriptions` `GET` solo si queda claramente aislado de checkout, portal, webhooks y billing externo.
2. Considerar metadatos de rutas si se van a usar en tests o auditoria.
3. Mantener `seo/landings` para una fase especifica por cercania a generacion/publicacion.
4. No migrar nuevos writes hasta consolidar handlers ya extraidos.

Prompt recomendado:

```text
Continuar en feature/admin-handler-analytics-readonly. Sin deploy y sin tocar produccion. Evaluar la extraccion de `premium/subscriptions` GET a un handler interno solo si se confirma que es lectura local aislada y no toca checkout, portal, Lemon Squeezy, webhooks ni billing externo. No migrar nuevos endpoints ni writes. Mantener auth, URLs, payloads, codigos y saneado de errores. No tocar SEO, Chrome Web Store, Meta, LinkedIn, social-video ni Viraliza. Si aumenta el riesgo, documentar y no extraer. Ejecutar node --check, node --test tests/admin-router.test.js, node --test tests/*.test.js y git diff --check.
```

## 30. Fase realizada - Extraccion handler premium/subscriptions

Estado: realizada en `feature/admin-handler-premium-readonly`.

Se creo:

- `api/_admin/handlers/premium.js`

Se extrajo del monolito:

- `premium/subscriptions` `GET`

No se migraron nuevos endpoints ni writes. No se tocaron checkout, portal de cliente, Lemon Squeezy, webhooks, emails, billing externo, `api/check-premium`, SEO, Chrome, Meta, LinkedIn, social-video, Runway ni Viraliza.

Criterios validados:

- Inyeccion de `clampLimit`, `sanitizeSearch` y `supabaseFetch`.
- El handler solo consulta `premium_subscriptions`.
- Auth, service role, CORS y catch comun permanecen en `api/admin.js`.
- La ruta sigue post-Supabase.
- Tests cubren payload, arrays vacios, error Supabase saneado y ausencia de rutas de efecto externo.

Orden recomendado:

1. Mini-revision de `summary`, `alerts`, `extension/usage` y `parking/summary` para extraer solo si estan aislados.
2. Priorizar `alerts` o `parking/summary` si el diff es pequeno.
3. Mantener `seo/landings` para una fase especifica por cercania a generacion/publicacion.
4. No migrar nuevos writes hasta cerrar las extracciones read-only simples.

Prompt recomendado:

```text
Continuar en feature/admin-handler-premium-readonly. Sin deploy y sin tocar produccion. Revisar handlers ya migrados que siguen dentro de api/admin.js (`alerts`, `summary`, `extension/usage`, `parking/summary`) y extraer como maximo uno o dos si son claramente aislados, con factories e inyeccion de dependencias. No migrar nuevos endpoints ni writes. No tocar SEO, Chrome Web Store, billing, Meta, LinkedIn, social-video ni Viraliza. Mantener URLs, payloads, codigos, auth y saneado de errores. Ejecutar node --check, node --test tests/admin-router.test.js, node --test tests/*.test.js y git diff --check.
```
