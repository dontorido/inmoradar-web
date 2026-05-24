# SEO Keyword Backlog

## Resumen ejecutivo

El backlog SEO es una capa previa a la generacion de landings. Sirve para registrar oportunidades, priorizarlas y convertirlas en briefs revisables antes de crear contenido.

Ahora puede persistirse en Supabase mediante la tabla `seo_keyword_backlog`. Tambien permite convertir una oportunidad `approved` con `brief_json` en un borrador SEO revisable y editar ese draft antes de una futura publicacion manual. Esa conversion y revision no publican, no indexan y no tocan sitemap.

## Modelo de backlog

Campos definidos:

- `id`
- `keyword`
- `intent`
- `page_type`
- `city`
- `province`
- `priority`
- `manual_difficulty`
- `status`
- `suggested_landing`
- `recommended_cta`
- `risk_level`
- `risk_notes`
- `brief_json`
- `created_at`
- `updated_at`
- `notes`
- `created_by`
- `updated_by`

## Persistencia Supabase

Schema:

`database/seo-keyword-backlog.sql`

Tabla:

`seo_keyword_backlog`

Controles:

- `status` limitado a `idea`, `brief_ready`, `draft`, `quality_review`, `approved`, `rejected`, `published`.
- `intent` y `page_type` limitados a los valores editoriales soportados.
- `priority` limitada a 0-100.
- `manual_difficulty` y `risk_level` limitados a `baja`, `media`, `alta`.
- Dedupe por `lower(keyword)` + `suggested_landing`.
- `updated_at` se refresca con trigger.

Si Supabase no esta configurado, o la tabla falla, el GET vuelve a los seeds controlados. Las acciones de escritura devuelven error seguro y no modifican nada.

Estados:

- `idea`
- `brief_ready`
- `draft`
- `quality_review`
- `approved`
- `rejected`
- `published`

Intenciones iniciales:

- `saber_si_piso_esta_caro`
- `precio_metro_cuadrado_vivienda`
- `analizar_anuncio_inmobiliario`
- `analizar_piso_antes_de_comprar`
- `comparar_pisos_online`
- `negociar_precio_vivienda`
- `preguntas_antes_de_contactar`
- `extension_chrome_inmobiliaria`

Tipos de pagina iniciales:

- `expensive_listing_city`
- `price_city`
- `editorial_guide`
- `chrome_extension_landing`
- `comparison_guide`

## Brief editorial

Cada brief incluye:

- keyword principal;
- intencion de busqueda;
- usuario objetivo;
- H1 sugerido;
- meta title sugerido;
- meta description sugerida;
- estructura H2;
- CTA;
- enlaces internos recomendados;
- bloque de prudencia;
- bloque de independencia de portales;
- FAQ sugeridas;
- riesgos;
- datos/fuentes necesarios;
- tipo de pagina recomendado;
- requisitos para superar el quality gate.

El brief siempre recuerda que la futura pagina debe superar el quality gate antes de publicar o indexar.

## Seeds controlados

La implementacion incluye 12 keywords seed. El limite inicial queda por debajo de 15 para evitar crecimiento agresivo.

Los seeds cubren:

- saber si un piso esta caro;
- precio metro cuadrado vivienda;
- analizar anuncio inmobiliario;
- analizar piso antes de comprar;
- comparar pisos online;
- negociar precio vivienda;
- preguntas antes de contactar;
- extension Chrome inmobiliaria.

## API admin

Endpoint:

`GET /api/admin?resource=seo/keyword-backlog&limit=15&include_briefs=true`

Devuelve:

- `keywords`
- `summary`
- `statuses`
- `intents`
- `page_types`
- `source`: `supabase` o `seed`
- `storage_warning` si la tabla persistente no existe o falla

Generar un brief concreto:

```json
{
  "action": "generate_brief",
  "id": "seo_kw_003"
}
```

El endpoint responde con `generated_landing=false` y `published=false`.

Acciones de escritura:

```json
{ "action": "create_opportunity", "opportunity": { "keyword": "analizar piso antes de comprar en Valencia" } }
```

```json
{ "action": "update_opportunity", "id": 45, "patch": { "priority": 90, "status": "quality_review" } }
```

```json
{ "action": "save_brief", "id": 45, "brief": { "...": "..." } }
```

```json
{ "action": "change_status", "id": 45, "status": "approved" }
```

Estas acciones guardan solo datos editoriales del backlog. Todas responden con banderas explicitas `generated_landing=false`, `published=false`, `indexed=false` y `touched_sitemap=false`.

Crear un borrador desde un brief aprobado:

```json
{ "action": "create_draft_from_approved_brief", "id": 45 }
```

Requisitos:

- la oportunidad debe tener `status=approved`;
- debe existir `brief_json` valido;
- `suggested_landing` no debe existir ya como `seo_landings.slug`;
- Supabase debe estar configurado.

Respuesta esperada si crea draft:

- `generated_landing=true`;
- `published=false`;
- `indexed=false`;
- `touched_sitemap=false`;
- `landing.status=draft` o `needs_review`;
- `landing.index_status=noindex`;
- `landing.published_at=null`;
- `source_data_json.seo_keyword_backlog_id` con el id del backlog;
- `source_data_json.quality`, `source_data_json.quality_gate` y `source_data_json.quality_gate_summary`.

## BackOffice

La seccion SEO muestra una tabla "Oportunidades y briefs" con:

- keyword;
- intencion;
- tipo;
- prioridad;
- estado/riesgo;
- edicion minima de prioridad y estado;
- boton "Ver brief";
- boton "Guardar brief";
- boton "Crear borrador" solo en oportunidades `approved`;
- acciones "Aprobar" y "Rechazar".

Crear o editar una oportunidad persiste el backlog si Supabase esta disponible. Ver un brief no crea contenido ni modifica datos. Guardar un brief persiste `brief_json`.

Crear borrador si escribe en `seo_landings`, pero siempre como borrador revisable: `index_status=noindex`, `published_at=null`, sin cambios de sitemap. Si el quality gate falla, queda en `draft`; si pasa, queda en `needs_review`.

Los drafts SEO pendientes pueden editarse desde el BackOffice con el formulario de revision:

- H1;
- meta title;
- meta description;
- contenido HTML;
- notas editoriales.

Guardar el draft recalcula `word_count`, `quality_score`, `source_data_json.quality`, `source_data_json.quality_gate` y `source_data_json.quality_gate_summary`. Aprobar para publicacion futura solo se permite si el quality gate pasa y `quality_score >= 80`; deja el registro en `ready_to_publish`, pero mantiene `index_status=noindex` y `published_at=null`.

## Controles de calidad

Antes de convertir un brief en landing:

- Confirmar que hay fuente real y fecha cuando la pagina dependa de datos locales.
- Confirmar que el H1, title y meta description no duplican paginas existentes.
- Confirmar que el CTA sera medible como clic/intencion, no instalacion confirmada.
- Confirmar bloque de prudencia: referencia orientativa, no tasacion exacta.
- Confirmar bloque de independencia: sin afiliacion oficial con portales inmobiliarios.
- Confirmar que no es una pagina thin ni una plantilla que solo cambia ciudad.

Al crear un borrador desde un brief aprobado, el sistema ejecuta el quality gate con las reglas actuales. El resultado se guarda en `source_data_json` y se muestra en BackOffice para revisar score, checks fallidos y motivos antes de cualquier publicacion manual posterior.

## Flujo editorial

1. Crear oportunidad manual o revisar seed/fallback.
2. Ajustar prioridad, dificultad, riesgo y landing sugerida.
3. Generar brief para revision.
4. Guardar brief cuando tenga sentido editorial.
5. Marcar como `approved` o `rejected`.
6. Crear borrador desde una oportunidad `approved`.
7. Revisar score, checks fallidos, copy, fuentes, CTA e independencia.
8. Editar el draft y recalcular quality gate.
9. Marcarlo como `ready_to_publish` solo si pasa el gate.
10. Publicar manualmente con `publish_ready_draft`, `confirm=true` y ultimo quality gate aprobado.

El flujo autonomo `run_autonomous_cycle` puede ejecutar los pasos operativos repetitivos con limites: generar briefs desde `idea`, crear drafts desde `brief_ready`, autoaprobar solo drafts excelentes y autopublicar de forma limitada. Mantiene `dry_run=true` por defecto y no publica sin los kill switches activos.

## Acciones que NO hace

- No publica landings.
- No cambia sitemap.
- No indexa landings.
- No cambia robots ni rutas publicas.
- No salta el quality gate.
- No genera contenido masivo.

La accion `create_draft_from_approved_brief` si crea un registro en `seo_landings`, pero siempre como `noindex`, no publicado y sin `published_at`.

Las acciones `update_draft` y `approve_draft_for_publish` operan sobre `seo_landings`, pero tambien devuelven `published=false`, `indexed=false` y `touched_sitemap=false`.

La accion `publish_ready_draft` es la unica accion de este flujo que publica. Solo acepta una landing individual en `ready_to_publish`, exige `confirm=true`, recalcula el quality gate justo antes de publicar y guarda auditoria en `source_data_json.manual_publish_audit`. No hace batch y devuelve `touched_sitemap=false`.

La accion `auto_publish_ready_drafts` puede automatizar ese ultimo paso para un numero pequeno de landings ya aprobadas editorialmente. Funciona en `dry_run` por defecto, exige kill switch y confirmacion para ejecucion real, y guarda auditoria en `source_data_json.auto_publish_audit`. Ver `docs/SEO_AUTO_PUBLISH.md`.

La accion `run_autonomous_cycle` coordina briefs, drafts, autoaprobacion y autopublicacion limitada. No publica si falta quality gate, si el score es bajo, si el riesgo es alto o si los kill switches estan apagados. Ver `docs/SEO_AUTONOMOUS_PIPELINE.md`.

## Limitaciones

- El fallback a seeds es solo operativo/desarrollo; no sustituye la persistencia editorial.
- No hay batch de importacion en esta rama.
- La dificultad es manual y orientativa.
- Una oportunidad `approved` permite crear borrador, pero no implica publicacion.
- Un draft `ready_to_publish` esta aprobado editorialmente para una accion futura, pero sigue sin publicar ni indexar hasta `publish_ready_draft`.
- El id del backlog se guarda en `source_data_json`; `seo_landings.opportunity_id` se mantiene para la tabla historica `seo_landing_opportunities`.

## Siguiente rama recomendada

Crear una rama pequena para auditar historico de publicaciones SEO manuales en una tabla dedicada, si el equipo necesita trazabilidad consultable fuera de `source_data_json`.

Ver tambien: `docs/SEO_DRAFT_REVIEW_WORKFLOW.md`.
