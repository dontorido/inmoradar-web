# SITUACION ACTUAL DEL SISTEMA

Generado: 2026-05-23 11:49:29 +02:00

## 1. Resumen ejecutivo

El estado funcional principal es bueno:

- `main` local esta sincronizado con `origin/main`.
- Ultimo commit en `main`: `5ed0fd0 Merge BackOffice SEO performance UX`.
- Produccion ya sirve el BackOffice nuevo:
  - `Funnel y SEO Performance`: presente.
  - `ventas-funnel`: ausente.
  - `admin-seo-performance-panel`: presente.
  - `SEO Autogeneration`: presente.
  - `LinkedIn Autopublisher`: presente.
  - cache-buster `20260523-backoffice-seo-ux`: presente.
- Tests completos: `185/185` passing.
- No hay stashes.
- No hay cambios tracked pendientes.

La situacion pendiente no es de codigo roto, sino de higiene operativa:

- Hay 3 worktrees locales.
- Hay informes locales sin trackear.
- Hay una rama local antigua no integrada: `feature/content-consistency-install-flow`.
- Hay una PR abierta antigua de Vercel Web Analytics: PR #1, draft, no mergeable.
- Varias ramas remotas ya estan mergeadas en `main` y podrian limpiarse si se desea.

## 2. Worktrees locales

### Principal

Ruta:
`C:\Users\SergioTorío\Documents\Codex\inmoradar-web-seo-style-fix`

Estado:

- Rama: `main`
- Commit: `5ed0fd0`
- Tracking: `main...origin/main`
- Cambios tracked: ninguno.
- Sin trackear:
  - `BACKOFFICE_SEO_UX_ALERTS_REPORT.md`
  - `SEO_AUTOGENERATION_PRODUCTION_ACTIVATION.md`
  - `SITUACION_ACTUAL_SISTEMA.md`

Uso recomendado:

- Este debe quedar como worktree principal.
- Mantener `SEO_AUTOGENERATION_PRODUCTION_ACTIVATION.md` hasta terminar la activacion/validacion de autogeneracion SEO.
- `BACKOFFICE_SEO_UX_ALERTS_REPORT.md` y este informe son temporales, borrables cuando ya no hagan falta.

### Worktree antiguo

Ruta:
`C:\Users\SergioTorío\Documents\Codex\inmoradar-web`

Estado:

- Rama: `feature/linkedin-autopublisher-mvp`
- Commit: `bbce4c6 Merge main into LinkedIn autopublisher branch`
- Cambios tracked: ninguno.
- Sin trackear: ninguno.
- La rama remota `origin/feature/linkedin-autopublisher-mvp` fue eliminada tras `git fetch --prune`.
- El contenido de esta rama ya esta incluido en `main` por `f221b4b Merge pull request #7`.

Riesgo:

- Puede confundir si se abre o se sirve localmente desde aqui, porque no esta en `main` y la rama remota ya no existe.

Recomendacion:

- Conservar solo si se necesita consultar historia local.
- Si no se necesita, se puede eliminar el worktree en una limpieza posterior.

### Worktree detached

Ruta:
`C:\Users\SergioTorío\Documents\Codex\inmoradar-web-merge-owned`

Estado:

- `HEAD (no branch)`
- Commit: `a6a82d4 Merge remote-tracking branch 'origin/main' into HEAD`
- Cambios tracked: ninguno.
- Sin trackear: ninguno.
- El commit `a6a82d4` esta contenido en `main`.

Riesgo:

- Worktree detached antiguo. No parece contener trabajo pendiente, pero puede confundir.

Recomendacion:

- Candidato claro a eliminar en una limpieza posterior, si confirmamos que no se usa para revisar nada.

## 3. Ramas locales

### `main`

- Estado: sincronizada con `origin/main`.
- Ultimo commit: `5ed0fd0 Merge BackOffice SEO performance UX`.
- Es la rama principal valida.

### Ramas locales ya contenidas en `main`

Estas aparecen como mergeadas o contenidas en `main`:

- `codex/content-consistency-install-flow`
- `feature/backoffice-seo-performance-ux`
- `feature/linkedin-autopublisher-mvp`
- `feature/linkedin-tooltips`
- `feature/owned-analytics-learning`
- `feature/sales-funnel-quick-wins`
- `feature/seo-autogeneration`
- `feature/seo-daily-2-plus-2`
- `feature/viraliza-performance-learning`
- `feature/viraliza-real-creators-daily-plan`

Notas:

- `feature/owned-analytics-learning` tiene un commit local extra frente a su remoto (`c84d54e Elimina CTA exclusivo de Chrome`), pero ese commit esta contenido en `main`.
- `feature/backoffice-seo-performance-ux` tambien esta contenido en `main`; puede mantenerse hasta cerrar la revision.

### Rama local no integrada

`feature/content-consistency-install-flow`

- Commit no integrado: `2302233 Actualiza copy de instalacion y corrige contenido SEO`.
- La rama remota correspondiente ya no existe.
- Diff contra `main`: 20 archivos, principalmente copy publica y templates SEO:
  - `api/_seo/editorialGuides.js`
  - `api/_seo/generator.js`
  - `api/_seo/priceCity.js`
  - `article.html`
  - `cancel.html`
  - `clientes.html`
  - `contacto.html`
  - `datos.html`
  - `faq.html`
  - `index.html`
  - `lib/seo/cityGuideTemplates.js`
  - `llms-full.txt`
  - `llms.txt`
  - `metodologia.html`
  - `noticias.html`
  - `premium.html`
  - `privacidad.html`
  - `que-analiza.html`
  - `success.html`
  - `terminos.html`

Riesgo:

- No conviene borrar sin revisar. Puede ser un intento antiguo de limpieza/copy no fusionado.

Recomendacion:

- Revisarla por separado en una fase de contenido.
- No mezclarla con BackOffice, LinkedIn ni SEO Autogeneration.

## 4. Ramas remotas

### Remotas mergeadas en `origin/main`

Estas remotas estan contenidas en `origin/main`:

- `origin/feature/backoffice-seo-performance-ux`
- `origin/feature/content-clean-final`
- `origin/feature/linkedin-tooltips`
- `origin/feature/owned-analytics-learning`
- `origin/feature/sales-funnel-quick-wins`
- `origin/feature/seo-autogeneration`
- `origin/feature/seo-daily-2-plus-2`
- `origin/feature/viraliza-performance-learning`
- `origin/feature/viraliza-real-creators-daily-plan`
- `origin/codex/market-prices-api-extension`

Recomendacion:

- Son candidatas a limpieza remota si ya no se necesitan para PRs, auditoria o rollback.

### Remotas eliminadas durante fetch/prune

El `git fetch --all --prune` elimino referencias remotas obsoletas:

- `origin/codex/content-consistency-install-flow`
- `origin/feature/content-consistency-install-flow`
- `origin/feature/linkedin-autopublisher-mvp`
- `origin/feature/seo-interaction-attribution`

### Remota no mergeada

`origin/vercel/vercel-web-analytics-integrati-cbscn2`

- Commit: `6a62297 Add Vercel Web Analytics integration`.
- Cambios: inserta Vercel Web Analytics en 6 HTML (`index`, `premium`, `success`, `cancel`, `privacidad`, `terminos`).
- PR abierta: https://github.com/dontorido/inmoradar-web/pull/1
- Estado PR: abierta, draft, no mergeable.
- Autor: `vercel[bot]`.

Riesgo:

- Puede duplicar o interferir con analytics propio si se mezcla sin decision.
- La PR esta basada en un `main` muy antiguo.

Recomendacion:

- No mergear tal cual.
- Decidir explicitamente si se quiere Vercel Web Analytics ademas del tracking propio.
- Si no se quiere, cerrar PR #1 y borrar la rama remota.

## 5. Produccion

URL comprobada:
`https://www.inmoradar.app/admin`

Resultado de inspeccion HTML:

- `Funnel y SEO Performance`: true
- `ventas-funnel`: false
- `admin-seo-performance-panel`: true
- `SEO Autogeneration`: true
- `LinkedIn Autopublisher`: true
- `20260523-backoffice-seo-ux`: true
- HTML recibido: 81158 bytes

Conclusion:

- Produccion ya tiene el panel movido a Marketing -> SEO y Noticias.
- Produccion ya no muestra el bloque antiguo de Ventas en el HTML.
- El cache-buster nuevo esta desplegado.

## 6. Cron, Vercel y rutas admin

### Vercel

`vercel.json` no tiene seccion `crons`.

Esto es correcto para Vercel Hobby: evita el bloqueo por cron cada 6 horas.

Rewrites relevantes:

- `/api/admin/seo-autogenerate/run` -> `/api/admin?resource=seo-autogenerate/run`
- `/api/admin/linkedin/autopublisher/run` -> `/api/admin?resource=linkedin/autopublisher/run`
- `/backoffice/marketing/linkedin` -> `/admin.html`
- `/admin` -> `/admin.html`

### GitHub Actions

Workflow:
`.github/workflows/seo-cron.yml`

Frecuencia:

- `0 */6 * * *`

Endpoints:

- SEO Autogeneration:
  - `POST https://www.inmoradar.app/api/admin?resource=seo-autogenerate/run`
  - Header: `x-cron-secret`
- LinkedIn daily:
  - `POST https://www.inmoradar.app/api/admin?resource=linkedin/daily`
  - Header: `x-cron-secret`

Riesgo:

- El workflow depende de `CRON_SECRET` en GitHub Actions y Vercel.
- Si falla, el BackOffice debe alertar.

## 7. Tests y verificaciones ejecutadas

Verificaciones ejecutadas en `main`:

- `node --check api/admin.js`: OK
- `node --check assets/admin.js`: OK
- `node --test tests/*.test.js`: OK, `185/185`
- `git diff --check`: OK
- `git fetch --all --prune`: OK
- `git status` en los 3 worktrees: sin cambios tracked
- `git stash list` en los 3 worktrees: vacio
- inspeccion de produccion `/admin`: OK

## 8. Archivos con problemas o atencion pendiente

No hay archivos tracked con problemas detectados.

Archivos locales sin trackear en el worktree principal:

- `BACKOFFICE_SEO_UX_ALERTS_REPORT.md`
  - Informe temporal de la fase BackOffice SEO UX.
  - Borrable cuando ya no haga falta.
- `SEO_AUTOGENERATION_PRODUCTION_ACTIVATION.md`
  - Informe/instrucciones de activacion de autogeneracion SEO.
  - No borrar hasta terminar validacion de dry-run/publicacion real.
- `SITUACION_ACTUAL_SISTEMA.md`
  - Este informe.
  - Borrable cuando deje de ser util.

Elementos con atencion pendiente:

- `feature/content-consistency-install-flow`: rama local no integrada.
- `origin/vercel/vercel-web-analytics-integrati-cbscn2`: PR draft abierta no mergeable.
- `inmoradar-web-merge-owned`: worktree detached limpio, probablemente sobrante.
- `inmoradar-web`: worktree antiguo en rama local ya mergeada y sin remoto.

## 9. Recomendacion de limpieza segura

No ejecutar limpieza automatica sin confirmacion. Orden recomendado:

1. Revisar `feature/content-consistency-install-flow` y decidir si se rescata algo.
2. Cerrar o descartar PR #1 de Vercel Web Analytics si no se quiere analytics de Vercel.
3. Borrar ramas remotas ya mergeadas si no se necesitan para auditoria.
4. Borrar ramas locales mergeadas si no se necesitan.
5. Eliminar el worktree detached `inmoradar-web-merge-owned`.
6. Eliminar o archivar el worktree antiguo `inmoradar-web` si no se usa.
7. Mantener `SEO_AUTOGENERATION_PRODUCTION_ACTIVATION.md` hasta cerrar la fase de activacion.
8. Borrar informes temporales cuando ya esten revisados.

## 10. Veredicto

Sistema principal estable.

No hay evidencia de rotura actual en `main` ni en produccion para el BackOffice. La confusion venia de trabajo paralelo en ramas/worktrees y de que produccion aun no habia recibido el merge en el momento anterior. Ahora `main` y produccion ya reflejan:

- BackOffice SEO Performance en Marketing.
- LinkedIn Autopublisher conservado.
- SEO Autogeneration visible.
- Cron delegado a GitHub Actions.
- Vercel Cron desactivado.

