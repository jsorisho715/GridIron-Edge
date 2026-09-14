> Current deployment: [Gridiron Edge](https://gridiron-edge.gridiron-edge-2b093f15.workers.dev/connections). GitHub Actions is the source of deployment secrets. The owner has verified and saved the production ESPN connection. Earlier Higgsfield activation and sample-only notes below are historical; README and PROJECT_STATE.md supersede them. No additional hosting setup is required for live monitoring.

# Secure ESPN connection — implementation checkpoint

## Release boundary
The owner-only connection screen is implemented at /connections and linked from
workspace Settings. It verifies and saves ESPN access only. The dashboard remains
fictional sample data. No scheduled sync, injury monitoring, alerts, full roster
import, transaction submission or live recommendations are enabled.

Non-secret defaults: league 10309566, team 25, season 2026.
Private league URL:
https://fantasy.espn.com/football/team?leagueId=10309566&teamId=25&seasonId=2026

## One-time activation
As checked on 2026-09-13, the host reports no configured secret names.
Configure these through the website's Higgsfield secret settings, not through chat:
- OWNER_ACCESS_KEY: 32–256 characters of cryptographically random material.
- CREDENTIAL_ENCRYPTION_KEY: exactly 64 hexadecimal characters / 32 random bytes.

The locked screen includes an optional local-only generator for two independent
64-hex keys and explicit copy buttons. It does not configure hosting. Save keys in
a password manager, add them to host settings, and deploy again. Do not regenerate
keys already configured unless deliberately rotating them.

The app manifest enables D1. Migration 0002_secure_espn.sql is additive and must be
applied by deployment. No keys, missing DB, or missing schema => fail closed.
No first-visitor bootstrap or public signup exists.

After activation: unlock using the owner key, paste SWID and espn_s2, consent to
the read-only check, and select Verify & save connection. Never enter an ESPN
password. Never ask the owner to put cookies or hosting secrets in chat.

## Auth and data boundary
- One owner, server-side sessions, seven-day expiry, no sliding extension.
- Cookie: __Host-ge_owner; Secure; HttpOnly; SameSite=Strict; Path=/.
- Database stores only keyed session hashes. Login rotates the current session.
- Logout revokes the current session. Rotating OWNER_ACCESS_KEY invalidates all.
- Same-origin Origin + Fetch Metadata checks on every mutation; JSON only.
- Atomic per-IP and global login limits; bounded provider checks; expired limits
  cleaned on login. CF-Connecting-IP is trusted only as supplied by the host.
- Every private read/write checks owner auth. Unauthenticated status omits league
  metadata. Public setup returns readiness and missing binding names only.
- Credential fields are uncontrolled DOM inputs, never React state/props,
  browser storage, exported files or app logs. Submit and pagehide clear fields.
- The design inspector is not installed on /connections.
- Secret values are sent only in same-origin POST bodies and server-to-ESPN
  Cookie headers. They are never returned by the API.

## Encryption and concurrency
AES-256-GCM, random 96-bit nonce per save, external key, authenticated versioned
context. Both cookies and league IDs are in the encrypted envelope.
Only owner-visible, sanitized metadata (names, IDs, verification time) is separate.
No credential suffixes or recoverable UI values are displayed.

Verify submitted credentials before saving. Failed replacements preserve the
old encrypted record. Revision checks plus conditional writes prevent stale tabs
from overwriting newer saves. Delete requires explicit confirmation and revision.
Disconnect removes this app's stored record, not ESPN's session or account data.
Encryption-key rotation makes previous encrypted credentials unreadable; replace
cookies or disconnect/reconnect. There is no secret recovery feature.

## Provider boundary
Fixed GET endpoint at lm-api-reads.fantasy.espn.com:
 /apis/v3/games/ffl/seasons/{year}/segments/0/leagues/{leagueId}
Views: mSettings and mTeam. No caller-controlled host, path or view.
Redirects rejected, 15-second timeout, response capped at 2 MiB.
Requests capped at 12 KiB. UUID/cookie syntax, season and IDs validated.
Matching league/season/team required; names limited to 160 characters.
No ESPN response body, upstream error or credential is logged or echoed.

The endpoint is unofficial and can change or stop working. The test verifies
read access to the requested league/team, not a legal ownership attestation.
It does not parse custom scoring or populate the decision dashboard.

## Code map
- src/lib/espn-security.server.ts: crypto, config checks, bounded body reading.
- src/lib/espn-provider.server.ts: input validation and read-only ESPN adapter.
- src/lib/espn-connection.server.ts: dependency-injected protected API handler.
- src/lib/espn-runtime.server.ts: actual host bindings; local Vite fails closed.
- src/routes/api/gridiron/connection.ts: GET status; POST login/save/test/logout/disconnect.
- src/components/gridiron/Connections.tsx + src/connections.css: desktop/phone UI.
- migrations/0002_secure_espn.sql: sessions, rate limits, encrypted connection.
- tests/espn-connection.test.ts: 13 security tests using in-memory SQLite and
  synthetic transport, not real credentials or production data.
- scripts/qa-connections.cjs: local Playwright UI regression tests with synthetic
  API responses. Set PLAYWRIGHT_MODULE if Playwright is globally installed.

## Verification and limits
All 27 repository tests pass (125 assertions), including 13 connection tests.
Production build, typecheck and dependency audit pass.
Local 1440px desktop and 412px phone checks pass: setup, key generator, login,
prefilled IDs, error handling, cleared secrets, save/test/replace/delete/logout,
no secret persistence, no horizontal overflow and no page errors.
Desktop and phone screenshots visually reviewed.

Live private ESPN access and real Pixel hardware remain untested. The hosting
secrets are not configured; do not claim successful live credential activation.
The local development preview intentionally has no production bindings.
Production deployment must follow after secret changes.

## Continuation economy
Read PROJECT_STATE.md and this file before touching connection code. Reuse the
13 security tests and the UI harness; do not repeat broad repository research.
No LLM calls exist in login, encryption, connection checking or sample calculations.
Future monitoring must use deterministic scheduled jobs with deduplication and
backoff, not recurring model polling. Store compact state, not repeated payloads.

Provider reference: https://github.com/cwendt94/espn-api/wiki/League-Class
Crypto reference: https://developers.cloudflare.com/workers/runtime-apis/web-crypto/
