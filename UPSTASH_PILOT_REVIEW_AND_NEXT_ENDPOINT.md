# Upstash Pilot Review and Next Endpoint

Fecha: 2026-05-25

## Resumen

El piloto de rate limiting durable con Upstash para `extension usage` ya esta integrado en `main` y se uso como patron para extender la proteccion a un segundo endpoint publico de bajo riesgo.

Estado actual:

- `POST /api/extension-version?resource=usage` sigue como referencia del patron.
- `POST /api/analytics/event` queda como segunda extension del patron durable.
- Ambos mantienen fallback a memoria si faltan variables Upstash o si Upstash falla.
- No se tocaron SEO write, Chrome, Meta, LinkedIn, Runway, Viraliza, checkout, Lemon Squeezy, billing, webhooks, cron ni jobs.

## Piloto extension usage

Evidencia previa:

- Status produccion: `200`
- Body: `{"ok":true,"accepted":true}`
- Headers `x-ratelimit-*` presentes.
- No se forzo `429` en produccion.
- No se expusieron secretos en la respuesta.

Pendiente manual:

- Confirmar en Upstash que los comandos suben.
- Confirmar en Vercel que no hay fallback durable inesperado.
- Confirmar que no aparecen secretos en logs.

## Analytics event implementado

Endpoint publico:

- `POST /api/analytics/event`

Endpoint interno real:

- `api/market-price?resource=owned-analytics-event`

Handler:

- `lib/analytics/ownedEvents.js`

Motivo de eleccion:

- Es publico.
- Recibe body.
- Es escritura local en Supabase.
- No llama APIs externas.
- No envia emails.
- No toca SEO write ni billing.
- No toca Chrome, Meta, LinkedIn, Runway ni Viraliza.
- Tiene tests de dominio existentes.

## Limite aplicado

- Scope: `owned_analytics_event`
- Default: `120/min`
- Ventana: `60s`
- Variables opcionales:
  - `ANALYTICS_EVENT_RATE_LIMIT_MAX`
  - `ANALYTICS_EVENT_RATE_LIMIT_WINDOW_MS`

## Key strategy

La identidad se compone con datos disponibles del request y payload, y se hashea dentro del helper durable:

- IP saneada.
- User-Agent truncado.
- `anonymous_session_id` saneado si existe.
- `page_path` saneado.

No se persisten en keys:

- IP cruda.
- `anonymous_session_id` crudo.
- URL completa.
- User-Agent completo.
- Tokens.
- Metadata cruda.

## Fallback

El segundo endpoint conserva la misma politica que `extension usage`:

1. Upstash configurado: usa REST `/pipeline`.
2. Sin variables Upstash: memoria.
3. Upstash falla: log saneado y memoria.
4. Nunca expone URL/token Upstash ni detalles internos.

## Tests

Tests nuevos:

- `analytics event rate limit falls back to memory and blocks before Supabase`
- `analytics event uses Upstash with hashed keys when configured`

Cobertura:

- Respuesta normal bajo limite.
- Bloqueo `429` estable al superar limite.
- Headers `x-ratelimit-*`.
- Fallback memoria sin env Upstash.
- Upstash mockeado sin llamadas reales.
- Supabase no se llama cuando el limite bloquea.
- Keys sin IP, session id, token, salt, user-agent ni path crudos.

## Riesgos pendientes

- Confirmar manualmente en Upstash que production usa durable y no fallback.
- Vigilar que el limite no degrade analytics legitima.
- Mantener `contact` y `waitlist/browser` fuera hasta observar volumen real de este segundo endpoint.

## Siguiente endpoint candidato

Siguiente candidato prudente:

- `POST /api/waitlist/browser`

Motivo:

- Es publico y recibe body.
- No toca billing ni SEO write.
- No llama APIs externas.
- Riesgo de spam mayor que analytics, pero menor que `contact` porque no envia email externo.

No elegir todavia:

- `POST /api/contact`, porque puede afectar leads reales y puede disparar notificaciones por email.
- `POST /api/photo-condition-analysis`, porque tiene coste OpenAI y requiere fase propia.
- Billing, webhooks, SEO write, Chrome, Meta, LinkedIn, Runway y Viraliza.

## Condicion antes de extender de nuevo

Antes de aplicar rate limiting durable a un tercer endpoint:

1. Revisar en Vercel errores `500`, latencia y fallback durable.
2. Revisar en Upstash consumo y formato de keys.
3. Hacer un smoke test suave de `analytics/event` sin forzar `429`.
4. Confirmar que no se degradan metricas legitimas.
