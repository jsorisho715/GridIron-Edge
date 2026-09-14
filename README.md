# Gridiron Edge

A personal NFL fantasy football companion built with React 19, TypeScript,
TanStack Start and Cloudflare Workers/D1. The app lives in `app/`.

## Migration status

Source migrated from the saved Higgsfield project at commit `684d27b`.
The application source, assets, vendored packages, lockfile, SQL migrations,
tests and project notes are retained. Existing Git history is not imported.

The original CI workflow requires private Higgsfield runners and is preserved at
`app/docs/migration/higgsfield-ci.yml.reference`. It is intentionally inactive.
No GitHub Actions or automatic deployment is configured by this migration.

Moving source into GitHub does not move hosting, databases or secrets.
The current Higgsfield deployment is unchanged. No production credentials or
database records are included in this repository.

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

## Hosting setup still required

Cloudflare Workers and D1 match the existing runtime. The included
`app/wrangler.jsonc` is an original template configuration, not a ready production
deployment. Configure a Worker and D1 database in the owner's account, replace
the placeholder configuration, apply the migrations and configure server secrets:

* `OWNER_ACCESS_KEY`: cryptographically random, 32 to 256 characters.
* `CREDENTIAL_ENCRYPTION_KEY`: 64 hexadecimal characters, representing 32 bytes.

Store values only in the hosting secret settings. ESPN cookies must be entered
through the activated owner connection screen, never committed to GitHub.
Generated build output, local environment files and credential files are ignored.

Before enabling deployment, update the host-specific setup instructions and URLs
in the app to match the new hosting account. Do not claim the move is a live
deployment or that private ESPN monitoring is running.

## Project memory

Start with this README, then read:

* `app/docs/PROJECT_STATE.md`
* `app/docs/SECURE_CONNECTIONS.md`
* `app/docs/QA.md`
* `app/docs/UI_RESEARCH.md`

Those documents describe the source release. Their Higgsfield-specific activation
steps are historical and must be adapted for the new host.
