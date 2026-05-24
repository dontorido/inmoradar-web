# Atribucion web -> Chrome Store -> extension

## Decision tecnica

La atribucion directa usuario-a-usuario entre el click web hacia Chrome Web Store y el primer uso real de la extension es solo parcial.

Motivo: despues de abrir Chrome Web Store no existe un canal fiable y legitimo para que la extension instalada lea el `localStorage` de la web publica ni reciba parametros del click original. El MVP no usa fingerprinting, IP como identificador ni URLs completas para intentar reconstruir esa union.

## Que se mide de forma directa

La web publica registra eventos propios de intencion:

- `install_click`
- `seo_cta_click`
- `guide_cta_click`
- `article_cta_click`
- `chrome_store_click`

En cada click de instalacion se genera un `attribution_id` aleatorio no personal y se envia en `metadata` junto con:

- `install_source`
- `landing_path`
- `click_timestamp`
- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_term`
- `utm_content`
- `store`

`landing_path` se guarda como ruta general sin query string ni hash. El evento tambien conserva las UTMs estructuradas del contexto web.

## Que se mide en uso real de extension

El backend de extension acepta y persiste eventos anonimos:

- `extension_opened`
- `listing_detected`
- `analysis_started`
- `analysis_completed`
- `first_listing_analysis`

Estos eventos guardan `anonymous_id_hash`, `page_domain`, version, navegador y metadata permitida. Si en el futuro la extension recibiera un `attribution_id` por un mecanismo legitimo, el backend ya permite metadata no sensible de atribucion:

- `attribution_id`
- `install_source`
- `landing_path`
- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_term`
- `utm_content`
- `store`

## Medicion agregada recomendada

Mientras no exista handoff directo, la lectura honesta es por ventana temporal:

1. Agrupar `chrome_store_click` por dia, `utm_source`, `utm_campaign` y `landing_path`.
2. Agrupar `first_listing_analysis` por dia y `page_domain`.
3. Comparar ventanas de 0-7 dias entre intencion web y primer analisis real.
4. Informar el resultado como aproximacion agregada, nunca como conversion deterministica por usuario.

El endpoint admin de analitica propia expone agrupaciones por fuente y campana UTM para facilitar esta lectura.

## Endpoint agregado

BackOffice usa:

```txt
GET /api/admin?resource=analytics/funnel&from=YYYY-MM-DD&to=YYYY-MM-DD
```

La respuesta no devuelve eventos raw ni metadata completa. Devuelve solo agregados:

- `summary`: `install_clicks`, `chrome_store_clicks`, `extension_opened`, `listing_detected`, `analysis_started`, `analysis_completed`, `first_listing_analysis`.
- `by_day`: intencion web y activacion de extension por dia.
- `by_utm_source`, `by_utm_medium`, `by_utm_campaign`: intencion web agrupada por UTMs.
- `by_landing_path`: intencion web agrupada por ruta sin query string.
- `by_page_domain`: activacion real agrupada por dominio analizado.

Ratios incluidos:

- `aggregate_chrome_store_to_first_listing_analysis_rate`
- `aggregate_extension_opened_to_first_listing_analysis_rate`
- `analysis_started_to_completed_rate`

Los ratios son agregados por ventana temporal. No deben comunicarse como conversiones exactas usuario-a-usuario.

## Campos descartados por privacidad

No se guardan como metadata de atribucion:

- URLs completas.
- Query strings de landing.
- URL completa de anuncio.
- Direccion exacta.
- Telefono, email o nombre.
- Titulo o descripcion completa del anuncio.
- Precio o superficie exactos.
- IP como identificador.
- Fingerprints de navegador o dispositivo.

## Limitaciones

- `attribution_id` identifica un click web, no una instalacion confirmada.
- La Chrome Web Store no confirma instalacion ni transmite la atribucion a la extension.
- Las ratios web -> extension deben comunicarse como estimaciones agregadas.
- Para atribucion deterministica haria falta un mecanismo oficial de handoff o login/consentimiento explicito, fuera del MVP.
