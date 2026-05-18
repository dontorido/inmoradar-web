# Address Intelligence

Address Intelligence es una capa opcional para enriquecer el análisis de precio con datos públicos de dirección y edificio.

## Principios

- Consulta solo bajo demanda cuando el usuario analiza un inmueble.
- No hace crawling masivo.
- No scrapea anuncios individuales.
- Usa caché y rate limit.
- Guarda `source_url` y `extracted_at`.
- Trata `idealista/maps` como fuente complementaria, nunca como fuente única ni tasación.
- Si no hay datos, la extensión debe seguir funcionando sin error técnico visible.

## Endpoint

```http
GET /api/address-intelligence
```

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

Recibe los mismos datos que `/api/market-price` más dirección. Devuelve:

- `listing`
- `market`
- `address_intelligence`
- `comparison`

La comparación mezcla caveats de mercado y caveats de edificio, por ejemplo:

> El precio está algo por encima de mercado. Además, la finca figura sin ascensor, por lo que conviene revisar si el precio está justificado por reforma, estado o ubicación exacta.

## Fallback Catastro

El parser actual usa idealista/maps porque agrupa datos públicos de Catastro y contexto urbano. La tabla y la respuesta ya están preparadas para añadir una fuente oficial directa de Catastro como fallback (`source = "catastro"`), manteniendo el mismo contrato de salida.
