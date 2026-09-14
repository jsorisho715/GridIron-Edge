# Gridiron Edge

A personal NFL fantasy football companion built with React 19, TypeScript,
TanStack Start and Cloudflare Workers/D1. The app lives in `app/`.

## Migration status

Source migrated from the saved Higgsfield project at commit `684d27b`.
The application source, assets, vendored packages, lockfile, SQL migrations,
tests and project notes are retained. Existing Git history is not imported.

The original CI workflow requires private Higgsfield runners and is preserved at
`app/docs/migration/higgsfield-ci.yml.reference`. It is intentionally inactive.
GitHub Actions now deploys changes under `app/` on `main` to Cloudflare using
`.github/workflows/deploy.yml` and `app/scripts/deploy-cloudflare.mjs`.

Production runs at https://gridiron-edge.gridiron-edge-2b093f15.workers.dev.
The Worker is `gridiron-edge`; D1 is `gridiron-edge-db` with binding `DB`.
No production credentials or database records are included in this repository.

## What works

* Responsive desktop and phone interface, including a Pixel-sized layout.
* Fictional sample roster, lineup review, player comparisons, watchlists and notes.
* Owner login and encrypted ESPN connection storage implementation.
* Read-only ESPN verification with session protection and bounded requests.

The dashboard still uses fictional sample data. Live league import, scheduled
sync, real injury monitoring, notifications and production model validation
remain unfinished. ESPN credentials have not been verified in production.

## Local development

Use Node 22 and Bun. Run from the app directory:

```sh
cd app
bun install --frozen-lockfile
bun run dev
```

Local Vite deliberately leaves the live connection locked without production
bindings. Development does not load real credentials.

## Validation

```sh
cd app
bun run typecheck
bun test tests/*.test.ts
bun run build
bun audit
```

The source release passed 27 tests, typecheck, production build and dependency
audit before migration. Its desktop and mobile UI checks also passed.
The migration preserves app code without functional changes.

## Hosting configuration and recovery

The deployment script generates the production configuration, reuses or creates
D1, applies additive migrations, deploys both secrets, then checks readiness.
`app/wrangler.jsonc` is a local template, not the production configuration.
Store these repository Actions secrets in GitHub:

* `OWNER_ACCESS_KEY`: cryptographically random, 32 to 256 characters.
* `CREDENTIAL_ENCRYPTION_KEY`: 64 hexadecimal characters, representing 32 bytes.
* `CLOUDFLARE_API_TOKEN`: the deployment token for the owner's Cloudflare account.

Repository Actions variables are `CLOUDFLARE_ACCOUNT_ID` (the owner's account),
`APP_SLUG=gridiron-edge` and `HF_ENV=production`.
To recover a lost owner login, replace only `OWNER_ACCESS_KEY` in GitHub and
run the deploy workflow on `main`. Do not change only the Cloudflare copy;
the next deployment replaces it from GitHub. Changing the encryption key makes
previously saved cookies unreadable. Keep private backups in a password manager.
ESPN cookies must be entered through `/connections`, never committed to GitHub.
Generated build output, local environment files and credential files are ignored.

Some original setup text still refers to Higgsfield. These GitHub/Cloudflare
instructions supersede that historical text. Live monitoring is not implemented.

## ESPN verification regression, 2026-09-14

Cloudflare workerd rejects `redirect: "error"` before sending a request, causing
the previous generic 502. The provider now uses `manual` and refuses all 3xx
responses without forwarding cookies. A workerd regression gate runs before
deployment using synthetic responses and the runtime included in pinned Wrangler.
Unit tests alone did not catch this runtime difference. Bundled fonts are emitted
as same-origin files because the production CSP does not allow data-URL fonts.
Actual private ESPN cookie validity still requires an owner connection test.

## Project memory

Start with this README, then read:

* `app/docs/PROJECT_STATE.md`
* `app/docs/SECURE_CONNECTIONS.md`
* `app/docs/QA.md`
* `app/docs/UI_RESEARCH.md`

Those documents describe the source release. Their Higgsfield-specific activation
steps are historical and must be adapted for the new host.
