const { handleCors, json } = require("./_utils");

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  res.setHeader("cache-control", "no-store, max-age=0");
  res.setHeader("access-control-allow-origin", "*");

  if (req.method !== "GET") {
    json(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  json(res, 200, {
    latestVersion: "1.0.6",
    minimumRequiredVersion: "1.0.0",
    forceUpdate: false,
    message: "Hay una nueva versión de InmoRadar disponible.",
    forceUpdateMessage: "Esta versión de InmoRadar ya no es compatible. Actualiza para seguir usando el servicio.",
    changelogUrl: "https://www.inmoradar.app/changelog",
    checkedAt: new Date().toISOString()
  });
};
