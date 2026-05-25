# UX activation improvement options v2.0.3

Fecha: 2026-05-25

## Alcance

Documento de propuesta. No implementa cambios UX ni toca runtime, scraping, backend, SEO, sitemap, billing, checkout, webhooks, rate limiting ni Chrome Web Store.

Se intento leer `EXTENSION_V203_FUNNEL_OBSERVATION.md` antes de preparar esta propuesta. El archivo no existe en este repo en el momento de redactar este documento, por lo que no hay datos reales de funnel v2.0.3 disponibles aqui.

Conclusion: la principal caida real no es determinable todavia. Esta propuesta queda condicionada a recibir el informe de funnel v2.0.3 y debe priorizarse de nuevo con esos datos.

## Matriz condicional de caida

Usar esta matriz cuando llegue `EXTENSION_V203_FUNNEL_OBSERVATION.md`. No inferir caidas a partir de eventos agregados si faltan pasos intermedios.

| Escenario observado | Lectura probable | Mejoras candidatas | Prioridad provisional |
|---|---|---|---|
| Alto `extension_opened`, bajo `page_detected/listing_detected` | El usuario abre la extension fuera de una ficha compatible o no entiende donde usarla. | 1, 2 | Alta |
| Alto `page_detected/listing_detected`, bajo `analysis_started` | La ficha se detecta, pero el usuario no ve valor o no reconoce el CTA principal. | 3 | Alta |
| Alto `analysis_started`, bajo `analysis_completed` | El usuario espera sin feedback, abandona, o el flujo falla durante el analisis. | 4, 5 | Alta |
| Alto `analysis_error` respecto a `analysis_started` | Hay friccion tecnica o estados recuperables mal explicados. | 5 | Alta |
| Alto `analysis_completed`, baja recurrencia posterior | La activacion inicial funciona; conviene investigar valor percibido tras resultado. | Fuera de este alcance | Media |

Si el informe solo contiene `session_started`, `heartbeat`, `analysis_completed` y `analysis_error`, el salto "usuarios reales -> usuarios activados" mezcla demasiadas causas. En ese caso, priorizar instrumentacion/funnel antes de atribuir la caida a UX.

## Mejoras propuestas

### 1. Copy de popup de primer uso

| Campo | Propuesta |
|---|---|
| Problema detectado | Sin datos v2.0.3 no se puede confirmar, pero una caida entre apertura y deteccion suele indicar que el usuario no sabe en que pagina usar la extension. |
| Hipotesis | Un texto inicial mas concreto reduce aperturas improductivas y orienta al usuario hacia una ficha compatible. |
| Cambio propuesto | Ajustar el copy del popup cuando no hay contexto suficiente: "Abre un anuncio de Idealista o Fotocasa para analizar precio, zona y senales del inmueble." Mantenerlo breve y no modal. |
| Impacto esperado | Mas usuarios llegan a una pagina compatible tras abrir la extension; menor confusion en el primer uso. |
| Coste | Bajo. |
| Dificultad | Baja. |
| Riesgo | Bajo; el riesgo principal es prometer compatibilidad donde aun no exista. |
| Metrica de exito | Aumento de `page_detected/listing_detected` por `extension_opened`; descenso de aperturas sin accion posterior. |
| Primer paso concreto | Revisar el texto actual del popup y preparar 2 variantes de microcopy para validar contra el informe de funnel. |

### 2. Estado claro cuando no hay anuncio detectado

| Campo | Propuesta |
|---|---|
| Problema detectado | Si el usuario abre la extension en una pagina no compatible o antes de cargar la ficha, un estado vacio generico puede parecer fallo del producto. |
| Hipotesis | Un estado explicito reduce abandono y transforma el "no pasa nada" en una accion siguiente clara. |
| Cambio propuesto | Mostrar un estado sin anuncio detectado con una frase accionable: "No hemos detectado un anuncio en esta pestana. Abre una ficha de inmueble y vuelve a intentarlo." Incluir un boton secundario de reintento si ya existe mecanica local. |
| Impacto esperado | Menos usuarios bloqueados antes del analisis; mayor ratio de deteccion tras apertura. |
| Coste | Bajo. |
| Dificultad | Baja-media, segun si el popup ya distingue pagina incompatible, pagina cargando y ficha sin datos suficientes. |
| Riesgo | Bajo; puede frustrar si aparece durante una carga lenta cuando el anuncio si es compatible. |
| Metrica de exito | Reduccion de sesiones con `extension_opened` sin `page_detected/listing_detected`; menor repeticion de aperturas sin analisis. |
| Primer paso concreto | Inventariar estados actuales del popup: compatible, no compatible, cargando, error y sin datos suficientes. |

### 3. CTA de analisis mas contextual

| Campo | Propuesta |
|---|---|
| Problema detectado | Si hay deteccion de ficha pero no inicio de analisis, el CTA puede no comunicar valor inmediato o puede competir con otros elementos. |
| Hipotesis | Un CTA especifico por contexto aumenta `analysis_started` cuando ya existe anuncio detectado. |
| Cambio propuesto | Cambiar el CTA principal detectado a una formula directa: "Analizar este anuncio" o "Analizar precio y riesgos". Acompanarlo de una linea corta con el beneficio, no de una explicacion larga. |
| Impacto esperado | Mayor conversion de ficha detectada a analisis iniciado. |
| Coste | Bajo. |
| Dificultad | Baja. |
| Riesgo | Bajo; evitar duplicar CTAs o hacer que parezca una accion de pago si es gratuita. |
| Metrica de exito | Aumento de `analysis_started / listing_detected`; menor tiempo entre deteccion e inicio. |
| Primer paso concreto | Definir el texto exacto del CTA para ficha detectada y validar que no afecta estados premium o checkout. |

### 4. Feedback durante analisis

| Campo | Propuesta |
|---|---|
| Problema detectado | Si el analisis se inicia pero no completa, el usuario puede abandonar por falta de progreso visible o por incertidumbre sobre cuanto tarda. |
| Hipotesis | Un estado de progreso honesto reduce cierres prematuros y reintentos innecesarios. |
| Cambio propuesto | Mostrar feedback durante el analisis con 2 o 3 estados simples: "Leyendo anuncio", "Comparando senales", "Preparando resultado". Evitar porcentajes falsos si no hay progreso real. |
| Impacto esperado | Mayor ratio `analysis_completed / analysis_started` y menos reintentos inmediatos. |
| Coste | Bajo-medio. |
| Dificultad | Media, porque depende de si el flujo expone fases internas o solo un estado unico de carga. |
| Riesgo | Medio-bajo; estados demasiado largos o imprecisos pueden aumentar percepcion de lentitud. |
| Metrica de exito | Aumento de completitud del analisis; reduccion de sesiones con `analysis_started` sin evento final. |
| Primer paso concreto | Mapear el flujo actual de analisis y decidir si se puede mostrar progreso por fases reales o solo un estado unico mejor redactado. |

### 5. Mensaje de error util y recuperable

| Campo | Propuesta |
|---|---|
| Problema detectado | Si `analysis_error` es relevante, un error generico no ayuda al usuario a recuperar el flujo ni permite distinguir fallo tecnico de pagina no compatible. |
| Hipotesis | Errores con causa saneada y accion siguiente aumentan reintentos exitosos y reducen abandono. |
| Cambio propuesto | Sustituir errores genericos por mensajes accionables segun causa: pagina no compatible, datos insuficientes, timeout, red o fallo temporal. Incluir "Reintentar" cuando sea recuperable. |
| Impacto esperado | Menor abandono tras error; mejor diagnostico del principal bloqueo de activacion. |
| Coste | Bajo-medio. |
| Dificultad | Media, porque requiere mapear causas sin exponer detalles tecnicos ni datos sensibles. |
| Riesgo | Medio-bajo; clasificar mal un error puede dar una instruccion equivocada. |
| Metrica de exito | Reduccion de `analysis_error / analysis_started`; aumento de completados tras un primer error en la misma sesion. |
| Primer paso concreto | Definir una taxonomia minima de error UX: `unsupported_page`, `missing_listing_data`, `network_error`, `timeout`, `temporary_failure`. |

## Recomendacion inicial

Sin datos reales de v2.0.3, la primera mejora recomendada provisionalmente es la numero 2: estado claro cuando no hay anuncio detectado.

Motivo: es pequena, de bajo riesgo, no depende de tocar backend y cubre el bloqueo mas probable cuando el usuario abre el popup pero no llega a una ficha reconocible. Tambien mejora la interpretacion del funnel: una apertura sin deteccion deja de sentirse como fallo silencioso.

Condiciones para cambiar la prioridad al recibir el informe:

| Si el informe muestra... | Implementar primero |
|---|---|
| Mayor caida entre `extension_opened` y `page_detected/listing_detected` | Mejora 2; despues mejora 1. |
| Mayor caida entre `listing_detected` y `analysis_started` | Mejora 3. |
| Mayor caida entre `analysis_started` y `analysis_completed` sin errores claros | Mejora 4. |
| `analysis_error` alto o concentrado en pocas causas | Mejora 5. |

## Datos necesarios para priorizar con rigor

Completar el informe `EXTENSION_V203_FUNNEL_OBSERVATION.md` con, como minimo:

| Paso | Evento esperado |
|---|---|
| Apertura de popup/panel | `extension_opened` |
| Pagina compatible detectada | `page_detected` |
| Anuncio con datos suficientes | `listing_detected` |
| Inicio de analisis | `analysis_started` |
| Analisis completado | `analysis_completed`, `page_analyzed` o `page_analysis_completed` |
| Error de analisis | `analysis_error` con causa saneada |

KPIs minimos:

| KPI | Formula |
|---|---|
| Deteccion tras apertura | `page_detected/listing_detected / extension_opened` |
| Inicio tras deteccion | `analysis_started / listing_detected` |
| Completitud del analisis | `analysis_completed / analysis_started` |
| Error por intento | `analysis_error / analysis_started` |
| Activacion por usuario | usuarios con analisis completado / usuarios reales |

## Limitaciones

- No hay `EXTENSION_V203_FUNNEL_OBSERVATION.md` disponible en este repo.
- No se han consultado endpoints autenticados ni bases de datos.
- No se atribuye ninguna caida real a UX sin datos.
- Las propuestas son opciones pequenas para popup y estados de analisis, no una especificacion de implementacion.
- La priorizacion debe revisarse cuando existan datos reales v2.0.3.
