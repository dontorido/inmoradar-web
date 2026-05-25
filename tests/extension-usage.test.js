const assert = require("node:assert/strict");
const test = require("node:test");

const adminHandler = require("../api/admin");
const extensionVersionHandler = require("../api/extension-version");
const {
  browserFromUserAgent,
  extensionUsageEventFromInput,
  summarizeExtensionUsage
} = require("../lib/extension-usage/metrics");

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

test("extension usage normalizes browser, country and hashes identifiers", () => {
  const event = extensionUsageEventFromInput(
    {
      event_name: "analysis completed",
      anonymous_install_id: "install-123",
      session_id: "session-456",
      extension_version: "1.0.10",
      platform: "Windows",
      duration_seconds: 120,
      active_seconds: 95
    },
    {
      "user-agent": "Mozilla/5.0 Chrome/124.0.0.0 Safari/537.36",
      "x-vercel-ip-country": "es"
    },
    { hashSalt: "test" }
  );

  assert.equal(event.event_name, "analysis_completed");
  assert.equal(event.browser_name, "chrome");
  assert.equal(event.country, "ES");
  assert.equal(event.extension_version, "1.0.10");
  assert.equal(event.duration_seconds, 120);
  assert.equal(event.active_seconds, 95);
  assert.equal(event.anonymous_id_hash.length, 48);
  assert.notEqual(event.anonymous_id_hash, "install-123");
});

test("extension usage parses common browser user agents", () => {
  assert.equal(browserFromUserAgent("Mozilla/5.0 Edg/125.0.0.1").browser_name, "edge");
  assert.equal(browserFromUserAgent("Mozilla/5.0 Firefox/126.0").browser_name, "firefox");
  assert.equal(browserFromUserAgent("Version/17.4 Safari/605.1.15").browser_name, "safari");
});

test("extension usage summary counts real users, sessions, activation and breakdowns", () => {
  const now = new Date("2026-05-20T10:00:00Z");
  const rows = [
    {
      event_name: "heartbeat",
      anonymous_id_hash: "u1",
      session_id_hash: "s1",
      browser_name: "chrome",
      country: "ES",
      extension_version: "1.0.10",
      active_seconds: 60,
      created_at: "2026-05-20T09:55:00Z"
    },
    {
      event_name: "analysis_completed",
      anonymous_id_hash: "u1",
      session_id_hash: "s1",
      browser_name: "chrome",
      country: "ES",
      extension_version: "1.0.10",
      active_seconds: 120,
      created_at: "2026-05-20T09:57:00Z"
    },
    {
      event_name: "heartbeat",
      anonymous_id_hash: "u2",
      session_id_hash: "s2",
      browser_name: "firefox",
      country: "FR",
      extension_version: "1.0.9",
      active_seconds: 30,
      created_at: "2026-05-12T09:57:00Z"
    }
  ];

  const summary = summarizeExtensionUsage(rows, now, {
    rangeEnd: now.toISOString(),
    rangeFromDate: "2026-05-01",
    rangeToDate: "2026-05-20",
    knownUsersBeforeRange: ["u2"]
  });
  assert.equal(summary.kpis.unique_users, 2);
  assert.equal(summary.kpis.new_users, 1);
  assert.equal(summary.kpis.active_users_24h, 1);
  assert.equal(summary.kpis.active_users_7d, 1);
  assert.equal(summary.kpis.sessions, 2);
  assert.equal(summary.kpis.events, 3);
  assert.equal(summary.kpis.completed_analyses, 1);
  assert.equal(summary.kpis.total_usage_seconds_estimated, 210);
  assert.equal(summary.kpis.avg_session_seconds, 105);
  assert.equal(summary.kpis.activation_rate, 50);
  assert.deepEqual(summary.by_browser[0], { label: "chrome", count: 2 });
  assert.deepEqual(summary.by_country[0], { label: "ES", count: 2 });
  assert.equal(summary.timeseries.find((row) => row.date === "2026-05-20").completed_analyses, 1);
});

test("extension usage duration uses explicit session_end duration", () => {
  const rows = [
    {
      event_name: "session_started",
      anonymous_id_hash: "u1",
      session_id_hash: "s1",
      created_at: "2026-05-20T10:00:00Z"
    },
    {
      event_name: "session_ended",
      anonymous_id_hash: "u1",
      session_id_hash: "s1",
      duration_seconds: 900,
      created_at: "2026-05-20T10:15:00Z"
    }
  ];

  const summary = summarizeExtensionUsage(rows, new Date("2026-05-20T10:20:00Z"));
  assert.equal(summary.kpis.sessions, 1);
  assert.equal(summary.kpis.avg_session_seconds, 900);
  assert.equal(summary.kpis.usage_data_quality, "measured");
});

test("extension usage duration estimates sessions from events and caps long gaps", () => {
  const rows = [
    {
      event_name: "extension_opened",
      anonymous_id_hash: "u1",
      session_id_hash: "s1",
      created_at: "2026-05-20T10:00:00Z"
    },
    {
      event_name: "analysis_completed",
      anonymous_id_hash: "u1",
      session_id_hash: "s1",
      created_at: "2026-05-20T10:45:00Z"
    }
  ];

  const summary = summarizeExtensionUsage(rows, new Date("2026-05-20T11:00:00Z"));
  assert.equal(summary.kpis.sessions, 1);
  assert.equal(summary.kpis.avg_session_seconds, 600);
  assert.equal(summary.kpis.usage_data_quality, "estimated");
});

test("extension usage reports insufficient duration when a session has only isolated events", () => {
  const rows = [
    {
      event_name: "extension_opened",
      anonymous_id_hash: "u1",
      session_id_hash: "s1",
      created_at: "2026-05-20T10:00:00Z"
    }
  ];

  const summary = summarizeExtensionUsage(rows, new Date("2026-05-20T11:00:00Z"));
  assert.equal(summary.kpis.sessions, 1);
  assert.equal(summary.kpis.avg_session_seconds, 0);
  assert.equal(summary.kpis.usage_data_quality, "insufficient");
  assert.equal(summary.kpis.usage_has_insufficient_data, true);
});

test("extension usage endpoint accepts resource from URL query", async () => {
  const previousFetch = global.fetch;
  await withEnv(
    {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
      EXTENSION_USAGE_HASH_SECRET: "hash-test",
      UPSTASH_REDIS_REST_URL: undefined,
      UPSTASH_REDIS_REST_TOKEN: undefined
    },
    async () => {
      global.fetch = async () => ({
        ok: true,
        status: 201,
        text: async () => ""
      });

      try {
        const { res, payload } = createJsonResponse();
        const req = {
          method: "POST",
          url: "/api/extension-version?resource=usage",
          headers: { host: "inmoradar.app", "user-agent": "Mozilla/5.0 Chrome/124.0" },
          body: JSON.stringify({
            event_name: "heartbeat",
            anonymous_install_id: "install-1",
            session_id: "session-1",
            extension_version: "1.0.10"
          })
        };
        await extensionVersionHandler(req, res);
        assert.equal(res.statusCode, 200);
        assert.equal(payload().accepted, true);
      } finally {
        global.fetch = previousFetch;
      }
    }
  );
});

test("extension usage endpoint rejects oversized JSON before storage", async () => {
  const previousFetch = global.fetch;
  await withEnv(
    {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
      UPSTASH_REDIS_REST_URL: undefined,
      UPSTASH_REDIS_REST_TOKEN: undefined
    },
    async () => {
      let called = false;
      global.fetch = async () => {
        called = true;
        return { ok: true, status: 201, text: async () => "" };
      };

      try {
        const { res, payload } = createJsonResponse();
        const req = {
          method: "POST",
          url: "/api/extension-version?resource=usage",
          headers: { host: "inmoradar.app" },
          body: JSON.stringify({ metadata: "x".repeat(17 * 1024) })
        };
        await extensionVersionHandler(req, res);
        const body = payload();
        assert.equal(res.statusCode, 400);
        assert.equal(body.reason, "payload_too_large");
        assert.equal(called, false);
      } finally {
        global.fetch = previousFetch;
      }
    }
  );
});

test("admin extension usage aplica from/to al filtro de Supabase", async () => {
  const previousFetch = global.fetch;
  const requestedUrls = [];

  await withEnv(
    {
      ADMIN_IMPORT_TOKEN: "admin-test-token",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test"
    },
    async () => {
      global.fetch = async (url) => {
        requestedUrls.push(String(url));
        return {
          ok: true,
          status: 200,
          text: async () => "[]"
        };
      };

      try {
        const { res, payload } = createJsonResponse();
        const req = {
          method: "GET",
          url: "/api/admin?resource=extension/usage&from=2026-05-01&to=2026-05-10&timezone=Europe/Madrid",
          headers: { authorization: "Bearer admin-test-token", host: "inmoradar.app" }
        };
        await adminHandler(req, res);
        const body = payload();
        assert.equal(res.statusCode, 200);
        assert.equal(body.window_mode, "date_range");
        assert.equal(body.range.from, "2026-05-01");
        assert.equal(body.range.to, "2026-05-10");
      } finally {
        global.fetch = previousFetch;
      }
    }
  );

  const filters = new URL(requestedUrls[0]).searchParams.getAll("created_at");
  assert.deepEqual(filters, ["gte.2026-04-30T22:00:00.000Z", "lte.2026-05-10T21:59:59.999Z"]);
});
