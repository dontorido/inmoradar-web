function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function labelFromParkingScore(score) {
  if (score <= 2) return "muy fácil";
  if (score <= 4) return "fácil";
  if (score <= 6) return "media";
  if (score <= 8) return "difícil";
  return "muy difícil";
}

function normalizeImpact(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function calculateParkingDifficulty(signals) {
  const rawScore =
    3 +
    normalizeImpact(signals?.regulated_zone?.impact) +
    normalizeImpact(signals?.osm_parkings_500m?.impact) +
    normalizeImpact(signals?.public_parkings_500m?.impact) +
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
