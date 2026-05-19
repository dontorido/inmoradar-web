const MONTH_LABELS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const REVENUE_EVENT_PATTERN =
  /^(order_created|subscription_payment_success|subscription_payment_recovered|subscription_invoice_paid|subscription_renewed|invoice_paid|payment_success|payment_recovered)$/i;

const AMOUNT_PATHS = [
  "total",
  "amount_total",
  "amount_cents",
  "total_cents",
  "subtotal",
  "subtotal_cents",
  "first_subscription_item.price"
];

function getPath(source, path) {
  return String(path)
    .split(".")
    .reduce((acc, key) => (acc && Object.prototype.hasOwnProperty.call(acc, key) ? acc[key] : undefined), source);
}

function parseAmountCents(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return null;
    return Number.isInteger(value) ? value : Math.round(value * 100);
  }
  const normalized = String(value).trim().replace(/\s/g, "").replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return normalized.includes(".") ? Math.round(parsed * 100) : Math.round(parsed);
}

function extractAmountCents(attributes = {}) {
  for (const path of AMOUNT_PATHS) {
    const cents = parseAmountCents(getPath(attributes, path));
    if (cents) return cents;
  }
  return null;
}

function normalizeCurrency(value) {
  const currency = String(value || "EUR").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : "EUR";
}

function normalizeDate(value, fallback = new Date().toISOString()) {
  const date = new Date(value || fallback);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function isRevenueEventName(eventName) {
  return REVENUE_EVENT_PATTERN.test(String(eventName || ""));
}

function buildRevenueEventFromLemonPayload(payload = {}, eventName = "unknown") {
  if (!isRevenueEventName(eventName)) return null;

  const data = payload.data || {};
  const attributes = data.attributes || {};
  const dataType = String(data.type || "");
  const amountCents = extractAmountCents(attributes);
  if (!amountCents) return null;

  const occurredAt = normalizeDate(
    attributes.created_at || attributes.updated_at || attributes.renews_at || payload.meta?.created_at
  );
  const eventIdParts = [
    "lemonsqueezy",
    eventName,
    data.type,
    data.id,
    attributes.order_id,
    attributes.subscription_id,
    attributes.invoice_number,
    occurredAt
  ].filter(Boolean);

  return {
    provider: "lemonsqueezy",
    provider_event_id: eventIdParts.join(":").slice(0, 220),
    provider_customer_id: attributes.customer_id ? String(attributes.customer_id) : null,
    provider_subscription_id: attributes.subscription_id
      ? String(attributes.subscription_id)
      : data.id && dataType.includes("subscription")
        ? String(data.id)
        : null,
    provider_order_id: attributes.order_id ? String(attributes.order_id) : null,
    event_name: String(eventName || "unknown"),
    amount_cents: amountCents,
    currency: normalizeCurrency(attributes.currency || attributes.currency_code),
    occurred_at: occurredAt,
    raw_event: payload
  };
}

function monthKey(date) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key) {
  const [year, month] = String(key || "").split("-").map(Number);
  if (!year || !month) return key || "";
  return `${MONTH_LABELS_ES[month - 1]} ${String(year).slice(-2)}`;
}

function lastMonthKeys(months = 12, now = new Date()) {
  const current = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return Array.from({ length: months }, (_, index) => {
    const date = new Date(current);
    date.setUTCMonth(current.getUTCMonth() - (months - 1 - index));
    return monthKey(date);
  });
}

function summarizeMonthlyRevenue(rows = [], options = {}) {
  const keys = lastMonthKeys(options.months || 12, options.now || new Date());
  const buckets = new Map(
    keys.map((key) => [
      key,
      {
        key,
        label: monthLabel(key),
        revenue_cents: 0,
        payments: 0
      }
    ])
  );
  const currencyCounts = {};

  rows.forEach((row) => {
    const key = monthKey(row.occurred_at || row.created_at);
    if (!buckets.has(key)) return;
    const amount = parseAmountCents(row.amount_cents);
    if (!amount) return;
    const currency = normalizeCurrency(row.currency);
    currencyCounts[currency] = (currencyCounts[currency] || 0) + 1;
    const bucket = buckets.get(key);
    bucket.revenue_cents += amount;
    bucket.payments += 1;
  });

  const months = Array.from(buckets.values());
  const currency =
    Object.entries(currencyCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || normalizeCurrency(options.currency);
  const total = months.reduce((sum, item) => sum + item.revenue_cents, 0);
  const paymentCount = months.reduce((sum, item) => sum + item.payments, 0);
  const currentMonth = months[months.length - 1] || { revenue_cents: 0, payments: 0 };

  return {
    currency,
    window_months: months.length,
    total_revenue_cents: total,
    current_month_revenue_cents: currentMonth.revenue_cents,
    average_monthly_revenue_cents: months.length ? Math.round(total / months.length) : 0,
    payment_count: paymentCount,
    max_month_revenue_cents: Math.max(0, ...months.map((item) => item.revenue_cents)),
    months
  };
}

module.exports = {
  buildRevenueEventFromLemonPayload,
  isRevenueEventName,
  parseAmountCents,
  summarizeMonthlyRevenue
};
