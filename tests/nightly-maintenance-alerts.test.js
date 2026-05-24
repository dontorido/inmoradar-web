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

test("nightly maintenance loader reads v1 schema from a regular json fence", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "inmoradar-nightly-alerts-v1-"));
  const reportPath = path.join(dir, "NIGHTLY_REFACTOR_REPORT.md");
  fs.writeFileSync(
    reportPath,
    `# Informe nocturno

Resumen humano que se conserva para lectura manual.

\`\`\`json
{
  "schema": "inmoradar.nightly_maintenance.v1",
  "generated_at": "2026-05-24T00:00:00.000Z",
  "branch": "refactor/public-api-services",
  "repo_clean": false,
  "sensitive_files_changed": [
    "admin.html",
    "assets/admin.css",
    "assets/admin.js"
  ],
  "tests_passed": false,
  "failed_tests": [
    "node --test tests/*.test.js"
  ],
  "branch_pushed": true,
  "requires_human_decision": true,
  "human_decision_reason": "Repo dirty with parallel changes in sensitive backoffice files",
  "risk_domains": [
    "seo",
    "sitemap",
    "robots",
    "canonical"
  ],
  "status": "blocked",
  "summary": "Maintenance stopped before touching code because the repository was not clean."
}
\`\`\`
`,
    "utf8"
  );

  const alerts = loadNightlyMaintenanceAlerts({ rootDir: dir, now: NOW });

  assert.equal(alerts.some((alert) => alert.id === "nightly-maintenance-sensitive-parallel-changes" && alert.message.includes("assets/admin.css")), true);
  assert.equal(alerts.some((alert) => alert.id === "nightly-maintenance-repo-dirty" && alert.created_at === "2026-05-24T00:00:00.000Z"), true);
  assert.equal(alerts.some((alert) => alert.id === "nightly-maintenance-tests-failed" && alert.message.includes("node --test tests/*.test.js")), true);
  assert.equal(alerts.some((alert) => alert.id === "nightly-maintenance-human-decision-required" && alert.message.includes("Repo dirty")), true);
  assert.equal(alerts.some((alert) => alert.id === "nightly-maintenance-risk-domains" && alert.message.includes("seo")), true);
});

test("nightly maintenance structured risk_domains overrides text risk inference", () => {
  const report = `
# Informe nocturno

El texto humano menciona SEO, sitemap, robots y canonical para contexto historico.

\`\`\`json
{
  "schema": "inmoradar.nightly_maintenance.v1",
  "generated_at": "2026-05-24T00:00:00.000Z",
  "repo_clean": true,
  "tests_passed": true,
  "requires_human_decision": false,
  "risk_domains": [],
  "status": "success",
  "summary": "Maintenance completed successfully."
}
\`\`\`
`;
  const status = parseNightlyMaintenanceReport(report);
  const alerts = buildNightlyMaintenanceAlerts(status, { now: NOW });

  assert.deepEqual(status.risks, []);
  assert.equal(alerts.some((alert) => alert.id === "nightly-maintenance-risk-domains"), false);
  assert.deepEqual(
    alerts.map((alert) => [alert.id, alert.severity]),
    [["nightly-maintenance-completed", "success"]]
  );
});

test("nightly maintenance structured risk_domains creates risk alerts without text hints", () => {
  const report = `
# Informe nocturno

Informe humano sin menciones de dominios de riesgo.

\`\`\`json
{
  "schema": "inmoradar.nightly_maintenance.v1",
  "generated_at": "2026-05-24T00:00:00.000Z",
  "repo_clean": true,
  "tests_passed": true,
  "requires_human_decision": false,
  "risk_domains": ["seo", "robots"],
  "status": "warning",
  "summary": "Maintenance completed with risk warnings."
}
\`\`\`
`;
  const status = parseNightlyMaintenanceReport(report);
  const alerts = buildNightlyMaintenanceAlerts(status, { now: NOW });

  assert.deepEqual(status.risks, ["seo", "robots"]);
  assert.equal(alerts.some((alert) => alert.id === "nightly-maintenance-risk-domains" && alert.message.includes("seo")), true);
});

test("nightly maintenance loader stays quiet when no report exists", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "inmoradar-nightly-alerts-empty-"));

  assert.deepEqual(loadNightlyMaintenanceAlerts({ rootDir: dir, now: NOW }), []);
});
