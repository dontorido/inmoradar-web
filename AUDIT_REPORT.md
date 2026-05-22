# AUDIT_REPORT.md

Fecha de auditoria: 2026-05-22.

Alcance: inspeccion estatica y segura del proyecto `inmoradar-web`, del estado git y de la estructura local bajo `C:\Users\SergioTorio\Documents\Codex`. No se han borrado archivos, no se ha modificado codigo funcional, no se han ejecutado refactors y no se han ejecutado tests.

Nota de ruta: el usuario indico como carpeta esperada `C:\Users\SergioTorio\Documents\Codex\inmoradar-releases`, pero esa carpeta no contiene `.git`. El unico repo git detectado bajo `Documents\Codex` esta en `C:\Users\SergioTorio\Documents\Codex\2026-05-13\puedes-revisar-los-avances-de-https\inmoradar-web`.

## 1. Resumen ejecutivo

El proyecto esta bastante avanzado y tiene una arquitectura coherente para Vercel Hobby: web estatica, API serverless compacta, backoffice protegido, Supabase como persistencia y modulos de dominio en `lib/` y `api/_*`.

El nivel de riesgo general es medio. No he detectado secretos reales hardcodeados en el repo git con las busquedas realizadas, pero si hay varios puntos delicados:

- La carpeta local `inmoradar-releases` contiene un archivo llamado `sergio.torio@gmail.com Backup authentication codes.txt`. No he leido su contenido, pero por nombre debe tratarse como material sensible y no deberia vivir dentro del arbol operativo de Codex.
- `api/admin.js`, `assets/admin.js`, `api/market-price.js` y `assets/admin.css` son archivos grandes y concentran mucha responsabilidad.
- Hay cambios locales sin commitear y muchos archivos sin trackear. Antes de cualquier limpieza hay que separar trabajo real de artefactos temporales.
- Hay un archivo de releases de extension fuera de git con muchos ZIPs y carpetas versionadas; parece archivo historico, no repo fuente.

Recomendacion inmediata: conservar el repo git real como fuente de verdad, mover/respaldar `inmoradar-releases` como archivo de builds, y hacer una limpieza por fases sin borrar nada hasta validar backups.

## 2. Estado del repositorio

- Ruta local analizada: `C:\Users\SergioTorio\Documents\Codex\2026-05-13\puedes-revisar-los-avances-de-https\inmoradar-web`.
- Ruta esperada por el usuario: `C:\Users\SergioTorio\Documents\Codex\inmoradar-releases`.
- Resultado: `inmoradar-releases` no es repo git; contiene carpetas `v1.0.8`, `v1.0.9`, `v1.0.10`, `v2.0.0`, ZIPs y builds unpacked de extension.
- Rama actual del repo git real: `main`.
- Remoto: `https://github.com/dontorido/inmoradar-web.git`.
- Ultimos commits:
  - `026b8b8 Complete agent instructions`
  - `87ae645 Add agent instructions`
  - `41a7a74 Add project context documentation`
  - `d9beeb2 Clamp Runway clips to provider duration`
  - `91716b8 Clarify Runway cost limit message`
- Estado frente a `origin/main`: `git rev-list --left-right --count HEAD...origin/main` devolvio `0 0`, por tanto coincide con el remoto conocido localmente.
- Estado git: rama sincronizada, pero con cambios locales no commiteados y archivos sin trackear.
- Cambios sin commitear detectados:
  - `DEPLOY.md`
  - `api/_reports/savedPropertiesEmail.js`
  - `api/health.js`
  - `api/og/price-city.js`
  - `assets/favicon.svg`
  - `contacto.html`
  - `datos.html`
  - `faq.html`
  - `premium.html`
  - `que-analiza.html`
- Resumen de diff local: 10 archivos, 73 inserciones y 27 eliminaciones.
- Archivos/carpetas sin trackear destacados:
  - logs vacios: `admin-preview.*`, `admin-redesign-preview.*`, `video-preview.*`
  - `api/waitlist/` (ya no debe existir como serverless function; la waitlist se resuelve por rewrite hacia `api/market-price.js?resource=browser-waitlist`)
  - `api/admin/`
  - `config/`
  - `tools/`
  - `assets/chrome-web-store/`
  - assets nuevos de icono/marca/checkout
  - previews PNG
  - CSV y JSON de mercado
  - `database/browser-waitlist-leads.sql`
  - `tests/browser-waitlist.test.js`
- `git clean -nd` lista candidatos, pero no se ha ejecutado limpieza real.

## 3. Arquitectura actual

Frontend:

- Paginas HTML estaticas en raiz (`index.html`, `premium.html`, `faq.html`, `contacto.html`, etc.).
- JS publico principal en `assets/app.js`.
- CSS publico en `assets/styles.css`.
- Consentimiento y tracking en `assets/consent.js`.

Backoffice:

- UI en `admin.html`.
- Logica en `assets/admin.js`.
- Estilos en `assets/admin.css` y `assets/admin-video-busy.css`.
- API compacta protegida en `api/admin.js`.

API:

- Funciones serverless CommonJS en `api/`.
- Router admin centralizado en `api/admin.js`.
- Router agregado publico en `api/market-price.js`.
- Utilidades compartidas en `api/_utils.js`.
- Rewrites en `vercel.json` y equivalentes parciales en `scripts/serve-static.js`.

Lib:

- Logica reutilizable en `lib/`: extension usage, operations, sales, SEO, social video y viraliza.
- `lib/social-video/*` y `lib/viraliza/*` son modulos bastante reutilizables.

Database:

- SQL declarativo en `database/`.
- Las migraciones no se ejecutan automaticamente; varias pantallas asumen modo degradado si faltan tablas.

Scripts:

- `scripts/serve-static.js`: servidor local con rewrites.
- `scripts/seo-generate.js`: dry run/generacion SEO.
- `scripts/import-market-public-reports.js`: importador CSV de fuentes publicas.
- `scripts/generate-hero.js`: generacion de hero.

Tests:

- Tests con `node:test` en `tests/*.test.js`.
- Cobertura por dominios: Lemon, SEO, Parking, Social Video, Viraliza, releases, usage, market, photo, etc.

Docs:

- `README.md`, `DEPLOY.md`, `PROJECT_CONTEXT.md`, `AGENTS.md`, `docs/*`.

## 4. Riesgos principales

Criticos:

- Archivo local sensible fuera de git: `inmoradar-releases\sergio.torio@gmail.com Backup authentication codes.txt`. No debe mezclarse con carpetas de trabajo ni subirse nunca.
- No hay un unico directorio local limpio: el repo git real no esta en `inmoradar-releases`, mientras `inmoradar-releases` guarda builds/ZIPs. Esto puede inducir a borrar o editar la carpeta equivocada.

Altos:

- `api/admin.js` concentra demasiadas responsabilidades: Premium, SEO, KPI, releases, Chrome, video, Runway, Viraliza. Cualquier cambio tiene mucho radio de impacto.
- `assets/admin.js` es muy grande y usa `innerHTML` intensivamente. Hay `escapeHtml` en muchos puntos, pero el riesgo de introducir XSS por descuido es real.
- Hay muchos archivos sin trackear que parecen trabajo valido reciente. Borrarlos sin revisar podria perder funciones o assets.
- Operaciones Runway y Chrome Web Store pueden tener coste/efecto externo si se invocan con credenciales reales.

Medios:

- CORS global con `access-control-allow-origin: *` en `api/_utils.js`. Es util para extension/web, pero conviene revisar endpoint por endpoint y limitar donde no haga falta.
- `api/health.js` expone bastante estado operativo de tablas y configuracion. No expone secretos, pero da informacion de superficie de ataque.
- Logs de errores pueden incluir payloads de proveedor: Runway en `api/admin.js` y OpenAI en `api/_photo/analysis.js` estan saneados parcialmente, pero conviene reducirlos en produccion.
- Diferencias entre `vercel.json` y `scripts/serve-static.js`: no todos los rewrites de produccion parecen replicados en local.
- `lib/extension-usage/metrics.js` usa fallback `"inmoradar"` si falta `EXTENSION_USAGE_HASH_SECRET` y `ADMIN_IMPORT_TOKEN`; esto es funcional, pero debil para hashing estable/anonymization.

Bajos:

- Archivos `.log` y `.err` vacios ensucian el repo local.
- Previews PNG y assets temporales pueden vivir mejor en `docs/archive` o fuera del repo.
- Algunas cadenas muestran mojibake en consola; riesgo bajo, pero puede empeorar si se editan docs/textos sin cuidado de encoding.

## 5. Seguridad

Secretos:

- No se detectaron patrones evidentes de secretos reales hardcodeados dentro del repo git con busquedas por `sk-`, `sb_secret_`, `ghp_`, `github_pat_`, `xox`, `client_secret`, `refresh_token`, `password` o bloques `BEGIN`.
- La documentacion usa nombres de variables, no valores reales.
- Riesgo local fuera de git: archivo de codigos de backup en `inmoradar-releases`.

Endpoints publicos:

- `api/market-price.js`, `api/check-premium.js`, `api/extension-version.js`, `api/parking-difficulty.js`, `api/seo-page.js`, `api/sitemap.js`, `api/lemonsqueezy-checkout.js`, `api/lemonsqueezy-webhook.js`.
- Varios endpoints aceptan input del usuario y hacen llamadas externas. En general hay validaciones y timeouts, pero algunos routers son muy grandes.

Admin:

- `api/admin.js` llama a `assertAdmin(req, res)` antes de despachar recursos.
- `ADMIN_IMPORT_TOKEN` se acepta por `Authorization: Bearer` o `x-admin-token`.
- El token admin se guarda en `sessionStorage` en `assets/admin.js`. Es razonable para backoffice simple, pero XSS en admin implicaria exfiltracion.
- Recomendacion: reforzar CSP en `admin.html` si se puede, y mantener escape estricto en todo `innerHTML`.

Supabase:

- Service role se usa solo desde backend via `api/_utils.js`.
- `supabaseFetch` evita enviar `Authorization: Bearer` cuando la key empieza por `sb_secret_` o `sb_publishable_`, correcto para nuevas keys.
- Riesgo: varios endpoints dependen de tablas opcionales; falta de tabla suele degradar, pero no siempre con el mismo formato.

Lemon Squeezy:

- Webhook usa HMAC y `crypto.timingSafeEqual`, correcto.
- Checkout y portal viven en backend.
- Portal usa magic link y token hasheado, buen patron.
- Recomendacion: mantener `ALLOW_LEMONSQUEEZY_TEST_MODE_IN_PRODUCTION` muy controlado.

Cloudflare/Resend:

- Email se envia desde backend.
- Contacto intenta Supabase y email con fallbacks.
- Revisar logs de fallo para no incluir cuerpos completos del proveedor si se amplian.

OpenAI:

- `OPENAI_API_KEY` se usa solo en backend.
- `api/_photo/analysis.js` intenta sanitizar errores con `safeOpenAIErrorBody`.
- En produccion, `openAIDebug` no deberia exponer detalles salvo `DEBUG_PHOTO_ANALYSIS=true`.

Runway:

- `RUNWAYML_API_SECRET`/`RUNWAY_API_SECRET` solo backend.
- Hay estimacion de coste, confirmacion manual, limite por render y presupuesto diario.
- Riesgo: `console.error("Runway create failed", { payload: error.payload })` podria registrar detalles de proveedor en logs. No parece incluir API key, pero conviene minimizar.

Chrome Web Store:

- Credenciales estan en variables de entorno.
- Backoffice puede ejecutar status/upload/publish solo via admin.
- Recomendacion: mantener acciones destructivas/externas con confirmacion explicita y auditoria en `release_artifacts`.

Logs y errores:

- Hay `console.error` en APIs principales. La mayoria loguea `error.message`; Runway y OpenAI incluyen payload parcial.
- `api/health.js` usa `safeError` para redaccion de JWT y `sb_secret_`, bien.

## 6. Rendimiento y rapidez

Endpoints potencialmente pesados:

- `api/admin.js?resource=summary`: consulta varias tablas y agregados; puede crecer mucho con Premium, SEO, parking y extension usage.
- `api/admin.js?resource=parking/summary`: lee hasta 100 filas recientes, aceptable.
- `api/admin.js?resource=extension/usage`: lee hasta 5000 eventos, puede volverse lento al crecer.
- `api/admin.js?resource=summary`: incluye lectura de `parking_difficulty_cache?limit=1000` y otros safeFetch.
- `api/market-price.js`: archivo grande con busqueda de candidatos, property assessment, contact, photo, address, parking; riesgo de endpoint multiuso pesado.
- `api/parking-difficulty.js`: puede llamar Nominatim, Photon, Overpass y Supabase; tiene cache, pero sigue siendo sensible a latencia externa.
- `api/_photo/analysis.js`: puede descargar/convertir imagenes, llamar OpenAI y cachear; muy sensible a coste/latencia.
- `api/admin.js?resource=social-video/render-content`: descarga clip remoto Runway con timeout 30s.

Llamadas externas:

- Supabase: `supabaseFetch` con timeout global por defecto 9s.
- Overpass: timeout 9s en `api/_parking/overpassClient.js`.
- Nominatim/Photon: timeout local 7s por candidato; puede acumularse con varios candidatos.
- Lemon Squeezy: algunas llamadas usan `fetch` directo sin `fetchWithTimeout` en `lemonRequest`.
- Cloudflare Email: timeout 12s.
- Resend: timeout 12s.
- OpenAI: usa fetch a Responses; revisar timeout efectivo segun `fetchOpenAIResponses`.
- Runway: create 20s, task 15s, content 30s.
- Chrome Web Store: timeout configurable por `CHROME_WEBSTORE_TIMEOUT_MS`, por defecto 60s.

Cache:

- Parking: memoria + Supabase, TTL 7 dias normal.
- Address intelligence: memoria + Supabase, TTL 60 dias.
- Photo condition analysis: memoria + Supabase, TTL 30 dias.
- SEO public pages/sitemap: headers con `s-maxage` y `stale-while-revalidate`.
- Market price: usa Supabase y fallback seed; no se detecto cache intermedia especifica.

Oportunidades:

- Separar agregados admin en funciones internas pequenas para que `summary` no crezca indefinidamente.
- Poner paginacion/ventanas temporales estrictas en extension usage.
- Normalizar todos los fetch externos a `fetchWithTimeout`.
- Reducir llamadas secuenciales en geocoding si hay cache por direccion antes de llamar Nominatim/Photon.
- Evitar que `api/market-price.js` siga acumulando recursos nuevos.

## 7. Robustez

Fallbacks:

- Supabase faltante: muchos endpoints devuelven modo degradado (`not_configured`, listas vacias o errores controlados).
- SEO: fallback seed si falla Supabase.
- Sitemap: fallback seed si falla Supabase.
- Market price: fallback seed si falla Supabase.
- Parking: fallback heuristico si Overpass falla, y mock para pruebas.
- Photo analysis: cache y errores estructurados para `no_images`, modelo no configurado y fallos.
- Runway: disabled by default, dry run, coste, presupuesto y reintento con prompt minimo.

Validaciones:

- Email y normalizacion en `api/_utils.js`.
- Admin search sanitizado.
- Release artifact input normalizado.
- Viraliza y Social Video tienen tests de quality/estructura.
- Waitlist untracked valida email/browser/source.

Errores:

- APIs responden JSON en general.
- `handleCors` y `json` centralizados ayudan.
- Hay formatos heterogeneos (`error`, `message`, `reason`, `ok`), conviene estandarizar a medio plazo.

Tests existentes:

- Buena cobertura por modulos criticos: Lemon, Market, SEO, Parking, Photo, Social Video, Viraliza, Releases, Extension Usage.
- Huecos: tests de integracion end-to-end del backoffice, tests de `api/admin.js` por recurso, tests de rewrites local vs Vercel, tests de seguridad/XSS en admin.

Zonas delicadas:

- Parking: varias fuentes externas y scoring.
- SEO: publicacion automatica y noindex/indexable.
- Social Video/Runway: coste real y payloads a proveedor.
- Viraliza: debe seguir human-in-the-loop.
- Premium: webhook y portal.
- Backoffice: token, XSS, acciones externas.

## 8. Escalabilidad y reutilizacion

Partes reciclables:

- `api/_utils.js`: JSON, CORS, admin token, Supabase, email helpers basicos.
- `lib/social-video/videoStrategyInmoRadar.js`: motor de briefs, variantes, captions y quality checks.
- `lib/viraliza/engine.js`: rutina diaria y scoring de acciones, reutilizable para otros productos si se parametriza marca/sector.
- `api/_parking/*`: scoring y fuentes parking, reutilizable si se separa de textos InmoRadar.
- `api/_seo/*` y `lib/seo/*`: generacion SEO programatica, reutilizable con plantillas.
- `lib/operations/releases.js`: modelo de artefactos y conectores.

Partes acopladas:

- `api/admin.js`: acopla UI admin, Supabase, integraciones externas y dominio.
- `assets/admin.js`: acopla estado, render, eventos, copy y llamadas API en un unico archivo.
- `api/market-price.js`: concentra mercado, contacto, KPI, address, property, parking y photo resources.
- HTML estatico repite nav/footer en muchas paginas.

Propuesta de capas:

- Rutas/API: mantener pocos entrypoints por Vercel Hobby, pero mover cada recurso a `api/_admin/*.js` o `lib/admin/*.js`.
- Servicios: `lib/services/{premium,seo,parking,video,viraliza}` con funciones puras o semi-puras.
- Persistencia: wrappers por tabla en `lib/persistence/*` para centralizar paths Supabase y fallbacks.
- UI: dividir `assets/admin.js` en modulos si se introduce bundling ligero; mientras no haya build, crear helpers organizados dentro del mismo archivo o usar scripts separados cargados explicitamente.
- Reutilizacion: parametrizar marca, producto, dominios, colores y copy en configs, no en motores.

## 9. Limpieza de codigo

| archivo/carpeta | motivo | evidencia | riesgo de borrar | recomendacion |
|---|---|---|---|---|
| `admin-preview.err`, `admin-preview.log`, `admin-redesign-preview.err`, `admin-redesign-preview.log`, `video-preview.err`, `video-preview.log` | logs locales vacios | `git clean -nd` los listaria; longitud 0 | bajo | seguro de borrar despues de confirmar que no hay procesos vivos |
| `growth-video-backoffice-preview.png`, `inmoradar-web-redesign-preview.png`, `viraliza-backoffice-preview.png` | capturas temporales en raiz | untracked PNG de preview | medio | mover a `docs/archive` o borrar despues de backup |
| `assets/chrome-web-store/` | assets de store no trackeados | carpeta completa untracked con capturas/promo | medio | revisar antes; probablemente conservar si son assets oficiales |
| `assets/lemon-checkout-inmoradar-premium*.png` | capturas checkout no trackeadas | untracked y grandes | medio | mover a docs/archive si solo son referencia |
| `assets/inmoradar-brand-mark.jpg`, `assets/inmoradar-brand-mark-transparent.png`, `assets/favicon-192.png`, `assets/apple-touch-icon.png` | assets de marca no trackeados | pueden ser necesarios para favicon/store | alto | no borrar sin revisar uso en HTML/Vercel/Store |
| `data/market-price-report-sources.json` | config local de importacion | sample si esta trackeado, real no | alto | revisar manualmente; podria contener fuentes de trabajo |
| `market-price-public-reports.csv` | salida generada por importador | archivo CSV en raiz | medio | mover fuera del repo o regenerar cuando haga falta |
| `lib/browser-waitlist.js`, `database/browser-waitlist-leads.sql`, `tests/browser-waitlist.test.js` | feature de waitlist integrada | la ruta publica `/api/waitlist/browser` reescribe a `api/market-price.js?resource=browser-waitlist` para evitar otra serverless function | no borrar | conservar y ejecutar SQL en Supabase antes de produccion |
| `api/admin/` | untracked segun `git clean -nd` | no aparecio en `git status` inicial resumido, pero si en clean dry-run | alto | revisar manualmente antes de tocar |
| `tools/` | utilidades webstore no trackeadas | scripts y HTML de screenshots | medio | revisar; probablemente mover a repo si son utiles |
| `DEPLOY.md` | cambios locales no commiteados | 36 inserciones | alto | no borrar; revisar diff y decidir commit/revert |
| `api/_reports/savedPropertiesEmail.js`, `api/health.js`, `api/og/price-city.js` | cambios locales en codigo | diff local | alto | no borrar ni sobrescribir; revisar con autor |
| `contacto.html`, `datos.html`, `faq.html`, `premium.html`, `que-analiza.html` | cambios locales en paginas | diff local | alto | no borrar ni sobrescribir; revisar con autor |
| `api/admin.js` | archivo demasiado grande | 1553 lineas, muchas responsabilidades | no borrar | modularizar progresivamente |
| `assets/admin.js` | archivo demasiado grande | 3573 lineas, mucho `innerHTML` | no borrar | modularizar/extraer render helpers con tests |
| `api/market-price.js` | router publico multiuso grande | 1394 lineas | no borrar | extraer recursos a servicios internos |
| `assets/admin.css` | CSS admin grande | 3288 lineas | no borrar | organizar por secciones cuando haya tiempo |
| `llms.txt`, `llms-full.txt` | docs para LLM/bots | trackeados | bajo | conservar salvo que se decida estrategia SEO/LLM |
| `BingSiteAuth.xml` | verificacion buscador | trackeado | alto | no borrar |

Clasificacion general:

- Seguro de borrar: solo logs vacios, despues de confirmar que no se necesitan.
- Revisar antes: previews PNG, CSV generado, screenshots store, tools, assets checkout.
- No borrar: codigo modificado, assets de marca/favicons, SQL de features, Bing auth.
- Mover a docs/archive: capturas temporales y screenshots si no se usan publicamente.
- Fusionar con otro archivo: docs Runway/DEPLOY si se detectan contradicciones de ratio/modelo.

## 10. Limpieza local de carpetas

| ruta local | tiene .git | rama | remoto | cambios pendientes | archivos sin trackear | recomendacion |
|---|---:|---|---|---|---|---|
| `C:\Users\SergioTorio\Documents\Codex\2026-05-13\puedes-revisar-los-avances-de-https\inmoradar-web` | si | `main` | `https://github.com/dontorido/inmoradar-web.git` | si | si | conservar; es el repo git real y activo |
| `C:\Users\SergioTorio\Documents\Codex\inmoradar-releases` | no | n/a | n/a | n/a | n/a | revisar manualmente; parece archivo de builds, no repo fuente |
| `C:\Users\SergioTorio\Documents\Codex\inmoradar-releases\v2.0.0` | no | n/a | n/a | n/a | n/a | conservar como ultimo archivo de releases o mover a backup externo |
| `C:\Users\SergioTorio\Documents\Codex\inmoradar-releases\v1.0.10` | no | n/a | n/a | n/a | n/a | se podria borrar despues de backup si v2.0.0 y stores ya lo sustituyen |
| `C:\Users\SergioTorio\Documents\Codex\inmoradar-releases\v1.0.9` | no | n/a | n/a | n/a | n/a | se podria borrar despues de backup |
| `C:\Users\SergioTorio\Documents\Codex\inmoradar-releases\v1.0.8` | no | n/a | n/a | n/a | n/a | se podria borrar despues de backup |
| `C:\Users\SergioTorio\Documents\Codex\inmoradar-releases\sergio.torio@gmail.com Backup authentication codes.txt` | no | n/a | n/a | n/a | n/a | mover inmediatamente a gestor seguro o ubicacion privada; no dejar en Codex |
| `C:\Users\SergioTorio\Documents\Codex\2026-05-13\puedes-revisar-los-avances-de-https\inmoradar-v*` | no detectado | n/a | n/a | n/a | n/a | revisar manualmente; parecen copias historicas de extension/prototipos |
| `C:\Users\SergioTorio\Documents\Codex\2026-05-13\puedes-revisar-los-avances-de-https\pisoradar-v*` | no detectado | n/a | n/a | n/a | n/a | revisar manualmente; parecen copias historicas anteriores al naming actual |
| `C:\Users\SergioTorio\Documents\Codex\2026-05-13\puedes-revisar-los-avances-de-https\noise-score-api` | no detectado | n/a | n/a | n/a | n/a | revisar manualmente; posible experimento separado |
| `C:\Users\SergioTorio\Documents\Codex\2026-05-14\redise-a-la-web-y-hazla` | no detectado | n/a | n/a | n/a | n/a | revisar; contiene `.pnpm-local`, `dist` y extension unpacked, probablemente temporal |
| `C:\Users\SergioTorio\Documents\Codex\2026-05-14\aqu-tienes-un-prompt-completo-para` | no detectado | n/a | n/a | n/a | n/a | revisar manualmente |
| `C:\Users\SergioTorio\Documents\Codex\2026-05-18` | no en raiz | n/a | n/a | n/a | n/a | revisar manualmente |
| `C:\Users\SergioTorio\Documents\Codex\2026-05-19` | no en raiz | n/a | n/a | n/a | n/a | revisar manualmente; contiene workspace actual anterior |
| `C:\Users\SergioTorio\Documents\Codex\2026-05-20` | no en raiz | n/a | n/a | n/a | n/a | revisar manualmente |
| `C:\Users\SergioTorio\Documents\Codex\backoffice-screenshots` | no | n/a | n/a | n/a | n/a | mover a archive o borrar despues de backup si solo son capturas |
| `C:\Users\SergioTorio\Documents\Codex\.pnpm-store` | no | n/a | n/a | n/a | n/a | cache de dependencias; se puede regenerar, borrar solo si necesitas espacio |

Conclusion local: no conviene quedarte solo con `inmoradar-releases`, porque no es repo git. La carpeta fuente que deberia conservarse como repositorio limpio es `...\inmoradar-web`. `inmoradar-releases` puede conservarse como archivo de paquetes publicados, pero no como fuente principal.

## 11. Tests y validaciones recomendadas

Antes de limpieza:

- `git status -sb`
- `git diff --stat`
- `git clean -nd`
- Revisar manualmente cada untracked con posible valor real.
- Hacer backup externo de `inmoradar-releases` antes de borrar nada.

Despues de limpieza de docs/assets:

- `npm test`
- `npm run serve`
- Abrir `/`, `/admin`, `/premium`, `/sitemap.xml`.

Antes de tocar dominios concretos:

- Parking: `node --test tests/parking-difficulty.test.js` y `node --test tests/parking-intelligence.test.js`
- SEO: `node --test tests/seo.test.js` y `npm run seo:generate -- --limit=5 --dry-run`
- Social Video/Runway: `node --test tests/social-video.test.js`
- Viraliza: `node --test tests/viraliza.test.js`
- Premium: `node --test tests/lemonsqueezy.test.js`, `node --test tests/revenue.test.js`, `node --test tests/saved-properties-email.test.js`
- Releases/Chrome: `node --test tests/releases.test.js` y `node --test tests/chrome-webstore.test.js`

Validaciones manuales:

- Verificar que `vercel.json` y `scripts/serve-static.js` coinciden en rutas criticas.
- Probar `/api/health` en local y produccion.
- Probar backoffice sin credenciales reales de Runway/Chrome salvo accion explicitamente solicitada.

No se ejecutaron tests durante esta auditoria porque el pedido era solo inventario/documentacion y existen cambios locales previos ajenos que no conviene mezclar con ejecuciones o regeneraciones.

## 12. Plan de accion propuesto

Fase A: limpieza segura de documentacion/assets obvios.

1. Hacer backup externo de `Documents\Codex` o, como minimo, de `inmoradar-releases`.
2. Mover el archivo de codigos de backup fuera de `Codex` a un gestor seguro.
3. Borrar o archivar logs vacios.
4. Mover capturas temporales PNG a `docs/archive` o fuera del repo.
5. Decidir si `assets/chrome-web-store/` debe commitearse como assets oficiales.
6. Waitlist rescatada: mantenerla dentro de `lib/browser-waitlist.js` y no recrear `api/waitlist/browser.js` como funcion serverless independiente.

Fase B: refactor pequeno y modularizacion.

1. Extraer de `api/admin.js` servicios internos por recurso: `summary`, `premium`, `seo`, `kpis`, `releases`, `socialVideo`, `viraliza`.
2. Mantener un solo entrypoint `api/admin.js` para Vercel Hobby, pero delegar logica.
3. Extraer de `api/market-price.js` recursos publicos a modulos: contacto, kpi settings, address, property, parking, photo.
4. En `assets/admin.js`, agrupar renderers por seccion o separar scripts cargados en `admin.html` si no se introduce build.

Fase C: seguridad y validacion de endpoints.

1. Revisar CORS por endpoint; mantener `*` solo donde sea necesario.
2. Reducir logs con payloads externos en produccion.
3. Revisar `api/health.js` para decidir si parte del detalle debe ser admin-only.
4. Asegurar `EXTENSION_USAGE_HASH_SECRET` obligatorio en produccion.
5. Revisar CSP para paginas publicas y admin.

Fase D: rendimiento/cache/timeouts.

1. Estandarizar llamadas externas con `fetchWithTimeout`.
2. Revisar Lemon `fetch` directo y pasar a timeout.
3. Limitar extension usage por rango temporal y paginacion.
4. Cachear geocoding por direccion si aun no entra por address intelligence.
5. Revisar `summary` admin para no leer tablas grandes innecesariamente.

Fase E: preparacion para reutilizar codigo en otros proyectos.

1. Convertir motores reutilizables a modulos configurables por marca.
2. Separar persistencia Supabase de logica pura.
3. Documentar contratos de entrada/salida por dominio.
4. Mantener tests por motor.
5. Crear un checklist de "nuevo proyecto" para SEO, videos, viralizacion, releases y billing.

## 13. Acciones que NO recomiendas hacer todavia

- No borrar `inmoradar-releases` completo hasta confirmar que todos los ZIPs/builds estan en backup o en el backoffice.
- No borrar el repo git real antiguo por su ruta con fecha; ahora mismo es la unica fuente versionada detectada.
- No ejecutar `git clean -fd`; solo usar `git clean -nd` hasta clasificar untracked.
- No revertir cambios locales sin identificar autor/proposito.
- No mover secretos o codigos de backup a otro sitio con comandos automaticos sin confirmacion manual.
- No dividir `api/admin.js` en varias serverless functions sin revisar limite de Vercel Hobby.
- No tocar webhook Lemon ni Chrome Web Store sin tests y plan de rollback.
- No activar Runway por defecto ni subir presupuestos sin confirmacion explicita.
- No publicar landings SEO en lote hasta revisar calidad y fuentes.
- No asumir que `inmoradar-releases` es el repo principal; no lo es segun inspeccion actual.
