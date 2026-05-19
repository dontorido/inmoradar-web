const { hasSupabaseConfig, supabaseFetch } = require("../_utils");

const MADRID_RESIDENT_PARKINGS = [
  {
    name: "Aparcamiento para residentes Arroyo del Olivar",
    address: "Calle Arroyo del Olivar 108, Madrid",
    street: "Calle Arroyo del Olivar",
    municipality: "Madrid",
    district: "Puente de Vallecas",
    neighbourhood: "Palomeras Bajas",
    lat: 40.390072718009264,
    lng: -3.65720992196733,
    spaces: 214,
    opening_hours: "24h",
    ownership: "Ayuntamiento de Madrid",
    type: "resident_parking",
    availability: "unknown",
    source: "madrid_city_council",
    source_url: "https://www.madrid.es/portales/munimadrid/es/Inicio/Movilidad-y-transportes/Aparcamientos/"
  }
];

const DISCLAIMER =
  "Estimación orientativa. La dificultad real puede variar según portal, horario, permisos de residente y disponibilidad puntual.";

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ñ/g, "n")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function truthy(value) {
  const normalized = normalizeText(value);
  if (["true", "1", "si", "yes", "incluida", "incluido", "garaje", "parking"].includes(normalized)) return true;
  if (["false", "0", "no", "null", "undefined", "desconocido", ""].includes(normalized)) return false;
  return /garaje|aparcamiento|parking/.test(normalized) && !/sin garaje|no incluido/.test(normalized);
}

function nullableBool(value) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = normalizeText(value);
  if (["true", "1", "si", "yes"].includes(normalized)) return true;
  if (["false", "0", "no"].includes(normalized)) return false;
  return truthy(value);
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundTo(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function confidenceLabel(score) {
  if (score >= 0.72) return "alta";
  if (score >= 0.56) return "media";
  if (score >= 0.4) return "media-baja";
  return "baja";
}

function overallLabel(score) {
  if (score <= 2) return "muy bajo";
  if (score <= 4) return "bajo";
  if (score <= 6) return "medio";
  if (score <= 8) return "media-alta";
  return "alta";
}

function streetLike(params = {}) {
  return normalizeText(`${params.address || ""} ${params.street || ""}`);
}

function hasExactLocation(params = {}) {
  if (numberOrNull(params.lat) !== null && numberOrNull(params.lng) !== null) return true;
  return Boolean(String(params.street_number || "").trim() && String(params.street || params.address || "").trim());
}

function detectGoodPublicTransport(params = {}) {
  const haystack = normalizeText(
    `${params.public_transport || ""} ${params.transport || ""} ${params.description || ""} ${params.zone || ""} ${params.district || ""}`
  );
  if (/metro|tren|cercanias|bus|autobus|transporte publico/.test(haystack)) return true;
  if (normalizeText(params.municipality) === "madrid" && /portazgo|puente de vallecas/.test(haystack)) return true;
  return null;
}

function residentParkingsFor(params = {}) {
  const municipality = normalizeText(params.municipality);
  const district = normalizeText(params.district);
  const street = streetLike(params);

  if (municipality !== "madrid") return [];

  return MADRID_RESIDENT_PARKINGS.filter((item) => {
    const itemStreet = normalizeText(item.street);
    const itemDistrict = normalizeText(item.district);
    if (street && (street.includes("arroyo del olivar") || itemStreet.includes(street) || street.includes(itemStreet))) {
      return true;
    }
    return district && itemDistrict === district && /arroyo del olivar/.test(street);
  }).map((item) => ({
    name: item.name,
    address: item.address,
    spaces: item.spaces,
    opening_hours: item.opening_hours,
    ownership: item.ownership,
    type: item.type,
    distance_m: null,
    distance_confidence: hasExactLocation(params) ? "approximate" : "unknown_without_exact_location",
    availability: item.availability,
    source: item.source,
    source_url: item.source_url
  }));
}

function streetParkingAssessment(params = {}) {
  const municipality = normalizeText(params.municipality);
  const district = normalizeText(params.district);
  const zone = normalizeText(params.zone || params.zone_name || params.neighbourhood);
  const exact = hasExactLocation(params);
  let difficulty = 5.8;
  const signals = [];

  if (municipality === "madrid") {
    difficulty += 0.7;
    signals.push("Ciudad con presión estructural de aparcamiento");
  }
  if (/puente de vallecas/.test(district) || /portazgo/.test(zone)) {
    difficulty += 1.1;
    signals.push("Zona residencial densa");
    signals.push("Calle urbana consolidada");
  }
  if (!exact) {
    difficulty += 0.25;
    signals.push("Ubicación exacta no publicada");
  }

  difficulty = roundTo(clamp(difficulty, 1, 10), 1);

  return {
    difficulty_score: difficulty,
    label: difficulty >= 8 ? "probablemente muy difícil" : difficulty >= 6 ? "probablemente difícil" : difficulty >= 4 ? "media" : "favorable",
    regulated_zone: {
      detected: exact ? null : null,
      type: null,
      reason: exact
        ? "Pendiente de cruce con zona SER/ORA por coordenada."
        : "No se puede confirmar sin coordenada o portal exacto."
    },
    signals
  };
}

function garageAssessment(params = {}) {
  const included = nullableBool(params.garage_included ?? params.parking_included ?? params.has_parking);
  const optional = nullableBool(params.parking_optional);
  const price = numberOrNull(params.parking_price);

  return {
    included_detected: included === true,
    optional_detected: optional === true,
    price,
    message:
      included === true
        ? "El anuncio indica plaza de garaje incluida o aparcamiento disponible."
        : optional === true
          ? "El anuncio sugiere plaza opcional; conviene confirmar precio y disponibilidad."
          : "El anuncio no muestra plaza de garaje incluida."
  };
}

function buildOverallScore({ profile, garage, streetParking, residentParking, paidParking, transportOffset }) {
  const streetRisk = Number(streetParking.difficulty_score || 6);
  const noGarageRisk = garage.included_detected ? 0.5 : garage.optional_detected ? 4.5 : 8;
  const paidRisk = paidParking.source === "not_available" ? 6.2 : 4.8;
  const residentRisk = residentParking.nearby_detected ? 4.8 : 7;
  const transportRisk = transportOffset.has_good_public_transport ? 4.8 : 6.2;
  const weights =
    profile === "car_owner"
      ? { street: 0.45, garage: 0.2, paid: 0.15, resident: 0.1, transport: 0.1 }
      : { street: 0.35, garage: 0.15, paid: 0.15, resident: 0.1, transport: 0.25 };

  let score =
    streetRisk * weights.street +
    noGarageRisk * weights.garage +
    paidRisk * weights.paid +
    residentRisk * weights.resident +
    transportRisk * weights.transport;

  if (garage.included_detected) score -= profile === "car_owner" ? 1.4 : 1.1;
  return roundTo(clamp(score, 1, 10), 1);
}

function buildResidentParking(params = {}) {
  const items = residentParkingsFor(params);
  return {
    nearby_detected: items.length > 0,
    items,
    message: items.length
      ? "Existe aparcamiento municipal de residentes en la misma calle, pero no se puede confirmar disponibilidad ni derecho de uso para este inmueble."
      : "No se ha confirmado infraestructura municipal de residentes cercana con los datos disponibles."
  };
}

function buildPaidParking() {
  return {
    nearby_count: null,
    nearest_distance_m: null,
    price_2h: null,
    price_day: null,
    source: "not_available",
    message: "No se ha confirmado información de parkings de rotación o precios cercanos."
  };
}

function buildTransportOffset(params = {}) {
  const detected = detectGoodPublicTransport(params);
  return {
    has_good_public_transport: detected === true,
    message:
      detected === true
        ? "La cercanía a transporte público puede reducir la dependencia del coche."
        : "No se ha podido confirmar una alternativa de transporte público suficientemente fuerte."
  };
}

function buildRecommendations({ residentParking, garage, streetParking }) {
  const recommendations = [
    "Preguntar si existe plaza de garaje disponible en el edificio o en la zona.",
    "Comprobar si la dirección exacta está dentro de zona SER.",
    "Visitar la zona en horario nocturno y laborable para comprobar presión real de aparcamiento."
  ];
  if (residentParking.nearby_detected) {
    recommendations.splice(2, 0, "Revisar disponibilidad de plaza en aparcamientos de residentes cercanos.");
  }
  if (garage.included_detected) {
    recommendations.unshift("Confirmar que la plaza de garaje está incluida en el precio y vinculada a la vivienda.");
  }
  if (streetParking.regulated_zone.detected === null) {
    recommendations.push("Sin portal exacto, validar manualmente si aplica SER/ORA/OTA.");
  }
  return [...new Set(recommendations)];
}

function buildSources(residentParking) {
  const sources = [];
  if (residentParking.nearby_detected) {
    sources.push({
      name: "Madrid City Council",
      type: "resident_parking",
      url: MADRID_RESIDENT_PARKINGS[0].source_url
    });
  }
  sources.push({
    name: "Madrid SER Geoportal",
    type: "regulated_parking_dataset",
    url: "https://geoportal.madrid.es/IDEAM_WBGEOPORTAL/"
  });
  return sources;
}

function buildOverallMessage({ garage, residentParking, streetParking, transportOffset, exactLocation }) {
  if (residentParking.nearby_detected) {
    return [
      garage.message,
      "La vivienda se ubica en una zona residencial consolidada y densa.",
      residentParking.message,
      exactLocation ? "La ubicación permite una lectura más concreta, aunque la disponibilidad debe verificarse." : "Sin portal exacto no podemos confirmar zona SER ni distancia exacta a parkings.",
      transportOffset.has_good_public_transport ? "La alternativa de transporte público reduce dependencia del coche." : "",
      "Si dependes del coche, conviene revisar este punto antes de avanzar."
    ]
      .filter(Boolean)
      .join(" ");
  }

  return `${garage.message} ${streetParking.label}. Si dependes del coche, conviene revisar garaje, zona regulada y disponibilidad real antes de avanzar.`;
}

function calculateParkingAssessment(params = {}) {
  const hasLocation = Boolean(params.municipality || params.district || params.zone || params.address || params.street || params.lat || params.lng);
  if (!hasLocation) {
    return {
      ok: false,
      reason: "missing_location",
      message: "No hay ubicación suficiente para valorar aparcamiento."
    };
  }

  const profile = ["visitor", "resident", "car_owner", "general"].includes(String(params.profile || "general"))
    ? String(params.profile || "general")
    : "general";
  const exactLocation = hasExactLocation(params);
  const garage = garageAssessment(params);
  const streetParking = streetParkingAssessment(params);
  const residentParking = buildResidentParking(params);
  const paidParking = buildPaidParking(params);
  const transportOffset = buildTransportOffset(params);
  const confidenceScore = roundTo(
    clamp(
      (exactLocation ? 0.64 : 0.48) +
        (residentParking.nearby_detected ? 0.03 : 0) +
        (normalizeText(params.municipality) === "madrid" ? 0.02 : 0),
      0.25,
      0.82
    ),
    2
  );
  const overallScore = buildOverallScore({
    profile,
    garage,
    streetParking,
    residentParking,
    paidParking,
    transportOffset
  });

  const parkingAssessment = {
    overall_score: overallScore,
    overall_label: overallLabel(overallScore),
    overall_message: buildOverallMessage({
      garage,
      residentParking,
      streetParking,
      transportOffset,
      exactLocation
    }),
    confidence_score: confidenceScore,
    confidence_label: confidenceLabel(confidenceScore),
    exact_location: exactLocation
  };

  return {
    ok: true,
    partial: !exactLocation,
    parking_assessment: parkingAssessment,
    garage,
    street_parking: streetParking,
    resident_parking: residentParking,
    paid_parking: paidParking,
    transport_offset: transportOffset,
    recommendations: buildRecommendations({ residentParking, garage, streetParking }),
    sources: buildSources(residentParking),
    raw_signals: {
      profile,
      normalized_location: {
        street: params.street || null,
        address: params.address || null,
        street_number: params.street_number || null,
        zone: params.zone || params.zone_name || params.neighbourhood || null,
        district: params.district || null,
        municipality: params.municipality || null,
        province: params.province || null
      }
    },
    disclaimer: DISCLAIMER
  };
}

async function persistParkingAssessment(params = {}, result = {}) {
  if (!result?.ok || !hasSupabaseConfig()) return { attempted: false };
  if (!params.persist && !params.saved_listing_id) return { attempted: false };

  const payload = {
    saved_listing_id: numberOrNull(params.saved_listing_id),
    source_url: params.source_url || null,
    address_text: params.address || null,
    street: params.street || null,
    street_number: params.street_number || null,
    zone_name: params.zone || params.zone_name || params.neighbourhood || null,
    district: params.district || null,
    municipality: params.municipality || null,
    province: params.province || null,
    lat: numberOrNull(params.lat),
    lng: numberOrNull(params.lng),
    exact_location: result.parking_assessment.exact_location,
    profile: params.profile || "general",
    overall_score: result.parking_assessment.overall_score,
    overall_label: result.parking_assessment.overall_label,
    overall_message: result.parking_assessment.overall_message,
    confidence_score: result.parking_assessment.confidence_score,
    confidence_label: result.parking_assessment.confidence_label,
    garage_json: result.garage,
    street_parking_json: result.street_parking,
    resident_parking_json: result.resident_parking,
    paid_parking_json: result.paid_parking,
    transport_offset_json: result.transport_offset,
    recommendations_json: result.recommendations,
    sources_json: result.sources,
    raw_signals_json: result.raw_signals,
    status: result.partial ? "partial" : "completed",
    last_checked_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  try {
    await supabaseFetch("parking_assessments", {
      method: "POST",
      headers: { prefer: "return=minimal" },
      body: JSON.stringify(payload),
      timeoutMs: 3000
    });
    return { attempted: true, ok: true };
  } catch (error) {
    console.warn("[parking-intelligence] persist failed", error.message);
    return { attempted: true, ok: false, error: error.message };
  }
}

async function parkingAssessmentPayload(params = {}) {
  const body = calculateParkingAssessment(params);
  const storage = await persistParkingAssessment(params, body);
  if (body.ok) body.storage = storage;
  return {
    status: body.ok ? 200 : 400,
    body
  };
}

module.exports = {
  MADRID_RESIDENT_PARKINGS,
  calculateParkingAssessment,
  parkingAssessmentPayload,
  residentParkingsFor
};
