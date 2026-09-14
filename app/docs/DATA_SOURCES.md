# Data sources and repository audit

Reviewed September 14, 2026. The implementation uses ESPN's existing private league interface without a paid data subscription. It is an unofficial integration, with no uptime or schema guarantee. Cookies remain encrypted server-side. Sources do not receive notes or owner keys.

## Current integration

- League endpoint: `lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{season}/segments/0/leagues/{league}`. Roster, settings, teams, standings, scores, matchup, player pool and player cards.
- Public season endpoint: `.../seasons/{season}?view=proTeamSchedules_wl`. NFL schedule, kickoff and bye information. No private cookies sent to this endpoint.
- Player history and projections use ESPN `appliedTotal`, preserving the league's scoring. Historical rows exclude future/current outcomes and aggregate periods.
- Availability flags come from player data; detailed news is opened directly in ESPN.

## Five relevant public repositories

This is a technical shortlist, not a fan poll or proof of fantasy winning performance. No independently verified comparable fan-voted “top five winners” ranking was established. GitHub stars measure repository interest and cannot validate forecast accuracy.

| Repository | Relevant use | Decision |
|---|---|---|
| [cwendt94/espn-api](https://github.com/cwendt94/espn-api) | Private ESPN league access and field/reference behavior | Provider reference for this integration |
| [nflverse/nflverse-data](https://github.com/nflverse/nflverse-data) | Automated NFL dataset releases | Future longer-term historical enrichment; not a live injury dependency |
| [nflverse/nflfastR](https://github.com/nflverse/nflfastR) | NFL play-by-play tooling | Future research, not required for the small private app |
| [ffverse/ffscrapr](https://github.com/ffverse/ffscrapr) | Fantasy platform API clients | Alternative integration reference |
| [FantasyFootballAnalytics/ffanalytics](https://github.com/FantasyFootballAnalytics/ffanalytics) | Fantasy projection analysis tooling | Research reference; no code or accuracy claims imported |

UI references are documented separately in [UI_RESEARCH.md](UI_RESEARCH.md). All five repository pages were accessible during review. This shortlist does not promise that every external pipeline is working or current for every dataset.

## Operating limits

Four ESPN reads per successful sync, capped optional pools and bounded response size. Automatic 15-minute refresh means provider changes may appear with a delay. No repeated LLM prompts: calculations execute deterministically and preferences are persisted once changed.

[Cloudflare documents](https://developers.cloudflare.com/workers/platform/limits/) a 10ms CPU budget and 50 subrequests per free Worker invocation. Waiting for network I/O does not consume CPU. Heavy lineup calculations run in the browser; alerts are batched. Hosting remains subject to actual account quotas. [Cron changes](https://developers.cloudflare.com/workers/configuration/cron-triggers/) can take up to 15 minutes to propagate.
