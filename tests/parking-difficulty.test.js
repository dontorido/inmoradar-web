const test = require("node:test");
const assert = require("node:assert/strict");

const { calculateParkingDifficulty, labelFromParkingScore } = require("../api/_parking/calculateParkingDifficulty");
const {
  clearParkingCache,
  getCachedParkingDifficulty,
  parkingCacheKey,
  setCachedParkingDifficulty
} = require("../api/_parking/cache");
const { buildParkingSignals } = require("../api/_parking/parkingSignals");
const { mockOverpassParkingResponse } = require("../api/_parking/overpassClient");
const { parseOverpassParkingSignals } = require("../api/_parking/parseOverpassParkingSignals");

test("labelFromParkingScore devuelve etiquetas correctas", () => {
  assert.equal(labelFromParkingScore(1), "muy f\u00e1cil");
  assert.equal(labelFromParkingScore(4), "f\u00e1cil");
  assert.equal(labelFromParkingScore(6), "media");
  assert.equal(labelFromParkingScore(8), "dif\u00edcil");
  assert.equal(labelFromParkingScore(10), "muy dif\u00edcil");
});

test("calculateParkingDifficulty baja si hay muchos parkings", () => {
  const signals = buildParkingSignals({
    city: "Logrono",
    osmSummary: {
      countParkings: 8,
      capacityTotal: 700,
      countParkingSpaces: 20,
      countPedestrianStreets: 0,
      countLivingStreets: 0,
      countMainRoads: 1,
      countParkingLaneWays: 4,
      countDemandAmenities: 0,
      countAmenities: 0
    },
    municipalSignals: {
      regulatedZone: { detected: false, type: "unknown", impact: 0, source: null },
      publicParkings: { count: 0, available_spaces: null, impact: 0 },
      restrictions: { zbe: false, resident_only: false, loading_zones_detected: false },
      densityLevel: "medium"
    }
  });
  const result = calculateParkingDifficulty(signals);
  assert.ok(result.score <= 4);
});

test("calculateParkingDifficulty sube con zona regulada, pocos parkings y calles peatonales", () => {
  const signals = buildParkingSignals({
    city: "Madrid",
    osmSummary: {
      countParkings: 0,
      capacityTotal: null,
      countParkingSpaces: 0,
      countPedestrianStreets: 9,
      countLivingStreets: 3,
      countMainRoads: 2,
      countParkingLaneWays: 0,
      countDemandAmenities: 42,
      countAmenities: 42,
      countSchools: 1
    },
    municipalSignals: {
      regulatedZone: { detected: true, type: "SER alta rotacion", impact: 4, source: "municipal_open_data" },
      publicParkings: { count: 0, available_spaces: null, impact: 0 },
      restrictions: { zbe: true, resident_only: true, loading_zones_detected: false },
      densityLevel: "very_high"
    }
  });
  const result = calculateParkingDifficulty(signals);
  assert.ok(result.score >= 9);
  assert.equal(result.label, "muy dif\u00edcil");
});

test("parseOverpassParkingSignals resume respuesta Overpass mock", () => {
  const summary = parseOverpassParkingSignals(mockOverpassParkingResponse());
  assert.equal(summary.countParkings, 1);
  assert.equal(summary.capacityTotal, 40);
  assert.equal(summary.countPedestrianStreets, 2);
  assert.equal(summary.countLivingStreets, 1);
  assert.equal(summary.countPaidParkings, 1);
  assert.equal(summary.countParkingLaneWays, 1);
  assert.equal(summary.countDemandAmenities, 4);
  assert.equal(summary.countOffices, 1);
  assert.equal(summary.countSchools, 1);
});

test("perspectiva residente reduce impacto de zonas solo residentes", () => {
  const base = {
    city: "Madrid",
    osmSummary: {
      countParkings: 2,
      capacityTotal: null,
      countParkingSpaces: 20,
      countPedestrianStreets: 0,
      countLivingStreets: 0,
      countMainRoads: 0,
      countParkingLaneWays: 0,
      countDemandAmenities: 0
    },
    municipalSignals: {
      regulatedZone: { detected: true, type: "solo residentes", impact: 4, source: "municipal_open_data" },
      publicParkings: { count: 0, available_spaces: null, impact: 0 },
      restrictions: { zbe: true, resident_only: true, loading_zones_detected: false },
      densityLevel: "low"
    }
  };
  const visitor = calculateParkingDifficulty(buildParkingSignals({ ...base, perspective: "visitor" }));
  const resident = calculateParkingDifficulty(buildParkingSignals({ ...base, perspective: "resident" }));
  assert.ok(visitor.score > resident.score);
});

test("parseOverpassParkingSignals detecta densidad urbana por amenities", () => {
  const summary = parseOverpassParkingSignals({
    elements: [
      { type: "node", id: 1, tags: { amenity: "hospital" } },
      { type: "node", id: 2, tags: { amenity: "restaurant" } },
      { type: "node", id: 3, tags: { shop: "bakery" } },
      { type: "node", id: 4, tags: { office: "company" } }
    ]
  });
  assert.equal(summary.countDemandAmenities, 4);
  assert.equal(summary.countHospitals, 1);
  assert.equal(summary.countShops, 1);
  assert.equal(summary.countOffices, 1);
});

test("cache devuelve miss, hit y expira", () => {
  clearParkingCache();
  const key = parkingCacheKey({ lat: 40.356, lng: -3.52, city: "Rivas", radiusM: 500, perspective: "visitor" });
  const residentKey = parkingCacheKey({
    lat: 40.356,
    lng: -3.52,
    city: "Rivas",
    radiusM: 500,
    perspective: "resident"
  });
  assert.notEqual(key, residentKey);
  assert.equal(getCachedParkingDifficulty(key), null);
  setCachedParkingDifficulty(key, { ok: true, score: 5 }, 1000);
  assert.equal(getCachedParkingDifficulty(key).score, 5);
  setCachedParkingDifficulty(key, { ok: true, score: 6 }, -1);
  assert.equal(getCachedParkingDifficulty(key), null);
});
