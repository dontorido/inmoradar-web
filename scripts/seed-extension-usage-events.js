const endpoint = process.argv[2] || process.env.EXTENSION_USAGE_ENDPOINT || "http://127.0.0.1:4173/api/extension-usage";
const url = new URL(endpoint);
const isLocal = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);

if (!isLocal && process.env.ALLOW_REMOTE_EXTENSION_USAGE_SEED !== "1") {
  console.error("Refusing to seed a non-local endpoint. Set ALLOW_REMOTE_EXTENSION_USAGE_SEED=1 explicitly if this is intentional.");
  process.exit(1);
}

const now = Date.now();
const anonymousUserId = `dev-user-${now}`;
const sessionId = `dev-session-${now}`;
const common = {
  anonymous_user_id: anonymousUserId,
  session_id: sessionId,
  extension_version: "dev-local",
  browser_name: "chrome",
  browser_version: "dev",
  platform: "windows",
  country: "ES",
  page_domain: "idealista.com",
  manifest_version: 3,
  locale: "es-ES"
};

const events = [
  ["extension_installed", 0],
  ["extension_opened", 2],
  ["listing_detected", 5],
  ["analysis_started", 8],
  ["analysis_completed", 14],
  ["cta_clicked", 20],
  ["error", 24]
].map(([eventName, seconds]) => ({
  ...common,
  event_name: eventName,
  timestamp: new Date(now + seconds * 1000).toISOString(),
  duration_seconds: seconds,
  active_seconds: Math.min(seconds, 18)
}));

async function postEvent(event) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(`${event.event_name}: ${response.status} ${payload.error || payload.message || "request_failed"}`);
  }
  return payload;
}

(async () => {
  for (const event of events) {
    await postEvent(event);
    console.log(`seeded ${event.event_name}`);
  }
  console.log(`Seeded ${events.length} extension usage events into ${endpoint}`);
})().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
