const assert = require("node:assert/strict");
const test = require("node:test");

const extensionVersionHandler = require("../api/extension-version");
const {
  browserFromUserAgent,
  extensionUsageEventFromInput,
  firstListingAnalysisEventFrom,
  normalizePageDomain,
  sanitizeMetadata,
  summarizeExtensionUsage
} = require("../lib/extension-usage/metrics");

function createJsonResponse() {
  const chunks = [];
  return {
    res: {
      statusCode: 0,
      headers: {},
      setHeader(name, value) {
        this.headers[name.toLowerCase()] = value;
      },
      end(chunk) {
        if (chunk) chunks.push(String(chunk));
      }
    },
    payload() {
      return chunks.length ? JSON.parse(chunks.join("")) : null;
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
  assert.notEqual(event.anonymous_id_hash, "user-123");
});

test("extension usage acepta payload v2, dominio y metadata segura", () => {
  const event = extensionUsageEventFromInput(
    {
      event_name: "listing_detected",
      anonymous_user_id: "anon-v2",
      session_id: "session-v2",
      occurred_at: "2026-05-24T08:30:00.000Z",
      page_domain: "https://www.idealista.com/inmueble/123456789/",
      browser: "chrome",
      extension_version: "2.0.0",
      source: "extension",
      metadata: {
        portal: "Idealista",
        operation_type: "sale",
        has_price: true,
        has_surface: true,
        url: "https://www.idealista.com/inmueble/123456789/",
        title: "Piso en Calle Falsa 123",
        phone: "+34 600 000 000",
        advertiser_name: "Agencia Demo"
      }
    },
    {},
    { hashSalt: "test" }
  );

  assert.equal(event.event_name, "listing_detected");
  assert.equal(event.page_domain, "idealista.com");
  assert.equal(event.occurred_at, "2026-05-24T08:30:00.000Z");
  assert.equal(event.browser_name, "chrome");
  assert.equal(event.extension_version, "2.0.0");
  assert.equal(event.metadata.portal, "Idealista");
  assert.equal(event.metadata.operation_type, "sale");
  assert.equal(event.metadata.has_price, true);
  assert.equal(event.metadata.has_surface, true);
  assert.equal("url" in event.metadata, false);
  assert.equal("title" in event.metadata, false);
  assert.equal("phone" in event.metadata, false);
  assert.equal("advertiser_name" in event.metadata, false);
  assert.equal(JSON.stringify(event).includes("123456789"), false);
  assert.equal(JSON.stringify(event).includes("Calle Falsa"), false);
  assert.equal(JSON.stringify(event).includes("600"), false);
});

test("extension usage permite attribution metadata no sensible", () => {
  const event = extensionUsageEventFromInput(
    {
      event_name: "first_listing_analysis",
      anonymous_user_id: "anon-attribution",
      page_domain: "idealista.com",
      metadata: {
        attribution_id: "attr_safe_123",
        install_source: "hero_install",
        landing_path: "https://www.inmoradar.app/analizar-anuncio-inmobiliario/?email=sergio@example.com",
        utm_source: "google",
        utm_medium: "cpc",
        utm_campaign: "chrome_extension",
        store: "chrome_web_store",
        full_url: "https://www.idealista.com/inmueble/123456789/",
        description: "Piso en Calle Falsa con telefono 600 000 000"
      }
    },
    {},
    { hashSalt: "test" }
  );

  assert.equal(event.metadata.attribution_id, "attr_safe_123");
  assert.equal(event.metadata.install_source, "hero_install");
  assert.equal(event.metadata.landing_path, "/analizar-anuncio-inmobiliario/");
  assert.equal(event.metadata.utm_source, "google");
  assert.equal(event.metadata.utm_campaign, "chrome_extension");
  assert.equal(event.metadata.store, "chrome_web_store");
  assert.equal("full_url" in event.metadata, false);
  assert.equal("description" in event.metadata, false);
  assert.equal(JSON.stringify(event.metadata).includes("https://"), false);
  assert.equal(JSON.stringify(event.metadata).includes("123456789"), false);
  assert.equal(JSON.stringify(event.metadata).includes("600"), false);
});

test("extension usage sanea metadata sensible y normaliza dominios", () => {
  const metadata = sanitizeMetadata({
    portal: "Fotocasa",
    reason: "Fallo en https://www.fotocasa.es/vivienda/123456789 con email hola@example.com",
    description: "Texto largo del anuncio",
    price: "295000"
  });

  assert.equal(metadata.portal, "Fotocasa");
  assert.equal(metadata.reason.includes("https://"), false);
  assert.equal(metadata.reason.includes("hola@example.com"), false);
  assert.equal(metadata.reason.includes("123456789"), false);
  assert.equal("description" in metadata, false);
  assert.equal("price" in metadata, false);
  assert.equal(normalizePageDomain("https://www.habitaclia.com/comprar/foo/bar?x=1"), "habitaclia.com");
  assert.equal(normalizePageDomain("www.pisos.com/alquiler/piso-madrid"), "pisos.com");
});

test("extension usage crea evento derivado first_listing_analysis", () => {
  const completed = extensionUsageEventFromInput(
    {
      event_name: "analysis_completed",
      anonymous_user_id: "anon-first",
      session_id: "session-first",
      page_domain: "fotocasa.es",
      metadata: {
        portal: "Fotocasa",
        operation_type: "rent",
        has_market_reference: true,
        has_parking_assessment: false
      }
    },
    {},
    { hashSalt: "test" }
  );
  const first = firstListingAnalysisEventFrom(completed);

  assert.equal(first.event_name, "first_listing_analysis");
  assert.equal(first.anonymous_id_hash, completed.anonymous_id_hash);
  assert.equal(first.page_domain, "fotocasa.es");
  assert.equal(first.metadata.portal, "Fotocasa");
  assert.equal(first.metadata.derived_from, "analysis_completed");
});

test("extension usage parses common browser user agents", () => {
  assert.equal(browserFromUserAgent("Mozilla/5.0 Edg/125.0.0.1").browser_name, "edge");
  assert.equal(browserFromUserAgent("Mozilla/5.0 Firefox/126.0").browser_name, "firefox");
  assert.equal(browserFromUserAgent("Version/17.4 Safari/605.1.15").browser_name, "safari");
});

test("extension usage summary counts users, sessions and breakdowns", () => {
  const now = new Date("2026-05-20T10:00:00Z");
  const rows = [
    {
      event_name: "extension_opened",
      anonymous_id_hash: "u1",
      session_id_hash: "s1",
      page_domain: "idealista.com",
      browser_name: "chrome",
      country: "ES",
      extension_version: "1.0.10",
      active_seconds: 60,
      created_at: "2026-05-20T09:55:00Z"
    },
    {
      event_name: "listing_detected",
      anonymous_id_hash: "u1",
      session_id_hash: "s1",
      page_domain: "idealista.com",
      browser_name: "chrome",
      country: "ES",
      extension_version: "1.0.10",
      active_seconds: 0,
      occurred_at: "2026-05-20T09:56:00Z",
      created_at: "2026-05-20T09:56:01Z"
    },
    {
      event_name: "analysis_started",
      anonymous_id_hash: "u1",
      session_id_hash: "s1",
      page_domain: "idealista.com",
      browser_name: "chrome",
      country: "ES",
      extension_version: "1.0.10",
      active_seconds: 0,
      occurred_at: "2026-05-20T09:56:30Z",
      created_at: "2026-05-20T09:56:31Z"
    },
    {
      event_name: "analysis_completed",
      anonymous_id_hash: "u1",
      session_id_hash: "s1",
      page_domain: "idealista.com",
      browser_name: "chrome",
      country: "ES",
      extension_version: "1.0.10",
      active_seconds: 120,
      created_at: "2026-05-20T09:57:00Z"
    },
    {
      event_name: "extension_opened",
      anonymous_id_hash: "u2",
      session_id_hash: "s2",
      page_domain: "unknown",
      browser_name: "firefox",
      country: "FR",
      extension_version: "1.0.9",
      active_seconds: 30,
      created_at: "2026-05-12T09:57:00Z"
    }
  ];

  const summary = summarizeExtensionUsage(rows, now);
  assert.equal(summary.unique_users_30d, 2);
  assert.equal(summary.active_users_24h, 1);
  assert.equal(summary.active_users_7d, 1);
  assert.equal(summary.sessions_30d, 2);
  assert.equal(summary.active_seconds_30d, 210);
  assert.equal(summary.extension_opened, 2);
  assert.equal(summary.listing_detected, 1);
  assert.equal(summary.analysis_started, 1);
  assert.equal(summary.analysis_completed, 1);
  assert.equal(summary.first_listing_analysis, 1);
  assert.equal(summary.users_with_extension_opened, 2);
  assert.equal(summary.users_with_first_listing_analysis, 1);
  assert.equal(summary.listing_detected_to_analysis_completed_rate, 100);
  assert.equal(summary.extension_opened_to_first_listing_analysis_rate, 50);
  assert.deepEqual(summary.by_browser[0], { label: "chrome", count: 4 });
  assert.deepEqual(summary.by_country[0], { label: "ES", count: 4 });
  assert.deepEqual(summary.by_page_domain[0], { label: "idealista.com", count: 4 });
});

test("extension usage summary soporta eventos legacy sin dominio ni evento derivado", () => {
  const summary = summarizeExtensionUsage(
    [
      {
        event_name: "analysis_completed",
        anonymous_id_hash: "legacy-user",
        session_id_hash: "legacy-session",
        browser_name: "chrome",
        country: "ES",
        extension_version: "1.0.10",
        active_seconds: 20,
        created_at: "2026-05-20T09:57:00Z"
      }
    ],
    new Date("2026-05-20T10:00:00Z")
  );

  assert.equal(summary.analysis_completed, 1);
  assert.equal(summary.first_listing_analysis, 1);
  assert.deepEqual(summary.by_page_domain[0], { label: "unknown", count: 1 });
});

test("extension usage endpoint persiste payload v2 y first_listing_analysis derivado", async () => {
  const previousFetch = global.fetch;
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const calls = [];
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("select=id")) {
      return {
        ok: true,
        status: 200,
        text: async () => "[]"
      };
    }
    return {
      ok: true,
      status: 201,
      text: async () => "{}"
    };
  };

  try {
    const { res, payload } = createJsonResponse();
    await extensionVersionHandler(
      {
        method: "POST",
        query: { resource: "usage" },
        headers: { "user-agent": "Mozilla/5.0 Chrome/124.0.0.0 Safari/537.36" },
        body: {
          event_name: "analysis_completed",
          anonymous_user_id: "anon-real",
          session_id: "session-real",
          page_domain: "https://www.idealista.com/inmueble/987654321/",
          extension_version: "2.0.0",
          metadata: {
            portal: "Idealista",
            operation_type: "sale",
            title: "Piso secreto",
            url: "https://www.idealista.com/inmueble/987654321/"
          }
        }
      },
      res
    );

    assert.equal(res.statusCode, 200);
    assert.equal(payload().derived_event, "first_listing_analysis");
    const inserts = calls.filter((call) => call.options.method === "POST");
    assert.equal(inserts.length, 2);
    const persisted = JSON.parse(inserts[0].options.body);
    const derived = JSON.parse(inserts[1].options.body);
    assert.equal(persisted.event_name, "analysis_completed");
    assert.equal(persisted.page_domain, "idealista.com");
    assert.equal(persisted.anonymous_id_hash.length, 48);
    assert.equal("anonymous_user_id" in persisted, false);
    assert.equal(persisted.metadata.portal, "Idealista");
    assert.equal("title" in persisted.metadata, false);
    assert.equal(JSON.stringify(persisted).includes("987654321"), false);
    assert.equal(derived.event_name, "first_listing_analysis");
    assert.equal(derived.anonymous_id_hash, persisted.anonymous_id_hash);
    assert.equal(derived.metadata.derived_from, "analysis_completed");
  } finally {
    global.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});
