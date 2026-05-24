# SEO Keyword Backlog

## Resumen ejecutivo

El backlog SEO es una capa previa a la generacion de landings. Sirve para registrar oportunidades, priorizarlas y convertirlas en briefs revisables antes de crear contenido.

Ahora puede persistirse en Supabase mediante la tabla `seo_keyword_backlog`. No genera paginas, no publica landings, no cambia sitemap y no evita el quality gate. Su funcion es ayudar a decidir que merece pasar a produccion editorial.

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
- acciones "Aprobar" y "Rechazar".

Crear o editar una oportunidad persiste el backlog si Supabase esta disponible. Ver un brief no crea contenido ni modifica datos. Guardar un brief persiste `brief_json`, pero no crea landings, no publica y no toca sitemap.

## Controles de calidad

Antes de convertir un brief en landing:

- Confirmar que hay fuente real y fecha cuando la pagina dependa de datos locales.
- Confirmar que el H1, title y meta description no duplican paginas existentes.
- Confirmar que el CTA sera medible como clic/intencion, no instalacion confirmada.
- Confirmar bloque de prudencia: referencia orientativa, no tasacion exacta.
- Confirmar bloque de independencia: sin afiliacion oficial con portales inmobiliarios.
- Confirmar que no es una pagina thin ni una plantilla que solo cambia ciudad.

## Flujo editorial

1. Crear oportunidad manual o revisar seed/fallback.
2. Ajustar prioridad, dificultad, riesgo y landing sugerida.
3. Generar brief para revision.
4. Guardar brief cuando tenga sentido editorial.
5. Marcar como `approved` o `rejected`.
6. Pasar las aprobadas a una futura rama de generacion controlada de landing.

## Acciones que NO hace

- No genera landings.
- No publica landings.
- No cambia `seo_landings`.
- No cambia sitemap.
- No cambia canonical, robots ni quality gate.
- No indexa contenido.

## Limitaciones

- El fallback a seeds es solo operativo/desarrollo; no sustituye la persistencia editorial.
- No hay batch de importacion en esta rama.
- La dificultad es manual y orientativa.
- Una oportunidad `approved` solo indica decision editorial; no implica publicacion.

## Siguiente rama recomendada

Crear una rama pequena para convertir oportunidades aprobadas en drafts SEO controlados, manteniendo dry-run, quality gate y revision manual antes de publicar.
