const { evaluateSitemapEligibility } = require("./indexability");
const { canonicalForSlug } = require("./text");

const SEO_CANONICAL_MIGRATIONS = [
  {
    id: "coste_real_comprar_vivienda_home_life",
    primary_slug: "coste-real-comprar-vivienda",
    legacy_slug: "guias/coste-real-comprar-vivienda",
    keyword: "coste real comprar vivienda",
    reason: "same_keyword_and_intent_home_life_migration"
  }
];

function normalizeSlug(value) {
  return String(value || "").replace(/^\/+|\/+$/g, "").toLowerCase();
}

function canonicalMigrationForLegacySlug(slug) {
  const normalized = normalizeSlug(slug);
  return SEO_CANONICAL_MIGRATIONS.find((migration) => migration.legacy_slug === normalized) || null;
}

function canonicalMigrationForPrimarySlug(slug) {
  const normalized = normalizeSlug(slug);
  return SEO_CANONICAL_MIGRATIONS.find((migration) => migration.primary_slug === normalized) || null;
}

function canonicalMigrationUrl(migration) {
  return migration ? canonicalForSlug(migration.primary_slug) : null;
}

function canonicalMigrationTargetReady(landing, migration) {
  if (!landing || !migration) return false;
  if (normalizeSlug(landing.slug) !== migration.primary_slug) return false;
  if (String(landing.status || "").toLowerCase() !== "published") return false;
  return evaluateSitemapEligibility(landing).sitemap_eligible;
}

function applySeoCanonicalMigrations(landings = []) {
  return SEO_CANONICAL_MIGRATIONS.reduce((rows, migration) => {
    const primaryReady = rows.some((landing) => canonicalMigrationTargetReady(landing, migration));
    if (!primaryReady) return rows;
    return rows.filter((landing) => normalizeSlug(landing.slug) !== migration.legacy_slug);
  }, Array.isArray(landings) ? [...landings] : []);
}

module.exports = {
  SEO_CANONICAL_MIGRATIONS,
  applySeoCanonicalMigrations,
  canonicalMigrationForLegacySlug,
  canonicalMigrationForPrimarySlug,
  canonicalMigrationTargetReady,
  canonicalMigrationUrl,
  normalizeSlug
};
