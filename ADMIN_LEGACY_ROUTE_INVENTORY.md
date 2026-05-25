# Inventario legacy de rutas admin

Fecha: 2026-05-25
Rama: `feature/admin-legacy-inventory-write-plan`

## Resumen

Esta fase cierra el barrido read-only seguro del router declarativo de `api/admin.js`. No se migro ningun handler adicional: los recursos read-only claros ya estan en el router y los GET restantes pertenecen a zonas expresamente excluidas o mezcladas con integraciones externas, generacion, cron, billing o escrituras.

El objetivo de este documento es dejar inventariado lo que sigue en legacy, clasificar el riesgo y separar con claridad la frontera entre:

- lecturas ya migradas;
- recursos mixtos que necesitan fallback legacy;
- primeras escrituras internas candidatas;
- endpoints que no deben entrar al router hasta tener contratos, fixtures y revisiones especificas.

## Recursos ya fuera del dispatch manual principal

- `alerts` `GET`
- `summary` `GET`
- `extension/usage` `GET`
- `parking/summary` `GET`
- `analytics/summary` `GET`
- `analytics/pages` `GET`
- `analytics/learning` `GET`
- `seo/landings` `GET`
- `kpis/settings` `GET`
- `kpis/settings` `POST`
- `operations/releases` `GET`
- `operations/releases` `POST`
- `premium/subscriptions` `GET`

## Inventario legacy detectado

| resource | action | metodo HTTP | tipo | toca Supabase | escribe Supabase | llama API externa | puede publicar o generar contenido | riesgo | motivo del riesgo | candidato a router | fase recomendada | notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `premium/subscriptions` | metodos no GET | `POST/PUT/PATCH/DELETE` | guard legacy | si | no | no | no | bajo | `GET` ya esta migrado; metodos no soportados conservan `405`. | no | ninguna | Mantener hasta eliminar el branch legacy completo. |
| `seo/landings` | `publish` | `POST` | write/publicacion | si | si | no | si | alto | Cambia `status`, `index_status` y fecha publica; afecta superficie SEO publica. | si, mas adelante | SEO write controlado | Requiere fixtures de landing, estado previo y rollback. |
| `seo/landings` | `noindex` | `POST` | write/publicacion | si | si | no | si | alto | Cambia indexabilidad y puede afectar sitemap/robots semantico. | si, mas adelante | SEO write controlado | No mezclar con generacion. |
| `seo/landings` | `archive` | `POST` | write | si | si | no | si | medio-alto | Oculta o retira una landing; tiene impacto operativo/publico. | si, mas adelante | SEO write controlado | Candidato posterior, no primer lote. |
| `seo/landings` | `regenerate` | `POST` | generation/write | si | si | no | si | alto | Regenera contenido y persiste cambios. | no | fase SEO especifica | Mantener legacy hasta aislar generador y contratos de calidad. |
| `seo/generate-landings` | generacion | `POST` | generation/write | si | si | no | si | alto | Lanza generacion de landings; puede crear o modificar contenido. | no | fase SEO generacion | Fuera del primer write interno. |
| `seo-autogenerate/run` | status/run | `GET/POST` | mixed/cron-like | si | si en run | no | si | critico | El mismo recurso cubre estado y ejecucion, acepta cron/admin y puede lanzar autogeneracion. | no | fase cron SEO separada | Aunque hay lectura de estado, el recurso es demasiado delicado para esta fase. |
| `kpis/settings` | save | `POST` | write interno migrado | si | si | no | no | bajo | Escritura local pequena de configuracion KPI, con validacion acotada. | migrado | primer write interno completado | Migrado al router en `feature/admin-router-kpis-settings-write`; handler extraido a `api/_admin/handlers/kpis.js` en la pausa tecnica. |
| `operations/releases` | create artifact | `POST` | write interno migrado | si | si | no | no | bajo-medio | Crea artefacto local en `release_artifacts`; no llama Chrome ni proveedores. | migrado | segundo write interno completado | Migrado al router en `feature/admin-router-operations-releases-write`; handler extraido a `api/_admin/handlers/operations.js`; `operations/chrome` sigue fuera. |
| `operations/chrome` | status/upload/publish | `POST` | external/write | si | si | si | si | critico | Puede consultar, subir o publicar en Chrome Web Store y parchear artefactos. | no | integraciones externas al final | No ejecutar en tests reales. |
| `linkedin` | dashboard | `GET` | read-only sensible | si | no | no | no | medio | Lectura de configuracion/tokens en dominio social excluido. | no | integraciones sociales | No migrar en fase admin generica. |
| `linkedin/connect` | oauth url | `GET` | external/oauth | no | no | no | no | medio | Construye flujo OAuth y scopes; dominio sensible. | no | integraciones sociales | Mantener junto al resto de LinkedIn. |
| `linkedin/callback` | token exchange | `POST` | external/write | si | si | si | no | critico | Intercambia codigo por token y persiste credenciales cifradas. | no | integraciones sociales | Requiere fixtures OAuth y saneado especifico. |
| `linkedin/disconnect` | disconnect | `POST` | write | si | si | no | no | alto | Borra o invalida credenciales de integracion. | no | integraciones sociales | Mantener legacy. |
| `linkedin/test-connection` | test | `POST` | action/read-like | si | no | no | no | medio | Accion POST en integracion social; no es lectura pura. | no | integraciones sociales | No incluir en primer write. |
| `linkedin/settings` | read/save | `GET/POST` | mixed/write | si | si en POST | no | no | medio-alto | Mezcla lectura y persistencia de configuracion social. | no | integraciones sociales | Podria separarse en fase LinkedIn dedicada. |
| `linkedin/posts` | list/create/update/actions | `GET/POST/PUT` | mixed/write/external | si | si | si en publish | si | alto-critico | Genera, agenda, publica o reintenta contenido social. | no | integraciones sociales | Mantener legacy. |
| `linkedin/daily` | run | `POST` | cron-like/external | si | si | si | si | critico | Ejecuta autopublicador diario. | no | integraciones externas al final | Fuera del router read/write inicial. |
| `linkedin/autopublisher/run` | run | `POST` | cron-like/external | si | si | si | si | critico | Alias operativo del autopublicador. | no | integraciones externas al final | Mantener guardas actuales. |
| `meta` | dashboard | `GET` | read-only sensible | si | no | no | no | medio | Lectura de estado social con settings/tokens indirectos. | no | integraciones sociales | Dominio excluido. |
| `meta/connect` | oauth url | `GET` | external/oauth | no | no | no | no | medio | Inicia OAuth Meta. | no | integraciones sociales | Mantener legacy. |
| `meta/callback` | token exchange | `POST` | external/write | si | si | si | no | critico | Intercambia y persiste tokens; alto riesgo de secretos. | no | integraciones sociales | Requiere pruebas especificas. |
| `meta/disconnect` | disconnect | `POST` | write | si | si | no | no | alto | Borra credenciales/configuracion. | no | integraciones sociales | Mantener legacy. |
| `meta/pages` | list/save page | `GET/POST` | mixed/external/write | si | si en POST | si | no | alto | `GET` puede llamar Graph y `POST` persiste pagina seleccionada. | no | integraciones sociales | No migrar mientras mezcle proveedor. |
| `meta/test-connection` | test | `POST` | action/external | si | no | si | no | alto | Puede validar contra Graph. | no | integraciones sociales | Mantener legacy. |
| `meta/settings` | read/save | `GET/POST` | mixed/write | si | si en POST | no | no | medio-alto | Configuracion social con kill switch y autopost. | no | integraciones sociales | No tocar `META_AUTOPOST_ENABLED`. |
| `meta/posts` | list/create/update/actions | `GET/POST/PUT` | mixed/write/external | si | si | si en publish | si | alto-critico | Genera, aprueba, agenda, publica o reintenta posts. | no | integraciones sociales | Mantener legacy. |
| `meta/daily` | run | `POST` | cron-like/external | si | si | si | si | critico | Ejecuta autopublicador Meta. | no | integraciones externas al final | Mantener kill switch. |
| `meta/autopublisher/run` | run | `POST` | cron-like/external | si | si | si | si | critico | Alias operativo del autopublicador. | no | integraciones externas al final | Mantener legacy. |
| `social-video/generate` | read config/generate | `GET/POST` | mixed/generation/write | si | si en POST | posible | si | alto | `POST` genera y persiste proyectos; zona excluida. | no | social-video dedicada | `GET` no se migra por estar acoplado al flujo de generacion. |
| `social-video/projects` | list/update | `GET/POST` | mixed/write | si | si en POST | no | no | medio-alto | Lista y actualiza estado de proyectos sociales. | no | social-video dedicada | No tocar en esta fase. |
| `social-video/runway-config` | read config | `GET` | read-only sensible | no | no | no | no | medio | Expone estado/configuracion de Runway y pertenece a dominio excluido. | no | social-video dedicada | Tecnico read-only, pero fuera de scope. |
| `social-video/render` | status/create render | `GET/POST` | mixed/external/write | si | si | si | si | critico | Puede llamar Runway, crear jobs y parchear estado al consultar. | no | integraciones externas al final | `GET` no es lectura pura. |
| `social-video/render-content` | fetch content | `GET` | external | no | no | si | no | alto | Recupera contenido remoto de video; riesgo SSRF/coste/proveedor. | no | integraciones externas al final | Mantener aislado. |
| `viraliza/creators` | list/save | `GET/POST` | mixed/write | si | si en POST | no | no | medio | Lista y guarda creadores; producto social excluido. | no | viraliza dedicada | No primer lote. |
| `viraliza/creators/import` | import | `POST` | bulk write | si | si | no | no | medio-alto | Importacion masiva con hasta cientos de filas. | no | viraliza dedicada | Requiere fixtures y limites. |
| `viraliza/performance` | report | `GET` | read-only calculado | si | no | no | no | medio | Lectura agregada de dominio viraliza excluido. | no | viraliza dedicada | Puede migrarse solo en fase de ese modulo. |
| `viraliza/learning` | report | `GET` | read-only calculado | si | no | no | no | medio | Lectura agregada de aprendizaje viraliza. | no | viraliza dedicada | Fuera de esta fase. |
| `viraliza/daily-plan` | plan | `GET` | read-only calculado | si | no | no | si conceptual | medio | Genera plan en memoria; no persiste, pero pertenece a flujo de contenido. | no | viraliza dedicada | No migrar en fase admin generica. |
| `viraliza/actions` | save action | `POST` | write interno | si | si | no | no | medio | Escritura local de acciones, pero dominio social/producto excluido. | no | viraliza dedicada | Posible candidato mucho mas adelante. |
| `viraliza` | routine/content | `GET/POST` | mixed/write/generation | si | si en POST | no | si | alto | Mezcla rutina, generacion de contenido y persistencia de resultados. | no | viraliza dedicada | Mantener legacy. |
| `analytics/*` restante | desconocido | cualquiera | unknown/fallback | no | no | no | no | bajo | No se detectaron recursos analytics legacy explicitos adicionales. | no | ninguna | Los analytics read-only localizados ya estan migrados y extraidos a `api/_admin/handlers/analytics.js`. |
| `*` | recurso no reconocido | cualquiera | fallback | no | no | no | no | bajo | Devuelve `404 admin_resource_not_found`. | no | ninguna | Mantener como cierre legacy. |

## Read-only restante

No queda un recurso read-only puro, de bajo riesgo y fuera de las zonas excluidas que convenga migrar en esta fase.

Hay endpoints `GET` tecnicamente legibles en LinkedIn, Meta, social-video y viraliza, pero se dejan fuera por tres motivos:

- pertenecen a integraciones o modulos expresamente excluidos en esta tarea;
- algunos comparten recurso con POST/PUT o acciones externas;
- migrarlos ahora mezclaria el cierre read-only admin con dominios que necesitan contratos y fixtures propios.

## Frontera de riesgo

La frontera segura actual queda asi:

- Router declarativo: lectura local estable, sin proveedores externos y sin efectos persistentes.
- Legacy: escrituras, recursos mixtos, cron-like, generacion, publicacion, billing, OAuth, proveedores externos y modulos sociales.

El siguiente paso no debe ser otro barrido read-only generico. Debe ser un primer lote write interno muy pequeno, empezando por el endpoint con menor superficie de dano y mejores validaciones.

## Primer write interno migrado

Fecha: 2026-05-25
Rama: `feature/admin-router-kpis-settings-write`

Se migro solo `POST kpis/settings` al router declarativo. El handler sigue siendo `handleKpiSettings(req)` dentro de `api/admin.js`; el cambio es de dispatch, no de semantica.

Cobertura anadida:

- El router puede registrar `GET` y `POST` para `kpis/settings` sin wildcard.
- `POST kpis/settings` con body valido conserva upsert local en `kpi_settings`.
- Body vacio se trata como `{}` y devuelve defaults/coercion como antes.
- JSON mal formado devuelve error saneado por el catch admin comun.
- Error Supabase durante el upsert devuelve `500 admin_request_failed` saneado.
- `PUT kpis/settings` conserva `405 method_not_allowed`.
- Recursos write no relacionados siguen en legacy.

Riesgo residual:

- `saveKpiSettings` sigue dentro de `api/admin.js`.
- La escritura depende de `coerceKpiSettings`; no se cambio su contrato.
- `operations/releases POST` quedo fuera de la primera fase write y se migro despues como segundo write interno.

## Segundo write interno migrado

Fecha: 2026-05-25
Rama: `feature/admin-router-operations-releases-write`

Se migro solo `POST operations/releases` al router declarativo. El handler sigue siendo `handleReleaseArtifacts(req, url)` dentro de `api/admin.js`; el cambio es de dispatch, no de semantica.

Confirmacion de seguridad:

- Es escritura local en `release_artifacts`.
- Usa `normalizeReleaseArtifactInput`.
- Hace `supabaseFetch("release_artifacts", { method: "POST" })`.
- No llama `handleChromeOperation`.
- No llama `chromeFetch`.
- No sube paquetes.
- No publica en Chrome Web Store.
- No modifica ZIPs ni archivos de distribucion.

Cobertura anadida:

- El router puede registrar `GET` y `POST` para `operations/releases` sin wildcard.
- `POST operations/releases` con body valido conserva payload y artefacto creado.
- Campos desconocidos siguen ignorados por normalizacion.
- Body vacio y campos obligatorios ausentes conservan error controlado por el catch admin comun.
- JSON mal formado devuelve error saneado.
- Error Supabase durante insert devuelve `500 admin_request_failed` saneado.
- `PUT operations/releases` conserva `405 method_not_allowed`.
- `operations/chrome` sigue fuera del router de releases.

Riesgo residual:

- `handleReleaseArtifacts` seguia dentro de `api/admin.js` tras la segunda migracion write; queda extraido en `feature/admin-handler-operations-releases`.
- `operations/chrome` sigue en legacy completo y debe quedarse fuera hasta una fase de integraciones externas.
- Ya hay dos writes internos migrados; conviene pausar y evaluar extraccion de handlers antes de abordar writes con mas efectos.

## Pausa tecnica de handlers

Fecha: 2026-05-25
Rama: `feature/admin-router-handler-contracts`

Handlers ya registrados en el router:

- `alerts`
- `summary`
- `extension/usage`
- `parking/summary`
- `analytics/summary`
- `analytics/pages`
- `analytics/learning`
- `seo/landings` `GET`
- `kpis/settings` `GET/POST`
- `operations/releases` `GET/POST`
- `premium/subscriptions` `GET`

Extraccion realizada:

- `kpis/settings` queda en `api/_admin/handlers/kpis.js`.
- `operations/releases` queda en `api/_admin/handlers/operations.js`.

Siguen dentro de `api/admin.js`:

- `handleSummary`;
- `handleAlerts`;
- `handleExtensionUsageSummary`;
- `handleParkingSummary` quedaba dentro en esta fase; se extrae despues en `feature/admin-handler-core-readonly-review`;
- `handleSeoLandings`;
- todos los handlers legacy sensibles.

Candidatos a extraccion posterior:

- `premium/subscriptions`, si se mantiene separado de checkout/portal/webhooks; queda extraido en `feature/admin-handler-premium-readonly`.
- analytics read-only, si se quiere reducir el peso del bloque de analitica; queda extraido en `feature/admin-handler-analytics-readonly`.

Bloqueados por riesgo:

- `operations/chrome`;
- SEO write/generacion/autogeneracion;
- Meta, LinkedIn, social-video, Runway y Viraliza;
- billing externo, checkout, portal y webhooks.

## Extraccion handler operations/releases

Fecha: 2026-05-25
Rama: `feature/admin-handler-operations-releases`

Se extrajo `operations/releases` `GET/POST` a `api/_admin/handlers/operations.js` usando un factory con dependencias inyectadas.

Dependencias inyectadas:

- `safeFetch`;
- `supabaseFetch`;
- `readJsonBody`;
- `clampLimit`.

Confirmacion de frontera:

- `operations/chrome` sigue en legacy dentro de `api/admin.js`.
- No se movieron helpers de Chrome.
- No se importo Chrome Web Store en el handler de releases.
- No se migraron nuevos endpoints.

Riesgo residual:

- El modulo operations extraido solo cubre releases locales.
- Chrome, publish, upload y status remoto siguen bloqueados hasta fase dedicada.

## Extraccion handlers analytics read-only

Fecha: 2026-05-25
Rama: `feature/admin-handler-analytics-readonly`

Se extrajeron `analytics/summary`, `analytics/pages` y `analytics/learning` a `api/_admin/handlers/analytics.js` usando un factory con dependencias inyectadas.

Dependencias inyectadas:

- `hasSupabaseConfig`;
- `supabaseFetch`;
- `clampLimit`.

Dependencias puras importadas por el handler:

- `buildOwnedAnalyticsLearning`;
- `summarizeOwnedAnalytics`;
- `summarizePagePerformance`.

Estado actualizado de handlers ya extraidos:

- `kpis/settings` queda en `api/_admin/handlers/kpis.js`.
- `operations/releases` queda en `api/_admin/handlers/operations.js`.
- `analytics/summary`, `analytics/pages` y `analytics/learning` quedan en `api/_admin/handlers/analytics.js`.

Siguen dentro de `api/admin.js`:

- `handleSummary`;
- `handleAlerts`;
- `handleExtensionUsageSummary`;
- `handleParkingSummary` quedaba dentro en esta fase; se extrae despues en `feature/admin-handler-core-readonly-review`;
- `handleSeoLandings`;
- handlers legacy sensibles.

Confirmacion de frontera:

- No se migraron nuevos endpoints.
- No se tocaron writes.
- No se tocaron SEO, premium/billing, Chrome, Meta, LinkedIn, social-video, Runway ni Viraliza.
- La lectura analytics sigue en el grupo pre-Supabase para conservar el fallback cuando Supabase no esta configurado.

Riesgo residual:

- Los calculos de learning siguen dependiendo de `lib/analytics/learning`; no se cambio su semantica.
- `premium/subscriptions` era el siguiente candidato de extraccion y queda extraido en `feature/admin-handler-premium-readonly`.
- `seo/landings` debe seguir esperando una fase con mas contexto por cercania a generacion/publicacion.

## Extraccion handler premium/subscriptions read-only

Fecha: 2026-05-25
Rama: `feature/admin-handler-premium-readonly`

Se extrajo `premium/subscriptions` `GET` a `api/_admin/handlers/premium.js` usando un factory con dependencias inyectadas.

Dependencias inyectadas:

- `clampLimit`;
- `sanitizeSearch`;
- `supabaseFetch`.

Estado actualizado de handlers ya extraidos:

- `kpis/settings` queda en `api/_admin/handlers/kpis.js`.
- `operations/releases` queda en `api/_admin/handlers/operations.js`.
- `analytics/summary`, `analytics/pages` y `analytics/learning` quedan en `api/_admin/handlers/analytics.js`.
- `premium/subscriptions` queda en `api/_admin/handlers/premium.js`.
- `parking/summary` queda en `api/_admin/handlers/core.js`.

Premium/billing fuera de esta fase:

- `api/lemonsqueezy-checkout`;
- `api/lemonsqueezy-portal`;
- `api/lemonsqueezy-webhook`;
- `api/check-premium`;
- checkout, portal de cliente, magic links, emails, webhooks y billing externo.

Siguen dentro de `api/admin.js`:

- `handleSummary`;
- `handleAlerts`;
- `handleExtensionUsageSummary`;
- `handleSeoLandings`;
- handlers legacy sensibles.

Confirmacion de frontera:

- No se migraron nuevos endpoints.
- No se tocaron writes.
- No se llamo Lemon Squeezy ni ningun proveedor externo.
- No se creo checkout ni portal de cliente.
- No se procesaron webhooks.
- No se toco `api/check-premium`.

Riesgo residual:

- `summary` sigue mostrando flags de configuracion Lemon desde `api/admin.js`, sin llamadas externas.
- Los endpoints reales de billing siguen requiriendo auditoria propia antes de cualquier extraccion.
- `seo/landings` sigue pendiente por proximidad a generacion/publicacion.

## Mini-revision handlers core read-only

Fecha: 2026-05-25
Rama: `feature/admin-handler-core-readonly-review`

Se revisaron los handlers core read-only ya migrados al router:

- `alerts`;
- `summary`;
- `extension/usage`;
- `parking/summary`.

Extraccion realizada:

- `parking/summary` `GET` se extrajo a `api/_admin/handlers/core.js`.

Dependencias inyectadas:

- `safeFetch`;
- `average`;
- `countBy`.

No extraidos:

- `alerts`: cruza mantenimiento nocturno, estado de autogeneracion SEO, Supabase, waitlist, premium y Viraliza. Aunque es read-only, no es un handler pequeno.
- `summary`: agrega premium/revenue, SEO, oportunidades, parking y flags de configuracion Lemon. Requiere una fase de summary propia si se decide extraer.
- `extension/usage`: es read-only y no llama integraciones externas, pero arrastra un bloque amplio de helpers de ventana temporal, series y usuarios conocidos. Conviene una fase dedicada si se quiere moverlo.
- `seo/landings` `GET`: no se toco; sigue pendiente para fase separada por cercania a generacion/publicacion y recurso mixto con `POST`.

Confirmacion de frontera:

- No se migraron nuevos endpoints.
- No se tocaron writes.
- No se tocaron SEO, Chrome, billing, social ni integraciones externas.
- El router sigue registrando solo recursos existentes.

Riesgo residual:

- `api/admin.js` sigue conteniendo `alerts`, `summary`, `extension/usage`, `seo/landings` y handlers legacy sensibles.
- `extension/usage` es el siguiente candidato tecnico si se acepta una extraccion mas grande pero autocontenida.
- `summary` y `alerts` requieren una decision de arquitectura por mezclar varios dominios.
