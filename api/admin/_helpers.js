const { readRawBody } = require("../_utils");

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return req.body ? JSON.parse(req.body) : {};
  const raw = await readRawBody(req);
  if (!raw) return {};
  return JSON.parse(raw);
}

function clampLimit(value, fallback = 50, max = 100) {
  const parsed = Number.parseInt(String(value || fallback), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, parsed));
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = String(row[key] || "unknown");
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function normalizeSlug(slug) {
  return String(slug || "").trim().replace(/^\/+|\/+$/g, "");
}

module.exports = {
  clampLimit,
  countBy,
  normalizeSlug,
  readJsonBody
};
