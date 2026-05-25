# Extension v2.0.3 funnel observation

Fecha de seguimiento: 2026-05-25

Estado: bloqueado para medicion real desde este entorno. No se inventan conteos.

## Resumen ejecutivo

No hay datos reales accesibles localmente para medir el funnel de activacion de la extension v2.0.3. En este entorno no estan disponibles `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_IMPORT_TOKEN` ni archivos `.env*`, por lo que no es posible consultar Supabase ni el endpoint admin autenticado sin credenciales reales.

La revision del codigo confirma que el BackOffice ya consulta `extension_usage_events` por ventana temporal y muestra un desglose por `extension_version`, pero el endpoint admin actual no acepta un filtro de version. Para aislar v2.0.3 hay que usar SQL/PostgREST directo con `extension_version = '2.0.3'` o ampliar el endpoint en otro cambio fuera de este alcance.

## Archivos revisados

- `database/extension-usage-events.sql`: define `extension_usage_events`, con columnas `event_name`, `anonymous_id_hash`, `session_id_hash`, `extension_version`, `duration_seconds`, `active_seconds`, `metadata` y `created_at`.
- `api/extension-version.js`: acepta `POST /api/extension-version?resource=usage` y guarda eventos normalizados en Supabase.
- `lib/extension-usage/metrics.js`: normaliza eventos, hashea identificadores, agrupa sesiones y calcula KPIs agregados.
- `api/_admin/handlers/extension-usage.js`: implementa `GET /api/admin?resource=extension/usage` con presets `24h`, `7d`, `30d`, `month` y `all`.
- `assets/admin.js` y `admin.html`: cargan y renderizan "Uso de la extension", incluyendo breakdown por version y evento.
- `docs/extension-usage-kpi.md`: documenta el endpoint, los eventos sugeridos y la limitacion historica de no tener credenciales para validar datos reales.

## Como consulta hoy el dashboard

El handler admin construye esta consulta a Supabase:

```txt
extension_usage_events?
  select=event_name,anonymous_id_hash,session_id_hash,browser_name,browser_version,platform,country,extension_version,duration_seconds,active_seconds,created_at
  &order=created_at.desc
  &limit=10000
  &created_at=gte.<window_start_utc>
  &created_at=lte.<window_end_utc>
```

Despues calcula el resumen en Node con `summarizeExtensionUsage`. El dashboard muestra `breakdowns.versions`, pero no filtra por `extension_version`. Por tanto, una lectura de `preset=24h` o `preset=7d` mezcla todas las versiones y solo permite ver si `2.0.3` aparece como breakdown, no medir el funnel aislado de v2.0.3.

Endpoint admin disponible, si se dispone de token:

```txt
GET /api/admin?resource=extension/usage&preset=24h&timezone=Europe/Madrid
GET /api/admin?resource=extension/usage&preset=7d&timezone=Europe/Madrid
GET /api/admin?resource=extension/usage&from=2026-05-18&to=2026-05-25&timezone=Europe/Madrid
```

## Resultado de medicion real

| Ventana | Estado | Motivo |
| --- | --- | --- |
| Ultimas 24h | No medido | Faltan credenciales Supabase/admin en el entorno local. |
| Ultimas 48h | No medido | Faltan credenciales Supabase/admin en el entorno local. |
| Ultimos 7d | No medido | Faltan credenciales Supabase/admin en el entorno local. |

No se han observado conteos reales de `extension_opened`, `listing_detected`, `page_detected`, `analysis_started`, `analysis_completed` ni `analysis_error`.

## Definiciones recomendadas

Filtro base:

```sql
where extension_version = '2.0.3'
```

Eventos del funnel v2.0.3:

- Apertura: `extension_opened`
- Deteccion: `listing_detected` o `page_detected`
- Inicio de analisis: `analysis_started`
- Activacion: al menos un `analysis_completed` por usuario anonimo
- Error: `analysis_error`

Metricas:

- `detection_rate_user_pct`: usuarios con deteccion / usuarios con apertura.
- `analysis_start_rate_user_pct`: usuarios con `analysis_started` / usuarios con deteccion.
- `activation_rate_user_pct`: usuarios con `analysis_completed` / usuarios con apertura.
- `user_error_rate_pct`: usuarios con `analysis_error` / usuarios con `analysis_started`.
- `event_error_rate_pct`: eventos `analysis_error` / eventos `analysis_started`.
- `completed_per_user`: eventos `analysis_completed` / usuarios anonimos.
- `sessions_per_user`: sesiones / usuarios anonimos.

Notas:

- Las tasas por usuario evitan que un usuario con muchos eventos distorsione el funnel.
- Las tasas por evento tambien son utiles para errores, pero deben leerse como salud operacional, no como activacion.
- Si `anonymous_id_hash` es nulo, el evento no debe entrar en metricas "por usuario anonimo"; debe reportarse como problema de calidad.

## SQL de medicion 24h, 48h y 7d

Ejecutar en Supabase SQL Editor. Esta query mide el funnel por usuario anonimo y sessioniza de forma compatible con el dashboard: usa `session_id_hash` si existe y, si falta, agrupa eventos del mismo usuario por gaps de 30 minutos.

```sql
with params as (
  select
    '2.0.3'::text as target_version,
    now() as generated_at
),
windows as (
  select '24h'::text as window_label, generated_at - interval '24 hours' as window_start, generated_at as window_end from params
  union all
  select '48h'::text as window_label, generated_at - interval '48 hours' as window_start, generated_at as window_end from params
  union all
  select '7d'::text as window_label, generated_at - interval '7 days' as window_start, generated_at as window_end from params
),
raw as (
  select
    e.id,
    e.created_at,
    e.event_name,
    e.anonymous_id_hash,
    e.session_id_hash,
    e.extension_version
  from public.extension_usage_events e
  cross join params p
  where e.extension_version = p.target_version
    and e.created_at >= p.generated_at - interval '7 days'
    and e.created_at <= p.generated_at
),
ordered as (
  select
    raw.*,
    coalesce(raw.anonymous_id_hash, raw.id::text) as entity_key,
    lag(raw.created_at) over (
      partition by coalesce(raw.anonymous_id_hash, raw.id::text)
      order by raw.created_at, raw.id
    ) as previous_created_at
  from raw
),
sessionized as (
  select
    ordered.*,
    case
      when ordered.session_id_hash is not null then 'session:' || ordered.session_id_hash
      else
        'synthetic:' || ordered.entity_key || ':' ||
        sum(
          case
            when ordered.previous_created_at is null then 1
            when ordered.created_at - ordered.previous_created_at > interval '30 minutes' then 1
            else 0
          end
        ) over (
          partition by ordered.entity_key
          order by ordered.created_at, ordered.id
          rows between unbounded preceding and current row
        )::text
    end as session_key
  from ordered
),
window_events as (
  select
    w.window_label,
    s.*
  from windows w
  join sessionized s
    on s.created_at >= w.window_start
   and s.created_at <= w.window_end
),
user_window as (
  select
    window_label,
    anonymous_id_hash,
    count(distinct session_key) as sessions,
    count(*) filter (where event_name = 'extension_opened') as extension_opened_events,
    count(*) filter (where event_name = 'listing_detected') as listing_detected_events,
    count(*) filter (where event_name = 'page_detected') as page_detected_events,
    count(*) filter (where event_name in ('listing_detected', 'page_detected')) as detected_events,
    count(*) filter (where event_name = 'analysis_started') as analysis_started_events,
    count(*) filter (where event_name = 'analysis_completed') as analysis_completed_events,
    count(*) filter (where event_name = 'analysis_error') as analysis_error_events
  from window_events
  where anonymous_id_hash is not null
  group by window_label, anonymous_id_hash
),
window_rollup as (
  select
    window_label,
    count(*) as unique_users,
    sum(sessions) as sessions,
    sum(extension_opened_events) as extension_opened_events,
    sum(listing_detected_events) as listing_detected_events,
    sum(page_detected_events) as page_detected_events,
    sum(detected_events) as detected_events,
    sum(analysis_started_events) as analysis_started_events,
    sum(analysis_completed_events) as analysis_completed_events,
    sum(analysis_error_events) as analysis_error_events,
    count(*) filter (where extension_opened_events > 0) as users_opened,
    count(*) filter (where detected_events > 0) as users_detected,
    count(*) filter (where analysis_started_events > 0) as users_analysis_started,
    count(*) filter (where analysis_completed_events > 0) as users_completed,
    count(*) filter (where analysis_error_events > 0) as users_error
  from user_window
  group by window_label
)
select
  window_label,
  unique_users,
  sessions,
  extension_opened_events,
  listing_detected_events,
  page_detected_events,
  detected_events,
  analysis_started_events,
  analysis_completed_events,
  analysis_error_events,
  users_opened,
  users_detected,
  users_analysis_started,
  users_completed,
  users_error,
  round(100.0 * users_detected / nullif(users_opened, 0), 2) as detection_rate_user_pct,
  round(100.0 * users_analysis_started / nullif(users_detected, 0), 2) as analysis_start_rate_user_pct,
  round(100.0 * users_completed / nullif(users_opened, 0), 2) as activation_rate_user_pct,
  round(100.0 * users_error / nullif(users_analysis_started, 0), 2) as user_error_rate_pct,
  round(100.0 * analysis_error_events / nullif(analysis_started_events, 0), 2) as event_error_rate_pct,
  round(analysis_completed_events::numeric / nullif(unique_users, 0), 2) as completed_per_user,
  round(sessions::numeric / nullif(unique_users, 0), 2) as sessions_per_user
from window_rollup
order by case window_label when '24h' then 1 when '48h' then 2 when '7d' then 3 else 4 end;
```

## SQL de detalle por usuario anonimo

Ejecutar para revisar distribucion y detectar outliers por usuario. Cambia `interval '7 days'` por `24 hours` o `48 hours` si hace falta.

```sql
with raw as (
  select
    id,
    created_at,
    event_name,
    anonymous_id_hash,
    session_id_hash,
    extension_version
  from public.extension_usage_events
  where extension_version = '2.0.3'
    and created_at >= now() - interval '7 days'
    and created_at <= now()
),
ordered as (
  select
    raw.*,
    coalesce(raw.anonymous_id_hash, raw.id::text) as entity_key,
    lag(raw.created_at) over (
      partition by coalesce(raw.anonymous_id_hash, raw.id::text)
      order by raw.created_at, raw.id
    ) as previous_created_at
  from raw
),
sessionized as (
  select
    ordered.*,
    case
      when ordered.session_id_hash is not null then 'session:' || ordered.session_id_hash
      else
        'synthetic:' || ordered.entity_key || ':' ||
        sum(
          case
            when ordered.previous_created_at is null then 1
            when ordered.created_at - ordered.previous_created_at > interval '30 minutes' then 1
            else 0
          end
        ) over (
          partition by ordered.entity_key
          order by ordered.created_at, ordered.id
          rows between unbounded preceding and current row
        )::text
    end as session_key
  from ordered
)
select
  anonymous_id_hash,
  min(created_at) as first_event_at,
  max(created_at) as last_event_at,
  count(distinct session_key) as sessions,
  count(*) filter (where event_name = 'extension_opened') as extension_opened_events,
  count(*) filter (where event_name = 'listing_detected') as listing_detected_events,
  count(*) filter (where event_name = 'page_detected') as page_detected_events,
  count(*) filter (where event_name in ('listing_detected', 'page_detected')) as detected_events,
  count(*) filter (where event_name = 'analysis_started') as analysis_started_events,
  count(*) filter (where event_name = 'analysis_completed') as analysis_completed_events,
  count(*) filter (where event_name = 'analysis_error') as analysis_error_events
from sessionized
where anonymous_id_hash is not null
group by anonymous_id_hash
order by analysis_completed_events desc, analysis_started_events desc, detected_events desc, extension_opened_events desc
limit 500;
```

## SQL de calidad, duplicados y privacidad

Calidad de identificadores:

```sql
select
  count(*) as events,
  count(*) filter (where anonymous_id_hash is null) as events_without_anonymous_id,
  count(*) filter (where session_id_hash is null) as events_without_session_id,
  count(distinct anonymous_id_hash) filter (where anonymous_id_hash is not null) as unique_anonymous_users,
  count(distinct session_id_hash) filter (where session_id_hash is not null) as unique_sessions
from public.extension_usage_events
where extension_version = '2.0.3'
  and created_at >= now() - interval '7 days';
```

Duplicados exactos por segundo:

```sql
select
  anonymous_id_hash,
  session_id_hash,
  event_name,
  date_trunc('second', created_at) as event_second,
  count(*) as duplicate_count
from public.extension_usage_events
where extension_version = '2.0.3'
  and created_at >= now() - interval '7 days'
group by anonymous_id_hash, session_id_hash, event_name, date_trunc('second', created_at)
having count(*) > 1
order by duplicate_count desc, event_second desc
limit 100;
```

Rafagas sospechosas del mismo evento en menos de 5 segundos:

```sql
with ordered as (
  select
    id,
    anonymous_id_hash,
    session_id_hash,
    event_name,
    created_at,
    lag(created_at) over (
      partition by anonymous_id_hash, session_id_hash, event_name
      order by created_at, id
    ) as previous_created_at
  from public.extension_usage_events
  where extension_version = '2.0.3'
    and created_at >= now() - interval '7 days'
)
select
  anonymous_id_hash,
  session_id_hash,
  event_name,
  previous_created_at,
  created_at,
  extract(epoch from created_at - previous_created_at) as seconds_since_previous
from ordered
where previous_created_at is not null
  and created_at - previous_created_at <= interval '5 seconds'
order by created_at desc
limit 100;
```

Revision de privacidad de payload persistido:

```sql
select
  event_name,
  extension_version,
  browser_name,
  browser_version,
  platform,
  country,
  jsonb_object_keys(metadata) as metadata_key,
  count(*) as events
from public.extension_usage_events
where extension_version = '2.0.3'
  and created_at >= now() - interval '7 days'
group by event_name, extension_version, browser_name, browser_version, platform, country, jsonb_object_keys(metadata)
order by events desc
limit 100;
```

Esperado por codigo: `metadata` solo debe contener `manifest_version` y `locale`. No deben aparecer emails, URLs completas, querystrings, direcciones ni identificadores en claro.

## Checklist manual para completar la observacion

1. Confirmar que `database/extension-usage-events.sql` esta aplicado en Supabase.
2. Confirmar que produccion tiene `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`.
3. Confirmar que produccion tiene `EXTENSION_USAGE_HASH_SECRET` dedicado; si no existe, el hash cae a `ADMIN_IMPORT_TOKEN` o al fallback local `"inmoradar"`.
4. Confirmar que la extension v2.0.3 envia `anonymous_install_id` estable y persistido en storage local.
5. Ejecutar la query de medicion 24h/48h/7d con `extension_version = '2.0.3'`.
6. Ejecutar la query de detalle por usuario y revisar outliers de eventos o sesiones.
7. Ejecutar las queries de duplicados.
8. Ejecutar la query de privacidad y revisar claves de `metadata`.
9. Si el volumen supera 10.000 eventos por ventana, evitar el dashboard general y usar SQL directo o rangos mas pequenos.
10. Considerar en un cambio futuro un indice `(extension_version, created_at desc)` si v2.0.3 se audita con frecuencia.

## Observaciones de riesgo

- El BackOffice actual no permite aislar v2.0.3 desde UI/API admin; solo muestra version como breakdown.
- `database/extension-usage-events.sql` no define un indice especifico por `extension_version`; para auditorias grandes, el filtro por version puede depender principalmente de `created_at`.
- Si `anonymous_id_hash` llega nulo, las metricas por usuario quedan incompletas aunque el total de eventos exista.
- Si `session_id_hash` llega nulo, las sesiones se estiman por ventanas de 30 minutos, igual que el dashboard.
- Si hay eventos aislados sin heartbeat ni duracion, el tiempo de uso queda insuficiente; esto no bloquea el funnel solicitado, pero si afecta lectura de sesiones.
