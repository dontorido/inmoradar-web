const DEFAULT_OVERPASS_URL = "https://overpass-api.de/api/interpreter";

function buildOverpassParkingQuery({ lat, lng, radiusM = 500 }) {
  const latValue = Number(lat);
  const lngValue = Number(lng);
  const radius = Math.max(100, Math.min(1500, Number(radiusM) || 500));
  const streetRadius = Math.min(300, radius);

  return `[out:json][timeout:25];
(
  node["amenity"="parking"](around:${radius},${latValue},${lngValue});
  way["amenity"="parking"](around:${radius},${latValue},${lngValue});
  relation["amenity"="parking"](around:${radius},${latValue},${lngValue});
  node["amenity"="parking_space"](around:${streetRadius},${latValue},${lngValue});
  way["amenity"="parking_space"](around:${streetRadius},${latValue},${lngValue});
  way["parking"="lane"](around:${streetRadius},${latValue},${lngValue});
  way["parking:left"](around:${streetRadius},${latValue},${lngValue});
  way["parking:right"](around:${streetRadius},${latValue},${lngValue});
  way["parking:both"](around:${streetRadius},${latValue},${lngValue});
  way["highway"="pedestrian"](around:${streetRadius},${latValue},${lngValue});
  way["highway"="living_street"](around:${streetRadius},${latValue},${lngValue});
  way["highway"~"^(primary|secondary|tertiary|trunk)$"](around:${streetRadius},${latValue},${lngValue});
);
out center tags;`;
}

async function fetchOverpassParking({ lat, lng, radiusM = 500, timeoutMs = 9000, endpoint } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const url = endpoint || process.env.OVERPASS_URL || DEFAULT_OVERPASS_URL;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded; charset=utf-8",
        accept: "application/json"
      },
      body: new URLSearchParams({ data: buildOverpassParkingQuery({ lat, lng, radiusM }) }).toString(),
      signal: controller.signal
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`overpass_http_${response.status}${text ? `: ${text.slice(0, 140)}` : ""}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function mockOverpassParkingResponse() {
  return {
    version: 0.6,
    generator: "InmoRadar mock",
    elements: [
      { type: "way", id: 1, tags: { highway: "pedestrian", name: "Calle peatonal A" } },
      { type: "way", id: 2, tags: { highway: "pedestrian", name: "Calle peatonal B" } },
      { type: "way", id: 3, tags: { highway: "living_street" } },
      { type: "way", id: 4, tags: { highway: "primary" } },
      { type: "node", id: 5, tags: { amenity: "parking", capacity: "40", fee: "yes" } },
      { type: "way", id: 6, tags: { "parking:right": "lane" } }
    ]
  };
}

module.exports = {
  buildOverpassParkingQuery,
  fetchOverpassParking,
  mockOverpassParkingResponse
};
