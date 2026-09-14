# Gridiron Edge: live release audit

Decision desk release verified September 14, 2026, at 19:15 UTC. Independent backup health verification passed at 19:13 UTC.

[Open the app](https://gridiron-edge.gridiron-edge-2b093f15.workers.dev/app) · [Successful deployment](https://github.com/jsorisho715/GridIron-Edge/actions/runs/34885604614)

Application commit: `e421171225cc8e849691856d0893ca2c82a1f870`.
Cloudflare version: `d1144219-0919-4a01-88e1-477d6c52f71a`.
Subsequent documentation-only commits do not change the deployed application.

## Verified results

| Area | Evidence |
|---|---|
| Actual saved ESPN connection | Owner-authenticated import succeeded; credentials were not replaced |
| League coverage | 12 teams, 16 owner roster players, 9 starting slots, 268 imported players |
| Player data | All 16 roster players have completed-game history, NFL schedule data ESPN weekly projections and future NFL schedule coverage |
| Provider warnings | None returned in the verified snapshot |
| Live static loading | All 42 checked installation, JavaScript, CSS and font assets loaded |
| Tests | 57 passing tests, 420 assertions (including the added backup scheduler tests) |
| Typecheck / production build / dependency audit | Passed |
| Browser workflows | Passed at 360, 412, 448 and 1440px; no horizontal overflow or page errors in tested flows |
| Automated accessibility | No WCAG A/AA violations across nine audited states |
| Workerd runtime | D1 migrations, encrypted import, owner sessions, request caching, conflict protection, scheduler code and encrypted Web Push passed with synthetic upstream data |
| Decision desk | Private API loads; current week 1 snapshot produced zero supported upgrades. No AI key is configured; AI is disabled until owner activation. |
| Decision controls | Synthetic browser flows verify evidence expansion, approval, completion, decline and secure key form clearing. Unit tests verify persisted choices, cache reuse, stale data and concurrency protections. |
| Privacy | Anonymous live workspace access rejected; transient release-check session revoked; no private payloads or credentials logged |

The actual API import and public assets were verified from the deployment runner. Browser interaction tests used synthetic league fixtures, including delayed responses after logout. The physical Pixel was not remotely operated.

## Automation

Cloudflare’s 15-minute schedule was read back from its API and verified. Its actual heartbeat was still missing at 19:15 UTC; registration alone does not prove execution. The primary scheduler remains degraded until a heartbeat is observed.

An independent GitHub workflow now checks every 15 minutes and refreshes data older than 20 minutes. It also runs an eligible AI review through the same budgeted endpoint. It preserves an explicit warning about the primary scheduler, and fails if fresh data cannot be recovered. [Backup health verification](https://github.com/jsorisho715/GridIron-Edge/actions/runs/34885604640) passed with a three-minute-old snapshot. The recovery branch was validated with synthetic stale and failed-provider cases. GitHub schedules may be delayed and are not a timing guarantee.

Statistical calculations use no model tokens. Optional GPT-5.6 Luna reviews are cached by material evidence, with at most four paid attempts per UTC day, two hours apart, bounded inputs and 1,536 maximum output tokens. No cookies, private notes or whole-league payloads are sent. See [AI_DECISIONS.md](AI_DECISIONS.md).

## Owner device checks

1. Open the app in Chrome on the Pixel and unlock with the existing owner key.
2. Use Chrome's menu to install/add it to the home screen.
3. In app Settings, enable notifications and send a test. Close the app and confirm delivery on the phone.

No new environment variables or ESPN cookies are needed. To activate AI, add an OpenAI API key in app Settings and enable automatic reviews. API billing is separate from ChatGPT; no live model-quality claim is made before activation. Browser permission and Android delivery behavior cannot be proven by emulation. ESPN may eventually require renewed cookies through Secure connections.

## Audit fixes

The decision release adds strict model output validation, encrypted AI key storage, durable approval memory, token reservations, future schedules, conservative IR reasoning and bilateral trade checks. Deployment now waits for HTML references to match the current asset build, resolving the mixed-version rollout caught in run 34884627103.

The earlier release addresses the original workerd redirect failure and data-font CSP errors; current/history statistic merging; dedicated weekly projection reads; watched-player persistence outside the ranked free-agent pool; kickoff locks as time passes; protected player and IR-capacity rules; incomplete estimates; contrast; private responses arriving after logout; and legitimate same-origin static HTML redirects in the deployment checker.

Predictions are estimates, not guaranteed outcomes. The availability feed uses ESPN flags and news links; searches cover the imported pool. This audit records tested behavior and remaining device/runtime checks, not a claim of universal 100% uptime or correctness.
