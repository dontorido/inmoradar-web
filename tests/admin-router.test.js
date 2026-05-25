const assert = require("node:assert/strict");
const test = require("node:test");

const adminHandler = require("../api/admin");
const { createAnalyticsHandlers } = require("../api/_admin/handlers/analytics");
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

function supabaseMockFetch(url) {
  const path = apiPath(url);
  if (path.startsWith("premium_subscriptions?select=status")) {
    return jsonResponse([{ status: "active" }, { status: "cancelled" }]);
  }
  if (path.startsWith("premium_subscriptions?select=email,status")) {
    return jsonResponse([{ email: "client@example.com", status: "active" }]);
  }
  if (path.startsWith("premium_revenue_events?")) return jsonResponse([]);
  if (path.startsWith("premium_subscriptions?select=email,event_name")) return jsonResponse([]);
  if (path.startsWith("seo_landings?select=status,index_status")) {
    return jsonResponse([
      { status: "published", index_status: "index", quality_score: 91, published_at: "2026-05-24T00:00:00.000Z" },
      { status: "draft", index_status: "noindex", quality_score: 60 }
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

test("admin read-only router preserves summary payload shape", async () => {
  const result = await callAdmin("summary");

  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.ok, true);
  assert.ok(result.payload.generated_at);
  assert.equal(result.payload.premium.total, 2);
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
