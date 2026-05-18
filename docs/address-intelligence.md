# Address Intelligence

Address Intelligence es una capa opcional para enriquecer el análisis de precio con datos públicos de dirección y edificio.

## Principios

- Consulta solo bajo demanda cuando el usuario analiza un inmueble.
- No hace crawling masivo.
- No scrapea anuncios individuales.
- Usa caché y rate limit.
- Guarda `source_url` y `extracted_at`.
- Trata `idealista/maps` como fuente complementaria, nunca como fuente única ni tasación.
- Si `idealista/maps` bloquea la petición del backend, intenta Catastro oficial como fallback.
- Si no hay datos, la extensión debe seguir funcionando sin error técnico visible.

## Endpoint

```http
GET /api/address-intelligence
```

En Vercel Hobby este endpoint se sirve mediante rewrite hacia `/api/market-price?resource=address-intelligence` para no crear una función serverless adicional.

Parámetros:

- `address`
- `street`
- `street_number`
- `municipality`
- `province`
- `postal_code` opcional
- `lat` opcional
- `lng` opcional

Ejemplo:

```http
/api/address-intelligence?street=Avenida%20Metro%20Del&street_number=7&municipality=El%20Campello&province=Alicante
```

La URL probable construida será:

```text
https://www.idealista.com/maps/el-campello-alicante/avenida-metro-del/7/
```

## Cache

Tabla: `address_intelligence_cache`.

Aplica el SQL:

```text
database/address-intelligence-cache.sql
```

TTL por defecto: 60 días. El endpoint también mantiene una caché en memoria para reducir lecturas repetidas.

## Endpoint combinado

```http
GET /api/property-assessment
```

También se sirve mediante rewrite hacia `/api/market-price?resource=property-assessment`.

Recibe los mismos datos que `/api/market-price` más dirección. Devuelve:

- `listing`
- `market`
- `address_intelligence`
- `comparison`

La comparación mezcla caveats de mercado y caveats de edificio, por ejemplo:

> El precio está algo por encima de mercado. Además, la finca figura sin ascensor, por lo que conviene revisar si el precio está justificado por reforma, estado o ubicación exacta.

## Fallback Catastro

El endpoint intenta `idealista/maps` primero porque agrupa datos de edificio, rango orientativo y servicios cercanos. Si esa petición devuelve 403/404/timeout, intenta la consulta oficial de datos catastrales no protegidos por localización:

```text
https://ovc.catastro.meh.es/OVCServWeb/OVCWcfCallejero/COVCCallejero.svc/json/Consulta_DNPLOC
```

La documentación oficial de Catastro indica que los servicios libres permiten REST/GET y formato JSON para servicios de callejero y datos catastrales no protegidos. Esta fuente no devuelve valoración ni servicios cercanos, pero sí puede aportar referencia catastral, domicilio, uso, superficie y antigüedad cuando la dirección encaja.

El fallback no se queda en una sola llamada. Si `Consulta_DNPLOC` responde con errores como `EL NUMERO NO EXISTE`, intenta:

1. `ConsultaVia` para normalizar el nombre/tipo de vía.
2. `ConsultaNumero` para encontrar numeración candidata.
3. `Consulta_DNPLOC` con la vía y número normalizados.

Si después de ese flujo solo hay errores de Catastro, el endpoint devuelve `ok:false` y la extensión debe omitir el bloque de edificio.

Cuando la respuesta sale de Catastro:

- `source = "catastro"`
- `cadastre_source = "Dirección General de Catastro"`
- `valuation.min_price/max_price = null`
- `nearby_services` queda vacío
- se conserva el mismo contrato JSON para que la extensión no tenga que cambiar.
