# Seguridad operacional: rate limiting, CORS y observabilidad

Fecha: 2026-05-25

## 1. Resumen ejecutivo

Esta fase aplica una mejora de seguridad operacional de bajo riesgo tras el merge de admin router/handlers.

Cambios implementados:

- Helper de rate limiting en memoria en `lib/security/rate-limit.js`.
- Rate limit defensivo para `POST /api/extension-usage` via `api/extension-version.js?resource=usage`.
- Piloto durable opcional para el mismo flujo mediante `lib/security/durable-rate-limit.js`.
- Rate limit durable/fallback para `POST /api/analytics/event` via `api/market-price?resource=owned-analytics-event`.
- CORS admin mas estricto para `api/admin.js`, con allowlist de origen.
- Helper de observabilidad no sensible en `lib/observability/request-metrics.js`.
- Logs de latencia no sensibles en `api/admin.js` y `api/extension-version.js`.
- Tests de CORS, rate limit y saneado de logs.

Cambios no implementados:

- No se anadio proveedor nuevo ni credenciales nuevas en codigo; se reutiliza el helper durable existente.
- No se modificaron SEO write, Chrome Web Store, Meta, LinkedIn, Runway, Viraliza, checkout, billing, webhooks, cron ni jobs.
- No se cambiaron URLs ni payloads normales; solo aparece el error `429 rate_limited` cuando `extension/usage` o `analytics/event` superan el limite.

## 2. Limitaciones importantes

El rate limit base es en memoria y por instancia serverless. Reduce abusos basicos y bursts por instancia, pero no debe presentarse como rate limiting global/durable.

El piloto durable para `extension usage` usa Upstash Redis solo si existen:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Si faltan variables o Upstash falla, el helper cae automaticamente al rate limit en memoria. No se exponen URL/token ni errores internos al cliente.

Para una proteccion global se recomienda una fase posterior con almacenamiento compartido, por ejemplo Supabase, Upstash o una capa edge/Vercel dedicada.

## 3. Inventario de endpoints

| endpoint | metodo | publico/admin/interno | requiere token/auth | escritura | riesgo abuso | riesgo coste | riesgo spam | riesgo integracion externa | rate limit recomendado | CORS recomendado | observabilidad recomendada | implementar ahora |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/api/admin` | GET/POST/OPTIONS | admin | si | mixto | medio | medio | bajo | alto por recursos legacy | no agresivo; fase futura por resource write | allowlist admin | si, sin body ni secretos | si, CORS + logs |
| `/api/extension-usage` | POST | publico extension | no | si | medio | bajo | bajo | no | 120/min por IP por instancia | publico compatible | si, sin IDs crudos | si, rate limit + logs |
| `/api/extension-version` | GET | publico | no | no | bajo | bajo | bajo | no | no necesario ahora | publico | si | si, logs |
| `/api/contact` | POST | publico | no | si | medio | bajo | alto | email opcional | fase futura | publico | si | no, documentado |
| `/api/waitlist/browser` | POST | publico | no | si | medio | bajo | medio | no | fase futura | publico | si | no, documentado |
| `/api/analytics/event` | POST | publico | no | si | medio | bajo | bajo | no | 120/min por identidad anonima + IP hash | publico | si | si, rate limit durable/fallback |
| `/api/photo-condition-analysis` | POST | publico | no | si/cache | alto | alto | bajo | OpenAI | revisar rate limit existente antes de tocar | publico | si | no, documentado |
| `/api/saved-properties/email-report` | POST | publico premium | email/subscripcion | si | medio | medio | alto | Cloudflare Email | ya tiene limite diario por email; durable futuro | publico | si | no, dominio email |
| `/api/check-premium` | GET/POST | publico | email | no/lectura | medio | bajo | bajo | no | fase futura si hay abuso | publico | si | no |
| `/api/lemonsqueezy-checkout` | GET/POST | publico billing | email/token segun modo | si | alto | medio | medio | Lemon Squeezy | fase billing dedicada | publico controlado | si | no, excluido |
| `/api/lemonsqueezy-webhook` | POST | webhook | firma Lemon | si | alto | bajo | no | Lemon Squeezy | no cambiar sin fixtures | no depende de navegador | si, proveedor saneado | no, excluido |
| `/api/sitemap` | GET | publico SEO | no | no | bajo | medio | no | no | no aplicar agresivo | publico | opcional | no |
| `/api/seo-page` | GET | publico SEO | no | no | medio | medio | no | no | no aplicar agresivo | publico | opcional | no |
| `/api/admin?resource=seo-autogenerate/run` | GET/POST | admin/cron | admin o cron | si | alto | alto | no | SEO generation/publication | fase SEO dedicada | admin/cron | si, con contrato | no, excluido |
| `/api/cron/seo-publish` | GET/POST | interno cron | cron/admin | si | alto | alto | no | SEO generation/publication | no tocar sin fase cron | no navegador | si | no, excluido |
| `/api/admin?resource=operations/chrome` | POST | admin | si | si | alto | alto | no | Chrome Web Store | no tocar | admin | si | no, excluido |
| `/api/admin?resource=meta/*` | GET/POST | admin | si | mixto | alto | medio | alto | Meta | no tocar | admin | si | no, excluido |
| `/api/admin?resource=linkedin/*` | GET/POST | admin | si | mixto | alto | medio | alto | LinkedIn | no tocar | admin | si | no, excluido |
| `/api/admin?resource=social-video/*` | GET/POST | admin | si | mixto | alto | alto | bajo | Runway | no tocar | admin | si | no, excluido |
| `/api/admin?resource=viraliza/*` | GET/POST | admin | si | mixto | medio | medio | medio | social/manual | no tocar | admin | si | no, excluido |

## 4. Rate limiting implementado

Archivo:

- `lib/security/rate-limit.js`

Endpoint cubierto:

- `POST /api/extension-usage`
- Internamente: `api/extension-version.js?resource=usage`

Configuracion:

- `EXTENSION_USAGE_RATE_LIMIT_MAX`, default `120`.
- `EXTENSION_USAGE_RATE_LIMIT_WINDOW_MS`, default `60000`.
- `ANALYTICS_EVENT_RATE_LIMIT_MAX`, default `120`.
- `ANALYTICS_EVENT_RATE_LIMIT_WINDOW_MS`, default `60000`.
- `UPSTASH_REDIS_REST_URL`, opcional para piloto durable.
- `UPSTASH_REDIS_REST_TOKEN`, opcional para piloto durable.

Fallback:

- Sin variables Upstash: memoria.
- Error/timeout/respuesta invalida de Upstash: memoria + log saneado.
- El payload normal de `extension usage` no cambia.
- El payload normal de `analytics/event` no cambia.
- El payload `429` se mantiene estable.

Respuesta nueva ante abuso:

```json
{
  "ok": false,
  "error": "rate_limited",
  "retry_after_seconds": 60,
  "limit": 120,
  "window_seconds": 60
}
```

Cabeceras:

- `x-ratelimit-limit`
- `x-ratelimit-remaining`
- `x-ratelimit-reset`
- `retry-after` solo cuando bloquea

## 5. CORS implementado

Archivo:

- `api/_utils.js`

Cambios:

- `handleCors(req, res, { policy: "admin" })` permite CORS admin solo para origenes permitidos.
- Origenes admin por defecto:
  - `https://inmoradar.app`
  - `https://www.inmoradar.app`
  - `VERCEL_URL`
  - `VERCEL_BRANCH_URL`
  - `ADMIN_CORS_ORIGINS` o `CORS_ALLOWED_ORIGINS`
  - localhost en entornos no produccion
- El CORS publico mantiene compatibilidad con `*`.

Aplicado ahora:

- `api/admin.js`

No aplicado ahora:

- billing, webhooks, cron, SEO write e integraciones externas.

## 6. Observabilidad implementada

Archivo:

- `lib/observability/request-metrics.js`

Aplicado en:

- `api/admin.js`
- `api/extension-version.js`

Campos registrados:

- `request_id`
- `route`
- `resource`
- `action`
- `method`
- `status`
- `duration_ms`
- `error`

No registra:

- `Authorization`
- cookies
- body completo
- emails
- tokens
- secretos
- passwords
- datos personales

Los logs se emiten cuando:

- `REQUEST_METRICS_ENABLED=1`, o
- existe `VERCEL`, o
- `NODE_ENV=production`

Se pueden apagar con:

- `REQUEST_METRICS_DISABLED=1`

## 7. Tests añadidos

Archivo:

- `tests/security-operational.test.js`

Cobertura:

- CORS admin permite origen de produccion.
- CORS admin no concede acceso a origen desconocido.
- Rate limit permite la primera llamada y bloquea overflow.
- Payload 429 estable.
- Logs/métricas no incluyen tokens ni Authorization.

## 8. Riesgos pendientes

- Rate limit no es durable/global.
- Contact y waitlist siguen sin limitador comun en esta fase.
- Analytics event ya esta cubierto, pero debe observarse antes de extender a un tercer endpoint.
- Photo condition analysis debe revisarse en una fase propia por coste OpenAI.
- Billing, checkout, webhooks y portal necesitan fixtures antes de endurecer.
- SEO write, cron y autogeneracion siguen fuera.
- Meta, LinkedIn, Chrome Web Store, Runway y Viraliza siguen fuera.

## 9. Siguiente fase recomendada

Prompt recomendado:

```text
Nombre del chat/tarea:
Extender rate limiting durable a endpoints publicos de escritura InmoRadar

Objetivo:
Extender el piloto durable validado de extension usage a endpoints publicos de escritura de bajo riesgo usando la misma estrategia de privacidad, fallback y tests, sin tocar SEO write, billing, Chrome, Meta, LinkedIn, Runway, Viraliza ni webhooks.

Prioridad:
1. /api/analytics/event
2. /api/waitlist/browser
3. /api/contact, solo cuando se defina un limite que no bloquee leads reales
4. /api/photo-condition-analysis, solo con analisis de coste y fixtures
5. Mantener /api/extension-usage como referencia del patron durable

Reglas:
- No cambiar URLs ni payloads salvo 429 documentado.
- No exponer tokens.
- No guardar IPs crudas; hashear identidades.
- Tests de limite permitido, bloqueo, reset, CORS y logs saneados.
```

## 10. Analytics event como segunda extension durable

Estado:

- `POST /api/analytics/event` queda cubierto por rate limiting durable/fallback.
- Ruta real: `api/market-price?resource=owned-analytics-event`.
- Handler: `lib/analytics/ownedEvents.js`.
- Scope: `owned_analytics_event`.
- Limite default: `120/min`.
- Ventana default: `60s`.

Key strategy:

- IP saneada.
- User-Agent truncado.
- `anonymous_session_id` saneado si existe.
- `page_path` saneado.
- Todo se hashea antes de persistir en Upstash.

Fallback:

- Usa Upstash si las variables estan configuradas.
- Usa memoria si faltan variables.
- Usa memoria con log saneado si Upstash falla.

Siguiente candidato:

- `POST /api/waitlist/browser`, despues de observar `analytics/event`.

No extender todavia a:

- `POST /api/contact`, por riesgo de bloquear leads reales y porque puede disparar email externo.
- `POST /api/photo-condition-analysis`, por coste OpenAI.
- SEO write, Chrome, Meta, LinkedIn, Runway, Viraliza, billing, webhooks, cron ni jobs.
