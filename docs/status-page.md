# Status page de servicios

La pagina publica `/status/` consume `GET /api/status` y muestra un resumen seguro de:

- Web publica.
- API.
- Sitemap.
- Datos internos.
- Versionado de extension.

El endpoint no devuelve errores SQL, nombres de tablas, tokens ni configuracion privada. Si una comprobacion falla, se publica como `degraded`, `down` o `unknown` con un mensaje generico.

En Vercel, `/api/status` se sirve mediante rewrite a `api/health.js?resource=status` y la logica vive en `api/_status.js`. Esto evita sumar otra serverless function y mantiene el despliegue dentro del limite del plan Hobby. El wrapper `api/status.js` se conserva solo para checks locales y esta excluido en `.vercelignore`.

## Pendiente: alertas

El backoffice ya tiene un sistema de alertas en `api/admin.js` para SEO, mantenimiento y actividad operativa. La integracion recomendada es crear una alerta cuando `/api/status` permanezca en `degraded` o `down` durante varias comprobaciones consecutivas, evitando avisos por fallos puntuales de red.

Antes de activarlo falta definir:

- Numero de comprobaciones consecutivas necesarias.
- Servicios criticos que deben elevar la severidad a `critical`.
- Ventana de silencio para no duplicar alertas.
