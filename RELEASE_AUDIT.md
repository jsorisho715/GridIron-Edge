# Gridiron Edge: live release audit

Verified September 14, 2026, at 10:50 UTC.

[Open the app](https://gridiron-edge.gridiron-edge-2b093f15.workers.dev/app) · [Successful deployment](https://github.com/jsorisho715/GridIron-Edge/actions/runs/34835006296)

Application commit: `5099b96b65913460fb385c03ce65c0114a189875`.
Cloudflare version: `93bc6c2f-ccc1-443d-83a6-aec181e31ac2`.
Subsequent documentation-only commits do not change the deployed application.

## Verified results

| Area | Evidence |
|---|---|
| Actual saved ESPN connection | Owner-authenticated import succeeded; credentials were not replaced |
| League coverage | 12 teams, 16 owner roster players, 9 starting slots, 268 imported players |
| Player data | All 16 roster players have completed-game history, NFL schedule data and ESPN weekly projections |
| Provider warnings | None returned in the verified snapshot |
| Live static loading | All 42 checked installation, JavaScript, CSS and font assets loaded |
| Tests | 46 passing tests, 331 assertions |
| Typecheck / production build / dependency audit | Passed |
| Browser workflows | Passed at 360, 412, 448 and 1440px; no horizontal overflow or page errors in tested flows |
| Automated accessibility | No WCAG A/AA violations across eight audited states |
| Workerd runtime | D1 migrations, encrypted import, owner sessions, request caching, conflict protection, scheduler code and encrypted Web Push passed with synthetic upstream data |
| Privacy | Anonymous live workspace access rejected; transient release-check session revoked; no private payloads or credentials logged |

The actual API import and public assets were verified from the deployment runner. Browser interaction tests used synthetic league fixtures, including delayed responses after logout. The physical Pixel was not remotely operated.

## Automation

Cloudflare is configured to sync every 15 minutes, with job leases, bounded retries, deduplicated availability alerts, last-good data preservation and explicit freshness. Routine work makes no LLM calls. GitHub runs release tests automatically and independently checks private sync/heartbeat hourly.

The first real Cloudflare cron heartbeat was not yet observed at the 10:50 UTC verification. Cron configuration changes can take up to 15 minutes to propagate before an eligible scheduled time. The independent health workflow will flag missing heartbeats; scheduler configuration is not evidence that its first production invocation has already occurred. No additional owner configuration is required.

## Owner device checks

1. Open the app in Chrome on the Pixel and unlock with the existing owner key.
2. Use Chrome's menu to install/add it to the home screen.
3. In app Settings, enable notifications and send a test. Close the app and confirm delivery on the phone.

No new environment variables, ESPN cookies or API subscriptions are needed. Browser permission and Android delivery behavior cannot be proven by emulation. ESPN may eventually require renewed cookies through Secure connections.

## Audit fixes

The release addresses the original workerd redirect failure and data-font CSP errors; current/history statistic merging; dedicated weekly projection reads; watched-player persistence outside the ranked free-agent pool; kickoff locks as time passes; protected player and IR-capacity rules; incomplete estimates; contrast; private responses arriving after logout; and legitimate same-origin static HTML redirects in the deployment checker.

Predictions are estimates, not guaranteed outcomes. The availability feed uses ESPN flags and news links; searches cover the imported pool. This audit records tested behavior and remaining device/runtime checks, not a claim of universal 100% uptime or correctness.
