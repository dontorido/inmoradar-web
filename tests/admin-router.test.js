const assert = require("node:assert/strict");
const test = require("node:test");

const adminHandler = require("../api/admin");
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
  return String(url).split("/rest/v1/")[1] || "";
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
  return jsonResponse([]);
}

async function callAdmin(resource, { method = "GET", query = "", env = {}, fetchImpl = supabaseMockFetch } = {}) {
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

test("admin read-only router preserves summary payload shape", async () => {
  const result = await callAdmin("summary");

  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.ok, true);
  assert.ok(result.payload.generated_at);
  assert.equal(result.payload.premium.total, 2);
  assert.equal(result.payload.seo.total_landings, 2);
  assert.equal(result.payload.parking.total_cache_rows, 1);
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

test("admin read-only router preserves method handling around Supabase gate", async () => {
  const alertsPost = await callAdmin("alerts", { method: "POST" });
  const summaryPost = await callAdmin("summary", { method: "POST" });
  const summaryPostWithoutSupabase = await callAdmin("summary", {
    method: "POST",
    env: {
      SUPABASE_URL: undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined
    }
  });

  assert.equal(alertsPost.statusCode, 405);
  assert.equal(summaryPost.statusCode, 405);
  assert.equal(summaryPostWithoutSupabase.statusCode, 500);
  assert.equal(summaryPostWithoutSupabase.payload.error, "supabase_not_configured");
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
  const result = await callAdmin("kpis/settings");

  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.schema_version, 1);
  assert.ok(Array.isArray(result.payload.schema));
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
