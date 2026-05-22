# AGENTS.md

## Purpose

This file gives coding agents practical instructions for working on `inmoradar-web`.

For broader architecture and current project status, read `PROJECT_CONTEXT.md` first.

## Project summary

`inmoradar-web` is the public website, serverless API and backoffice for InmoRadar.

The project includes static public pages, vanilla JS/CSS frontend assets, Vercel-style serverless functions in `/api`, admin backoffice in `/admin`, Supabase persistence through backend-only REST calls, Lemon Squeezy Premium checkout, SEO landing generation, Parking Difficulty Score, social video generation, extension usage, releases and operational tooling.

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

- `npm test`
- `npm run serve`
- `npm run seo:generate -- --limit=5 --dry-run`

There is currently no `npm run build`.

For focused tests:

- `node --test tests/parking-difficulty.test.js`
- `node --test tests/parking-intelligence.test.js`
- `node --test tests/social-video.test.js`
- `node --test tests/seo.test.js`
- `node --test tests/viraliza.test.js`

If tests are not run, explain why.

## Backoffice rules

Main files:

- `admin.html`
- `assets/admin.js`
- `assets/admin.css`
- `assets/admin-video-busy.css`
- `api/admin.js`

Rules:

- Preserve protection through `ADMIN_IMPORT_TOKEN`.
- Be careful with `api/admin.js`; it is a compact router with many responsibilities.
- Avoid splitting admin resources into many serverless files unless explicitly requested.
- Keep UI changes compatible with vanilla JS and static HTML.
- Add graceful error states for admin operations.

## API rules

Main folder: `/api`.

Rules:

- Keep backend-only integrations in serverless functions.
- Validate inputs.
- Return clear JSON errors.
- Preserve CORS and HTTP behaviour used by the extension and website.
- Check `vercel.json` rewrites before adding or moving endpoints.
- Check `scripts/serve-static.js` if local routing needs to match production.

## Supabase rules

- Use Supabase only from backend/serverless code when service role is needed.
- Do not move service-role logic to frontend assets.
- If adding a table, include SQL under `/database`.
- Add degraded behaviour when a table may not exist yet.
- Do not assume migrations run automatically.

## Premium and payments

Relevant areas:

- `api/lemonsqueezy-checkout.js`
- `api/lemonsqueezy-webhook.js`
- `api/check-premium.js`
- `premium.html`
- `success.html`
- `cancel.html`
- related SQL in `/database`

Rules:

- Do not weaken webhook signature validation.
- Do not expose Lemon Squeezy secrets.
- Preserve checkout, portal and `check-premium` flows.
- Be explicit if a change requires new Lemon Squeezy or Supabase configuration.

## SEO rules

Relevant areas:

- `api/_seo/*`
- `api/seo-page.js`
- `api/sitemap.js`
- `api/cron/seo-publish.js`
- `scripts/seo-generate.js`
- `.github/workflows/seo-cron.yml`
- SEO SQL files in `/database`

Rules:

- Test generator changes with dry run.
- Preserve sitemap compatibility.
- Keep generated pages indexable only when quality/status rules allow it.
- Do not publish large batches automatically unless requested.

## Parking Difficulty Score rules

Relevant areas:

- `api/parking-difficulty.js`
- `api/_parking/*`
- `types/parking.ts`
- `database/parking-difficulty.sql`
- `tests/parking-difficulty.test.js`
- `tests/parking-intelligence.test.js`

Rules:

- Preserve fallbacks for external data sources.
- Keep Overpass, Nominatim and Photon failures non-fatal when possible.
- Run parking tests after scoring, parsing or cache changes.
- Maintain score explanations, confidence and disclaimers.

## Social video and Runway rules

Relevant areas:

- `lib/social-video/*`
- `api/admin.js` social-video resources
- `database/social-video-projects.sql`
- `database/social-video-jobs.sql`
- `docs/runway-video.md`
- `tests/social-video.test.js`

Rules:

- Runway may incur real cost.
- Preserve cost estimation, manual confirmation, per-render limits and daily budget controls.
- Keep Runway disabled by default unless explicitly requested.
- Preserve required branding: small logo at top right, `Inmoradar.app` at bottom right, vertical format for TikTok/Reels/Shorts.
- Do not implement automatic TikTok publishing unless explicitly requested.

## Viraliza rules

Relevant areas:

- `lib/viraliza/*`
- admin resource `viraliza`
- `tests/viraliza.test.js`

Rules:

- Keep the workflow human-in-the-loop.
- Do not auto-publish externally unless explicitly requested.
- Preserve learning/context behaviour carefully.

## Browser extension and Chrome Web Store rules

Relevant areas:

- extension version and usage endpoints.
- operations release tooling.
- Chrome Web Store credentials and actions.

Rules:

- Do not expose Chrome Web Store credentials.
- Do not publish or upload to Chrome Web Store unless explicitly requested.
- Keep extension API compatibility in mind when modifying public endpoints.

## Documentation rules

Update documentation when a change affects architecture, environment variables, deployment, endpoints, Supabase tables, operational workflows or paid integrations.

Prefer updating `PROJECT_CONTEXT.md` only for meaningful architectural or operational changes.

## Final response format for coding tasks

When finishing a task, report:

1. Summary of changes.
2. Files changed.
3. Tests or checks run.
4. Manual validation steps.
5. New environment variables, if any.
6. Risks or follow-ups.

Al terminar, dime:

- ruta actualizada
- rama usada
- hash del commit
- si has hecho push correctamente
