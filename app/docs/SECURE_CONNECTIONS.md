# Secure connection contract

Current app: [Secure connections](https://gridiron-edge.gridiron-edge-2b093f15.workers.dev/connections). The owner confirmed successful production verification on September 14, 2026. GitHub Actions holds the deployment secrets; Cloudflare stores encrypted ESPN cookies. No Higgsfield setup is required.

Defaults: league 10309566, team 25, season 2026. The form only needs SWID and espn_s2 after owner login. Never request an ESPN password or ask for cookies in chat.

## Authentication

One owner; seven-day server-side sessions. Cookie `__Host-ge_owner` is Secure, HttpOnly, SameSite=Strict and Path=/. D1 contains only keyed session hashes. Login rotates the current browser session; logout revokes it. Rotating OWNER_ACCESS_KEY invalidates all sessions.

Every private read/write checks owner authentication. Mutations require same-origin Origin/Fetch Metadata and bounded JSON. Login has atomic per-IP and global throttles. Public readiness reveals only configuration readiness. Credential inputs are uncontrolled, cleared after submission/pagehide, and excluded from state, storage, exports and logs. No design inspector is installed. Production CSP refuses framing and browser API requests to other origins.

## Encryption and concurrency

AES-256-GCM uses a fresh 96-bit nonce per save and authenticated versioned context. Cookies and league identifiers are encrypted. Sanitized names, IDs and verification time are stored separately as owner-only metadata. No credential fragments can be recovered from the UI.

Verification happens before replacement. Failed replacements preserve the old encrypted record. Conditional revision checks prevent stale overwrites and prevent a slow sync from reviving a disconnected connection. Disconnect requires confirmation and removes the saved cookie record; it does not log out the ESPN account. Cached data and scoped notes are retained server-side but not served without a matching active connection.

## Recovery

Existing GitHub Actions secrets are `OWNER_ACCESS_KEY`, `CREDENTIAL_ENCRYPTION_KEY`, and `CLOUDFLARE_API_TOKEN`. To recover a lost owner key, change only OWNER_ACCESS_KEY and redeploy. Do not change only the Cloudflare copy because the next deploy replaces it from GitHub. Store the new key in a password manager.

Changing CREDENTIAL_ENCRYPTION_KEY makes prior cookies and Web Push envelopes unreadable. A deliberate encryption-key rotation requires re-entering ESPN cookies and resetting encrypted push configuration/subscriptions before enabling notifications again. No secret recovery mechanism exists. Routine releases preserve both keys and saved credentials.

## Provider and notification boundaries

ESPN calls use fixed HTTPS hosts and GET-only views. `redirect:manual` rejects redirects without forwarding cookies. Requests have a 15-second timeout and bounded bodies (2 MiB verification, 6 MiB data import). Auth and provider errors return safe messages without raw bodies or credentials. The interface is unofficial and can change.

Web Push automatically generates VAPID keys, encrypts the private key and device subscriptions, limits registration to five devices and sends only to approved browser push hosts. Notification text is generic. Browser/OS permission and closed-app delivery must be checked on the device. Owner login is still required to read the league after opening a notification.

## Code and regression checks

`espn-security.server.ts`, `espn-provider.server.ts`, `espn-connection.server.ts` implement the core boundary. `workspace.server.ts` adds private data and revision-safe sync; `push.server.ts` adds encrypted push. Migrations 0002 and 0003 are additive. Unit tests and the real workerd deployment gate cover encryption, session lifecycle, redirects, rate limiting, bounded requests and race conditions. See QA.md for current results.
