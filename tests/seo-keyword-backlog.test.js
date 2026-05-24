const assert = require("node:assert/strict");
const test = require("node:test");

const adminHandler = require("../api/admin");
const {
  SEO_KEYWORD_BACKLOG_SEEDS,
  SEO_KEYWORD_INTENTS,
  SEO_KEYWORD_STATUSES,
  buildSeoKeywordBacklog,
  buildSeoKeywordBrief,
  dedupeBacklogItems
} = require("../lib/seo/keywordBacklog");

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

test("seo keyword backlog seeds son controlados y cubren intenciones iniciales", () => {
  assert.ok(SEO_KEYWORD_BACKLOG_SEEDS.length >= 10);
  assert.ok(SEO_KEYWORD_BACKLOG_SEEDS.length <= 15);
  const intents = new Set(SEO_KEYWORD_BACKLOG_SEEDS.map((item) => item.intent));
  for (const intent of SEO_KEYWORD_INTENTS) {
    assert.equal(intents.has(intent), true, `missing intent ${intent}`);
  }
  const statuses = new Set(SEO_KEYWORD_BACKLOG_SEEDS.map((item) => item.status));
  for (const status of statuses) {
    assert.equal(SEO_KEYWORD_STATUSES.includes(status), true);
  }
});

test("seo keyword backlog deduplica keywords y landings sugeridas", () => {
  const duplicate = {
    ...SEO_KEYWORD_BACKLOG_SEEDS[0],
    id: "duplicate",
    keyword: SEO_KEYWORD_BACKLOG_SEEDS[0].keyword.toUpperCase()
  };
  const deduped = dedupeBacklogItems([SEO_KEYWORD_BACKLOG_SEEDS[0], duplicate]);
  assert.equal(deduped.length, 1);
});

test("seo keyword brief incluye requisitos de quality gate y no genera pagina", () => {
  const item = SEO_KEYWORD_BACKLOG_SEEDS.find((seed) => seed.intent === "analizar_anuncio_inmobiliario");
  const brief = buildSeoKeywordBrief(item);

  assert.equal(brief.keyword, item.keyword);
  assert.equal(brief.recommended_page_type, item.page_type);
  assert.ok(brief.suggested_h1);
  assert.ok(brief.suggested_meta_title.includes("InmoRadar"));
  assert.ok(brief.quality_gate_requirements.includes("quality_score >= 80"));
  assert.match(brief.prudence_block, /No es una tasacion/i);
  assert.match(brief.portal_independence_block, /herramienta independiente/i);
  assert.equal(brief.next_step.includes("no publica ni indexa"), true);
});

test("seo keyword backlog endpoint usa seeds sin Supabase y no publica", async () => {
  await withEnv(
    {
      ADMIN_IMPORT_TOKEN: "admin-test-token",
      SUPABASE_URL: undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined
    },
    async () => {
      const { res, payload } = createJsonResponse();
      const req = {
        method: "GET",
        url: "/api/admin?resource=seo/keyword-backlog&limit=15&include_briefs=true",
        headers: { authorization: "Bearer admin-test-token", host: "inmoradar.app" }
      };

      await adminHandler(req, res);
      const body = payload();

      assert.equal(res.statusCode, 200);
      assert.equal(body.ok, true);
      assert.equal(body.source, "seed");
      assert.ok(body.count <= 15);
      assert.ok(body.keywords[0].brief);
      assert.equal(body.summary.total, body.count);
    }
  );
});

test("seo keyword backlog endpoint genera brief sin crear landing ni publicar", async () => {
  await withEnv(
    {
      ADMIN_IMPORT_TOKEN: "admin-test-token",
      SUPABASE_URL: undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined
    },
    async () => {
      const { res, payload } = createJsonResponse();
      const req = {
        method: "POST",
        url: "/api/admin?resource=seo/keyword-backlog",
        headers: { authorization: "Bearer admin-test-token", host: "inmoradar.app" },
        body: { action: "generate_brief", id: "seo_kw_003" }
      };

      await adminHandler(req, res);
      const body = payload();

      assert.equal(res.statusCode, 200);
      assert.equal(body.ok, true);
      assert.equal(body.generated_landing, false);
      assert.equal(body.published, false);
      assert.equal(body.brief.keyword_id, "seo_kw_003");
      assert.ok(body.brief.required_sources.length);
    }
  );
});

test("seo keyword backlog filtra por estado e incluye resumen", () => {
  const backlog = buildSeoKeywordBacklog(SEO_KEYWORD_BACKLOG_SEEDS, {
    status: "brief_ready",
    include_briefs: true
  });

  assert.equal(backlog.keywords.every((item) => item.status === "brief_ready"), true);
  assert.equal(backlog.summary.total, backlog.keywords.length);
  assert.ok(backlog.summary.brief_ready > 0);
});
