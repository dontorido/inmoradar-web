(function () {
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
    const map = {};
    parts.forEach((part) => {
      if (part.type !== "literal") map[part.type] = part.value;
    });
    return {
      year: map.year,
      month: map.month,
      day: map.day,
      hour: map.hour === "24" ? "00" : map.hour,
      minute: map.minute
    };
  }

  function formatMadridDate(value, fallback) {
    const parts = madridParts(value);
    return parts ? `${parts.year}-${parts.month}-${parts.day}` : (fallback || "-");
  }

  function formatMadridTime(value, fallback) {
    const parts = madridParts(value);
    return parts ? `${parts.hour}:${parts.minute}` : (fallback || "-");
  }

  function formatMadridDateTime(value, fallback) {
    const parts = madridParts(value);
    return parts ? `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}` : (fallback || "-");
  }

  window.InmoRadarDateTime = {
    timeZone: MADRID_TIME_ZONE,
    formatMadridDate,
    formatMadridDateTime,
    formatMadridTime
  };

  window.formatDate = formatMadridDateTime;
  window.formatCompactDate = formatMadridDateTime;
})();
