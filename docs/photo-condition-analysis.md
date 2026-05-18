# Photo Condition Analysis

Photo Condition Analysis sera una capa opcional de analisis visual de fotos del anuncio para estimar el estado aparente del inmueble y enriquecer la lectura de precio.

## Principios de producto

- Disponible para todos los usuarios. No es una funcionalidad solo premium.
- Activacion manual mediante boton: "Analizar fotos del inmueble".
- No se ejecuta automaticamente en segundo plano en cada anuncio.
- Control de coste mediante cache, rate limit y limite de imagenes.
- La version base analiza como maximo 8 imagenes.
- Premium podra tener en el futuro mas profundidad, mas imagenes, historico o exportacion, pero la base queda abierta a todos.
- El analisis visual complementa el price assessment. No sustituye el precio de mercado ni una tasacion.

## Lenguaje obligatorio

La UI y la API deben hablar siempre en terminos orientativos:

- "estimacion visual"
- "segun las fotos disponibles"
- "probabilidad"
- "podria requerir actualizacion o reforma"

No se debe afirmar:

- que el inmueble necesita reforma de forma absoluta
- que hay un coste exacto de reforma
- que el resultado sustituye una visita o inspeccion tecnica
- que las fotos muestran todos los defectos

Si aparecen personas en fotos, se ignoran. El analisis se centra solo en el inmueble.

## Endpoint

```http
POST /api/photo-condition-analysis
```

En Vercel Hobby conviene servirlo mediante una funcion existente o router interno para no superar el limite de serverless functions. Si el proyecto mantiene el patron actual, anadir un rewrite hacia `/api/market-price?resource=photo-condition-analysis` y despachar ahi.

La clave `OPENAI_API_KEY` vive solo en Vercel. Nunca debe estar en la extension ni en frontend.

### Input

```json
{
  "listing_url": "...",
  "portal": "idealista",
  "operation": "sale",
  "price_total": 210000,
  "surface_m2": 100,
  "listing_price_eur_m2": 2100,
  "market_price_eur_m2": 1885,
  "difference_pct": 11.41,
  "image_urls": ["https://...", "https://..."]
}
```

### Output normalizado

```json
{
  "ok": true,
  "source": "vision_model",
  "access_level": "free",
  "images_analyzed": 8,
  "condition": {
    "label": "dated",
    "label_es": "Antiguo/desactualizado",
    "score": 42
  },
  "renovation": {
    "probability": "high",
    "probability_es": "Alta",
    "type": "partial_renovation",
    "type_es": "Reforma parcial",
    "estimated_scope": ["cocina", "bano", "carpinteria"]
  },
  "signals": {
    "kitchen": { "status": "dated", "renovation_likelihood": "high", "notes": [] },
    "bathroom": { "status": "dated", "renovation_likelihood": "medium", "notes": [] },
    "flooring": { "status": "average", "renovation_likelihood": "medium", "notes": [] },
    "walls_ceilings": { "status": "good", "renovation_likelihood": "low", "notes": [] },
    "windows_doors": { "status": "unknown", "renovation_likelihood": "unknown", "notes": [] },
    "general_light": { "status": "good", "renovation_likelihood": "low", "notes": [] }
  },
  "confidence_score": 0.72,
  "caveats": [
    "Estimacion visual basada solo en fotos del anuncio.",
    "Las fotos pueden estar editadas, incompletas o no mostrar defectos importantes.",
    "No sustituye una inspeccion tecnica ni una visita presencial."
  ],
  "price_interpretation": {
    "impact": "negative",
    "message": "Si el precio esta por encima de mercado, la prima deberia justificarse con otros factores, porque las fotos sugieren posible necesidad de actualizacion."
  }
}
```

## Errores esperados

Sin imagenes:

```json
{
  "ok": false,
  "reason": "no_images",
  "message": "No se han detectado fotos suficientes para analizar el estado visual del inmueble."
}
```

Rate limit:

```json
{
  "ok": false,
  "reason": "rate_limited",
  "message": "Has alcanzado temporalmente el limite de analisis visual. Intentalo mas tarde."
}
```

Fallo del modelo:

```json
{
  "ok": false,
  "reason": "vision_model_error",
  "message": "No se ha podido analizar visualmente el inmueble en este momento."
}
```

## Seleccion de imagenes

Crear `selectRepresentativeListingImages(imageUrls, options)`.

Debe:

- Deduplicar por URL normalizada.
- Limitar a 8 imagenes por defecto.
- Priorizar cocina, bano, salon, comedor, dormitorio, habitacion, pasillo y terraza cuando haya metadatos o alt text.
- Penalizar mapas, planos, logos, street view, entorno y fachadas repetidas.
- Devolver `selectedImages`, `discardedImages` y `selectionReason`.

La extension puede extraer hasta 20 candidatas; el backend decide las 8 finales.

## Extraccion en extension

Crear `extractListingImagesFromPage()`.

Salida:

```json
{
  "portal": "idealista",
  "image_urls": [],
  "image_count": 0,
  "confidence_score": 0.8
}
```

Idealista primera fase:

- Carrusel principal.
- `img` visibles.
- `src`, `srcset`, `data-src`, atributos embebidos.
- JSON embebido si existe.
- Evitar base64, iconos, logos, mapas y thumbnails pequenas si hay versiones grandes.

Fotocasa, Pisos y Habitaclia pueden entrar de forma progresiva. Si no hay soporte suficiente, devolver `no_images` sin romper la extension.

## Cache

Tabla sugerida:

```sql
CREATE TABLE IF NOT EXISTS photo_condition_analysis_cache (
  id BIGSERIAL PRIMARY KEY,
  listing_url_hash TEXT NOT NULL,
  image_urls_hash TEXT NOT NULL,
  portal TEXT,
  listing_url TEXT,
  source TEXT DEFAULT 'vision_model',
  access_level TEXT DEFAULT 'free',
  images_analyzed INTEGER,
  condition_label TEXT,
  condition_label_es TEXT,
  condition_score NUMERIC(5,2),
  renovation_probability TEXT,
  renovation_probability_es TEXT,
  renovation_type TEXT,
  renovation_type_es TEXT,
  estimated_scope_json JSONB,
  signals_json JSONB,
  confidence_score NUMERIC(4,2),
  price_interpretation_json JSONB,
  caveats_json JSONB,
  raw_response_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_photo_condition_cache_unique
ON photo_condition_analysis_cache(listing_url_hash, image_urls_hash);

CREATE INDEX IF NOT EXISTS idx_photo_condition_cache_expires
ON photo_condition_analysis_cache(expires_at);
```

Reglas:

- Hash de `listing_url` + URLs seleccionadas.
- TTL inicial: 30 dias.
- Si mismo anuncio y mismas imagenes, devolver cache.
- No guardar imagenes en base de datos. Solo URLs, hashes y resultado.

## Rate limit

No es paywall. Es proteccion anti-abuso.

Primera propuesta:

- 5 analisis por hora por IP/session.
- 20 analisis por dia por IP/session.

Si hay login en el futuro, usar email/user id hasheado como key preferente.

## Modelo de vision

Usar un modelo con vision desde backend. Antes de implementar, revisar la documentacion oficial de OpenAI para confirmar modelo recomendado, formato de image inputs y Structured Outputs vigentes.

El prompt interno debe pedir solo JSON valido y debe incluir estas reglas:

- No afirmar certezas absolutas.
- No analizar personas.
- Ignorar personas si aparecen.
- No estimar coste de reforma.
- No decir que una reforma es obligatoria.
- Si las fotos son insuficientes, bajar `confidence_score` y usar `unknown`.
- Devolver `condition`, `renovation`, `signals`, `confidence_score`, `caveats` y `price_interpretation`.

## Integracion con precio

Crear `combinePriceAndPhotoAssessment(priceAssessment, photoAssessment)`.

Reglas iniciales:

- `caro` + reforma `high`/`very_high`: "El precio esta por encima de mercado y las fotos sugieren posible necesidad de reforma. Conviene revisar con especial cautela."
- `algo_caro` + estado `good`/`excellent`: "El precio esta por encima de la referencia, pero el estado visual podria justificar parte de la prima."
- `buen_precio` + reforma `high`: "El precio parece competitivo, aunque podria reflejar una posible inversion adicional en reforma."
- `muy_buen_precio` + estado `poor`: "El precio es muy bajo frente a mercado, pero las fotos sugieren revisar cuidadosamente el estado del inmueble."
- `en_mercado` + estado `good`: "El precio esta alineado con mercado y el estado visual parece favorable."

No modificar drasticamente el precio de mercado. Solo enriquecer la interpretacion.

## UI extension

Bloque:

- Titulo: "Estado visual del inmueble"
- Boton inicial: "Analizar fotos del inmueble"
- Subtexto: "Estimacion visual basada en las fotos del anuncio."
- Loading: "Analizando fotos..."

Resultado:

- Estado visual.
- Probabilidad de reforma.
- Tipo probable.
- Senales detectadas.
- Impacto en precio.
- Aviso orientativo.

La tarjeta debe funcionar tambien si no hay `market_price_eur_m2`; en ese caso se muestra como modulo independiente.

## Primera implementacion minima

1. Extraer `image_urls` desde Idealista.
2. Crear endpoint `/api/photo-condition-analysis`.
3. Limitar a 8 imagenes.
4. Llamar al modelo de vision desde backend.
5. Devolver JSON estructurado.
6. Mostrar tarjeta en popup.
7. Anadir cache Supabase.
8. Anadir rate limit basico.
9. Anadir caveats.
10. Integrar mensaje con `property-assessment` si existe.

## No implementar todavia

- Coste de reforma.
- Analisis tecnico estructural.
- Descarga o almacenamiento permanente de imagenes.
- Analisis automatico sin click del usuario.
- Bloqueo premium.

## Tests

- `selectRepresentativeListingImages`: deduplica, prioriza interiores, limita a 8 y descarta logos/mapas/planos.
- Endpoint: `no_images`, cache hit, rate limit, respuesta de modelo OK.
- Validacion JSON: respuesta valida y respuesta invalida controlada.
- `combinePriceAndPhotoAssessment`: los cinco casos de combinacion precio/fotos.
- UI: boton, loading, resultado, caveats, `rate_limited` y `no_images`.

