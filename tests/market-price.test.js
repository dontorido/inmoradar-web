const test = require("node:test");
const assert = require("node:assert/strict");

const marketPriceHandler = require("../api/market-price");
const {
  calculateDifferencePct,
  calculateListingPriceEurM2,
  buildConsensusRecord,
  buildContactEmailPayload,
  buildResendContactEmailPayload,
  classifyComparison,
  findBestGroupFromRecords,
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

test("buildContactEmailPayload envia mensajes de contacto a hola@inmoradar.app", () => {
  const previousFrom = process.env.CLOUDFLARE_EMAIL_FROM;
  const previousContactFrom = process.env.CLOUDFLARE_CONTACT_EMAIL_FROM;
  delete process.env.CLOUDFLARE_EMAIL_FROM;
  delete process.env.CLOUDFLARE_CONTACT_EMAIL_FROM;

  const payload = buildContactEmailPayload({
    id: "contact-test",
    name: "Sergio",
    email: "sergio@example.com",
    topic: "premium",
    message: "Necesito ayuda con Premium.",
    created_at: "2026-05-19T12:00:00.000Z"
  });

  assert.equal(payload.to, "hola@inmoradar.app");
  assert.equal(payload.reply_to, "sergio@example.com");
  assert.equal(payload.from, "noreply@inmoradar.app");
  assert.equal(payload.headers["Reply-To"], undefined);
  assert.match(payload.subject, /premium/);
  assert.match(payload.text, /Necesito ayuda con Premium/);
  assert.match(payload.html, /Nuevo mensaje/);

  if (previousFrom === undefined) delete process.env.CLOUDFLARE_EMAIL_FROM;
  else process.env.CLOUDFLARE_EMAIL_FROM = previousFrom;
  if (previousContactFrom === undefined) delete process.env.CLOUDFLARE_CONTACT_EMAIL_FROM;
  else process.env.CLOUDFLARE_CONTACT_EMAIL_FROM = previousContactFrom;
});

test("buildContactEmailPayload evita usar el mismo buzon como remitente y destino", () => {
  const previousFrom = process.env.CLOUDFLARE_EMAIL_FROM;
  const previousContactFrom = process.env.CLOUDFLARE_CONTACT_EMAIL_FROM;
  process.env.CLOUDFLARE_EMAIL_FROM = "hola@inmoradar.app";
  delete process.env.CLOUDFLARE_CONTACT_EMAIL_FROM;

  const payload = buildContactEmailPayload({
    id: "contact-test",
    name: "Sergio",
    email: "sergio@example.com",
    topic: "general",
    message: "Hola.",
    created_at: "2026-05-19T12:00:00.000Z"
  });

  assert.equal(payload.to, "hola@inmoradar.app");
  assert.equal(payload.from, "noreply@inmoradar.app");

  if (previousFrom === undefined) delete process.env.CLOUDFLARE_EMAIL_FROM;
  else process.env.CLOUDFLARE_EMAIL_FROM = previousFrom;
  if (previousContactFrom === undefined) delete process.env.CLOUDFLARE_CONTACT_EMAIL_FROM;
  else process.env.CLOUDFLARE_CONTACT_EMAIL_FROM = previousContactFrom;
});

test("buildResendContactEmailPayload prepara el email de contacto para Resend", () => {
  const previousFrom = process.env.RESEND_EMAIL_FROM;
  const previousContactFrom = process.env.RESEND_CONTACT_EMAIL_FROM;
  delete process.env.RESEND_EMAIL_FROM;
  delete process.env.RESEND_CONTACT_EMAIL_FROM;

  const payload = buildResendContactEmailPayload({
    id: "contact-test",
    name: "Sergio",
    email: "sergio@example.com",
    topic: "general",
    message: "Hola desde Resend.",
    created_at: "2026-05-19T12:00:00.000Z"
  });

  assert.deepEqual(payload.to, ["hola@inmoradar.app"]);
  assert.equal(payload.from, "InmoRadar <noreply@inmoradar.app>");
  assert.equal(payload.reply_to, "sergio@example.com");
  assert.match(payload.text, /Hola desde Resend/);

  if (previousFrom === undefined) delete process.env.RESEND_EMAIL_FROM;
  else process.env.RESEND_EMAIL_FROM = previousFrom;
  if (previousContactFrom === undefined) delete process.env.RESEND_CONTACT_EMAIL_FROM;
  else process.env.RESEND_CONTACT_EMAIL_FROM = previousContactFrom;
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

test("findBestFromRecords prioriza barrio con distrito antes de distrito y municipio", () => {
  const records = [
    {
      source: "idealista_public_report",
      operation: "sale",
      autonomous_community: "Madrid Comunidad",
      province: "Madrid",
      municipality: "Madrid",
      geo_level: "municipality",
      price_eur_m2: 5286,
      period_date: "2026-04-01"
    },
    {
      source: "idealista_public_report",
      operation: "sale",
      autonomous_community: "Madrid Comunidad",
      province: "Madrid",
      municipality: "Madrid",
      district: "Puente de Vallecas",
      geo_level: "district",
      price_eur_m2: 3325,
      period_date: "2026-04-01"
    },
    {
      source: "idealista_public_report",
      operation: "sale",
      autonomous_community: "Madrid Comunidad",
      province: "Madrid",
      municipality: "Madrid",
      district: "Puente de Vallecas",
      neighbourhood: "Portazgo",
      zone_name: "Portazgo",
      geo_level: "neighbourhood",
      price_eur_m2: 3290,
      period_date: "2026-04-01"
    }
  ];

  const match = findBestFromRecords(records, {
    operation: "sale",
    municipality: "Madrid",
    district: "Puente de Vallecas",
    zone: "Portazgo"
  });

  assert.equal(match.price_eur_m2, 3290);
  assert.equal(match.geo_level, "neighbourhood");
  assert.equal(match.zone_name, "Portazgo");
});

test("findBestFromRecords cae a distrito si no existe barrio", () => {
  const records = [
    {
      source: "idealista_public_report",
      operation: "sale",
      municipality: "Madrid",
      district: "Puente de Vallecas",
      geo_level: "district",
      price_eur_m2: 3325,
      period_date: "2026-04-01"
    },
    {
      source: "idealista_public_report",
      operation: "sale",
      municipality: "Madrid",
      geo_level: "municipality",
      price_eur_m2: 5286,
      period_date: "2026-04-01"
    }
  ];

  const match = findBestFromRecords(records, {
    operation: "sale",
    municipality: "Madrid",
    district: "Puente de Vallecas",
    zone: "Portazgo"
  });

  assert.equal(match.price_eur_m2, 3325);
  assert.equal(match.geo_level, "district");
});

test("findBestFromRecords devuelve null si no hay dato compatible", () => {
  const records = [{ operation: "rent", municipality: "Madrid", geo_level: "municipality", price_eur_m2: 22 }];
  assert.equal(findBestFromRecords(records, { operation: "sale", municipality: "Madrid" }), null);
});

test("findBestGroupFromRecords agrupa fuentes del mismo nivel geografico", () => {
  const records = [
    {
      source: "idealista_public_report",
      operation: "sale",
      municipality: "Madrid",
      geo_level: "municipality",
      price_eur_m2: 4300,
      period_date: "2026-04-01"
    },
    {
      source: "fotocasa_index",
      operation: "sale",
      municipality: "Madrid",
      geo_level: "municipality",
      price_eur_m2: 4500,
      period_date: "2026-04-01"
    },
    {
      source: "mivau_appraisal",
      operation: "sale",
      province: "Madrid",
      geo_level: "province",
      price_eur_m2: 3100,
      period_date: "2025-10-01"
    }
  ];

  const group = findBestGroupFromRecords(records, { operation: "sale", municipality: "Madrid", province: "Madrid" });
  assert.equal(group.length, 2);
  assert.deepEqual(
    group.map((record) => record.source).sort(),
    ["fotocasa_index", "idealista_public_report"]
  );
});

test("buildConsensusRecord calcula referencia combinada y conserva fuentes", () => {
  const consensus = buildConsensusRecord([
    {
      source: "idealista_public_report",
      operation: "sale",
      municipality: "Madrid",
      geo_level: "municipality",
      price_eur_m2: 4300,
      period_label: "abril 2026",
      period_date: "2026-04-01",
      confidence_score: 0.65
    },
    {
      source: "fotocasa_index",
      operation: "sale",
      municipality: "Madrid",
      geo_level: "municipality",
      price_eur_m2: 4500,
      period_label: "abril 2026",
      period_date: "2026-04-01",
      confidence_score: 0.65
    }
  ]);

  assert.equal(consensus.source, "market_consensus");
  assert.equal(consensus.source_count, 2);
  assert.equal(consensus.price_range_eur_m2.min, 4300);
  assert.equal(consensus.price_range_eur_m2.max, 4500);
  assert.ok(consensus.price_eur_m2 > 4300);
  assert.ok(consensus.price_eur_m2 < 4500);
  assert.ok(consensus.confidence_score > 0.65);
  assert.equal(consensus.sources.length, 2);
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

test("handler modera el veredicto y score cuando la referencia es municipal", async () => {
  const response = await invokeMarketPrice({
    operation: "sale",
    listing_price_total: "100000",
    listing_area_m2: "100",
    municipality: "Logroño",
    province: "La Rioja"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.market.geo_level, "municipality");
  assert.equal(response.body.comparison.label, "buen_precio");
  assert.equal(response.body.comparison.confidence_adjusted, true);
  assert.ok(response.body.comparison.price_score <= 8.2);
  assert.ok(response.body.caveats.some((text) => text.includes("referencia amplia")));
});

test("handler devuelve referencia Portazgo para el caso 109503975", async () => {
  const response = await invokeMarketPrice({
    operation: "sale",
    municipality: "Madrid",
    district: "Puente de Vallecas",
    zone: "Portazgo",
    listing_price_total: "305000",
    listing_area_m2: "74"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.listing.price_eur_m2, 4121.62);
  assert.equal(response.body.market.price_eur_m2, 3290);
  assert.equal(response.body.market.geo_level, "neighbourhood");
  assert.equal(response.body.market.geo_name, "Portazgo");
  assert.equal(response.body.market.zone_name, "Portazgo");
  assert.equal(response.body.comparison.difference_pct, 25.28);
  assert.equal(response.body.comparison.label, "caro");
  assert.equal(response.body.comparison.severity, "danger");
  assert.equal(response.body.fallback.matched_by, "municipality+district+zone_name");
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
