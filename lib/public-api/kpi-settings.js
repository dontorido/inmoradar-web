const { hasSupabaseConfig, supabaseFetch } = require("../../api/_utils");
const { coerceKpiSettings, defaultKpiSettings } = require("../../api/_kpi/settings");

let kpiSettingsCache = {
  expiresAt: 0,
  value: defaultKpiSettings()
};

async function loadKpiSettings() {
  if (kpiSettingsCache.expiresAt > Date.now()) return kpiSettingsCache.value;
  if (!hasSupabaseConfig()) return kpiSettingsCache.value;

  try {
    const rows = await supabaseFetch(
      "kpi_settings?id=eq.default&select=settings_json&limit=1",
      { timeoutMs: 2500 }
    );
    const row = Array.isArray(rows) ? rows[0] || null : null;
    kpiSettingsCache = {
      expiresAt: Date.now() + 5 * 60 * 1000,
      value: coerceKpiSettings(row?.settings_json || {})
    };
  } catch {
    kpiSettingsCache = {
      expiresAt: Date.now() + 60 * 1000,
      value: defaultKpiSettings()
    };
  }

  return kpiSettingsCache.value;
}

module.exports = {
  loadKpiSettings
};
