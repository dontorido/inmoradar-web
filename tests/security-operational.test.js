const assert = require("node:assert/strict");
const test = require("node:test");

const adminHandler = require("../api/admin");
const extensionVersionHandler = require("../api/extension-version");
const marketPriceHandler = require("../api/market-price");
const { requestMetricEvent } = require("../lib/observability/request-metrics");
const { checkDurableRateLimit } = require("../lib/security/durable-rate-limit");
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
      EXTENSION_USAGE_HASH_SECRET: "hash-test",
      UPSTASH_REDIS_REST_URL: undefined,
      UPSTASH_REDIS_REST_TOKEN: undefined
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

test("durable rate limit falls back to memory when Upstash is not configured", async () => {
  resetRateLimitStore();
  const req = {
    method: "POST",
    headers: {
      "x-forwarded-for": "203.0.113.44",
      "user-agent": "InmoRadar Extension"
    }
  };

  await withEnv({ UPSTASH_REDIS_REST_URL: undefined, UPSTASH_REDIS_REST_TOKEN: undefined }, async () => {
    const first = await checkDurableRateLimit(req, {
      scope: "durable_test_missing_env",
      maxRequests: 1,
      windowMs: 60000,
      logErrors: false
    });
    const second = await checkDurableRateLimit(req, {
      scope: "durable_test_missing_env",
      maxRequests: 1,
      windowMs: 60000,
      logErrors: false
    });

    assert.equal(first.allowed, true);
    assert.equal(first.durable, false);
    assert.equal(second.allowed, false);
    assert.equal(second.durable, false);
  });

  resetRateLimitStore();
});

test("durable rate limit uses Upstash REST with hashed keys when configured", async () => {
  const calls = [];
  const req = {
    method: "POST",
    headers: {
      "x-forwarded-for": "203.0.113.45",
      "user-agent": "InmoRadar Extension 1.0.10",
      host: "inmoradar.app"
    }
  };

  await withEnv(
    {
      UPSTASH_REDIS_REST_URL: "https://upstash.example",
      UPSTASH_REDIS_REST_TOKEN: "upstash-token-test",
      RATE_LIMIT_HASH_SALT: "rate-limit-salt-test"
    },
    async () => {
      const result = await checkDurableRateLimit(req, {
        scope: "extension_usage",
        maxRequests: 5,
        windowMs: 60000,
        fetch: async (url, options) => {
          calls.push({ url, options });
          return {
            ok: true,
            status: 200,
            json: async () => [{ result: 1 }, { result: 1 }, { result: 60 }]
          };
        },
        logErrors: false
      });

      assert.equal(result.allowed, true);
      assert.equal(result.durable, true);
      assert.equal(result.limit, 5);
      assert.equal(result.remaining, 4);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, "https://upstash.example/pipeline");

      const commands = JSON.parse(calls[0].options.body);
      assert.deepEqual(commands.map((command) => command[0]), ["INCR", "EXPIRE", "TTL"]);
      const key = commands[0][1];
      assert.match(key, /^rl:v1:/);
      assert.doesNotMatch(key, /203\.0\.113\.45|upstash-token-test|rate-limit-salt-test|InmoRadar/i);
    }
  );
});

test("durable rate limit falls back safely when Upstash fails", async () => {
  resetRateLimitStore();
  const warnings = [];
  const req = {
    method: "POST",
    headers: {
      "x-forwarded-for": "203.0.113.46",
      "user-agent": "InmoRadar Extension"
    }
  };

  await withEnv(
    {
      UPSTASH_REDIS_REST_URL: "https://upstash.example/sensitive",
      UPSTASH_REDIS_REST_TOKEN: "upstash-token-secret-value"
    },
    async () => {
      const result = await checkDurableRateLimit(req, {
        scope: "extension_usage_fallback",
        maxRequests: 1,
        windowMs: 60000,
        fetch: async () => ({
          ok: false,
          status: 500,
          json: async () => [{ error: "token=upstash-token-secret-value" }]
        }),
        logger: {
          warn: (...args) => warnings.push(JSON.stringify(args))
        }
      });

      assert.equal(result.allowed, true);
      assert.equal(result.durable, false);
      assert.equal(warnings.length, 1);
      assert.doesNotMatch(warnings.join("\n"), /upstash-token-secret-value|upstash\.example\/sensitive/);
      assert.match(warnings.join("\n"), /upstash_rate_limit_http_500/);
    }
  );

  resetRateLimitStore();
});

test("extension usage can block from durable Upstash limit without calling Supabase", async () => {
  const previousFetch = global.fetch;
  const fetchCalls = [];

  await withEnv(
    {
      EXTENSION_USAGE_RATE_LIMIT_MAX: "1",
      EXTENSION_USAGE_RATE_LIMIT_WINDOW_MS: "60000",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
      EXTENSION_USAGE_HASH_SECRET: "hash-test",
      UPSTASH_REDIS_REST_URL: "https://upstash.example",
      UPSTASH_REDIS_REST_TOKEN: "upstash-token-test"
    },
    async () => {
      global.fetch = async (url, options) => {
        fetchCalls.push({ url, options });
        if (String(url).includes("/pipeline")) {
          return {
            ok: true,
            status: 200,
            json: async () => [{ result: 2 }, { result: 0 }, { result: 60 }]
          };
        }
        throw new Error("supabase_should_not_be_called");
      };

      try {
        const req = {
          method: "POST",
          url: "/api/extension-version?resource=usage",
          headers: {
            host: "inmoradar.app",
            "x-forwarded-for": "203.0.113.47",
            "user-agent": "Mozilla/5.0 Chrome/124.0"
          },
          body: JSON.stringify({
            event_name: "heartbeat",
            anonymous_install_id: "install-1",
            session_id: "session-1",
            extension_version: "1.0.10"
          })
        };

        const response = createJsonResponse();
        await extensionVersionHandler(req, response.res);

        assert.equal(response.res.statusCode, 429);
        assert.equal(response.payload().error, "rate_limited");
        assert.equal(response.res.headers["retry-after"], "60");
        assert.equal(fetchCalls.length, 1);
        assert.match(fetchCalls[0].url, /\/pipeline$/);
      } finally {
        global.fetch = previousFetch;
      }
    }
  );
});

test("analytics event rate limit falls back to memory and blocks before Supabase", async () => {
  resetRateLimitStore();
  const previousFetch = global.fetch;
  const fetchCalls = [];

  await withEnv(
    {
      ANALYTICS_EVENT_RATE_LIMIT_MAX: "1",
      ANALYTICS_EVENT_RATE_LIMIT_WINDOW_MS: "60000",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
      UPSTASH_REDIS_REST_URL: undefined,
      UPSTASH_REDIS_REST_TOKEN: undefined
    },
    async () => {
      global.fetch = async (url, options) => {
        fetchCalls.push({ url, options });
        return { ok: true, status: 201, text: async () => "" };
      };

      try {
        const baseReq = {
          method: "POST",
          url: "/api/market-price?resource=owned-analytics-event",
          headers: {
            host: "inmoradar.app",
            "x-forwarded-for": "203.0.113.60",
            "user-agent": "Mozilla/5.0 Chrome/124.0"
          },
          body: ""
        };
        const firstReq = {
          ...baseReq,
          body: JSON.stringify({
            event_name: "page_view",
            anonymous_session_id: "analytics-session-raw",
            page_path: "/datos"
          })
        };
        const secondReq = {
          ...baseReq,
          body: JSON.stringify({
            event_name: "page_view",
            anonymous_session_id: "analytics-session-raw",
            page_path: "/precio-metro-cuadrado/madrid"
          })
        };

        const first = createJsonResponse();
        await marketPriceHandler(firstReq, first.res);
        assert.equal(first.res.statusCode, 200);
        assert.equal(first.payload().tracked, true);
        assert.equal(first.res.headers["x-ratelimit-limit"], "1");
        assert.equal(first.res.headers["x-ratelimit-remaining"], "0");

        const second = createJsonResponse();
        await marketPriceHandler(secondReq, second.res);
        assert.equal(second.res.statusCode, 429);
        assert.equal(second.payload().error, "rate_limited");
        assert.equal(second.res.headers["retry-after"], "60");
        assert.equal(fetchCalls.length, 1);
      } finally {
        global.fetch = previousFetch;
        resetRateLimitStore();
      }
    }
  );
});

test("analytics event rate limit separates anonymous sessions and falls back to IP user-agent without session", async () => {
  resetRateLimitStore();
  const previousFetch = global.fetch;
  const fetchCalls = [];

  await withEnv(
    {
      ANALYTICS_EVENT_RATE_LIMIT_MAX: "1",
      ANALYTICS_EVENT_RATE_LIMIT_WINDOW_MS: "60000",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
      UPSTASH_REDIS_REST_URL: undefined,
      UPSTASH_REDIS_REST_TOKEN: undefined
    },
    async () => {
      global.fetch = async (url, options) => {
        fetchCalls.push({ url, options });
        return { ok: true, status: 201, text: async () => "" };
      };

      try {
        const baseReq = {
          method: "POST",
          url: "/api/market-price?resource=owned-analytics-event",
          headers: {
            host: "inmoradar.app",
            "x-forwarded-for": "203.0.113.62",
            "user-agent": "Mozilla/5.0 Firefox/126.0"
          },
          body: ""
        };

        const sessionA = createJsonResponse();
        await marketPriceHandler(
          {
            ...baseReq,
            body: JSON.stringify({
              event_name: "page_view",
              anonymous_session_id: "session-a",
              page_path: "/datos"
            })
          },
          sessionA.res
        );
        assert.equal(sessionA.res.statusCode, 200);

        const sessionB = createJsonResponse();
        await marketPriceHandler(
          {
            ...baseReq,
            body: JSON.stringify({
              event_name: "page_view",
              anonymous_session_id: "session-b",
              page_path: "/datos"
            })
          },
          sessionB.res
        );
        assert.equal(sessionB.res.statusCode, 200);

        const noSessionOne = createJsonResponse();
        await marketPriceHandler(
          {
            ...baseReq,
            body: JSON.stringify({
              event_name: "page_view",
              page_path: "/datos"
            })
          },
          noSessionOne.res
        );
        assert.equal(noSessionOne.res.statusCode, 200);

        const noSessionTwo = createJsonResponse();
        await marketPriceHandler(
          {
            ...baseReq,
            body: JSON.stringify({
              event_name: "page_view",
              page_path: "/otra-ruta"
            })
          },
          noSessionTwo.res
        );
        assert.equal(noSessionTwo.res.statusCode, 429);
        assert.equal(noSessionTwo.payload().error, "rate_limited");
        assert.equal(fetchCalls.length, 3);
      } finally {
        global.fetch = previousFetch;
        resetRateLimitStore();
      }
    }
  );
});

test("analytics event uses Upstash with hashed keys when configured", async () => {
  const previousFetch = global.fetch;
  const fetchCalls = [];

  await withEnv(
    {
      ANALYTICS_EVENT_RATE_LIMIT_MAX: "5",
      ANALYTICS_EVENT_RATE_LIMIT_WINDOW_MS: "60000",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
      UPSTASH_REDIS_REST_URL: "https://upstash.example",
      UPSTASH_REDIS_REST_TOKEN: "upstash-token-test",
      RATE_LIMIT_HASH_SALT: "rate-limit-salt-test"
    },
    async () => {
      global.fetch = async (url, options) => {
        fetchCalls.push({ url, options });
        if (String(url).includes("/pipeline")) {
          return {
            ok: true,
            status: 200,
            json: async () => [{ result: 1 }, { result: 1 }, { result: 60 }]
          };
        }
        return { ok: true, status: 201, text: async () => "" };
      };

      try {
        const req = {
          method: "POST",
          url: "/api/market-price?resource=owned-analytics-event",
          headers: {
            host: "inmoradar.app",
            "x-forwarded-for": "203.0.113.61",
            "user-agent": "Mozilla/5.0 Chrome/124.0"
          },
          body: JSON.stringify({
            event_name: "calculator_used",
            anonymous_session_id: "analytics-session-secret",
            page_path: "/precio-metro-cuadrado/madrid",
            metadata: { token: "metadata-token-secret", price: 240000 }
          })
        };

        const response = createJsonResponse();
        await marketPriceHandler(req, response.res);

        assert.equal(response.res.statusCode, 200);
        assert.equal(response.payload().tracked, true);
        assert.equal(response.res.headers["x-ratelimit-limit"], "5");
        assert.equal(response.res.headers["x-ratelimit-remaining"], "4");

        const pipelineCall = fetchCalls.find((call) => String(call.url).includes("/pipeline"));
        assert.ok(pipelineCall);
        const commands = JSON.parse(pipelineCall.options.body);
        const key = commands[0][1];
        assert.match(key, /^rl:v1:/);
        assert.doesNotMatch(
          key,
          /203\.0\.113\.61|analytics-session-secret|metadata-token-secret|rate-limit-salt-test|Chrome|precio-metro-cuadrado/i
        );
        assert.equal(fetchCalls.length, 2);
      } finally {
        global.fetch = previousFetch;
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
