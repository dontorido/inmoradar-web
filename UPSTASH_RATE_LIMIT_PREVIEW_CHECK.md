# Upstash Rate Limit Preview Check

Fecha: 2026-05-25

## Resumen

La PR del piloto durable de rate limiting para `extension usage` quedó abierta contra `main`, pero el smoke test automático contra el preview de Vercel no pudo alcanzar el endpoint de la aplicación porque el deployment está protegido por Vercel Authentication.

No se hicieron cambios runtime durante esta verificación.

## PR

- PR: https://github.com/dontorido/inmoradar-web/pull/13
- Rama: `feature/upstash-rate-limit-extension-usage`
- Commit runtime validado localmente: `92ac48a Add durable rate limiting pilot for extension usage`

## Preview

- Preview URL: `https://inmoradar-web-git-feature-upstash-ra-1bb747-sergio-s-projects15.vercel.app`
- Estado de deploy reportado por Vercel/GitHub: success
- Acceso HTTP desde smoke test: bloqueado por Vercel Authentication

## Endpoint probado

- `POST /api/extension-version?resource=usage`

Body usado para la prueba normal:

```json
{
  "event_name": "heartbeat",
  "anonymous_install_id": "preview-smoke-install",
  "session_id": "preview-smoke-session",
  "extension_version": "1.0.10"
}
```

## Resultado

La petición no llegó al handler de `extension usage`. Vercel devolvió la pantalla de autenticación del preview antes de ejecutar la función serverless.

Por ese motivo no se pudo confirmar automáticamente en preview:

- respuesta normal del endpoint;
- headers `x-ratelimit-*`;
- respuesta `429` estable al superar límite;
- uso real de Upstash frente al fallback en memoria.

## Secretos

No se imprimieron, copiaron ni registraron valores reales de:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

La respuesta recibida fue la página de autenticación de Vercel y no expuso secretos de la aplicación ni de Upstash.

## Integraciones sensibles

Durante esta verificación no se tocaron:

- SEO write, generación SEO ni publicación SEO;
- `operations/chrome` ni Chrome Web Store;
- Meta/Facebook/Instagram;
- LinkedIn;
- Runway/social-video;
- Viraliza;
- checkout, Lemon Squeezy, billing ni webhooks;
- cron ni jobs.

## Logs

No se revisaron logs runtime de Vercel desde esta sesión. Para confirmar uso durable real en preview, revisar:

1. Que el deployment de Preview tiene disponibles `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`.
2. Que no aparecen logs saneados de fallback tipo `[rate-limit] durable fallback`.
3. Que el contador de comandos de Upstash aumenta durante el smoke test.

## Decisión

La PR queda abierta, pero el smoke test automático de preview no queda validado por protección de Vercel.

Antes de mergear, hacer una de estas dos opciones:

1. Ejecutar el smoke test desde una sesión autenticada que pueda atravesar Vercel Authentication.
2. Habilitar temporalmente un bypass seguro de preview y repetir solo el endpoint `extension usage`.

No se recomienda mergear esta PR únicamente con esta verificación bloqueada, aunque la batería local siga en verde.

