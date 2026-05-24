const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const statusHandler = require("../api/status");
const { _internal: status } = statusHandler;

function response({ ok = true, statusCode = 200, body = "", payload = null } = {}) {
  return {
    ok,
    status: statusCode,
    text: async () => body,
    json: async () => payload || JSON.parse(body || "{}")
  };
}

function req(method = "GET") {
  return {
    method,
    url: "/api/status",
    headers: { host: "www.inmoradar.app", "x-forwarded-proto": "https" }
  };
}

function mockRes() {
  const chunks = [];
  return {
    statusCode: 0,
    headers: {},
    chunks,
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
    end(chunk) {
      if (chunk) chunks.push(String(chunk));
    },
    json() {
      return JSON.parse(chunks.join(""));
    }
  };
}

function preserveEnv(keys, fn) {
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const key of keys) {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
      }
    });
}

test("status payload publica servicios sin exponer errores internos", async () => {
  await preserveEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"], async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const payload = await status.buildStatusPayload(req(), {
      fetchImpl: async (url) => {
        if (String(url).endsWith("/sitemap.xml")) return response({ body: "<urlset></urlset>" });
        if (String(url).endsWith("/api/extension-version")) {
          return response({ payload: { latestVersion: "1.0.10" } });
        }
        return response({ body: "<html>InmoRadar</html>" });
      },
      supabaseFetchImpl: async () => {
        throw new Error("Supabase 500: private_table private_key_hidden");
      }
    });

    assert.equal(payload.ok, true);
    assert.equal(payload.status, "operational");
    assert.equal(payload.services.length, 5);
    assert.equal(payload.services.find((service) => service.id === "internal_data").status, "unknown");
    assert.doesNotMatch(JSON.stringify(payload), /private_table|private_key|Supabase 500/);
  });
});

test("status unknown no degrada fuera de produccion si no es critico", async () => {
  await preserveEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "VERCEL_ENV", "NODE_ENV"], async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.VERCEL_ENV = "preview";
    process.env.NODE_ENV = "test";

    const payload = await status.buildStatusPayload(req(), {
      fetchImpl: async (url) => {
        if (String(url).endsWith("/sitemap.xml")) return response({ body: "<urlset></urlset>" });
        if (String(url).endsWith("/api/extension-version")) return response({ payload: { latestVersion: "1.0.10" } });
        return response({ body: "<html>InmoRadar</html>" });
      }
    });

    assert.equal(payload.services.find((service) => service.id === "internal_data").status, "unknown");
    assert.equal(payload.status, "operational");
  });
});

test("status unknown degrada en produccion si el servicio lo marca expresamente", async () => {
  await preserveEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "VERCEL_ENV"], async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.VERCEL_ENV = "production";

    const payload = await status.buildStatusPayload(req(), {
      env: process.env,
      fetchImpl: async (url) => {
        if (String(url).endsWith("/sitemap.xml")) return response({ body: "<urlset></urlset>" });
        if (String(url).endsWith("/api/extension-version")) return response({ payload: { latestVersion: "1.0.10" } });
        return response({ body: "<html>InmoRadar</html>" });
      }
    });

    const internalData = payload.services.find((service) => service.id === "internal_data");
    assert.equal(internalData.status, "unknown");
    assert.equal(internalData.critical, false);
    assert.equal(internalData.degrade_when_unknown, true);
    assert.equal(payload.status, "degraded");
  });
});

test("status unknown critico degrada el estado global", () => {
  assert.equal(
    status.globalStatusFor([
      status.serviceResult({
        id: "critical_probe",
        name: "Critical probe",
        status: "unknown",
        message: "No verificado.",
        checkedAt: "2026-05-24T00:00:00.000Z",
        critical: true
      })
    ]),
    "degraded"
  );
});

test("status global queda operational cuando todos los servicios responden", async () => {
  await preserveEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"], async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";

    const payload = await status.buildStatusPayload(req(), {
      fetchImpl: async (url) => {
        if (String(url).endsWith("/sitemap.xml")) return response({ body: "<urlset></urlset>" });
        if (String(url).endsWith("/api/extension-version")) {
          return response({ payload: { latestVersion: "1.0.10" } });
        }
        return response({ body: "<html>InmoRadar</html>" });
      },
      supabaseFetchImpl: async () => [{ id: "ok" }]
    });

    assert.equal(payload.status, "operational");
    assert.equal(payload.services.every((service) => service.status === "operational"), true);
  });
});

test("status global baja a down si cae un servicio critico", async () => {
  const payload = await status.buildStatusPayload(req(), {
    fetchImpl: async (url) => {
      if (String(url).endsWith("/")) throw new Error("network_timeout");
      if (String(url).endsWith("/sitemap.xml")) return response({ body: "<urlset></urlset>" });
      if (String(url).endsWith("/api/extension-version")) return response({ payload: { latestVersion: "1.0.10" } });
      return response();
    }
  });

  assert.equal(payload.status, "down");
  assert.equal(payload.services.find((service) => service.id === "public_web").status, "down");
});

test("status endpoint responde JSON incluso para metodos no permitidos", async () => {
  const res = mockRes();
  await statusHandler(req("POST"), res);

  assert.equal(res.statusCode, 405);
  assert.equal(res.headers["content-type"], "application/json; charset=utf-8");
  assert.equal(res.headers["cache-control"], "no-store, max-age=0");
  assert.equal(res.json().error, "method_not_allowed");
});

test("status endpoint GET responde sin cachear estados obsoletos", async () => {
  await preserveEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"], async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const previousFetch = global.fetch;
    global.fetch = async (url) => {
      if (String(url).endsWith("/sitemap.xml")) return response({ body: "<urlset></urlset>" });
      if (String(url).endsWith("/api/extension-version")) return response({ payload: { latestVersion: "1.0.10" } });
      return response({ body: "<html>InmoRadar</html>" });
    };

    const res = mockRes();
    try {
      await statusHandler(req("GET"), res);
    } finally {
      global.fetch = previousFetch;
    }

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["content-type"], "application/json; charset=utf-8");
    assert.equal(res.headers["cache-control"], "no-store, max-age=0");
    assert.equal(res.json().status, "operational");
  });
});

test("status page queda rutada en Vercel, redirects y servidor local", () => {
  const root = path.join(__dirname, "..");
  const vercel = fs.readFileSync(path.join(root, "vercel.json"), "utf8");
  const redirects = fs.readFileSync(path.join(root, "_redirects"), "utf8");
  const localServer = fs.readFileSync(path.join(root, "scripts", "serve-static.js"), "utf8");

  assert.match(vercel, /"source": "\/status"/);
  assert.match(vercel, /"source": "\/status\/"/);
  assert.match(vercel, /"destination": "\/status\.html"/);
  assert.match(vercel, /"source": "\/api\/status"/);
  assert.match(vercel, /"destination": "\/api\/health\?resource=status"/);
  assert.match(redirects, /\/status \/status\.html 200/);
  assert.match(redirects, /\/status\/ \/status\.html 200/);
  assert.match(localServer, /"\/api\/status": "\/api\/health\?resource=status"/);
  assert.match(localServer, /"\/api\/status\/": "\/api\/health\?resource=status"/);
  assert.match(localServer, /"\/status": "\/status\.html"/);
  assert.match(localServer, /"\/status\/": "\/status\.html"/);
});

test("status endpoint no suma una serverless function nueva en Vercel", () => {
  const root = path.join(__dirname, "..");
  const vercelIgnore = fs.readFileSync(path.join(root, ".vercelignore"), "utf8");
  const statusEntry = fs.readFileSync(path.join(root, "api", "status.js"), "utf8");
  const apiRoot = path.join(root, "api");
  const ignored = new Set(vercelIgnore.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  const functionFiles = [];

  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith("_")) continue;
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.name.endsWith(".js")) continue;
      const relative = path.relative(root, fullPath).replace(/\\/g, "/");
      if (!ignored.has(relative)) functionFiles.push(relative);
    }
  }

  walk(apiRoot);

  assert.match(statusEntry, /require\("\.\/_status"\)/);
  assert.match(vercelIgnore, /^api\/status\.js$/m);
  assert.equal(functionFiles.includes("api/status.js"), false);
  assert.equal(functionFiles.length <= 12, true);
});

test("backoffice muestra fallback si /api/status falla", () => {
  const root = path.join(__dirname, "..");
  const adminHtml = fs.readFileSync(path.join(root, "admin.html"), "utf8");
  const adminJs = fs.readFileSync(path.join(root, "assets", "admin.js"), "utf8");

  assert.match(adminHtml, /data-admin-status-link/);
  assert.match(adminHtml, /href="\/status\/"/);
  assert.match(adminHtml, /data-service-status-list/);
  assert.match(adminJs, /fetch\("\/api\/status"/);
  assert.match(adminJs, /renderServiceStatusHeader/);
  assert.match(adminJs, /No se pudo leer \/api\/status/);
});

test("backoffice SEO muestra quality gate y motivos sin inspeccionar JSON", () => {
  const root = path.join(__dirname, "..");
  const adminHtml = fs.readFileSync(path.join(root, "admin.html"), "utf8");
  const adminJs = fs.readFileSync(path.join(root, "assets", "admin.js"), "utf8");

  assert.match(adminHtml, /<th>Quality gate<\/th>/);
  assert.match(adminJs, /renderSeoGate/);
  assert.match(adminJs, /quality_gate_status/);
  assert.match(adminJs, /failed_checks/);
  assert.match(adminJs, /needs_quality_gate_recalc/);
  assert.match(adminJs, /Sitemap: legacy/);
  assert.match(adminJs, /data-seo-action="recalculate_quality_gate"/);
  assert.match(adminJs, /runSeoGateRecalculation/);
});

test("backoffice SEO muestra backlog de keywords y briefs sin publicar", () => {
  const root = path.join(__dirname, "..");
  const adminHtml = fs.readFileSync(path.join(root, "admin.html"), "utf8");
  const adminJs = fs.readFileSync(path.join(root, "assets", "admin.js"), "utf8");

  assert.match(adminHtml, /SEO Keyword Backlog/);
  assert.match(adminHtml, /data-seo-keyword-create-form/);
  assert.match(adminHtml, /data-seo-keyword-rows/);
  assert.match(adminHtml, /data-seo-keyword-brief-preview/);
  assert.match(adminJs, /loadSeoKeywordBacklog/);
  assert.match(adminJs, /renderSeoKeywordBrief/);
  assert.match(adminJs, /create_opportunity/);
  assert.match(adminJs, /save_brief/);
  assert.match(adminJs, /change_status/);
  assert.match(adminJs, /create_draft_from_approved_brief/);
  assert.match(adminJs, /data-seo-keyword-create-draft/);
  assert.match(adminJs, /resource=seo\/keyword-backlog/);
});

test("backoffice SEO permite revisar drafts sin publicar ni indexar", () => {
  const root = path.join(__dirname, "..");
  const adminHtml = fs.readFileSync(path.join(root, "admin.html"), "utf8");
  const adminJs = fs.readFileSync(path.join(root, "assets", "admin.js"), "utf8");

  assert.match(adminHtml, /data-seo-draft-editor/);
  assert.match(adminHtml, /Guardar y recalcular gate/);
  assert.match(adminHtml, /Aprobar para publicaci/);
  assert.match(adminJs, /update_draft/);
  assert.match(adminJs, /approve_draft_for_publish/);
  assert.match(adminJs, /data-seo-edit-draft/);
  assert.match(adminJs, /data-seo-approve-draft/);
  assert.match(adminJs, /no publica, no indexa y no toca sitemap/);
});

test("backoffice SEO publica manualmente solo drafts ready con confirmacion", () => {
  const root = path.join(__dirname, "..");
  const adminJs = fs.readFileSync(path.join(root, "assets", "admin.js"), "utf8");

  assert.match(adminJs, /publish_ready_draft/);
  assert.match(adminJs, /data-seo-publish-ready-draft/);
  assert.match(adminJs, /publishReadySeoDraft/);
  assert.match(adminJs, /confirm: true/);
  assert.match(adminJs, /podra hacerla indexable si supera el quality gate/);
  assert.doesNotMatch(adminJs, /data-seo-action="publish"/);
});

test("backoffice SEO expone autopublicacion ready con dry-run y confirmacion", () => {
  const root = path.join(__dirname, "..");
  const adminHtml = fs.readFileSync(path.join(root, "admin.html"), "utf8");
  const adminJs = fs.readFileSync(path.join(root, "assets", "admin.js"), "utf8");

  assert.match(adminHtml, /data-seo-ready-auto-dry-run/);
  assert.match(adminHtml, /data-seo-ready-auto-publish/);
  assert.match(adminJs, /auto_publish_ready_drafts/);
  assert.match(adminJs, /autoPublishReadySeoDrafts/);
  assert.match(adminJs, /dry_run: dryRun/);
  assert.match(adminJs, /confirmation: dryRun \? "dry_run" : "auto_publish_ready_drafts"/);
});

test("backoffice SEO expone ciclo autonomo con confirmacion y log", () => {
  const root = path.join(__dirname, "..");
  const adminHtml = fs.readFileSync(path.join(root, "admin.html"), "utf8");
  const adminJs = fs.readFileSync(path.join(root, "assets", "admin.js"), "utf8");
  const adminApi = fs.readFileSync(path.join(root, "api", "admin.js"), "utf8");

  assert.doesNotMatch(adminHtml, /data-seo-autonomous-dry-run/);
  assert.match(adminHtml, /data-seo-autonomous-run/);
  assert.match(adminHtml, /data-seo-autonomous-runs/);
  assert.match(adminHtml, /data-seo-autonomous-summary/);
  assert.match(adminJs, /runSeoAutonomousCycle/);
  assert.match(adminJs, /renderSeoAutonomousPipeline/);
  assert.match(adminJs, /resource=seo\/automation/);
  assert.match(adminJs, /run_autonomous_cycle/);
  assert.match(adminJs, /confirmation: dryRun \? "dry_run" : "run_autonomous_cycle"/);
  assert.doesNotMatch(adminJs, /seoAutonomousDryRun/);
  assert.match(adminApi, /SEO_AUTONOMOUS_PIPELINE_ENABLED/);
  assert.match(adminApi, /SEO_AUTONOMOUS_PIPELINE_AUTO_APPROVE_MIN_SCORE = 90/);
  assert.match(adminApi, /seo_autonomous_pipeline_runs/);
});

test("status UI usa nombres legibles y no muestra campos tecnicos", () => {
  const root = path.join(__dirname, "..");
  const publicHtml = fs.readFileSync(path.join(root, "status.html"), "utf8");
  const adminJs = fs.readFileSync(path.join(root, "assets", "admin.js"), "utf8");

  assert.match(publicHtml, /serviceNames/);
  assert.match(publicHtml, /serviceDisplayName/);
  assert.match(adminJs, /serviceDisplayName/);
  assert.doesNotMatch(publicHtml, /critical/);
  assert.doesNotMatch(publicHtml, /degrade_when_unknown/);
});
