# Plan primer lote write interno admin

Fecha: 2026-05-25
Rama: `feature/admin-legacy-inventory-write-plan`

## 1. Objetivo

Preparar la siguiente fase de `api/admin.js`: migrar al router declarativo los primeros endpoints de escritura interna de muy bajo riesgo, sin tocar integraciones externas, generacion, publicacion, billing ni procesos cron.

Este documento no implementa la migracion. Define candidatos reales, criterios, pruebas y un prompt de ejecucion para que la siguiente fase sea pequena, reversible y verificable.

## 2. Criterios de inclusion

Un endpoint write puede entrar en el primer lote solo si cumple todo:

- escritura local en Supabase;
- sin APIs externas;
- sin publicacion publica;
- sin generacion irreversible;
- sin billing;
- sin Chrome Web Store;
- sin Meta, LinkedIn, social-video ni viraliza;
- idempotente o casi idempotente;
- rollback sencillo con el valor anterior o borrado de fila;
- payload pequeno;
- validacion clara;
- tests faciles con mocks de Supabase;
- sin cambios visuales ni funcionales visibles.

## 3. Criterios de exclusion

Quedan fuera del primer lote:

- generacion SEO;
- publicacion, noindex o archive con efectos publicos;
- billing, checkout, portal y webhooks;
- integraciones sociales;
- Chrome Web Store;
- operaciones de limpieza, reparacion o publicacion;
- jobs y cron;
- borrados;
- cambios masivos;
- cualquier endpoint que llame proveedores externos;
- cualquier endpoint que pueda exponer secretos en errores.

## 4. Candidatos reales detectados

| candidato | metodo | que escribe | tabla afectada | validaciones necesarias | rollback posible | tests necesarios | riesgo | recomendacion |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `kpis/settings` | `POST` | Configuracion de KPIs internos. | `kpi_settings` | Body JSON valido, coercion existente, rangos permitidos, objeto pequeno. | Restaurar fila previa o valores por defecto. | Exito, body invalido, Supabase error saneado, no secretos, metodo no soportado, fallback GET intacto. | bajo | Primer candidato recomendado. |
| `operations/releases` | `POST` | Artefacto local de release. | `release_artifacts` | `target`, `version`, `title`, `channel`, `status`, `artifact_kind`, `connector_target`, tamano/sha si aplica. | Borrar fila creada o volver a estado anterior si se usa update futuro. | Exito local, body invalido, Supabase error saneado, no llamada Chrome, GET intacto. | bajo-medio | Segundo candidato, solo si se separa claramente de `operations/chrome`. |
| `viraliza/actions` | `POST` | Accion local de Viraliza. | tablas de acciones Viraliza | Validar creador/accion/fecha/estado. | Borrar accion creada. | Exito, body invalido, arrays vacios, error saneado. | medio | No recomendado en primer lote por estar en modulo social excluido. |
| `viraliza/creators` | `POST` | Creador Viraliza. | tablas de creators Viraliza | Validar handle, plataforma, campos numericos y duplicados. | Borrar o restaurar creador. | Exito, duplicados, payload grande, error saneado. | medio | No recomendado; requiere fase Viraliza dedicada. |
| `viraliza/creators/import` | `POST` | Importacion masiva de creadores. | tablas de creators Viraliza | Limite de filas, validacion por item, reporte parcial. | Complejo si hay upsert parcial. | Bulk parcial, limites, errores por fila. | medio-alto | Excluir del primer lote. |
| `social-video/projects` | `POST` | Estado de proyecto social-video. | tablas social-video | Validar id/status, transiciones permitidas. | Restaurar estado previo. | Transicion valida/invalida, no proveedor externo. | medio | Excluir por dominio social-video. |
| `seo/landings` | `POST archive/noindex/publish` | Estado publico/indexabilidad de landings. | `seo_landings` | Validar accion, id, estado previo, efectos sitemap. | Restaurar estado previo. | Fixtures SEO completas, sitemap/robots/canonical. | alto | No primer lote. Fase SEO write controlado. |
| `linkedin/settings` | `POST` | Settings LinkedIn. | tablas social settings | Validar settings y no secretos. | Restaurar fila previa. | Kill switch, no tokens, error saneado. | medio-alto | Excluir por integracion social. |
| `meta/settings` | `POST` | Settings Meta/autopost. | tablas social settings | Validar kill switch y nunca activar autopost por accidente. | Restaurar fila previa. | Kill switch, no tokens, no `META_AUTOPOST_ENABLED`. | alto | Excluir hasta fase Meta dedicada. |

## 5. Recomendacion de primer lote

Primer lote recomendado:

1. `kpis/settings` `POST`

Opcional, solo si la fase anterior queda limpia y el diff sigue pequeno:

2. `operations/releases` `POST`

No incluir mas de dos endpoints. Si se quiere maximizar prudencia, migrar solo `kpis/settings` y dejar `operations/releases` como segunda fase write.

## 6. Estrategia tecnica

- Mantener auth y permisos en `api/admin.js`.
- Mantener el handler original donde este si extraerlo aumenta el diff.
- Registrar la ruta write en `api/_admin/router.js` con el mismo resource y metodo.
- Mantener `fallbackOnMethodMismatch` cuando convivan `GET` y `POST`.
- No mover service role ni variables sensibles.
- No cambiar payloads, status ni mensajes esperados.
- No introducir metadatos de riesgo en el router todavia, salvo que se haga en una fase separada.

## 7. Tests necesarios para el primer write

Para `kpis/settings` `POST`:

- el router encuentra `POST kpis/settings`;
- `GET kpis/settings` sigue funcionando como antes;
- body invalido devuelve el mismo error/codigo que legacy;
- body valido conserva payload y status;
- error Supabase se sanea;
- no se exponen tokens, service role ni secretos;
- metodos no soportados mantienen comportamiento actual;
- recursos legacy no relacionados siguen cayendo a legacy;
- `node --test tests/admin-router.test.js`;
- `node --test tests/*.test.js`;
- `git diff --check`.

Para `operations/releases` `POST`, si se incluye:

- el router encuentra `POST operations/releases`;
- `GET operations/releases` sigue funcionando como antes;
- no se invoca `operations/chrome`;
- body invalido conserva error/codigo;
- error Supabase se sanea;
- payload creado conserva estructura.

## 8. Revision del router

El router actual soporta bien recursos mixtos mediante `fallbackOnMethodMismatch`. La cobertura existente prueba que un recurso registrado como `GET` puede dejar `POST` en legacy sin capturarlo por error.

Metadatos posibles para una fase posterior:

- `readOnly: true`
- `writes: true`
- `external: false`
- `risk: "low" | "medium" | "high" | "critical"`
- `owner: "kpis" | "operations" | "seo" | "social"`

Recomendacion: no anadirlos en el primer write si no son necesarios para el dispatch. Primero migrar un write pequeno; despues, si el registro empieza a crecer, introducir metadatos con tests del contrato.

## 9. Prompt recomendado para la siguiente fase

```text
Nombre del chat/tarea:
Refactor seguro api/admin.js - Primer write interno kpis/settings InmoRadar

Contexto:
Venimos del cierre read-only y del inventario legacy en feature/admin-legacy-inventory-write-plan. No queda read-only puro fuera de zonas excluidas. El primer write interno recomendado es `kpis/settings` POST.

Objetivo:
Migrar al router declarativo interno solo `POST kpis/settings`, manteniendo `GET kpis/settings`, URLs, query params, payloads, codigos HTTP, auth y saneado de errores exactamente iguales.

Reglas:
- No deploy.
- No merge a main.
- No tocar produccion ni credenciales reales.
- No tocar SEO, Meta, LinkedIn, social-video, viraliza, billing, Chrome Web Store ni integraciones externas.
- No cambiar base de datos ni ejecutar migraciones.
- No migrar otros writes.
- No cambiar diseno ni textos.

Implementacion:
1. Crear rama encima de feature/admin-legacy-inventory-write-plan.
2. Leer `api/admin.js`, `api/_admin/router.js`, `tests/admin-router.test.js`, `ADMIN_LEGACY_ROUTE_INVENTORY.md` y `PLAN_PRIMER_LOTE_WRITE_INTERNO.md`.
3. Localizar `handleKpiSettings`.
4. Registrar `POST kpis/settings` en el router con el patron existente.
5. Mantener auth en `api/admin.js`.
6. Mantener el handler en `api/admin.js` si extraerlo aumenta el riesgo.
7. Conservar fallback para metodos no soportados.
8. No tocar `operations/releases` salvo documentacion.

Tests:
- Router encuentra `POST kpis/settings`.
- `GET kpis/settings` sigue funcionando.
- Body valido conserva payload.
- Body invalido conserva codigo/error.
- Error Supabase se sanea.
- No se exponen tokens/secrets.
- Recursos no migrados siguen en legacy.
- `node --test tests/admin-router.test.js`.
- `node --test tests/*.test.js`.
- `git diff --check`.

Commit:
Refactor admin KPI settings write routing
```
