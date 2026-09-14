# Live workspace release audit

September 14, 2026. Automated checks reduce regressions; they do not prove universal perfect behavior.

| Check | Local result |
|---|---|
| Typecheck and production build | Passed |
| Unit/integration suite | 46 tests, 331 assertions passed |
| Dependency audit | No known advisories returned |
| Desktop + mobile browser workflows | Passed at widths 360, 412, 448 and 1440 |
| JavaScript page errors / horizontal overflow | None in tested workflows |
| Automated WCAG A/AA checks | Zero violations across eight audited states |
| Workerd runtime | Provider access errors, D1 migrations, encrypted import, sessions, cache, write conflicts, scheduler and encrypted Web Push passed |
| Production owner import | Required automatically after deployment; inspect latest Actions result |
| Physical Pixel installation / closed-app push | Owner device check required |

Browser checks cover the owner gate, Today, lineup modal and Escape, player search, comparison, watching, saved notes across reloads, phone navigation, waivers, reports, standings and preserved UI during provider errors. Fixtures are synthetic. Real ESPN cookies are never used in browser test fixtures or output artifacts.

```sh
bun run typecheck
bun test tests/*.test.ts
bun run build
bun audit
# Install Playwright 1.62.1 and @axe-core/playwright 4.13.0 outside the app bundle.
SPAWN_QA_SERVER=1 PLAYWRIGHT_MODULE=/absolute/path/to/playwright AXE_MODULE=/absolute/path/to/@axe-core/playwright node scripts/qa-live.cjs
```

CI installs the browser and runs this command on every release. Set CHROMIUM_PATH only when using an existing Chromium binary. The runtime gate uses the Miniflare shipped with pinned Wrangler 4.131.1 and runs before production mutation.

Production verification checks secure readiness, the connection screen, unauthenticated workspace denial, transient owner login, actual saved-credential import and matching league/team identity. Only aggregate coverage counts are logged. The verification session is revoked afterward. The independent health workflow checks fresh snapshots and cron heartbeats hourly.

Audit fixes included low-contrast labels, stale kickoff locks while a page remains open, misleading partial totals, failed sync preservation, concurrent preference writes, redirect refusal and batched alert writes. Physical push delivery, ESPN data correctness and all possible custom league rules cannot be established by automated browser emulation.
