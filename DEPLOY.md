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
- variables de Lemon Squeezy en Vercel
- URL del paywall dentro de la extension

## Pagos

Para la primera version de pago en Lemon Squeezy test mode:

1. Crear producto `InmoRadar Premium`.
2. Tipo: suscripcion semanal.
3. Precio: `1,99 EUR`.
4. Trial gratuito: `2 dias`.
5. Copiar el `store_id` y el `variant_id` de la variante semanal.
6. Crear una API key en Lemon Squeezy test mode.
7. Configurar en Vercel `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`, `LEMONSQUEEZY_VARIANT_ID` y `LEMONSQUEEZY_TEST_MODE=true`.
8. El checkout se crea desde `https://TU-DOMINIO/api/lemonsqueezy-checkout` y redirige a `https://TU-DOMINIO/success`.

## Siguiente fase tecnica

La web incluye endpoints para validar Premium y recibir webhooks.

Para activar produccion:

1. Crear proyecto en Supabase.
2. Ejecutar `database/premium-subscriptions.sql`.
3. Ejecutar `database/market-price-sources.sql` para crear `market_price_sources`.
4. Crear producto semanal en Lemon Squeezy.
5. Crear API key de Lemon Squeezy en test mode.
6. Crear webhook con URL `https://TU-DOMINIO/api/lemonsqueezy-webhook`.
7. Seleccionar eventos `subscription_created`, `subscription_updated`, `subscription_cancelled`, `subscription_resumed`, `subscription_expired`, `subscription_paused`, `subscription_unpaused` y `order_created`.
8. Configurar estas variables en Vercel:

```text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
LEMONSQUEEZY_API_KEY=
LEMONSQUEEZY_STORE_ID=
LEMONSQUEEZY_VARIANT_ID=
LEMONSQUEEZY_TEST_MODE=true
LEMONSQUEEZY_WEBHOOK_SECRET=
PUBLIC_SITE_URL=https://TU-DOMINIO
```

9. Redeploy.
10. Probar `https://TU-DOMINIO/api/health`.
11. Probar `https://TU-DOMINIO/api/lemonsqueezy-checkout`.
12. Hacer una compra de prueba y verificar que el webhook guarda la suscripcion en Supabase.
13. Probar `https://TU-DOMINIO/api/check-premium?email=TU_EMAIL`.
14. Probar `https://TU-DOMINIO/api/market-price?operation=sale&municipality=Logrono&zone=Casco%20Antiguo&listing_price_total=210000&listing_area_m2=100`.

No conviene confiar en `chrome.storage.local` para Premium real, porque el usuario puede modificarlo.
