# SEO Keyword Backlog

## Resumen ejecutivo

El backlog SEO es una capa previa a la generacion de landings. Sirve para registrar oportunidades, priorizarlas y convertirlas en briefs revisables antes de crear contenido.

No genera paginas, no publica landings, no cambia sitemap y no evita el quality gate. Su funcion es ayudar a decidir que merece pasar a produccion editorial.

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
- `created_at`
- `updated_at`
- `brief_json` opcional si existe almacenamiento persistente

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

## BackOffice

La seccion SEO muestra una tabla "Oportunidades y briefs" con:

- keyword;
- intencion;
- tipo;
- prioridad;
- estado/riesgo;
- boton "Ver brief".

Ver un brief no crea contenido ni modifica datos. Solo renderiza la propuesta editorial para revision.

## Controles de calidad

Antes de convertir un brief en landing:

- Confirmar que hay fuente real y fecha cuando la pagina dependa de datos locales.
- Confirmar que el H1, title y meta description no duplican paginas existentes.
- Confirmar que el CTA sera medible como clic/intencion, no instalacion confirmada.
- Confirmar bloque de prudencia: referencia orientativa, no tasacion exacta.
- Confirmar bloque de independencia: sin afiliacion oficial con portales inmobiliarios.
- Confirmar que no es una pagina thin ni una plantilla que solo cambia ciudad.

## Limitaciones

- No hay escritura persistente del backlog si no existe tabla `seo_keyword_backlog`.
- No hay generacion automatica de landings desde brief.
- No hay batch ni publicacion desde esta rama.
- La dificultad es manual y orientativa.

## Siguiente rama recomendada

Crear una rama para persistir cambios editoriales del backlog en Supabase si se decide crear la tabla `seo_keyword_backlog`:

`codex/seo-keyword-backlog-persistence`
