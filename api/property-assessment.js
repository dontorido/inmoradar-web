const marketPriceHandler = require("./market-price");
const { handleCors, json } = require("./_utils");
const {
  buildAddressIntelligenceResponse,
  calculateAddressPriceAdjustment
} = require("./_address/intelligence");

function queryFromRequest(req) {
  if (req.query) return req.query;
  const url = new URL(req.url || "/", `https://${req.headers.host || "www.inmoradar.app"}`);
  return Object.fromEntries(url.searchParams.entries());
}

async function invokeMarketPrice(query) {
  const response = {
    headers: {},
    statusCode: 200,
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
    },
    end(payload) {
      this.body = JSON.parse(payload || "{}");
    }
  };
  await marketPriceHandler({ method: "GET", query, headers: {} }, response);
  return { status: response.statusCode, body: response.body };
}

function mergeComparison(marketAssessment, addressAssessment) {
  const comparison = marketAssessment.comparison
    ? { ...marketAssessment.comparison }
    : { difference_pct: null, label: null, severity: "neutral", message: "" };

  const addressCaveats = addressAssessment?.caveats || [];
  const caveats = [...new Set([...(marketAssessment.caveats || []), ...addressCaveats])];
  const strongLiftCaveat = addressCaveats.find((text) => /sin ascensor/i.test(text));

  if (comparison.message && strongLiftCaveat) {
    comparison.message = `${comparison.message} Además, ${strongLiftCaveat.charAt(0).toLowerCase()}${strongLiftCaveat.slice(1)}`;
  }

  comparison.caveats = caveats;
  comparison.address_signals = {
    positive: addressAssessment?.positive_signals || [],
    warning: addressAssessment?.warning_signals || []
  };
  comparison.address_valuation = addressAssessment?.valuation_comparison || null;
  return comparison;
}

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== "GET") {
    return json(res, 405, { ok: false, error: "method_not_allowed" });
  }

  const query = queryFromRequest(req);
  try {
    const market = await invokeMarketPrice(query);
    const addressIntel = await buildAddressIntelligenceResponse(query).catch((error) => ({
      ok: false,
      reason: error?.message || "address_intelligence_failed",
      message: "No se han podido obtener datos adicionales del edificio.",
      address_intelligence: null
    }));

    const addressPayload = addressIntel.ok ? addressIntel : null;
    const addressAssessment = addressPayload
      ? calculateAddressPriceAdjustment(
          {
            price_total: query.listing_price_total,
            surface_m2: query.listing_area_m2,
            floor: query.floor
          },
          addressPayload
        )
      : null;

    const body = {
      ok: Boolean(market.body?.ok || addressIntel.ok),
      listing: market.body?.listing || null,
      market: market.body?.market || null,
      address_intelligence: addressPayload,
      address_intelligence_status: addressIntel.ok
        ? { ok: true, cache: addressIntel.cache || null }
        : {
            ok: false,
            reason: addressIntel.reason || addressIntel.error || "address_intelligence_unavailable",
            message: addressIntel.message || "No se han podido obtener datos adicionales del edificio."
          },
      comparison: mergeComparison(market.body || {}, addressAssessment),
      disclaimer:
        "Estimación orientativa. Los datos de edificio se usan como contexto y no sustituyen una tasación ni confirman el precio exacto de una vivienda."
    };

    return json(res, market.body?.ok ? 200 : market.status || 207, body);
  } catch (error) {
    console.error("[property-assessment]", error);
    return json(res, 500, {
      ok: false,
      error: "property_assessment_failed",
      message: "No se ha podido construir la evaluación del inmueble."
    });
  }
};

module.exports._internal = {
  invokeMarketPrice,
  mergeComparison
};
