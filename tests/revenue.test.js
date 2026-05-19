const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildRevenueEventFromLemonPayload,
  parseAmountCents,
  summarizeMonthlyRevenue
} = require("../lib/sales/revenue");

test("buildRevenueEventFromLemonPayload captura cobros reales de Lemon", () => {
  const event = buildRevenueEventFromLemonPayload(
    {
      data: {
        type: "orders",
        id: "order_123",
        attributes: {
          order_id: 123,
          customer_id: 456,
          total: 1999,
          currency: "eur",
          created_at: "2026-03-12T10:00:00.000Z"
        }
      }
    },
    "order_created"
  );

  assert.equal(event.amount_cents, 1999);
  assert.equal(event.currency, "EUR");
  assert.equal(event.provider_order_id, "123");
  assert.equal(event.occurred_at, "2026-03-12T10:00:00.000Z");
});

test("buildRevenueEventFromLemonPayload ignora eventos que no son facturacion", () => {
  const event = buildRevenueEventFromLemonPayload(
    {
      data: {
        attributes: {
          total: 1999,
          currency: "EUR"
        }
      }
    },
    "subscription_updated"
  );

  assert.equal(event, null);
});

test("summarizeMonthlyRevenue agrupa ingresos por mes", () => {
  const summary = summarizeMonthlyRevenue(
    [
      { amount_cents: 1999, currency: "EUR", occurred_at: "2026-03-02T00:00:00.000Z" },
      { amount_cents: 999, currency: "EUR", occurred_at: "2026-03-18T00:00:00.000Z" },
      { amount_cents: 1999, currency: "EUR", occurred_at: "2026-04-01T00:00:00.000Z" }
    ],
    { months: 3, now: new Date("2026-05-20T00:00:00.000Z") }
  );

  assert.deepEqual(summary.months.map((item) => item.key), ["2026-03", "2026-04", "2026-05"]);
  assert.equal(summary.months[0].revenue_cents, 2998);
  assert.equal(summary.months[0].payments, 2);
  assert.equal(summary.months[1].revenue_cents, 1999);
  assert.equal(summary.current_month_revenue_cents, 0);
  assert.equal(summary.total_revenue_cents, 4997);
});

test("parseAmountCents acepta centimos y decimal textual", () => {
  assert.equal(parseAmountCents(1999), 1999);
  assert.equal(parseAmountCents("19.99"), 1999);
});
