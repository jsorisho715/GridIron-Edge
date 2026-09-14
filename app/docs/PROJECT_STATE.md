# Gridiron Edge checkpoint

Updated September 14, 2026. Read this first; do not reconstruct the project from chat. This file supersedes earlier Higgsfield/sample-only notes.

## Owner decisions
- One private ESPN NFL league: 10309566 / team 25 / season 2026.
- Desktop and Pixel 8 Pro; light sage/forest decision desk; tap-first workflow.
- Read-only ESPN, private/unlisted, no community feed, no automatic fantasy transactions.
- Minimize manual upkeep and token use. Optional GPT-5.6 Luna review is now requested. Store compact durable state and bounded history; never resend unchanged decisions.
- GitHub/Cloudflare infrastructure deployment and additive migrations are authorized. Never print or commit credentials.

## Hosting and access
- Repository: https://github.com/jsorisho715/GridIron-Edge
- App: https://gridiron-edge.gridiron-edge-2b093f15.workers.dev/app
- Worker gridiron-edge; D1 gridiron-edge-db; binding DB.
- Deployment reads existing GitHub secrets and provisions through Actions. No Higgsfield runtime required.
- The owner reported “Connection verified and encrypted credentials saved.” Do not ask for cookies again unless real auth errors demand it.
- Cloudflare workerd rejects redirect:error. ESPN fetches use manual and reject all redirects. Regression tested in real workerd.

## Live release
- `/` and `/app` mount LiveWorkspace. Owner-gated API, live roster/scores/standings/scoring/slots.
- ESPN player cards supply league-scored projections and up to 32 completed weekly game logs; free pool 75, selected cards 120, waiver comparisons 35.
- Exact slot matching, kickoff timers, bye/out exclusion, partial estimate labels. All moves reviewed in ESPN.
- 15-minute scheduled refresh, atomic lease, 2-minute minimum refresh, exponential backoff, last-good cache, revision-safe commits, heartbeat and deduplicated alerts.
- Notes/watch/review state in D1 with optimistic conflict checks; no browser storage of private state.
- Automatically generated encrypted VAPID keys and encrypted subscriptions; generic Web Push. Enable and test per device.
- Independent GitHub health/backup workflow every 15 minutes; stale data triggers a bounded refresh and pending AI review. GitHub may disable scheduled workflows after 60 days of repository inactivity; Cloudflare sync is independent.
- Additive migration 0003, no existing credential deletion. Deployment verifies real owner login and imports data, logging counts only.

## Code map
- src/lib/football.ts: typed model, forecast, exact lineup matching, waiver options, walk-forward checks.
- espn-data.server.ts and espn-normalize.ts: bounded fixed-host fetch and normalization.
- workspace.server.ts: private API, sync, persistence and alert creation.
- push.server.ts: VAPID, encrypted subscriptions and delivery.
- espn-connection.server.ts / espn-security.server.ts: owner authentication and encrypted credentials.
- src/components/gridiron/LiveWorkspace.tsx: live workflow; src/live.css + gridiron.css: design.
- src/server.ts: scheduled handler and security headers.
- scripts/qa-live.cjs / qa-fixture.ts: synthetic browser checks; check-worker-runtime.mjs: real workerd checks.
- scripts/deploy-cloudflare.mjs: production provisioning + authenticated verification.
- Legacy gridiron.ts, Workspace.tsx and panels.tsx remain unused scaffold. Never silently reintroduce their sample data.

## Validation and limits
54 tests passed locally, typecheck/build/audit clean. Browser flows passed at 360/412/448/1440px with no page errors or tested accessibility violations. workerd gate verifies migrations, encryption, owner sessions, live import, caching, conflicts, scheduler and encrypted Web Push with synthetic data. Production verification occurs in the deployment workflow; inspect its latest result before claiming deployment success.

Physical Pixel installation and closed-app push delivery still require the owner. Predictions are uncalibrated estimates; history backtest checks the weighted baseline only. Availability flags can lag ESPN. Do not claim all NFL players are searchable, full news coverage, guaranteed accuracy, unlimited free hosting or 100% uptime.

## Continuation economy
Read this file, inspect git status and latest Actions run, then only relevant code. Reuse test fixtures. Never save real league payloads, keys or cookies into notes, screenshots or logs. Check official provider code if schema changes; do not add more paid services or switch frameworks without a concrete need.

## Decision desk update (September 14)
- User now wants AI to prioritize plans with approve/decline memory. This supersedes the former no-LLM preference.
- New decisions.ts handles whole-lineup plans, bounded waiver alternatives, conservative IR hold/activation reviews and bilateral one-for-one trade ideas. Future NFL schedules cover up to six weeks; trade baseline covers four.
- IR return dates are unknown. No automated drop recommendation based only on current injury/zero projection. Healthy-player trade scenarios omit return forecasts, opponent difficulty and acceptance probabilities.
- advisor.server.ts and migration 0004 add encrypted OpenAI key setup, structured factual review, result caching, decision memory, atomic budget reservations and stale/connection checks. Decisions are private at /api/gridiron/advisor.
- Model: gpt-5.6-luna, low reasoning, 1,536 output token cap, bounded request bytes, at most four attempts/day and two hours apart. No automatic paid fallback or retries. No API key exists until owner enters one in Settings. Calculated suggestions work without it.
- Response store:false; send only candidate facts, no cookies, league payload, private notes or chat history. Model selects factual evidence indexes, never generates unsupported claims or runs ESPN actions.
- Approval records a plan. Owner still confirms moves in ESPN; marking done is owner-reported, never an inferred transaction.
- New tests cover cost caps, concurrency, caching across approvals, invalid model outputs, redirects, stale data, trade benefit for both teams and IR uncertainty. Browser checks include decision details, approvals and secure setup.
- Existing hourly health run 34871941529 reported a missing Cloudflare heartbeat. Deployment now reads back and repairs missing cron registration. Do not claim a production heartbeat until observed.

- Production release 1e3bccf passed on run 34885098918 at 19:10 UTC: 42 assets, 12 teams, 16 roster players with history/current projection/future schedule, 0 supported decisions in week 1. No AI key configured. Primary Cloudflare heartbeat still absent; health workflow now supplies independent backup refresh with an explicit degraded-primary warning.
