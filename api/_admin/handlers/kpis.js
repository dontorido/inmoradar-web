const {
  KPI_SCHEMA_VERSION,
  KPI_SETTINGS_SCHEMA,
  coerceKpiSettings,
  defaultKpiSettings
} = require("../../_kpi/settings");

function createKpiSettingsHandler({ readJsonBody, supabaseFetch } = {}) {
  if (typeof readJsonBody !== "function") throw new Error("admin_kpis_read_json_body_required");
  if (typeof supabaseFetch !== "function") throw new Error("admin_kpis_supabase_fetch_required");

  async function readKpiSettings() {
    try {
      const rows = await supabaseFetch(
        "kpi_settings?id=eq.default&select=id,schema_version,settings_json,updated_at&limit=1"
      );
      const row = Array.isArray(rows) ? rows[0] || null : null;
      return {
        ok: true,
        row,
        settings: coerceKpiSettings(row?.settings_json || {}),
        updated_at: row?.updated_at || null,
        table_missing: false,
        error: null
      };
    } catch (error) {
      return {
        ok: false,
        row: null,
        settings: defaultKpiSettings(),
        updated_at: null,
        table_missing: /kpi_settings/.test(error.message),
        error: error.message
      };
    }
  }

  async function saveKpiSettings(body) {
    const settings = coerceKpiSettings(body.settings || body.values || {});
    const now = new Date().toISOString();
    const rows = await supabaseFetch("kpi_settings?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify([
        {
          id: "default",
          schema_version: KPI_SCHEMA_VERSION,
          settings_json: settings,
          updated_by: "backoffice",
          updated_at: now
        }
      ])
    });
    const row = Array.isArray(rows) ? rows[0] || null : null;
    return {
      ok: true,
      schema_version: KPI_SCHEMA_VERSION,
      schema: KPI_SETTINGS_SCHEMA,
      defaults: defaultKpiSettings(),
      settings: coerceKpiSettings(row?.settings_json || settings),
      updated_at: row?.updated_at || now
    };
  }

  return async function handleKpiSettings(req) {
    if (req.method === "GET") {
      const result = await readKpiSettings();
      return {
        status: 200,
        payload: {
          ok: true,
          schema_version: KPI_SCHEMA_VERSION,
          schema: KPI_SETTINGS_SCHEMA,
          defaults: defaultKpiSettings(),
          settings: result.settings,
          updated_at: result.updated_at,
          table_missing: result.table_missing,
          error: result.error
        }
      };
    }

    if (req.method === "POST") {
      return { status: 200, payload: await saveKpiSettings(await readJsonBody(req)) };
    }

    return { status: 405, payload: { ok: false, error: "method_not_allowed" } };
  };
}

module.exports = {
  createKpiSettingsHandler
};
