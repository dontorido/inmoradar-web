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
  const autogenPanel = html.match(/<article class="admin-panel admin-seo-autogen-panel"[\s\S]*?<\/article>/)?.[0] || "";
  const opportunityInspectorPanel = html.match(/<article class="admin-panel admin-seo-opportunity-inspector-panel"[\s\S]*?<\/article>/)?.[0] || "";
  const autogenLoader = adminJs.match(/async function loadSeoAutogeneration\(\)[\s\S]*?async function loadKpis/)?.[0] || "";
  const previewRenderer = adminJs.match(/function renderSeoOpportunitiesPreview[\s\S]*?function renderSeoSummary/)?.[0] || "";

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
  assert.doesNotMatch(autogenPanel, /data-seo-opportunities-preview/);
  assert.match(copy, /data-seo-autogen-opportunities-preview/);
  assert.match(copy, /Crear oportunidades no publica páginas/);
  assert.match(copy, /home_life_topic no está en autopublish/);
  assert.match(copy, /pending = oportunidad/);
  assert.match(copy, /ready_to_publish = aprobado, no publicado/);
  assert.match(copy, /Pipeline de contenidos/);
  assert.match(copy, /Sin datos/);
  assert.match(copy, /Guías editoriales \/ noticias/);
  assert.match(copy, /Incluye contenido editorial y guías/);
  assert.doesNotMatch(copy, /<option value="news">news<\/option>/);
  assert.match(copy, /Publicación manual/);
  assert.match(copy, /Sitemap e indexabilidad/);
  assert.match(copy, /Todavía no hay diagnóstico de sitemap disponible/);
  assert.match(copy, /landings publicadas/);
  assert.match(copy, /incluidas en sitemap/);
  assert.match(copy, /excluidas de sitemap/);
  assert.match(copy, /allowed_template_types/);
  assert.match(copy, /Todos los template_type/);
  assert.match(copy, /cluster_id se revisa en briefs home-life/);
  assert.match(copy, /Preview backlog SEO/);
  assert.match(copy, /Solo lectura: no crea oportunidades ni publica contenido/);
  assert.match(copy, /Crear oportunidades pendientes, no publicar/);
  assert.match(copy, /No publica, no crea landings, solo crea oportunidades pending/);
  assert.match(copy, /Insertarían/);
  assert.match(copy, /SEED_SEO_OPPORTUNITIES/);
  assert.match(copy, /seo\/opportunities\/seed-preview/);
  assert.match(copy, /data-seo-opportunity-seed-form/);
  assert.match(copy, /data-seo-opportunity-seed-confirm/);
  assert.match(copy, /data-seo-opportunity-seed-execute/);
  assert.match(copy, /seo\/opportunities\/preview&content_type=landing&template=all&limit=50/);
  assert.match(copy, /Inspector de opportunities SEO \(read-only\)/);
  assert.match(copy, /Solo lectura\./);
  assert.match(copy, /No crea drafts, no publica y no ejecuta seeds\./);
  assert.match(copy, /Usa este inspector para confirmar IDs reales antes de operar\./);
  assert.match(copy, /No uses IDs inferidos\./);
  assert.match(copy, /Buscar risk_signals home-life pending/);
  assert.match(copy, /seo\/opportunities\/inspect/);
  assert.match(copy, /data-seo-opportunity-inspector-form/);
  assert.match(copy, /data-seo-opportunity-inspector-result/);
  assert.match(copy, /Diagnóstico read-only/);
  assert.doesNotMatch(opportunityInspectorPanel, /data-seo-publish|data-seo-generate|data-seo-opportunity-seed|data-seo-home-topic-seed|PUBLICAR_LANDING|SEED_SEO/);
  assert.match(copy, /Crear oportunidades SEO temáticas, no publicar/);
  assert.match(copy, /No publica landings\. Solo crea oportunidades pending/);
  assert.match(copy, /SEED_SEO_HOME_TOPICS/);
  assert.match(copy, /seo\/opportunities\/home-topics-preview/);
  assert.match(copy, /seo\/opportunities\/home-topics-seed/);
  assert.match(copy, /data-seo-home-topic-seed-form/);
  assert.match(copy, /data-seo-home-topic-seed-confirm/);
  assert.match(copy, /data-seo-home-topic-seed-execute/);
  assert.match(copy, /Regenerar<\/button>/);
  assert.match(copy, /Publicar<\/button>/);
  assert.match(copy, /Bloquear<\/button>/);
  assert.match(copy, /PUBLICAR_LANDING/);
  assert.match(copy, /Acción sensible: requiere escribir PUBLICAR_LANDING/);
  assert.match(copy, /Esta acción puede hacer la página pública e indexable/);
  assert.match(copy, /Confirmación requerida para publicar esta landing SEO/);
  assert.match(copy, /data-template-type/);
  assert.match(copy, /data-status/);
  assert.match(copy, /window\.prompt/);
  assert.match(copy, /if \(action === "publish" && !confirmSeoRowPublish\(button\)\)/);
  assert.match(copy, /Publicación cancelada: confirmación requerida/);
  assert.match(copy, /total_candidates/);
  assert.match(copy, /insertable_candidates/);
  assert.match(copy, /schema_migration_available/);
  assert.match(copy, /per_cluster_counts/);
  assert.match(copy, /per_template_counts/);
  assert.match(autogenLoader, /loadSeoOpportunitiesPreview\(\)/);
  assert.match(autogenLoader, /loadSeoHomeTopicOpportunitiesPreview\(\)/);
  assert.doesNotMatch(previewRenderer, /<button/);
  assert.doesNotMatch(previewRenderer, /method:\s*["'](?:POST|PATCH)["']/);
  assert.doesNotMatch(copy, /data-seo-opportunity-seed-publish/);
  assert.doesNotMatch(copy, /Publicar oportunidades/);
  assert.match(copy, /Diagnóstico de candidatos/);
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
