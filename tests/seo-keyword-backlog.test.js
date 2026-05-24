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

function supabaseJson(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload)
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

async function callAdmin(reqPatch = {}) {
  const { res, payload } = createJsonResponse();
  const req = {
    method: "GET",
    url: "/api/admin?resource=seo/keyword-backlog",
    headers: { authorization: "Bearer admin-test-token", host: "inmoradar.app" },
    ...reqPatch
  };
  await adminHandler(req, res);
  return { res, body: payload() };
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

test("seo keyword backlog endpoint lista datos persistidos desde Supabase", async () => {
  const previousFetch = global.fetch;
  await withEnv(
    {
      ADMIN_IMPORT_TOKEN: "admin-test-token",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test"
    },
    async () => {
      global.fetch = async (url) => {
        assert.match(String(url), /\/rest\/v1\/seo_keyword_backlog\?/);
        return supabaseJson([
          {
            id: 44,
            keyword: "analizar piso antes de comprar en Valencia",
            intent: "analizar_piso_antes_de_comprar",
            page_type: "editorial_guide",
            city: "Valencia",
            province: "Valencia",
            priority: 91,
            manual_difficulty: "media",
            status: "brief_ready",
            suggested_landing: "/guias/analizar-piso-valencia/",
            recommended_cta: "Analiza pisos antes de contactar",
            risk_level: "media",
            risk_notes: "",
            notes: "validar fuentes",
            created_at: "2026-05-24T10:00:00.000Z",
            updated_at: "2026-05-24T10:00:00.000Z",
            brief_json: null
          }
        ]);
      };
      try {
        const { res, body } = await callAdmin({
          url: "/api/admin?resource=seo/keyword-backlog&limit=15&include_briefs=true"
        });

        assert.equal(res.statusCode, 200);
        assert.equal(body.source, "supabase");
        assert.equal(body.keywords[0].keyword, "analizar piso antes de comprar en Valencia");
        assert.equal(body.keywords[0].brief.keyword_id, "44");
      } finally {
        global.fetch = previousFetch;
      }
    }
  );
});

test("seo keyword backlog create_opportunity valida y persiste sin publicar", async () => {
  const previousFetch = global.fetch;
  const requests = [];
  let insertBody = null;
  await withEnv(
    {
      ADMIN_IMPORT_TOKEN: "admin-test-token",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test"
    },
    async () => {
      global.fetch = async (url, options = {}) => {
        requests.push({ url: String(url), method: options.method || "GET" });
        if ((options.method || "GET") === "GET" && String(url).includes("select=id%2Ckeyword%2Csuggested_landing")) {
          return supabaseJson([]);
        }
        if (options.method === "POST" && String(url).endsWith("/rest/v1/seo_keyword_backlog")) {
          insertBody = JSON.parse(options.body);
          return supabaseJson([{ id: 45, ...insertBody }]);
        }
        throw new Error(`Unexpected fetch ${String(url)}`);
      };
      try {
        const { res, body } = await callAdmin({
          method: "POST",
          body: {
            action: "create_opportunity",
            opportunity: {
              keyword: "preguntas antes de contactar por un piso en Malaga",
              intent: "preguntas_antes_de_contactar",
              page_type: "editorial_guide",
              city: "Malaga",
              province: "Malaga",
              priority: 77,
              status: "idea",
              risk_level: "baja",
              suggested_landing: "/guias/preguntas-piso-malaga/"
            }
          }
        });

        assert.equal(res.statusCode, 201);
        assert.equal(body.persisted, true);
        assert.equal(body.generated_landing, false);
        assert.equal(body.published, false);
        assert.equal(body.touched_sitemap, false);
        assert.equal(insertBody.keyword, "preguntas antes de contactar por un piso en Malaga");
        assert.equal(insertBody.suggested_landing, "/guias/preguntas-piso-malaga/");
        assert.ok(requests.some((request) => request.method === "POST"));
      } finally {
        global.fetch = previousFetch;
      }
    }
  );
});

test("seo keyword backlog update_opportunity rechaza estados invalidos sin tocar Supabase", async () => {
  const previousFetch = global.fetch;
  await withEnv(
    {
      ADMIN_IMPORT_TOKEN: "admin-test-token",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test"
    },
    async () => {
      global.fetch = async (url) => {
        throw new Error(`Unexpected fetch ${String(url)}`);
      };
      try {
        const { res, body } = await callAdmin({
          method: "POST",
          body: { action: "update_opportunity", id: 45, patch: { status: "publish_now" } }
        });

        assert.equal(res.statusCode, 400);
        assert.equal(body.error, "invalid_seo_keyword_opportunity");
        assert.deepEqual(body.errors, ["status_invalid"]);
      } finally {
        global.fetch = previousFetch;
      }
    }
  );
});

test("seo keyword backlog create_opportunity evita duplicados por keyword y landing", async () => {
  const previousFetch = global.fetch;
  await withEnv(
    {
      ADMIN_IMPORT_TOKEN: "admin-test-token",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test"
    },
    async () => {
      global.fetch = async (url, options = {}) => {
        if (options.method === "POST") throw new Error("POST should not run for duplicates");
        assert.match(String(url), /seo_keyword_backlog/);
        return supabaseJson([{ id: 10, keyword: "Comparar pisos online", suggested_landing: "/guias/comparar-pisos-online/" }]);
      };
      try {
        const { res, body } = await callAdmin({
          method: "POST",
          body: {
            action: "create_opportunity",
            keyword: "comparar pisos online",
            intent: "comparar_pisos_online",
            page_type: "comparison_guide",
            priority: 70,
            status: "idea",
            risk_level: "media",
            suggested_landing: "/guias/comparar-pisos-online/"
          }
        });

        assert.equal(res.statusCode, 409);
        assert.equal(body.error, "seo_keyword_backlog_duplicate");
        assert.equal(body.touched_sitemap, false);
      } finally {
        global.fetch = previousFetch;
      }
    }
  );
});

test("seo keyword backlog save_brief guarda JSON sin generar landing", async () => {
  const previousFetch = global.fetch;
  let patchBody = null;
  const stored = {
    id: 45,
    keyword: "preguntas antes de contactar por un piso en Malaga",
    intent: "preguntas_antes_de_contactar",
    page_type: "editorial_guide",
    city: "Malaga",
    province: "Malaga",
    priority: 77,
    manual_difficulty: "media",
    status: "idea",
    suggested_landing: "/guias/preguntas-piso-malaga/",
    recommended_cta: "Analiza pisos antes de contactar",
    risk_level: "baja",
    risk_notes: "",
    notes: "",
    created_at: "2026-05-24T10:00:00.000Z",
    updated_at: "2026-05-24T10:00:00.000Z",
    brief_json: null
  };
  await withEnv(
    {
      ADMIN_IMPORT_TOKEN: "admin-test-token",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test"
    },
    async () => {
      global.fetch = async (url, options = {}) => {
        const requestUrl = String(url);
        if ((options.method || "GET") === "GET" && requestUrl.includes("id=eq.45")) return supabaseJson([stored]);
        if (options.method === "PATCH" && requestUrl.includes("id=eq.45")) {
          patchBody = JSON.parse(options.body);
          return supabaseJson([{ ...stored, ...patchBody }]);
        }
        throw new Error(`Unexpected fetch ${requestUrl}`);
      };
      try {
        const brief = buildSeoKeywordBrief(stored);
        const { res, body } = await callAdmin({
          method: "POST",
          body: { action: "save_brief", id: 45, brief }
        });

        assert.equal(res.statusCode, 200);
        assert.equal(body.persisted, true);
        assert.equal(body.generated_landing, false);
        assert.equal(body.published, false);
        assert.equal(body.touched_sitemap, false);
        assert.equal(patchBody.brief_json.keyword_id, "45");
        assert.equal("status" in patchBody, false);
      } finally {
        global.fetch = previousFetch;
      }
    }
  );
});

test("seo keyword backlog change_status no genera landing ni sitemap", async () => {
  const previousFetch = global.fetch;
  let patchBody = null;
  const stored = {
    id: 45,
    keyword: "analizar piso antes de comprar en Valencia",
    intent: "analizar_piso_antes_de_comprar",
    page_type: "editorial_guide",
    city: "Valencia",
    province: "Valencia",
    priority: 90,
    manual_difficulty: "media",
    status: "quality_review",
    suggested_landing: "/guias/analizar-piso-valencia/",
    recommended_cta: "Analiza pisos antes de contactar",
    risk_level: "media",
    risk_notes: "",
    notes: "",
    created_at: "2026-05-24T10:00:00.000Z",
    updated_at: "2026-05-24T10:00:00.000Z",
    brief_json: null
  };
  await withEnv(
    {
      ADMIN_IMPORT_TOKEN: "admin-test-token",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test"
    },
    async () => {
      global.fetch = async (url, options = {}) => {
        const requestUrl = String(url);
        if ((options.method || "GET") === "GET" && requestUrl.includes("id=eq.45")) return supabaseJson([stored]);
        if ((options.method || "GET") === "GET" && requestUrl.includes("select=id%2Ckeyword%2Csuggested_landing")) {
          return supabaseJson([]);
        }
        if (options.method === "PATCH" && requestUrl.includes("id=eq.45")) {
          patchBody = JSON.parse(options.body);
          return supabaseJson([{ ...stored, ...patchBody }]);
        }
        throw new Error(`Unexpected fetch ${requestUrl}`);
      };
      try {
        const { res, body } = await callAdmin({
          method: "POST",
          body: { action: "change_status", id: 45, status: "approved" }
        });

        assert.equal(res.statusCode, 200);
        assert.equal(body.keyword.status, "approved");
        assert.equal(body.generated_landing, false);
        assert.equal(body.published, false);
        assert.equal(body.indexed, false);
        assert.equal(body.touched_sitemap, false);
        assert.equal(patchBody.status, "approved");
        assert.equal("brief_json" in patchBody, false);
      } finally {
        global.fetch = previousFetch;
      }
    }
  );
});

test("seo keyword backlog escrituras fallan seguro sin Supabase configurado", async () => {
  await withEnv(
    {
      ADMIN_IMPORT_TOKEN: "admin-test-token",
      SUPABASE_URL: undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined
    },
    async () => {
      const { res, body } = await callAdmin({
        method: "POST",
        body: {
          action: "create_opportunity",
          keyword: "extension chrome inmobiliaria para comparar pisos",
          intent: "extension_chrome_inmobiliaria",
          page_type: "chrome_extension_landing",
          priority: 65,
          status: "idea",
          risk_level: "baja"
        }
      });

      assert.equal(res.statusCode, 503);
      assert.equal(body.error, "seo_keyword_backlog_storage_unavailable");
      assert.equal(body.generated_landing, false);
      assert.equal(body.published, false);
    }
  );
});
