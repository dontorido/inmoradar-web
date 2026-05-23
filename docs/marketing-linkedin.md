# Modulo LinkedIn Autopublisher

Destino real de publicacion:

```txt
https://www.linkedin.com/company/inmoradar-app/
```

La Fase 1 genera posts del tipo `precio_sexy_coste_oculto`: vivienda atractiva, precio visible tipo `895 €/mes`, pregunta `¿Lo alquilarias?` y copy sobre costes ocultos como aparcamiento, parking caro, IBI, comunidad, ruido, transporte, reformas y coste real de vivir ahi.

No se usa scraping, automatizacion de navegador, credenciales manuales, likes, follows ni comentarios.

## Variables de entorno

```env
LINKEDIN_AUTOPOST_ENABLED=false
LINKEDIN_AUTOPOST_FREQUENCY_DAYS=2
LINKEDIN_AUTOPOST_MAX_PER_DAY=1
LINKEDIN_COMPANY_URL=https://www.linkedin.com/company/inmoradar-app/
LINKEDIN_ORGANIZATION_ID=
LINKEDIN_ORGANIZATION_URN=
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
LINKEDIN_REDIRECT_URI=https://www.inmoradar.app/admin
LINKEDIN_API_VERSION=202605
LINKEDIN_AUTOPOST_TIME=10:00
LINKEDIN_AUTOPOST_TIMEZONE=Europe/Madrid
LINKEDIN_ACCESS_TOKEN_ENCRYPTION_KEY=
```

`LINKEDIN_AUTO_PUBLISH_ENABLED`, `LINKEDIN_DAILY_POST_TIME` y `LINKEDIN_TIMEZONE` siguen aceptandose como alias legacy, pero la configuracion nueva debe usar `LINKEDIN_AUTOPOST_*`.

Tambien deben existir las variables ya usadas por el backoffice:

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

Crea o amplia:

- `marketing_linkedin_connections`
- `marketing_linkedin_settings`
- `marketing_linkedin_posts`
- `linkedin_autopublisher_runs`

Los tokens se guardan cifrados desde backend. No se exponen en frontend ni se escriben en logs.

## OAuth y permisos

1. Crea una app en LinkedIn Developers para InmoRadar.
2. Configura `LINKEDIN_REDIRECT_URI`.
3. Solicita acceso a Community Management API.
4. Conecta desde BackOffice > Marketing > LinkedIn.

Scope requerido para MVP:

- `w_organization_social`

Scope opcional posterior:

- `r_organization_social`

El usuario que conecta debe poder publicar en la LinkedIn Company Page.

## Organization URN

Formato esperado:

```txt
urn:li:organization:123456
```

Para obtenerlo, localiza el `organization_id` de la pagina de empresa desde LinkedIn Developers, el panel de administracion de la organizacion o APIs aprobadas de organizacion. Guarda `LINKEDIN_ORGANIZATION_ID=123456` o directamente `LINKEDIN_ORGANIZATION_URN=urn:li:organization:123456`.

El backend usa ese URN como `author` en Posts API. No publica como perfil personal.

## Reglas del scheduler

El workflow `.github/workflows/seo-cron.yml` llama cada 6 horas al endpoint:

```txt
POST /api/admin?resource=linkedin/daily
```

Alias recomendado:

```txt
POST /api/admin/linkedin/autopublisher/run
```

El endpoint decide si toca publicar:

- no publica si `LINKEDIN_AUTOPOST_ENABLED=false`;
- no publica si `autopost_enabled=false` en BackOffice;
- no publica si falta conexion OAuth;
- no publica si falta `organization_urn`;
- no publica si ya se publico hoy;
- no publica mas de `LINKEDIN_AUTOPOST_MAX_PER_DAY=1`;
- respeta `LINKEDIN_AUTOPOST_FREQUENCY_DAYS=2`;
- registra `published`, `skipped` o `failed` en `linkedin_autopublisher_runs`.

## BackOffice

La seccion `Marketing > LinkedIn` muestra:

- pagina destino InmoRadar;
- company URL;
- estado de conexion;
- `organization_id` y `organization_urn`;
- enabled/paused;
- frecuencia;
- proxima publicacion;
- ultimos posts;
- preview de imagen;
- copy generado;
- error si falla;
- botones `Generar borrador ahora`, `Publicar ahora` si connected y `Pausar`.

## Probar sin publicar

Mantener:

```env
LINKEDIN_AUTOPOST_ENABLED=false
```

Desde BackOffice se puede generar borrador, copiar texto y descargar el placeholder. El scheduler registrara `skipped` si esta desactivado.

## Limitaciones MVP

- La publicacion real depende de permisos LinkedIn aprobados.
- El fallback visual es SVG para preview/descarga manual. Para publicacion automatica con imagen, usa URL o data URL `jpg`, `png` o `webp`; si no, el MVP no bloquea el sistema.
- No hay lectura de analitica de posts hasta incorporar `r_organization_social`.
