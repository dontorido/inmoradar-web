const { roundTo } = require("./calculateParkingDifficulty");
const { densityLevelForCity, normalizeCity } = require("./municipalAdapters");

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizePerspective(value) {
  return value === "resident" ? "resident" : "visitor";
}

function regulatedZoneImpact(regulatedZone, perspective = "visitor") {
  if (!regulatedZone?.detected) return 0;

  const type = String(regulatedZone.type || "").toLowerCase();
  const provided = Number(regulatedZone.impact || 0);
  let derived = 2;

  if (/(verde|resident|residente|residentes|green)/.test(type)) {
    derived = perspective === "resident" ? 1 : 3;
  } else if (/(solo|only|exclusive|exclusivo)/.test(type)) {
    derived = perspective === "resident" ? 1 : 4;
  } else if (/(alta|hospital|sanitario|centro|high|rotation)/.test(type)) {
    derived = perspective === "resident" ? 2 : 3.5;
  } else if (/(azul|ora|ota|ser|area|rotaci)/.test(type)) {
    derived = 2;
  }

  if (provided <= 0) return roundTo(clamp(derived, 0, 4), 2);
  if (perspective === "resident" && /(resident|residente|residentes|solo|only)/.test(type)) {
    return roundTo(clamp(Math.min(provided, derived), 0, 4), 2);
  }
  return roundTo(clamp(Math.max(provided, derived), 0, 4), 2);
}

function publicParkingImpact(osm, municipalPublicParkings = {}) {
  const count = Number(osm?.countParkings || 0);
  const capacity = Number(osm?.capacityTotal || 0);
  const available = Number(municipalPublicParkings?.available_spaces);
  let impact = 0;

  if (capacity > 500) impact = -2;
  else if (count === 0) impact = 2;
  else if (count === 1) impact = 1;
  else if (count >= 4) impact = -1;

  if (Number.isFinite(available)) {
    if (available > 80) impact -= 1;
    else if (available > 20) impact -= 0.5;
    else if (available <= 5) impact += 0.5;
  }

  return roundTo(clamp(impact, -2, 2.5), 2);
}

function streetParkingPressureImpact(osm) {
  const spaces = Number(osm?.countParkingSpaces || 0);
  const lanes = Number(osm?.countParkingLaneWays || 0);
  const privateParkings = Number(osm?.countPrivateAccessParkings || 0);
  const paidParkings = Number(osm?.countPaidParkings || 0);
  const parkings = Number(osm?.countParkings || 0);
  let impact = 0;

  if (spaces < 5 && lanes === 0) impact += 1;
  else if (spaces < 20 && lanes <= 1) impact += 0.5;

  if (parkings > 0 && privateParkings >= Math.max(1, Math.ceil(parkings / 2))) impact += 0.5;
  if (parkings > 0 && paidParkings >= Math.max(1, Math.ceil(parkings / 2))) impact += 0.25;

  if (lanes >= 3 || spaces >= 40) impact -= 1;
  else if (lanes >= 1 || spaces >= 20) impact -= 0.5;

  return roundTo(clamp(impact, -1, 1.5), 2);
}

function densityImpact(levelOrOsm, maybeLevel) {
  const osm = typeof levelOrOsm === "object" ? levelOrOsm || {} : {};
  const fallbackLevel = typeof levelOrOsm === "string" ? levelOrOsm : maybeLevel;
  const demand = Number(osm.countDemandAmenities || 0);
  const specialDemand =
    Number(osm.countHospitals || 0) + Number(osm.countSchools || 0) + Number(osm.countMarkets || 0);
  let impact = 0;

  if (demand >= 40) impact += 2;
  else if (demand >= 18) impact += 1;
  else if (demand >= 8) impact += 0.5;

  if (specialDemand > 0) impact += 1;

  if (demand === 0) {
    if (fallbackLevel === "very_high") impact += 1.5;
    else if (fallbackLevel === "high") impact += 1;
    else if (fallbackLevel === "medium") impact += 0.5;
  }

  return roundTo(clamp(impact, 0, 2), 2);
}

function morphologyImpact(osm) {
  let impact = 0;
  if (osm.countPedestrianStreets >= 8) impact += 2;
  else if (osm.countPedestrianStreets >= 3) impact += 1;
  else if (osm.countPedestrianStreets >= 1) impact += 0.5;

  if (osm.countLivingStreets >= 6) impact += 0.75;
  else if (osm.countLivingStreets >= 2) impact += 0.4;

  if (osm.countMainRoads >= 4) impact += 0.25;
  if (osm.countParkingLaneWays >= 3) impact -= 1;
  else if (osm.countParkingLaneWays > 0) impact -= 0.5;

  return roundTo(clamp(impact, -1, 2), 2);
}

function restrictionImpact(restrictions, perspective = "visitor") {
  let impact = 0;
  if (restrictions?.zbe) impact += 1;
  if (restrictions?.resident_only) impact += perspective === "resident" ? 0.5 : 2;
  if (restrictions?.loading_zones_detected) impact += 1;
  return roundTo(clamp(impact, 0, 3), 2);
}

function isBeachOrSeasonalCity(city) {
  const normalized = normalizeCity(city);
  return [
    "alicante",
    "barcelona",
    "cadiz",
    "las palmas de gran canaria",
    "malaga",
    "palma",
    "santander",
    "valencia"
  ].includes(normalized);
}

function timePressureImpact({ osmSummary = {}, city = "", requestedAt = null } = {}) {
  if (!requestedAt) return { applied: false, impact: 0, reason: null };
  const date = new Date(requestedAt);
  if (Number.isNaN(date.getTime())) return { applied: false, impact: 0, reason: null };

  const day = date.getDay();
  const month = date.getMonth() + 1;
  const hour = date.getHours();
  const weekday = day >= 1 && day <= 5;
  const weekend = day === 0 || day === 6;
  let impact = 0;
  const reasons = [];

  if (weekday && hour >= 9 && hour < 18 && (osmSummary.countOffices >= 5 || osmSummary.countSchools > 0)) {
    impact += 1;
    reasons.push("laborable_oficinas");
  }

  if ((weekend || hour >= 20 || hour < 2) && osmSummary.countNightlifeAmenities >= 5) {
    impact += 1;
    reasons.push("ocio_noche_fin_de_semana");
  }

  if (month >= 6 && month <= 9 && isBeachOrSeasonalCity(city)) {
    impact += 1;
    reasons.push("temporada_alta");
  }

  return {
    applied: impact > 0,
    impact: roundTo(clamp(impact, 0, 1), 2),
    reason: reasons.join(",") || null
  };
}

function buildParkingSignals({ osmSummary, municipalSignals, city, perspective = "visitor", requestedAt = null }) {
  const normalizedPerspective = normalizePerspective(perspective);
  const densityLevel = municipalSignals?.densityLevel || densityLevelForCity(city);
  const restrictions = {
    zbe: Boolean(municipalSignals?.restrictions?.zbe),
    resident_only: Boolean(municipalSignals?.restrictions?.resident_only),
    loading_zones_detected: Boolean(municipalSignals?.restrictions?.loading_zones_detected)
  };
  const regulatedImpact = regulatedZoneImpact(municipalSignals?.regulatedZone, normalizedPerspective);
  const publicImpact = publicParkingImpact(osmSummary || {}, municipalSignals?.publicParkings);
  const streetImpact = streetParkingPressureImpact(osmSummary || {});
  const density = densityImpact(osmSummary || {}, densityLevel);
  const morphology = morphologyImpact(osmSummary || {});
  const restrictionScore = restrictionImpact(restrictions, normalizedPerspective);
  const timePressure = timePressureImpact({ osmSummary, city, requestedAt });

  return {
    perspective: normalizedPerspective,
    regulated_zone: {
      detected: Boolean(municipalSignals?.regulatedZone?.detected),
      type: municipalSignals?.regulatedZone?.type || "unknown",
      impact: regulatedImpact,
      source: municipalSignals?.regulatedZone?.source || null
    },
    street_parking_pressure: {
      parking_spaces_count: Number(osmSummary?.countParkingSpaces || 0),
      parking_lane_ways_count: Number(osmSummary?.countParkingLaneWays || 0),
      private_access_parkings_count: Number(osmSummary?.countPrivateAccessParkings || 0),
      paid_parkings_count: Number(osmSummary?.countPaidParkings || 0),
      impact: streetImpact
    },
    public_parking: {
      count: Number(osmSummary?.countParkings || 0),
      capacity_total: osmSummary?.capacityTotal ?? null,
      available_spaces: municipalSignals?.publicParkings?.available_spaces ?? null,
      impact: publicImpact
    },
    osm_parkings_500m: {
      count: Number(osmSummary?.countParkings || 0),
      capacity_total: osmSummary?.capacityTotal ?? null,
      impact: publicImpact
    },
    public_parkings_500m: {
      count: Number(osmSummary?.countParkings || 0),
      capacity_total: osmSummary?.capacityTotal ?? null,
      available_spaces: municipalSignals?.publicParkings?.available_spaces ?? null,
      impact: publicImpact
    },
    urban_density: {
      level: densityLevel,
      amenities_count: Number(osmSummary?.countAmenities || 0),
      demand_amenities_count: Number(osmSummary?.countDemandAmenities || 0),
      offices_count: Number(osmSummary?.countOffices || 0),
      schools_count: Number(osmSummary?.countSchools || 0),
      hospitals_count: Number(osmSummary?.countHospitals || 0),
      markets_count: Number(osmSummary?.countMarkets || 0),
      shops_count: Number(osmSummary?.countShops || 0),
      impact: density
    },
    urban_morphology: {
      pedestrian_streets_count: Number(osmSummary?.countPedestrianStreets || 0),
      living_streets_count: Number(osmSummary?.countLivingStreets || 0),
      main_roads_count: Number(osmSummary?.countMainRoads || 0),
      parking_lane_detected: Number(osmSummary?.countParkingLaneWays || 0) > 0,
      impact: morphology
    },
    restrictions: {
      ...restrictions,
      impact: restrictionScore
    },
    time_pressure: timePressure
  };
}

function confidenceFromSignals({ signals, osmSummary, municipalSignals, usedMock = false, overpassOk = false }) {
  const relevant = Number(osmSummary?.relevantElements || 0);
  const hasOsm = Boolean(overpassOk && relevant >= 3);
  const osmRich = Boolean(overpassOk && relevant >= 12);
  const hasMunicipalData = Boolean(
    municipalSignals?.supported &&
      (municipalSignals?.regulatedZone?.detected ||
        municipalSignals?.restrictions?.zbe ||
        Number(municipalSignals?.publicParkings?.count || 0) > 0 ||
        (municipalSignals?.sources || []).length > 0)
  );
  const hasRealTimeParking = Number.isFinite(Number(signals?.public_parking?.available_spaces));

  let confidence = hasOsm ? (osmRich ? 0.6 : 0.52) : 0.38;
  if (hasOsm && !osmRich) confidence = Math.max(confidence, 0.45);
  if (hasMunicipalData && hasOsm) confidence = Math.max(confidence, 0.72);
  if (hasMunicipalData && osmRich) confidence = Math.max(confidence, 0.78);
  if (hasRealTimeParking && hasMunicipalData && hasOsm) confidence = Math.max(confidence, 0.88);
  if (usedMock) confidence = Math.min(confidence, 0.55);
  if (!overpassOk && !hasMunicipalData) confidence = 0.35;

  return roundTo(clamp(confidence, 0.1, 0.95), 2);
}

function buildParkingExplanation({ signals, overpassOk, perspective = "visitor" }) {
  const explanation = [];
  const perspectiveLabel = normalizePerspective(perspective) === "resident" ? "residente" : "visitante";

  explanation.push(`Resultado calculado desde la perspectiva de ${perspectiveLabel}.`);

  if (signals.regulated_zone.detected) {
    explanation.push("La direcci\u00f3n est\u00e1 dentro de una zona de estacionamiento regulado o con prioridad residencial.");
  }

  if (signals.public_parking.count <= 1) {
    explanation.push("Hay pocos aparcamientos p\u00fablicos detectados en un radio aproximado de 500 m.");
  } else if (signals.public_parking.count >= 4 || Number(signals.public_parking.capacity_total || 0) > 500) {
    explanation.push("Se han detectado varios aparcamientos cercanos, lo que puede reducir la dificultad.");
  }

  if (signals.street_parking_pressure.impact > 0) {
    explanation.push("La se\u00f1al de aparcamiento en superficie es limitada o depende de plazas privadas/de pago.");
  } else if (signals.street_parking_pressure.impact < 0) {
    explanation.push("OpenStreetMap muestra se\u00f1ales de aparcamiento en calle o plazas cercanas.");
  }

  if (signals.urban_morphology.pedestrian_streets_count >= 3) {
    explanation.push("La zona tiene varias calles peatonales o de acceso limitado.");
  }

  if (signals.urban_density.impact >= 1) {
    explanation.push("La densidad de comercios, servicios u oficinas puede aumentar la demanda de estacionamiento.");
  }

  if (signals.restrictions.zbe || signals.restrictions.resident_only || signals.restrictions.loading_zones_detected) {
    explanation.push("Se han detectado restricciones urbanas que pueden afectar al estacionamiento.");
  }

  if (signals.time_pressure.applied) {
    explanation.push("La hora indicada puede aumentar la presi\u00f3n de aparcamiento para esta zona.");
  }

  if (!overpassOk) {
    explanation.push("No se ha podido usar OpenStreetMap en tiempo real; se devuelve una estimaci\u00f3n conservadora.");
  }

  return explanation;
}

module.exports = {
  buildParkingExplanation,
  buildParkingSignals,
  confidenceFromSignals,
  densityImpact,
  morphologyImpact,
  normalizePerspective,
  parkingSupplyImpact: streetParkingPressureImpact,
  publicParkingImpact,
  regulatedZoneImpact,
  restrictionImpact,
  streetParkingPressureImpact,
  timePressureImpact
};
