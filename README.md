# InmoRadar Web

Web estatica de lanzamiento para InmoRadar.

## Incluye

- `index.html`: landing principal.
- `premium.html`: pagina de conversion Premium.
- `privacidad.html`: politica de privacidad inicial.
- `terminos.html`: terminos de uso iniciales.
- `success.html`: retorno tras pago correcto.
- `cancel.html`: retorno tras pago cancelado.
- `assets/app.js`: URL de checkout editable.
- `assets/hero-inmoradar.png`: visual principal local.
- `robots.txt` y `sitemap.xml`.
- `_redirects` y `vercel.json` para que `/premium`, `/privacidad`, `/terminos`, `/success` y `/cancel` funcionen en Netlify/Vercel.
- `api/check-premium.js`: endpoint para que la extension compruebe si un email tiene Premium.
- `api/lemonsqueezy-webhook.js`: webhook preparado para sincronizar suscripciones de Lemon Squeezy.
- `database/premium-subscriptions.sql`: tabla Supabase para guardar suscripciones Premium.
- `api/market-price.js`: endpoint agregado para que la extension consulte precios de mercado por zona.
- `database/market-price-sources.sql`: tabla Supabase `market_price_sources` y seed minimo de mercado.
- `api/parking-difficulty.js`: MVP del Parking Difficulty Score con Overpass/OpenStreetMap, scoring y cache en memoria.
- `api/_parking/*`: servicios internos para scoring, parser Overpass, adaptadores municipales y cache.
- `types/parking.ts`: tipos TypeScript preparados para migrar el endpoint a TS.
- `database/parking-difficulty.sql`: tablas preparadas para zonas de aparcamiento regulado y cache persistente.
- `tests/parking-difficulty.test.js`: tests basicos del scoring, parser y cache.

## Checkout

Ahora mismo el checkout esta en modo placeholder:

```js
const CHECKOUT_URL = "https://inmoradar.lemonsqueezy.com/buy/REEMPLAZAR";
```

Cuando tengas el producto creado en Lemon Squeezy o Stripe, cambia esa URL en `assets/app.js`.

## Probar en local

Puedes abrir directamente:

```text
index.html
```

O servir la carpeta con cualquier servidor estatico.

## Publicar

Ver `DEPLOY.md`.

## Dominios

Ver `DOMINIOS.md`.

## Variables de entorno para Premium

Configurar en Vercel:

```text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
LEMONSQUEEZY_WEBHOOK_SECRET=
```

El endpoint de comprobacion quedara en:

```text
https://www.inmoradar.app/api/check-premium?email=usuario@email.com
```

El webhook de Lemon Squeezy debe apuntar a:

```text
https://www.inmoradar.app/api/lemonsqueezy-webhook
```

## Endpoint de mercado

La extension consulta:

```text
https://www.inmoradar.app/api/market-price?operation=sale&municipality=Logrono&zone=Casco%20Antiguo&listing_price_total=210000&listing_area_m2=100
```

El endpoint devuelve solo datos agregados procesados. No expone `raw_payload` ni redistribuye el dataset bruto al frontend.

## Endpoint Parking Difficulty

MVP disponible en:

```text
https://www.inmoradar.app/api/parking-difficulty?lat=40.356&lng=-3.520&city=Rivas-Vaciamadrid
```

Tambien acepta direccion si no hay coordenadas:

```text
https://www.inmoradar.app/api/parking-difficulty?address=Calle%20Juan%20Gris,%2026,%20Rivas-Vaciamadrid&city=Rivas-Vaciamadrid
```

Para probar sin depender de Overpass:

```text
https://www.inmoradar.app/api/parking-difficulty?lat=40.356&lng=-3.520&city=Rivas-Vaciamadrid&mock=1
```

Devuelve un indice orientativo de dificultad para aparcar de 1 a 10 con senales y explicaciones. No promete disponibilidad real de plaza ni medicion exacta.

Variable opcional:

```text
OVERPASS_URL=https://overpass-api.de/api/interpreter
```

Tests:

```bash
node --test tests/parking-difficulty.test.js
```
