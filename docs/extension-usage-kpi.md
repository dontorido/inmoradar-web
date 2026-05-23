# KPI de uso de extension

La seccion `Ventas` muestra adopcion y uso real de la extension con datos anonimos.

## Auditoria del flujo

- Emisor esperado: codigo de la extension, no el backoffice. En los paquetes locales revisados (`inmoradar-releases/v1.0.10` y `v2.0.0`) solo se ve `checkExtensionVersion()` y no hay `fetch`/POST de eventos de uso.
- Endpoint publico: `/api/extension-usage`, reescrito en Vercel a `/api/extension-version?resource=usage`.
- Persistencia: `public.extension_usage_events` en Supabase, con identificadores hasheados.
- Lectura backoffice: `GET /api/admin?resource=extension/usage`, que consulta los ultimos 30 dias y resume en `lib/extension-usage/metrics.js`.

## Tabla

Ejecuta `database/extension-usage-events.sql` en Supabase.

## Endpoint publico

La extension debe enviar eventos a:

```txt
POST https://www.inmoradar.app/api/extension-usage
```

Payload recomendado:

```json
{
  "event_name": "extension_opened",
  "timestamp": "2026-05-23T10:00:00.000Z",
  "anonymous_user_id": "uuid-generado-en-extension-storage",
  "session_id": "uuid-de-sesion",
  "extension_version": "2.0.0",
  "browser_name": "chrome",
  "browser_version": "124",
  "platform": "windows",
  "country": "ES",
  "page_domain": "idealista.com",
  "duration_seconds": 60,
  "active_seconds": 42,
  "locale": "es-ES"
}
```

`anonymous_user_id` y `session_id` se guardan como hash; no se almacenan emails, direcciones de pisos ni URLs completas. Si la extension solo conoce una URL, debe enviar el dominio (`page_domain`) o dejar que el backend extraiga el hostname.

## Eventos minimos

- `extension_installed`: evento real de instalacion (`runtime.onInstalled` con `reason === "install"`).
- `extension_opened`: apertura del popup o inicio de uso.
- `listing_detected`: anuncio soportado detectado en una pestana.
- `analysis_started`: usuario analiza un anuncio.
- `analysis_completed`: analisis terminado.
- `cta_clicked`: click en CTA dentro de la extension.
- `error`: fallo controlado de extraccion, analisis o envio.

Eventos opcionales: `heartbeat`, `session_ended`, `config_opened`, `config_saved`.

## KPIs en Ventas

- Usuarios 30d: usuarios anonimos distintos.
- Activos 7d: usuarios con eventos en la ultima semana.
- Sesiones 30d: sesiones distintas.
- Tiempo uso: suma de segundos activos.

Tambien se muestran desgloses por navegador, pais, version de extension y tipo de evento.

El bloque de diagnostico muestra estado del tracking, ultimo evento recibido, total de eventos 24h y errores de lectura/esquema. Si todos los KPIs estan a cero y el diagnostico dice `Sin eventos 30d`, significa que la tabla se lee bien pero no han llegado eventos en la ventana consultada.

## Prueba local segura

1. Arranca el servidor local:

```bash
npm run serve
```

2. En otra terminal, genera eventos anonimos de desarrollo:

```bash
npm run extension-usage:seed
```

Por defecto el script solo envia a `http://127.0.0.1:4173/api/extension-usage`. Para apuntar a otro endpoint hay que pasar la URL; si no es localhost exige `ALLOW_REMOTE_EXTENSION_USAGE_SEED=1`.
