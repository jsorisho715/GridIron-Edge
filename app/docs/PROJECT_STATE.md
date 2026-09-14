# Gridiron Edge checkpoint

Read this file first. Do not reconstruct completed work from chat.

## Decisions
- One private ESPN NFL league for Johnathan. Desktop and Pixel 8 Pro.
- Unlisted. No community publication. Public URL serves fictional sample data only.
- Latest UI priority overrides the initial scroll-scrub template: open the decision desk directly, with no intro film.
- Custom light sage and forest interface, desktop sidebar, phone bottom navigation, 48px actions, accessible native dialog.
- Read-only companion. Never execute ESPN transactions automatically.
- No routine LLM API use. Deterministic local calculations and compact persistent state.
- No secrets in chat, source, browser storage, logs, or exports.

## Working in this release
- Today dashboard, roster, bench, player search and position filters.
- Player watchlist, two-player comparison, recent game log.
- Exact eligible-slot optimizer for sample roster; out/bye exclusion; locked player preservation.
- Marginal waiver improvement ranking, sample availability reports.
- Seeded sample matchup resampling with a fixed synthetic opponent.
- Notes, watchlists and reviewed flags persist on the current browser. No cross-device sync yet.
- Sample lineup changes last for this visit. Nothing is sent to ESPN.
- JSON review export, manifest and icons, offline explanation page.
- /api/gridiron/status still returns sample mode; no live dashboard data is implied.
- /connections now has owner authentication, encrypted cookie storage and read-only ESPN validation.
- See docs/SECURE_CONNECTIONS.md for the contract, activation steps and security boundaries.
- Hosting keys remain absent; the form stays locked until configured and redeployed.

## Unfinished, in order
1. Production activation: configure the two hosting keys, redeploy, then verify real ESPN cookies in the owner-only form.
2. Full league import and dashboard integration. Validate custom scoring, roster slots and live data freshness.
3. Real historical stat import and ID reconciliation. nflverse historical data; confirm current source formats when implementing. Do not assume nflverse has a working live injury feed.
4. Verified kickoff locks, bye status, player status timestamps, free-agent availability and opponent data.
5. Scheduler with atomic job deduplication, bounded retry/backoff, secret-expiry health states and independent heartbeat. D1 is enabled for connection storage; monitoring remains unimplemented.
6. Durable private notes/watchlists across phone and desktop.
7. Real closed-app push subscriptions and delivery test. In-app report cards are not push notifications.
8. Historical backtests without future leakage. No fabricated accuracy or calibrated win-probability claims.

## Code map
- src/lib/gridiron.ts: fictional fixtures, estimates, optimizer, simulation and waiver ranking.
- src/components/gridiron/Workspace.tsx: shared desktop/mobile workflow.
- src/components/gridiron/panels.tsx: dialogs, comparison, lineup review, settings.
- src/gridiron.css: custom design tokens and responsive styles.
- src/routes/index.tsx and app.tsx: same workspace surface.
- tests/gridiron.test.ts: 8 decision-logic tests.
- public/manifest.webmanifest and sw.js: install and safe offline fallback. No API or private HTML caching.

## Validation
- bun run typecheck
- bun test tests/*.test.ts (27 pass, including 13 connection security tests)
- bun run build
- Browser-tested at 1440px desktop and 412px mobile: no horizontal overflow, lineup application, search, comparison, Escape close, notes/watch persistence, bottom navigation, no page errors.
- Real Pixel hardware, actual Chrome installation and live ESPN authentication remain untested.

## Continuation economy
Read this checkpoint, then only the source files relevant to the next change. Use targeted tests. Keep the model deterministic and free of LLM calls. Save design decisions and API contract notes here as they change. Never put credentials or full third-party responses into project notes.

## Repository migration
Current project is backed by the website builder repository. A user-owned private GitHub repository is recommended for future Codex work. GitHub is not connected in this session. No user-owned repository has been created, and no migration has occurred. Copy the complete app directory, including vendored packages, lockfile and existing build instructions. This is React 19 + TanStack Start, not Next.js. Do not silently switch frameworks. Keep build/deploy secrets separate from source.

## Current deployment
https://gridiron-edge-sorisho.higgsfield.app/app
Unlisted, not entered into community or contest. Signed-out browsers encounter the platform login. Compatible lockfile security updates resolved 37 starter advisories; final audit, typecheck, core tests and build passed.
