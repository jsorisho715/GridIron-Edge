# Product requirements: Gridiron Edge v1

Updated September 14, 2026. Accepted context: one private ESPN NFL league, league 10309566, team 25, season 2026. Primary owner uses a Pixel 8 Pro and desktop. Private and unlisted; no community publication.

## Goal and workflow

Help the owner review the league quickly, spot availability changes and compare decisions using real league scoring and historical evidence. Today prioritizes flagged starters, lineup opportunities and the current matchup. Team reviews starters and reserves. Players supports search, watching and two-player comparison. Waivers models potential lineup gains and a drop. Reports explains changes. League provides standings, schedule and prediction checks. Settings holds automation, notifications, installation and durable notes.

## Required behavior

1. Authenticate before exposing any league data. Store only encrypted ESPN cookies server-side. Never submit fantasy transactions.
2. Import actual league slots, scoring, roster ownership, matchups and free-agent state. Show timestamps, errors, partial coverage and stale data explicitly.
3. Refresh automatically every 15 minutes. Lease each job, back off failures, preserve the last good snapshot and expose an independently checked heartbeat.
4. Preserve started or unknown-schedule players in their slots. Reevaluate locks when kickoff passes while a page remains open. Respect eligible slots, out statuses and byes.
5. Calculate deterministic estimates from 70% ESPN's league-scored projection and 30% weighted recent completed games where both exist. Fall back transparently. Never substitute fictional results or invent confidence probabilities.
6. Persist notes, watchlists and reviewed changes in D1 across devices. Detect conflicting writes.
7. Notify opted-in devices about tracked status changes and flagged starters near kickoff. Keep lock-screen text generic. Browser permission is an explicit owner action.
8. Provide touch-friendly responsive screens, keyboard controls, accessible modal dialogs, safe loading/retry/empty states and an installable PWA. Do not cache private data offline.
9. Run typecheck, tests, build, dependency and browser accessibility checks before deploy; verify a real authenticated import after deploy without logging private payloads.

## Scope boundaries

The initial search pool contains all imported league rosters plus 75 free-agent candidates. History prioritizes the owner, opponent, leading free agents and watchlist, capped at 120 player cards per sync. Waiver comparisons evaluate up to 35 candidates and model immediate lineup gain, not dynasty value or waiver success probability. Injury reports show provider availability flags and links to ESPN news, not medical predictions or an independently staffed news feed. ESPN's interface is unofficial and can change.

No public profiles, paid feed, chat agent, automatic transactions, trade execution, native Play Store binary, guaranteed fantasy accuracy or guaranteed push delivery. The app does not claim a verified fan-voted ranking of fantasy winners.

## Success criteria

A connected owner can load actual league data, identify a flagged starter, inspect history, compare two players, review eligible moves and save notes from desktop or phone. Unauthenticated requests cannot read that data. Failed syncs remain visible without erasing last-good data. Routine operation requires zero LLM tokens. Physical installation and closed-app notification delivery require one owner test on the Pixel.
