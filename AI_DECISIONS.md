# Private decision desk

The owner requested prioritized, explained recommendations with approve/decline controls and minimal token use. This replaces the earlier preference for no LLM dependency. The app remains useful without an AI key.

## Workflow

Open Today to review the next moves. Each card names the action, time horizon, evidence and cautions. Approving saves a plan across devices. Review it in ESPN to make the actual move. Mark done records the owner's confirmation; it is not automatic verification that ESPN accepted a transaction. Alternatives may conflict, so sync after making a move before acting on another plan.

| Decision | Evidence and limits |
|---|---|
| Lineup | One complete plan respects ESPN slot eligibility and kickoff locks, including FLEX chains. It compares ESPN projections blended with weighted completed-game history. |
| Waivers | A bounded shortlist measures improvement after optimizing the existing bench. Drop candidates must be droppable, unlocked and outside IR. The app does not forecast waiver success or bypass ESPN limits. |
| IR | Shows upcoming games and a healthy scoring baseline. Without a verified return date, the recommendation is conservative hold/review, not an automatic release. An IR release does not create normal roster capacity. |
| Trades | Bounded one-for-one ideas require estimated starter improvement for both teams over the next four weeks. Uses known schedules/byes and healthy-player baselines. Does not model injury returns, opponent strength or acceptance probability. Missing evidence can suppress all trade ideas. |

## Model and activation

The chosen model is `gpt-5.6-luna` with low reasoning. It reviews a compact candidate set and selects existing evidence to justify its ranking. Calculations and eligibility checks are deterministic. Model responses cannot introduce new players, fabricated numeric improvements or return dates because the accepted schema contains only candidate IDs, priorities, verdicts and evidence indexes.

The [official model page](https://developers.openai.com/api/docs/models/gpt-5.6-luna) documents structured outputs and cost-sensitive workloads. This is a design choice, not a claim that fantasy decision quality has been validated against a live model. Live inference requires the owner's API key.

1. Create an API key at [OpenAI API keys](https://platform.openai.com/api-keys). API billing is separate from ChatGPT.
2. Open [app Settings](https://gridiron-edge.gridiron-edge-2b093f15.workers.dev/app?tab=settings), enter it in the AI form and enable automatic reviews.
3. Save. The app checks model access without generating tokens and encrypts the key with the existing server encryption key. The input clears after submission.

No new environment variable is required. Never place this key in source, browser storage, chat or logs. The Responses request uses `store:false`; the provider's separate API data retention policies still apply.

## Token and memory controls

- At most four attempted paid requests per UTC day, at least two hours apart. Failure still consumes a slot. No automatic model escalation or retry loop.
- At most 1,536 generated tokens per request; serialized request bounded to 18,000 UTF-8 bytes with 20,000 tokens reserved per attempt. Actual provider-reported usage is recorded separately.
- Atomic D1 lease and budget reservation prevent concurrent tabs or cron events from duplicating calls.
- Results are keyed by relevant candidate evidence and engine/model version. Sync timestamps and live scores do not invalidate the review. Approving one item preserves the review for unchanged remaining items.
- Durable approval/decline memory applies to the same decision and evidence fingerprint. Changed recommendations can resurface. No chat transcript is accumulated or resent.
- Only candidate facts and the explicit risk preference go to the model. ESPN cookies, private notes and whole-league payloads do not.
- AI stays optional. Invalid responses, quota errors, missing keys and cooldowns leave statistical suggestions available. The UI distinguishes calculated suggestions from completed AI reviews.

## Verification boundaries

Automated tests cover authentication, encrypted keys, model redirects and invalid output, daily limits, concurrent requests, approval caching, stale data, IR uncertainty and bilateral trade gains. Browser tests cover explanations, approvals, completion, secure setup and responsive layouts. Deployment checks the actual private API and aggregate league coverage without logging credentials or private league payloads.

Actual model quality and billing cannot be verified before activation. The decision formulas are estimates, not calibrated predictions. No app can guarantee an injury recovery, future score or trade acceptance.
