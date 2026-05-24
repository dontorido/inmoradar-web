# KPI de uso de extension

La seccion `Ventas > Uso de la extension` muestra adopcion, activacion y uso real con eventos anonimos. No usa IP ni user-agent como identificador de usuario.

## Tabla

Ejecuta `database/extension-usage-events.sql` en Supabase.

Indices incluidos:

- `created_at desc` para rangos y presets.
- `(anonymous_id_hash, created_at desc)` para usuarios nuevos/recurrentes.
- `(session_id_hash, created_at desc)` para sesiones.
- `(event_name, created_at desc)` para analisis y eventos principales.
- `(browser_name, created_at desc)` y `(country, created_at desc)` para desgloses.

## Endpoint publico

La extension debe enviar eventos a:

```txt
POST https://www.inmoradar.app/api/extension-usage
```

Payload recomendado:

```json
{
  "event_name": "heartbeat",
  "anonymous_install_id": "uuid-generado-en-extension-storage",
  "session_id": "uuid-de-sesion",
  "timestamp": "2026-05-24T10:00:00.000Z",
  "extension_version": "1.0.10",
  "browser_name": "chrome",
  "browser_version": "124",
  "platform": "windows",
  "country": "ES",
  "portal": "idealista",
  "page_domain": "idealista.com",
  "duration_seconds": 60,
  "active_seconds": 42,
  "locale": "es-ES"
}
```

`anonymous_install_id`, `anonymous_id`, `anonymous_user_id`, `install_id`, `user_id` y `client_id` se aceptan como aliases y se guardan hasheados en `anonymous_id_hash`. `session_id` se guarda hasheado en `session_id_hash`. No se almacenan emails ni URLs completas.

Desde la instrumentacion `extension-anonymous-install-id-and-session-events`, la extension genera `anonymous_install_id` aleatorio en `chrome.storage.local` y lo reutiliza en todos los eventos. Para usuarios de versiones anteriores, el backend mantiene fallback a aliases historicos hasta que la build instrumentada este publicada en todos los canales.

## Despliegue y validacion

- 2026-05-24: desplegado en produccion con el commit `e499e97`. Validado contra `https://www.inmoradar.app/admin` que el HTML publicado contiene `data-extension-preset`, `data-extension-from`, `data-extension-to` y `data-extension-timeseries`; los assets publicados contienen la logica de `extension_preset`, KPIs nuevos y estilos de la serie diaria. La validacion autenticada de datos reales queda pendiente de disponer de `ADMIN_IMPORT_TOKEN` en el entorno de validacion.
- 2026-05-24: no se pudo comparar contra Supabase ni confirmar indices aplicados desde este entorno porque no estaban disponibles `SUPABASE_URL` ni `SUPABASE_SERVICE_ROLE_KEY`. Aplicar `database/extension-usage-events.sql` en Supabase antes de auditar rangos grandes.
- Limitacion pendiente: publicar la build instrumentada en los canales de extension. Hasta que todos los usuarios actualicen, "Usuarios reales" puede mezclar `anonymous_install_id` nuevo con aliases historicos hasheados.

## Eventos sugeridos

- `extension_installed`: instalacion real detectada por la extension instalada.
- `extension_opened`: apertura de la extension o panel.
- `session_started`: arranque de sesion anonima nueva, emitido automaticamente cuando pasan mas de 30 minutos sin actividad.
- `heartbeat`: cada 60 segundos mientras el popup/panel de la extension permanece activo.
- `listing_detected` o `page_detected`: anuncio detectado.
- `analysis_started`: inicio de analisis.
- `analysis_completed` o `page_analyzed`: analisis real completado.
- `analysis_error`: error de analisis.
- `session_ended`: cierre, ocultacion o descarga del popup cuando el navegador permite emitirlo.

No llamar "instalaciones" a clics o intenciones. Si solo existe un evento, usar "eventos de instalacion" o "instalaciones detectadas".

## Endpoint admin

```txt
GET /api/admin?resource=extension/usage&from=2026-05-01&to=2026-05-24&timezone=Europe/Madrid
GET /api/admin?resource=extension/usage&preset=7d
```

Presets soportados:

- `24h`
- `7d`
- `30d`
- `month`
- `all`

La visualizacion agrupa por `Europe/Madrid`; las consultas a Supabase usan timestamps UTC.

El endpoint limita la lectura a 10.000 eventos por defecto y permite hasta 20.000 con `limit`. Si el resultado alcanza el limite, devuelve `result_limited: true` y el BackOffice avisa para acotar fechas antes de una auditoria completa.

## Definiciones KPI

- Usuarios reales: instalaciones o usuarios anonimos distintos por `anonymous_id_hash`.
- Nuevos usuarios: usuarios cuyo primer evento conocido cae dentro del rango.
- Usuarios recurrentes: usuarios con actividad en mas de un dia o en mas de una sesion dentro del rango.
- Sesiones: `session_id_hash` distinto; si falta, eventos del mismo usuario agrupados por ventanas de 30 minutos.
- Eventos: total de eventos anonimos en el rango.
- Analisis realizados: `analysis_completed`, `page_analyzed` o `page_analysis_completed`.
- Activacion: usuarios del rango con al menos un analisis realizado / usuarios reales del rango.
- Eventos por usuario: eventos / usuarios reales.
- Sesiones por usuario: sesiones / usuarios reales.

## Tiempo de uso

El dashboard muestra `Tiempo medio sesion` y `Tiempo estimado uso`.

Orden de calculo:

1. Usar `active_seconds` si la extension lo envia.
2. Si hay `session_ended` y `duration_seconds`, usar la duracion de cierre de sesion.
3. Si no hay duracion explicita, estimar con gaps entre eventos de la misma sesion.

Limites aplicados:

- Maximo por gap estimado: 10 minutos.
- Maximo de sesion estimada sin heartbeat: 30 minutos.
- Maximo absoluto por sesion: 12 horas.

Si solo hay eventos aislados y no hay heartbeat/duracion, el BackOffice muestra `Sin datos suficientes` en vez de `0 min`.

## Instrumentacion extension

La extension v2.0.1 instrumentada envia eventos desde `src/shared/usageAnalytics.js` y conserva compatibilidad con los campos antiguos:

- Identificador real anonimo: `anonymous_install_id`, generado aleatoriamente y persistido en `chrome.storage.local` bajo `inmoradar:analytics:anonymousInstallId`.
- Compatibilidad: el mismo valor se sigue enviando como `anonymous_user_id` y `anonymous_id` para no romper ingestas antiguas.
- Sesion: `session_id`, generado aleatoriamente y mantenido durante 30 minutos de actividad; si expira, el siguiente evento abre una sesion nueva y emite `session_started`.
- Timestamp: cada payload incluye `timestamp` y `occurred_at`; Supabase sigue usando `created_at` como hora de ingesta.
- Portal/dominio: solo se envia `portal` normalizado (`idealista`, `fotocasa`, `habitaclia`, `pisos`) y `page_domain`; nunca URL completa.
- Duracion: `heartbeat` envia `active_seconds: 60`; `session_ended` ayuda a cerrar sesiones cuando el popup se oculta o descarga.

Ejemplo anonimizado:

```json
{
  "event_name": "analysis_completed",
  "timestamp": "2026-05-24T10:00:00.000Z",
  "occurred_at": "2026-05-24T10:00:00.000Z",
  "anonymous_install_id": "install-550e8400-e29b-41d4-a716-446655440000",
  "anonymous_user_id": "install-550e8400-e29b-41d4-a716-446655440000",
  "anonymous_id": "install-550e8400-e29b-41d4-a716-446655440000",
  "session_id": "session-bf2d6c9a-1c2e-4ef7-9ed5-b2dbf58a7712",
  "extension_version": "2.0.1",
  "browser_name": "chrome",
  "browser_version": "124.0.0.0",
  "platform": "Win32",
  "portal": "idealista",
  "page_domain": "idealista.com",
  "duration_seconds": 0,
  "active_seconds": 0,
  "metadata": {
    "portal": "idealista",
    "page_domain": "idealista.com",
    "operation_type": "sale",
    "has_market_reference": "true"
  }
}
```

## Respuesta resumida

```json
{
  "range": { "from": "2026-05-01", "to": "2026-05-24", "timezone": "Europe/Madrid" },
  "kpis": {
    "unique_users": 12,
    "new_users": 4,
    "returning_users": 3,
    "sessions": 22,
    "events": 180,
    "completed_analyses": 38,
    "avg_session_seconds": 420,
    "total_usage_seconds_estimated": 9240,
    "activation_rate": 58.3
  },
  "breakdowns": {
    "browsers": [],
    "countries": [],
    "versions": [],
    "events": []
  },
  "timeseries": []
}
```
