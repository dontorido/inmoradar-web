# SEO Autonomous Pipeline

El pipeline autonomo coordina el flujo editorial SEO sin sustituir los controles de calidad. Ejecuta un ciclo interno desde BackOffice/API:

`resource=seo/automation`
`action=run_autonomous_cycle`

Fases:

1. `auto_generate_briefs`
2. `auto_create_drafts`
3. `auto_approve_high_quality_drafts`
4. `auto_publish_ready_drafts`

## Principios

- `dry_run=true` por defecto.
- La ejecucion real exige `confirm=true` y `confirmation=run_autonomous_cycle`.
- La ejecucion real exige `SEO_AUTONOMOUS_PIPELINE_ENABLED=true`.
- La publicacion real exige tambien `SEO_READY_DRAFT_AUTO_PUBLISH_ENABLED=true`.
- No genera paginas masivas.
- No publica nada que no sea `ready_to_publish`.
- No publica si el ultimo quality gate falla.
- No toca sitemap directamente. El sitemap dinamico sigue filtrando por estado, indexacion, score y gate.

## Limites

Limites duros por ejecucion:

- briefs: 5
- drafts: 3
- autoaprobaciones: 3
- publicaciones: 3

La publicacion mantiene el limite diario de `auto_publish_ready_drafts`:

- maximo duro diario: 5
- configurable mediante `SEO_READY_DRAFT_AUTO_PUBLISH_MAX_PER_DAY`

## Fase 1: briefs

Procesa oportunidades `idea`.

Bloquea:

- `risk_level=high` o `risk_level=alta`
- duplicados por `keyword + suggested_landing`
- briefs sin campos minimos

En ejecucion real guarda `brief_json` y cambia estado a `brief_ready`.

## Fase 2: drafts

Procesa oportunidades `brief_ready`.

Valida `brief_json`, evita duplicados por slug y crea un draft en `seo_landings`:

- `published_at=null`
- `index_status=noindex`
- `published=false`
- `indexed=false`
- `touched_sitemap=false`

Ejecuta el quality gate y persiste `quality_score`, `word_count`, `quality_gate` y resumen.

## Fase 3: autoaprobacion fuerte

Solo marca un draft como `ready_to_publish` si:

- `quality_score >= 90`
- `quality_gate.can_index=true`
- no hay `failed_checks`
- no es legacy
- no tiene riesgo alto
- mantiene canonical valido, CTA medible, prudencia, independencia de portales, FAQ, enlaces, fuentes y unicidad segun el gate

La autoaprobacion guarda `source_data_json.auto_approval_audit`.

## Fase 4: autopublicacion

Reutiliza `auto_publish_ready_drafts`.

Mantiene:

- dry-run por defecto
- confirmacion explicita
- kill switch propio
- limites por ejecucion y diarios
- ultimo quality gate justo antes de publicar
- `source_data_json.auto_publish_audit`
- `quality_gate_snapshot`
- `touched_sitemap=false`

## Variables

```env
SEO_AUTONOMOUS_PIPELINE_ENABLED=false
SEO_READY_DRAFT_AUTO_PUBLISH_ENABLED=false
SEO_AUTONOMOUS_PIPELINE_BRIEFS_PER_RUN=5
SEO_AUTONOMOUS_PIPELINE_DRAFTS_PER_RUN=3
SEO_AUTONOMOUS_PIPELINE_APPROVALS_PER_RUN=3
SEO_AUTONOMOUS_PIPELINE_PUBLISHES_PER_RUN=1
SEO_READY_DRAFT_AUTO_PUBLISH_MAX_PER_DAY=3
```

## Auditoria

La respuesta del endpoint devuelve:

- `execution_id`
- `dry_run`
- `started_at`
- `finished_at`
- `phases`
- `summary`
- items procesados, omitidos y fallidos con `reason`
- `touched_sitemap=false`

Ademas:

- cada ejecucion se registra en `seo_autonomous_pipeline_runs` si Supabase y la tabla estan disponibles
- los drafts creados desde el ciclo guardan `source_data_json.autonomous_pipeline`
- los drafts autoaprobados guardan `source_data_json.auto_approval_audit`
- las publicaciones guardan `source_data_json.auto_publish_audit`

La tabla `seo_autonomous_pipeline_runs` guarda:

- `execution_id`
- `started_at` / `finished_at`
- `status`
- `dry_run`
- counts por fase
- `published_slugs`
- `skipped_items_json`
- `failed_items_json`
- `summary_json`
- `phases_json`
- `config_json`

No guarda credenciales, tokens ni datos personales. Los items se reducen a slug, estado, motivo, score y errores operativos.

## Como detenerlo

Para detener todo el ciclo real:

```env
SEO_AUTONOMOUS_PIPELINE_ENABLED=false
```

Para permitir briefs/drafts/aprobaciones pero impedir publicacion:

```env
SEO_READY_DRAFT_AUTO_PUBLISH_ENABLED=false
```

## BackOffice

La seccion SEO muestra un panel `Ciclo autonomo` con las ultimas ejecuciones persistidas:

- fecha y `execution_id`
- estado del run
- counts por fase
- slugs publicados
- motivos principales de omitidos/fallidos

La UI del BackOffice muestra solo `Ejecutar ciclo` para evitar confusion operativa. El modo `dry_run` queda disponible en la API para pruebas internas o automatizadas.

Si la tabla no esta aplicada, el panel muestra `Tabla seo_autonomous_pipeline_runs pendiente de aplicar` y el ciclo sigue funcionando; simplemente no queda historico consultable.

## Riesgos y seguimiento

- La autoaprobacion es intencionadamente estricta: score minimo 90.
- Las publicaciones siguen limitadas y auditadas.
- El dry-run debe revisarse antes de activar ejecucion real.
- Conviene monitorizar paginas publicadas, clicks a Chrome Store, indexacion y first_listing_analysis agregado.
