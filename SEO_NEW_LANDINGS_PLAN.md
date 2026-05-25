# SEO new activation landing plan

Fecha: 2026-05-25

## Objetivo

Preparar un paquete pequeno de landings SEO orientadas a activar InmoRadar antes de que el usuario contacte por un anuncio. El objetivo no es generar contenido masivo, sino cubrir cinco busquedas de alta intencion con paginas utiles, revisables y medibles.

Estas landings deben llevar al usuario a una accion concreta: empezar gratis, instalar InmoRadar en navegador compatible o entrar en waitlist si su navegador no esta disponible. El contenido debe vender el habito de revisar anuncios antes de llamar, no prometer una tasacion ni sustituir una decision profesional.

## Decision de implementacion

No se implementan archivos publicos en esta tarea.

Motivo: el patron actual de landings SEO vive en `api/seo-page.js`, `api/_seo/*`, Supabase `seo_landings` y rutas por plantilla/ciudad (`/precio-metro-cuadrado/:city`, `/precio-alquiler/:city`, `/saber-si-piso-esta-caro/:city`, `/guias/:slug`). Las cinco URLs propuestas son slugs genericos de primer nivel, y publicarlas como borrador implicaria tocar rewrites, servidor local, sitemap/robots o seeds SEO. Eso aumenta el riesgo de pisar trabajo paralelo y podria convertirse en un cambio de publicacion, que queda fuera del alcance seguro.

Recomendacion: crear estas paginas primero como oportunidades editoriales controladas en backoffice o como nueva familia `activation_landing`, con `status=draft`, `index_status=noindex` y revision manual. Solo pasar a `index` cuando el texto final supere el umbral de calidad, tenga CTA medible y haya validacion movil.

## Guardrails editoriales comunes

- No prometer tasacion exacta, precio justo exacto, valor oficial ni recomendacion de compra.
- No insinuar afiliacion, certificacion ni oficialidad con portales inmobiliarios de terceros.
- Evitar marcas de terceros en titulares, URLs, CTAs o metadatos si pueden generar confusion. Si se mencionan en cuerpo o FAQ, hacerlo como ejemplos descriptivos y no como partners.
- Presentar InmoRadar como filtro previo y herramienta orientativa sobre anuncios, no como asesor financiero, tasador homologado ni sustituto de visita/documentacion.
- Mantener CTA principal consistente: `Empezar gratis`.
- Medir cada CTA con `data-install-source` o metadata equivalente por slug.
- Evitar claims absolutos: usar "puede ayudarte a detectar", "orientativo", "senales", "comparar con mas contexto".
- Incluir una nota visible de metodologia/disclaimer en cada pagina.

## Recomendacion tecnica comun

- Canonical: `https://inmoradar.app/{slug}/`.
- Robots inicial: `noindex,follow` mientras sean borrador o no tengan contenido final revisado.
- Robots final: `index,follow` solo si `status=published`, contenido unico, CTA funcional, QA movil y calidad editorial validada.
- Sitemap: incluir solo cuando `robots=index,follow` y `status=published`.
- Estructura recomendada si se implementa en el sistema actual: nueva plantilla editorial de activacion o filas en `seo_landings`, no HTML suelto si se quiere integracion con backoffice y sitemap.

## Landings propuestas

### 1. `/analizar-piso-antes-de-contactar/`

- Keyword principal: `analizar piso antes de contactar`
- Intencion de busqueda: informacional con alta intencion de accion. El usuario todavia no quiere una tasacion; quiere un checklist para decidir si merece llamar, escribir o visitar.
- Estructura propuesta:
  - Hero: "Analiza un piso antes de contactar"
  - Problema: llamar demasiado pronto consume tiempo y entrega datos personales sin contexto.
  - Checklist previo: precio por metro cuadrado, entrada/cuota, zona, transporte, aparcamiento, fotos, reforma y gastos.
  - Como ayuda InmoRadar: resume senales del anuncio y da una primera lectura orientativa.
  - Metodo en 3 pasos: abre anuncio, revisa senales, prepara preguntas.
  - FAQ: que datos hacen falta, si sustituye visita, que hacer si faltan metros o gastos.
  - Disclaimer editorial y enlaces a metodologia.
- CTA: `Empezar gratis` con microcopy "Revisa tu proximo anuncio antes de llamar".
- Riesgos:
  - Puede sonar a decision automatica si se usa "analizar" sin matizar.
  - Riesgo de prometer evaluacion completa si no se explica que es filtro inicial.
  - Evitar referencias a portales como si existiera colaboracion oficial.
- Metrica de exito:
  - CTR a instalacion/waitlist desde la landing.
  - `install_click` o `waitlist_submit` por `page_path=/analizar-piso-antes-de-contactar/`.
  - Activacion posterior: primer analisis de anuncio desde usuario que aterrizo en esta pagina.
- Canonical/robots recomendado:
  - Canonical: `https://inmoradar.app/analizar-piso-antes-de-contactar/`
  - Borrador: `noindex,follow`
  - Publicada: `index,follow` tras QA y contenido final.

### 2. `/saber-si-piso-esta-caro/`

- Keyword principal: `saber si piso esta caro`
- Intencion de busqueda: investigacion comercial. El usuario tiene uno o varios anuncios y necesita criterio rapido para saber si esta por encima de mercado.
- Estructura propuesta:
  - Hero: "Como saber si un piso esta caro antes de contactar"
  - Primer criterio: precio por metro cuadrado frente a referencias agregadas.
  - Lo que cambia el precio: estado, planta, ascensor, terraza, garaje, eficiencia, reforma y microzona.
  - Senales de alerta: metros ambiguos, fotos parciales, bajadas repetidas, zona vaga, gastos omitidos.
  - Como usar InmoRadar: detectar desviaciones y preguntas pendientes.
  - FAQ: diferencia entre referencia y tasacion, cuando pedir documentacion, como comparar dos pisos.
- CTA: `Empezar gratis` con microcopy "Comprueba un anuncio antes de llamar".
- Riesgos:
  - Alto riesgo de percibirse como tasacion exacta.
  - La ruta colisiona semanticamente con el patron existente `/saber-si-piso-esta-caro/:city`; conviene decidir si esta pagina sera hub generico o guia editorial.
  - Si se indexa, debe enlazar a ciudades sin duplicar contenido.
- Metrica de exito:
  - CTR a CTA.
  - Scroll hasta bloque "Comprueba un anuncio".
  - Ratio de usuarios que ejecutan una comprobacion de precio tras aterrizar.
- Canonical/robots recomendado:
  - Canonical: `https://inmoradar.app/saber-si-piso-esta-caro/`
  - Borrador: `noindex,follow`
  - Publicada: `index,follow` solo si se define como hub y no duplica las variantes por ciudad.

### 3. `/comparar-pisos-online/`

- Keyword principal: `comparar pisos online`
- Intencion de busqueda: informacional/comparativa. El usuario esta mirando varios pisos y quiere una forma simple de priorizarlos sin perderse entre pestanas.
- Estructura propuesta:
  - Hero: "Compara pisos online con el mismo criterio"
  - Problema: precio total, fotos y barrio no bastan para comparar.
  - Matriz de comparacion: precio/m2, coste inicial, cuota, zona, transporte, aparcamiento, estado y riesgos.
  - Ejemplo orientativo de comparacion entre dos anuncios.
  - Como ayuda InmoRadar: normaliza senales para decidir cual merece visita.
  - FAQ: cuantos pisos comparar, que hacer con datos incompletos, si sirve para alquiler.
- CTA: `Empezar gratis` con microcopy "Compara tus anuncios antes de decidir a quien llamar".
- Riesgos:
  - Puede prometer una funcion de comparador si el producto aun no cubre todas las expectativas visibles.
  - Evitar claims de ranking automatico perfecto.
  - Debe aclarar que la comparacion depende de datos disponibles en el anuncio.
- Metrica de exito:
  - CTR a instalacion/waitlist.
  - Numero de usuarios que analizan dos o mas anuncios tras aterrizar.
  - Tiempo en pagina y clicks en secciones de checklist.
- Canonical/robots recomendado:
  - Canonical: `https://inmoradar.app/comparar-pisos-online/`
  - Borrador: `noindex,follow`
  - Publicada: `index,follow` tras confirmar que el CTA no promete comparador mas avanzado que el producto actual.

### 4. `/precio-metro-cuadrado-vivienda/`

- Keyword principal: `precio metro cuadrado vivienda`
- Intencion de busqueda: informacional. El usuario quiere entender como calcular y usar el precio por metro cuadrado para vivienda, no necesariamente por ciudad.
- Estructura propuesta:
  - Hero: "Precio por metro cuadrado de una vivienda: como usarlo bien"
  - Formula simple: precio anunciado / metros construidos o utiles, con advertencia sobre diferencias.
  - Para que sirve: comparar, detectar outliers, preparar preguntas.
  - Para que no sirve: no es tasacion exacta, no recoge por si solo estado ni microzona.
  - Ejemplo practico con rangos orientativos y enlace a metodologia.
  - Enlaces internos: `/precio-metro-cuadrado/{ciudad}/` cuando existan paginas publicadas.
  - FAQ: metros utiles vs construidos, garaje/trastero, obra nueva, reforma.
- CTA: `Empezar gratis` con microcopy "Calcula esta senal directamente sobre el anuncio".
- Riesgos:
  - Puede canibalizar paginas city SEO si no se plantea como hub educativo.
  - Riesgo de simplificar demasiado el calculo.
  - Necesita disclaimer de referencia agregada y fecha/fuente si muestra datos.
- Metrica de exito:
  - CTR a CTA.
  - Clicks a landings de ciudad publicadas.
  - Usuarios que completan un analisis con precio/m2 tras aterrizar.
- Canonical/robots recomendado:
  - Canonical: `https://inmoradar.app/precio-metro-cuadrado-vivienda/`
  - Borrador: `noindex,follow`
  - Publicada: `index,follow` si actua como hub y enlaza solo a paginas ciudad indexables.

### 5. `/senales-riesgo-anuncio-inmobiliario/`

- Keyword principal: `senales riesgo anuncio inmobiliario`
- Intencion de busqueda: informacional preventiva. El usuario quiere detectar riesgos o red flags antes de contactar por un anuncio.
- Estructura propuesta:
  - Hero: "Senales de riesgo en un anuncio inmobiliario"
  - Riesgos de datos: metros ambiguos, precio incoherente, gastos ausentes, ubicacion imprecisa.
  - Riesgos visuales: fotos parciales, estancias omitidas, reforma no declarada.
  - Riesgos de contexto: ruido, aparcamiento, transporte, servicios, comunidad.
  - Preguntas concretas que hacer antes de visitar.
  - Como ayuda InmoRadar: convierte senales dispersas en checklist accionable.
  - FAQ: diferencia entre riesgo y descarte, cuando pedir documentacion, que validar en visita.
- CTA: `Empezar gratis` con microcopy "Detecta senales antes de contactar".
- Riesgos:
  - Usar "riesgo" puede sonar alarmista o legal si no se acota.
  - Evitar insinuar fraude o mala fe sin pruebas.
  - No acusar anuncios, agencias ni portales; hablar de senales a comprobar.
- Metrica de exito:
  - CTR a instalacion/waitlist.
  - Engagement con checklist.
  - Eventos de analisis iniciados desde esta landing.
- Canonical/robots recomendado:
  - Canonical: `https://inmoradar.app/senales-riesgo-anuncio-inmobiliario/`
  - Borrador: `noindex,follow`
  - Publicada: `index,follow` tras revision legal/editorial del lenguaje de riesgo.

## Priorizacion

1. `/analizar-piso-antes-de-contactar/`: mejor alineada con activacion y promesa principal.
2. `/saber-si-piso-esta-caro/`: alta intencion, pero requiere resolver relacion con rutas city.
3. `/comparar-pisos-online/`: buena para usuarios con varias opciones y activacion multi-anuncio.
4. `/senales-riesgo-anuncio-inmobiliario/`: potente para awareness, revisar tono.
5. `/precio-metro-cuadrado-vivienda/`: util como hub educativo, cuidar canibalizacion.

## Checklist antes de publicar

- Texto final unico, no generado en masa.
- `status=ready_to_publish` durante revision y `status=published` solo al aprobar.
- `index_status=noindex` hasta superar QA.
- Canonical absoluto revisado.
- CTA `Empezar gratis` funcional en desktop y movil.
- Eventos de analytics identifican landing y fuente del CTA.
- No aparecen marcas de terceros en title/meta de forma confusa.
- Disclaimer visible: orientativo, no tasacion exacta, no asesoramiento financiero.
- Validacion movil basica en local.
- `node --test tests/seo.test.js` y dry run SEO focalizado antes de tocar generador o rutas.
