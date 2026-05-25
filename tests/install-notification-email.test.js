const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildInstallNotificationPayload,
  hasPriorExtensionUsageEvent,
  isReliableInstallActivationEvent,
  notifyReliableInstallActivation,
  renderInstallNotificationEmail,
  sendInstallNotificationEmail,
  sourceLabelFromMetadata,
  summarizeInstallMetrics
} = require("../api/_email/installNotification");

test("renderInstallNotificationEmail genera HTML con copy, metricas, fuente y CTA", () => {
  const rows = [
    {
      anonymous_id_hash: "u1",
      event_name: "extension_opened",
      metadata: { install_source: "chrome_web_store", campaign: "launch" },
      created_at: "2026-05-25T08:00:00.000Z"
    },
    {
      anonymous_id_hash: "u2",
      event_name: "analysis_completed",
      metadata: { utm: { source: "google", medium: "organic", campaign: "seo_city" } },
      created_at: "2026-05-24T08:00:00.000Z"
    }
  ];
  const metrics = summarizeInstallMetrics(rows, new Date("2026-05-25T12:00:00.000Z"));
  const payload = buildInstallNotificationPayload({
    event: rows[0],
    eventCreatedAt: "2026-05-25T08:00:00.000Z",
    metrics,
    env: { PUBLIC_SITE_URL: "https://www.inmoradar.app" }
  });
  const email = renderInstallNotificationEmail(payload);

  assert.match(email.subject, /Nueva instalación de InmoRadar/);
  assert.match(email.html, /Nuevo usuario detectado/);
  assert.match(email.html, /Chrome Web Store/);
  assert.match(email.html, /Ver dashboard/);
  assert.match(email.html, /https:\/\/www\.inmoradar\.app\/admin/);
  assert.match(email.html, /Total/);
  assert.match(email.html, />2</);
  assert.match(email.text, /Instalaciones últimos 7 días: 2/);
});

test("renderInstallNotificationEmail degrada metricas ausentes con No disponible", () => {
  const payload = buildInstallNotificationPayload({
    event: {
      anonymous_id_hash: "u1",
      event_name: "extension_opened",
      metadata: {}
    },
    eventCreatedAt: "2026-05-25T08:00:00.000Z",
    metrics: null,
    env: { INSTALL_NOTIFICATION_DASHBOARD_URL: "https://www.inmoradar.app/admin" }
  });
  const email = renderInstallNotificationEmail(payload);

  assert.match(email.html, /Directo \/ no atribuido/);
  assert.match(email.html, /No disponible/);
  assert.match(email.text, /Nueva instalacion registrada/);
});

test("sourceLabelFromMetadata normaliza canales conocidos sin inventar datos", () => {
  assert.equal(sourceLabelFromMetadata({ install_source: "chrome_web_store" }), "Chrome Web Store");
  assert.equal(sourceLabelFromMetadata({ utm: { source: "google", medium: "organic" } }), "SEO / Google");
  assert.equal(sourceLabelFromMetadata({ install_source: "extension" }), "Directo / no atribuido");
  assert.equal(sourceLabelFromMetadata({}), "Directo / no atribuido");
});

test("summarizeInstallMetrics ignora clicks de intencion como instalaciones", () => {
  const metrics = summarizeInstallMetrics(
    [
      {
        anonymous_id_hash: "u1",
        event_name: "install_click",
        metadata: { install_source: "seo" },
        created_at: "2026-05-25T08:00:00.000Z"
      },
      {
        anonymous_id_hash: "u1",
        event_name: "extension_opened",
        metadata: { install_source: "chrome_web_store" },
        created_at: "2026-05-25T08:02:00.000Z"
      }
    ],
    new Date("2026-05-25T12:00:00.000Z")
  );

  assert.equal(metrics.totalInstalls, 1);
  assert.equal(metrics.installs7d, 1);
  assert.equal(metrics.activeUsers7d, 1);
  assert.equal(metrics.topSource, "Chrome Web Store");
});

test("hasPriorExtensionUsageEvent no bloquea un primer evento fiable por clicks previos", async () => {
  const withOnlyIntent = await hasPriorExtensionUsageEvent({
    anonymousIdHash: "hash-1",
    supabaseFetch: async () => [{ event_name: "install_click" }, { event_name: "seo_cta_click" }]
  });
  const withReliableEvent = await hasPriorExtensionUsageEvent({
    anonymousIdHash: "hash-1",
    supabaseFetch: async () => [{ event_name: "install_click" }, { event_name: "extension_opened" }]
  });

  assert.equal(withOnlyIntent, false);
  assert.equal(withReliableEvent, true);
});

test("sendInstallNotificationEmail mockea proveedor y devuelve fallo sin lanzar", async () => {
  const result = await sendInstallNotificationEmail(
    buildInstallNotificationPayload({
      event: {
        anonymous_id_hash: "u1",
        event_name: "extension_opened",
        metadata: { install_source: "chrome_web_store" }
      }
    }),
    {
      env: {
        RESEND_API_KEY: "test-key",
        RESEND_EMAIL_FROM: "InmoRadar <noreply@inmoradar.app>"
      },
      fetchImpl: async () => ({
        ok: false,
        status: 500,
        json: async () => ({ error: { message: "provider down" } })
      })
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.skipped, false);
  assert.equal(result.provider, "resend");
  assert.match(result.reason, /provider down/);
});

test("notifyReliableInstallActivation captura fallo de email y no bloquea el evento", async () => {
  const warnings = [];
  const result = await notifyReliableInstallActivation({
    event: {
      anonymous_id_hash: "u1",
      event_name: "analysis_completed",
      metadata: { install_source: "chrome_web_store" }
    },
    eventCreatedAt: "2026-05-25T08:00:00.000Z",
    supabaseFetch: async () => [
      {
        anonymous_id_hash: "u1",
        event_name: "analysis_completed",
        metadata: { install_source: "chrome_web_store" },
        created_at: "2026-05-25T08:00:00.000Z"
      }
    ],
    sendEmail: async () => {
      throw new Error("email provider timeout");
    },
    logger: {
      info() {},
      warn(...args) {
        warnings.push(args);
      }
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.skipped, false);
  assert.match(result.reason, /email provider timeout/);
  assert.equal(warnings.length, 1);
});

test("eventos de intencion o click no disparan notificacion de instalacion", async () => {
  let called = false;
  const event = {
    anonymous_id_hash: "u1",
    event_name: "install_click",
    metadata: { install_source: "seo" }
  };

  const result = await notifyReliableInstallActivation({
    event,
    sendEmail: async () => {
      called = true;
      return { ok: true };
    },
    logger: { info() {}, warn() {} }
  });

  assert.equal(isReliableInstallActivationEvent(event), false);
  assert.equal(result.skipped, true);
  assert.equal(called, false);
});
