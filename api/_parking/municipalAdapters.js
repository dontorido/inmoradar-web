function normalizeCity(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const SUPPORTED_CITY_CONFIG = {
  madrid: {
    regulatedType: "SER",
    zbe: true,
    densityLevel: "very_high",
    sources: [
      {
        name: "Datos Madrid - SER calles, plazas y parquimetros",
        url: "https://datos.madrid.es/",
        type: "municipal_open_data"
      },
      {
        name: "Datos Madrid - ocupacion de aparcamientos rotacionales",
        url: "https://datos.madrid.es/",
        type: "municipal_open_data"
      }
    ]
  },
  barcelona: {
    regulatedType: "AREA",
    zbe: true,
    densityLevel: "very_high",
    sources: [
      {
        name: "Open Data Barcelona - aparcamiento regulado AREA",
        url: "https://opendata-ajuntament.barcelona.cat/",
        type: "municipal_open_data"
      }
    ]
  },
  pamplona: {
    regulatedType: "ORA",
    zbe: false,
    densityLevel: "high",
    sources: []
  },
  "pamplona iruna": {
    regulatedType: "ORA",
    zbe: false,
    densityLevel: "high",
    sources: []
  },
  bilbao: {
    regulatedType: "OTA",
    zbe: false,
    densityLevel: "high",
    sources: []
  }
};

function densityLevelForCity(city) {
  const normalized = normalizeCity(city);
  if (!normalized) return "medium";
  const config = SUPPORTED_CITY_CONFIG[normalized];
  if (config?.densityLevel) return config.densityLevel;
  if (["valencia", "sevilla", "zaragoza", "malaga", "alicante"].includes(normalized)) return "high";
  if (["madrid", "barcelona"].includes(normalized)) return "very_high";
  return "medium";
}

async function getMunicipalParkingSignals({ city } = {}) {
  const normalized = normalizeCity(city);
  const config = SUPPORTED_CITY_CONFIG[normalized] || null;

  return {
    city: normalized || null,
    supported: Boolean(config),
    regulatedZone: {
      detected: false,
      type: config?.regulatedType || "unknown",
      impact: 0,
      source: null
    },
    restrictions: {
      zbe: Boolean(config?.zbe),
      resident_only: false,
      loading_zones_detected: false,
      impact: config?.zbe ? 1 : 0
    },
    publicParkings: {
      count: 0,
      available_spaces: null,
      impact: 0
    },
    densityLevel: config?.densityLevel || densityLevelForCity(city),
    sources: config?.sources || []
  };
}

module.exports = {
  densityLevelForCity,
  getMunicipalParkingSignals,
  normalizeCity
};
