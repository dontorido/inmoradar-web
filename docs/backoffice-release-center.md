# Centro de versiones en backoffice

El objetivo es que los cambios de Web, Extension y Backoffice no dependan de archivos sueltos descargados en local. El backoffice guarda cada artefacto con version, canal, tipo, notas internas, hash SHA-256 y conector previsto.

## Tabla

Ejecuta `database/release-artifacts.sql` en Supabase.

La tabla `release_artifacts` guarda:

- `target`: `web`, `extension` o `backoffice`.
- `version`: version operativa o semantica.
- `channel`: `draft`, `staging`, `production`, `beta` o `stable`.
- `status`: `draft`, `ready`, `submitted`, `published`, `failed` o `archived`.
- `artifact_kind`: paquete, manifest, notas, config o log.
- `connector_target`: Vercel, GitHub, Chrome, Edge, Firefox o Supabase.
- `artifact_payload`: contenido inline en base64 para archivos pequeños.
- `storage_path`: reservado para paquetes grandes en Supabase Storage.

## Operaciones

En el menu `Operaciones` hay cuatro areas:

- `Parking`: lo existente de Parking Intelligence.
- `Web`: paquetes y notas de despliegue web.
- `Extensión`: ZIP/CRX/XPI, manifest y notas por navegador.
- `Backoffice`: cambios del propio panel, SQL, configs y logs.

## Conectores futuros

La publicacion automatica debe ir por APIs oficiales:

- Chrome Web Store API: upload, fetch status, publish y rollout por porcentaje.
- Microsoft Edge Add-ons API: upload de package a draft, estado de operacion y publish.
- Firefox AMO API: upload multipart de XPI/listed o unlisted y versionado.

No se debe intentar actualizar extensiones instaladas saltandose los stores. El backoffice sera el lugar desde el que se sube y se audita la version; la distribucion final sigue el canal oficial de cada navegador.

## Chrome Web Store

Chrome ya queda preparado como primer conector real del centro de versiones. El flujo previsto es:

1. Guardar un artefacto en `Operaciones > Extension` con `Destino navegador = Chrome Web Store`.
2. Comprobar `Estado Chrome` para leer el estado actual de la ficha en Chrome Web Store.
3. Pulsar `Subir ZIP` para enviar el paquete guardado en `release_artifacts.artifact_payload`.
4. Pulsar `Enviar revision` para llamar a `publish` y dejarlo en revision/publicacion segun Chrome.

Variables necesarias en Vercel:

- `CHROME_WEBSTORE_PUBLISHER_ID`
- `CHROME_WEBSTORE_ITEM_ID`
- `CHROME_WEBSTORE_CLIENT_ID`
- `CHROME_WEBSTORE_CLIENT_SECRET`
- `CHROME_WEBSTORE_REFRESH_TOKEN`

Tambien se admite `CHROME_WEBSTORE_ACCESS_TOKEN` como alternativa temporal, pero no es recomendable para produccion porque caduca. La opcion estable es guardar `client id`, `client secret` y `refresh token`; el backoffice genera access tokens nuevos cuando los necesita.

Limitacion actual: los ZIP pequenos se guardan inline en base64 con limite de 3 MB desde el navegador. Para paquetes mayores, el siguiente paso es mover el binario a Supabase Storage y guardar solo `storage_path` en `release_artifacts`.
