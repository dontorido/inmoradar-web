const { hasSupabaseConfig, supabaseFetch: defaultSupabaseFetch } = require("../_utils");
const { KPI_SCHEMA_VERSION, coerceKpiSettings, defaultKpiSettings } = require("../_kpi/settings");

const SETTINGS_ID = "default";
const SETTINGS_PATH = "seo_autogeneration";
const LIMITS = {
  max_per_day: { min: 0, max: 100, label: "Publicaciones máximas por día" },
  max_per_week: { min: 0, max: 700, label: "Publicaciones máximas por semana" },
  max_per_run: { min: 1, max: 100, label: "Máximo de publicaciones por ejecución" },
  min_score: { min: 0, max: 100, label: "Score mínimo" }
};

function defaultSeoAutogenerationConditions() {
  return {
    ...defaultKpiSettings()[SETTINGS_PATH]
  };
}

function parseBoolean(value, fallback) {
  if (typeof value === "boolean") return value;
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "si", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function integerFromInput(value, rule, errors) {
  const raw = String(value ?? "").trim();
  if (!/^-?\d+$/.test(raw)) {
    errors.push(`${rule.label} debe ser un entero.`);
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  if (parsed < rule.min || parsed > rule.max) {
    errors.push(`${rule.label} debe estar entre ${rule.min} y ${rule.max}.`);
    return null;
  }
  return parsed;
}

function validateSeoAutogenerationConditions(input = {}) {
  const errors = [];
  const defaults = defaultSeoAutogenerationConditions();
  const enabled = parseBoolean(input.enabled, defaults.enabled);
  const settings = {
    enabled,
    max_per_day: integerFromInput(input.max_per_day, LIMITS.max_per_day, errors),
    max_per_week: integerFromInput(input.max_per_week, LIMITS.max_per_week, errors),
    max_per_run: integerFromInput(input.max_per_run, LIMITS.max_per_run, errors),
    min_score: integerFromInput(input.min_score, LIMITS.min_score, errors)
  };

  if (enabled && settings.max_per_run !== null && settings.max_per_run < 1) {
    errors.push("Máximo de publicaciones por ejecución debe ser al menos 1 si la autogeneración está activa.");
  }

  return {
    ok: errors.length === 0,
    errors,
    settings: errors.length ? null : settings
  };
}

function coerceSeoAutogenerationConditions(input = {}) {
  return coerceKpiSettings({ [SETTINGS_PATH]: input })[SETTINGS_PATH];
}

function mergeSeoAutogenerationConditions(settingsJson = {}, conditions = {}) {
  return coerceKpiSettings({
    ...(settingsJson && typeof settingsJson === "object" ? settingsJson : {}),
    [SETTINGS_PATH]: conditions
  });
}

async function readSeoAutogenerationConditions(options = {}) {
  const supabaseFetch = options.supabaseFetch || defaultSupabaseFetch;
  if (!hasSupabaseConfig() && !options.allowMissingSupabase) {
    return {
      ok: true,
      settings: defaultSeoAutogenerationConditions(),
      read_only: true,
      table_missing: false,
      reason: "supabase_not_configured",
      updated_at: null
    };
  }

  try {
    const rows = await supabaseFetch(
      `kpi_settings?id=eq.${SETTINGS_ID}&select=id,schema_version,settings_json,updated_at&limit=1`
    );
    const row = Array.isArray(rows) ? rows[0] || null : null;
    return {
      ok: true,
      settings: coerceSeoAutogenerationConditions(row?.settings_json?.[SETTINGS_PATH] || {}),
      read_only: false,
      table_missing: false,
      reason: null,
      updated_at: row?.updated_at || null
    };
  } catch (error) {
    return {
      ok: true,
      settings: defaultSeoAutogenerationConditions(),
      read_only: true,
      table_missing: /kpi_settings/.test(error.message || ""),
      reason: /kpi_settings/.test(error.message || "") ? "kpi_settings_table_missing" : "settings_read_failed",
      error: error.message,
      updated_at: null
    };
  }
}

async function saveSeoAutogenerationConditions(input = {}, options = {}) {
  const supabaseFetch = options.supabaseFetch || defaultSupabaseFetch;
  const validation = validateSeoAutogenerationConditions(input);
  if (!validation.ok) {
    const error = new Error("invalid_seo_autogeneration_conditions");
    error.status = 400;
    error.errors = validation.errors;
    throw error;
  }
  if (!hasSupabaseConfig() && !options.allowMissingSupabase) {
    const error = new Error("seo_autogeneration_settings_read_only");
    error.status = 503;
    error.reason = "supabase_not_configured";
    throw error;
  }

  const currentRows = await supabaseFetch(
    `kpi_settings?id=eq.${SETTINGS_ID}&select=id,schema_version,settings_json,updated_at&limit=1`
  );
  const current = Array.isArray(currentRows) ? currentRows[0] || null : null;
  const settingsJson = mergeSeoAutogenerationConditions(current?.settings_json || {}, validation.settings);
  const now = new Date().toISOString();
  const rows = await supabaseFetch("kpi_settings?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify([
      {
        id: SETTINGS_ID,
        schema_version: KPI_SCHEMA_VERSION,
        settings_json: settingsJson,
        updated_by: "backoffice",
        updated_at: now
      }
    ])
  });
  const row = Array.isArray(rows) ? rows[0] || null : null;
  return {
    ok: true,
    settings: coerceSeoAutogenerationConditions(row?.settings_json?.[SETTINGS_PATH] || validation.settings),
    read_only: false,
    updated_at: row?.updated_at || now
  };
}

module.exports = {
  LIMITS,
  SETTINGS_PATH,
  coerceSeoAutogenerationConditions,
  defaultSeoAutogenerationConditions,
  readSeoAutogenerationConditions,
  saveSeoAutogenerationConditions,
  validateSeoAutogenerationConditions
};
