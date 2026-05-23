const assert = require("node:assert/strict");
const test = require("node:test");

const {
  REQUIRED_EXTENSION_USAGE_EVENTS,
  browserFromUserAgent,
  extensionUsageEventFromInput,
  normalizePageDomain,
  summarizeExtensionUsage
} = require("../lib/extension-usage/metrics");
const extensionVersionHandler = require("../api/extension-version");

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
      anonymous_id: "user-123",
      session_id: "session-456",
      extension_version: "1.0.10",
      page_url: "https://www.idealista.com/inmueble/123456/?utm_source=test",
      timestamp: "2026-05-20T09:58:00Z",
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
  assert.equal(event.page_domain, "idealista.com");
  assert.equal(event.occurred_at, "2026-05-20T09:58:00.000Z");
  assert.equal(event.duration_seconds, 120);
  assert.equal(event.active_seconds, 95);
  assert.equal(event.anonymous_id_hash.length, 48);
  assert.notEqual(event.anonymous_id_hash, "user-123");
});

test("extension usage parses common browser user agents", () => {
  assert.equal(browserFromUserAgent("Mozilla/5.0 Edg/125.0.0.1").browser_name, "edge");
  assert.equal(browserFromUserAgent("Mozilla/5.0 Firefox/126.0").browser_name, "firefox");
  assert.equal(browserFromUserAgent("Version/17.4 Safari/605.1.15").browser_name, "safari");
});

test("extension usage keeps only listing domain, not full URLs", () => {
  assert.equal(normalizePageDomain("https://www.fotocasa.es/es/comprar/vivienda/madrid/123?contact=1"), "fotocasa.es");
  assert.equal(normalizePageDomain("pisos.com"), "pisos.com");
});

test("extension usage summary counts users, sessions and breakdowns", () => {
  const now = new Date("2026-05-20T10:00:00Z");
  const rows = [
    {
      event_name: "heartbeat",
      anonymous_id_hash: "u1",
      session_id_hash: "s1",
      browser_name: "chrome",
      country: "ES",
      extension_version: "1.0.10",
      page_domain: "idealista.com",
      occurred_at: "2026-05-20T09:55:00Z",
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
      page_domain: "idealista.com",
      occurred_at: "2026-05-20T09:57:00Z",
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

  const summary = summarizeExtensionUsage(rows, now);
  assert.equal(summary.unique_users_30d, 2);
  assert.equal(summary.total_events_24h, 2);
  assert.equal(summary.active_users_24h, 1);
  assert.equal(summary.active_users_7d, 1);
  assert.equal(summary.sessions_30d, 2);
  assert.equal(summary.active_seconds_30d, 210);
  assert.equal(summary.last_event.event_name, "analysis_completed");
  assert.deepEqual(summary.by_browser[0], { label: "chrome", count: 2 });
  assert.deepEqual(summary.by_country[0], { label: "ES", count: 2 });
  assert.ok(REQUIRED_EXTENSION_USAGE_EVENTS.includes("listing_detected"));
  assert.ok(summary.missing_expected_events.includes("extension_installed"));
});

test("extension usage endpoint works through resource query in local server style requests", async () => {
  await withEnv(
    {
      SUPABASE_URL: undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined
    },
    async () => {
      const { res, payload } = createJsonResponse();
      const req = {
        method: "POST",
        url: "/api/extension-version?resource=usage",
        headers: { host: "127.0.0.1:4173" }
      };
      await extensionVersionHandler(req, res);
      assert.equal(res.statusCode, 503);
      assert.equal(payload().error, "supabase_not_configured");
    }
  );
});
