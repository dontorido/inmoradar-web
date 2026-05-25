const assert = require("node:assert/strict");
const test = require("node:test");

const adminHandler = require("../api/admin");
const extensionVersionHandler = require("../api/extension-version");
const { requestMetricEvent } = require("../lib/observability/request-metrics");
const { resetRateLimitStore } = require("../lib/security/rate-limit");

function createJsonResponse() {
  const chunks = [];
  const res = {
    statusCode: 0,
    headers: {},
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
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

test("admin CORS allows configured production origins", async () => {
  await withEnv({ ADMIN_IMPORT_TOKEN: "admin-test-token" }, async () => {
    const { res } = createJsonResponse();
    await adminHandler(
      {
        method: "OPTIONS",
        url: "/api/admin?resource=summary",
        headers: {
          host: "www.inmoradar.app",
          origin: "https://www.inmoradar.app"
        }
      },
      res
    );

    assert.equal(res.statusCode, 204);
    assert.equal(res.headers["access-control-allow-origin"], "https://www.inmoradar.app");
    assert.match(res.headers["access-control-allow-headers"], /x-admin-token/);
  });
});

test("admin CORS does not grant browser access to unknown origins", async () => {
  await withEnv({ ADMIN_IMPORT_TOKEN: "admin-test-token" }, async () => {
    const { res } = createJsonResponse();
    await adminHandler(
      {
        method: "OPTIONS",
        url: "/api/admin?resource=summary",
        headers: {
          host: "www.inmoradar.app",
          origin: "https://evil.example"
        }
      },
      res
    );

    assert.equal(res.statusCode, 204);
    assert.equal(res.headers["access-control-allow-origin"], undefined);
  });
});

test("extension usage rate limit allows first request and blocks overflow", async () => {
  resetRateLimitStore();
  const previousFetch = global.fetch;

  await withEnv(
    {
      EXTENSION_USAGE_RATE_LIMIT_MAX: "1",
      EXTENSION_USAGE_RATE_LIMIT_WINDOW_MS: "60000",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
      EXTENSION_USAGE_HASH_SECRET: "hash-test"
    },
    async () => {
      global.fetch = async () => ({ ok: true, status: 201, text: async () => "" });

      try {
        const req = {
          method: "POST",
          url: "/api/extension-version?resource=usage",
          headers: {
            host: "inmoradar.app",
            "x-forwarded-for": "203.0.113.10",
            "user-agent": "Mozilla/5.0 Chrome/124.0"
          },
          body: JSON.stringify({
            event_name: "heartbeat",
            anonymous_install_id: "install-1",
            session_id: "session-1",
            extension_version: "1.0.10"
          })
        };

        const first = createJsonResponse();
        await extensionVersionHandler(req, first.res);
        assert.equal(first.res.statusCode, 200);
        assert.equal(first.payload().accepted, true);
        assert.equal(first.res.headers["x-ratelimit-limit"], "1");
        assert.equal(first.res.headers["x-ratelimit-remaining"], "0");

        const second = createJsonResponse();
        await extensionVersionHandler(req, second.res);
        assert.equal(second.res.statusCode, 429);
        assert.deepEqual(Object.keys(second.payload()).sort(), ["error", "limit", "ok", "retry_after_seconds", "window_seconds"].sort());
        assert.equal(second.payload().error, "rate_limited");
        assert.equal(second.res.headers["retry-after"], "60");
      } finally {
        global.fetch = previousFetch;
        resetRateLimitStore();
      }
    }
  );
});

test("request metrics never include tokens or authorization values", () => {
  const event = requestMetricEvent(
    {
      method: "POST",
      headers: {
        authorization: "Bearer admin-test-token",
        "x-request-id": "access_token=abc123"
      }
    },
    { statusCode: 500 },
    {
      route: "api/admin",
      resource: "meta/callback",
      action: "token_exchange",
      error: "authorization: bearer sb_secret_live_abcdef access_token=abc123",
      startedAt: Date.now() - 10
    }
  );
  const text = JSON.stringify(event);

  assert.doesNotMatch(text, /admin-test-token|sb_secret_live|abc123|Bearer\s+admin/i);
  assert.match(text, /redacted/);
  assert.equal(event.route, "api/admin");
  assert.equal(event.resource, "meta/callback");
});
