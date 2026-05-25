# Upstash Rate Limit Production Check

Fecha: 2026-05-25

## Resumen

La PR #13, `Durable rate limiting pilot for extension usage`, fue mergeada a `main` y se ejecutó un smoke test limitado en producción únicamente contra `extension usage`.

No se añadieron funcionalidades, no se tocó runtime adicional y no se ejecutaron endpoints sensibles.

## PR mergeada

- PR: https://github.com/dontorido/inmoradar-web/pull/13
- Rama origen: `feature/upstash-rate-limit-extension-usage`
- Merge commit en `main`: `8c93109614f75f3980915776e71340534030d7a0`
- Commit runtime incluido: `92ac48a Add durable rate limiting pilot for extension usage`
- Commit documental incluido: `192633c Document Upstash rate limit preview check`

## Deploy producción

- Commit verificado: `8c93109614f75f3980915776e71340534030d7a0`
- Estado Vercel reportado por GitHub: success
- Target Vercel: `https://vercel.com/sergio-s-projects15/inmoradar-web/CViGh6nRLqJ9DYu1RaAHKEKfyfLH`

## Endpoint probado

- Método: `POST`
- URL: `https://www.inmoradar.app/api/extension-version?resource=usage`

Body usado:

```json
{
  "event_name": "heartbeat",
  "anonymous_install_id": "production-smoke-install",
  "session_id": "production-smoke-session",
  "extension_version": "1.0.10"
}
```

## Resultado HTTP

- Status: `200`
- Content-Type: `application/json; charset=utf-8`
- Body:

```json
{
  "ok": true,
  "accepted": true
}
```

## Headers rate limit observados

- `x-ratelimit-limit`: `120`
- `x-ratelimit-remaining`: `118`
- `x-ratelimit-reset`: `2026-05-25T12:22:37.850Z`
- `retry-after`: no presente

No se forzó `429` para evitar una prueba agresiva en producción y no contaminar innecesariamente métricas de uso.

## Modo durable

La respuesta confirma que el rate limiter está activo y devuelve headers de límite. Desde la respuesta pública no se puede inferir de forma concluyente si el backing usado fue Upstash durable o fallback en memoria, porque ese detalle no se expone al cliente por diseño.

Para confirmar durable sin exponer secretos, revisar en Vercel/Upstash:

1. Que `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` están configuradas en Production.
2. Que no aparecen logs saneados de fallback tipo `[rate-limit] durable fallback`.
3. Que el contador de comandos de Upstash aumenta durante llamadas a `resource=usage`.

## Secretos

No se imprimieron ni registraron valores reales de:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

La respuesta de producción no expuso tokens, URLs internas de Upstash ni secretos.

## Integraciones sensibles

Durante el merge y smoke test no se tocaron ni ejecutaron:

- SEO write, generación SEO ni publicación SEO;
- `operations/chrome` ni Chrome Web Store;
- Meta/Facebook/Instagram;
- LinkedIn;
- Runway/social-video;
- Viraliza;
- checkout, Lemon Squeezy, billing ni webhooks;
- cron ni jobs.

## Logs

No se pegaron logs con secretos en este repositorio. La revisión de logs runtime desde la UI autenticada de Vercel queda como comprobación manual recomendada antes de ampliar el piloto a más endpoints.

Checklist manual recomendado:

- Confirmar ausencia de `UPSTASH_REDIS_REST_TOKEN`.
- Confirmar ausencia de URL completa de `UPSTASH_REDIS_REST_URL`.
- Confirmar ausencia de errores `500` en `api/extension-version`.
- Confirmar ausencia de fallback durable inesperado.

## Decisión

El smoke test limitado en producción fue correcto para el flujo normal de `extension usage`.

La PR #13 queda integrada en `main`. La siguiente fase no debe extender el piloto todavía hasta confirmar manualmente logs de Vercel y contador de comandos de Upstash. Después, el siguiente paso recomendado es monitorizar durante un ciclo corto y solo entonces valorar nuevos endpoints públicos de bajo riesgo.
