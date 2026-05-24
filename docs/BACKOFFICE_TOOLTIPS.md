# BackOffice tooltips

Esta guia define como explicar KPIs, metricas, badges y acciones del BackOffice sin cambiar logica de negocio.

## Patron de uso

Hay dos formas aceptadas:

```html
<button data-help-key="seo-ready-auto-publish">Autopublicar ready</button>
```

```js
stat("Chrome Store", clicks, {
  id: "analytics-chrome-store",
  tooltip: "Clics hacia Chrome Web Store. No confirma instalacion ni uso posterior."
});
```

El helper global convierte `data-help-key` en `data-tooltip`, `title` y `aria-describedby`. El tooltip aparece con hover, focus de teclado y toque en pantallas tactiles. Para elementos renderizados en JS, usa `tooltipAttrs(...)`, `helpAttrs(...)`, `stat(...)` o `chip(...)`.

## Como anadir uno nuevo

1. Si el texto se reutiliza, anade una entrada a `HELP_TEXTS` en `assets/admin.js`.
2. Marca el HTML con `data-help-key="clave"`.
3. Si es un KPI, usa un `id` estable en `stat()` y anade su definicion a `KPI_HELP_TEXTS`.
4. Si es un badge/estado nuevo, anade su definicion a `STATUS_HELP_TEXTS`.
5. Si es una accion peligrosa, explica que hace, que no hace, y que condiciones la bloquean.
6. Si es un selector importante, no necesita siempre una clave propia: el helper genera una ayuda contextual segun el formulario. Usa `data-help-key` cuando la explicacion deba ser mas precisa.

## KPIs principales

- Chrome Store: clic hacia Chrome Web Store o flujo de instalacion. No equivale a instalacion real.
- Intencion instalacion: senal previa a instalar. No confirma instalacion ni uso posterior.
- Instalacion real: usar solo con evento fiable de instalacion, activacion o uso inicial.
- Extension opened: evento de apertura o inicio de sesion de uso de la extension.
- Listing detected: la extension detecto una pagina compatible con anuncio inmobiliario.
- Analysis started: usuario inicio un analisis.
- Analysis completed: analisis terminado correctamente.
- First listing analysis: primer analisis completado de un usuario anonimo.
- Ratio Chrome Store -> primer analisis: ratio agregado por ventana temporal; no es atribucion exacta usuario a usuario.
- Quality score: indice interno de calidad SEO. No es una metrica de Google.
- Quality gate: condiciones minimas internas para publicar o indexar una landing.
- Gate legacy: landing antigua sin `quality_gate` calculado. Recalcular antes de tratarla como apta.
- Ready to publish: draft revisado que puede publicarse si supera el ultimo gate y hay confirmacion.
- Published: landing publicada. No garantiza indexacion real, ranking ni trafico.
- Index status: marca interna `index`/`noindex`; no confirma indexacion real por buscadores.
- Sitemap included: URL incluida por reglas dinamicas del sitemap.
- Sitemap excluded: URL excluida por calidad, robots, canonical, estado o gate.
- Autopublish dry-run: simulacion visible del flujo de publicacion. No publica, no cambia indexacion y no toca sitemap.
- Autopublish real: publica solo con kill switches, confirmacion, limites y gates correctos.

## KPIs ambiguos

Regla: si un dato no prueba una accion final, el tooltip debe decirlo de forma explicita.

Ejemplos:

- No llamar instalacion a un clic a Chrome Store.
- No llamar conversion a un checkout iniciado si no hay pago confirmado.
- No presentar ratios agregados como atribucion usuario-a-usuario.
- No presentar quality score como metrica externa de Google.
- No presentar `published` como garantia de indexacion, ranking o trafico.

## Acciones peligrosas

Ejemplos de redaccion:

- Recalcular quality gate: recalcula calidad de una landing sin publicar, sin cambiar indexacion y sin tocar sitemap.
- Crear brief: genera una propuesta editorial, no una landing.
- Crear draft: crea un borrador no publicado y no indexado.
- Aprobar para publicacion: marca el draft como listo, pero no publica.
- Publicar: publica solo tras confirmacion y ultimo gate.
- Dry-run ciclo SEO: simula el ciclo automatico sin publicar ni persistir publicaciones reales.
- Ejecutar ciclo SEO automatico: ejecuta el ciclo con limites, kill switches y gates.
- Autopublicar ready: publica de forma limitada solo paginas `ready_to_publish`.
- Guardar brief: guarda el brief editorial, no publica.
- Aprobar/rechazar oportunidad: cambia el estado editorial, no crea ni publica paginas.

## Accesibilidad

- El tooltip debe estar disponible con hover y focus.
- No depender solo de color: el elemento con ayuda usa subrayado punteado o foco visible.
- Mantener textos breves: una o dos frases.
- En movil, el tooltip se muestra al toque durante unos segundos.
- No usar tooltips para ocultar condiciones criticas que deban estar visibles siempre.

## QA visual

La auditoria visual de cobertura vive en `docs/BACKOFFICE_TOOLTIPS_QA.md`. Al revisar una nueva seccion, toma al menos una captura con tooltip abierto y confirma que el texto dice que mide o hace la accion y que no mide o no hace.
