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
