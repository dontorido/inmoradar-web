# KPI de uso de extension

La seccion `Ventas` muestra adopcion y uso real de la extension con datos anonimos.

Contrato detallado: `docs/EXTENSION_USAGE_EVENTS.md`.

Atribucion web -> Chrome Store -> extension: `docs/FUNNEL_ATTRIBUTION.md`.

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
  "anonymous_user_id": "uuid-generado-en-extension-storage",
  "session_id": "uuid-de-sesion",
  "page_domain": "idealista.com",
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
`anonymous_user_id` es el nombre preferido desde la extension v2. `anonymous_id` queda aceptado para payloads legacy. `page_domain` guarda solo el dominio normalizado, nunca la URL completa.

## Eventos sugeridos

- `install`: primera apertura tras instalar.
- `extension_installed`: instalacion detectada por la extension v2.
- `extension_opened`: popup o widget abierto.
- `listing_detected`: anuncio compatible detectado.
- `session_start`: arranque de sesion.
- `heartbeat`: cada 60 segundos mientras la extension esta activa.
- `analysis_started`: usuario analiza un anuncio.
- `analysis_completed`: analisis terminado.
- `first_listing_analysis`: primer `analysis_completed` por usuario anonimo, derivado en backend.
- `session_end`: cierre o inactividad detectada.

## KPIs en Ventas

- Usuarios 30d: usuarios anonimos distintos.
- Activos 7d: usuarios con eventos en la ultima semana.
- Sesiones 30d: sesiones distintas.
- Tiempo uso: suma de segundos activos.
- Primer analisis: usuarios anonimos que completaron su primer analisis real.
- Ratio anuncio detectado -> analisis completado.
- Desglose por dominio analizado.
- Funnel agregado: Chrome Store clicks, primer analisis, ratio agregado Store -> primer analisis y dominios analizados.

Tambien se muestran desgloses por navegador, pais, version de extension y tipo de evento.

## Atribucion de instalacion

La web captura `install_click` y `chrome_store_click` con UTMs, `landing_path` y un `attribution_id` aleatorio no personal. Chrome Web Store no transmite ese identificador a la extension, asi que la lectura web -> primer analisis debe hacerse como aproximacion agregada por ventana temporal, no como conversion deterministica por usuario.

Endpoint admin:

```txt
GET /api/admin?resource=analytics/funnel&from=YYYY-MM-DD&to=YYYY-MM-DD
```

La vista de Ventas muestra esta lectura como "Intencion web vs activacion extension" y debe mantener visible que la atribucion es agregada, no deterministica por usuario.
