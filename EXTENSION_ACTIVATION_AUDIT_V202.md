# Auditoria activacion extension InmoRadar v2.0.2

Fecha: 2026-05-25

## Resumen ejecutivo

No se han podido leer KPIs reales del dashboard desde este entorno porque el endpoint autenticado:

```txt
GET https://www.inmoradar.app/api/admin?resource=extension/usage&preset=30d&timezone=Europe/Madrid&limit=20000
```

respondio `401 Unauthorized` sin token admin. No se han usado ni buscado credenciales reales.

Con el codigo actual si se puede confirmar el contrato de medicion:

- El dashboard lee `resource=extension/usage`.
- La tabla origen es `extension_usage_events`.
- Los usuarios reales se calculan por `anonymous_id_hash`.
- Las sesiones se calculan por `session_id_hash` o por ventanas de 30 minutos si falta sesion.
- La activacion se calcula como usuarios con al menos un evento de analisis completado.
- El dashboard no usa IP ni user-agent como identificador de usuario.

Resultado principal de auditoria: la caida exacta del funnel v2.0.2 no puede medirse con precision sin payload real o acceso al dashboard. Ademas, segun el contexto de producto, v2.0.2 envia `session_started`, `heartbeat`, `analysis_completed` y `analysis_error`, pero no queda confirmado que envie `extension_opened`, `listing_detected/page_detected` ni `analysis_started`. Esa falta de eventos intermedios impide distinguir una caida real de UX de una laguna de instrumentacion.

## Ruta de datos revisada

Endpoint publico de eventos:

```txt
POST https://www.inmoradar.app/api/extension-usage
```

Endpoint admin del dashboard:

```txt
GET /api/admin?resource=extension/usage&preset=30d
GET /api/admin?resource=extension/usage&from=YYYY-MM-DD&to=YYYY-MM-DD&timezone=Europe/Madrid
```

Handler:

```txt
api/_admin/handlers/extension-usage.js
```

Agregador:

```txt
lib/extension-usage/metrics.js
```

Eventos considerados analisis completados por el dashboard:

```txt
analysis_completed
page_analyzed
page_analysis_completed
```

Eventos deseados para funnel de activacion:

```txt
extension_opened
listing_detected
page_detected
analysis_started
analysis_completed
analysis_error
```

## KPIs observados

Estado: pendiente de datos autenticados.

Motivo: el endpoint admin devolvio `401 Unauthorized` desde este entorno y no se deben usar credenciales reales dentro del informe.

Tabla a completar tras exportar payload del dashboard filtrado a v2.0.2:

| KPI | Valor |
|---|---:|
| Rango auditado | Pendiente |
| Eventos v2.0.2 | Pendiente |
| Usuarios reales | Pendiente |
| Usuarios activados | Pendiente |
| Tasa de activacion | Pendiente |
| Sesiones | Pendiente |
| Sesiones por usuario | Pendiente |
| Analisis completados | Pendiente |
| Analisis completados por usuario | Pendiente |
| Errores de analisis | Pendiente |
| Errores por analisis iniciado | Pendiente |

## Formulas de auditoria

Usar solo eventos con:

```txt
extension_version = 2.0.2
```

Funnel:

| Paso | Formula |
|---|---|
| Aperturas | `count(event_name = extension_opened)` |
| Paginas/anuncios detectados | `count(event_name in [listing_detected, page_detected])` |
| Analisis iniciados | `count(event_name = analysis_started)` |
| Analisis completados | `count(event_name in [analysis_completed, page_analyzed, page_analysis_completed])` |
| Errores | `count(event_name = analysis_error)` |

KPIs:

| KPI | Formula |
|---|---|
| Usuarios reales | `count(distinct anonymous_id_hash)` |
| Usuarios activados | `count(distinct anonymous_id_hash where completed_analysis >= 1)` |
| Tasa de activacion | `usuarios_activados / usuarios_reales` |
| Sesiones por usuario | `sessions / usuarios_reales` |
| Analisis completados por usuario | `analysis_completed / usuarios_reales` |
| Errores por analisis iniciado | `analysis_error / analysis_started` |

Si `analysis_started = 0`, usar temporalmente:

```txt
analysis_error / (analysis_completed + analysis_error)
```

como proxy de tasa de fallo operativo, documentando que no mide intentos reales.

## Eventos faltantes o inconsistentes

1. `extension_opened`

   Necesario para saber si la extension se abre despues de instalarse. Si no existe, no se puede medir caida entre instalacion/uso inicial y deteccion.

2. `listing_detected` o `page_detected`

   Necesario para saber si el usuario llega a una pagina compatible y si la extension reconoce el contexto. Sin este evento, no se sabe si falla la deteccion o si el usuario nunca navega a una ficha.

3. `analysis_started`

   Necesario para separar abandono antes del analisis de errores durante el analisis. Si solo existen `analysis_completed` y `analysis_error`, la caida principal queda oscura.

4. `analysis_error`

   Debe incluir motivo saneado y no sensible, por ejemplo:

   ```txt
   unsupported_page
   missing_listing_data
   network_error
   timeout
   parser_error
   user_cancelled
   ```

5. Filtro por version

   El dashboard muestra desglose por version, pero el endpoint actual de resumen no expone claramente un filtro de funnel por `extension_version`. Para auditar v2.0.2 con rigor hace falta exportar filas o anadir un filtro read-only de version en una fase posterior.

## Principal punto de caida

No determinable con datos reales desde este entorno.

Diagnostico provisional:

- Si v2.0.2 no emite `extension_opened`, `listing_detected/page_detected` ni `analysis_started`, el principal problema no es todavia UX sino observabilidad incompleta del funnel.
- El primer punto de caida medible hoy seria `usuarios reales -> usuarios con analysis_completed`, pero ese salto mezcla varios problemas distintos:
  - el usuario no abre la extension;
  - el usuario no visita una pagina compatible;
  - la extension no detecta la ficha;
  - el usuario no inicia analisis;
  - el analisis falla;
  - el analisis completa correctamente.

## Recomendaciones priorizadas

### P0 - Completar eventos de funnel antes de redisenar

Cambios pequenos, sin refactor amplio:

1. Emitir `extension_opened` al abrir popup/panel.
2. Emitir `page_detected` cuando la extension detecte pagina compatible.
3. Emitir `listing_detected` si detecta datos suficientes de anuncio.
4. Emitir `analysis_started` justo antes de iniciar el flujo real de analisis.
5. Mantener `analysis_completed` y `analysis_error`.

Objetivo: poder saber si la caida ocurre antes de detectar pagina, antes de iniciar analisis o dentro del analisis.

### P1 - Onboarding minimo de primer uso

Sin cambiar arquitectura:

1. En primer `extension_opened`, mostrar una tarjeta breve:
   - "Abre un anuncio de Idealista o Fotocasa."
   - "Pulsa Analizar con InmoRadar."
   - "Veras precio, riesgos y senales del inmueble."
2. Boton secundario: "Ver ejemplo" si no hay pagina compatible.
3. Guardar localmente que el onboarding ya se vio.

### P1 - CTA contextual cuando hay pagina detectada

Cuando exista `page_detected/listing_detected`:

- Mostrar CTA claro: "Anuncio detectado. Analizar ahora".
- Evitar CTA generico si no hay anuncio compatible.
- Si faltan datos, explicar "No hemos detectado suficientes datos en esta pagina".

### P1 - Mejorar errores accionables

Para `analysis_error`:

- Mostrar mensaje corto y accionable.
- Incluir boton "Reintentar".
- Si la pagina no es compatible, sugerir abrir un anuncio concreto.
- No mostrar stack traces ni detalles tecnicos.

### P2 - Version filter read-only en dashboard

Fase posterior, no en esta auditoria:

- Anadir filtro `extension_version=2.0.2` al endpoint read-only `extension/usage`.
- Mantener payload existente si no se pasa filtro.
- Permitir auditorias por version sin export manual.

## Cambios sugeridos de bajo riesgo

1. Instrumentacion adicional en extension v2.0.3:
   - `extension_opened`
   - `page_detected`
   - `listing_detected`
   - `analysis_started`

2. Payload de `analysis_error` con motivo saneado:
   - `error_reason`
   - `stage`
   - `extension_version`

3. Microcopy de primer uso:
   - una sola tarjeta;
   - sin redisenar dashboard;
   - sin tocar backend salvo eventos.

4. Smoke test post-release:
   - instalar v2.0.3;
   - abrir popup;
   - visitar ficha compatible;
   - iniciar analisis;
   - completar analisis;
   - comprobar funnel en dashboard.

## Datos necesarios para cerrar la auditoria cuantitativa

Opcion A: exportar payload del endpoint admin con token local, sin pegar secretos:

```txt
GET /api/admin?resource=extension/usage&preset=30d&timezone=Europe/Madrid&limit=20000
```

Opcion B: exportar filas de `extension_usage_events` filtradas:

```sql
select
  event_name,
  anonymous_id_hash,
  session_id_hash,
  extension_version,
  duration_seconds,
  active_seconds,
  created_at
from extension_usage_events
where extension_version = '2.0.2'
order by created_at desc
limit 20000;
```

Con cualquiera de esos dos insumos se puede completar:

- KPIs observados;
- funnel por paso;
- principal punto de caida real;
- recomendaciones cuantificadas.

## Guardrails cumplidos

No se ha tocado:

- SEO;
- sitemap;
- billing;
- checkout;
- webhooks;
- rate limiting;
- integraciones externas;
- codigo runtime.
