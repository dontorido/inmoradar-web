const { handleCors, json } = require("./_utils");
const {
  buildAddressIntelligenceResponse,
  checkAddressRateLimit
} = require("./_address/intelligence");

function queryFromRequest(req) {
  if (req.query) return req.query;
  const url = new URL(req.url || "/", `https://${req.headers.host || "www.inmoradar.app"}`);
  return Object.fromEntries(url.searchParams.entries());
}

function clientKey(req) {
  return (
    req.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.headers?.["x-real-ip"] ||
    req.headers?.["cf-connecting-ip"] ||
    "anonymous"
  );
}

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== "GET") {
    return json(res, 405, { ok: false, error: "method_not_allowed" });
  }

  const rate = checkAddressRateLimit(clientKey(req));
  if (!rate.allowed) {
    return json(res, 429, {
      ok: false,
      error: "rate_limited",
      message: "Demasiadas consultas de dirección en poco tiempo.",
      rate_limit: rate
    });
  }

  try {
    const result = await buildAddressIntelligenceResponse(queryFromRequest(req));
    const status = result.ok ? 200 : result.reason === "insufficient_address_parts" ? 400 : 404;
    return json(res, status, result);
  } catch (error) {
    console.error("[address-intelligence]", error);
    return json(res, 500, {
      ok: false,
      error: "address_intelligence_failed",
      message: "No se han podido obtener datos adicionales del edificio."
    });
  }
};
