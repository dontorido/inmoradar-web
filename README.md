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
