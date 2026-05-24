const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_REPORT_FILENAMES = Object.freeze([
  "NIGHTLY_MAINTENANCE_REPORT.md",
  "NIGHTLY_REFACTOR_REPORT.md"
]);

const KNOWN_RISK_DOMAINS = Object.freeze([
  "seo",
  "sitemap",
  "robots",
  "canonical",
  "endpoints publicos",
  "seguridad",
  "rendimiento"
]);

const SENSITIVE_FILE_HINTS = Object.freeze([
  "admin.html",
  "api/admin.js",
  "assets/admin.js",
  "assets/admin.css",
  "PROJECT_CONTEXT.md",
  "AUDIT_REPORT.md"
]);

function stripAccents(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizedText(value) {
  return stripAccents(value).toLowerCase();
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined) return undefined;
  const normalized = normalizedText(value).trim();
  if (["true", "1", "yes", "si", "ok", "clean", "passed", "subida"].includes(normalized)) return true;
  if (["false", "0", "no", "dirty", "failed", "fallido", "fallida", "no subida"].includes(normalized)) return false;
  return undefined;
}

function normalizeStringArray(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/[,;\n]/)
        .map((item) => item.trim());
  return [...new Set(raw.map((item) => String(item || "").trim()).filter(Boolean))].slice(0, 8);
}

function normalizeStatus(value) {
  const normalized = normalizedText(value);
  if (!normalized) return "";
  if (/fall|failed|error/.test(normalized)) return "failed";
  if (/blocked|bloque/.test(normalized)) return "blocked";
  if (/deten|stop|stopped/.test(normalized)) return "stopped";
  if (/avis|warning|warn/.test(normalized)) return "warning";
  if (/complet|success|correct|ok/.test(normalized)) return "success";
  return normalized.slice(0, 40);
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined);
}

function looseValueFromReport(markdown, keys) {
  for (const key of keys) {
    const match = String(markdown || "").match(new RegExp(`^\\s*[-*]?\\s*${key}\\s*[:=]\\s*(.+?)\\s*$`, "im"));
    if (match) return match[1].trim();
  }
  return undefined;
}

function extractJsonStatus(markdown) {
  const source = String(markdown || "");
  const commentMatch = source.match(/<!--\s*nightly[-_ ](?:maintenance|audit|refactor)\s*:\s*([\s\S]*?)-->/i);
  const fencedMatch = source.match(/```(?:json)?\s+nightly[-_ ](?:maintenance|audit|refactor)\s*([\s\S]*?)```/i);
  const rawJson = commentMatch?.[1] || fencedMatch?.[1];
  if (rawJson) {
    try {
      return JSON.parse(rawJson.trim());
    } catch (error) {
      return null;
    }
  }

  const jsonFencePattern = /```json\s*([\s\S]*?)```/gi;
  let match;
  while ((match = jsonFencePattern.exec(source))) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed?.schema === "inmoradar.nightly_maintenance.v1") return parsed;
    } catch (error) {
      continue;
    }
  }
  return null;
}

function inferSensitiveFiles(markdown) {
  const normalized = normalizedText(markdown);
  return SENSITIVE_FILE_HINTS.filter((file) => normalized.includes(file.toLowerCase()));
}

function inferRiskDomains(markdown) {
  const normalized = normalizedText(markdown);
  const hasRisk = /riesg|risk|detectad|fall|warning|avis|error/.test(normalized);
  if (!hasRisk) return [];
  return KNOWN_RISK_DOMAINS.filter((domain) => normalized.includes(domain));
}

function inferStatusFromMarkdown(markdown) {
  const normalized = normalizedText(markdown);
  const repoDirty =
    /repo(?:sitorio)? no esta limpio/.test(normalized) ||
    /repo(?:sitorio)? sucio/.test(normalized) ||
    /working tree (?:not clean|dirty)/.test(normalized) ||
    /dirty repo/.test(normalized);
  const sensitiveFiles = inferSensitiveFiles(markdown);
  const parallelSensitiveChanges =
    /(cambios? paralelos?|parallel changes?)/.test(normalized) &&
    /(archivo|file).{0,40}sensibl/.test(normalized);
  const testsFailed = /tests? fallid|failed tests?|test failures?/.test(normalized);
  const branchNotPushed = /rama.{0,60}no subida|branch.{0,60}not pushed|not pushed.{0,60}origin/.test(normalized);
  const humanDecision = /decision humana requerida|revision manual requerida|human decision required|manual review required/.test(normalized);

  return {
    status: normalizeStatus(looseValueFromReport(markdown, ["status", "estado", "resultado"])) ||
      (repoDirty || parallelSensitiveChanges ? "stopped" : ""),
    repo_clean: firstDefined(normalizeBoolean(looseValueFromReport(markdown, ["repo_clean", "repo limpio"])), repoDirty ? false : undefined),
    parallel_sensitive_changes: firstDefined(
      normalizeBoolean(looseValueFromReport(markdown, ["parallel_sensitive_changes", "cambios paralelos sensibles"])),
      parallelSensitiveChanges ? true : undefined
    ),
    tests_passed: firstDefined(normalizeBoolean(looseValueFromReport(markdown, ["tests_passed", "tests ok"])), testsFailed ? false : undefined),
    branch_pushed: firstDefined(normalizeBoolean(looseValueFromReport(markdown, ["branch_pushed", "rama subida"])), branchNotPushed ? false : undefined),
    report_created: true,
    requires_human_decision: firstDefined(
      normalizeBoolean(looseValueFromReport(markdown, ["requires_human_decision", "decision humana requerida"])),
      humanDecision ? true : undefined
    ),
    sensitive_files: normalizeStringArray(looseValueFromReport(markdown, ["sensitive_files", "archivos sensibles"])).concat(sensitiveFiles),
    risks: normalizeStringArray(looseValueFromReport(markdown, ["risks", "riesgos"])).concat(inferRiskDomains(markdown))
  };
}

function parseNightlyMaintenanceReport(markdown, metadata = {}) {
  const structured = extractJsonStatus(markdown) || {};
  const inferred = inferStatusFromMarkdown(markdown);
  const structuredSensitiveFiles = normalizeStringArray(
    structured.sensitive_files_changed || structured.sensitiveFilesChanged || structured.sensitive_files || structured.sensitiveFiles
  );
  const status = {
    ...inferred,
    ...structured,
    report_created: firstDefined(structured.report_created, inferred.report_created, true),
    report_path: metadata.reportPath || structured.report_path,
    report_name: metadata.reportName || structured.report_name
  };

  status.status = normalizeStatus(status.status || status.outcome || status.result);
  status.repo_clean = normalizeBoolean(status.repo_clean ?? status.repoClean ?? status.clean);
  status.parallel_sensitive_changes = normalizeBoolean(
    status.parallel_sensitive_changes ?? status.parallelSensitiveChanges ?? status.sensitive_changes_detected
  );
  if (status.parallel_sensitive_changes === undefined && structuredSensitiveFiles.length) status.parallel_sensitive_changes = true;
  status.tests_passed = normalizeBoolean(status.tests_passed ?? status.testsPassed);
  status.branch_pushed = normalizeBoolean(status.branch_pushed ?? status.branchPushed);
  status.report_created = normalizeBoolean(status.report_created ?? status.reportCreated);
  status.requires_human_decision = normalizeBoolean(status.requires_human_decision ?? status.requiresHumanDecision);
  status.sensitive_files = normalizeStringArray(structuredSensitiveFiles.length ? structuredSensitiveFiles : status.sensitive_files || status.sensitiveFiles || inferred.sensitive_files);
  status.failed_tests = normalizeStringArray(status.failed_tests || status.failedTests);
  status.risks = normalizeStringArray(status.risks || status.risk_domains || status.riskDomains || inferred.risks);
  return status;
}

function formatList(values, fallback) {
  const list = normalizeStringArray(values);
  if (!list.length) return fallback;
  if (list.length <= 3) return list.join(", ");
  return `${list.slice(0, 3).join(", ")} y ${list.length - 3} mas`;
}

function alertBase(id, severity, title, message, options = {}) {
  const createdAt = options.createdAt || options.now || new Date().toISOString();
  return {
    id,
    severity,
    title,
    message,
    action_label: "Ver estado",
    action_target: "#admin-live-status",
    dismissible: true,
    category: "nightly_maintenance",
    origin: "nightly_maintenance",
    created_at: createdAt,
    read: false
  };
}

function buildNightlyMaintenanceAlerts(status = {}, options = {}) {
  const alerts = [];
  const now = status.generated_at || status.created_at || options.now || new Date().toISOString();
  const reportName = status.report_name || (status.report_path ? path.basename(status.report_path) : "NIGHTLY_MAINTENANCE_REPORT.md");
  const sensitiveFiles = normalizeStringArray(status.sensitive_files || status.sensitiveFiles);
  const failedTests = normalizeStringArray(status.failed_tests || status.failedTests);
  const risks = normalizeStringArray(status.risks || status.risk_domains || status.riskDomains);
  const normalizedStatus = normalizeStatus(status.status || status.outcome || status.result);

  if (status.parallel_sensitive_changes === true) {
    alerts.push(
      alertBase(
        "nightly-maintenance-sensitive-parallel-changes",
        "error",
        "Revision manual requerida",
        `La automatizacion nocturna se detuvo porque detecto cambios paralelos en archivos sensibles: ${formatList(sensitiveFiles, "archivos sensibles del backoffice")}. Revisa el worktree antes de continuar.`,
        { now }
      )
    );
  }

  if (status.repo_clean === false) {
    alerts.push(
      alertBase(
        "nightly-maintenance-repo-dirty",
        "error",
        "Auditoria nocturna detenida",
        "La automatizacion nocturna se detuvo porque el repositorio no estaba limpio. Revisa git status -sb y separa los cambios paralelos antes de reintentar.",
        { now }
      )
    );
  }

  if (status.tests_passed === false) {
    alerts.push(
      alertBase(
        "nightly-maintenance-tests-failed",
        "error",
        "Tests fallidos en mantenimiento nocturno",
        `La auditoria nocturna detecto tests fallidos${failedTests.length ? `: ${formatList(failedTests, "tests")}` : ""}. Revisa el informe antes de continuar con cambios o push.`,
        { now }
      )
    );
  }

  if (status.branch_pushed === false) {
    alerts.push(
      alertBase(
        "nightly-maintenance-branch-not-pushed",
        "warning",
        "Rama de mantenimiento no subida a origin",
        "La auditoria nocturna termino con una rama local pendiente de subir a origin.",
        { now }
      )
    );
  }

  if (status.report_created === false) {
    alerts.push(
      alertBase(
        "nightly-maintenance-report-missing",
        "warning",
        "Informe NIGHTLY_MAINTENANCE_REPORT.md no encontrado",
        "La auditoria nocturna esperaba crear el informe de mantenimiento, pero no consta como generado.",
        { now }
      )
    );
  }

  if (status.requires_human_decision === true) {
    alerts.push(
      alertBase(
        "nightly-maintenance-human-decision-required",
        "warning",
        "Revision manual requerida",
        status.human_decision_reason
          ? `La auditoria nocturna dejo una decision pendiente: ${String(status.human_decision_reason).slice(0, 180)}`
          : "La auditoria nocturna dejo una decision pendiente antes de continuar.",
        { now }
      )
    );
  }

  if (risks.length) {
    alerts.push(
      alertBase(
        "nightly-maintenance-risk-domains",
        "warning",
        "Riesgos detectados en mantenimiento nocturno",
        `El informe ${reportName} marca riesgos en ${formatList(risks, "areas operativas")}.`,
        { now }
      )
    );
  }

  if (alerts.length) return alerts;

  if (normalizedStatus === "failed") {
    return [
      alertBase(
        "nightly-maintenance-failed",
        "error",
        "Auditoria nocturna fallida",
        `La auditoria nocturna fallo. Revisa ${reportName} antes de continuar.`,
        { now }
      )
    ];
  }

  if (normalizedStatus === "stopped" || normalizedStatus === "blocked") {
    return [
      alertBase(
        "nightly-maintenance-stopped",
        "error",
        "Auditoria nocturna detenida",
        `La auditoria nocturna se detuvo. Revisa ${reportName} antes de continuar.`,
        { now }
      )
    ];
  }

  if (normalizedStatus === "warning") {
    return [
      alertBase(
        "nightly-maintenance-completed-with-warnings",
        "warning",
        "Auditoria nocturna completada con avisos",
        `La auditoria nocturna termino con avisos. Revisa ${reportName}.`,
        { now }
      )
    ];
  }

  if (normalizedStatus === "success") {
    return [
      alertBase(
        "nightly-maintenance-completed",
        "success",
        "Auditoria nocturna completada",
        `La auditoria nocturna termino correctamente y dejo informe en ${reportName}.`,
        { now }
      )
    ];
  }

  return [];
}

function findReportPath(rootDir, filenames = DEFAULT_REPORT_FILENAMES) {
  const baseDir = rootDir || process.cwd();
  for (const filename of filenames) {
    const candidate = path.join(baseDir, filename);
    if (fs.existsSync(candidate)) return candidate;
  }
  return "";
}

function loadNightlyMaintenanceAlerts(options = {}) {
  const reportPath = options.reportPath || findReportPath(options.rootDir, options.filenames);
  if (!reportPath) return [];

  try {
    const markdown = fs.readFileSync(reportPath, "utf8");
    const status = parseNightlyMaintenanceReport(markdown, {
      reportPath,
      reportName: path.basename(reportPath)
    });
    return buildNightlyMaintenanceAlerts(status, options);
  } catch (error) {
    return [
      alertBase(
        "nightly-maintenance-report-unreadable",
        "warning",
        "Informe de mantenimiento no legible",
        "El BackOffice encontro un informe nocturno, pero no pudo leerlo para generar alertas.",
        options
      )
    ];
  }
}

module.exports = {
  DEFAULT_REPORT_FILENAMES,
  buildNightlyMaintenanceAlerts,
  loadNightlyMaintenanceAlerts,
  parseNightlyMaintenanceReport
};
