# AGENTS.md

## Purpose

This file gives coding agents practical instructions for working on `inmoradar-web`.

For broader architecture and current project status, read `PROJECT_CONTEXT.md` first.

## Project summary

`inmoradar-web` is the public website, serverless API and backoffice for InmoRadar.

The project includes:

- Static public pages.
- Vanilla JS/CSS frontend assets.
- Vercel-style serverless functions in `/api`.
- Admin backoffice in `/admin`.
- Supabase persistence through backend-only REST calls.
- Lemon Squeezy Premium checkout, portal and webhooks.
- SEO landing generation and sitemap.
- Parking Difficulty Score.
- Social video generation and Runway integration.
- Extension usage, releases and operational tooling.

There is no declared build step in `package.json`.

## Read before changing

Before implementing any non-trivial change:

1. Read `PROJECT_CONTEXT.md`.
2. Read `README.md`.
3. Inspect the specific files involved.
4. Prefer the smallest safe change.
5. Explain the planned files to touch before editing when possible.

## General rules

- Keep changes small and reviewable.
- Do not do broad refactors unless explicitly requested.
- Do not add dependencies unless clearly necessary.
- Do not change public routes without checking `vercel.json` and `scripts/serve-static.js`.
- Do not create many new serverless functions without considering Vercel Hobby limits.
- Prefer existing routers/resources when appropriate.
- Do not change commercial, legal or privacy copy unless requested.
- Preserve degraded/fallback behaviour where integrations may be unavailable.

## Secrets and environment variables

Never expose secrets in frontend code, static HTML, assets, docs, tests, fixtures or logs.

Backend-only secrets include, at minimum:

- `SUPABASE_SERVICE_ROLE_KEY`
- `LEMONSQUEEZY_API_KEY`
- `LEMONSQUEEZY_WEBHOOK_SECRET`
- `CLOUDFLARE_EMAIL_API_TOKEN`
- `RESEND_API_KEY`
- `OPENAI_API_KEY`
- `RUNWAY_API_SECRET`
- `RUNWAYML_API_SECRET`
- `ADMIN_IMPORT_TOKEN`
- `CRON_SECRET`
- Chrome Web Store credentials

Use only variable names in documentation. Never include real values.

## Validation commands

Use the relevant command after changes:

```bash
npm test
