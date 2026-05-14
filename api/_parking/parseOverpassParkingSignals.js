function asNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number.parseInt(String(value).replace(/[^\d]/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasAnyTag(tags, keys) {
  return keys.some((key) => tags[key] !== undefined && tags[key] !== null && tags[key] !== "");
}

function isParkingLane(tags) {
  const laneValues = [
    tags.parking,
    tags["parking:left"],
    tags["parking:right"],
    tags["parking:both"],
    tags["parking:lane"],
    tags["parking:lane:left"],
    tags["parking:lane:right"],
    tags["parking:lane:both"]
  ].map((value) => String(value || "").toLowerCase());

  return laneValues.some((value) =>
    ["lane", "street_side", "marked", "parallel", "diagonal", "perpendicular", "on_street"].includes(value)
  );
}

function parseOverpassParkingSignals(payload) {
  const elements = Array.isArray(payload?.elements) ? payload.elements : [];
  const summary = {
    countParkings: 0,
    capacityTotal: null,
    countParkingSpaces: 0,
    countPedestrianStreets: 0,
    countLivingStreets: 0,
    countPrivateAccessParkings: 0,
    countPaidParkings: 0,
    countParkingLaneWays: 0,
    countMainRoads: 0,
    relevantElements: 0
  };

  let capacityTotal = 0;
  let hasCapacity = false;

  for (const element of elements) {
    const tags = element?.tags || {};
    const amenity = String(tags.amenity || "").toLowerCase();
    const highway = String(tags.highway || "").toLowerCase();
    const access = String(tags.access || "").toLowerCase();
    const fee = String(tags.fee || "").toLowerCase();

    if (amenity === "parking") {
      summary.countParkings += 1;
      summary.relevantElements += 1;
    }

    if (amenity === "parking_space") {
      summary.countParkingSpaces += 1;
      summary.relevantElements += 1;
    }

    const capacity = asNumber(tags.capacity);
    if ((amenity === "parking" || amenity === "parking_space") && capacity !== null) {
      hasCapacity = true;
      capacityTotal += capacity;
    }

    if (amenity === "parking" && ["private", "customers", "residents", "permit"].includes(access)) {
      summary.countPrivateAccessParkings += 1;
    }

    if (amenity === "parking" && ["yes", "1", "true"].includes(fee)) {
      summary.countPaidParkings += 1;
    }

    if (highway === "pedestrian") {
      summary.countPedestrianStreets += 1;
      summary.relevantElements += 1;
    }

    if (highway === "living_street") {
      summary.countLivingStreets += 1;
      summary.relevantElements += 1;
    }

    if (["primary", "secondary", "tertiary", "trunk"].includes(highway)) {
      summary.countMainRoads += 1;
      summary.relevantElements += 1;
    }

    if (isParkingLane(tags) || hasAnyTag(tags, ["parking:left", "parking:right", "parking:both"])) {
      summary.countParkingLaneWays += 1;
      summary.relevantElements += 1;
    }
  }

  summary.capacityTotal = hasCapacity ? capacityTotal : null;
  return summary;
}

module.exports = {
  parseOverpassParkingSignals
};
