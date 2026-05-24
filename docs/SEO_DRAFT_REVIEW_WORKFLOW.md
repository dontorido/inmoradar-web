# SEO Draft Review Workflow

## Resumen

El flujo de revision de drafts SEO permite editar y aprobar para publicacion futura las landings creadas desde briefs aprobados del backlog. La revision es editorial y segura: no publica, no indexa, no toca sitemap y no crea paginas masivas.

## Estados

- `draft`: borrador que aun falla el quality gate o necesita trabajo editorial.
- `needs_review`: borrador que puede pasar el gate, pero requiere criterio humano.
- `ready_to_publish`: borrador aprobado para una accion manual posterior de publicacion. Es el equivalente operativo de `approved_for_publish`.

Todos estos estados deben mantenerse con `index_status=noindex` y `published_at=null` hasta que exista una accion manual de publicacion separada.

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

## Garantias

Estas acciones NO hacen:

- publicar landings;
- indexar landings;
- tocar sitemap;
- cambiar canonical;
- activar autogeneracion;
- alterar funnel, extension, analytics o autopublisher Meta.

Las respuestas incluyen siempre:

- `published=false`
- `indexed=false`
- `touched_sitemap=false`

## Uso en BackOffice

En la tabla SEO, los drafts revisables muestran:

- boton `Editar`;
- boton `Aprobar` solo cuando el gate pasa y el score es suficiente;
- origen desde backlog si `source_data_json.seo_keyword_backlog_id` existe.

El formulario de draft permite editar H1, meta title, meta description, contenido HTML y notas editoriales. Guardar recalcula el quality gate. Aprobar para publicacion futura no publica ni indexa.

## Pendiente

La siguiente fase deberia ser una accion manual separada de publicacion desde `ready_to_publish`, con confirmacion explicita y manteniendo el quality gate como bloqueo final.
