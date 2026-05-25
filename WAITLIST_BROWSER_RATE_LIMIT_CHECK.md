# Waitlist Browser Rate Limit Check

## Resumen

Se anade rate limiting durable/fallback al endpoint publico de waitlist de navegadores.

- Ruta publica: `POST /api/waitlist/browser`
- Rewrite real: `api/market-price?resource=browser-waitlist`
- Handler real: `browserWaitlistPayload()` en `lib/browser-waitlist.js`
- Helper: `lib/security/durable-rate-limit.js`
- Scope: `browser_waitlist`

No se anaden endpoints nuevos ni se modifica el payload funcional de exito. La unica respuesta nueva esperada es `429` cuando se supera el limite.

## Limite inicial

- Default: `10` requests por minuto por identidad
- Ventana: `60_000 ms`
- Variables opcionales:
  - `WAITLIST_BROWSER_RATE_LIMIT_MAX`
  - `WAITLIST_BROWSER_RATE_LIMIT_WINDOW_MS`

El limite es deliberadamente mas bajo que analytics porque waitlist es un flujo de lead y no un endpoint de eventos de alta frecuencia. Si aparecen `429` legitimos en produccion, la primera mitigacion recomendada es subir temporalmente a `20/min` antes de endurecer mas.

## Estrategia de identidad

La identidad primaria se calcula con:

- IP saneada desde headers/proxy.
- User-Agent truncado.
- Email normalizado con `trim + lowercase`.
- `anonymous_session_id` si existe.
- `anonymous_install_id` si existe.

El material de identidad se entrega al helper durable y se persiste solo como hash. No se guardan en la key:

- IP cruda.
- Email en claro.
- User-Agent completo.
- Session/install id en claro.

## Campos excluidos de la key

No forman parte de la identidad primaria porque son controlables por cliente y podrian fragmentar buckets:

- `page`
- `page_path`
- URL
- `referrer`
- `utm.campaign`
- campaign/source arbitrarios

Estos campos pueden seguir formando parte del lead guardado, pero no abren buckets nuevos.

## Fallback

Si faltan `UPSTASH_REDIS_REST_URL` o `UPSTASH_REDIS_REST_TOKEN`, o si Upstash falla, el endpoint cae al limiter en memoria existente.

Limitacion: el fallback en memoria es defensivo por instancia serverless y no global/durable.

## Payload 429

Respuesta esperada al superar limite:

```json
{
  "ok": false,
  "error": "rate_limited"
}
```

El payload puede incluir campos operativos ya usados por el helper, como `retry_after_seconds`, `limit` y `window_seconds`. Las respuestas normales conservan el contrato existente.

## Checklist post-deploy

1. Confirmar que produccion esta en el commit mergeado o posterior.
2. Enviar un lead valido a `POST /api/waitlist/browser`.
3. Confirmar `200` y payload funcional sin cambios.
4. Confirmar headers:
   - `x-ratelimit-limit`
   - `x-ratelimit-remaining`
   - `x-ratelimit-reset`
5. Enviar dos requests suaves con mismo email variando `page`, `referrer` o campaign.
6. Confirmar que `x-ratelimit-remaining` baja y no se reinicia.
7. Enviar otro request con email distinto.
8. Confirmar bucket separado.
9. Revisar logs:
   - sin email en claro en logs de rate limit;
   - sin IP cruda;
   - sin User-Agent completo;
   - sin secretos;
   - sin fallback memory inesperado si Upstash esta configurado.
10. No forzar 429 con rafagas agresivas en produccion.

## Riesgos residuales

- Usuarios detras de la misma NAT pueden compartir bucket si reutilizan email o no aportan identificadores anonimos.
- Emails con alias distintos (`+tag`) separan bucket porque se consideran leads distintos.
- Si Upstash no esta configurado en un entorno, la proteccion vuelve al fallback no durable.
