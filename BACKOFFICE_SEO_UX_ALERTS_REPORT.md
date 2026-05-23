# BACKOFFICE SEO UX ALERTS REPORT

## Rama usada
feature/backoffice-seo-performance-ux

## Sincronizacion con main
- Integrado origin/main tras el merge de LinkedIn Autopublisher.
- Se preserva LinkedIn Autopublisher y el panel Funnel SEO queda solo en Marketing -> SEO y Noticias.
- Se actualiza el cache-buster de admin.css/admin.js para evitar assets antiguos tras despliegue.

## Archivos modificados
- admin.html
- assets/admin.css
- assets/admin.js
- api/admin.js
- api/_seo/autogeneration.js
- tests/owned-analytics.test.js
- tests/seo-autogeneration.test.js

## Correcciones visuales
- El panel SEO Autogeneration usa tarjetas compactas y responsive.
- Estado y modo se muestran como badges legibles: Activo/Inactivo y Dry run/Publicacion real.
- Los limites Run, 24h y 7 dias se muestran como ratios con espacios, por ejemplo 3 / 2.
- Fechas de ultima/proxima ejecucion usan formato compacto.
- La tabla de runs tiene ancho minimo y detalle con wrapping para evitar desbordes.
- El selector de rango y los bloques de analytics hacen wrap en pantallas medianas.

## Funnel y SEO Performance
- Queda dentro de Marketing -> SEO y Noticias, debajo de Landings y Autogeneracion.
- Se ha retirado la instancia de Ventas para evitar duplicidad y que el flujo SEO viva en Marketing.
- La instancia SEO muestra resumen, ranking de paginas, segmentos por ciudad/template/tema y aprendizaje.

## Selector de dias
- Opciones: 1, 7, 30 y 90 dias.
- Valor por defecto: 7 dias.
- El selector recarga analytics/summary, analytics/pages y analytics/learning con days validado.
- Valores no permitidos caen a 7 dias.

## Alertas nuevas
- Critica si el ultimo run de autogeneracion SEO falla o el estado no responde.
- Critica si hay varios failures recientes.
- Warning si se exceden limites por run, 24h o 7 dias.
- Warning si esta activo dry-run.
- Warning si esta habilitado y no hay ejecuciones recientes.
- Info saludable si esta habilitado, hay run claro reciente y no existen warnings/criticas.
- Todas apuntan al panel Marketing -> SEO y Noticias -> Autogeneracion y son dismissible por el sistema actual.

## Tests ejecutados
- node --check api/admin.js
- node --check assets/admin.js
- node --check api/_seo/autogeneration.js
- node --check lib/analytics/learning.js
- node --test tests/seo-autogeneration.test.js
- node --test tests/owned-analytics.test.js
- node --test tests/*.test.js
- git diff --check

Resultado: OK. Suite completa tras integrar origin/main: 185/185 tests passing.

## Riesgos
- Pendiente validacion visual real en produccion para confirmar que las tarjetas no se desbordan con datos extremos.
- Las alertas dependen de que seo_cron_runs siga devolviendo result_json con conteos y status consistente.
- La alerta de dry-run puede ser esperada durante una fase de observacion y conviene dismissarla si se vuelve ruidosa.

## Validacion manual recomendada
- Abrir /admin -> Marketing -> SEO y Noticias.
- Revisar que Autogeneracion no desborda en desktop y ancho medio.
- Cambiar rango 1/7/30/90 dias y confirmar que resumen, ranking y aprendizaje se recargan.
- Forzar o inspeccionar un run con status failed/over-limit/dry-run para comprobar severidad y enlace.
- Confirmar que Ventas ya no muestra el panel Funnel y SEO Performance.
