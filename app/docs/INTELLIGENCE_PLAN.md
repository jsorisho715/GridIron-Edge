# Player intelligence and memory plan

Owner requirements, September 14, 2026. This is implementation memory, not a substitute for runtime player memory.

## Required outcome
A private, easy-to-read decision desk on Pixel and desktop. Explain numbers with concrete examples. Show ESPN manager names with team names, player photos, opponent player news, completed trades/pickups/drops and observed lineup changes. Show grounded workload badges. Account for real NFL matchup injuries and available game betting lines. Retain player history, injury changes, prior decisions and prediction outcomes across visits and devices. Make the next action clear without silently executing an ESPN transaction.

## Data and design audit
- Manager names: allowlisted first/last names, fallback ESPN display name, explicit missing label. Never expose member objects, emails or SWIDs.
- Transactions: ESPN communication feed with transaction-only filter. Trades require type 244. Roster differences alone are observations, not confirmed trades. No private offers or pending claims.
- News: one global ESPN NFL feed, at most 100 headlines; match athlete/team tags locally. The athlete query parameter was observed to be ignored. Label exact player stories versus broader team context. No automatic headline-to-injury inference.
- Photos: ESPN public athlete headshot CDN, numeric IDs, lazy load, anonymous/no referrer, initials fallback; defenses are team identities.
- Usage: existing completed game stat rows provide attempts, carries, targets, catches, yards and touchdowns when returned. Missing is not zero. Same-season three-game averages compared with the preceding three. Hot/cooling requires >=20% plus position-specific absolute change and two of three games corroborating. Early season cannot earn a current-season Hot badge from last year.
- NFL matchup: public team injury list including linemen and defenders, matched to the player's actual NFL opponent. Separate Out/IR from Questionable. Starting role and expected replacement quality are not inferred from raw injury counts. Report dates and upcoming-game matching matter.
- Markets: public ESPN scoreboard supplies game totals/spreads and a named sportsbook where available. Game points are not fantasy points. A total/prop line is not an expected value or guaranteed result. Individual player props are not yet a verified free feed.
- Forecast: current ESPN/history blend remains uncalibrated. New usage, injury and market facts explain/caution a recommendation; no invented numerical boost. Save future pre-kickoff forecasts and actual outcomes to measure real error before changing coefficients.

## Runtime memory, not repeated model context
- Existing D1 keeps connection, private notes, watchlist, decision approvals and cached AI reviews.
- Add durable player observation history, meaningful injury/role/roster transitions and latest pregame forecast per player/week. Settle actual results from later completed-game imports. Preserve observation timestamps and source.
- Store normalized facts and short change records, not full articles, prompts, cookies or duplicate snapshots. Bounded retention and indexed lookups.
- Include only a short relevant player history in a decision. No manager names, whole-league payloads or article dumps in the model input.

## Budgets
- League import: existing five bounded requests; transactions at most once/15min; news and NFL context at most once/30min, reused across all players. No per-player news polling.
- Atomic sync lease, 2min minimum refresh, backoff, paused monitoring respected. Optional source failure preserves saved data and reports its age/error.
- UI refresh reads saved data; images and basic math consume no AI tokens.
- Existing optional GPT-5.6 Luna: changed candidate fingerprint only, <=4 attempts/UTC day, >=2h spacing, <=18KB request and 1536 output tokens; store:false. No paid fallback or automatic retry loop.
- Candidate-specific memory/context has a fixed fact cap. New sync timestamps, images and unchanged headlines do not invalidate AI review.

## Execution and release gates
1. Complete safe normalization, optional-source caching, player memory and context selection.
2. Finish tap explanations, photos, opponent desk, usage/matchup details and clear next step.
3. Test false-trade prevention, missing stats, trend thresholds, news/position/game matching, stale feeds, forecast leakage, memory deduplication and AI cache reuse.
4. Run typecheck, unit tests, build, real workerd and browser/a11y flows at Pixel/desktop sizes. Test image failure and help expansion.
5. Deploy through existing GitHub Actions, verify real data coverage as aggregate counts only, then update release audit. No new cookies required; do not assert zero missing data or guaranteed forecast accuracy.

Status: implementation and local validation complete; deployment verification pending. Runtime player memory retains changes for180days (up to10000 per league scope) and pregame forecasts/results for2years. News references and decisions are preserved as short records. SQL writes batch100 records per query. Individual player props, snap/route participation, confirmed starter depth and independently calibrated matchup effects remain future integrations until a reliable source and evaluation support them.
