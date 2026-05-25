# Inventario post-extraccion de api/admin.js

Fecha: 2026-05-25
Rama: `feature/admin-post-extraction-inventory`

## 1. Resumen ejecutivo

La fase read-only y de extraccion segura ha dejado `api/admin.js` en un punto razonable de pausa tecnica. El dispatch principal ya no concentra todos los recursos read-only y varios handlers internos de bajo riesgo viven fuera del monolito con factories e inyeccion de dependencias.

No se han migrado endpoints nuevos en esta fase. No se ha tocado runtime, writes, SEO write, integraciones externas, produccion, variables reales ni schema.

Resultado principal:

- El router declarativo esta validado para read-only y dos writes internos locales.
- El contrato `{ status, payload }` funciona de forma consistente.
- `api/admin.js` conserva responsabilidades transversales que si tienen sentido ahi: auth, CORS, Supabase gate, dispatch, catch comun, saneado y fallback legacy.
- Lo que queda dentro de `api/admin.js` ya no son handlers read-only simples; son agregadores mixtos, writes con efecto publico o integraciones externas.

Recomendacion: consolidar/mergear la cadena actual antes de seguir refactorizando. Despues, priorizar hardening transversal: rate limiting, CORS mas estricto, observabilidad y limites. SEO write debe esperar a fixtures, rollback y contrato especifico.

## 2. Tamano actual

Mediciones locales sobre la rama `feature/admin-post-extraction-inventory`:

| referencia | lineas aproximadas de `api/admin.js` | nota |
| --- | ---: | --- |
| `433420a` | 3808 | Base tras auditoria inicial. |
| `06347b8` | 3825 | Router read-only inicial, antes de extracciones. |
| `c6b3709` / actual | 3109 | Tras extracciones de handlers. |

Lectura:

- Reduccion aproximada desde `433420a`: 699 lineas.
- Reduccion aproximada desde `06347b8`: 716 lineas.
- Funciones totales restantes detectadas en `api/admin.js`: 139.
- Funciones `handle*` restantes detectadas: 39.
- Handlers extraidos actuales: 7 archivos, unas 888 lineas en total.

Esta reduccion no significa que `api/admin.js` ya sea pequeno; significa que la parte sencilla ya fue retirada. Lo restante tiene mas acoplamiento y mas riesgo operativo.

## 3. Bloques restantes dentro de api/admin.js

| bloque/recurso | metodo | dominio | tipo | motivo por el que sigue dentro | riesgo | dependencias | toca Supabase | escribe Supabase | llama API externa | genera/publica contenido | afecta billing | afecta SEO publico | candidato futuro | fase recomendada | notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| shell admin: auth, CORS, route, gate, catch comun | todos | plataforma | shell | Es responsabilidad transversal del entrypoint. | bajo | `_utils`, router, env admin/cron | no directo | no | no | no | no | no | no | mantener | Debe seguir en `api/admin.js` salvo cambio mayor de framework. |
| `alerts` | GET | operations + SEO + premium + viraliza | aggregator | Cruza mantenimiento nocturno, SEO autogeneration, waitlist, premium, Viraliza y estado de entorno. | medio | `loadNightlyMaintenanceAlerts`, `buildSeoAutogenerationOperationalAlerts`, `safeFetch` | si | no | no | no | indirecto | indirecto | no aun | dividir por dominio | Extraerlo entero moveria demasiados dominios juntos. |
| `summary` | GET | backoffice global | aggregator | Agrega premium/revenue, SEO, parking, waitlist y flags Lemon. | medio | `safeFetch`, `countBy`, `average`, `summarizeMonthlyRevenue`, env Lemon | si | no | no | no | si, lectura | si, lectura | no aun | servicios auxiliares por dominio | Buen candidato a descomponer en services antes de handler. |
| `fetchLanding`, `patchLanding`, `opportunityFromLanding` | interno | SEO | helper write | Alimentan acciones de `POST seo/landings`. | alto | `supabaseFetch`, `LANDING_SELECT`, `normalizeSlug` | si | si en patch | no | si | no | si | si | fase SEO write | No mover sin contrato de rollback. |
| `POST seo/landings` | POST | SEO | write/publicacion | Acciones `publish`, `noindex`, `archive`, `regenerate`. | alto | `fetchLanding`, `patchLanding`, `runSeoLandingGeneration` | si | si | no | si | no | si | si | SEO write controlado | Requiere fixtures y tests de no publicacion accidental. |
| `seo/generate-landings` | POST | SEO | generation/write | Lanza generacion manual. | alto | `runSeoLandingGeneration`, body admin | si | si | no | si | no | si | no ahora | fase SEO generacion | No mezclar con publish/noindex/archive. |
| `seo-autogenerate/run` | GET/POST | SEO cron | cron-like/mixed | Puede exponer status o lanzar autogeneracion con admin/cron. | critico | `runSeoAutogeneration`, cron/admin auth, env | si | si al ejecutar | no | si | no | si | no ahora | fase cron SEO separada | Mantener fuera hasta contrato cron. |
| `operations/chrome` | POST | operations/chrome | external/write | Lee/escribe artefactos y puede consultar/subir/publicar en Chrome Web Store. | critico | Chrome Web Store helpers, env, `release_artifacts` | si | si | si | si externo | no | no | no ahora | integraciones externas al final | No tocar sin mocks de proveedor y kill switch. |
| `linkedin/*` | GET/POST | social LinkedIn | external/mixed | OAuth, tokens, settings, posts, autopublisher y publicacion. | critico | LinkedIn services, crypto, Supabase, env | si | si | si | si | no | indirecto | no ahora | social externo | Tiene tokens y efectos externos. |
| `meta/*` | GET/POST | social Meta | external/mixed | OAuth, paginas, settings, drafts, autopublisher y publicacion. | critico | Meta services, crypto, Supabase, env | si | si | si | si | no | indirecto | no ahora | social externo | Mantener al final por tokens y publicacion. |
| `social-video/projects` | GET/POST/PATCH | social video | mixed/write | Gestiona proyectos, persistencia y generacion local de proyecto. | alto | social-video generator/projects, Supabase | si | si | no directo | si, contenido | no | no | si mas tarde | servicios social-video | Separar lectura de escritura primero. |
| `social-video/generate` | POST | social video | generation/write | Genera storyboard/proyecto y puede persistir. | alto | `generateSocialVideoProject`, branding, Supabase | si | si | no | si | no | no | no ahora | generation separada | Requiere fixtures de payload. |
| `social-video/render` | POST/GET | Runway | external/cost | Crea/consulta trabajos de video con proveedor. | critico | Runway helpers, env, Supabase | si | si | si | si | no | no | no ahora | integraciones externas al final | Puede incurrir coste externo. |
| `social-video/render-content` | GET | Runway/content proxy | external/read | Sirve contenido de render; puede depender de jobs/proveedor. | alto | Runway/job helpers | si | no | posible | no | no | no | no ahora | revisar con Runway | No mezclar con refactor admin. |
| `viraliza/*` | GET/POST | growth/manual | mixed/write | Rutinas, creadores, acciones, import y performance. | medio-alto | Viraliza engine, Supabase | si | si | no directo | genera contenido interno | no | no | si mas tarde | dominio Viraliza | Mejor extraer como modulo completo. |
| fallback legacy de `premium/subscriptions`, `kpis/settings`, `operations/releases`, `seo/landings` | varios | compatibilidad | fallback | Conserva comportamiento para metodos no migrados o recursos mixtos. | bajo-medio | handlers extraidos y legacy local | si | segun metodo | no | segun recurso | posible | posible | si | limpieza posterior | Solo retirar cuando haya confianza post-merge. |
| helpers compartidos: `safeFetch`, `clampLimit`, `clampPage`, `sanitizeSearch`, `readJsonBody` | interno | plataforma admin | utility | Son usados por varios handlers/legacy. | bajo | `_utils`, Supabase | si en `safeFetch` | no | no | no | no | no | si | lib/admin posterior | No urge; extraerlos ahora podria crear churn. |
| helpers de tokens/OAuth/social | interno | social | utility sensible | Manejan tokens, settings, posts y errores de proveedores. | alto | env, crypto/services, Supabase | si | si | si | si | no | indirecto | no ahora | social externo | No extraer sin tests de secretos y errores. |

## 4. Handlers ya extraidos

| archivo | recursos cubiertos | tipo | dependencias inyectadas | contrato | tests que lo cubren | riesgo residual | proximo endurecimiento recomendado |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `api/_admin/handlers/kpis.js` | `kpis/settings` GET/POST | read/write local | `readJsonBody`, `supabaseFetch` | `{ status, payload }` | `tests/admin-router.test.js`, tests KPI | bajo | Mantener como ejemplo de write local; no ampliar sin schema claro. |
| `api/_admin/handlers/operations.js` | `operations/releases` GET/POST | read/write local | `clampLimit`, `readJsonBody`, `safeFetch`, `supabaseFetch` | `{ status, payload }` | `tests/admin-router.test.js`, release tests | bajo-medio | No mezclar con `operations/chrome`; separar connectors si se avanza. |
| `api/_admin/handlers/analytics.js` | `analytics/summary`, `analytics/pages`, `analytics/learning` | read-only con calculos | `clampLimit`, `hasSupabaseConfig`, `supabaseFetch` | `{ status, payload }` | `tests/admin-router.test.js`, `tests/owned-analytics.test.js` | bajo | Si crece, mover calculos a `lib/analytics`. |
| `api/_admin/handlers/premium.js` | `premium/subscriptions` GET | read-only billing-adjacent | `clampLimit`, `sanitizeSearch`, `supabaseFetch` | `{ status, payload }` | `tests/admin-router.test.js`, premium tests | medio | Mantener separado de checkout, portal, Lemon y webhooks. |
| `api/_admin/handlers/core.js` | `parking/summary` GET | read-only pequeno | `average`, `countBy`, `safeFetch` | `{ status, payload }` | `tests/admin-router.test.js`, parking tests | bajo | No convertir `core.js` en cajon de sastre. |
| `api/_admin/handlers/extension-usage.js` | `extension/usage` GET | read-only grande | `clampLimit`, `supabaseFetch` | `{ status, payload }` | `tests/admin-router.test.js`, extension usage tests | bajo-medio | Mantener separado del endpoint publico `/api/extension-usage`. |
| `api/_admin/handlers/seo.js` | `seo/landings` GET | read-only SEO | `buildSeoDailyPolicySnapshot`, `clampLimit`, `clampPage`, `landingSelect`, `safeFetch`, `seoDailyTargets`, `supabaseFetch` | `{ status, payload }` | `tests/admin-router.test.js`, `tests/seo.test.js` | medio | No mezclar con POST/generation/publish; fixtures antes de SEO write. |

## 5. Diagnostico de arquitectura

### Responsabilidad que `api/admin.js` conserva correctamente

- Auth admin y auth admin/cron.
- CORS.
- Normalizacion de recurso desde query/path.
- Gate de Supabase.
- Dispatch declarativo y fallback legacy.
- Catch comun y saneado de errores.
- Entrada unica serverless para compatibilidad del backoffice.

Estas responsabilidades son transversales y no conviene moverlas todavia.

### Responsabilidades que deberia perder en fases futuras

- Logica de dominio de social, SEO write, operations/chrome, Viraliza y social-video.
- Agregadores mezclados (`summary`, `alerts`) cuando existan services por dominio.
- Integraciones externas y manejo de tokens dentro del entrypoint.
- Generacion/publicacion de contenido.
- Writes con efectos publicos.

### Contrato de handler

El contrato `{ status, payload }` esta funcionando bien:

- El router lo normaliza sin cambiar la respuesta externa.
- Facilita tests directos de handlers con dependencias inyectadas.
- Mantiene auth/CORS/gate fuera de cada handler.
- Permite conservar fallback legacy por metodo.

No hace falta cambiarlo ahora. Si se agregan metadatos de rutas, deberian ser documentales primero.

### Metadata de rutas

Puede tener sentido anadir metadatos en una fase posterior:

- `readOnly: true`
- `writesLocal: true`
- `writesExternal: true`
- `external: true`
- `risk: "low" | "medium" | "high" | "critical"`
- `legacyFallback: true`

No recomiendo implementarlo antes del merge: anade ruido sin cambiar seguridad real todavia.

### Carpetas por dominio

La estructura actual `api/_admin/handlers/*.js` es suficiente para handlers. Para servicios auxiliares, la separacion deberia vivir mas abajo:

- `lib/admin/` para utilidades de contrato, limits, errores y observabilidad.
- `lib/seo/` para services SEO read/write con fixtures.
- `lib/social/` para orquestacion social, separada de proveedores.
- `lib/operations/` para Chrome, releases y health operacional.
- `lib/billing/` para checkout, portal, webhooks y premium.

No implementarlo en esta fase.

## 6. Decision recomendada para la siguiente fase

### Opcion A - Merge/consolidacion controlada

Ventajas:

- Reduce la divergencia acumulada de una cadena larga de ramas.
- Permite validar todo el trabajo en una base comun antes de tocar mas riesgo.
- Da un punto estable para medir regresiones.

Riesgos:

- Puede haber conflictos si main avanzo mucho.
- Exige revisar que todos los documentos y tests viajan juntos.

Requisitos:

- Branch limpia.
- Suite completa verde.
- Revision de diff acumulado.
- PR/merge sin squash accidental de contexto si el equipo necesita trazabilidad.

Tests:

- `node --check` en admin, router y handlers.
- `node --test tests/admin-router.test.js`
- `node --test tests/seo.test.js`
- `node --test tests/owned-analytics.test.js`
- `node --test tests/*.test.js`
- `git diff --check`

Cuándo elegirla:

- Ahora. Es la opcion recomendada para no seguir apilando refactor sobre una cadena larga.

### Opcion B - Extraer servicios auxiliares por dominio

Ventajas:

- Prepara `summary`, `alerts` y writes sensibles sin mover endpoints.
- Reduce acoplamiento antes de tocar SEO write o social.
- Permite fixtures por dominio.

Riesgos:

- Puede convertirse en refactor grande si no se limita.
- No mejora seguridad inmediata si no hay tests/contratos.

Candidatos:

- `summary`: services `premiumSummary`, `seoSummary`, `parkingSummary`, `revenueSummary`.
- `alerts`: services `seoAutogenerationAlerts`, `nightlyMaintenanceAlerts`, `premiumAlerts`, `viralizaAlerts`.
- `seo write`: service de acciones con fixtures, sin mover endpoint todavia.

Cuándo elegirla:

- Despues de consolidar/mergear y si el objetivo sigue siendo reducir monolito antes de writes.

### Opcion C - Entrar en SEO write de bajo riesgo

Ventajas:

- Ataca una zona funcional importante del backoffice.
- Podria separar `publish`, `noindex`, `archive` y `regenerate`.

Riesgos:

- Tiene efecto publico o semipublico.
- Puede modificar indexabilidad, fechas y contenido.
- `regenerate` mezcla generacion y persistencia.

Requisitos minimos:

- Fixtures de landing por estado.
- Rollback claro.
- Tests de body valido e invalido.
- Tests de no publicacion accidental.
- Tests de no regeneracion no solicitada.
- Tests de no exposicion de secretos.
- Contrato estricto por accion.
- Separar `regenerate` de `publish/noindex/archive`.

Cuándo NO elegirla:

- Antes de consolidar la cadena actual.
- Sin fixtures y rollback.
- Si hay cambios pendientes en SEO/publicacion o sitemap.

### Opcion D - Pausar refactor y hacer estabilizacion/rendimiento

Ventajas:

- Mejora seguridad y operacion sin tocar semantica de negocio.
- Reduce riesgo antes de writes sensibles.

Riesgos:

- Puede requerir decisiones de infraestructura si se busca rate limiting durable real.
- CORS estricto puede romper clientes si se aplica sin inventario.

Candidatos:

- Rate limiting durable en endpoints publicos de escritura.
- CORS mas estricto por entorno.
- Observabilidad y logs estructurados no sensibles.
- Metricas de latencia por handler.
- Health checks con dependencias.
- Payload limits consistentes.

Cuándo elegirla:

- Despues de merge/consolidacion, antes de SEO write si se prioriza seguridad operacional.

## 7. Recomendacion

Recomendacion clara:

1. Merge/consolidacion controlada de la cadena actual.
2. Hardening transversal: rate limiting, CORS, observabilidad, payload limits.
3. Extraer servicios auxiliares por dominio para `summary` y `alerts`.
4. Preparar SEO write con fixtures, rollback y contrato por accion.
5. Dejar integraciones externas para el final: Chrome, Meta, LinkedIn, Runway, billing.

Motivo: ya se ha reducido el dispatch y los handlers read-only seguros. El siguiente riesgo no es "otro handler mas"; es la combinacion de ramas acumuladas, integraciones externas y writes con efecto publico.

## 8. Prompt recomendado para la siguiente fase

```text
Nombre del chat/tarea:
Consolidacion controlada ramas admin router/handlers InmoRadar

Contexto:
Venimos de una cadena de hardening, router declarativo y extraccion segura de handlers de api/admin.js. La rama final de cierre es feature/admin-post-extraction-inventory. Ya existen handlers extraidos para kpis, operations/releases, analytics, premium/subscriptions, parking/summary, extension/usage y seo/landings GET. Quedan dentro de api/admin.js summary, alerts, SEO write, operations/chrome, social, billing y otros dominios sensibles.

Objetivo:
Preparar una consolidacion controlada de la cadena actual sin introducir cambios funcionales nuevos.

Reglas:
- No deploy.
- No merge a main sin revision explicita.
- No tocar produccion.
- No migrar endpoints nuevos.
- No tocar writes, SEO write, Chrome, Meta, LinkedIn, Runway, Viraliza, checkout, billing ni webhooks.
- No cambiar URLs, payloads, auth ni codigos HTTP.

Tareas:
1. Revisar estado git y comparar la rama final contra main/origin main.
2. Generar un resumen de diff acumulado por archivos.
3. Ejecutar node --check en api/admin.js, api/_admin/router.js y todos los handlers.
4. Ejecutar node --test tests/admin-router.test.js, tests/seo.test.js, tests/owned-analytics.test.js y tests/*.test.js.
5. Ejecutar git diff --check.
6. Preparar una checklist de PR/merge con riesgos, tests y rollback.
7. No cambiar codigo salvo documentacion de consolidacion si falta.

Criterio de exito:
Queda una decision clara para PR/merge controlado de la cadena actual antes de continuar con rate limiting, CORS, observabilidad o SEO write.
```

## 9. Resultado de verificacion de esta fase

Ejecutado en la rama `feature/admin-post-extraction-inventory` con Node bundled:

- `node --check api/admin.js`: OK.
- `node --check api/_admin/router.js`: OK.
- `node --check api/_admin/handlers/kpis.js`: OK.
- `node --check api/_admin/handlers/operations.js`: OK.
- `node --check api/_admin/handlers/analytics.js`: OK.
- `node --check api/_admin/handlers/premium.js`: OK.
- `node --check api/_admin/handlers/core.js`: OK.
- `node --check api/_admin/handlers/extension-usage.js`: OK.
- `node --check api/_admin/handlers/seo.js`: OK.
- `node --check assets/admin.js`: OK.
- `node --check api/sitemap.js`: OK.
- `node --check api/seo-page.js`: OK.
- `node --check scripts/serve-static.js`: OK.
- `node --test tests/admin-router.test.js`: 46 pass, 0 fail.
- `node --test tests/seo.test.js`: 17 pass, 0 fail.
- `node --test tests/owned-analytics.test.js`: 16 pass, 0 fail.
- `node --test tests/*.test.js`: 285 pass, 0 fail.
