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
  assert.match(copy, /Límite diario: 4 publicaciones/);
  assert.match(copy, /Máximo 1 por ejecución/);
  assert.doesNotMatch(copy, /cada 6 horas/);
  assert.doesNotMatch(copy, /Cadencia 6h/);
  assert.doesNotMatch(copy, /Objetivo diario:/);
});
