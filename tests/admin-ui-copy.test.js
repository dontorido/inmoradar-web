const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("SEO Autogeneration muestra copy de Vercel Cron 4h sin textos obsoletos", () => {
  const root = path.join(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "admin.html"), "utf8");
  const adminJs = fs.readFileSync(path.join(root, "assets", "admin.js"), "utf8");
  const copy = `${html}\n${adminJs}`;

  assert.match(copy, /cada 4 horas vía Vercel Cron/);
  assert.match(copy, /Condiciones de autogeneraci&oacute;n/);
  assert.match(copy, /Publicaciones m&aacute;ximas por d&iacute;a/);
  assert.match(copy, /Publicaciones m&aacute;ximas por semana/);
  assert.match(copy, /M&aacute;ximo de publicaciones por ejecuci&oacute;n/);
  assert.match(copy, /Score m&iacute;nimo/);
  assert.match(copy, /Guardar condiciones/);
  assert.match(copy, /data-seo-autogen-conditions-form/);
  assert.match(copy, /data-seo-autogen-diagnostics/);
  assert.match(copy, /data-seo-opportunities-preview/);
  assert.match(copy, /Preview backlog SEO/);
  assert.match(copy, /seo\/opportunities\/preview&content_type=landing&template=all&limit=50/);
  assert.match(copy, /Diagnostico de candidatos/);
  assert.match(copy, /No publicables/);
  assert.match(copy, /Score bajo/);
  assert.match(copy, /Descartadas antes de skip/);
  assert.match(copy, /Fuente de candidatos/);
  assert.match(copy, /Seed agotado/);
  assert.match(copy, /candidate_source_diagnostics/);
  assert.match(copy, /seed_exhausted_by_existing_slugs/);
  assert.match(copy, /seo-autogenerate\/diagnostics&candidate_limit=25&template_type=all/);
  assert.match(copy, /L[ií]mite diario: \$\{dayLimit\} publicaciones/);
  assert.match(copy, /L[ií]mite semanal: \$\{weekLimit\} publicaciones/);
  assert.doesNotMatch(copy, /L[ií]mite diario: 4 publicaciones/);
  assert.doesNotMatch(copy, /cada 6 horas/);
  assert.doesNotMatch(copy, /Cadencia 6h/);
  assert.doesNotMatch(copy, /Objetivo diario:/);
});

const emptyReasonCopyByCode = {
  no_candidates_generated: "Sin candidatos generados",
  all_candidates_filtered_before_scoring: "Candidatos filtrados antes de scoring",
  all_candidates_below_min_score: "Todos por debajo del score mínimo",
  publication_limits_reached: "Bloqueado por límites",
  no_selected_content_type: "Sin tipo de contenido seleccionado",
  unknown_empty_results: "Motivo no determinado"
};

for (const [reason, copy] of Object.entries(emptyReasonCopyByCode)) {
  test(`SEO Autogeneration mapea ${reason} a '${copy}'`, () => {
    const adminJs = fs.readFileSync(path.join(__dirname, "..", "assets", "admin.js"), "utf8");
    const expected = new RegExp(`${escapeRegExp(copy)} \\(${reason}\\)`);
    assert.match(adminJs, expected);
  });
}
