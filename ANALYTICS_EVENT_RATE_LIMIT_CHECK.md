# Analytics Event Rate Limit Check

Fecha: 2026-05-25

## Resumen

Se extendio el rate limiting durable/fallback a memoria al endpoint publico de analytics propio.

Endpoint real:

- Ruta publica: `POST /api/analytics/event`
- Rewrite Vercel: `api/market-price?resource=owned-analytics-event`
- Handler: `lib/analytics/ownedEvents.js`

No se tocaron `contact`, `waitlist/browser`, admin, SEO write, Chrome, Meta, LinkedIn, Runway, Viraliza, checkout, billing, webhooks, cron ni jobs.

## Limite aplicado

- Scope: `owned_analytics_event`
- Default: `120` eventos por minuto
- Ventana: `60` segundos
- Variables opcionales:
  - `ANALYTICS_EVENT_RATE_LIMIT_MAX`
  - `ANALYTICS_EVENT_RATE_LIMIT_WINDOW_MS`

## Key strategy

La identidad se pasa al helper durable y se hashea antes de persistir:

- IP saneada desde headers/proxy.
- User-Agent truncado.
- `anonymous_session_id` saneado si existe.
- `page_path` saneado.

No se guardan en keys:

- IP cruda.
- `anonymous_session_id` crudo.
- URL completa.
- User-Agent completo.
- Tokens.
- Metadata cruda.

El helper persistente conserva el formato tecnico:

```text
rl:v1:{environment}:owned_analytics_event:{identity_hash}
```

## Payload normal esperado

Mientras no se supera el limite, el payload normal no cambia:

```json
{
  "ok": true,
  "tracked": true,
  "reason": null
}
```

Si Supabase no esta configurado, se conserva el comportamiento existente:

```json
{
  "ok": true,
  "tracked": false,
  "reason": "supabase_not_configured"
}
```

Si Supabase falla, se conserva el comportamiento existente:

```json
{
  "ok": true,
  "tracked": false,
  "reason": "storage_error"
}
```

## Payload 429 esperado

Al superar el limite:

```json
{
  "ok": false,
  "error": "rate_limited",
  "retry_after_seconds": 60,
  "limit": 120,
  "window_seconds": 60
}
```

Headers esperados:

- `x-ratelimit-limit`
- `x-ratelimit-remaining`
- `x-ratelimit-reset`
- `retry-after` solo cuando bloquea

## Fallback

El comportamiento replica el piloto de `extension usage`:

1. Si `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` existen, intenta Upstash REST `/pipeline`.
2. Si faltan variables, usa memoria.
3. Si Upstash falla, registra error saneado y usa memoria.
4. No expone URL/token Upstash ni errores internos al cliente.

## Validacion recomendada en produccion

No hacer prueba agresiva ni forzar `429` sin autorizacion explicita.

Smoke test suave:

1. Hacer una llamada valida a `POST /api/analytics/event`.
2. Confirmar status `200`.
3. Confirmar payload normal.
4. Confirmar headers `x-ratelimit-*`.
5. Confirmar ausencia de secretos.
6. Revisar en Vercel que no hay errores `500`.
7. Revisar en Upstash que suben comandos y que las keys tienen formato hasheado.

Body sugerido:

```json
{
  "event_name": "page_view",
  "anonymous_session_id": "production-analytics-smoke-session",
  "page_path": "/datos",
  "source": "production_smoke"
}
```

## Tests locales

Tests añadidos:

- `analytics event rate limit falls back to memory and blocks before Supabase`
- `analytics event uses Upstash with hashed keys when configured`

Cobertura:

- Payload normal bajo limite.
- Fallback a memoria sin Upstash.
- Upstash mockeado.
- Bloqueo `429`.
- Headers rate limit.
- Supabase no se llama cuando bloquea.
- Keys sin IP cruda, session id crudo, token, salt ni page path crudo.

## Riesgos pendientes

- Confirmar en produccion que Upstash durable se usa realmente y no fallback memoria.
- Vigilar que el limite no degrade analytics legitima.
- No extender aun a `contact` ni `waitlist/browser` hasta observar el segundo endpoint.
