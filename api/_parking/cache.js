const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const memoryCache = new Map();
const GEOHASH_BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

function coordinateKey(value) {
  return Number(value).toFixed(4);
}

function parkingGeohash({ lat, lng }, precision = 7) {
  let evenBit = true;
  let bit = 0;
  let ch = 0;
  let geohash = "";
  let latMin = -90;
  let latMax = 90;
  let lngMin = -180;
  let lngMax = 180;
  const latitude = Number(lat);
  const longitude = Number(lng);

  while (geohash.length < precision) {
    if (evenBit) {
      const mid = (lngMin + lngMax) / 2;
      if (longitude >= mid) {
        ch = (ch << 1) + 1;
        lngMin = mid;
      } else {
        ch = (ch << 1) + 0;
        lngMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (latitude >= mid) {
        ch = (ch << 1) + 1;
        latMin = mid;
      } else {
        ch = (ch << 1) + 0;
        latMax = mid;
      }
    }

    evenBit = !evenBit;
    if (++bit === 5) {
      geohash += GEOHASH_BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }

  return geohash;
}

function parkingCacheKey({ lat, lng, city = "", radiusM = 500, perspective = "visitor" }) {
  return [
    "parking",
    parkingGeohash({ lat, lng }),
    coordinateKey(lat),
    coordinateKey(lng),
    String(radiusM),
    String(city || "").trim().toLowerCase(),
    String(perspective || "visitor").trim().toLowerCase()
  ].join(":");
}

function getCachedParkingDifficulty(key) {
  const item = memoryCache.get(key);
  if (!item) return null;
  if (item.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  return {
    ...item.value,
    cache: {
      hit: true,
      key,
      expires_at: new Date(item.expiresAt).toISOString()
    }
  };
}

function setCachedParkingDifficulty(key, value, ttlMs = DEFAULT_TTL_MS) {
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs
  });
}

function clearParkingCache() {
  memoryCache.clear();
}

module.exports = {
  DEFAULT_TTL_MS,
  clearParkingCache,
  getCachedParkingDifficulty,
  parkingCacheKey,
  parkingGeohash,
  setCachedParkingDifficulty
};
