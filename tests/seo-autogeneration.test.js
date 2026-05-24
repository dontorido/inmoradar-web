const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const adminHandler = require("../api/admin");
const {
  runSeoAutogeneration,
  buildSeoAutogenerationOperationalAlerts,
  buildSeoAutogenerationConfig
} = require("../api/_seo/autogeneration");
const { buildPriceCityLanding } = require("../api/_seo/priceCity");

const NOW = "2026-05-23T10:00:00.000Z";

function sourceData(city = "Sevilla") {
  const sale = {
    source: "mivau_appraisal",
    operation: "sale",
    country: "ES",
    autonomous_community: "Andalucia",
    province: city,
    municipality: city,
    zone_name: city,
    geo_level: "municipality",
    price_eur_m2: 2200,
    period_label: "4T 2025",
    period_date: "2025-10-01",
    source_url: "https://example.com/mivau.csv",
    confidence_score: 0.8,
    extracted_at: "2026-05-01T00:00:00.000Z"
  };
  const rent = {
    source: "serpavi",
    operation: "rent",
    country: "ES",
    autonomous_community: "Andalucia",
    province: city,
    municipality: city,
    zone_name: city,
    geo_level: "municipality",
    price_eur_m2: 9.5,
    period_label: "2024",
    period_date: "2024-01-01",
    source_url: "https://example.com/serpavi.csv",
    confidence_score: 0.7,
    extracted_at: "2026-05-01T00:00:00.000Z"
  };
  return {
    hasRealData: true,
    hasProvincialOnly: false,
    sale,
    rent,
    records: [sale, rent],
    sources: [sale, rent].map((record) => ({
      operation: record.operation,
      source: record.source,
      source_url: record.source_url,
      period_label: record.period_label,
      period_date: record.period_date,
      geo_level: record.geo_level,
      price_eur_m2: record.price_eur_m2
    }))
  };
}

function noData() {
  return {
    hasRealData: false,
    hasProvincialOnly: false,
    sale: null,
    rent: null,
    records: [],
    sources: []
  };
}

function opportunity(city = "Sevilla", templateType = "price_city", priority = 90) {
  return {
    keyword: templateType === "price_city" ? `precio metro cuadrado ${city}` : `saber si un piso esta caro en ${city}`,
    city,
    province: city,
    autonomous_community: "Andalucia",
    template_type: templateType,
    intent: templateType === "price_city" ? "informational" : "commercial_investigation",
    search_priority: priority,
    status: "pending"
  };
}

function recentPublished(count, spacingHours = 1) {
  return Array.from({ length: count }, (_, index) => ({
    slug: `precio-metro-cuadrado/test-${index}`,
    status: "published",
    index_status: "index",
    published_at: new Date(new Date(NOW).getTime() - index * spacingHours * 60 * 60 * 1000).toISOString()
  }));
}

function memoryStorage({ existing = [], recent = [] } = {}) {
  const saved = [];
  return {
    saved,
    async fetchExistingLandings() {
      return existing;
    },
    async fetchRecentPublishedLandings() {
      return recent;
    },
    async saveLanding(record) {
      const savedRecord = { id: saved.length + 1, ...record };
      saved.push(savedRecord);
      return savedRecord;
    },
    async updateOpportunity() {
      return null;
    }
  };
}

async function run(options = {}) {
  return runSeoAutogeneration({
    now: NOW,
    storage: options.storage || memoryStorage(),
    opportunities: options.opportunities || [opportunity()],
    sourceDataProvider: options.sourceDataProvider || ((item) => sourceData(item.city)),
    config: {
      enabled: true,
      dryRun: false,
      maxPerRun: 1,
      maxPerDay: 3,
      maxPerWeek: 10,
      minScore: 80,
      ...(options.config || {})
    },
    requestSource: options.requestSource || "admin"
  });
}

async function withEnv(patch, callback) {
  const previous = new Map();
  for (const key of Object.keys(patch)) {
    previous.set(key, process.env[key]);
    if (patch[key] === undefined) delete process.env[key];
    else process.env[key] = patch[key];
  }
  try {
    return await callback();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function createJsonResponse() {
  const chunks = [];
  const res = {
    statusCode: 0,
    headers: {},
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(chunk) {
      if (chunk) chunks.push(String(chunk));
    }
  };
  return {
    res,
    payload() {
      return JSON.parse(chunks.join("") || "{}");
    }
  };
}

async function callSeoAutogenerationResource({ headers = {}, env = {} } = {}) {
  return withEnv(
    {
      ADMIN_IMPORT_TOKEN: "admin-test-token",
      CRON_SECRET: "cron-test-token",
      SEO_AUTOGENERATION_ENABLED: "false",
      SEO_AUTOGENERATION_DRY_RUN: "true",
      SUPABASE_URL: undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined,
      ...env
    },
    async () => {
      const { res, payload } = createJsonResponse();
      const req = {
        method: "POST",
        url: "/api/admin?resource=seo-autogenerate/run",
        headers: { host: "inmoradar.app", ...headers },
        body: {}
      };
      await adminHandler(req, res);
      return { statusCode: res.statusCode, payload: payload() };
    }
  );
}

test("seo autogeneration kill switch impide generar y publicar", async () => {
  const storage = memoryStorage();
  const result = await run({
    storage,
    config: { enabled: false, dryRun: false }
  });

  assert.equal(result.enabled, false);
  assert.equal(result.published_count, 0);
  assert.equal(storage.saved.length, 0);
  assert.equal(result.results[0].reason, "autogeneration_disabled");
});

test("seo autogeneration dry_run no guarda ni publica", async () => {
  const storage = memoryStorage();
  const result = await run({
    storage,
    config: { dryRun: true }
  });

  assert.equal(result.dry_run, true);
  assert.equal(result.published_count, 0);
  assert.equal(result.would_publish_count, 1);
  assert.equal(storage.saved.length, 0);
  assert.equal(result.results[0].status, "would_publish");
});

test("seo autogeneration publica una pagina elegible con score suficiente", async () => {
  const storage = memoryStorage();
  const result = await run({ storage });

  assert.equal(result.published_count, 1);
  assert.equal(storage.saved.length, 1);
  assert.equal(storage.saved[0].status, "published");
  assert.equal(storage.saved[0].index_status, "index");
  assert.equal(storage.saved[0].source_data_json.quality_gate.can_index, true);
  assert.equal(result.results[0].quality_gate_passed, true);
  assert.equal(result.results[0].target_path, "/precio-metro-cuadrado/sevilla/");
  assert.ok(result.results[0].final_score >= 80);
});

test("seo autogeneration respeta maximo 1 publicacion por ejecucion", async () => {
  const storage = memoryStorage();
  const result = await run({
    storage,
    opportunities: [opportunity("Sevilla", "price_city", 95), opportunity("Granada", "expensive_listing_city", 94)]
  });

  assert.equal(result.published_count, 1);
  assert.equal(storage.saved.length, 1);
  assert.equal(result.results.some((item) => item.reason === "run_limit_reached"), true);
});

test("seo autogeneration respeta maximo 3 publicaciones por dia", async () => {
  const storage = memoryStorage({ recent: recentPublished(3) });
  const result = await run({ storage });

  assert.equal(result.published_count, 0);
  assert.equal(storage.saved.length, 0);
  assert.equal(result.results[0].reason, "daily_limit_reached");
});

test("seo autogeneration respeta maximo 10 publicaciones por semana", async () => {
  const storage = memoryStorage({ recent: recentPublished(10, 18) });
  const result = await run({ storage, config: { maxPerDay: 3 } });

  assert.equal(result.published_count, 0);
  assert.equal(storage.saved.length, 0);
  assert.equal(result.results[0].reason, "weekly_limit_reached");
});

test("seo autogeneration no duplica target_path ni ciudad y tipo", async () => {
  const storage = memoryStorage({
    existing: [
      {
        slug: "precio-metro-cuadrado/sevilla",
        title: "Precio antiguo",
        h1: "Precio antiguo",
        meta_title: "Precio antiguo",
        meta_description: "Meta antigua",
        city: "Sevilla",
        template_type: "price_city",
        body_html: "<main>Antigua landing</main>"
      }
    ]
  });
  const result = await run({ storage });

  assert.equal(result.published_count, 0);
  assert.equal(storage.saved.length, 0);
  assert.equal(result.results[0].reason, "target_path_exists");
});

test("seo autogeneration no genera sin datos suficientes", async () => {
  const storage = memoryStorage();
  const result = await run({
    storage,
    sourceDataProvider: () => noData()
  });

  assert.equal(result.published_count, 0);
  assert.equal(storage.saved.length, 0);
  assert.equal(result.results[0].reason, "insufficient_source_data");
});

test("seo autogeneration no genera barrios en fase 1", async () => {
  const storage = memoryStorage();
  const result = await run({
    storage,
    opportunities: [opportunity("Triana", "neighbourhood_city", 99)]
  });

  assert.equal(result.published_count, 0);
  assert.equal(storage.saved.length, 0);
  assert.equal(result.results[0].reason, "unsupported_template_type");
});

test("seo autogeneration exige title, h1 y meta description unicos", async () => {
  const generated = buildPriceCityLanding(opportunity(), sourceData("Sevilla"));
  const duplicateTitle = await run({
    storage: memoryStorage({
      existing: [
        {
          slug: "otra/landing",
          title: "Precio del metro cuadrado en Sevilla",
          h1: "Otro h1",
          meta_title: "Otro meta title",
          meta_description: "Otra meta description",
          city: "Otra",
          template_type: "rent_city",
          body_html: "<main>Contenido distinto</main>"
        }
      ]
    })
  });
  const duplicateH1 = await run({
    storage: memoryStorage({
      existing: [
        {
          slug: "otra/h1",
          title: "Otro title",
          h1: "Precio del metro cuadrado en Sevilla",
          meta_title: "Otro meta title",
          meta_description: "Otra meta description",
          city: "Otra",
          template_type: "rent_city",
          body_html: "<main>Contenido distinto</main>"
        }
      ]
    })
  });
  const duplicateMeta = await run({
    storage: memoryStorage({
      existing: [
        {
          slug: "otra/meta",
          title: "Otro title",
          h1: "Otro h1",
          meta_title: "Otro meta title",
          meta_description: generated.meta_description,
          city: "Otra",
          template_type: "rent_city",
          body_html: "<main>Contenido distinto</main>"
        }
      ]
    })
  });

  assert.equal(duplicateTitle.results[0].reason, "duplicate_title");
  assert.equal(duplicateH1.results[0].reason, "duplicate_h1");
  assert.equal(duplicateMeta.results[0].reason, "duplicate_meta_description");
});

test("seo autogeneration registra skipped con reason para score insuficiente", async () => {
  const storage = memoryStorage();
  const result = await run({
    storage,
    config: { minScore: 100 }
  });

  assert.equal(result.published_count, 0);
  assert.equal(storage.saved.length, 1);
  assert.equal(result.results[0].status, "draft");
  assert.equal(result.results[0].reason, "score_below_publish_threshold_drafted");
});

test("seo autogeneration endpoint protegido rechaza llamadas sin token", async () => {
  const result = await callSeoAutogenerationResource();

  assert.equal(result.statusCode, 401);
  assert.equal(result.payload.error, "unauthorized");
});

test("seo autogeneration acepta x-cron-secret correcto", async () => {
  const result = await callSeoAutogenerationResource({
    headers: { "X-Cron-Secret": "cron-test-token" }
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.request_source, "cron");
  assert.equal(result.payload.reason, "autogeneration_disabled");
});

test("seo autogeneration rechaza x-cron-secret incorrecto", async () => {
  const result = await callSeoAutogenerationResource({
    headers: { "x-cron-secret": "wrong-token" }
  });

  assert.equal(result.statusCode, 401);
  assert.equal(result.payload.error, "unauthorized");
});

test("seo autogeneration falla seguro si no hay secret configurado", async () => {
  const result = await callSeoAutogenerationResource({
    headers: { "x-cron-secret": "cron-test-token" },
    env: { ADMIN_IMPORT_TOKEN: undefined, CRON_SECRET: undefined }
  });

  assert.equal(result.statusCode, 500);
  assert.equal(result.payload.error, "admin_or_cron_token_not_configured");
});

test("seo autogeneration acepta x-admin-token y fallback admin en x-cron-secret", async () => {
  const adminHeader = await callSeoAutogenerationResource({
    headers: { "x-admin-token": "admin-test-token" }
  });
  const adminFallback = await callSeoAutogenerationResource({
    headers: { "x-cron-secret": "admin-test-token" },
    env: { CRON_SECRET: undefined }
  });

  assert.equal(adminHeader.statusCode, 200);
  assert.equal(adminHeader.payload.request_source, "admin");
  assert.equal(adminFallback.statusCode, 200);
  assert.equal(adminFallback.payload.request_source, "admin");
});

test("seo autogeneration workflow llama al resource real de api/admin", () => {
  const workflow = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "seo-cron.yml"), "utf8");

  assert.match(workflow, /\$SITE_URL\/api\/admin\?resource=seo-autogenerate\/run/);
  assert.doesNotMatch(workflow, /\$SITE_URL\/api\/admin\/seo-autogenerate\/run/);
});

test("seo autogeneration usa la misma logica para cron y manual", async () => {
  const admin = await run({ requestSource: "admin", storage: memoryStorage() });
  const cron = await run({ requestSource: "cron", storage: memoryStorage() });

  assert.equal(admin.published_count, 1);
  assert.equal(cron.published_count, 1);
  assert.equal(admin.results[0].target_path, cron.results[0].target_path);
});

test("seo autogeneration mantiene limites seguros aunque env pida mas", () => {
  const config = buildSeoAutogenerationConfig({
    SEO_AUTOGENERATION_ENABLED: "true",
    SEO_AUTOGENERATION_DRY_RUN: "false",
    SEO_AUTOGENERATION_MAX_PER_RUN: "25",
    SEO_AUTOGENERATION_MAX_PER_DAY: "30",
    SEO_AUTOGENERATION_MAX_PER_WEEK: "100",
    SEO_AUTOGENERATION_MIN_SCORE: "10"
  });

  assert.equal(config.enabled, true);
  assert.equal(config.dry_run, false);
  assert.equal(config.max_per_run, 1);
  assert.equal(config.max_per_day, 3);
  assert.equal(config.max_per_week, 40);
  assert.equal(config.min_score, 80);
});

test("seo autogeneration alerts avisan si el ultimo run falla", () => {
  const alerts = buildSeoAutogenerationOperationalAlerts(
    {
      config: { enabled: true, dry_run: false },
      limits: { published_last_24h: 0, max_per_day: 3, published_last_7d: 0, max_per_week: 10, published_this_run: 0, max_per_run: 1 },
      last_run: {
        status: "failed",
        error_message: "boom",
        started_at: NOW
      },
      recent_runs: []
    },
    { now: NOW }
  );

  assert.equal(alerts.some((alert) => alert.id === "seo-autogeneration-failing" && alert.severity === "critical"), true);
});

test("seo autogeneration alerts avisan si los limites estan saturados", () => {
  const alerts = buildSeoAutogenerationOperationalAlerts(
    {
      config: { enabled: true, dry_run: false },
      limits: { published_last_24h: 4, max_per_day: 3, published_last_7d: 10, max_per_week: 10, published_this_run: 1, max_per_run: 1 },
      last_run: {
        status: "completed",
        started_at: NOW,
        result_json: { skipped_count: 1 }
      },
      recent_runs: []
    },
    { now: NOW }
  );

  assert.equal(alerts.some((alert) => alert.id === "seo-autogeneration-over-limit" && alert.severity === "warning"), true);
  assert.equal(alerts.some((alert) => alert.id === "seo-autogeneration-healthy"), false);
});

test("seo autogeneration alerts avisan si dry-run esta activo", () => {
  const alerts = buildSeoAutogenerationOperationalAlerts(
    {
      config: { enabled: true, dry_run: true },
      limits: { published_last_24h: 0, max_per_day: 3, published_last_7d: 0, max_per_week: 10, published_this_run: 0, max_per_run: 1 },
      last_run: {
        status: "completed",
        started_at: NOW,
        result_json: { skipped_count: 1 }
      },
      recent_runs: []
    },
    { now: NOW }
  );

  assert.equal(alerts.some((alert) => alert.id === "seo-autogeneration-dry-run" && alert.severity === "warning"), true);
});

test("seo autogeneration alerts confirman estado saludable sin warnings", () => {
  const alerts = buildSeoAutogenerationOperationalAlerts(
    {
      config: { enabled: true, dry_run: false },
      limits: { published_last_24h: 1, max_per_day: 3, published_last_7d: 2, max_per_week: 10, published_this_run: 1, max_per_run: 1 },
      last_run: {
        status: "completed",
        started_at: NOW,
        result_json: { published_count: 1 }
      },
      recent_runs: []
    },
    { now: NOW }
  );

  assert.deepEqual(alerts.map((alert) => alert.id), ["seo-autogeneration-healthy"]);
});
