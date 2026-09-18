# Gridiron Edge checkpoint

## Trade clarity (September 18)
- Trade cards identify the opposing manager/team and show both teams' incoming/outgoing players, total lineup gain, weekly average and expandable before/after totals. Desktop uses two columns; phones stack the sides. NFL schedules use full names with explicit bye and missing-data labels.
- Structured trade metadata is deterministic and excluded from the compact AI prompt. Existing paid call caps remain unchanged. Versioned evidence invalidates older candidate caches.
- Both sides must retain the risk-specific minimum gain; the owner's projected improvement must exceed the partner's by at least 0.5 points (rounded) over the modeled window. This is lineup utility, not market value or acceptance probability. No guaranteed advantage is claimed.
- Save trade plan records intent only; the ESPN link opens the partner's team. All cautions remain available. Names use current league metadata without forcing paid reviews for cosmetic changes.
- Validation: 72 tests / 666 assertions, typecheck/build, 15 accessibility states and browser flows at 360/412/448/1440px passed. Production deploy and verification succeeded in run 35292009617, application commit 78ae493f1fcdb45ed828b2d350af840f066028cb.

## Trash talk addition (September 16)
- My team → Opponents → Talk trash works for every league opponent in the picker.
- Two local template tones, editable draft, non-repeating six-message rotation per tone, copy success/failure feedback. No model tokens, external send, fabricated stats or injury jokes. Drafts are ephemeral and reset when switching opponents.
- Implementation: `trash-talk.ts`, `TrashTalk.tsx`. All 72 tests pass; typecheck/build pass; browser flows pass at 360/412/448/1440px with 13 clean accessibility states. Coverage includes all opponent IDs, fallback names, rotation, editing, copying and clipboard denial. Deployed and verified by successful Actions run 35133091378, application commit 919dcd70e56cee10b00d0cd2e1d7502b85e0092c.

Updated September 15, 2026. Read this first; do not reconstruct the project from chat. This file supersedes earlier Higgsfield/sample-only notes.

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
69 tests and 552 assertions passed in the release pipeline; typecheck/build/audit were clean. Browser flows passed at 360/412/448/1440px with no page errors or tested accessibility violations. The workerd gate verifies migrations, encryption, owner sessions, live import, caching, conflicts, scheduler and encrypted Web Push with synthetic data. Production verification occurs in the deployment workflow; inspect its latest result before claiming deployment success.

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

## Player intelligence update (deployed and verified September 14)
- Requirements and source audit: `INTELLIGENCE_PLAN.md`. The owner clarified that memory means runtime player/injury/decision history, not just project documentation.
- Tap-to-expand explanations, ESPN owner-name allowlist, player headshots with fallback, Opponents desk with tagged news and confirmed-vs-observed activity.
- Usage stats come from existing completed game rows. Hot/cooling requires six same-season games and sustained opportunity changes; no last-season Hot badge in week one.
- Public NFL injury and scoreboard feeds add position-specific opposing-unit context, own QB/line risks, named game totals/spreads. They never invent starter status, recovery dates or point bonuses. Individual player props, snap/route counts and confirmed depth are not connected.
- `league-intel.ts/server.ts`: one transaction request per 15min; three shared public feeds per 30min. Current ESPN injury response was 8.8MB; accept at most 12MB only for that endpoint, immediately discard expanded metadata and retain normalized facts. Credentials only reach the private league host.
- `player-memory.server.ts` + migration0005: indexed D1 change records (180d/up to10000 per scope) and true pregame forecasts (2yr), settled from completed-game logs with later scoring corrections. JSON batches of100 keep first-import database request counts bounded. Player detail lazily reads at most24 events/18 forecasts. Decision statuses/reasons saved against every involved player.
- Model receives at most two matchup facts and two memory facts per candidate. A shared fact dictionary removes duplicate evidence/cautions. Source freshness changes affect facts; cosmetic photos, manager names and unchanged timestamps do not. Paid budgets unchanged. An oversized shortlist sets an explicit no-spend status with a2h retry delay.
- Release gates: 69 tests/552 assertions, typecheck/build, real workerd with JSON batch migration/import, and 12 browser accessibility states passed at 360/412/448/1440px. Missing headshot, ownership explanation, opponent filters, manager labels and memory results were exercised.
- Production coverage: 12 manager names, 6 transactions, 50 headlines, 800 NFL injury entries, 15 games and no public feed errors. Three sampled headshots loaded.
- Cloudflare's primary scheduler heartbeat and the independent GitHub backup were both healthy in monitor run 34914931645. The owner saved and verified the optional OpenAI key on September 15; an automated monitor run must confirm its configured/enabled state independently.
- Individual live NFL player props remain outside the product because current reliable providers require a paid production plan. Scrambled trial data is not suitable for decisions. Free nflverse snap/depth data remains a possible later integration after safe identity matching and freshness validation.

## Usability release (deployed and verified September 15)
- Four primary sections replace the former eight-item navigation: Today, My team, Players and League. Roster/opponents/updates, all players/waivers and standings/settings use short contextual tabs.
- Today leads with a maximum of three verdict-first decisions, plain one-sentence impact, Approve/Skip controls and evidence behind Why. Zero supported moves reads “Your lineup looks good.”
- A compact briefing labels the current weekly phase and a deterministic Play safe/Balanced/Chase upside posture from the projected lineup gap. It is not labeled as win probability.
- Player detail uses Overview, Why, News and History tabs. The default view shows only predicted points, recent range, kickoff, opponent and plain-language ESPN ownership.
- Synthetic browser coverage verifies the four-section workflow, three-card limit, contextual tabs, player details, approval history and settings at 360/412/448/1440px with no tested accessibility violations or page errors.
- Production run 34927192745 passed 70 tests, browser/accessibility checks, 42 asset checks and private league verification. Cloudflare version `e27578ad-e111-48a0-a48b-a40a15c28ef1`.
- The encrypted OpenAI key is configured. Automatic AI review is currently disabled in owner settings; deterministic recommendations remain active.
- Public feed collection preserves last-good context when one optional ESPN request returns 403 while still ingesting successful feeds.
