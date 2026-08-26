'use strict';

const ALERT_RECIPIENT = 'Sergio.torio@gmail.com';
const AUDIENCE = 'https://argos.bolsa-intelligence.internal/infrastructure-alert-relay';
const VERCEL_OWNER_ID = 'team_WZ0uIKIvwQ2Cde8oA3MHQwD2';
const VERCEL_PROJECT_ID = 'prj_ZzlybK3gIGN1b2J4UbjR1VKqo7Yr';
const VERCEL_PROJECT_NAME = 'bolsa-intelligence';
const GITHUB_ISSUER = 'https://token.actions.githubusercontent.com';
const GITHUB_REPOSITORY = 'dontorido/bolsa-intelligence';
const GITHUB_WORKFLOW = '.github/workflows/infrastructure-watchdog-external.yml';
const MAX_BODY_BYTES = 64 * 1024;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{1,180}$/;
const ALLOWED_VERCEL_ENVIRONMENTS = new Set(['production', 'preview']);
const ALLOWED_GITHUB_EVENTS = new Set(['schedule', 'workflow_dispatch']);
const jwksByIssuer = new Map();
let josePromise;

function sendJson(response, status, body) {
  response.setHeader('Cache-Control', 'no-store, max-age=0');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  return response.status(status).json(body);
}

function providerConfig() {
  const resendFrom = String(
    process.env.ARGOS_INFRA_ALERT_FROM ||
    process.env.RESEND_EMAIL_FROM ||
    process.env.RESEND_INSTALL_NOTIFICATION_EMAIL_FROM ||
    'ARGOS <noreply@inmoradar.app>'
  ).trim();
  const cloudflareFrom = String(
    process.env.ARGOS_INFRA_ALERT_FROM ||
    process.env.CLOUDFLARE_EMAIL_FROM ||
    process.env.CLOUDFLARE_INSTALL_NOTIFICATION_EMAIL_FROM ||
    'noreply@inmoradar.app'
  ).trim();
  return {
    resend: {
      configured: Boolean(process.env.RESEND_API_KEY && resendFrom),
      apiToken: process.env.RESEND_API_KEY || '',
      from: resendFrom,
    },
    cloudflare: {
      configured: Boolean(
        process.env.CLOUDFLARE_ACCOUNT_ID &&
        process.env.CLOUDFLARE_EMAIL_API_TOKEN &&
        cloudflareFrom
      ),
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID || '',
      apiToken: process.env.CLOUDFLARE_EMAIL_API_TOKEN || '',
      from: cloudflareFrom,
    },
  };
}

async function jose() {
  if (!josePromise) josePromise = import('jose');
  return josePromise;
}

function normalizedIssuer(value) {
  const issuer = String(value || '').replace(/\/$/, '');
  if (issuer === GITHUB_ISSUER) return issuer;
  if (issuer === 'https://oidc.vercel.com') return issuer;
  if (/^https:\/\/oidc\.vercel\.com\/[A-Za-z0-9._-]+$/.test(issuer)) return issuer;
  return null;
}

async function jwksFor(issuer) {
  let jwks = jwksByIssuer.get(issuer);
  if (!jwks) {
    const { createRemoteJWKSet } = await jose();
    jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks`));
    jwksByIssuer.set(issuer, jwks);
  }
  return jwks;
}

function githubWorkflowAllowed(payload) {
  if (payload.repository !== GITHUB_REPOSITORY) return false;
  if (payload.repository_owner !== 'dontorido') return false;
  if (payload.ref !== 'refs/heads/main') return false;
  if (!ALLOWED_GITHUB_EVENTS.has(String(payload.event_name || ''))) return false;
  const workflowRef = String(payload.job_workflow_ref || payload.workflow_ref || '');
  return workflowRef === `${GITHUB_REPOSITORY}/${GITHUB_WORKFLOW}@refs/heads/main`;
}

function vercelCallerAllowed(payload) {
  return payload.owner_id === VERCEL_OWNER_ID
    && payload.project_id === VERCEL_PROJECT_ID
    && payload.project === VERCEL_PROJECT_NAME
    && ALLOWED_VERCEL_ENVIRONMENTS.has(String(payload.environment || ''));
}

async function authenticate(request) {
  const authorization = String(request.headers.authorization || '');
  if (!authorization.startsWith('Bearer ')) return null;
  const token = authorization.slice(7).trim();
  if (!token) return null;

  try {
    const { decodeJwt, jwtVerify } = await jose();
    const unverified = decodeJwt(token);
    const issuer = normalizedIssuer(unverified.iss);
    if (!issuer) return null;
    const { payload } = await jwtVerify(token, await jwksFor(issuer), { issuer, audience: AUDIENCE });

    if (issuer === GITHUB_ISSUER) {
      if (request.headers['x-argos-service-auth'] !== 'github-oidc-v1') return null;
      return githubWorkflowAllowed(payload) ? { provider: 'github', payload } : null;
    }
    if (request.headers['x-argos-service-auth'] !== 'vercel-oidc-v1') return null;
    return vercelCallerAllowed(payload) ? { provider: 'vercel', payload } : null;
  } catch (error) {
    console.warn('[argos-alert-relay] oidc_rejected', error instanceof Error ? error.name : 'error');
    return null;
  }
}

function boundedText(value, max, required = false) {
  const text = String(value || '').trim();
  if (required && !text) return null;
  if (text.length > max) return null;
  return text;
}

function normalizedPayload(body) {
  const subject = boundedText(body?.subject, 180, true);
  const text = boundedText(body?.text, 24000, true);
  const html = boundedText(body?.html, 60000, false) || '';
  const idempotencyKey = boundedText(body?.idempotency_key, 180, true);
  if (!subject || !subject.startsWith('[ARGOS]')) return null;
  if (!text || !idempotencyKey || !IDEMPOTENCY_KEY.test(idempotencyKey)) return null;
  return { subject, text, html, idempotencyKey };
}

async function sendWithResend(config, payload) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': payload.idempotencyKey,
    },
    body: JSON.stringify({
      from: config.from,
      to: [ALERT_RECIPIENT],
      subject: payload.subject,
      text: payload.text,
      ...(payload.html ? { html: payload.html } : {}),
      headers: {
        'X-ARGOS-Infrastructure-Alert': 'v1',
        'X-ARGOS-Idempotency-Key': payload.idempotencyKey,
      },
    }),
    signal: AbortSignal.timeout(12000),
  });
  const raw = await response.text();
  let parsed = null;
  try { parsed = JSON.parse(raw || '{}'); } catch { parsed = null; }
  if (!response.ok || parsed?.error) {
    throw new Error(`resend_http_${response.status}:${String(parsed?.message || raw).slice(0, 240)}`);
  }
  return { provider: 'resend', providerMessageId: String(parsed?.id || '') };
}

async function sendWithCloudflare(config, payload) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(config.accountId)}/email/sending/send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: config.from,
        to: ALERT_RECIPIENT,
        subject: payload.subject,
        text: payload.text,
        ...(payload.html ? { html: payload.html } : {}),
        headers: {
          'X-ARGOS-Infrastructure-Alert': 'v1',
          'X-ARGOS-Idempotency-Key': payload.idempotencyKey,
        },
      }),
      signal: AbortSignal.timeout(12000),
    },
  );
  const raw = await response.text();
  let parsed = null;
  try { parsed = JSON.parse(raw || '{}'); } catch { parsed = null; }
  if (!response.ok || parsed?.success === false) {
    throw new Error(`cloudflare_email_http_${response.status}:${String(parsed?.errors?.[0]?.message || raw).slice(0, 240)}`);
  }
  return {
    provider: 'cloudflare_email_service',
    providerMessageId: String(parsed?.result?.id || parsed?.result?.message_id || ''),
  };
}

module.exports = async function handler(request, response) {
  const config = providerConfig();

  if (request.method === 'GET' && String(request.query?.diagnostic || '') === 'configuration') {
    return sendJson(response, 200, {
      ok: true,
      relay: 'ARGOS_INFRASTRUCTURE_ALERT_RELAY_V1',
      resend_configured: config.resend.configured,
      cloudflare_email_configured: config.cloudflare.configured,
      provider_ready: config.resend.configured || config.cloudflare.configured,
      recipient_configured: true,
      recipient_count: 1,
    });
  }

  if (request.method !== 'POST') return sendJson(response, 405, { ok: false, error: 'method_not_allowed' });
  const contentLength = Number(request.headers['content-length'] || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return sendJson(response, 413, { ok: false, error: 'payload_too_large' });
  }

  const caller = await authenticate(request);
  if (!caller) return sendJson(response, 401, { ok: false, error: 'unauthorized' });
  const payload = normalizedPayload(request.body || {});
  if (!payload) return sendJson(response, 400, { ok: false, error: 'invalid_alert_payload' });
  if (!config.resend.configured && !config.cloudflare.configured) {
    return sendJson(response, 503, { ok: false, error: 'email_provider_not_configured' });
  }

  try {
    const delivery = config.resend.configured
      ? await sendWithResend(config.resend, payload)
      : await sendWithCloudflare(config.cloudflare, payload);
    return sendJson(response, 200, {
      ok: true,
      provider: delivery.provider,
      provider_message_id: delivery.providerMessageId,
      recipient_count: 1,
      caller: caller.provider,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('[argos-alert-relay] delivery_failed', detail.slice(0, 400));
    return sendJson(response, 502, {
      ok: false,
      error: 'delivery_failed',
      detail: detail.slice(0, 240),
    });
  }
};
