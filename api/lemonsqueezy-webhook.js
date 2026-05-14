const {
  handleCors,
  isEmail,
  json,
  normalizeEmail,
  readRawBody,
  supabaseFetch,
  verifyLemonSignature
} = require("./_utils");

function pickEmail(attributes, meta) {
  return normalizeEmail(
    attributes.user_email ||
    attributes.customer_email ||
    attributes.email ||
    meta?.custom_data?.email ||
    meta?.custom_data?.user_email
  );
}

function normalizeStatus(eventName, attributes) {
  const status = String(attributes.status || "").toLowerCase();
  if (status) return status;
  if (eventName === "order_created" && attributes.status === "paid") return "active";
  if (eventName === "subscription_cancelled") return "cancelled";
  if (eventName === "subscription_expired") return "expired";
  return "unknown";
}

function subscriptionRow(payload, eventName) {
  const data = payload.data || {};
  const attributes = data.attributes || {};
  const meta = payload.meta || {};
  const email = pickEmail(attributes, meta);
  const status = normalizeStatus(eventName, attributes);

  return {
    email,
    provider: "lemonsqueezy",
    provider_customer_id: attributes.customer_id ? String(attributes.customer_id) : null,
    provider_subscription_id: data.id ? String(data.id) : attributes.subscription_id ? String(attributes.subscription_id) : null,
    provider_order_id: attributes.order_id ? String(attributes.order_id) : null,
    status,
    renews_at: attributes.renews_at || null,
    ends_at: attributes.ends_at || attributes.cancelled_at || null,
    trial_ends_at: attributes.trial_ends_at || null,
    product_id: attributes.product_id ? String(attributes.product_id) : null,
    variant_id: attributes.variant_id ? String(attributes.variant_id) : null,
    event_name: eventName,
    raw_event: payload,
    updated_at: new Date().toISOString()
  };
}

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== "POST") {
    json(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
    if (!secret) {
      json(res, 500, { ok: false, error: "webhook_secret_not_configured" });
      return;
    }

    const rawBody = await readRawBody(req);
    const signature = req.headers["x-signature"];
    if (!verifyLemonSignature(rawBody, signature, secret)) {
      json(res, 400, { ok: false, error: "invalid_signature" });
      return;
    }

    const payload = JSON.parse(rawBody);
    const eventName = payload.meta?.event_name || req.headers["x-event-name"] || "unknown";
    const row = subscriptionRow(payload, eventName);

    if (!isEmail(row.email)) {
      json(res, 202, { ok: true, ignored: true, reason: "missing_email", event_name: eventName });
      return;
    }

    await supabaseFetch("premium_subscriptions?on_conflict=email", {
      method: "POST",
      headers: {
        prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify(row)
    });

    json(res, 200, { ok: true, event_name: eventName });
  } catch (error) {
    console.error("[lemonsqueezy-webhook]", error);
    json(res, 500, { ok: false, error: "webhook_failed" });
  }
};
