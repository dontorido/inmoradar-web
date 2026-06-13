const test = require("node:test");
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const {
  SEARCH_CONSOLE_URL,
  buildSeoPublicationEmailPayload
} = require("../api/_seo/publicationEmail");
const { normalizePublishedUrl } = require("../assets/copy-url");

const root = path.join(__dirname, "..");

function seoPublicationEmailEnv(overrides = {}) {
  return {
    SEO_PUBLICATION_EMAIL_ENABLED: "true",
    SEO_PUBLICATION_EMAIL_TO: "sergio.torio@gmail.com",
    SEO_PUBLICATION_EMAIL_FROM: "seo@inmoradar.app",
    PUBLIC_SITE_URL: "https://www.inmoradar.app",
    ...overrides
  };
}

function sampleEmailPayload() {
  return buildSeoPublicationEmailPayload(
    {
      job_name: "seo-publish",
      request_source: "cron",
      started_at: "2026-05-22T10:30:00.000Z",
      finished_at: "2026-05-22T10:31:00.000Z",
      published_count: 1,
      draft_count: 2,
      skipped_count: 0,
      failed_count: 0,
      dry_run: false,
      status: "completed",
      limits: { published_last_24h: 3, max_per_day: 4, remaining_day: 1 },
      published_landings_today: 2,
      published_news_today: 1,
      target_landings_per_day: 2,
      target_news_per_day: 2,
      config: { min_score: 85 },
      results: [
        {
          slug: "guias/como-comparar-dos-pisos",
          title: "Como comparar dos pisos antes de llamar",
          template_type: "editorial_guide",
          quality_score: 94,
          status: "published",
          index_status: "index"
        }
      ]
    },
    {
      env: seoPublicationEmailEnv(),
      totals: {
        total_landings: 12,
        published_landings: 7,
        indexable_landings: 6,
        drafts: 4,
        pending_review: 1
      }
    }
  );
}

function hrefForLabel(html, label) {
  const labelIndex = html.indexOf(`>${label}</a>`);
  assert.notEqual(labelIndex, -1, `Missing link label: ${label}`);
  const anchorIndex = html.lastIndexOf("<a ", labelIndex);
  assert.notEqual(anchorIndex, -1, `Missing anchor for: ${label}`);
  const match = html.slice(anchorIndex, labelIndex).match(/\bhref="([^"]+)"/);
  assert.ok(match, `Missing href for: ${label}`);
  return match[1];
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function waitForServer(child, port) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("local_server_timeout")), 5000);
    const onData = (chunk) => {
      if (String(chunk).includes(`http://127.0.0.1:${port}`)) {
        clearTimeout(timeout);
        resolve();
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      if (/EADDRINUSE|Error:/i.test(text)) {
        clearTimeout(timeout);
        reject(new Error(text));
      }
    });
    child.once("exit", (code) => {
      if (code) {
        clearTimeout(timeout);
        reject(new Error(`local_server_exited_${code}`));
      }
    });
  });
}

async function requestLocalCopyPage(route) {
  const port = await freePort();
  const child = childProcess.spawn(process.execPath, [path.join(root, "scripts", "serve-static.js"), String(port)], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer(child, port);
    const response = await fetch(`http://127.0.0.1:${port}${route}`);
    return { status: response.status, html: await response.text() };
  } finally {
    child.kill();
  }
}

test("email SEO usa botones reales para ver, copiar y abrir Search Console", () => {
  const payload = sampleEmailPayload();
  const { html, text } = payload;

  assert.match(html, />Ver URL publicada<\/a>/);
  assert.match(html, />Copiar URL<\/a>/);
  assert.match(html, />Abrir Search Console<\/a>/);
  assert.match(html, /Nueva URL SEO publicada/);
  assert.match(html, /Resumen últimas 24 horas/);
  assert.match(html, /Siguiente lanzamiento/);

  assert.equal(hrefForLabel(html, "Ver URL publicada"), "https://inmoradar.app/guias/como-comparar-dos-pisos/");

  const copyHref = hrefForLabel(html, "Copiar URL");
  assert.match(copyHref, /^https:\/\/inmoradar\.app\/copiar-url\?url=/);
  assert.match(copyHref, /url=https%3A%2F%2Finmoradar\.app%2Fguias%2Fcomo-comparar-dos-pisos%2F/);
  assert.doesNotMatch(copyHref, /^javascript:/i);

  assert.equal(hrefForLabel(html, "Abrir Search Console"), SEARCH_CONSOLE_URL);
  assert.match(text, new RegExp(SEARCH_CONSOLE_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(html, /<script\b/i);
  assert.doesNotMatch(html, /navigator\.clipboard/i);
});

test("pagina copiar-url responde y muestra noindex, fallback y controles de copia", async () => {
  const { status, html } = await requestLocalCopyPage(
    "/copiar-url?url=https%3A%2F%2Finmoradar.app%2Fguias%2Fcomo-comparar-dos-pisos%2F"
  );

  assert.equal(status, 200);
  assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
  assert.match(html, /InmoRadar/);
  assert.match(html, /Copia la URL publicada/);
  assert.match(html, /data-copy-url-value/);
  assert.match(html, />Copiar URL<\/button>/);
  assert.match(html, />Abrir Search Console<\/a>/);
  assert.match(html, /href="https:\/\/search\.google\.com\/search-console\/index\?resource_id=sc-domain%3Ainmoradar\.app"/);
  assert.match(html, /selecciona la URL de la caja y copiala manualmente/);
  assert.match(html, /pégala en Inspección de URL si quieres revisarla manualmente/);
  assert.match(html, /src="\/assets\/copy-url\.js"/);

  const localServer = fs.readFileSync(path.join(root, "scripts", "serve-static.js"), "utf8");
  assert.match(localServer, /"\/copiar-url": "\/copiar-url\/index\.html"/);
});

test("pagina copiar-url valida dominio y neutraliza URLs externas", () => {
  const valid = normalizePublishedUrl("https://inmoradar.app/guias/como-comparar-dos-pisos/");
  const external = normalizePublishedUrl("https://example.com/guias/como-comparar-dos-pisos/");
  const spoofed = normalizePublishedUrl("https://inmoradar.app.evil.test/guias/test/");
  const http = normalizePublishedUrl("http://inmoradar.app/guias/test/");

  assert.deepEqual(valid, {
    ok: true,
    value: "https://inmoradar.app/guias/como-comparar-dos-pisos/",
    reason: null
  });
  assert.equal(external.ok, false);
  assert.equal(external.value, "");
  assert.equal(spoofed.ok, false);
  assert.equal(spoofed.value, "");
  assert.equal(http.ok, false);
  assert.equal(http.value, "");
});
