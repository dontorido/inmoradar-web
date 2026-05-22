const test = require("node:test");
const assert = require("node:assert/strict");

const { buildWaitlistLead, normalizeBrowser } = require("../lib/browser-waitlist");

test("browser waitlist valida navegadores permitidos", () => {
  assert.equal(normalizeBrowser("Chrome"), "chrome");
  assert.equal(normalizeBrowser("edge"), "edge");
  assert.equal(normalizeBrowser("FIREFOX"), "firefox");
  assert.equal(normalizeBrowser("Safari"), "safari");
  assert.equal(normalizeBrowser("opera"), "opera");
  assert.equal(normalizeBrowser("Vivaldi"), "vivaldi");
  assert.equal(normalizeBrowser("BRAVE"), "brave");
  assert.equal(normalizeBrowser("internet-explorer"), "");
});

test("browser waitlist construye lead sin exponer datos innecesarios", () => {
  const { lead, error } = buildWaitlistLead(
    {
      email: " Sergio+Test@Example.COM ",
      browser: "chrome",
      source: "launch_waitlist_modal",
      ctaSource: "hero",
      page: "/",
      referrer: "https://google.com",
      utm: {
        source: "google",
        medium: "cpc",
        campaign: "launch"
      }
    },
    { headers: { "user-agent": "Mozilla Test" } }
  );

  assert.equal(error, undefined);
  assert.equal(lead.email, "sergio+test@example.com");
  assert.equal(lead.browser, "chrome");
  assert.equal(lead.source, "launch_waitlist_modal");
  assert.equal(lead.page, "/");
  assert.equal(lead.utm.source, "google");
  assert.equal(lead.utm.medium, "cpc");
  assert.equal(lead.user_agent, "Mozilla Test");
  assert.match(lead.id, /^[0-9a-f-]{36}$/);
});

test("browser waitlist rechaza email y navegador invalidos", () => {
  assert.equal(buildWaitlistLead({ email: "bad", browser: "chrome" }).error.error, "INVALID_EMAIL");
  assert.equal(buildWaitlistLead({ email: "ok@example.com", browser: "unknown" }).error.error, "INVALID_BROWSER");
});

test("browser waitlist ignora honeypot sin guardar", () => {
  const result = buildWaitlistLead({
    email: "bot@example.com",
    browser: "chrome",
    honeypot: "filled"
  });

  assert.equal(result.ignored, true);
  assert.equal(result.lead, undefined);
});
