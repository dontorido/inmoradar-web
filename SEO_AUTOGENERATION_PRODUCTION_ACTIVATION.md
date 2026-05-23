# SEO Autogeneration Production Activation

## A. Estado de merge

- Merge realizado en `main`.
- Hash del merge commit: `6973cd3bd712e0041931b5e92a1fff21563715b9`.
- Rama mergeada: `feature/seo-autogeneration`.
- Push realizado a `origin/main`.

Tests ejecutados con Node bundled porque `node.exe` del sistema devuelve `Acceso denegado`:

- `node --check api/_seo/autogeneration.js` -> OK
- `node --check api/admin.js` -> OK
- `node --check assets/admin.js` -> OK
- `node --check api/_utils.js` -> OK
- `node --test tests/seo-autogeneration.test.js` -> 14/14 OK
- `node --test tests/seo.test.js` -> 14/14 OK
- `node --test tests/owned-analytics.test.js` -> 10/10 OK
- `node --test tests/*.test.js` -> 170/170 OK

Resultado: OK.

## B. Variables que hay que configurar en Vercel Production

Primera fase recomendada, dry-run:

```text
SEO_AUTOGENERATION_ENABLED=true
SEO_AUTOGENERATION_DRY_RUN=true
SEO_AUTOGENERATION_MAX_PER_RUN=1
SEO_AUTOGENERATION_MAX_PER_DAY=3
SEO_AUTOGENERATION_MAX_PER_WEEK=10
SEO_AUTOGENERATION_MIN_SCORE=80
```

Segunda fase, publicacion real, solo despues de validar dry-run:

```text
SEO_AUTOGENERATION_ENABLED=true
SEO_AUTOGENERATION_DRY_RUN=false
SEO_AUTOGENERATION_MAX_PER_RUN=1
SEO_AUTOGENERATION_MAX_PER_DAY=3
SEO_AUTOGENERATION_MAX_PER_WEEK=10
SEO_AUTOGENERATION_MIN_SCORE=80
```

## C. Validacion dry-run

Comprobar:

- BackOffice -> SEO Autogeneration.
- `seo_cron_runs` con `job_name='seo-autogeneration'`.
- `result_json` con `skipped`, `draft`, `published`, `final_score` y `reason`.
- No debe haber nuevas paginas publicadas si `dry_run=true`.

## D. Validacion publicacion real

Comprobar:

- `seo_landings` nuevas con `status='published'`.
- `index_status='index'`.
- `quality_score >= 80`.
- `canonical_url` correcto.
- `slug` correcto.
- `sitemap.xml` incluye solo publicadas/indexables.
- BackOffice muestra `published_count`.

## E. Rollback/pausa inmediata

```text
SEO_AUTOGENERATION_ENABLED=false
```

## F. Riesgos

- Duplicados/canibalizacion: aunque hay bloqueo por `target_path`, ciudad/tipo, metas y similitud, revisar logs reales.
- Datos insuficientes: si faltan fuente, URL de fuente, fecha o dato real, el sistema debe registrar `skipped`.
- Sobrepublicacion: los limites estan capados en codigo, pero conviene monitorizar `seo_cron_runs`.
- Calidad SEO: revisar manualmente los primeros candidatos antes de `DRY_RUN=false`.
- Interaccion con politica 2+2: el cron anterior queda como fallback, pero el flujo activo de Vercel/GitHub apunta a `seo-autogenerate/run`.

## G. Recomendacion final

“Recomendado: activar primero 24–48h en dry-run. Pasar a DRY_RUN=false solo si los logs muestran candidatos correctos.”
