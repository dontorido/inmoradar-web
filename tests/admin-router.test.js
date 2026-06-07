const assert = require("node:assert/strict");
const test = require("node:test");

const adminHandler = require("../api/admin");
const { createAnalyticsHandlers } = require("../api/_admin/handlers/analytics");
const { createCoreHandlers } = require("../api/_admin/handlers/core");
const { createExtensionUsageHandlers } = require("../api/_admin/handlers/extension-usage");
const { createPremiumHandlers } = require("../api/_admin/handlers/premium");
const { createSeoHandlers } = require("../api/_admin/handlers/seo");
const {
  createAdminRouter,
  dispatchAdminRoute,
  findAdminRoute,
  normalizeResource
} = require("../api/_admin/router");

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

function apiPath(url) {
  return decodeURIComponent(String(url).split("/rest/v1/")[1] || "");
}

function jsonResponse(rows) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(rows)
  };
}

const RICH_SEO_BODY = `
  <section data-city-specific="true"><p>${"Logrono precio vivienda fuente fecha anuncio ".repeat(120)}</p></section>
  <section data-city-specific="true"><p>Fuente: MIVAU. Fecha del dato: 4T 2025.</p><a href="/datos">Datos</a></section>
  <section data-city-specific="true"><p>${"Comparar superficie estado zona precio metro cuadrado ".repeat(80)}</p><a href="/metodologia">Metodologia</a></section>
`;

function supabaseMockFetch(url) {
  const path = apiPath(url);
  if (path.startsWith("premium_subscriptions?select=status")) {
    return jsonResponse([{ status: "active" }, { status: "cancelled" }]);
  }
  if (path.startsWith("premium_subscriptions?select=email,status")) {
    return jsonResponse([{ email: "client@example.com", status: "active" }]);
  }
  if (path.startsWith("saved_property_email_reports?provider=eq.cloudflare_email_service_share")) {
    return jsonResponse([{ id: "share-1" }, { id: "share-2" }, { id: "share-3" }]);
  }
  if (path.startsWith("premium_revenue_events?")) return jsonResponse([]);
  if (path.startsWith("premium_subscriptions?select=email,event_name")) return jsonResponse([]);
  if (path.startsWith("seo_landings?select=status,index_status")) {
    return jsonResponse([
      { status: "published", index_status: "index", quality_score: 91, published_at: "2026-05-24T00:00:00.000Z" },
      { status: "draft", index_status: "noindex", quality_score: 60 }
    ]);
  }
  if (path.startsWith("seo_landings?select=slug,title,meta_title,meta_description,h1,body_html")) {
    return jsonResponse([
      {
        slug: "precio-metro-cuadrado/logrono",
        title: "Logrono",
        meta_title: "Precio m2 Logrono - InmoRadar",
        meta_description: "Referencia de precio por metro cuadrado en Logrono con fuente y fecha para comparar anuncios.",
        h1: "Precio del metro cuadrado en Logrono",
        body_html: RICH_SEO_BODY,
        status: "published",
        index_status: "index",
        quality_score: 91,
        word_count: 850,
        canonical_url: "https://inmoradar.app/precio-metro-cuadrado/logrono/",
        published_at: "2026-05-24T00:00:00.000Z"
      },
      {
        slug: "precio-metro-cuadrado/draft",
        title: "Draft",
        meta_title: "Draft",
        meta_description: "Draft",
        h1: "Draft",
        body_html: "<p>Draft pendiente.</p>",
        status: "draft",
        index_status: "noindex",
        quality_score: 60,
        word_count: 200,
        canonical_url: "https://inmoradar.app/precio-metro-cuadrado/draft/"
      }
    ]);
  }
  if (path.startsWith("seo_landings?select=id,opportunity_id,slug")) {
    return jsonResponse([
      {
        id: 1,
        opportunity_id: "opp-1",
        slug: "precio-metro-cuadrado/logrono",
        title: "Precio metro cuadrado Logrono",
        meta_title: "Precio m2 Logrono",
        meta_description: "Referencia de precio por metro cuadrado en Logrono con fuente y fecha para comparar anuncios.",
        h1: "Precio del metro cuadrado en Logrono",
        body_html: RICH_SEO_BODY,
        city: "Logrono",
        province: "La Rioja",
        autonomous_community: "La Rioja",
        template_type: "price_city",
        status: "published",
        index_status: "index",
        quality_score: 91,
        word_count: 850,
        canonical_url: "https://inmoradar.app/precio-metro-cuadrado/logrono/",
        published_at: "2026-05-24T00:00:00.000Z",
        last_generated_at: "2026-05-24T00:00:00.000Z",
        created_at: "2026-05-24T00:00:00.000Z",
        updated_at: "2026-05-24T00:00:00.000Z"
      }
    ]);
  }
  if (path.startsWith("seo_landings?select=id,slug")) {
    return jsonResponse([{ id: 1, slug: "precio-metro-cuadrado/logrono", title: "Logrono", status: "published" }]);
  }
  if (path.startsWith("seo_landing_opportunities?")) return jsonResponse([{ status: "pending", template_type: "price_city" }]);
  if (path.startsWith("parking_difficulty_cache?select=score")) {
    return jsonResponse([{ score: 72, label: "medio", confidence_score: 0.8, perspective: "visitor" }]);
  }
  if (path.startsWith("parking_difficulty_cache?select=id")) {
    return jsonResponse([{ id: "cache-1", score: 72, label: "medio", confidence_score: 0.8, perspective: "visitor" }]);
  }
  if (path.startsWith("parking_assessments?")) {
    return jsonResponse([{ id: "assessment-1", overall_score: 71, overall_label: "medio", confidence_score: 0.7 }]);
  }
  if (path.startsWith("kpi_settings?")) return jsonResponse([]);
  if (path.startsWith("release_artifacts?select")) {
    return jsonResponse([
      {
        id: "artifact-1",
        target: "extension",
        version: "1.0.11",
        title: "Extension build",
        channel: "stable",
        status: "ready",
        artifact_kind: "bundle",
        connector_target: "chrome",
        file_name: "inmoradar-1.0.11.zip",
        mime_type: "application/zip",
        file_size_bytes: 1024,
        sha256: "a".repeat(64),
        storage_path: null,
        notes: "Ready",
        created_at: "2026-05-24T00:00:00.000Z",
        updated_at: "2026-05-24T00:00:00.000Z"
      }
    ]);
  }
  if (path === "release_artifacts") {
    return jsonResponse([
      {
        id: "artifact-created",
        target: "web",
        version: "1.0.0",
        title: "Web release",
        channel: "draft",
        status: "draft",
        artifact_kind: "bundle",
        connector_target: null
      }
    ]);
  }
  return jsonResponse([]);
}

async function callAdmin(resource, { method = "GET", query = "", body, env = {}, fetchImpl = supabaseMockFetch } = {}) {
  const previousFetch = global.fetch;
  return withEnv(
    {
      ADMIN_IMPORT_TOKEN: "admin-test-token",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
      CRON_SECRET: "cron-test-token",
      ...env
    },
    async () => {
      global.fetch = fetchImpl;
      try {
        const { res, payload } = createJsonResponse();
        const req = {
          method,
          url: `/api/admin?resource=${encodeURIComponent(resource)}${query ? `&${query.replace(/^&/, "")}` : ""}`,
          headers: { authorization: "Bearer admin-test-token", host: "inmoradar.app" }
        };
        if (body !== undefined) req.body = body;
        await adminHandler(req, res);
        return { statusCode: res.statusCode, payload: payload() };
      } finally {
        global.fetch = previousFetch;
      }
    }
  );
}

test("admin router finds handler by resource and method", async () => {
  const routes = createAdminRouter([
    {
      resource: "summary",
      method: "GET",
      handler: async () => ({ ok: true, source: "router" })
    }
  ]);

  const found = findAdminRoute(routes, { resource: "/summary/", method: "get" });
  const result = await dispatchAdminRoute(routes, {
    req: { method: "GET" },
    resource: "summary"
  });

  assert.equal(normalizeResource("/summary/"), "summary");
  assert.equal(found.route.resource, "summary");
  assert.equal(result.status, 200);
  assert.deepEqual(result.payload, { ok: true, source: "router" });
});

test("admin router returns null for legacy fallback routes", async () => {
  const routes = createAdminRouter([
    {
      resource: "summary",
      method: "GET",
      handler: async () => ({ ok: true })
    }
  ]);

  assert.equal(findAdminRoute(routes, { resource: "kpis/settings", method: "GET" }), null);
  assert.equal(await dispatchAdminRoute(routes, { req: { method: "GET" }, resource: "kpis/settings" }), null);
});

test("admin router preserves method_not_allowed for registered resources", async () => {
  const routes = createAdminRouter([
    {
      resource: "alerts",
      method: "GET",
      handler: async () => ({ ok: true })
    }
  ]);

  const result = await dispatchAdminRoute(routes, { req: { method: "POST" }, resource: "alerts" });
  assert.equal(result.status, 405);
  assert.deepEqual(result.payload, { ok: false, error: "method_not_allowed" });
});

test("admin router can fall back on method mismatch for mixed legacy resources", async () => {
  const routes = createAdminRouter([
    {
      resource: "seo/landings",
      method: "GET",
      fallbackOnMethodMismatch: true,
      handler: async () => ({ ok: true })
    }
  ]);

  assert.equal(findAdminRoute(routes, { resource: "seo/landings", method: "POST" }), null);
  assert.equal(await dispatchAdminRoute(routes, { req: { method: "POST" }, resource: "seo/landings" }), null);
});

test("admin router can register the kpis settings write method without wildcards", async () => {
  const routes = createAdminRouter([
    {
      resource: "kpis/settings",
      method: ["GET", "POST"],
      fallbackOnMethodMismatch: true,
      handler: async () => ({ ok: true })
    }
  ]);

  assert.equal(findAdminRoute(routes, { resource: "kpis/settings", method: "POST" }).route.resource, "kpis/settings");
  assert.equal(findAdminRoute(routes, { resource: "kpis/settings", method: "PUT" }), null);
  assert.equal(findAdminRoute(routes, { resource: "kpis/other", method: "POST" }), null);
});

test("admin router can register the operations releases write method without wildcards", async () => {
  const routes = createAdminRouter([
    {
      resource: "operations/releases",
      method: ["GET", "POST"],
      fallbackOnMethodMismatch: true,
      handler: async () => ({ ok: true })
    }
  ]);

  assert.equal(findAdminRoute(routes, { resource: "operations/releases", method: "POST" }).route.resource, "operations/releases");
  assert.equal(findAdminRoute(routes, { resource: "operations/releases", method: "PUT" }), null);
  assert.equal(findAdminRoute(routes, { resource: "operations/chrome", method: "POST" }), null);
});

test("admin analytics handler keeps injected dependencies and local fallback", async () => {
  let fetched = false;
  const { handleOwnedAnalyticsPages } = createAnalyticsHandlers({
    clampLimit: (value, fallback, max) => Math.max(1, Math.min(max, Number.parseInt(String(value || fallback), 10) || fallback)),
    hasSupabaseConfig: () => false,
    supabaseFetch: async () => {
      fetched = true;
      return [];
    }
  });

  const result = await handleOwnedAnalyticsPages(
    { method: "GET" },
    new URL("https://inmoradar.app/api/admin?resource=analytics/pages&days=7")
  );

  assert.equal(result.status, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.persisted, false);
  assert.equal(result.payload.warning, "supabase_not_configured");
  assert.deepEqual(result.payload.pages, []);
  assert.equal(fetched, false);
});

test("admin premium handler reads local subscriptions without billing side effects", async () => {
  const paths = [];
  const { handlePremiumSubscriptions } = createPremiumHandlers({
    clampLimit: (value, fallback, max) => Math.max(1, Math.min(max, Number.parseInt(String(value || fallback), 10) || fallback)),
    sanitizeSearch: (value) => String(value || "").trim().toLowerCase().replace(/[%*,()]/g, "").slice(0, 80),
    supabaseFetch: async (path) => {
      paths.push(path);
      return [{ email: "client@example.com", status: "active" }];
    }
  });

  const result = await handlePremiumSubscriptions(
    new URL("https://inmoradar.app/api/admin?resource=premium/subscriptions&status=active&q=Client&provider=lemon&event_name=subscription_created&limit=1")
  );

  assert.equal(result.status, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.count, 1);
  assert.equal(result.payload.subscriptions[0].email, "client@example.com");
  assert.equal(paths.length, 1);
  assert.match(paths[0], /^premium_subscriptions\?/);
  assert.doesNotMatch(paths[0], /checkout|portal|webhook|lemonsqueezy/i);
});

test("admin core parking handler keeps injected local reads", async () => {
  const paths = [];
  const { handleParkingSummary } = createCoreHandlers({
    average: (rows, key) => {
      const values = rows.map((row) => Number(row[key])).filter(Number.isFinite);
      return values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100 : 0;
    },
    countBy: (rows, key) =>
      rows.reduce((acc, row) => {
        const value = String(row[key] || "unknown");
        acc[value] = (acc[value] || 0) + 1;
        return acc;
      }, {}),
    safeFetch: async (path) => {
      paths.push(path);
      if (path.startsWith("parking_assessments?")) return [];
      return [{ score: 72, label: "medio", confidence_score: 0.8, perspective: "visitor", expires_at: null }];
    }
  });

  const result = await handleParkingSummary();

  assert.equal(result.status, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.total_cache_rows, 1);
  assert.equal(result.payload.valid_cache_rows, 1);
  assert.deepEqual(result.payload.by_label, { medio: 1 });
  assert.equal(paths.length, 2);
  assert.ok(paths.every((path) => /^parking_(difficulty_cache|assessments)\?/.test(path)));
});

test("admin extension usage handler keeps window filters and known users", async () => {
  const paths = [];
  const { handleExtensionUsageSummary } = createExtensionUsageHandlers({
    clampLimit: (value, fallback, max) => Math.max(1, Math.min(max, Number.parseInt(String(value || fallback), 10) || fallback)),
    supabaseFetch: async (path) => {
      paths.push(path);
      if (path.includes("created_at=lt.")) return [{ anonymous_id_hash: "known-user" }];
      return [
        {
          event_name: "analysis_completed",
          anonymous_id_hash: "known-user",
          session_id_hash: "session-1",
          browser_name: "chrome",
          browser_version: "124",
          platform: "win",
          country: "ES",
          extension_version: "1.0.0",
          duration_seconds: 20,
          active_seconds: 20,
          created_at: "2026-05-20T10:00:00.000Z"
        }
      ];
    }
  });

  const result = await handleExtensionUsageSummary(
    new URL("https://inmoradar.app/api/admin?resource=extension/usage&from=2026-05-20&to=2026-05-20&timezone=Europe/Madrid&limit=1")
  );

  assert.equal(result.status, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.window_mode, "date_range");
  assert.equal(result.payload.window_preset, "custom");
  assert.equal(result.payload.event_limit, 1);
  assert.equal(result.payload.result_limited, true);
  assert.equal(paths.length, 2);
  assert.ok(paths[0].startsWith("extension_usage_events?"));
  assert.ok(paths[1].startsWith("extension_usage_events?"));
  assert.match(paths[0], /created_at=gte\./);
  assert.match(paths[0], /created_at=lte\./);
  assert.match(paths[1], /created_at=lt\./);
});

test("admin seo landings handler keeps filters and pagination read-only", async () => {
  const paths = [];
  const { handleSeoLandings } = createSeoHandlers({
    buildSeoDailyPolicySnapshot: () => ({
      published_landings_today: 1,
      published_news_today: 0
    }),
    clampLimit: (value, fallback, max) => Math.max(1, Math.min(max, Number.parseInt(String(value || fallback), 10) || fallback)),
    clampPage: (value) => Math.max(1, Number.parseInt(String(value || 1), 10) || 1),
    landingSelect: "id,slug,status,index_status,quality_score,updated_at,body_html,source_data_json",
    safeFetch: async (path) => {
      paths.push(path);
      if (path.startsWith("seo_landing_opportunities?")) return [{ status: "pending", template_type: "price_city" }];
      return [
        {
          slug: "precio-metro-cuadrado/logrono",
          title: "Precio del metro cuadrado en Logrono",
          meta_title: "Precio m2 en Logrono - InmoRadar",
          meta_description: "Referencia de precio por metro cuadrado en Logrono con fuente y fecha para comparar anuncios.",
          h1: "Precio del metro cuadrado en Logrono",
          body_html: RICH_SEO_BODY,
          status: "published",
          index_status: "index",
          quality_score: 90,
          word_count: 850,
          canonical_url: "https://inmoradar.app/precio-metro-cuadrado/logrono/",
          template_type: "price_city"
        },
        {
          slug: "precio-metro-cuadrado/draft",
          title: "Draft",
          meta_title: "Draft",
          meta_description: "Draft",
          h1: "Draft",
          body_html: "<p>Draft pendiente.</p>",
          status: "draft",
          index_status: "noindex",
          quality_score: 60,
          word_count: 120,
          canonical_url: "https://inmoradar.app/precio-metro-cuadrado/draft/",
          template_type: "guide_city"
        }
      ];
    },
    seoDailyTargets: { landings: 2, news: 2 },
    supabaseFetch: async (path) => {
      paths.push(path);
      return [
        {
          id: 3,
          slug: "landing-3",
          status: "published",
          index_status: "index",
          title: "Precio del metro cuadrado en Logrono",
          meta_title: "Precio m2 en Logrono - InmoRadar",
          meta_description: "Referencia de precio por metro cuadrado en Logrono con fuente y fecha para comparar anuncios.",
          h1: "Precio del metro cuadrado en Logrono",
          body_html: RICH_SEO_BODY,
          quality_score: 92,
          word_count: 850,
          canonical_url: "https://inmoradar.app/landing-3/",
          source_data_json: {
            quality: {
              signals: ["datos reales disponibles"],
              penalties: [],
              warnings: [],
              technical_indexability_status: "ok",
              editorial_quality_status: "pass"
            }
          }
        },
        { id: 4, slug: "landing-4", status: "published", index_status: "index", quality_score: 88 },
        { id: 5, slug: "landing-5", status: "published", index_status: "index", quality_score: 80 }
      ];
    }
  });

  const result = await handleSeoLandings(
    new URL("https://inmoradar.app/api/admin?resource=seo/landings&limit=2&page=2&status=published")
  );

  assert.equal(result.status, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.count, 2);
  assert.equal(result.payload.page, 2);
  assert.equal(result.payload.page_size, 2);
  assert.equal(result.payload.has_next_page, true);
  assert.equal(result.payload.has_previous_page, true);
  assert.equal(result.payload.from, 3);
  assert.equal(result.payload.to, 4);
  assert.equal(result.payload.landings[0].slug, "landing-3");
  assert.deepEqual(result.payload.landings[0].quality_signals, ["datos reales disponibles"]);
  assert.equal(result.payload.landings[0].sitemap_status, "included");
  assert.equal(result.payload.landings[0].sitemap_reason, "published_index_quality_ok");
  assert.equal(result.payload.landings[0].body_html, undefined);
  assert.equal(result.payload.landings[0].source_data_json, undefined);
  assert.equal(result.payload.summary.filtered_total, 1);
  assert.equal(result.payload.summary.target_landings_per_day, 2);
  assert.equal(result.payload.summary.sitemap_included, 1);
  assert.equal(result.payload.summary.sitemap_excluded, 1);
  assert.equal(paths.length, 3);
  assert.ok(paths[0].startsWith("seo_landings?"));
  assert.match(paths[0], /limit=3/);
  assert.match(paths[0], /offset=2/);
  assert.match(paths[0], /status=eq\.published/);
  assert.ok(paths[1].startsWith("seo_landings?"));
  assert.ok(paths[2].startsWith("seo_landing_opportunities?"));
  assert.ok(paths.every((path) => /^(seo_landings|seo_landing_opportunities)\?/.test(path)));
  assert.ok(paths.every((path) => !/generate-landings|seo-autogenerate|sitemap/i.test(path)));
});

test("admin read-only router preserves summary payload shape", async () => {
  const result = await callAdmin("summary");

  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.ok, true);
  assert.ok(result.payload.generated_at);
  assert.equal(result.payload.premium.total, 2);
  assert.equal(result.payload.premium.saved_report_shares, 3);
  assert.equal(result.payload.seo.total_landings, 2);
  assert.equal(result.payload.parking.total_cache_rows, 1);
});

test("admin read-only router preserves premium subscriptions payload shape", async () => {
  const result = await callAdmin("premium/subscriptions", {
    query: "status=active&q=client&limit=1"
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.count, 1);
  assert.equal(Array.isArray(result.payload.subscriptions), true);
  assert.equal(result.payload.subscriptions[0].email, "client@example.com");
  assert.equal(result.payload.subscriptions[0].status, "active");
});

test("admin read-only router preserves premium subscriptions empty arrays", async () => {
  const result = await callAdmin("premium/subscriptions", {
    fetchImpl: async () => jsonResponse([])
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.count, 0);
  assert.deepEqual(result.payload.subscriptions, []);
});

test("admin read-only router preserves alerts payload without Supabase", async () => {
  const result = await callAdmin("alerts", {
    env: {
      SUPABASE_URL: undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined,
      CRON_SECRET: undefined
    }
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.ok, true);
  assert.ok(Array.isArray(result.payload.alerts));
  assert.equal(result.payload.alerts.some((alert) => alert.id === "supabase-config-missing"), true);
});

test("admin read-only router preserves extension usage payload shape", async () => {
  const result = await callAdmin("extension/usage");

  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.window_mode, "preset");
  assert.equal(Array.isArray(result.payload.by_browser), true);
});

test("admin read-only router preserves analytics summary payload shape without Supabase", async () => {
  const result = await callAdmin("analytics/summary", {
    env: {
      SUPABASE_URL: undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined
    }
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.persisted, false);
  assert.equal(result.payload.warning, "supabase_not_configured");
  assert.equal(result.payload.summary.total_events, 0);
  assert.equal(Array.isArray(result.payload.top_pages), true);
  assert.equal(Array.isArray(result.payload.recommendations), true);
});

test("admin read-only router preserves analytics pages payload shape without Supabase", async () => {
  const result = await callAdmin("analytics/pages", {
    query: "page_limit=25",
    env: {
      SUPABASE_URL: undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined
    }
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.persisted, false);
  assert.equal(result.payload.warning, "supabase_not_configured");
  assert.equal(result.payload.window_days, 7);
  assert.equal(Array.isArray(result.payload.pages), true);
});

test("admin read-only router preserves analytics learning payload shape without Supabase", async () => {
  const result = await callAdmin("analytics/learning", {
    env: {
      SUPABASE_URL: undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined
    }
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.persisted, false);
  assert.equal(result.payload.warning, "supabase_not_configured");
  assert.equal(result.payload.summary.total_events, 0);
  assert.equal(Array.isArray(result.payload.recommendations), true);
  assert.equal(result.payload.recommendations[0].action, "collect_more_data");
});

test("admin read-only router preserves parking summary payload shape", async () => {
  const result = await callAdmin("parking/summary");

  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.total_cache_rows, 1);
  assert.equal(result.payload.assessments_total, 1);
  assert.equal(Array.isArray(result.payload.recent), true);
});

test("admin read-only router preserves seo landings payload shape", async () => {
  const result = await callAdmin("seo/landings", {
    query: "limit=1&page=1&status=published"
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.count, 1);
  assert.equal(result.payload.page, 1);
  assert.equal(result.payload.page_size, 1);
  assert.equal(result.payload.has_previous_page, false);
  assert.equal(Array.isArray(result.payload.landings), true);
  assert.equal(result.payload.landings[0].slug, "precio-metro-cuadrado/logrono");
  assert.equal(result.payload.summary.published, 1);
  assert.equal(result.payload.summary.filtered_total, 1);
});

test("admin read-only router preserves seo landings empty arrays", async () => {
  const result = await callAdmin("seo/landings", {
    fetchImpl: async () => jsonResponse([])
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.count, 0);
  assert.equal(result.payload.from, 0);
  assert.equal(result.payload.to, 0);
  assert.deepEqual(result.payload.landings, []);
  assert.equal(result.payload.summary.total_landings, 0);
});

test("admin read-only router preserves kpi settings payload shape", async () => {
  const result = await callAdmin("kpis/settings");

  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.schema_version, 1);
  assert.ok(Array.isArray(result.payload.schema));
  assert.equal(typeof result.payload.defaults, "object");
  assert.equal(typeof result.payload.settings, "object");
  assert.equal(result.payload.updated_at, null);
  assert.equal(result.payload.table_missing, false);
  assert.equal(result.payload.error, null);
});

test("admin read-only router preserves operations releases payload shape", async () => {
  const result = await callAdmin("operations/releases", {
    query: "target=extension&limit=1"
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.target, "extension");
  assert.equal(Array.isArray(result.payload.artifacts), true);
  assert.equal(result.payload.artifacts[0].id, "artifact-1");
  assert.equal(result.payload.artifacts[0].connector_target, "chrome");
  assert.equal(typeof result.payload.connectors, "object");
  assert.equal(result.payload.table_missing, false);
  assert.equal(result.payload.error, null);
});

test("admin read-only router preserves operations releases empty arrays", async () => {
  const result = await callAdmin("operations/releases", {
    fetchImpl: async () => jsonResponse([])
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.target, "all");
  assert.deepEqual(result.payload.artifacts, []);
  assert.equal(typeof result.payload.connectors, "object");
  assert.equal(result.payload.table_missing, false);
});

test("admin read-only router preserves method handling around Supabase gate", async () => {
  const alertsPost = await callAdmin("alerts", { method: "POST" });
  const summaryPost = await callAdmin("summary", { method: "POST" });
  const premiumPost = await callAdmin("premium/subscriptions", { method: "POST" });
  const summaryPostWithoutSupabase = await callAdmin("summary", {
    method: "POST",
    env: {
      SUPABASE_URL: undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined
    }
  });

  assert.equal(alertsPost.statusCode, 405);
  assert.equal(summaryPost.statusCode, 405);
  assert.equal(premiumPost.statusCode, 405);
  assert.deepEqual(premiumPost.payload, { ok: false, error: "method_not_allowed" });
  assert.equal(summaryPostWithoutSupabase.statusCode, 500);
  assert.equal(summaryPostWithoutSupabase.payload.error, "supabase_not_configured");
});

test("admin seo landings router preserves mixed method legacy fallback", async () => {
  const postResult = await callAdmin("seo/landings", {
    method: "POST",
    body: { slug: "precio-metro-cuadrado/logrono", action: "view" }
  });
  const putResult = await callAdmin("seo/landings", { method: "PUT" });

  assert.equal(postResult.statusCode, 400);
  assert.equal(postResult.payload.error, "invalid_action");
  assert.equal(putResult.statusCode, 405);
  assert.deepEqual(putResult.payload, { ok: false, error: "method_not_allowed" });
});

test("admin seo generation resources remain legacy", async () => {
  const result = await callAdmin("seo/generate-landings", { method: "GET" });

  assert.equal(result.statusCode, 405);
  assert.deepEqual(result.payload, { ok: false, error: "method_not_allowed" });
});

test("admin kpi settings router handles POST write and preserves unsupported method fallback", async () => {
  const captured = {};
  const kpiSettingsPostFetch = async (url, options = {}) => {
    const path = apiPath(url);
    if (path.startsWith("kpi_settings?on_conflict=id")) {
      captured.path = path;
      captured.method = options.method;
      captured.headers = options.headers;
      captured.rows = JSON.parse(options.body);
      return jsonResponse([
        {
          id: "default",
          schema_version: 1,
          settings_json: captured.rows[0].settings_json,
          updated_at: "2026-05-25T10:00:00.000Z"
        }
      ]);
    }
    if (path.startsWith("kpi_settings?")) return jsonResponse([]);
    return supabaseMockFetch(url, options);
  };

  const postResult = await callAdmin("kpis/settings", {
    method: "POST",
    body: {
      settings: {
        model: { mode: "aggressive", show_confidence: false },
        property_score: { weights: { price: 55 } },
        unknown_group: { ignored: true }
      }
    },
    fetchImpl: kpiSettingsPostFetch
  });
  const putResult = await callAdmin("kpis/settings", { method: "PUT" });

  assert.equal(postResult.statusCode, 200);
  assert.equal(postResult.payload.ok, true);
  assert.equal(postResult.payload.schema_version, 1);
  assert.equal(postResult.payload.settings.model.mode, "aggressive");
  assert.equal(postResult.payload.settings.model.show_confidence, false);
  assert.equal(postResult.payload.settings.property_score.weights.price, 55);
  assert.equal(postResult.payload.settings.unknown_group, undefined);
  assert.equal(postResult.payload.updated_at, "2026-05-25T10:00:00.000Z");
  assert.equal(typeof postResult.payload.settings, "object");
  assert.equal(captured.path, "kpi_settings?on_conflict=id");
  assert.equal(captured.method, "POST");
  assert.equal(captured.headers.Prefer, "resolution=merge-duplicates,return=representation");
  assert.equal(captured.rows[0].id, "default");
  assert.equal(captured.rows[0].updated_by, "backoffice");
  assert.equal(putResult.statusCode, 405);
  assert.deepEqual(putResult.payload, { ok: false, error: "method_not_allowed" });
});

test("admin kpi settings router handles empty POST body like legacy", async () => {
  const result = await callAdmin("kpis/settings", {
    method: "POST",
    body: ""
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.schema_version, 1);
  assert.equal(typeof result.payload.settings, "object");
  assert.equal(result.payload.settings.model.mode, "balanced");
});

test("admin kpi settings router keeps malformed JSON errors sanitized", async () => {
  const previousConsoleError = console.error;
  let result;
  console.error = () => {};
  try {
    result = await callAdmin("kpis/settings", {
      method: "POST",
      body: "{\"settings\":"
    });
  } finally {
    console.error = previousConsoleError;
  }

  const payloadText = JSON.stringify(result.payload);
  assert.equal(result.statusCode, 500);
  assert.equal(result.payload.error, "admin_request_failed");
  assert.doesNotMatch(payloadText, /service-role-test|admin-test-token|cron-test-token/);
});

test("admin operations releases router handles POST write and preserves unsupported method fallback", async () => {
  const captured = { urls: [] };
  const releasePostFetch = async (url, options = {}) => {
    captured.urls.push(String(url));
    const path = apiPath(url);
    if (path === "release_artifacts") {
      captured.method = options.method;
      captured.headers = options.headers;
      captured.artifact = JSON.parse(options.body);
      return jsonResponse([
        {
          id: "artifact-created",
          ...captured.artifact,
          created_at: "2026-05-25T10:00:00.000Z"
        }
      ]);
    }
    if (path.startsWith("release_artifacts?select")) return jsonResponse([]);
    return supabaseMockFetch(url, options);
  };

  const postResult = await callAdmin("operations/releases", {
    method: "POST",
    body: {
      target: "web",
      version: "1.0.0",
      title: "Web release",
      channel: "production",
      status: "ready",
      artifact_kind: "release_notes",
      file_size_bytes: "2048",
      sha256: "b".repeat(64),
      unknown_field: "ignored"
    },
    fetchImpl: releasePostFetch
  });
  const putResult = await callAdmin("operations/releases", { method: "PUT" });

  assert.equal(postResult.statusCode, 200);
  assert.equal(postResult.payload.ok, true);
  assert.equal(postResult.payload.artifact.id, "artifact-created");
  assert.equal(postResult.payload.artifact.version, "1.0.0");
  assert.equal(postResult.payload.artifact.channel, "production");
  assert.equal(postResult.payload.artifact.status, "ready");
  assert.equal(postResult.payload.artifact.artifact_kind, "release_notes");
  assert.equal(postResult.payload.artifact.file_size_bytes, 2048);
  assert.equal(postResult.payload.artifact.sha256, "b".repeat(64));
  assert.equal(postResult.payload.artifact.unknown_field, undefined);
  assert.equal(postResult.payload.artifact.created_by, "backoffice");
  assert.equal(typeof postResult.payload.connectors, "object");
  assert.equal(captured.method, "POST");
  assert.equal(captured.headers.prefer, "return=representation");
  assert.equal(captured.artifact.target, "web");
  assert.equal(captured.urls.some((url) => /chromewebstore|googleapis/i.test(url)), false);
  assert.equal(putResult.statusCode, 405);
  assert.deepEqual(putResult.payload, { ok: false, error: "method_not_allowed" });
});

test("admin operations releases router handles empty and invalid POST body like legacy", async () => {
  const previousConsoleError = console.error;
  let emptyBodyResult;
  let missingTitleResult;
  console.error = () => {};
  try {
    emptyBodyResult = await callAdmin("operations/releases", {
      method: "POST",
      body: ""
    });
    missingTitleResult = await callAdmin("operations/releases", {
      method: "POST",
      body: { version: "1.0.0" }
    });
  } finally {
    console.error = previousConsoleError;
  }

  assert.equal(emptyBodyResult.statusCode, 500);
  assert.equal(emptyBodyResult.payload.error, "admin_request_failed");
  assert.match(JSON.stringify(emptyBodyResult.payload), /release_version_required/);
  assert.equal(missingTitleResult.statusCode, 500);
  assert.equal(missingTitleResult.payload.error, "admin_request_failed");
  assert.match(JSON.stringify(missingTitleResult.payload), /release_title_required/);
});

test("admin operations releases router keeps malformed JSON errors sanitized", async () => {
  const previousConsoleError = console.error;
  let result;
  console.error = () => {};
  try {
    result = await callAdmin("operations/releases", {
      method: "POST",
      body: "{\"version\":"
    });
  } finally {
    console.error = previousConsoleError;
  }

  const payloadText = JSON.stringify(result.payload);
  assert.equal(result.statusCode, 500);
  assert.equal(result.payload.error, "admin_request_failed");
  assert.doesNotMatch(payloadText, /service-role-test|admin-test-token|cron-test-token/);
});

test("admin operations action resources remain legacy", async () => {
  const result = await callAdmin("operations/chrome", { method: "GET" });
  const postResult = await callAdmin("operations/chrome", {
    method: "POST",
    body: { action: "status" }
  });

  assert.equal(result.statusCode, 405);
  assert.deepEqual(result.payload, { ok: false, error: "method_not_allowed" });
  assert.equal(postResult.statusCode, 400);
  assert.equal(postResult.payload.error, "chrome_webstore_not_configured");
});

test("admin analytics router preserves method handling before Supabase gate", async () => {
  const summaryPostWithoutSupabase = await callAdmin("analytics/summary", {
    method: "POST",
    env: {
      SUPABASE_URL: undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined
    }
  });

  assert.equal(summaryPostWithoutSupabase.statusCode, 405);
  assert.deepEqual(summaryPostWithoutSupabase.payload, { ok: false, error: "method_not_allowed" });
});

test("admin legacy resources still fall back after read-only router", async () => {
  const result = await callAdmin("social-video/runway-config");

  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.enabled, false);
  assert.equal(result.payload.api_secret_configured, false);
});

test("admin analytics routes not registered in router still fall back to legacy flow", async () => {
  const result = await callAdmin("analytics/events", {
    env: {
      SUPABASE_URL: undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined
    }
  });

  assert.equal(result.statusCode, 500);
  assert.equal(result.payload.error, "supabase_not_configured");
});

test("admin read-only router keeps Supabase errors sanitized", async () => {
  const result = await callAdmin("summary", {
    fetchImpl: async () => ({
      ok: false,
      status: 500,
      text: async () => "backend leaked access_token=abc123 and sb_secret_live_abcdef"
    })
  });

  const payloadText = JSON.stringify(result.payload);
  assert.equal(result.statusCode, 200);
  assert.doesNotMatch(payloadText, /abc123|sb_secret_live/);
  assert.match(payloadText, /access_token=\[redacted\]/);
  assert.match(payloadText, /\[redacted-secret\]/);
});

test("admin analytics router keeps Supabase errors sanitized", async () => {
  const result = await callAdmin("analytics/summary", {
    fetchImpl: async () => ({
      ok: false,
      status: 500,
      text: async () => "backend leaked access_token=abc123 and sb_secret_live_abcdef"
    })
  });

  const payloadText = JSON.stringify(result.payload);
  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.persisted, false);
  assert.equal(result.payload.warning, "storage_error");
  assert.doesNotMatch(payloadText, /abc123|sb_secret_live/);
});

test("admin seo landings router keeps Supabase errors sanitized", async () => {
  const previousConsoleError = console.error;
  let result;
  console.error = () => {};
  try {
    result = await callAdmin("seo/landings", {
      fetchImpl: async () => ({
        ok: false,
        status: 500,
        text: async () => "backend leaked access_token=abc123 and sb_secret_live_abcdef"
      })
    });
  } finally {
    console.error = previousConsoleError;
  }

  const payloadText = JSON.stringify(result.payload);
  assert.equal(result.statusCode, 500);
  assert.equal(result.payload.error, "admin_request_failed");
  assert.doesNotMatch(payloadText, /abc123|sb_secret_live/);
  assert.match(payloadText, /access_token=\[redacted\]/);
  assert.match(payloadText, /\[redacted-secret\]/);
});

test("admin kpi settings router keeps Supabase errors sanitized", async () => {
  const result = await callAdmin("kpis/settings", {
    fetchImpl: async () => ({
      ok: false,
      status: 500,
      text: async () => "backend leaked access_token=abc123 and sb_secret_live_abcdef"
    })
  });

  const payloadText = JSON.stringify(result.payload);
  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.table_missing, false);
  assert.doesNotMatch(payloadText, /abc123|sb_secret_live/);
  assert.match(payloadText, /access_token=\[redacted\]/);
  assert.match(payloadText, /\[redacted-secret\]/);
});

test("admin kpi settings POST keeps Supabase errors sanitized", async () => {
  const previousConsoleError = console.error;
  let result;
  console.error = () => {};
  try {
    result = await callAdmin("kpis/settings", {
      method: "POST",
      body: { settings: { model: { mode: "conservative" } } },
      fetchImpl: async (url) => {
        const path = apiPath(url);
        if (path.startsWith("kpi_settings?on_conflict=id")) {
          return {
            ok: false,
            status: 500,
            text: async () => "backend leaked access_token=abc123 and sb_secret_live_abcdef"
          };
        }
        return jsonResponse([]);
      }
    });
  } finally {
    console.error = previousConsoleError;
  }

  const payloadText = JSON.stringify(result.payload);
  assert.equal(result.statusCode, 500);
  assert.equal(result.payload.error, "admin_request_failed");
  assert.doesNotMatch(payloadText, /abc123|sb_secret_live/);
  assert.match(payloadText, /access_token=\[redacted\]/);
  assert.match(payloadText, /\[redacted-secret\]/);
});

test("admin operations releases router keeps Supabase errors sanitized", async () => {
  const result = await callAdmin("operations/releases", {
    fetchImpl: async () => ({
      ok: false,
      status: 500,
      text: async () => "backend leaked access_token=abc123 and sb_secret_live_abcdef"
    })
  });

  const payloadText = JSON.stringify(result.payload);
  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.table_missing, false);
  assert.doesNotMatch(payloadText, /abc123|sb_secret_live/);
  assert.match(payloadText, /access_token=\[redacted\]/);
  assert.match(payloadText, /\[redacted-secret\]/);
});

test("admin operations releases POST keeps Supabase errors sanitized", async () => {
  const previousConsoleError = console.error;
  let result;
  console.error = () => {};
  try {
    result = await callAdmin("operations/releases", {
      method: "POST",
      body: {
        target: "web",
        version: "1.0.0",
        title: "Web release"
      },
      fetchImpl: async (url) => {
        const path = apiPath(url);
        if (path === "release_artifacts") {
          return {
            ok: false,
            status: 500,
            text: async () => "backend leaked access_token=abc123 and sb_secret_live_abcdef"
          };
        }
        return jsonResponse([]);
      }
    });
  } finally {
    console.error = previousConsoleError;
  }

  const payloadText = JSON.stringify(result.payload);
  assert.equal(result.statusCode, 500);
  assert.equal(result.payload.error, "admin_request_failed");
  assert.doesNotMatch(payloadText, /abc123|sb_secret_live/);
  assert.match(payloadText, /access_token=\[redacted\]/);
  assert.match(payloadText, /\[redacted-secret\]/);
});

test("admin premium subscriptions router keeps Supabase errors sanitized", async () => {
  const previousConsoleError = console.error;
  let result;
  console.error = () => {};
  try {
    result = await callAdmin("premium/subscriptions", {
      fetchImpl: async () => ({
        ok: false,
        status: 500,
        text: async () => "backend leaked access_token=abc123 and sb_secret_live_abcdef"
      })
    });
  } finally {
    console.error = previousConsoleError;
  }

  const payloadText = JSON.stringify(result.payload);
  assert.equal(result.statusCode, 500);
  assert.equal(result.payload.error, "admin_request_failed");
  assert.doesNotMatch(payloadText, /abc123|sb_secret_live/);
  assert.match(payloadText, /access_token=\[redacted\]/);
  assert.match(payloadText, /\[redacted-secret\]/);
});
