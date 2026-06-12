const MADRID_TIME_ZONE = "Europe/Madrid";

function madridParts(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: MADRID_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const map = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const hour = map.hour === "24" ? "00" : map.hour;
  return { year: map.year, month: map.month, day: map.day, hour, minute: map.minute };
}

function formatMadridDate(value, fallback = "No disponible") {
  const parts = madridParts(value);
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : fallback;
}

function formatMadridTime(value, fallback = "No disponible") {
  const parts = madridParts(value);
  return parts ? `${parts.hour}:${parts.minute}` : fallback;
}

function formatMadridDateTime(value, fallback = "No disponible") {
  const parts = madridParts(value);
  return parts ? `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}` : fallback;
}

module.exports = { MADRID_TIME_ZONE, formatMadridDate, formatMadridDateTime, formatMadridTime };
