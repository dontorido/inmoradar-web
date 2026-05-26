# Meta Autopublisher IG+FB

Meta Autopublisher publica contenido de InmoRadar en:

- Facebook Page de InmoRadar.
- Instagram Business o Creator conectado con Instagram API with Instagram Login.

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

INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
INSTAGRAM_REDIRECT_URI=https://www.inmoradar.app/api/meta/oauth/callback
INSTAGRAM_GRAPH_VERSION=v23.0
INSTAGRAM_OFFICIAL_EMBED_URL=
INSTAGRAM_BUSINESS_LOGIN_URL=
INSTAGRAM_OAUTH_STATE_MODE=query

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
META_ENABLE_LEGACY_INSTAGRAM_SCOPES=false
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

Hay dos IDs distintos:

- `INSTAGRAM_APP_ID`: identificador de aplicacion de Instagram, por ejemplo `14386908146755569`, visible en `Casos de uso > Administrar mensajes y contenido en Instagram > API de Instagram > Configuracion de la API con el inicio de sesion de Instagram`.
- `META_APP_ID`: App ID principal de Meta/Facebook, usado solo para Facebook Login y Facebook Page.

No intercambies estos IDs. Instagram Login no debe usar el dialog de Facebook.

### Instagram API with Instagram Login

1. Abre la Meta App de InmoRadar.
2. En `Casos de uso > Administrar mensajes y contenido en Instagram > API de Instagram > Configuracion de la API con el inicio de sesion de Instagram`, copia:

- Identificador de aplicacion de Instagram -> `INSTAGRAM_APP_ID`.
- Clave secreta de aplicacion de Instagram -> `INSTAGRAM_APP_SECRET`.

3. Configura OAuth redirect URI de Instagram:

```txt
https://www.inmoradar.app/api/meta/oauth/callback
```

4. En Vercel, guarda la misma URL en:

```env
INSTAGRAM_REDIRECT_URI=https://www.inmoradar.app/api/meta/oauth/callback
```

5. Para la spike inicial de Instagram, prepara permisos:

- `instagram_business_basic`
- `instagram_business_content_publish`

El OAuth organico por defecto replica la URL de insercion generada por Meta Developers:

```txt
https://www.instagram.com/accounts/login/?force_authentication&platform_app_id=INSTAGRAM_APP_ID&next=...
```

El parametro `next` contiene la ruta codificada a:

```txt
/oauth/authorize/third_party/
```

con `client_id=INSTAGRAM_APP_ID`, `redirect_uri=INSTAGRAM_REDIRECT_URI`, `response_type=code`, los scopes organicos y el `state` firmado. No usa `https://www.facebook.com/{version}/dialog/oauth`, `https://api.instagram.com/oauth/authorize` ni `https://www.instagram.com/oauth/authorize` como endpoint directo de autorizacion para Instagram.

Si Meta incluye parametros extra en la URL oficial de insercion, copia esa URL completa en `INSTAGRAM_OFFICIAL_EMBED_URL` o `INSTAGRAM_BUSINESS_LOGIN_URL`. El backend la usa como plantilla, conserva extras como `config_id`, `logger_id`, `auth_type` o `display`, y fuerza solo `platform_app_id`, `client_id`, `redirect_uri`, `response_type`, `scope` y `state`.

El arranque OAuth loguea una version saneada de la URL generada y, si existe `INSTAGRAM_OFFICIAL_EMBED_URL`, una comparativa de diferencias por parametro. El `state` se enmascara en logs.

Por defecto `INSTAGRAM_OAUTH_STATE_MODE=query` envia el `state` firmado dentro del `next`. Si la URL oficial de Meta no admite `state`, se puede probar `INSTAGRAM_OAUTH_STATE_MODE=cookie`: el backend omite `state` del `next`, guarda el mismo estado firmado en una cookie `HttpOnly; Secure; SameSite=Lax` limitada al callback y lo valida al volver. Esta variante mantiene una proteccion CSRF razonable para la spike, aunque el modo recomendado sigue siendo `query` si Meta lo acepta.

El intercambio del `code` usa:

```txt
https://api.instagram.com/oauth/access_token
```

y luego intenta obtener token de larga duracion con:

```txt
https://graph.instagram.com/access_token
```

El flujo Instagram no pide `instagram_basic` ni `instagram_content_publish`; solo se pedirian activando explicitamente `META_ENABLE_LEGACY_INSTAGRAM_SCOPES=true`, que debe quedar apagado para esta app.

### Facebook Page

Para publicar tambien en Facebook Page, configura el App ID principal de Meta/Facebook:

```env
META_APP_ID=
META_APP_SECRET=
META_REDIRECT_URI=https://www.inmoradar.app/api/meta/oauth/callback
```

La app debe tener disponible el flujo/producto de Pages y estos permisos en un flujo separado:

- `pages_show_list`
- `pages_read_engagement`
- `pages_manage_posts`

El flujo Facebook Page usa:

```txt
https://www.facebook.com/{META_GRAPH_VERSION}/dialog/oauth
```

con `client_id=META_APP_ID`.

El codigo acepta nombres legacy de Instagram al evaluar permisos ya concedidos, pero no los solicita en OAuth salvo con el flag legacy anterior.

Algunos permisos pueden requerir App Review, verificacion de negocio o configuracion adicional en Meta Developers.

## Conexion desde BackOffice

En `BackOffice > Marketing > Meta`:

1. Pulsa `Conectar Instagram`.
2. Autoriza con un usuario que gestione la cuenta profesional de Instagram.
3. Vuelve a `BackOffice > Marketing > Meta`.
4. Usa `Estado` o `Probar conexion` antes de publicar en Instagram.
5. Solo cuando la app tenga permisos Page disponibles, pulsa `Conectar Facebook Page`.
6. Pulsa `Cargar Pages`, selecciona la Facebook Page de InmoRadar y guarda la Page.

El endpoint nunca devuelve tokens al cliente. La lista de Pages se sanea y solo muestra id, nombre, tareas/permisos e Instagram vinculado.

## Spike organica

Endpoints exactos:

- `GET /api/meta/oauth/start?target=instagram`: inicia Instagram Login y redirige a `https://www.instagram.com/accounts/login/` con `platform_app_id=INSTAGRAM_APP_ID`; el parametro `next` apunta a `/oauth/authorize/third_party/`.
- `GET /api/meta/oauth/start?target=facebook`: inicia Facebook Login y redirige a `https://www.facebook.com/{META_GRAPH_VERSION}/dialog/oauth` con `META_APP_ID`.
- `GET /api/meta/oauth/callback`: recibe `code`, intercambia token, detecta Pages disponibles y guarda la conexion en `marketing_meta_connections`.
- `GET /api/meta/status`: protegido por `ADMIN_IMPORT_TOKEN`; devuelve conexion, permisos, Page, Instagram, ultimo intento y ultimo error sin tokens.
- `POST /api/meta/publish-test-facebook`: protegido por `ADMIN_IMPORT_TOKEN`; publica el test organico en la Page.
- `POST /api/meta/publish-test-instagram`: protegido por `ADMIN_IMPORT_TOKEN`; crea media container y publica el test organico en Instagram.

Scopes OAuth por defecto:

```txt
instagram_business_basic,instagram_business_content_publish
```

Scopes OAuth del flujo separado de Facebook Page:

```txt
pages_show_list,pages_read_engagement,pages_manage_posts
```

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

Instagram usa Content Publishing API con Instagram Login:

1. crea media container con `image_url` publica y caption;
2. publica el container;
3. intenta recuperar `permalink`.

El flujo Instagram usa endpoints `graph.instagram.com/{INSTAGRAM_GRAPH_VERSION}` y un token de usuario de Instagram. Requiere una cuenta Business/Creator, permisos concedidos y una imagen publica. Si falta imagen publica o cuenta de Instagram, el post queda `failed` o `skipped`; no se publica contenido roto.

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
