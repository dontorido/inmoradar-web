'use strict';

const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const source = fs.readFileSync('api/argos-infrastructure-alert-relay.js', 'utf8');
const handler = require('../api/argos-infrastructure-alert-relay.js');

function responseHarness() {
  const headers = {};
  return {
    statusCode: 0,
    body: null,
    setHeader(name, value) { headers[String(name).toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    headers,
  };
}

test('ARGOS relay is fixed to Sergio and rejects arbitrary destinations', () => {
  assert.match(source, /const ALERT_RECIPIENT = 'Sergio\.torio@gmail\.com'/);
  assert.doesNotMatch(source, /body\?\.to|body\.to|request\.body\.to/);
  assert.match(source, /subject\.startsWith\('\[ARGOS\]'\)/);
  assert.match(source, /IDEMPOTENCY_KEY/);
});

test('ARGOS relay accepts only bounded Bolsa Vercel or GitHub OIDC identities', () => {
  assert.match(source, /VERCEL_PROJECT_ID = 'prj_ZzlybK3gIGN1b2J4UbjR1VKqo7Yr'/);
  assert.match(source, /GITHUB_REPOSITORY = 'dontorido\/bolsa-intelligence'/);
  assert.match(source, /GITHUB_REPOSITORY_ID = '1342335621'/);
  assert.match(source, /GITHUB_OWNER_ID = '41258518'/);
  assert.match(source, /infrastructure-watchdog-external\.yml/);
  assert.match(source, /argos2-progress-email\.yml/);
  assert.match(source, /GITHUB_WORKFLOWS = new Set/);
  assert.match(source, /jwtVerify\(token, await jwksFor\(issuer\), \{ issuer, audience: AUDIENCE \}\)/);
  assert.match(source, /exactWorkflowRefs\.includes\(workflowRef\)/);
  assert.match(source, /workflowSuffixes\.some/);
  assert.match(source, /MAX_BODY_BYTES = 64 \* 1024/);
});

test('configuration diagnostic exposes provider presence but never credential values', async () => {
  const previous = {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_EMAIL_FROM: process.env.RESEND_EMAIL_FROM,
  };
  process.env.RESEND_API_KEY = 'unit-test-secret';
  process.env.RESEND_EMAIL_FROM = 'ARGOS <noreply@inmoradar.app>';
  try {
    const response = responseHarness();
    await handler({ method: 'GET', query: { diagnostic: 'configuration' }, headers: {} }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.provider_ready, true);
    assert.equal(response.body.recipient_count, 1);
    assert.equal(JSON.stringify(response.body).includes('unit-test-secret'), false);
  } finally {
    if (previous.RESEND_API_KEY === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previous.RESEND_API_KEY;
    if (previous.RESEND_EMAIL_FROM === undefined) delete process.env.RESEND_EMAIL_FROM;
    else process.env.RESEND_EMAIL_FROM = previous.RESEND_EMAIL_FROM;
  }
});

test('signed identity diagnostic is explicit and cannot bypass mail authorization', () => {
  assert.match(source, /action === 'diagnostic_identity'/);
  assert.match(source, /caller\.verified \? 403 : 401/);
  assert.match(source, /github_claims_rejected/);
  assert.match(source, /vercel_claims_rejected/);
  assert.match(source, /identity_rejected/);
  assert.match(source, /if \(!caller\.ok\)/);
});

test('relay keeps mail authority bounded and contains no infrastructure mutation path', () => {
  assert.doesNotMatch(source, /resize|restart|pg_terminate_backend|cron\.alter_job|broker|order.*place/i);
  assert.match(source, /recipient_count: 1/);
  assert.match(source, /delivery_failed/);
});
