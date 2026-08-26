'use strict';

const ALERT_RECIPIENT = 'Sergio.torio@gmail.com';
const AUDIENCE = 'https://argos.bolsa-intelligence.internal/infrastructure-alert-relay';
const VERCEL_OWNER_ID = 'team_WZ0uIKIvwQ2Cde8oA3MHQwD2';
const VERCEL_PROJECT_ID = 'prj_ZzlybK3gIGN1b2J4UbjR1VKqo7Yr';
const VERCEL_PROJECT_NAME = 'bolsa-intelligence';
const GITHUB_ISSUER = 'https://token.actions.githubusercontent.com';
const GITHUB_REPOSITORY = 'dontorido/bolsa-intelligence';
const GITHUB_REPOSITORY_ID = '1342335621';
const GITHUB_OWNER_ID = '41258518';
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

function githubWorkflowAssessment(payload) {
  const workflowRef = String(payload.workflow_ref || payload.job_workflow_ref || '');
  const exactWorkflowRef = `${GITHUB_REPOSITORY}/${GITHUB_WORKFLOW}@refs/heads/main`;
  const workflowSuffix = `/bolsa-intelligence/${GITHUB_WORKFLOW}@refs/heads/main`;
  const checks = {
    repository: payload.repository === GITHUB_REPOSITORY,
    repository_id: !payload.repository_id || String(payload.repository_id) === GITHUB_REPOSITORY_ID,
    repository_owner: !payload.repository_owner || payload.repository_owner === 'dontorido',
    repository_owner_id: !payload.repository_owner_id || String(payload.repository_owner_id) === GITHUB_OWNER_ID,
    ref: payload.ref === 'refs/heads/main',
    event_name: ALLOWED_GITHUB_EVENTS.has(String(payload.event_name || '')),
    workflow_ref: workflowRef === exactWorkflowRef || workflowRef.endsWith(workflowSuffix),
  };
  return {
    allowed: Object.values(checks).every(Boolean),
    checks,
    workflow_ref: workflowRef,
    repository: String(payload.repository || ''),
    ref: String(payload.ref || ''),
    event_name: String(payload.event_name || ''),
  };
}

function vercelAssessment(payload) {
  const checks = {
    owner_id: payload.owner_id === VERCEL_OWNER_ID,
    project_id: payload.project_id === VERCEL_PROJECT_ID,
    project: payload.project === VERCEL_PROJECT_NAME,
    environment: ALLOWED_VERCEL_ENVIRONMENTS.has(String(payload.environment || '')),
  };
  return { allowed: Object.values(checks).every(Boolean), checks };
}

async function authenticate(request) {
  const authorization = String(request.headers.authorization || '');
  if (!authorization.startsWith('Bearer ')) {
    return { ok: false, verified: false, reason: 'authorization_missing', provider: null, diagnostic: null };
  }
  const token = authorization.slice(7).trim();
  if (!token) return { ok: false, verified: false, reason: 'token_missing', provider: null, diagnostic: null };

  try {
    const { decodeJwt, jwtVerify } = await jose();
    const unverified = decodeJwt(token);
    const issuer = normalizedIssuer(unverified.iss);
    if (!issuer) return { ok: false, verified: false, reason: 'issuer_not_allowed', provider: null, diagnostic: null };
    const { payload } = await jwtVerify(token, await jwksFor(issuer), { issuer, audience: AUDIENCE });

    if (issuer === GITHUB_ISSUER) {
      const headerOk = request.headers['x-argos-service-auth'] === 'github-oidc-v1';
      const assessment = githubWorkflowAssessment(payload);
      const ok = headerOk && assessment.allowed;
      return {
        ok,
        verified: true,
        reason: ok ? 'ok' : (!headerOk ? 'github_service_header_invalid' : 'github_claims_rejected'),
        provider: 'github',
        payload,
        diagnostic: { ...assessment, service_header: headerOk },
      };
    }

    const headerOk = request.headers['x-argos-service-auth'] === 'vercel-oidc-v1';
    const assessment = vercelAssessment(payload);
    const ok = headerOk && assessment.allowed;
    return {
      ok,
      verified: true,
      reason: ok ? 'ok' : (!headerOk ? 'vercel_service_header_invalid' : 'vercel_claims_rejected'),
      provider: 'vercel',
      payload,
      diagnostic: { ...assessment, service_header: headerOk },
    };
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    const name = error instanceof Error ? error.name : 'error';
    const reason = `jwt_invalid:${code || name}`;
    console.warn('[argos-alert-relay] oidc_rejected', reason);
    return { ok: false, verified: false, reason, provider: null, diagnostic: null };
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
  if (request.body?.action === 'diagnostic_identity') {
    return sendJson(response, caller.ok ? 200 : (caller.verified ? 403 : 401), {
      ok: caller.ok,
      verified: caller.verified,
      provider: caller.provider,
      reason: caller.reason,
      diagnostic: caller.diagnostic,
    });
  }
  if (!caller.ok) {
    console.warn('[argos-alert-relay] identity_rejected', JSON.stringify({
      provider: caller.provider,
      reason: caller.reason,
      diagnostic: caller.diagnostic,
    }).slice(0, 1200));
    return sendJson(response, 401, { ok: false, error: 'unauthorized', reason: caller.reason });
  }

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
