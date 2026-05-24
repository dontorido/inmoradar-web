# SEO Draft Review Workflow

## Resumen

El flujo de revision de drafts SEO permite editar, aprobar para publicacion futura y publicar manualmente landings creadas desde briefs aprobados del backlog. La revision es editorial y segura: no crea paginas masivas. La publicacion final exige confirmacion explicita y ultimo quality gate aprobado.

## Estados

- `draft`: borrador que aun falla el quality gate o necesita trabajo editorial.
- `needs_review`: borrador que puede pasar el gate, pero requiere criterio humano.
- `ready_to_publish`: borrador aprobado para una accion manual posterior de publicacion. Es el equivalente operativo de `approved_for_publish`.
- `published`: landing publicada manualmente tras confirmacion y ultimo quality gate.

Los estados `draft`, `needs_review` y `ready_to_publish` deben mantenerse con `index_status=noindex` y `published_at=null`. Solo `publish_ready_draft` puede convertir un `ready_to_publish` en `published`. La accion legacy `publish` queda bloqueada para publicacion manual y devuelve `use_publish_ready_draft`.

## Acciones admin

Endpoint:

```http
POST /api/admin?resource=seo/landings
```

### Editar draft

```json
{
  "action": "update_draft",
  "slug": "guias/analizar-piso-valencia",
  "patch": {
    "h1": "Analizar un piso antes de comprar en Valencia",
    "meta_title": "Analizar un piso antes de comprar en Valencia | InmoRadar",
    "meta_description": "Guia prudente para revisar precio, coste real y senales antes de contactar.",
    "body_html": "<article>...</article>",
    "editorial_notes": "Revisada estructura H2 y bloque de prudencia."
  }
}
```

Campos editables:

- `title`
- `h1`
- `meta_title`
- `meta_description`
- `body_html`
- `faq` en `source_data_json`
- `internal_links` en `source_data_json`
- `recommended_cta` / `cta` en `source_data_json`
- `editorial_notes` / `notes` en `source_data_json.editorial_review`

Al guardar se recalculan `word_count`, `quality_score`, `source_data_json.quality`, `source_data_json.quality_gate` y `source_data_json.quality_gate_summary`.

### Aprobar para publicacion futura

```json
{
  "action": "approve_draft_for_publish",
  "slug": "guias/analizar-piso-valencia"
}
```

La accion solo se permite si:

- la landing esta en estado de draft revisable;
- no tiene `published_at`;
- no tiene `index_status=index`;
- el quality gate pasa;
- `quality_score >= 80`.

Si pasa, deja el registro en `status=ready_to_publish`, mantiene `index_status=noindex`, mantiene `published_at=null` y guarda la marca editorial en `source_data_json.editorial_review`.

### Publicar ready draft

```json
{
  "action": "publish_ready_draft",
  "slug": "guias/analizar-piso-valencia",
  "confirm": true
}
```

La accion solo se permite si:

- `confirm=true` o confirmacion equivalente;
- no se envian `ids` ni `slugs` en lote;
- la landing esta en `status=ready_to_publish`;
- vuelve a pasar el quality gate justo antes de publicar;
- `quality_score >= 80`;
- `quality_gate.can_index=true`.

Si pasa, actualiza:

- `status=published`;
- `index_status=index`;
- `published_at` con la fecha actual;
- `quality_score` y `word_count` recalculados;
- `source_data_json.quality`;
- `source_data_json.quality_gate`;
- `source_data_json.quality_gate_summary`;
- `source_data_json.quality_gate_snapshot`;
- `source_data_json.manual_publish_audit`.

La auditoria incluye:

- `published_action_at`;
- `published_by`;
- `published_from_state=ready_to_publish`;
- `previous_status`;
- `previous_index_status`;
- `previous_published_at`;
- `confirm=true`;
- `quality_score_at_publish`;
- `quality_gate_at_publish`;
- `seo_keyword_backlog_id` si existe.

### Autopublicar ready drafts

```json
{
  "action": "auto_publish_ready_drafts",
  "dry_run": true,
  "limit": 3
}
```

La autopublicacion solo actua sobre landings que ya estan en `ready_to_publish`. `dry_run=true` es el valor por defecto. La ejecucion real exige `dry_run=false`, `confirm=true`, `confirmation=auto_publish_ready_drafts` y `SEO_READY_DRAFT_AUTO_PUBLISH_ENABLED=true`.

Limites:

- maximo duro de 3 por ejecucion;
- maximo duro diario de 5;
- sin `ids` ni `slugs` en lote;
- si una landing falla el ultimo gate, se devuelve como `skipped` y no se publica.

Cada publicacion real guarda `source_data_json.auto_publish_audit` y `source_data_json.quality_gate_snapshot`.

Ver tambien: `docs/SEO_AUTO_PUBLISH.md`.

## Garantias

Estas acciones NO hacen:

- tocar sitemap;
- cambiar canonical;
- activar autogeneracion;
- alterar funnel, extension, analytics o autopublisher Meta.

`update_draft` y `approve_draft_for_publish` tampoco publican ni indexan. `publish_ready_draft` si publica y puede dejar la landing indexable, pero solo con confirmacion y gate aprobado. `auto_publish_ready_drafts` solo automatiza ese ultimo paso para un numero pequeno de landings ya aprobadas editorialmente.

Las respuestas incluyen siempre:

- `touched_sitemap=false`

En revision, `published=false` e `indexed=false`. En publicacion manual, `published=true` e `indexed=true` solo si el gate permite indexar.

## Sitemap

`publish_ready_draft` no regenera ni escribe sitemap. Devuelve `touched_sitemap=false`.

El sitemap dinamico ya consulta landings con:

- `status=published`;
- `index_status=index`;
- `quality_score >= 80`;
- `quality_gate.can_index !== false`.

Por tanto, una landing publicada manualmente puede aparecer en sitemap en la siguiente lectura dinamica si cumple esos criterios. `published_at` actua como fuente de `lastmod` cuando esta disponible.

## Uso en BackOffice

En la tabla SEO, los drafts revisables muestran:

- boton `Editar`;
- boton `Aprobar` solo cuando el gate pasa y el score es suficiente;
- boton `Publicar` solo cuando esta en `ready_to_publish`, con gate pasado y score suficiente;
- origen desde backlog si `source_data_json.seo_keyword_backlog_id` existe.

El formulario de draft permite editar H1, meta title, meta description, contenido HTML y notas editoriales. Guardar recalcula el quality gate. Aprobar para publicacion futura no publica ni indexa. Publicar muestra una confirmacion explicita: la accion puede hacer la landing indexable si supera el quality gate.

## Pendiente

La siguiente fase podria ser un pequeno log historico de publicaciones SEO manuales en tabla dedicada si hace falta auditoria consultable fuera de `source_data_json`.
