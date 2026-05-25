# SEO_CANONICAL_INDEXATION_AUDIT

Fecha: 2026-05-25
Rama: `feature/seo-canonical-indexation-audit`

## Diagnostico inicial basado en Search Console

La decision SEO vigente es que la version canonica debe ser:

`https://inmoradar.app/`

No se reutiliza la rama anterior `feature/seo-indexation-audit` porque aquella auditoria habia corregido en sentido contrario, hacia `https://www.inmoradar.app/`. Esta rama nueva parte de la base previa limpia y mantiene la canonica sin `www`.

Search Console indica:

- Sitemap enviado: `https://inmoradar.app/sitemap.xml`
- Ultima lectura: 2026-05-24
- Paginas descubiertas: 51
- Sitemap procesado correctamente
- 1 pagina indexada y 3 paginas sin indexar en el informe agregado
- La inspeccion individual muestra que `https://inmoradar.app/saber-si-piso-esta-caro/granada/` puede aparecer indexada
- La variante `https://www.inmoradar.app/saber-si-piso-esta-caro/granada/` aparece como alternativa con canonical adecuada
- Pendiente principal: 1 URL en "Duplicada: el usuario no ha indicado ninguna version canonica"

## Version canonica elegida

Confirmada como canonical objetivo:

`https://inmoradar.app/`

Los cambios de esta rama mantienen sitemap, robots y canonicals en apex sin `www`.

## Estado del sitemap

Produccion pre-deploy:

- `https://inmoradar.app/sitemap.xml` responde primero `307` hacia `https://www.inmoradar.app/sitemap.xml`.
- Siguiendo la redireccion, el sitemap responde `200`.
- Contiene 51 URLs.
- 0 URLs del sitemap usan `www`.
- 0 URLs del sitemap usan `http`.
- 12 URLs son landings `/saber-si-piso-esta-caro/...`.
- Todas las 51 URLs del sitemap devuelven `307` como status inicial por la redireccion apex -> `www`.
- Siguiendo redirecciones, las 51 acaban en `200`.
- 0 URLs acaban con meta robots `noindex`.
- 0 canonicals detectadas apuntan a `www`.

Cambio local:

- El sitemap sigue generando URLs `https://inmoradar.app/...`.
- Se anade `/saber-si-piso-esta-caro/` al sitemap porque ahora existe una pagina editorial indexable y enlazada internamente.
- `siteUrl()` normaliza `PUBLIC_SITE_URL=https://www.inmoradar.app` a `https://inmoradar.app`, para no emitir sitemap/canonical con `www` aunque el entorno este mal configurado.

## Estado de robots.txt

`robots.txt` ya declaraba correctamente:

`Sitemap: https://inmoradar.app/sitemap.xml`

No se cambia. Tambien permite las familias SEO:

- `/precio-metro-cuadrado/`
- `/precio-alquiler/`
- `/saber-si-piso-esta-caro/`

## URLs auditadas

| URL | Resultado pre-deploy |
| --- | --- |
| `https://inmoradar.app/` | `307 -> https://www.inmoradar.app/ -> 200`; sin canonical/meta robots en la home desplegada. |
| `https://www.inmoradar.app/` | `200`; sin canonical/meta robots en la home desplegada. |
| `http://inmoradar.app/` | `308 -> https://inmoradar.app/ -> 307 -> https://www.inmoradar.app/ -> 200`. |
| `http://www.inmoradar.app/` | `308 -> https://www.inmoradar.app/ -> 200`. |
| `https://inmoradar.app/sitemap.xml` | `307 -> https://www.inmoradar.app/sitemap.xml -> 200`; 51 locs sin `www`. |
| `https://inmoradar.app/robots.txt` | `307 -> https://www.inmoradar.app/robots.txt -> 200`; declara sitemap apex. |
| `https://inmoradar.app/saber-si-piso-esta-caro/` | `307 -> https://www.inmoradar.app/saber-si-piso-esta-caro/ -> 404`. |
| `https://www.inmoradar.app/saber-si-piso-esta-caro/` | `404`. |
| `https://inmoradar.app/saber-si-piso-esta-caro/granada/` | `307 -> www -> 200`; canonical declarado `https://inmoradar.app/saber-si-piso-esta-caro/granada/`; `index,follow`. |
| `https://www.inmoradar.app/saber-si-piso-esta-caro/granada/` | `200`; canonical declarado hacia apex sin `www`; `index,follow`. |
| `https://inmoradar.app/saber-si-piso-esta-caro/granada` | `307 -> www sin slash -> 200`; canonical declarado con slash final. |
| `https://inmoradar.app/saber-si-piso-esta-caro/madrid/` | `307 -> www -> 200`; canonical apex; `index,follow`. |
| `https://inmoradar.app/saber-si-piso-esta-caro/barcelona/` | `307 -> www -> 200`; canonical apex; `index,follow`. |
| `https://inmoradar.app/saber-si-piso-esta-caro/valencia/` | `307 -> www -> 200`; canonical apex; `index,follow`. |
| `https://inmoradar.app/extension-chrome-inmobiliaria/` | `307 -> www -> 404`; no esta en sitemap. |

## Redirecciones encontradas

Las URLs `http` redirigen con `308` a `https`, lo cual es correcto.

El problema pendiente es que `https://inmoradar.app/*` redirige con `307` a `https://www.inmoradar.app/*`. Esto contradice la decision canonical sin `www`.

No se ha anadido un redirect `www -> apex` en `vercel.json` porque con la configuracion actual podria crear un bucle:

`https://inmoradar.app/* -> https://www.inmoradar.app/* -> https://inmoradar.app/*`

La correccion segura es configurar en Vercel/DNS que el dominio principal sea `inmoradar.app` y que `www.inmoradar.app` redirija permanentemente a apex.

## Canonical antes/despues

Antes:

- Landings SEO publicadas: canonical hacia apex sin `www`, correcto segun la decision SEO.
- Home y varias paginas estaticas del sitemap: sin canonical explicito.
- `api/seo-page.js` respetaba `canonical_url` tal cual; si una fila guardada venia con `www`, podia emitir canonical con `www`.

Despues:

- Home: canonical `https://inmoradar.app/`.
- Paginas estaticas del sitemap: canonical explicito sin `www`.
- Landings SEO: `canonicalForLanding()` normaliza a apex si la `canonical_url` guardada tiene el mismo path que el slug, aunque venga con `www`.
- Si una landing trae una canonical con path distinto, se conserva por si fuese una canonicalizacion deliberada.

## Estado de meta robots

Antes:

- Landings SEO revisadas: `index,follow`.
- Home y varias paginas estaticas: indexables por defecto, pero sin meta robots explicito.
- Sitemap completo: 0 URLs con `noindex` al seguir redirecciones.

Despues:

- Home y paginas estaticas del sitemap declaran `index,follow`.
- La nueva pagina `/saber-si-piso-esta-caro/` declara `index,follow`.
- Landings SEO mantienen la regla existente: publicadas + `index_status=index` + `quality_score >= 75` emiten `index,follow`; el resto queda `noindex,follow`.

## Revision de URL duplicada sin canonical

Search Console no expone en el contexto la URL exacta afectada. En la auditoria tecnica pre-deploy se detectaron 10 paginas estaticas del sitemap que terminaban en `200` pero no tenian canonical declarado en el HTML desplegado, entre ellas:

- `/`
- `/que-analiza`
- `/datos`
- `/noticias`
- `/premium`

Esto encaja con el motivo "Duplicada: el usuario no ha indicado ninguna version canonica". Se corrigen las paginas estaticas del sitemap con canonical explicito sin `www`.

## Revision de URLs con redireccion http

Las dos URLs vistas en GSC son esperables:

- `http://inmoradar.app/` usa `308` a `https://inmoradar.app/`, pero despues cae en `307` a `www`.
- `http://www.inmoradar.app/` usa `308` a `https://www.inmoradar.app/`.

La parte `http -> https` es correcta. Lo pendiente es la canonica de dominio `www/no-www`, no el protocolo.

## Landings incluidas en sitemap

Produccion pre-deploy contiene 12 landings de `/saber-si-piso-esta-caro/...`, incluyendo:

- `/saber-si-piso-esta-caro/sevilla/`
- `/saber-si-piso-esta-caro/valencia/`
- `/saber-si-piso-esta-caro/madrid/`
- `/saber-si-piso-esta-caro/barcelona/`
- `/saber-si-piso-esta-caro/granada/`

Todas las landings revisadas tienen canonical apex y `index,follow`.

## Landings excluidas del sitemap

`/saber-si-piso-esta-caro/` estaba excluida porque no existia y devolvia 404. Ahora se crea como pagina editorial indice y se incluye en sitemap.

`/extension-chrome-inmobiliaria/` sigue excluida y devuelve 404. No se corrige en esta rama porque no esta en sitemap y tocar esa ruta podria mezclarse con alcance de extension/marketing.

## Enlazado interno hacia landings SEO

Antes:

- Las landings existian y aparecian en sitemap, pero faltaba una pagina indice rastreable para la familia `/saber-si-piso-esta-caro/`.

Despues:

- Home incluye un bloque editorial "Guias por ciudad" con enlaces a:
  - `/saber-si-piso-esta-caro/`
  - `/saber-si-piso-esta-caro/madrid/`
  - `/saber-si-piso-esta-caro/barcelona/`
  - `/saber-si-piso-esta-caro/valencia/`
  - `/saber-si-piso-esta-caro/sevilla/`
  - `/saber-si-piso-esta-caro/granada/`
- Se crea `/saber-si-piso-esta-caro/` con contenido editorial y enlaces a ciudades prioritarias.

## Structured data

Se reviso el JSON-LD de landings SEO.

Bug claro:

- `BreadcrumbList` incluia un elemento intermedio de provincia/comunidad sin `item`, probable causa de aviso/invalidacion en "Rutas de exploracion".

Cambio:

- Breadcrumb de landings SEO queda en 3 niveles: InmoRadar, categoria, ciudad.
- Todos los `ListItem` tienen `item`.
- No se reestructura FAQ ni Dataset porque no se detecto un bug seguro y acotado en esta pasada.

## Cambios realizados

- Normalizacion de `siteUrl()` a apex sin `www`.
- Nuevo `canonicalForLanding()` para evitar canonicals `www` guardadas por error cuando el slug coincide.
- Soporte `HEAD` en `api/seo-page.js` y `api/sitemap.js`.
- Breadcrumb JSON-LD de landings simplificado y validable.
- Canonical/meta robots en home y paginas estaticas del sitemap.
- Creacion de `/saber-si-piso-esta-caro/`.
- Inclusion de `/saber-si-piso-esta-caro/` en sitemap y rewrites.
- Bloque editorial de enlazado interno en home.

## Archivos tocados

- `_redirects`
- `api/_seo/text.js`
- `api/seo-page.js`
- `api/sitemap.js`
- `assets/styles.css`
- `clientes.html`
- `contacto.html`
- `datos.html`
- `faq.html`
- `index.html`
- `noticias.html`
- `premium.html`
- `privacidad.html`
- `que-analiza.html`
- `saber-si-piso-esta-caro.html`
- `scripts/serve-static.js`
- `terminos.html`
- `tests/seo.test.js`
- `vercel.json`

## Pruebas ejecutadas

Produccion:

- `curl.exe -I https://inmoradar.app/` -> `307` a `https://www.inmoradar.app/`
- `curl.exe -I https://www.inmoradar.app/` -> `200`
- `curl.exe -I http://inmoradar.app/` -> `308` a `https://inmoradar.app/`
- `curl.exe -I http://www.inmoradar.app/` -> `308` a `https://www.inmoradar.app/`
- `curl.exe -I https://inmoradar.app/saber-si-piso-esta-caro/granada/` -> `307` a `www`
- `curl.exe -I https://www.inmoradar.app/saber-si-piso-esta-caro/granada/` -> `405` pre-deploy por falta de soporte `HEAD` en funcion
- `curl.exe -I https://inmoradar.app/saber-si-piso-esta-caro/granada` -> `307` a `www` sin slash
- `curl.exe -I https://inmoradar.app/sitemap.xml` -> `307` a `www`
- Auditoria GET de sitemap/robots/canonical/meta robots/redirecciones con PowerShell

Local:

- `node --check api/_seo/text.js`
- `node --check api/seo-page.js`
- `node --check api/sitemap.js`
- `node --check scripts/serve-static.js`
- `node --test tests/seo.test.js`
- `node --test tests/*.test.js`
- `git diff --check`

Nota: se uso el Node empaquetado en Codex porque `node.exe` del PATH de Windows devolvia "Acceso denegado".

## Riesgos pendientes

- Configuracion de dominio en Vercel: ahora mismo produccion redirige apex a `www` con `307`, contrario a la decision canonical. Debe corregirse fuera del codigo o en configuracion de dominio, evitando bucles.
- Tras cambiar el dominio principal, comprobar que `https://inmoradar.app/*` devuelve 200 directo y que `https://www.inmoradar.app/*` redirige 301/308 a apex.
- `/extension-chrome-inmobiliaria/` sigue 404; no esta en sitemap. Decidir si se elimina de comunicaciones externas o se crea una redireccion editorial.
- Las familias `/precio-metro-cuadrado/`, `/precio-alquiler/` y `/guias/` siguen sin pagina indice; no se tocaron para mantener alcance minimo.
- El sitemap pasara de 51 a 52 URLs al incluir `/saber-si-piso-esta-caro/`.

## Que revisar despues en Google Search Console

1. Reenviar `https://inmoradar.app/sitemap.xml`.
2. Confirmar que el sitemap procesado lista URLs `https://inmoradar.app/...` y no `www`.
3. Inspeccionar en vivo:
   - `https://inmoradar.app/`
   - `https://inmoradar.app/saber-si-piso-esta-caro/`
   - `https://inmoradar.app/saber-si-piso-esta-caro/granada/`
   - `https://inmoradar.app/saber-si-piso-esta-caro/madrid/`
4. Confirmar que "Canonical declarada por el usuario" es la misma URL sin `www`.
5. Confirmar que la URL en "Duplicada: el usuario no ha indicado ninguna version canonica" desaparece o queda identificada.
6. Revisar "Pagina con redireccion": deberian quedar solo variantes `http` y `www`, no URLs canonicas del sitemap.
7. Revisar "Rutas de exploracion" tras el recrawl de landings SEO.
