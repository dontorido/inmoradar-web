# Módulo LinkedIn de Marketing

El módulo `Marketing > LinkedIn` permite generar cada día un post para LinkedIn con texto, CTA, hashtags e imagen. Está diseñado con dos modos:

- **Modo manual / fallback**: siempre disponible. Genera el copy, genera una imagen en formato SVG descargable, permite copiar el texto, descargar la imagen y marcar el post como publicado manualmente.
- **Modo automático**: solo publica si existen credenciales válidas, `LINKEDIN_AUTO_PUBLISH_ENABLED=true`, una `LINKEDIN_ORGANIZATION_URN` configurada, permisos aprobados por LinkedIn y una imagen compatible con LinkedIn Images API.

No se usa scraping, automatización de navegador ni APIs no oficiales.

## Variables de entorno

Añadir en Vercel, al menos en Production y Preview si quieres probarlo:

```env
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
LINKEDIN_REDIRECT_URI=https://www.inmoradar.app/admin
LINKEDIN_API_VERSION=202605
LINKEDIN_ORGANIZATION_URN=urn:li:organization:TU_ID
LINKEDIN_AUTO_PUBLISH_ENABLED=false
LINKEDIN_DAILY_POST_TIME=09:30
LINKEDIN_TIMEZONE=Europe/Madrid
```

También deben existir las variables ya usadas por el backoffice:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_IMPORT_TOKEN=
CRON_SECRET=
```

## Base de datos

Ejecuta en Supabase SQL Editor:

```sql
-- database/marketing-linkedin.sql
```

Crea estas tablas:

- `marketing_linkedin_connections`
- `marketing_linkedin_settings`
- `marketing_linkedin_posts`

Los tokens se guardan cifrados desde backend con AES-256-GCM. No se imprimen en logs.

## Crear app en LinkedIn Developers

1. Entra en [LinkedIn Developers](https://www.linkedin.com/developers/).
2. Crea una aplicación para InmoRadar.
3. Configura como redirect URL el valor de `LINKEDIN_REDIRECT_URI`.
4. Solicita el producto/permisos necesarios para Community Management.
5. Pide a LinkedIn acceso a la Community Management API si quieres publicar en una LinkedIn Page.

Documentación oficial usada como referencia:

- OAuth 2.0 / Authorization Code Flow: <https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow>
- Acceso y permisos de APIs LinkedIn: <https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access>
- Posts API: <https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api>
- Images API: <https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/images-api>

## Scopes necesarios

Para publicar en una página de empresa:

- `w_organization_social`
- `r_organization_social`, si está disponible y aprobado

Para fallback o pruebas de perfil personal:

- `w_member_social`

El usuario que conecte LinkedIn debe tener rol válido en la LinkedIn Page:

- `ADMINISTRATOR`
- `CONTENT_ADMIN`
- `DIRECT_SPONSORED_CONTENT_POSTER`

## Organization URN

Debe tener formato:

```txt
urn:li:organization:123456
```

Si solo tienes el número, el backend lo normaliza automáticamente.

## Uso manual

1. Entra en `/admin`.
2. Ve a `Marketing > LinkedIn`.
3. Pulsa `Generar post diario` o `Crear borrador`.
4. Revisa hook, cuerpo, CTA y hashtags.
5. Pulsa `Generar imagen` si quieres regenerar la pieza visual.
6. Pulsa `Copiar texto`.
7. Pulsa `Descargar imagen`.
8. Publica manualmente en LinkedIn.
9. Marca el post como `Publicado manualmente`.

Este modo funciona aunque LinkedIn no haya aprobado todavía la API.

## Activar automático

1. Configura credenciales OAuth.
2. Configura `LINKEDIN_ORGANIZATION_URN`.
3. Asegúrate de tener permisos aprobados por LinkedIn.
4. Cambia `LINKEDIN_AUTO_PUBLISH_ENABLED=true` en Vercel.
5. En Backoffice > Marketing > LinkedIn, activa `Publicación automática`.
6. Decide si mantienes `Aprobación previa`.

Reglas de seguridad:

- No publica si falta conexión.
- No publica si falta `organization_urn`.
- No publica si el body está vacío.
- No publica si falta imagen.
- No publica si el token está expirado y no se puede refrescar.
- No publica dos posts del mismo día salvo acción manual explícita.
- Si LinkedIn devuelve error de permisos, se marca el post como `failed` y se fuerza modo manual en la conexión.

## Cron

El workflow `.github/workflows/seo-cron.yml` llama cada 6 horas al recurso existente de backoffice:

```txt
POST /api/admin?resource=linkedin/daily
```

La llamada usa `x-cron-secret` y reutiliza `api/admin.js`, por lo que no crea una serverless function adicional en Vercel Hobby. El endpoint evita duplicados por día, así que aunque el workflow se ejecute varias veces, solo crea un post diario. Si faltan las tablas `marketing_linkedin_*`, devuelve `ok: true` con `skipped: true` y `reason: "table_missing"` para que el cron SEO no parezca fallar por LinkedIn.

## Limitaciones

- La publicación automática en páginas de empresa depende de aprobación de LinkedIn Community Management API.
- La imagen generada por fallback es SVG descargable para publicación manual. Para publicación automática, usa una URL o data URL compatible con `jpg`, `png` o `webp`.
- El módulo no intenta publicar en LinkedIn usando navegador ni scraping.
