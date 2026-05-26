# Meta Autopublisher IG+FB

Meta Autopublisher publica contenido de InmoRadar en:

- Facebook Page de InmoRadar.
- Instagram Business o Creator vinculado a esa Page.

No usa scraping, navegador automatizado, credenciales manuales, perfiles personales, likes, follows, comentarios ni DMs.

La spike organica rapida vive en los endpoints `/api/meta/*` y permite probar OAuth + un post controlado en canales propios sin activar Ads API, campanas, audiencias, pixeles ni automatizacion de interacciones.

El despliegue inicial debe salir siempre con:

```env
META_AUTOPOST_ENABLED=false
```

## Variables de entorno

```env
META_AUTOPOST_ENABLED=false
META_AUTOPOST_FREQUENCY_DAYS=1
META_AUTOPOST_MAX_PER_DAY=1
META_AUTOPOST_TIME=10:00
META_AUTOPOST_TIMEZONE=Europe/Madrid

META_APP_ID=
META_APP_SECRET=
META_REDIRECT_URI=https://www.inmoradar.app/api/meta/oauth/callback
META_ACCESS_TOKEN_ENCRYPTION_KEY=

META_FACEBOOK_PAGE_ID=
META_FACEBOOK_PAGE_NAME=
META_INSTAGRAM_ACCOUNT_ID=
META_INSTAGRAM_BUSINESS_ACCOUNT_ID=
META_GRAPH_VERSION=v23.0
META_DEFAULT_IMAGE_URL=
META_TEST_IMAGE_URL=
```

Tambien deben existir las variables backend ya usadas por BackOffice:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_IMPORT_TOKEN=
CRON_SECRET=
PUBLIC_SITE_URL=https://www.inmoradar.app
```

No se exponen secretos en frontend ni logs. Los access tokens se cifran en backend.

## Base de datos

Ejecuta en Supabase SQL Editor:

```sql
-- database/marketing-meta.sql
```

Crea:

- `marketing_meta_connections`
- `marketing_meta_settings`
- `marketing_meta_posts`
- `meta_autopublisher_runs`

Estados de posts:

- `draft`
- `queued`
- `publishing`
- `published`
- `failed`
- `skipped`

## Meta Developers

1. Crea o abre la Meta App de InmoRadar.
2. Configura OAuth redirect URI:

```txt
https://www.inmoradar.app/api/meta/oauth/callback
```

3. Activa productos/permisos necesarios para Facebook Login, Pages e Instagram Graph API.
4. Prepara permisos:

- `pages_show_list`
- `pages_read_engagement`
- `pages_manage_posts`
- `instagram_business_basic`
- `instagram_business_content_publish`

El codigo acepta tambien los nombres legacy `instagram_basic` e `instagram_content_publish` como equivalentes al calcular permisos faltantes, porque Meta puede devolver scopes antiguos segun el tipo de app/caso de uso.

Algunos permisos pueden requerir App Review, verificacion de negocio o configuracion adicional en Meta Developers.

## Conexion desde BackOffice

En `BackOffice > Marketing > Meta`:

1. Pulsa `Conectar Meta`.
2. Autoriza con un usuario que gestione la Page.
3. Vuelve a `BackOffice > Marketing > Meta`.
4. Si no se selecciona la Page automaticamente, pulsa `Cargar Pages`.
5. Selecciona la Facebook Page de InmoRadar.
6. Guarda la Page. El sistema detecta `instagram_business_account` si existe.
7. Usa `Estado` o `Probar conexion` antes de publicar.

El endpoint nunca devuelve tokens al cliente. La lista de Pages se sanea y solo muestra id, nombre, tareas/permisos e Instagram vinculado.

## Spike organica

Endpoints exactos:

- `GET /api/meta/oauth/start`: inicia OAuth y redirige a Meta. Desde BackOffice se usa `?format=json` con `ADMIN_IMPORT_TOKEN` para obtener la URL sin exponer secretos.
- `GET /api/meta/oauth/callback`: recibe `code`, intercambia token, detecta Pages disponibles y guarda la conexion en `marketing_meta_connections`.
- `GET /api/meta/status`: protegido por `ADMIN_IMPORT_TOKEN`; devuelve conexion, permisos, Page, Instagram, ultimo intento y ultimo error sin tokens.
- `POST /api/meta/publish-test-facebook`: protegido por `ADMIN_IMPORT_TOKEN`; publica el test organico en la Page.
- `POST /api/meta/publish-test-instagram`: protegido por `ADMIN_IMPORT_TOKEN`; crea media container y publica el test organico en Instagram.

Copy Facebook:

```txt
Estamos probando la publicacion automatica de InmoRadar. InmoRadar ayuda a analizar anuncios inmobiliarios antes de contactar.
```

Link:

```txt
https://www.inmoradar.app
```

Caption Instagram:

```txt
Probando publicacion automatica de InmoRadar. Analiza pisos antes de contactar. Mas informacion en inmoradar.app
```

Imagen de prueba: `META_TEST_IMAGE_URL` si existe; si no, `https://www.inmoradar.app/assets/inmoradar-brand-mark.jpg`.

## Publicacion Facebook

Facebook publica en la Page con:

- caption;
- enlace a landing SEO con UTM;
- imagen opcional si hay URL publica.

Ejemplo:

```txt
https://www.inmoradar.app/saber-si-piso-esta-caro/granada/?utm_source=facebook&utm_medium=social&utm_campaign=seo_city_granada
```

Registra `external_post_id`, `published_url` si Meta lo devuelve o se puede construir, estado y error legible.

## Publicacion Instagram

Instagram usa Content Publishing API:

1. crea media container con `image_url` publica y caption;
2. publica el container;
3. intenta recuperar `permalink`.

Instagram requiere una cuenta Business/Creator vinculada a la Page y una imagen publica. Si falta imagen publica o cuenta de Instagram, el post queda `failed` o `skipped`; no se publica contenido roto.

Ejemplo UTM:

```txt
https://www.inmoradar.app/saber-si-piso-esta-caro/granada/?utm_source=instagram&utm_medium=social&utm_campaign=seo_city_granada
```

Limitacion: los enlaces en captions de Instagram no siempre son clicables. El caption mantiene una URL limpia y una llamada a visitar InmoRadar.

## Generacion de contenido

El generador usa landings SEO publicadas e indexables:

- `/saber-si-piso-esta-caro/:city`
- `/precio-metro-cuadrado/:city`
- `/precio-alquiler/:city`
- `/guias/:slug`

Criterios:

- `status=published`
- `index_status=index`
- `quality_score >= 75`
- URL publica valida
- sin duplicado previo por plataforma/source
- sin senales obvias de mojibake

No publica borradores, `noindex`, baja calidad, URLs vacias ni contenido incompleto.

## Scheduler

El workflow `.github/workflows/seo-cron.yml` llama cada 6 horas:

```txt
POST /api/admin?resource=meta/daily
```

Alias:

```txt
POST /api/admin/meta/autopublisher/run
```

Reglas:

- no publica si `META_AUTOPOST_ENABLED=false`;
- no publica si `autopost_enabled=false` en BackOffice;
- no publica si falta conexion OAuth;
- no publica si faltan permisos;
- no publica si falta Facebook Page;
- no publica en Instagram si falta Instagram Business/Creator;
- no publica si ya alcanzo `META_AUTOPOST_MAX_PER_DAY` por plataforma;
- respeta `META_AUTOPOST_FREQUENCY_DAYS`;
- registra siempre run `published`, `skipped` o `failed`.

## Probar sin publicar

Mantener:

```env
META_AUTOPOST_ENABLED=false
```

Desde BackOffice:

- `Generar proximo contenido` crea borrador;
- `Probar conexion` valida configuracion sin publicar;
- el scheduler registra `skipped` por kill switch.

## Activar publicacion real

Solo tras prueba controlada:

1. aplicar `database/marketing-meta.sql`;
2. configurar Meta App y redirect URI;
3. conectar OAuth;
4. seleccionar Page;
5. confirmar Instagram vinculado;
6. confirmar permisos;
7. activar `META_AUTOPOST_ENABLED=true`;
8. activar `autopost_enabled=true` en BackOffice;
9. ejecutar `Publicar ahora` desde BackOffice para la primera prueba real.

## Pausar y rollback

Pausa inmediata:

```env
META_AUTOPOST_ENABLED=false
```

Tambien se puede pausar con `autopost_enabled=false` en BackOffice.

Rollback de datos:

- dejar settings en `autopost_enabled=false`;
- conservar tablas para trazabilidad;
- eliminar tokens cifrados en `marketing_meta_connections` si se quiere revocar la conexion.

## Troubleshooting

- `missing_permissions:*`: faltan permisos o App Review.
- `missing_facebook_page_id`: no se ha seleccionado Page.
- `missing_instagram_business_account_id`: la Page no tiene Instagram profesional vinculado o no fue detectado.
- `META_AUTOPOST_ENABLED=false`: kill switch de entorno sigue apagado.
- `meta_instagram_public_image_required`: falta imagen publica para Instagram.
- `meta_connection_not_ready`: OAuth o token no estan listos.
