const { roundTo } = require("./calculateParkingDifficulty");
const { densityLevelForCity } = require("./municipalAdapters");

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parkingSupplyImpact(osm) {
  const count = Number(osm.countParkings || 0);
  const spaces = Number(osm.countParkingSpaces || 0);
  const capacity = Number(osm.capacityTotal || 0);

  if (count === 0 && spaces < 5) return 2;
  if (count <= 1 && spaces < 20) return 1;
  if (count >= 5 || capacity >= 500) return -2;
  if (count >= 3 || capacity >= 150 || spaces >= 40) return -1;
  return 0;
}

function publicParkingImpact(publicParkings) {
  const count = Number(publicParkings?.count || 0);
  const available = Number(publicParkings?.available_spaces);
  if (Number.isFinite(available) && available > 80) return -2;
  if (Number.isFinite(available) && available > 20) return -1;
  if (count >= 3) return -1;
  if (count === 0) return 0;
  return 0;
}

function densityImpact(level) {
  if (level === "very_high") return 2;
  if (level === "high") return 1.5;
  if (level === "medium") return 0.75;
  return 0;
}

function morphologyImpact(osm) {
  let impact = 0;
  if (osm.countPedestrianStreets >= 8) impact += 2;
  else if (osm.countPedestrianStreets >= 3) impact += 1.25;
  else if (osm.countPedestrianStreets >= 1) impact += 0.5;

  if (osm.countLivingStreets >= 6) impact += 0.75;
  else if (osm.countLivingStreets >= 2) impact += 0.4;

  if (osm.countMainRoads >= 4) impact += 0.35;
  if (osm.countParkingLaneWays > 0) impact -= 0.75;

  return roundTo(clamp(impact, 0, 2), 2);
}

function restrictionImpact(restrictions) {
  let impact = 0;
  if (restrictions?.zbe) impact += 1;
  if (restrictions?.resident_only) impact += 1;
  if (restrictions?.loading_zones_detected) impact += 0.5;
  return roundTo(clamp(impact, 0, 2), 2);
}

function buildParkingSignals({ osmSummary, municipalSignals, city }) {
  const densityLevel = municipalSignals?.densityLevel || densityLevelForCity(city);
  const restrictions = {
    zbe: Boolean(municipalSignals?.restrictions?.zbe),
    resident_only: Boolean(municipalSignals?.restrictions?.resident_only),
    loading_zones_detected: Boolean(municipalSignals?.restrictions?.loading_zones_detected)
  };

  return {
    regulated_zone: {
      detected: Boolean(municipalSignals?.regulatedZone?.detected),
      type: municipalSignals?.regulatedZone?.type || "unknown",
      impact: roundTo(clamp(Number(municipalSignals?.regulatedZone?.impact || 0), 0, 4), 2),
      source: municipalSignals?.regulatedZone?.source || null
    },
    osm_parkings_500m: {
      count: Number(osmSummary?.countParkings || 0),
      capacity_total: osmSummary?.capacityTotal ?? null,
      impact: parkingSupplyImpact(osmSummary || {})
    },
    public_parkings_500m: {
      count: Number(municipalSignals?.publicParkings?.count || 0),
      available_spaces: municipalSignals?.publicParkings?.available_spaces ?? null,
      impact: publicParkingImpact(municipalSignals?.publicParkings)
    },
    urban_density: {
      level: densityLevel,
      impact: densityImpact(densityLevel)
    },
    urban_morphology: {
      pedestrian_streets_count: Number(osmSummary?.countPedestrianStreets || 0),
      main_roads_count: Number(osmSummary?.countMainRoads || 0),
      parking_lane_detected: Number(osmSummary?.countParkingLaneWays || 0) > 0,
      impact: morphologyImpact(osmSummary || {})
    },
    restrictions: {
      ...restrictions,
      impact: restrictionImpact(restrictions)
    },
    time_pressure: {
      applied: false,
      impact: 0
    }
  };
}

function confidenceFromSignals({ signals, osmSummary, municipalSignals, usedMock = false, overpassOk = false }) {
  let confidence = 0.18;
  const hasMunicipalRegulated = Boolean(signals.regulated_zone.detected && signals.regulated_zone.source === "municipal_open_data");
  const osmSufficient = Boolean(overpassOk && Number(osmSummary?.relevantElements || 0) >= 5);
  const hasRealTimeParking = Number.isFinite(Number(signals.public_parkings_500m.available_spaces));

  if (hasMunicipalRegulated) confidence += 0.3;
  if (osmSufficient) confidence += 0.3;
  if (hasRealTimeParking) confidence += 0.2;
  if (municipalSignals?.supported && !hasMunicipalRegulated) confidence += 0.08;
  if (usedMock) confidence = Math.min(confidence, 0.45);
  if (!hasMunicipalRegulated && !osmSufficient && !hasRealTimeParking) confidence = Math.min(confidence, 0.45);

  return roundTo(clamp(confidence, 0.1, 0.95), 2);
}

function buildParkingExplanation({ signals, overpassOk }) {
  const explanation = [];

  if (signals.regulated_zone.detected) {
    explanation.push("La dirección está dentro de una zona de estacionamiento regulado.");
  }

  if (signals.osm_parkings_500m.count <= 1) {
    explanation.push("Hay pocos parkings cercanos detectados en un radio de 500 m.");
  } else if (signals.osm_parkings_500m.count >= 3) {
    explanation.push("Se han detectado varios aparcamientos cercanos, lo que puede reducir la dificultad.");
  }

  if (signals.urban_morphology.pedestrian_streets_count >= 3) {
    explanation.push("La zona tiene varias calles peatonales o de acceso limitado.");
  }

  if (["high", "very_high"].includes(signals.urban_density.level)) {
    explanation.push("La zona presenta alta densidad urbana.");
  }

  if (Number.isFinite(Number(signals.public_parkings_500m.available_spaces)) && signals.public_parkings_500m.available_spaces > 0) {
    explanation.push("Hay parkings públicos cercanos con plazas disponibles que pueden reducir la dificultad.");
  }

  if (signals.restrictions.zbe || signals.restrictions.resident_only || signals.restrictions.loading_zones_detected) {
    explanation.push("Se han detectado restricciones urbanas que pueden afectar al estacionamiento.");
  }

  if (!overpassOk) {
    explanation.push("No se ha podido usar OpenStreetMap en tiempo real; se devuelve una estimación conservadora.");
  }

  explanation.push("Estimación basada en datos abiertos, cartografía y señales urbanas. Puede variar según hora, día y eventos.");
  return explanation;
}

module.exports = {
  buildParkingExplanation,
  buildParkingSignals,
  confidenceFromSignals,
  densityImpact,
  morphologyImpact,
  parkingSupplyImpact,
  publicParkingImpact,
  restrictionImpact
};
