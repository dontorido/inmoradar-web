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
        name: "Datos Madrid - ocupación de aparcamientos rotacionales",
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

function madridSerAdapter({ city } = {}) {
  if (normalizeCity(city) !== "madrid") return null;
  return {
    adapter: "madrid_ser",
    status: "prepared_without_geometry_match",
    regulatedZone: {
      detected: false,
      type: "SER",
      impact: 0,
      source: "municipal_open_data_pending_geometry"
    },
    restrictions: {
      zbe: true,
      resident_only: false,
      loading_zones_detected: false
    },
    publicParkings: {
      count: 0,
      available_spaces: null
    },
    sources: [
      {
        name: "Madrid Open Data - SER",
        url: "https://datos.madrid.es/",
        type: "municipal_open_data"
      }
    ]
  };
}

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
  const madridSignals = madridSerAdapter({ city });
  const regulatedZone = madridSignals?.regulatedZone || {
    detected: false,
    type: config?.regulatedType || "unknown",
    impact: 0,
    source: null
  };
  const restrictions = {
    zbe: Boolean(madridSignals?.restrictions?.zbe || config?.zbe),
    resident_only: Boolean(madridSignals?.restrictions?.resident_only),
    loading_zones_detected: Boolean(madridSignals?.restrictions?.loading_zones_detected)
  };
  const publicParkings = madridSignals?.publicParkings || {
    count: 0,
    available_spaces: null,
    impact: 0
  };
  const sources = [...(config?.sources || []), ...(madridSignals?.sources || [])];

  return {
    city: normalized || null,
    supported: Boolean(config),
    adapter_status: madridSignals?.status || (config ? "city_config_only" : "not_supported"),
    regulatedZone,
    restrictions,
    publicParkings,
    densityLevel: config?.densityLevel || densityLevelForCity(city),
    sources
  };
}

module.exports = {
  densityLevelForCity,
  getMunicipalParkingSignals,
  madridSerAdapter,
  normalizeCity
};
