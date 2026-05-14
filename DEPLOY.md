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
2. Tipo: suscripcion mensual.
3. Precio: `1,99 EUR`.
4. Success URL: `https://TU-DOMINIO/success.html`.
5. Cancel URL: `https://TU-DOMINIO/cancel.html`.
6. Copiar URL de checkout en `assets/app.js`.

## Siguiente fase tecnica

La web ya vende el plan, pero la extension todavia necesita validacion real de suscripcion.

Para produccion:

- Crear backend de licencias.
- Recibir webhooks del proveedor de pagos.
- Guardar email/cliente/suscripcion.
- Exponer endpoint para validar si el usuario tiene Premium activo.
- Cambiar el boton de la extension para iniciar sesion o introducir email/licencia.

No conviene confiar en `chrome.storage.local` para Premium real, porque el usuario puede modificarlo.
