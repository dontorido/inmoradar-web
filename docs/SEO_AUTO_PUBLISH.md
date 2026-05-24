# SEO Auto Publish Ready Drafts

## Resumen

La autopublicacion SEO solo automatiza el ultimo paso de landings que ya han pasado revision editorial y estan en `ready_to_publish`. No crea oportunidades, no genera briefs, no crea landings nuevas y no sustituye el quality gate.

El pipeline autonomo `run_autonomous_cycle` reutiliza esta misma accion como ultima fase. La publicacion real sigue dependiendo de `SEO_READY_DRAFT_AUTO_PUBLISH_ENABLED=true`; si esta apagado, el ciclo puede avanzar fases previas pero no publica.

## Accion admin

Endpoint:

```http
POST /api/admin?resource=seo/landings
```

Dry-run por defecto:

```json
{
  "action": "auto_publish_ready_drafts",
  "dry_run": true,
  "limit": 3
}
```

Ejecucion real:

```json
{
  "action": "auto_publish_ready_drafts",
  "dry_run": false,
  "confirm": true,
  "confirmation": "auto_publish_ready_drafts",
  "limit": 3
}
```

## Kill Switch

La ejecucion real requiere:

```env
SEO_READY_DRAFT_AUTO_PUBLISH_ENABLED=true
```

Si no esta activo, el endpoint devuelve `auto_publish_disabled`. El dry-run sigue disponible para revisar candidatos sin publicar.

## Limites

- `dry_run=true` por defecto.
- `confirm=true` obligatorio para ejecucion real.
- Limite duro por ejecucion: `3`.
- `SEO_READY_DRAFT_AUTO_PUBLISH_MAX_PER_RUN` puede bajar el limite operativo, pero no subirlo por encima de `3`.
- Limite duro diario: `5`.
- `SEO_READY_DRAFT_AUTO_PUBLISH_MAX_PER_DAY` puede ajustar el limite diario, pero no subirlo por encima de `5`.
- No acepta `ids` ni `slugs` en lote.

## Elegibilidad

Una landing solo puede publicarse automaticamente si:

- `status=ready_to_publish`;
- existe `source_data_json.quality_gate`;
- el ultimo recalculo del quality gate pasa;
- `quality_score >= 80`;
- `quality_gate.can_index=true`;
- mantiene canonical valido;
- mantiene CTA medible;
- mantiene bloque de prudencia;
- mantiene independencia de portales;
- mantiene FAQ, enlaces internos y fuentes cuando el gate los exige.

Si una landing no cumple, se devuelve como `skipped` con `reason`.

## Resultado

Cada item devuelve:

- `published` si se publico;
- `would_publish` si era dry-run;
- `skipped` si no era elegible;
- `failed` si fallo la escritura.

El endpoint devuelve contadores:

- `published_count`;
- `would_publish_count`;
- `skipped_count`;
- `failed_count`;
- `candidate_count`.

## Auditoria

Cada publicacion real guarda en `source_data_json.auto_publish_audit`:

- `published_action_at`;
- `published_by`;
- `published_from_state`;
- `previous_status`;
- `previous_index_status`;
- `previous_published_at`;
- `confirm=true`;
- `dry_run=false`;
- `source=auto_publish_ready_drafts`;
- `execution_id`;
- `limit`;
- `position`;
- `quality_score_at_publish`;
- `quality_gate_at_publish`;
- `seo_keyword_backlog_id` si existe.

Tambien guarda `source_data_json.quality_gate_snapshot`.

## Sitemap

La autopublicacion no regenera ni escribe sitemap. Devuelve siempre `touched_sitemap=false`.

El sitemap dinamico incluira la landing en la siguiente lectura si queda:

- `status=published`;
- `index_status=index`;
- `quality_score >= 80`;
- `quality_gate.can_index !== false`.

## Que NO Hace

- No genera landings.
- No crea briefs.
- No cambia backlog.
- No publica drafts sin `ready_to_publish`.
- No hace publicacion masiva.
- No toca funnel, extension, analytics de adquisicion ni autopublisher Meta.
- No regenera sitemap.
