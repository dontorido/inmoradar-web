# KPI de uso de extension

La seccion `Ventas` muestra adopcion y uso real de la extension con datos anonimos.

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
  "event_name": "heartbeat",
  "anonymous_id": "uuid-generado-en-extension-storage",
  "session_id": "uuid-de-sesion",
  "extension_version": "1.0.10",
  "browser_name": "chrome",
  "browser_version": "124",
  "platform": "windows",
  "country": "ES",
  "duration_seconds": 60,
  "active_seconds": 42,
  "locale": "es-ES"
}
```

`anonymous_id` y `session_id` se guardan como hash; no se almacenan emails ni URLs completas.

## Eventos sugeridos

- `install`: primera apertura tras instalar.
- `session_start`: arranque de sesion.
- `heartbeat`: cada 60 segundos mientras la extension esta activa.
- `analysis_started`: usuario analiza un anuncio.
- `analysis_completed`: analisis terminado.
- `session_end`: cierre o inactividad detectada.

## KPIs en Ventas

- Usuarios 30d: usuarios anonimos distintos.
- Activos 7d: usuarios con eventos en la ultima semana.
- Sesiones 30d: sesiones distintas.
- Tiempo uso: suma de segundos activos.

Tambien se muestran desgloses por navegador, pais, version de extension y tipo de evento.
