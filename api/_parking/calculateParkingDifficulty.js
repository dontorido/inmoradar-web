function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function labelFromParkingScore(score) {
  if (score <= 2) return "muy f\u00e1cil";
  if (score <= 4) return "f\u00e1cil";
  if (score <= 6) return "media";
  if (score <= 8) return "dif\u00edcil";
  return "muy dif\u00edcil";
}

function normalizeImpact(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function calculateParkingDifficulty(signals) {
  const streetParkingPressure =
    signals?.street_parking_pressure?.impact ?? signals?.osm_parkings_500m?.impact;
  const publicParking = signals?.public_parking?.impact ?? signals?.public_parkings_500m?.impact;
  const rawScore =
    3 +
    normalizeImpact(signals?.regulated_zone?.impact) +
    normalizeImpact(streetParkingPressure) +
    normalizeImpact(publicParking) +
    normalizeImpact(signals?.urban_density?.impact) +
    normalizeImpact(signals?.urban_morphology?.impact) +
    normalizeImpact(signals?.restrictions?.impact) +
    normalizeImpact(signals?.time_pressure?.impact);

  const score = clamp(Math.round(rawScore), 1, 10);
  return {
    score,
    raw_score: roundTo(rawScore, 2),
    label: labelFromParkingScore(score)
  };
}

module.exports = {
  calculateParkingDifficulty,
  labelFromParkingScore,
  roundTo
};
