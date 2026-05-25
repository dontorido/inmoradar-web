# Preview check dashboard adquisicion backoffice

Fecha: 2026-05-25

## PR

- PR: https://github.com/dontorido/inmoradar-web/pull/20
- Titulo: `Redesign admin dashboard acquisition view`
- Rama origen: `feature/backoffice-dashboard-acquisition-redesign`
- Rama destino: `main`
- Commit runtime: `9444dde Redesign admin dashboard acquisition view`
- Commit validacion local: `899d3c9 Document dashboard acquisition redesign check`

## Preview

- Preview URL: https://inmoradar-web-git-feature-backoffice-514b81-sergio-s-projects15.vercel.app
- Backoffice URL revisada: https://inmoradar-web-git-feature-backoffice-514b81-sergio-s-projects15.vercel.app/admin
- Estado Vercel en GitHub: `Ready`
- Check GitHub/Vercel: `success`
- PR mergeable: si, tras recalculo de GitHub

## Resultado de acceso

Se intento acceder al preview de backoffice con `Invoke-WebRequest` sin credenciales ni bypass de Vercel.

Resultado:

- HTTP status: `401`
- Motivo: Vercel Authentication / Deployment Protection
- El preview llega a Vercel, pero no permite validar visualmente el backoffice desde este entorno sin una sesion autenticada o un `Protection Bypass for Automation`.

No se imprimieron ni usaron secretos.

## Resultado visual

No validado en navegador autenticado por bloqueo de Vercel Authentication.

Validacion previa disponible:

- Smoke local servido con `scripts/serve-static.js` confirmo que el HTML contiene:
  - tab visible `Dashboard`;
  - filtros `Desde`, `Hasta`, `Aplicar`, `Hoy`, `7d`, `30d`;
  - contenedor `data-dashboard-kpis`;
  - seccion `Adquisicion por fuente`;
  - seccion `Rendimiento por landing`;
  - seccion `Uso de la extension`.

Pendiente en preview/backoffice autenticado:

- Ver layout desktop.
- Ver layout responsive ancho medio/movil.
- Revisar consola sin errores JS.
- Confirmar llamadas API esperadas.
- Confirmar estados vacios con datos reales.
- Confirmar que otras secciones principales siguen accesibles.

## Resultado consola

No validado: requiere navegador autenticado en preview.

## Resultado APIs

No se ejecutaron llamadas autenticadas a `/api/admin`.

Motivo:

- No se debe usar ni solicitar token admin en este informe.
- El preview esta protegido por Vercel Authentication.
- La validacion local previa ya cubrio checks y tests.

## Zonas sensibles

No se tocaron ni se ejecutaron:

- SEO generation.
- SEO publish.
- noindex/archive/regenerate.
- operations/chrome.
- Meta.
- LinkedIn.
- billing.
- webhooks.
- Runway/social-video.
- Viraliza.
- rate limiting.
- extension ZIPs/manifests.

## Decision

Requiere validacion visual autenticada antes de merge.

Opciones seguras:

1. Abrir el preview desde una sesion autenticada de Vercel y revisar el checklist visual.
2. Generar un `Protection Bypass for Automation` temporal y repetir el smoke test con header.
3. Validar manualmente en Vercel Preview y comentar resultado en la PR.

No mergear hasta completar esa validacion visual o aceptar explicitamente el riesgo.
