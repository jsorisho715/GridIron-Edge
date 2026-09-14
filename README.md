# Gridiron Edge

[Open the private app](https://gridiron-edge.gridiron-edge-2b093f15.workers.dev/app).
A personal ESPN NFL fantasy companion for desktop and Pixel 8 Pro, built with React 19, TypeScript, TanStack Start, Cloudflare Workers and D1. The source lives in `app/`.

## Current product

- Owner login, encrypted ESPN cookies, private API and no private page caching.
- Live league rosters, scoring rules, matchups, standings, free-agent availability and player history.
- Read-only lineup optimization, player comparisons, historical estimates and walk-forward baseline checks.
- Availability changes, pre-kickoff alerts, watchlists and private notes across devices.
- Automatic sync every 15 minutes, bounded retries, preserved last-good data and independent hourly health checks.
- Installable Android web app and encrypted Web Push. Enable notifications and send a test on each device.

The public URL requires owner access before returning league data. Legacy fictional components remain in the source as unused scaffold; they are not mounted. The user confirmed successful production ESPN verification on September 14, 2026. The live workspace release runs an authenticated import check on deployment.

No ESPN lineup, waiver or trade transactions are submitted. Predictions are estimates, not guarantees. Search includes league rosters and 75 imported free agents; historical cards prioritize your roster, opponent and watched players. Injury coverage consists of ESPN availability flags and links to player news.

## Development and release

```sh
cd app
bun install --frozen-lockfile
bun run typecheck
bun test tests/*.test.ts
bun run build
bun audit
```

Use Node 22 and Bun 1.4.2. Local Vite has no production credentials or D1 binding; synthetic browser fixtures test the private UI. See `app/docs/QA.md` for the browser command.

A push to `main` under `app/` runs tests, build, dependency audit, browser/accessibility checks, real workerd checks, additive D1 migrations, deployment and authenticated import verification. `.github/workflows/health.yml` checks scheduler freshness independently each hour. GitHub scheduled workflows may be delayed and public repositories may have schedules disabled after 60 days without repository activity; the Cloudflare sync runs separately.

## Secrets and recovery

GitHub Actions secrets: `CLOUDFLARE_API_TOKEN`, `OWNER_ACCESS_KEY` (32–256 characters), `CREDENTIAL_ENCRYPTION_KEY` (64 hex characters). Variables: `CLOUDFLARE_ACCOUNT_ID`, `APP_SLUG=gridiron-edge`, `HF_ENV=production`.

These are already configured. No additional notification keys are needed: VAPID keys are generated and encrypted automatically. Enter ESPN cookies only in `/connections`. Keep keys in a password manager, never in this public repository, logs or chat.

To recover owner access, replace only `OWNER_ACCESS_KEY` in GitHub and rerun deployment. Rotating the encryption key makes existing credentials and notification subscriptions unreadable. See `app/docs/SECURE_CONNECTIONS.md`.

Production Worker: `gridiron-edge`. D1: `gridiron-edge-db`, binding `DB`. Deployment generates its configuration; `app/wrangler.jsonc` is a template. No Higgsfield account or runtime integration is required. The original scaffold and inactive historical workflow are preserved.

## Project memory

See [RELEASE_AUDIT.md](RELEASE_AUDIT.md) for the verified live release, exact coverage and remaining device checks.

Read `app/docs/PROJECT_STATE.md` first, then relevant source. `app/docs/PRD.md` records scope and decisions, `QA.md` records verification, and `DATA_SOURCES.md` records API and repository choices. Routine operation uses no LLM calls or tokens.
