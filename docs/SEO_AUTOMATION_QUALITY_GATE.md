# SEO Automation Quality Gate

## Resumen ejecutivo

El SEO automatico de InmoRadar queda reforzado con un quality gate unico para decidir si una landing generada puede publicarse y si puede entrar en sitemap/indexacion.

La regla base es conservadora: una pagina SEO solo puede publicarse e indexarse si supera `quality_score >= 80`, tiene contenido suficiente, fuentes visibles cuando proceda, canonical correcto, CTA medible hacia Chrome Web Store, enlaces internos, FAQ util, bloque de prudencia y no sugiere afiliacion oficial con portales inmobiliarios.

El objetivo no es generar mas paginas, sino evitar que paginas debiles, duplicadas, demasiado genericas o arriesgadas entren en produccion o en Google.

## Estado actual del SEO automatico

El sistema genera landings SEO desde oportunidades internas y datos de mercado, principalmente para:

- `price_city`: precio metro cuadrado por ciudad.
- `rent_city`: alquiler por ciudad.
- `expensive_listing_city`: saber si un piso esta caro en una ciudad.
- `editorial_guide`: guias editoriales como analizar antes de comprar, comparar pisos o negociar precio.

Los componentes principales revisados son:

- Generacion: `api/_seo/generator.js`.
- Autogeneracion programada: `api/_seo/autogeneration.js`.
- Scoring/calidad: `api/_seo/quality.js`.
- Render publico: `api/seo-page.js`.
- Sitemap: `api/sitemap.js`.
- Accion manual de publicacion en admin: `api/admin.js`.
- Tests SEO: `tests/seo.test.js` y `tests/seo-autogeneration.test.js`.

Antes de este endurecimiento, el score de calidad existia, pero la publicacion, indexacion, sitemap y publicacion manual no compartian un contrato unico suficientemente explicito. Tambien habia umbrales distintos, como sitemap/robots alrededor de 75, que podian permitir indexar paginas que no alcanzasen el umbral de calidad deseado.

## Riesgos detectados

- Paginas generadas con score aceptable pero sin todos los requisitos de publicacion prudente.
- Landings con CTA no medible o dificil de asociar a intencion de instalacion.
- Inclusion en sitemap basada solo en `status`, `index_status` y score, sin comprobar el resultado del gate.
- Publicacion manual desde admin con un umbral mas bajo que el nuevo criterio de indexacion.
- Paginas ciudad/barrio que podrian ser demasiado parecidas si solo cambia el nombre de la ciudad.
- Riesgo de contenido thin si falta fuente real, fecha, FAQ util o bloque especifico.
- Riesgo legal/comercial si se sugiere afiliacion oficial con Idealista, Fotocasa, Habitaclia u otros portales.
- Riesgo de promesa excesiva si el copy sugiere tasacion exacta, precio real definitivo o certeza absoluta.

## Cambios implementados

- Se anade `evaluateSeoQualityGate()` en `api/_seo/quality.js`.
- Se define `SEO_INDEX_MIN_SCORE = 80`.
- Se define `SEO_AUTOPUBLISH_MIN_SCORE = 80`.
- La generacion SEO solo publica si el gate permite publicar.
- La autogeneracion solo publica si el score configurado y el gate permiten publicar.
- Las landings guardan el resultado del gate en `source_data_json.quality_gate`.
- El render publico solo emite `index,follow` si la landing esta publicada, tiene `index_status = index`, score minimo 80 y el gate no bloquea indexacion.
- El sitemap solo consulta landings publicadas, indexables y con score minimo 80.
- El sitemap excluye landings cuyo `quality_gate.can_index` sea `false`.
- La publicacion manual desde admin rechaza la accion si el gate falla.
- Los resultados de generacion/autogeneracion exponen `quality_gate_passed` y `quality_gate_reasons` para depuracion interna.
- Se amplian tests SEO para comprobar CTA medible, canonical, noindex por gate, sitemap con umbral 80 y autogeneracion con gate.

## Criterios finales del quality gate

Una landing puede publicarse solo si cumple todos estos criterios:

- `quality_score_minimum`: score final igual o superior al minimo aplicable.
- `content_minimum`: al menos 700 palabras utiles.
- `required_meta`: `title`, `meta_title`, `meta_description` y `h1` presentes.
- `meta_unique`: title, H1 y meta description especificos y no duplicados.
- `canonical_valid`: canonical HTTPS de InmoRadar y alineado con el slug.
- `measurable_cta`: CTA SEO con `data-install-button` y `data-install-source="seo..."`.
- `internal_links`: al menos dos enlaces internos utiles.
- `faq_useful`: FAQ util y coherente con la pagina.
- `specific_content`: contenido especifico, no solo plantilla con ciudad cambiada.
- `prudence_block`: bloque de prudencia con referencia orientativa y aviso de no tasacion exacta.
- `third_party_independence`: sin texto que sugiera afiliacion oficial con portales.
- `not_street_exact`: no vender datos municipales como si fueran datos exactos de calle.
- `source_quality`: fuente real, fecha visible y nivel geografico suficiente cuando no sea guia editorial.
- `uniqueness`: sin duplicidad o similitud excesiva con landings existentes.

## Criterios de inclusion/exclusion en sitemap

Una landing SEO dinamica puede entrar en sitemap solo si:

- `status = published`.
- `index_status = index`.
- `quality_score >= 80`.
- `source_data_json.quality_gate.can_index` no es `false`.

El sitemap usa como `lastmod` la fecha mas fiable disponible:

- `published_at`.
- `updated_at`.
- `last_generated_at`.
- fecha actual como fallback.

Si una landing no cumple el gate, debe quedar fuera de sitemap aunque exista en base de datos. En el render publico debe salir como `noindex,follow`.

## Motivos de exclusion recomendados

Motivos directos del gate:

- `quality_score_minimum`
- `content_minimum`
- `required_meta`
- `meta_unique`
- `canonical_valid`
- `measurable_cta`
- `internal_links`
- `faq_useful`
- `specific_content`
- `prudence_block`
- `third_party_independence`
- `not_street_exact`
- `source_quality`
- `uniqueness`

Motivos operativos ya existentes o recomendados:

- `target_path_exists`
- `city_template_exists`
- `insufficient_source_data`
- `duplicate_title`
- `duplicate_h1`
- `duplicate_meta_title`
- `duplicate_meta_description`
- `too_similar_to_existing_page`
- `score_below_draft_threshold`
- `score_below_publish_threshold`
- `quality_gate_failed`
- `daily_limit_reached`
- `weekly_limit_reached`
- `run_limit_reached`

## Checklist de revision de landing

Antes de publicar una landing generada:

- Confirmar que el usuario entiende en pocos segundos que InmoRadar ayuda a analizar pisos antes de contactar.
- Revisar que el H1, title y meta description son especificos.
- Revisar que no promete tasacion exacta, precio real definitivo ni certeza absoluta.
- Revisar que el bloque de prudencia esta visible.
- Confirmar que los datos citan fuente y fecha cuando proceda.
- Confirmar que no se usan marcas de portales como si hubiera afiliacion oficial.
- Confirmar que el CTA hacia Chrome Web Store esta presente y trackeado como clic/intencion, no como instalacion.
- Confirmar que hay enlaces internos utiles y FAQ real.
- Comparar contra landings similares para evitar paginas que solo cambian ciudad/barrio.
- Confirmar que si falla cualquier criterio, la pagina queda `draft` o `noindex` y no entra en sitemap.

## Archivos revisados

- `api/_seo/autogeneration.js`
- `api/_seo/generator.js`
- `api/_seo/quality.js`
- `api/_seo/priceCity.js`
- `api/admin.js`
- `api/seo-page.js`
- `api/sitemap.js`
- `lib/seo/cityGuideTemplates.js`
- `tests/seo.test.js`
- `tests/seo-autogeneration.test.js`
- `robots.txt`
- `vercel.json`

## Archivos modificados

- `api/_seo/autogeneration.js`
- `api/_seo/generator.js`
- `api/_seo/quality.js`
- `api/admin.js`
- `api/seo-page.js`
- `api/sitemap.js`
- `tests/seo.test.js`
- `tests/seo-autogeneration.test.js`
- `docs/SEO_AUTOMATION_QUALITY_GATE.md`

## Tests/checks ejecutados

- `node --check api/_seo/quality.js`
- `node --check api/_seo/generator.js`
- `node --check api/_seo/autogeneration.js`
- `node --check api/sitemap.js`
- `node --check api/seo-page.js`
- `node --check api/admin.js`
- `node --check tests/seo.test.js`
- `node --check tests/seo-autogeneration.test.js`
- `node --test tests/seo.test.js tests/seo-autogeneration.test.js tests/status.test.js` (54/54 OK)
- `node --test tests/*.test.js` (232/232 OK)
- `git diff --check` (OK; solo avisos LF/CRLF de Git en Windows)

## Riesgos o pendientes

- Las landings antiguas pueden no tener `source_data_json.quality_gate`; el render publico y sitemap tratan esto de forma compatible, pero conviene recalcular el gate antes de republicarlas manualmente.
- El quality gate no sustituye una revision editorial cuando se cree una familia nueva de landings.
- La deteccion de similitud depende de los mecanismos existentes de unicidad; si se generan muchas paginas por barrios, conviene anadir comparacion mas estricta por embeddings o shingles.
- Los motivos del gate se guardan en JSON, pero el backoffice aun no muestra una UI especifica de motivos. La API de publicacion manual ya devuelve el detalle si falla.
- La medicion del CTA debe seguir llamandose clic o intencion de instalacion, no instalacion confirmada.

## Recomendacion de siguiente rama

Crear una rama corta para exponer los motivos del quality gate en el backoffice SEO sin redisenar la pantalla: lista de bloqueos, accion recomendada y estado `indexable/noindex`. Nombre sugerido:

`codex/seo-quality-gate-admin-reasons`
