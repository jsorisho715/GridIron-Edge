# Gridiron Edge working context

Start with `RELEASE_AUDIT.md` and `app/docs/PROJECT_STATE.md`. Read only relevant source after that; do not reconstruct completed work from the chat or repeat repository research.

This is the owner's private ESPN NFL companion, hosted on Cloudflare and backed by this GitHub repository. The app is React/TanStack Start, not Next.js. `app/AGENTS.md` and component template notes describe the retained original scaffold; the owner subsequently requested the current private app and migration. Preserve unused vendored/scaffold files, but do not restore sample data, Higgsfield authentication, or the scroll-scrub landing page to the live routes.

Keep the sage/forest interface accessible and usable on Pixel 8 Pro and desktop. `/` and `/app` use LiveWorkspace. ESPN access is read-only. Show missing/stale data honestly, and respect actual scoring, eligibility and kickoff locks.

Credentials belong only in the existing encrypted server storage and deployment secret settings. Never print, export or commit them. Do not store real league payloads or private notes in tests or project documentation. Keep automated processing deterministic without LLM calls.

Use targeted tests for concrete risks; typecheck and build are required for application changes. Main branch changes under app/ trigger the full automatic deployment pipeline. Root documentation-only changes do not. Check the latest successful Actions run before describing deployment status. Record new decisions and validation concisely in the checkpoint/audit.
