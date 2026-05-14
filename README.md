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
