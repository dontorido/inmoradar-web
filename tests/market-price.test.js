const test = require("node:test");
const assert = require("node:assert/strict");

const marketPriceHandler = require("../api/market-price");
const {
  calculateDifferencePct,
  calculateListingPriceEurM2,
  classifyComparison,
  findBestFromRecords,
  precisionLabel
} = require("../api/market-price")._internal;

test("calculateListingPriceEurM2 calcula el precio por metro cuadrado del anuncio", () => {
  assert.equal(calculateListingPriceEurM2(210000, 100), 2100);
});

test("calculateDifferencePct calcula diferencia porcentual frente a mercado", () => {
  assert.equal(calculateDifferencePct(2100, 1885), 11.41);
});

test("clasificacion de venta usa los umbrales acordados", () => {
  assert.equal(classifyComparison(-20, "sale").label, "muy_buen_precio");
  assert.equal(classifyComparison(-8, "sale").label, "buen_precio");
  assert.equal(classifyComparison(0, "sale").label, "en_mercado");
  assert.equal(classifyComparison(10, "sale").label, "algo_caro");
  assert.equal(classifyComparison(25, "sale").label, "caro");
});

test("clasificacion de alquiler usa los umbrales acordados", () => {
  assert.equal(classifyComparison(-12, "rent").label, "muy_buen_precio");
  assert.equal(classifyComparison(-5, "rent").label, "buen_precio");
  assert.equal(classifyComparison(2, "rent").label, "en_mercado");
  assert.equal(classifyComparison(8, "rent").label, "algo_caro");
  assert.equal(classifyComparison(15, "rent").label, "caro");
});

test("precisionLabel describe el nivel geografico sin prometer precio de calle", () => {
  assert.equal(precisionLabel("municipality"), "Referencia municipal");
  assert.equal(precisionLabel("neighbourhood"), "Referencia de zona");
  assert.equal(precisionLabel("province"), "Referencia provincial");
});

test("findBestFromRecords prioriza zona y cae a municipio si no hay zona", () => {
  const records = [
    {
      source: "municipal",
      operation: "sale",
      municipality: "Logrono",
      province: "La Rioja",
      geo_level: "municipality",
      price_eur_m2: 1769,
      period_date: "2026-01-01"
    },
    {
      source: "zone",
      operation: "sale",
      municipality: "Logrono",
      province: "La Rioja",
      neighbourhood: "Casco Antiguo",
      zone_name: "Casco Antiguo",
      geo_level: "neighbourhood",
      price_eur_m2: 1885,
      period_date: "2026-01-01"
    }
  ];

  assert.equal(findBestFromRecords(records, { operation: "sale", municipality: "Logroño", province: "La Rioja", zone: "Casco Antiguo" }).price_eur_m2, 1885);
  assert.equal(findBestFromRecords(records, { operation: "sale", municipality: "Logroño", province: "La Rioja", zone: "" }).price_eur_m2, 1769);
});

test("findBestFromRecords devuelve null si no hay dato compatible", () => {
  const records = [{ operation: "rent", municipality: "Madrid", geo_level: "municipality", price_eur_m2: 22 }];
  assert.equal(findBestFromRecords(records, { operation: "sale", municipality: "Madrid" }), null);
});

test("handler devuelve ok=false con mensaje claro si no hay dato de mercado", async () => {
  const response = await invokeMarketPrice({
    operation: "sale",
    listing_price_total: "210000",
    listing_area_m2: "100",
    municipality: "Municipio Sin Dato",
    province: "Provincia Sin Dato"
  });

  assert.equal(response.statusCode, 404);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.error, "market_price_not_found");
  assert.equal(response.body.message, "No tenemos una referencia de mercado suficiente para esta ubicación.");
});

test("handler devuelve aviso claro si no se detecta municipio ni fallback geografico", async () => {
  const response = await invokeMarketPrice({
    operation: "sale",
    listing_price_total: "210000",
    listing_area_m2: "100"
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.error, "missing_location");
  assert.equal(response.body.message, "No se ha podido buscar referencia de mercado porque no se ha detectado el municipio.");
});

async function invokeMarketPrice(query) {
  const res = {
    headers: {},
    statusCode: 200,
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
    },
    end(payload) {
      this.body = JSON.parse(payload || "{}");
    }
  };
  await marketPriceHandler({ method: "GET", query, headers: {} }, res);
  return res;
}
