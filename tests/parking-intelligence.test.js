const test = require("node:test");
const assert = require("node:assert/strict");

const { calculateParkingAssessment } = require("../api/market-price")._internal;

const ARROYO_OLIVAR = {
  source_url: "https://www.idealista.com/inmueble/109503975/",
  street: "Calle del Arroyo del Olivar",
  district: "Puente de Vallecas",
  zone: "Portazgo",
  municipality: "Madrid",
  province: "Madrid",
  garage_included: "false",
  exact_location: "false",
  public_transport: "metro y bus cerca"
};

test("Parking Intelligence devuelve lectura sofisticada para 109503975", () => {
  const result = calculateParkingAssessment(ARROYO_OLIVAR);

  assert.equal(result.ok, true);
  assert.equal(result.partial, true);
  assert.equal(result.parking_assessment.overall_label, "media-alta");
  assert.equal(result.parking_assessment.confidence_label, "media-baja");
  assert.equal(result.resident_parking.nearby_detected, true);
  assert.match(result.resident_parking.items[0].name, /Arroyo del Olivar/);
  assert.match(result.resident_parking.message, /no se puede confirmar disponibilidad/i);
  assert.equal(result.street_parking.regulated_zone.detected, null);
  assert.equal(result.paid_parking.source, "parkopedia_license_required");
  assert.equal(result.paid_parking.price_status, "not_confirmed");
  assert.match(result.paid_parking.message, /Parkopedia/i);
  assert.match(result.paid_parking.message, /integraci[oó]n autorizada/i);
});

test("garaje incluido baja claramente el riesgo global", () => {
  const withoutGarage = calculateParkingAssessment(ARROYO_OLIVAR);
  const withGarage = calculateParkingAssessment({ ...ARROYO_OLIVAR, garage_included: "true" });

  assert.ok(withoutGarage.parking_assessment.overall_score - withGarage.parking_assessment.overall_score >= 2);
  assert.equal(withGarage.garage.included_detected, true);
});

test("sin ubicación exacta baja la confianza", () => {
  const result = calculateParkingAssessment(ARROYO_OLIVAR);
  assert.ok(result.parking_assessment.confidence_score <= 0.55);
});

test("parking de residentes cercano no se comunica como plaza disponible", () => {
  const result = calculateParkingAssessment(ARROYO_OLIVAR);
  const text = JSON.stringify(result).toLowerCase();

  assert.doesNotMatch(text, /hay plaza disponible/);
  assert.match(text, /disponibilidad/);
});

test("si falta ubicación devuelve missing_location", () => {
  const result = calculateParkingAssessment({});
  assert.equal(result.ok, false);
  assert.equal(result.reason, "missing_location");
});
