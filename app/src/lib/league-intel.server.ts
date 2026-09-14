import { boundedText } from './espn-security.server';
import { readESPN } from './espn-data.server';
import type { ESPNInput } from './espn-provider.server';
import type { Snapshot } from './football';
import { mergeActivity, normalizeNews, normalizeTransactions, observedChanges, type LeagueIntel } from './league-intel';
import { gameWindow, normalizeNFLGames, normalizeNFLInjuries } from './nfl-context';

async function publicNFL(path: string, transport: typeof fetch) {
  const response = await transport('https://site.api.espn.com/apis/site/v2/sports/football/nfl/' + path, {
    headers: { Accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(15000),
  });
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) { await response.body?.cancel(); throw new Error(); }
  // Injury responses embed large athlete/team metadata (8.8 MB observed).
  // Normalize immediately; never persist that expanded response.
  return JSON.parse(await boundedText(response, (path==='injuries'?12:6) * 1024 * 1024));
}

export async function enrichLeague(s: Snapshot, previous: Snapshot | null, input: ESPNInput, transport: typeof fetch, now: number): Promise<LeagueIntel> {
  const prior = previous?.intel;
  const intel: LeagueIntel = { trackingSince: prior?.trackingSince ?? now, activity: prior?.activity ?? [], news: prior?.news ?? [],
    transactions: { ...(prior?.transactions ?? { checkedAt: null, attemptedAt: null, error: null }) },
    headlines: { ...(prior?.headlines ?? { checkedAt: null, attemptedAt: null, error: null }) } };
  let transactions = [] as LeagueIntel['activity'];
  const empty = () => ({ checkedAt: null, attemptedAt: null, error: null });
  const window = gameWindow(s), oldNFL = prior?.nfl;
  const nfl = { injuries: oldNFL?.injuries ?? [], games: oldNFL?.gameWindow === window ? oldNFL.games : [],
    injuryFeed: { ...(oldNFL?.injuryFeed ?? empty()) }, marketFeed: { ...(oldNFL?.gameWindow === window ? oldNFL.marketFeed : empty()) }, gameWindow: window };
  intel.nfl = nfl;
  await Promise.all([
    (async () => {
      if (intel.transactions.attemptedAt && now - intel.transactions.attemptedAt < 15 * 60000) return;
      intel.transactions.attemptedAt = now;
      try {
        const raw = await readESPN(input, 'activity', { view: 'kona_league_communication' }, { topics: {
          filterType: { value: ['ACTIVITY_TRANSACTIONS'] }, limit: 50, limitPerMessageSet: { value: 25 }, offset: 0,
          sortMessageDate: { sortPriority: 1, sortAsc: false }, sortFor: { sortPriority: 2, sortAsc: false },
          filterIncludeMessageTypeIds: { value: [178, 180, 179, 239, 181, 244] },
        } }, transport);
        transactions = normalizeTransactions(raw, s, previous, now);
        intel.transactions.checkedAt = now; intel.transactions.error = null;
      } catch { intel.transactions.error = 'ESPN transactions could not be refreshed. Saved activity remains visible; new roster changes are still compared after each league refresh.'; }
    })(),
    (async () => {
      if (intel.headlines.attemptedAt && now - intel.headlines.attemptedAt < 30 * 60000) return;
      intel.headlines.attemptedAt = now;
      try {
        // This public request must never receive private ESPN cookies.
        intel.news = normalizeNews(await publicNFL('news?limit=100', transport));
        intel.headlines.checkedAt = now; intel.headlines.error = null;
      } catch { intel.headlines.error = 'NFL headlines could not be refreshed. Previously saved stories remain available.'; }
    })(),
    (async () => {
      if (nfl.injuryFeed.attemptedAt && now - nfl.injuryFeed.attemptedAt < 30 * 60000) return;
      nfl.injuryFeed.attemptedAt = now;
      try { nfl.injuries = normalizeNFLInjuries(await publicNFL('injuries', transport)).slice(0, 1200); nfl.injuryFeed.checkedAt = now; nfl.injuryFeed.error = null; }
      catch { nfl.injuryFeed.error = 'NFL team injuries could not be refreshed. Saved reports may be outdated.'; }
    })(),
    (async () => {
      if (!window || (nfl.marketFeed.attemptedAt && now - nfl.marketFeed.attemptedAt < 30 * 60000)) return;
      nfl.marketFeed.attemptedAt = now;
      try { nfl.games = normalizeNFLGames(await publicNFL('scoreboard?limit=100&dates=' + window, transport)); nfl.marketFeed.checkedAt = now; nfl.marketFeed.error = null; }
      catch { nfl.marketFeed.error = 'NFL game lines could not be refreshed. Saved lines may be outdated.'; }
    })(),
  ]);
  intel.activity = mergeActivity(intel.activity, transactions, observedChanges(s, previous, now), now);
  return intel;
}
