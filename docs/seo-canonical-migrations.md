# SEO canonical migrations

## Coste real comprar vivienda

- Primary URL: `/coste-real-comprar-vivienda/`
- Previous URL: `/guias/coste-real-comprar-vivienda/`
- Reason: both target the same keyword (`coste real comprar vivienda`) and the same intent around estimating the real cost of a home before contacting.

The migration is prepared but conditional. The previous guide keeps serving while the primary URL is not published or does not pass the sitemap/indexability gate. Once the primary landing is published and indexable, `/guias/coste-real-comprar-vivienda/` redirects permanently to `/coste-real-comprar-vivienda/`, and the sitemap keeps only the primary URL.

Operational follow-up:

1. Review and publish `seo_landings.id = 15` only after editorial approval.
2. Verify `/coste-real-comprar-vivienda/` returns `200`, `robots=index,follow`, and canonicalizes to itself.
3. Verify `/guias/coste-real-comprar-vivienda/` returns `301` to `/coste-real-comprar-vivienda/`.
4. Verify `sitemap.xml` includes only `/coste-real-comprar-vivienda/` for this topic.
