# Despliegue recomendado

## Opcion rapida

Usar Netlify o Vercel con la carpeta `inmoradar-web`.

Como es una web estatica, no necesita build:

- Build command: vacio
- Publish directory: `.`

## Dominio

Recomendacion:

1. Comprar `inmoradar.app` si esta disponible.
2. Comprar tambien `inmoradar.es` si el coste encaja, para proteger el mercado espanol.
3. Redirigir `www.inmoradar.app` a `inmoradar.app`.

Despues de elegir dominio, actualiza:

- `robots.txt`
- `sitemap.xml`
- email de contacto si cambia
- URL de checkout en `assets/app.js`
- URL del paywall dentro de la extension

## Pagos

Para la primera version de pago:

1. Crear producto `InmoRadar Premium`.
2. Tipo: suscripcion semanal.
3. Precio: `1,99 EUR`.
4. Success URL: `https://TU-DOMINIO/success.html`.
5. Cancel URL: `https://TU-DOMINIO/cancel.html`.
6. Copiar URL de checkout en `assets/app.js`.

## Siguiente fase tecnica

La web incluye endpoints para validar Premium y recibir webhooks.

Para activar produccion:

1. Crear proyecto en Supabase.
2. Ejecutar `database/premium-subscriptions.sql`.
3. Ejecutar `database/market-price-sources.sql` para crear `market_price_sources`.
4. Crear producto semanal en Lemon Squeezy.
5. Crear webhook con URL `https://TU-DOMINIO/api/lemonsqueezy-webhook`.
6. Seleccionar eventos `subscription_created`, `subscription_updated`, `subscription_cancelled`, `subscription_resumed`, `subscription_expired`, `subscription_paused` y `subscription_unpaused`.
7. Configurar estas variables en Vercel:

```text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
LEMONSQUEEZY_WEBHOOK_SECRET=
```

8. Redeploy.
9. Probar `https://TU-DOMINIO/api/health`.
10. Probar `https://TU-DOMINIO/api/check-premium?email=TU_EMAIL`.
11. Probar `https://TU-DOMINIO/api/market-price?operation=sale&municipality=Logrono&zone=Casco%20Antiguo&listing_price_total=210000&listing_area_m2=100`.

No conviene confiar en `chrome.storage.local` para Premium real, porque el usuario puede modificarlo.
