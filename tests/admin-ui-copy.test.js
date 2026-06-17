const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

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
  assert.match(copy, /Diagnostico de candidatos/);
  assert.match(copy, /No publicables/);
  assert.match(copy, /Score bajo/);
  assert.match(copy, /Descartadas antes de skip/);
  assert.match(copy, /seo-autogenerate\/diagnostics&candidate_limit=25&template_type=all/);
  assert.match(copy, /Limite diario: \$\{dayLimit\} publicaciones/);
  assert.match(copy, /Limite semanal: \$\{weekLimit\} publicaciones/);
  assert.doesNotMatch(copy, /L[ií]mite diario: 4 publicaciones/);
  assert.doesNotMatch(copy, /cada 6 horas/);
  assert.doesNotMatch(copy, /Cadencia 6h/);
  assert.doesNotMatch(copy, /Objetivo diario:/);
});
