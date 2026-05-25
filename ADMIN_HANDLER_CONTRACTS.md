# Contratos de handlers admin

Fecha: 2026-05-25
Rama: `feature/admin-router-handler-contracts`

## 1. Objetivo

Este documento define el contrato interno recomendado para handlers usados por `api/admin.js` y `api/_admin/router.js`. La meta es seguir reduciendo el monolito sin cambiar URLs, payloads, codigos HTTP, auth ni comportamiento visible del backoffice.

## 2. Contrato actual conservado

El contrato runtime actual se conserva:

```js
async function handler(context) {
  return {
    status: 200,
    payload: { ok: true }
  };
}
```

El router normaliza el resultado mediante `normalizeHandlerResult`. Si el handler devuelve `{ status, payload }`, se respeta exactamente. Si devuelve un payload directo, el router lo envuelve con status por defecto.

## 3. Contexto de entrada

El router invoca handlers con un objeto `context`:

- `req`: request original.
- `url`: `URL` ya construida desde la peticion.
- `resource`: resource normalizado.

No se debe mover auth al handler. `api/admin.js` debe seguir validando admin/cron antes de despachar.

## 4. Dependencias para handlers extraidos

Cuando un handler se extrae a `api/_admin/handlers/*`, debe recibir dependencias por factory si depende de utilidades sensibles o del runtime admin:

```js
const handleKpiSettings = createKpiSettingsHandler({
  readJsonBody,
  supabaseFetch
});
```

Regla recomendada:

- importar constantes puras o helpers de dominio desde modulos existentes;
- inyectar `supabaseFetch`, `readJsonBody`, safe fetchers o wrappers sensibles;
- no importar `api/admin.js` desde handlers;
- no mover auth ni service role al handler extraido;
- no crear dependencias circulares.

## 5. Respuesta de handler

Un handler admin debe devolver:

- `status`: codigo HTTP exacto;
- `payload`: objeto JSON exacto que espera el backoffice.

No debe escribir directamente en `res`, salvo handlers especiales legacy que ya hacen streaming o respuestas no JSON y que no deben entrar al router sin fase dedicada.

## 6. Errores

La politica actual es:

- errores locales no capturados suben al catch comun de `api/admin.js`;
- el catch comun usa `sanitizeErrorMessage` o saneador especifico Meta;
- los tests deben comprobar que no aparecen tokens, service role, bearer tokens ni secretos;
- los handlers extraidos no deben devolver errores crudos de proveedores externos.

## 7. Metodos y fallback

Cada ruta debe declarar metodos exactos:

```js
{
  resource: "kpis/settings",
  method: ["GET", "POST"],
  fallbackOnMethodMismatch: true,
  handler: ({ req }) => handleKpiSettings(req)
}
```

Reglas:

- no usar wildcards;
- no capturar resources genericos;
- usar `fallbackOnMethodMismatch` para recursos mixtos que aun conservan legacy;
- probar que metodos no soportados mantienen el comportamiento actual;
- probar que recursos vecinos no quedan capturados por accidente.

## 8. Metadatos recomendados

No se implementan todavia para evitar diff innecesario, pero el registro de rutas podria documentar en una fase posterior:

- `readOnly: true`
- `writesLocal: true`
- `external: false`
- `risk: "low" | "medium" | "high" | "critical"`
- `legacyFallback: true`
- `owner: "kpis" | "operations" | "analytics" | "seo"`

Recomendacion: introducir metadatos solo si se van a usar en tests, documentacion generada o auditoria automatica.

## 9. Reglas para read-only

Un read-only es candidato a router o extraccion si:

- es GET puro;
- no escribe Supabase;
- no modifica timestamps;
- no recalcula y persiste;
- no llama APIs externas;
- no genera ni publica contenido;
- conserva payload y codigo;
- tiene tests de payload, errores y datos vacios.

## 10. Reglas para writes internos

Un write interno es candidato si:

- escribe localmente en Supabase;
- no llama proveedores externos;
- no publica ni genera contenido;
- no toca billing, OAuth, Chrome, Meta, LinkedIn, Runway ni webhooks;
- tiene body pequeno y validacion clara;
- rollback sencillo;
- tests para body valido, body invalido, error Supabase saneado y no secretos.

## 11. Writes con efectos externos

Quedan bloqueados hasta fase posterior:

- `operations/chrome`;
- Chrome Web Store;
- SEO publish/noindex/archive/regenerate;
- `seo-autogenerate/run`;
- Meta/Facebook/Instagram;
- LinkedIn;
- social-video/Runway;
- Viraliza;
- checkout, portal, Lemon Squeezy, billing y webhooks;
- emails, cron y jobs.

## 12. Checklist para extraer un handler

- Confirmar que la ruta ya esta cubierta por tests.
- Enumerar dependencias.
- Evitar mover auth.
- Evitar mover service role o config sensible.
- Evitar dependencias circulares.
- Mantener `{ status, payload }`.
- Mantener body parsing actual.
- Mantener errores actuales.
- Ejecutar `node --check` del archivo nuevo.
- Ejecutar `node --test tests/admin-router.test.js`.
- Ejecutar tests globales.

## 13. Checklist para migrar un nuevo write

- Confirmar metodo/resource exactos.
- Confirmar tabla afectada.
- Confirmar que no hay llamada externa.
- Confirmar body valido e invalido.
- Confirmar JSON mal formado.
- Confirmar errores Supabase saneados.
- Confirmar no exposicion de tokens/secrets.
- Confirmar que no se abren wildcards.
- Confirmar que legacy no relacionado sigue intacto.
- Documentar rollback.

## 14. Estado de la pausa tecnica

Se extrajo solo `kpis/settings` a `api/_admin/handlers/kpis.js` porque sus dependencias son claras y pequenas:

- `readJsonBody`;
- `supabaseFetch`;
- `api/_kpi/settings`.

No se extrajo `operations/releases` todavia porque depende tambien de:

- `safeFetch`;
- `clampLimit`;
- `normalizeReleaseArtifactInput`;
- `normalizeReleaseTarget`;
- `releaseConnectors`.

Aunque sigue siendo un handler razonable, extraerlo ahora ampliaria la fase. Conviene hacerlo como paso separado o despues de definir mejor dependencias compartidas para operaciones.
