# Diseno rate limiting durable y observabilidad agregada

Fecha: 2026-05-25

## 1. Resumen ejecutivo

La capa actual ya cubre seguridad operacional inicial:

- Rate limiting en memoria para `POST /api/extension-usage`, implementado realmente en `api/extension-version.js?resource=usage`.
- CORS admin con allowlist/env.
- Logs de latencia no sensibles en `api/admin.js` y `api/extension-version.js`.
- Tests dedicados en `tests/security-operational.test.js`.

Actualizacion de piloto:

- Se implementa un piloto durable solo para `POST /api/extension-usage`.
- Se extiende despues el mismo patron a `POST /api/analytics/event`.
- Si `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` existen, el limite usa Upstash Redis via REST.
- Si faltan variables o Upstash falla, el flujo cae al rate limiting en memoria ya existente.
- No se cambia URL, payload normal, query params ni schema.
- No se toca SEO write, Chrome, Meta, LinkedIn, Runway, Viraliza, checkout, billing, webhooks, cron ni jobs.

La limitacion principal sigue siendo que el rate limit en memoria es por instancia serverless. Sirve como freno defensivo de bajo coste, pero no es global ni durable entre instancias.

Recomendacion:

1. Mantener memoria + logs como fallback.
2. Validar el piloto durable en `POST /api/extension-usage`.
3. Si el piloto es estable, extender primero a `POST /api/analytics/event`.
4. Despues evaluar `POST /api/waitlist/browser`.
5. Dejar `POST /api/contact` para una fase posterior para no bloquear leads reales ni notificaciones.
6. Usar Upstash Redis como opcion preferida para endpoints publicos de escritura si se aceptan nuevas credenciales.
7. Si no se aceptan nuevas credenciales, disenar una tabla Supabase + RPC atomica como segunda opcion, pero implementarla en fase separada con migracion revisada.
8. Usar Vercel WAF como capa perimetral complementaria si el plan/proyecto lo permite, especialmente para patrones por path/IP antes de llegar a la funcion.
9. No tocar todavia SEO write, Chrome, Meta, LinkedIn, Runway, Viraliza, checkout, billing, webhooks, cron ni jobs.

## 2. Fuentes revisadas

- [Upstash Rate Limit SDK](https://upstash.com/docs/redis/sdks/ratelimit-ts/overview): soporta timeout, analytics/dashboard, multi-region, multiples limites y tasas dinamicas.
- [Upstash Pricing](https://upstash.com/pricing): free tier con 500K comandos/mes, pay-as-you-go a USD 0.2 por 100K comandos, y planes fijos.
- [Vercel Redis](https://vercel.com/docs/redis): Vercel KV ya no esta disponible; los KV existentes migraron a Upstash Redis en diciembre de 2024 y los proyectos nuevos deben usar integraciones Redis del Marketplace.
- [Vercel WAF Rate Limiting](https://vercel.com/kb/guide/add-rate-limiting-vercel): permite reglas de rate limit sin redeploy y `@vercel/firewall` para condiciones de aplicacion.
- [Vercel Firewall Concepts](https://vercel.com/docs/vercel-firewall/firewall-concepts): WAF, rate limiting y fingerprints JA4 son opciones de proteccion perimetral.
- [Vercel Observability Usage](https://vercel.com/docs/manage-and-optimize-observability): observabilidad/log drains tienen coste y conviene filtrar por entorno y usar sampling.
- [Supabase Edge Function Rate Limiting](https://supabase.com/docs/guides/functions/examples/rate-limiting): la propia documentacion propone Redis/Upstash para operaciones atomicas de rate limiting en entornos serverless.

## 3. Opciones comparadas

| opcion | coste | complejidad | durabilidad | serverless | riesgo bloqueo legitimo | rollback | impacto extension | impacto backoffice | impacto SEO | impacto webhooks | recomendacion |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Upstash Redis | Bajo/medio, segun comandos. Free puede servir para inicio; payg escala por comando. | Media: nuevas env vars + SDK/REST + tests. | Alta, compartida entre instancias. | Muy buena; REST/HTTP encaja con serverless. | Medio si se eligen keys solo por IP. Mitigar con scope y limites suaves. | Facil: feature flag a memoria. | Bueno para `extension usage`; mantener limite suave. | Bueno si se limita por resource write, no global. | No aplicar agresivo a rutas SEO publicas. | No usar en webhooks hasta fixtures. | Preferida para fase 1 si se aceptan credenciales nuevas. |
| Supabase backing store | Coste marginal si ya hay Supabase, pero suma lecturas/escrituras. | Media/alta: tabla + RPC atomica + migracion. | Alta si RPC atomica esta bien disenada. | Correcta, pero cada request toca Postgres. | Medio; cuidado con locks/latencia. | Medio: requiere revertir helper y posiblemente dejar tabla. | Aceptable, pero mas latencia que Redis. | Aceptable para admin write suave. | Evitar para sitemap/seo-page. | No tocar webhooks todavia. | Segunda opcion si se quiere evitar nuevo proveedor. |
| Vercel Redis / Marketplace | Similar a Upstash, porque Vercel KV ya no es producto nuevo. | Media, integrada con Vercel. | Alta. | Buena. | Medio. | Facil si queda detras de flag. | Bueno. | Bueno. | No aplicar a SEO publico salvo abuso claro. | No tocar. | Equivale a Redis Marketplace; validar proveedor real del proyecto. |
| Vercel WAF rate limiting | Depende de plan/uso; puede incluir limites y despues coste. | Baja/media via dashboard; media con SDK. | Alta en borde/perimetro. | Excelente: bloquea antes de funcion cuando es regla WAF. | Medio/alto si regla por path/IP es agresiva. | Facil desde dashboard. | Bueno para bursts anonimos. | Cuidado con admin si IP compartida. | Mejor para abuso global, no para crawlers legitimos. | No usar sin validar proveedor. | Complementaria; ideal contra abuso volumetrico simple. |
| Middleware propio con tabla `rate_limits` | Coste Supabase; sin proveedor nuevo. | Alta si se quiere bien: migracion, RPC, limpieza, indices. | Alta. | Correcta pero no tan rapida como Redis. | Medio. | Medio. | Aceptable. | Aceptable. | Evitar SEO publico. | No tocar. | Viable si se asume migracion controlada. |
| Memoria + logs actual | Sin coste externo. | Baja, ya implementado. | Baja: por instancia. | Limitada. | Bajo por limite suave. | Ya existe. | Bueno como fallback. | Bueno como fallback/logging. | Sin impacto. | Sin impacto. | Mantener como fallback temporal, no vender como durable. |

## 4. Decision recomendada

Opcion preferida:

- Upstash Redis o Redis Marketplace en Vercel como store durable de rate limit.

Motivos:

- Redis esta optimizado para incrementos atomicos y expiraciones.
- Encaja mejor con serverless que una tabla Postgres para contadores de alta frecuencia.
- Permite rollback sencillo con feature flag.
- Upstash ya ofrece SDK de rate limiting con timeout y modo fail-open.
- El coste inicial deberia ser bajo para el volumen esperado, pero debe confirmarse antes de contratar.

Opcion sin nuevas credenciales:

- Mantener memoria + logs y preparar diseno de tabla Supabase, sin implementarlo hasta aprobar migracion.

No recomendado ahora:

- Entrar en SEO write, billing, webhooks o integraciones externas.
- Aplicar limites agresivos a `sitemap`, `seo-page` o rutas publicas SEO indexables.
- Rate limiting global de `/api/admin` por IP sin distinguir resources, porque puede bloquear backoffice legitimo.

## 5. Endpoints candidatos y limites recomendados

| endpoint | metodo | tipo | prioridad | limite inicial recomendado | ventana | key primaria | key secundaria | accion 429 | notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/api/extension-usage` | POST | publico escritura | 1 | 120/min | 60s | IP hash + scope | extension user/session hash si existe | payload actual `rate_limited` | Migrar el limite en memoria a durable sin cambiar payload. |
| `/api/analytics/event` | POST | publico escritura | 1 | 120/min | 60s | IP hash + anonymous session hash | page path hash | 429 estable | Implementado como segunda extension del patron durable. Cuidado con no bloquear analytics legitima de usuarios reales. |
| `/api/waitlist/browser` | POST | publico escritura | 2 | 10/10min + 30/dia | 10m/24h | IP hash + email hash | browser + source | 429 estable | Siguiente candidato si analytics/event queda estable. |
| `/api/contact` | POST | publico escritura/email | 3 | 5/10min + 20/dia | 10m/24h | IP hash + normalized email hash | user-agent hash | 429 estable | No abordar primero: puede bloquear leads reales y disparar email externo. No guardar email crudo en rate key. |
| `/api/photo-condition-analysis` | POST | publico coste alto | 2 | 10/h + 30/dia | 1h/24h | IP hash + listing/url hash | premium/subscription hash si aplica | 429 estable | Revisar rate limit existente y coste OpenAI antes de tocar. |
| `/api/check-premium` | GET/POST | publico lectura sensible | 3 | 30/min | 60s | IP hash + email hash | none | 429 estable | Evita enumeracion suave. Cuidar UX premium. |
| `/api/saved-properties/email-report` | POST | publico/premium email | 3 | conservar limite diario actual + 10/h | 1h/24h | email hash + subscription hash | IP hash | 429 estable | No cambiar sin fixtures de email. |
| `/api/admin?resource=kpis/settings` | POST | admin write local | 4 | 30/min por token/admin | 60s | admin token hash + resource | IP hash | 429 estable | Solo si hay abuso real; no bloquear uso normal. |
| `/api/admin?resource=operations/releases` | POST | admin write local | 4 | 20/min por token/admin | 60s | admin token hash + resource | IP hash | 429 estable | Mantener operations/chrome fuera. |
| `/api/sitemap` | GET | publico SEO | no ahora | sin limite app-level | n/a | n/a | n/a | n/a | Evitar dano a indexacion. Usar WAF solo contra abuso extremo. |
| `/api/seo-page` | GET | publico SEO | no ahora | sin limite app-level | n/a | n/a | n/a | n/a | Evitar bloquear crawlers legitimos. |
| `/api/lemonsqueezy-webhook` | POST | webhook billing | no ahora | no tocar | n/a | firma proveedor | n/a | n/a | Requiere fixtures y contrato especifico. |
| `/api/lemonsqueezy-checkout` | GET/POST | billing externo | no ahora | no tocar | n/a | n/a | n/a | n/a | Fase billing dedicada. |
| `seo-autogenerate/run`, cron SEO | GET/POST | admin/cron critico | no ahora | no tocar | n/a | cron/admin token hash | n/a | n/a | Fase SEO/cron con rollback. |
| `operations/chrome`, Meta, LinkedIn, Runway, Viraliza | mixto | integraciones | no ahora | no tocar | n/a | n/a | n/a | n/a | Mantener excluidos. |

## 6. Key strategy

Principios:

- No guardar IP cruda.
- No guardar emails crudos.
- No guardar tokens, Authorization, cookies ni secrets.
- La key debe ser estable para una ventana, pero no reversible.
- Separar por endpoint/scope para no mezclar trafico legitimo.

Formato recomendado:

```text
rl:v1:{environment}:{scope}:{identity_hash}:{window_id}
```

Ejemplos de `scope`:

- `extension_usage`
- `contact_form`
- `browser_waitlist`
- `owned_analytics_event`
- `photo_condition_analysis`

Identidad recomendada por endpoint:

- Publico anonimo: `sha256(ip + user_agent_family + salt)`.
- Extension usage: `sha256(ip + extension_client_hash/session_hash si existe + salt)`.
- Formularios con email: `sha256(normalized_email + salt)` como complemento, nunca email plano.
- Admin: `sha256(admin_token_fingerprint + resource + salt)` solo si se limita admin write.
- Webhooks: no usar todavia; cuando se haga, basar en firma valida y proveedor, no IP.

Salt:

- Usar `RATE_LIMIT_HASH_SALT`.
- Si no existe, fallar a hash sin salt solo en desarrollo/test; en produccion exigir salt o documentar riesgo.

## 7. IP y proxy headers

Orden recomendado:

1. `x-forwarded-for`, primer valor.
2. `x-real-ip`.
3. `x-vercel-forwarded-for`.
4. `req.socket.remoteAddress`.

Reglas:

- En Vercel, los headers de proxy son esperables, pero aun asi deben sanearse.
- Truncar longitud maxima.
- Aceptar solo caracteres esperados para IP.
- No loguear la IP final.
- Hashear antes de persistir.
- Para WAF/Vercel, evaluar `x-vercel-ja4-digest` como senal complementaria, nunca como unico identificador del producto.

## 8. Privacidad y retencion

Datos permitidos:

- Hashes de identidad.
- Scope/endpoint.
- Contador.
- Timestamp de ventana.
- Status allow/block.
- Duracion agregada por endpoint.

Datos prohibidos:

- IP cruda.
- Email crudo.
- Authorization.
- Cookies.
- Body completo.
- Matriculas, direccion exacta o datos personales.
- Tokens de Supabase, Lemon, Meta, LinkedIn, Chrome, Runway.

Retencion recomendada:

- Rate limit counters: TTL automatico por ventana, maximo 24-48h para limites diarios.
- Observabilidad agregada: 7-30 dias para latencia/status por endpoint, sin PII.
- Logs crudos: mantener minimo necesario; usar sampling y filtrado por entorno.

## 9. Payload 429

Mantener el payload ya introducido:

```json
{
  "ok": false,
  "error": "rate_limited",
  "retry_after_seconds": 60,
  "limit": 120,
  "window_seconds": 60
}
```

Headers:

- `x-ratelimit-limit`
- `x-ratelimit-remaining`
- `x-ratelimit-reset`
- `retry-after` cuando bloquea

No incluir:

- Identificador del usuario.
- IP.
- Hash.
- Store/backend usado.
- Detalles internos.

## 10. Bypass y modos especiales

No crear bypass amplio por defecto.

Permitido solo con reglas estrictas:

- Admin token: no bypass global; si se aplica, solo limites mas altos para resources admin read/write internos.
- Cron token: no tocar en esta fase.
- Webhooks: no tocar; fase dedicada con firma valida.
- Preview deployments: limites mas bajos o store separado por `VERCEL_ENV`.
- Tests: helper con store mock o namespace test.
- Fail-open: para endpoints no criticos, si Redis/Supabase rate limit falla, permitir request y loguear error saneado.
- Fail-closed: solo para endpoints de coste alto cuando exista decision explicita.

## 11. Estrategia para previews

Namespace:

```text
{environment} = production | preview | development | test
```

Previews:

- Usar prefijo `preview:{VERCEL_GIT_COMMIT_REF || VERCEL_URL}` si el store es compartido.
- Limites mas permisivos para QA manual de backoffice.
- No aplicar limites a rutas SEO publicas en preview salvo abuso evidente.
- Logs agregados con sampling para no aumentar coste.

## 12. Observabilidad agregada

Objetivo:

- Saber que endpoints reciben bursts.
- Medir 429 por endpoint.
- Medir latencia p50/p95 aproximada por endpoint.
- Detectar errores sin exponer secretos ni payloads.

Opcion A: logs estructurados actuales + agregacion externa

- Mantener `request_complete`.
- Agregar `rate_limit_decision` solo cuando hay bloqueo o sampling.
- Usar Vercel logs/observability o log drain si ya existe.
- Cuidado: Vercel Observability y log drains pueden tener coste por evento; filtrar por production y aplicar sampling.

Opcion B: tabla Supabase `request_metrics_rollups`

- Solo agregados por minuto/hora.
- Columnas conceptuales:
  - `bucket_start`
  - `route`
  - `resource`
  - `method`
  - `status_class`
  - `count`
  - `blocked_count`
  - `duration_ms_sum`
  - `duration_ms_max`
- Requiere schema/migracion; no implementar ahora.

Opcion C: Upstash counters

- `metrics:{env}:{route}:{minute}` con TTL 7-14 dias.
- Barato si volumen bajo, pero suma comandos adicionales.
- Evitar registrar cada request si no aporta; usar sampling.

Recomendacion:

- Primera fase durable: solo rate limit durable + evento/log cuando bloquea.
- Segunda fase: rollups agregados por minuto para endpoints candidatos.

## 13. Tests necesarios

Unitarios del store:

- Incrementa contador atomico.
- Respeta TTL/window.
- Devuelve allowed antes del limite.
- Devuelve blocked al superar limite.
- Calcula `retry_after_seconds`.
- No guarda IP/email/token crudos.
- Fail-open cuando store no responde, si esa es la politica.

Integracion por endpoint:

- `POST /api/extension-usage` mantiene 200 antes del limite y 429 despues.
- `/api/contact` mantiene payload actual antes del limite.
- `/api/waitlist/browser` mantiene payload actual antes del limite.
- `/api/analytics/event` no rompe analytics legitima.
- `OPTIONS` no consume limite.
- `GET` publico de SEO no queda limitado accidentalmente.
- Admin write legacy no queda bloqueado por wildcard.

Seguridad:

- No secretos en errores.
- No Authorization en logs.
- No email/IP crudos en store mock.
- No bypass por header arbitrario.

Regresion:

- `node --test tests/security-operational.test.js`
- `node --test tests/extension-usage.test.js`
- `node --test tests/admin-router.test.js`
- `node --test tests/seo.test.js`
- `node --test tests/*.test.js`

## 14. Plan de implementacion por fases

### Fase 1: abstraction store + Upstash opcional

Objetivo:

- Crear helper durable para rate limiting.
- Mantener memoria como fallback.
- Anadir store Upstash solo si existen env vars.
- No exigir credenciales en local/test.
- Migrar solo `extension usage` al helper durable con fallback memoria.
- No hacer llamadas reales a Upstash en tests.

Archivos posibles:

- `lib/security/rate-limit.js`
- `lib/security/durable-rate-limit.js`
- `tests/security-rate-limit-store.test.js`
- `tests/security-operational.test.js`

Sin tocar:

- SEO write.
- Billing.
- Webhooks.
- Integraciones.

Variables de activacion:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Desactivacion:

- Quitar cualquiera de esas dos variables para volver a memoria.
- Si Upstash devuelve error, timeout o respuesta invalida, el helper cae automaticamente a memoria y registra un aviso saneado.

### Fase 2: endpoints publicos escritura de bajo riesgo

Estado:

- `POST /api/analytics/event` implementado como segunda extension del patron durable.

Pendientes:

- `/api/waitlist/browser`
- `/api/contact`, solo tras definir limite que no bloquee leads reales

Reglas:

- No cambiar payloads salvo 429.
- No tocar emails externos salvo que ya se ejecutaban.
- No guardar PII cruda.

### Fase 3: endpoint de coste alto

Cubrir:

- `/api/photo-condition-analysis`

Requisitos:

- Revisar rate limit existente.
- Definir coste maximo por IP/listing.
- Tests de OpenAI no llamado cuando bloquea.

### Fase 4: observabilidad agregada

Opciones:

- Rollups Supabase.
- Contadores Upstash.
- Vercel Observability/log drain con sampling.

No implementar hasta tener claridad de coste y retencion.

### Fase 5: dominios sensibles

Solo con fixtures:

- Billing/checkout.
- Webhooks.
- SEO write/cron.
- Chrome/Meta/LinkedIn/Runway/Viraliza.

## 15. Prompt recomendado para implementar primera fase

```text
Nombre del chat/tarea:
Implementacion rate limiting durable fase 1 - extension usage InmoRadar

Contexto:
Ya existe rate limiting en memoria para `POST /api/extension-usage` y un diseno en `DURABLE_RATE_LIMIT_OBSERVABILITY_DESIGN.md`.

Objetivo:
Crear una abstraccion de store durable para rate limiting y migrar solo `extension usage` para usar Upstash Redis si hay env vars configuradas, manteniendo fallback memoria sin nuevas credenciales obligatorias.

Reglas:
- No tocar SEO write.
- No tocar generation/publish/noindex/archive/regenerate.
- No tocar operations/chrome ni Chrome Web Store.
- No tocar Meta, LinkedIn, Runway, Viraliza.
- No tocar checkout, Lemon Squeezy, billing ni webhooks.
- No tocar cron ni jobs.
- No cambiar URLs.
- No cambiar payloads salvo conservar 429 existente.
- No guardar IP/email/token crudos.
- No loguear Authorization, cookies ni body.

Implementacion:
1. Crear interfaz interna de store:
   - memory store actual;
   - optional Upstash store si `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` existen.
2. Mantener fail-open configurable:
   - default allow si store durable falla;
   - log saneado `rate_limit_store_error`.
3. Mantener headers actuales:
   - x-ratelimit-limit;
   - x-ratelimit-remaining;
   - x-ratelimit-reset;
   - retry-after si bloquea.
4. Tests:
   - memory store;
   - mock Upstash store;
   - no credenciales requeridas en test;
   - blocked devuelve payload actual;
   - store caido no rompe endpoint;
   - no PII cruda en keys.
5. Verificacion:
   - node --check en archivos tocados;
   - node --test tests/security-operational.test.js;
   - node --test tests/extension-usage.test.js;
   - node --test tests/*.test.js;
   - git diff --check.

Entrega:
- Rama usada.
- Archivos modificados.
- Confirmacion de que solo se toco extension usage/rate limit.
- Tests y resultado.
- Limitaciones pendientes.
```

## 16. Decision final

No implementar todavia sin aprobar una de estas dos rutas:

1. Upstash/Redis Marketplace: mejor opcion tecnica para rate limiting durable serverless.
2. Supabase RPC/table: viable si se evita nuevo proveedor, pero requiere migracion y cuidado con latencia/locks.

Mientras tanto, mantener memoria + logs como defensa inicial y usar los resultados de PR #11 para observar volumen real antes de endurecer limites.

## 17. Analytics event como segunda extension durable

Estado:

- `POST /api/analytics/event` queda protegido con el mismo helper durable que `extension usage`.
- Ruta real: `api/market-price?resource=owned-analytics-event`.
- Handler: `lib/analytics/ownedEvents.js`.
- Scope: `owned_analytics_event`.
- Limite default: `120/min`.
- Ventana default: `60s`.
- Variables opcionales:
  - `ANALYTICS_EVENT_RATE_LIMIT_MAX`
  - `ANALYTICS_EVENT_RATE_LIMIT_WINDOW_MS`

Key strategy:

- IP saneada.
- User-Agent truncado.
- `anonymous_session_id` saneado si existe.
- `page_path` saneado.
- Todo se hashea dentro de `durable-rate-limit`.

Fallback:

- Upstash si `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` existen.
- Memoria si faltan variables.
- Memoria con log saneado si Upstash falla.

Riesgos pendientes:

- Confirmar en produccion que no hay fallback durable inesperado.
- Vigilar que el limite no degrade analytics legitima.
- No extender todavia a `contact` hasta observar este segundo endpoint.
