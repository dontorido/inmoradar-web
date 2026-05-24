const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildNightlyMaintenanceAlerts,
  loadNightlyMaintenanceAlerts,
  parseNightlyMaintenanceReport
} = require("../lib/operations/nightlyMaintenanceAlerts");

const NOW = "2026-05-24T09:00:00.000Z";

test("nightly maintenance alerts flag dirty repo and sensitive parallel changes", () => {
  const alerts = buildNightlyMaintenanceAlerts(
    {
      status: "stopped",
      repo_clean: false,
      parallel_sensitive_changes: true,
      sensitive_files: ["admin.html", "assets/admin.js"]
    },
    { now: NOW }
  );

  assert.equal(alerts.some((alert) => alert.id === "nightly-maintenance-repo-dirty" && alert.severity === "error"), true);
  assert.equal(
    alerts.some((alert) => alert.id === "nightly-maintenance-sensitive-parallel-changes" && alert.message.includes("admin.html")),
    true
  );
  assert.equal(alerts.every((alert) => alert.origin === "nightly_maintenance" && alert.created_at === NOW), true);
});

test("nightly maintenance alerts include stopped run operational follow-ups", () => {
  const alerts = buildNightlyMaintenanceAlerts(
    {
      tests_passed: false,
      branch_pushed: false,
      report_created: false,
      requires_human_decision: true,
      risks: ["seo", "robots", "rendimiento"]
    },
    { now: NOW }
  );

  assert.equal(alerts.some((alert) => alert.id === "nightly-maintenance-tests-failed" && alert.severity === "error"), true);
  assert.equal(alerts.some((alert) => alert.id === "nightly-maintenance-branch-not-pushed" && alert.severity === "warning"), true);
  assert.equal(alerts.some((alert) => alert.id === "nightly-maintenance-report-missing" && alert.severity === "warning"), true);
  assert.equal(alerts.some((alert) => alert.id === "nightly-maintenance-human-decision-required"), true);
  assert.equal(alerts.some((alert) => alert.id === "nightly-maintenance-risk-domains" && alert.message.includes("seo")), true);
});

test("nightly maintenance alerts can confirm a clean completed report", () => {
  const alerts = buildNightlyMaintenanceAlerts(
    {
      status: "completed",
      repo_clean: true,
      tests_passed: true,
      branch_pushed: true,
      report_created: true
    },
    { now: NOW }
  );

  assert.deepEqual(
    alerts.map((alert) => [alert.id, alert.severity]),
    [["nightly-maintenance-completed", "success"]]
  );
});

test("nightly maintenance report parser supports natural stop summaries", () => {
  const status = parseNightlyMaintenanceReport(`
# Informe nocturno

Estado: detenido
Repo no esta limpio.
Cambios paralelos en archivos sensibles: admin.html, assets/admin.css, assets/admin.js
Tests fallidos en mantenimiento nocturno.
Revision manual requerida.
Riesgos detectados en SEO, sitemap, robots y rendimiento.
`);

  assert.equal(status.status, "stopped");
  assert.equal(status.repo_clean, false);
  assert.equal(status.parallel_sensitive_changes, true);
  assert.equal(status.tests_passed, false);
  assert.equal(status.requires_human_decision, true);
  assert.equal(status.sensitive_files.includes("assets/admin.js"), true);
  assert.equal(status.risks.includes("seo"), true);
});

test("nightly maintenance loader reads structured status from report comment", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "inmoradar-nightly-alerts-"));
  const reportPath = path.join(dir, "NIGHTLY_MAINTENANCE_REPORT.md");
  fs.writeFileSync(
    reportPath,
    `# Nightly report

<!-- nightly-maintenance: {"status":"stopped","repo_clean":false,"parallel_sensitive_changes":true,"sensitive_files":["admin.html"]} -->
`,
    "utf8"
  );

  const alerts = loadNightlyMaintenanceAlerts({ rootDir: dir, now: NOW });

  assert.equal(alerts.some((alert) => alert.id === "nightly-maintenance-repo-dirty"), true);
  assert.equal(alerts.some((alert) => alert.id === "nightly-maintenance-sensitive-parallel-changes"), true);
});

test("nightly maintenance loader stays quiet when no report exists", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "inmoradar-nightly-alerts-empty-"));

  assert.deepEqual(loadNightlyMaintenanceAlerts({ rootDir: dir, now: NOW }), []);
});
