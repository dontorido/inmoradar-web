# SEO_PUBLIC_PAGES_QUALITY_REPORT.md

## 1. Resumen ejecutivo

Rama: `feature/seo-quality-mobile-kpi-audit`.

La revisión confirma que el render público ya tenía una barrera correcta de indexabilidad en página: solo emite `index,follow` cuando la landing está `published`, `index_status='index'` y `quality_score >= 75`.

El gap detectado estaba en el sitemap: consultaba `published + index`, pero no filtraba por `quality_score >= 75`. Eso podía hacer que una URL apareciera en sitemap aunque la página renderizada saliera como `noindex`.

También se confirmó una causa probable de textos sin tildes en páginas ya generadas: las landings antiguas guardadas en Supabase podían conservar `title`, `meta_title`, `h1` y `body_html` anteriores. La rama corrige el render para regenerar las plantillas visibles de `rent_city` y `expensive_listing_city` desde fuentes guardadas cuando hay datos suficientes, sin cambiar slugs ni lógica de publicación automática.

No se puede confirmar indexación real en Google sin acceso a Google Search Console.

## 2. Qué se ha corregido

- `api/sitemap.js`: añade `quality_score >= 75` a la consulta de `seo_landings` para alinear sitemap con meta robots.
- `api/seo-page.js`: las páginas `precio-alquiler/[ciudad]` y `saber-si-piso-esta-caro/[ciudad]` pueden regenerar HTML visible desde `source_data_json.sources` si existen fuentes reales.
- `api/seo-page.js`: se añade CSS responsive específico para móvil: H1 más contenido, grids y cards con wrap, prevención de overflow horizontal y CTA final apilado.
- `lib/seo/cityGuideTemplates.js` y `api/_seo/editorialGuides.js`: correcciones de tildes y signos de apertura en textos visibles.
- `assets/admin.js`: “Instalación” pasa a “Intención instalación” / “Intención”; se añade métrica separada de `Chrome Store`.
- `assets/admin.js`: “Score” en ranking de páginas pasa a “Índice interno”.
- `assets/admin.js`: se añaden tooltips que aclaran que la intención de instalación no confirma instalación real y que el índice interno no es una nota SEO sobre 100.
- `lib/analytics/learning.js`: recomendaciones y señales dejan de hablar de instalación real cuando miden intención/clic.

## 3. Indexabilidad auditada

Checklist de código:

- `/saber-si-piso-esta-caro/:city/` está cubierto por rewrites/rutas públicas.
- `api/seo-page.js` devuelve `index,follow` solo si:
  - `status === 'published'`
  - `index_status === 'index'`
  - `quality_score >= 75`
- `api/sitemap.js` ahora consulta solo:
  - `status=eq.published`
  - `index_status=eq.index`
  - `quality_score=gte.75`
- `canonical_url` se mantiene desde la landing o se construye con `siteUrl()`.
- CSS/JS públicos se sirven con rutas absolutas `/assets/...`.
- `robots.txt` no bloquea las rutas SEO públicas; bloquea zonas administrativas/API.

Limitación:

- La red local falló al reconsultar producción con `Invoke-WebRequest` durante la validación final. Antes de los cambios se había observado `200 OK` en la URL de Granada, pero con título sin tilde en producción. La comprobación de indexación real debe hacerse en Search Console.

## 4. Checklist Search Console

Para `https://www.inmoradar.app/saber-si-piso-esta-caro/granada/`:

1. Inspeccionar URL.
2. Confirmar “URL está en Google” o revisar motivo si no lo está.
3. Revisar canonical declarada y canonical elegida por Google.
4. Confirmar que no hay bloqueo por robots.txt.
5. Confirmar que la página rastreada muestra `index,follow`.
6. Confirmar que aparece en `https://www.inmoradar.app/sitemap.xml` solo si está publicada, indexable y con `quality_score >= 75`.
7. Solicitar indexación tras desplegar la corrección si la versión rastreada sigue mostrando copy antiguo.

## 5. Cambios de tildes

- “Como” → “Cómo” cuando es interrogativo.
- “esta caro” → “está caro” cuando es verbo.
- “Guia” → “Guía”.
- “senales” → “señales”.
- “segun” → “según”.
- Preguntas FAQ con `¿...?`.

No se cambian slugs; los slugs siguen sin tildes.

## 6. Cambios móviles

Se ajusta el render SEO público con reglas responsive a partir de `max-width: 560px`:

- H1 con `clamp()` más razonable.
- Cards y hero con padding menor.
- Meta badges a una columna.
- Fórmulas con overflow controlado.
- Stats con números que no rompen layout.
- CTA final apilado en móvil.
- Prevención de overflow horizontal en `.seo-page`.

## 7. Cambios KPI

El KPI anterior “Instalación” era engañoso porque medía clics/intención:

- `install_click`
- `chrome_store_click`
- `seo_cta_click`
- `guide_cta_click`
- `article_cta_click`

Ahora en UI se presenta como intención de instalación y se separa `Chrome Store`.

Pendiente real:

- “Instalaciones reales” debe medirse desde primer uso de extensión, evento de extensión o dato oficial atribuible, no desde clics web.

## 8. Score de performance

El valor tipo `170.5` no es un score SEO sobre 100. Es un índice interno calculado con señales de interacción, intención, checkout, waitlist, calculadora y scroll.

Se renombra en ranking a “Índice interno” y se añade tooltip:

> Puntuación interna basada en intención de instalación, checkout, waitlist, calculadora, scroll e interacción. No es una nota SEO sobre 100.

No se cambia la fórmula para evitar alterar decisiones históricas; solo se corrige la interpretación.

## 9. Tests ejecutados

Con Node bundled porque `node` del sistema devuelve `Acceso denegado`:

- `node --check api/seo-page.js`
- `node --check api/_seo/priceCity.js`
- `node --check api/_seo/editorialGuides.js`
- `node --check lib/seo/cityGuideTemplates.js`
- `node --check lib/analytics/learning.js`
- `node --check api/admin.js`
- `node --check assets/admin.js`
- `node --test tests/seo.test.js`: 16/16 OK
- `node --test tests/owned-analytics.test.js`: 16/16 OK
- `node --test tests/*.test.js`: 191/191 OK
- `git diff --check`: OK

Tests añadidos:

- Render `expensive_listing_city` regenera textos visibles con tildes desde fuentes guardadas.
- Sitemap exige `quality_score=gte.75`.
- BackOffice presenta intención de instalación e índice interno sin prometer instalaciones reales.

## 10. Validación manual recomendada

Tras desplegar la rama:

1. Abrir `/saber-si-piso-esta-caro/granada/` en desktop y móvil.
2. Confirmar título/H1 con `Cómo` y `está`.
3. Confirmar que no hay scroll horizontal en móvil.
4. Confirmar `meta robots` y canonical en el HTML.
5. Confirmar que `sitemap.xml` solo lista landings publicadas/indexables con `quality_score >= 75`.
6. En BackOffice, revisar “Funnel y SEO Performance”:
   - “Intención instalación”
   - “Chrome Store”
   - “Índice interno”
   - tooltips explicativos
   - botón “Ver página”.

## 11. Riesgos restantes

- Las páginas ya guardadas en Supabase pueden seguir teniendo metadatos antiguos si no se renderizan dinámicamente por falta de `source_data_json.sources`.
- La indexación real depende de Google Search Console y de que Google recrawlee la URL.
- “Instalaciones reales” sigue pendiente de atribución desde extensión/primer uso real.
- El índice interno sigue siendo bruto, no normalizado; queda aclarado en UI, pero podría añadirse un índice normalizado más adelante si se quiere comparar con escala 0-100.
