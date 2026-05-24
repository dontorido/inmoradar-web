# Contrato de eventos de uso de extension

Este contrato mide activacion de producto de forma anonima. No debe usarse para guardar contenido de anuncios, URL completa, direccion exacta, telefonos, emails, nombres de anunciantes ni texto completo del anuncio.

## Endpoint

```txt
POST https://www.inmoradar.app/api/extension-usage
```

La ruta se reescribe a `api/extension-version.js?resource=usage` y persiste en `extension_usage_events`.

## Payload aceptado

```json
{
  "event_name": "analysis_completed",
  "anonymous_user_id": "anon-uuid-generado-en-extension-storage",
  "session_id": "session-uuid",
  "occurred_at": "2026-05-24T08:30:00.000Z",
  "page_domain": "idealista.com",
  "extension_version": "2.0.0",
  "browser": "chrome",
  "browser_name": "chrome",
  "browser_version": "124",
  "platform": "windows",
  "country": "ES",
  "duration_seconds": 60,
  "active_seconds": 42,
  "source": "extension",
  "manifest_version": 3,
  "locale": "es-ES",
  "metadata": {
    "portal": "Idealista",
    "operation_type": "sale",
    "has_market_reference": true,
    "has_parking_assessment": true
  }
}
```

Compatibilidad legacy:

- `anonymous_id`, `anonymousId`, `client_id` y `clientId` siguen aceptados.
- `pageDomain`, `page_url` y `pageUrl` se aceptan, pero solo se guarda el dominio normalizado.
- `eventName`, `extensionVersion`, `browserName`, `browserVersion`, `durationSeconds` y `activeSeconds` siguen aceptados.

## Eventos de activacion

- `extension_installed`: primera instalacion detectada por la extension.
- `extension_opened`: popup o widget abierto.
- `listing_detected`: pagina compatible con anuncio detectada.
- `analysis_started`: comienza el analisis del anuncio.
- `analysis_completed`: termina el analisis del anuncio.
- `first_listing_analysis`: evento derivado backend-only para el primer `analysis_completed` de un usuario anonimo.
- `cta_clicked`: accion interna no sensible, por ejemplo abrir widget o guardar.
- `error`: fallo tecnico no bloqueante, con metadata saneada.
- `heartbeat`, `session_start`, `session_end`: eventos legacy/operativos.

## Campos persistidos

- `event_name`
- `occurred_at`
- `anonymous_id_hash`
- `session_id_hash`
- `page_domain`
- `browser_name`
- `browser_version`
- `platform`
- `country`
- `extension_version`
- `duration_seconds`
- `active_seconds`
- `source`
- `metadata`
- `created_at`

`anonymous_user_id` y `session_id` nunca se guardan en claro: se guardan como hash SHA-256 truncado usando `EXTENSION_USAGE_HASH_SECRET` si existe.

## Metadata permitida

Solo se conservan claves de producto de bajo riesgo:

- `portal`
- `operation_type`
- `has_price`
- `has_surface`
- `has_market_reference`
- `has_parking_assessment`
- `manifest_version`
- `locale`
- `area`
- `reason`
- `cta`
- `target`
- `derived_from`
- `attribution_id`
- `install_source`
- `landing_path`
- `click_timestamp`
- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_term`
- `utm_content`
- `store`

El backend descarta cualquier otra clave.

Los campos de atribucion son opcionales y solo deben usarse si llegan por un mecanismo legitimo y no sensible. En el MVP web-store actual no hay union deterministica entre Chrome Web Store y extension; ver `docs/FUNNEL_ATTRIBUTION.md`.

## Campos descartados por privacidad

Se descartan, aunque la extension los enviara por error:

- URL completa del anuncio.
- Direccion exacta.
- Titulo o descripcion del anuncio.
- Precio, superficie u otros importes exactos.
- Telefono, email, nombre de anunciante, agencia o persona.
- Texto completo del anuncio.
- Coordenadas exactas.
- Query strings de landing o URLs completas de campana.

Los valores de metadata permitida tambien se limpian para reemplazar URLs, emails, telefonos y numeros largos.

## Metricas agregadas disponibles

`summarizeExtensionUsage` devuelve:

- usuarios anonimos 30d, activos 7d y activos 24h;
- sesiones 30d;
- eventos por navegador, pais, version, dominio y tipo de evento;
- `extension_opened`;
- `listing_detected`;
- `analysis_started`;
- `analysis_completed`;
- `first_listing_analysis`;
- usuarios con primer analisis;
- ratio `listing_detected -> analysis_completed`;
- ratio `extension_opened -> first_listing_analysis`.

## Reglas de privacidad

- No usar este endpoint como tracker de URLs.
- No enviar ni guardar contenido de anuncios.
- No usar datos para identificar personas.
- No bloquear la experiencia si el tracking falla.
