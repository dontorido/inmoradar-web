const { browserWaitlistPayload } = require("../browser-waitlist");

async function handleBrowserWaitlist(req) {
  return browserWaitlistPayload(req);
}

module.exports = {
  handleBrowserWaitlist
};
