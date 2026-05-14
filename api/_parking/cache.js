const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const memoryCache = new Map();

function coordinateKey(value) {
  return Number(value).toFixed(4);
}

function parkingCacheKey({ lat, lng, city = "", radiusM = 500 }) {
  return [
    "parking",
    coordinateKey(lat),
    coordinateKey(lng),
    String(radiusM),
    String(city || "").trim().toLowerCase()
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
  setCachedParkingDifficulty
};
