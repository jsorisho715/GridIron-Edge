import { expect, test } from 'bun:test';
import { normalizeLeague } from '../src/lib/espn-normalize';
import { normalizeManagers, normalizeTransactions, observedChanges, mergeActivity, normalizeNews, teamNews } from '../src/lib/league-intel';
import { enrichLeague } from '../src/lib/league-intel.server';
import { normalizeUsage, usageSummary, usageTrend } from '../src/lib/player-usage';
import { normalizeNFLGames, normalizeNFLInjuries, matchupContext, matchupEvidence } from '../src/lib/nfl-context';
import { digest, evidenceKey, generateDecisions } from '../src/lib/decisions';
import { input, leagueFixture, now } from './fixtures/live';
const fixture = () => { const f = leagueFixture(); return normalizeLeague(f.core, f.cards, f.free, f.schedule, input, now); };
const fresh = () => ({ attemptedAt: now, checkedAt: now, error: null });
test('manager names are joined only to team owners and sensitive member fields never escape', () => {
  const value = normalizeManagers(['MEMBER'], [{ id: 'member', firstName: 'Pat', lastName: 'Smith', email: 'private@example.com', swid: 'SECRET', displayName: 'alias' }, { id: 'other', firstName: 'Wrong' }]);
  expect(value).toEqual([{ name: 'Pat Smith', kind: 'name' }]); expect(JSON.stringify(value)).not.toContain('SECRET'); expect(JSON.stringify(value)).not.toContain('@');
  expect(normalizeManagers(['a'], [{ id: 'a', displayName: 'Fantasy Fan' }])).toEqual([{ name: 'Fantasy Fan', kind: 'display' }]);
  expect(normalizeManagers(['a'], [{ id: 'a', displayName: 'private@example.com' }])).toEqual([]);
});
test('only ESPN trade messages prove trades; observations deduplicate when official data arrives', () => {
  const s = fixture(), before = structuredClone(s), p = s.players.find(p => p.teamId === 2)!;
  p.teamId = 3; s.acquiredAt = new Date(now + 10000).toISOString();
  const observed = observedChanges(s, before, now + 10000); expect(observed).toHaveLength(1); expect(observed[0].kind).toBe('move');
  const confirmed = normalizeTransactions({ topics: [{ date: now + 5000, messages: [{ messageTypeId: 244, targetId: Number(p.id), from: 2, to: 3 }] }] }, s, before, now + 10000);
  expect(confirmed[0].kind).toBe('trade'); expect(mergeActivity([], confirmed, observed, now + 10000)).toEqual(confirmed);
  expect(mergeActivity(confirmed, confirmed, [], now + 10000)).toHaveLength(1);
  expect(observedChanges(s, null, now)).toEqual([]);
  const next = structuredClone(before); next.week++; next.players[0].slotId = 20; expect(observedChanges(next, before, now)).toEqual([]);
});
test('news matches actual article tags, rejects unsafe links, and distinguishes broader team stories', () => {
  const s = fixture(), p = s.players[0];
  const make = (id: number, categories: unknown[]) => ({ id, headline: 'Synthetic football headline', published: new Date(now).toISOString(), links: { web: { href: 'https://www.espn.com/nfl/story/_/id/' + id } }, categories });
  const news = normalizeNews({ articles: [make(1, [{ type: 'athlete', athleteId: Number(p.id) }]), make(2, [{ type: 'team', teamId: p.proTeamId }]), { ...make(3, []), links: { web: { href: 'javascript:alert(1)' } } }] });
  s.intel = { trackingSince: now, activity: [], news, headlines: fresh(), transactions: fresh() };
  const matched = teamNews(s, s.teamId); expect(matched).toHaveLength(2); expect(matched[0].direct).toBe(true); expect(matched[1].direct).toBe(false); expect(news).toHaveLength(2);
});
test('public context never receives cookies, is cached across players, and optional failure preserves history', async () => {
  const s = fixture(), calls: string[] = [];
  const transport = (async (url, init) => { const u = new URL(String(url)); calls.push(u.pathname); expect(init?.redirect).toBe('manual');
    if (u.hostname === 'site.api.espn.com') { expect(new Headers(init?.headers).has('Cookie')).toBe(false); return Response.json(u.pathname.endsWith('news') ? { articles: [] } : u.pathname.endsWith('injuries') ? { injuries: [] } : { events: [] }); }
    expect(new Headers(init?.headers).get('Cookie')).toContain('synthetic-cookie'); return Response.json({ topics: [] });
  }) as typeof fetch;
  s.intel = await enrichLeague(s, null, input, transport, now); expect(calls).toHaveLength(4);
  const next = structuredClone(s); next.intel = await enrichLeague(next, s, input, transport, now + 3 * 60000); expect(calls).toHaveLength(4);
  const broken = await enrichLeague(next, s, input, (async () => { throw new Error('SECRET provider response'); }) as typeof fetch, now + 31 * 60000);
  expect(broken.headlines.checkedAt).toBe(now); expect(broken.headlines.error).toContain('could not'); expect(JSON.stringify(broken)).not.toContain('SECRET');
});
test('usage fields, missing values and hot badges never confuse a big score with sustained workload', () => {
  expect(normalizeUsage({ 23: 10, 24: 55, 53: 4, 41: 99, 58: 6 })).toEqual({ carries: 10, rushYards: 55, catches: 4, targets: 6 });
  const p = fixture().players.find(p => p.position === 'WR')!;
  p.history = [5, 5, 5, 8, 8, 9].map((targets, i) => ({ season: 2026, week: i + 1, points: 9, projected: null, usage: { targets } }));
  expect(usageTrend(p, 2026)?.kind).toBe('hot'); expect(usageSummary(p).stats[0].previous).toBe(5);
  p.history[3].usage!.targets = 1; p.history[4].usage!.targets = 1; p.history[5].usage!.targets = 30; expect(usageTrend(p, 2026)?.kind).toBe('steady');
  delete p.history[3].usage!.targets; expect(usageTrend(p, 2026)?.kind).toBe('unknown');
  expect(usageTrend(p, 2027)?.kind).toBe('early');
});
test('NFL injuries target the actual opposing unit, and stale market facts cannot reach model evidence', async () => {
  const s = fixture(), p = s.players.find(p => p.position === 'WR')!;
  const injuries = normalizeNFLInjuries({ injuries: [{ id: '10', injuries: [{ status: 'Out', date: new Date(now).toISOString(), athlete: { id: '9991', displayName: 'Synthetic Corner', position: { abbreviation: 'CB' } } }, { status: 'Questionable', athlete: { id: '9992', displayName: 'Synthetic Safety', position: { abbreviation: 'S' } } }, { status: 'Out', athlete: { id: '9993', displayName: 'Synthetic Quarterback', position: { abbreviation: 'QB' } } }] }] });
  const games = normalizeNFLGames({ events: [{ id: '12345', date: p.kickoff, competitions: [{ competitors: [{ id: p.proTeamId, homeAway: 'home', team: { abbreviation: p.proTeam } }, { id: 10, homeAway: 'away', team: { abbreviation: 'TEN' } }], status: { type: { state: 'pre' } }, odds: [{ overUnder: 48.5, details: 'TEN -3', provider: { name: 'Synthetic book' } }] }] }] });
  s.intel = { trackingSince: now, activity: [], news: [], headlines: fresh(), transactions: fresh(), nfl: { injuries, games, injuryFeed: fresh(), marketFeed: fresh(), gameWindow: 'test' } };
  const c = matchupContext(p, s, now)!; expect(c.out).toHaveLength(1); expect(c.uncertain).toHaveLength(1); expect(c.out[0].position).toBe('CB'); expect(c.support).toHaveLength(0);
  expect(matchupEvidence(p, s, now).join(' ')).toContain('48.5'); expect(matchupEvidence(p, s, now).join(' ')).not.toContain('Quarterback');
  expect(matchupEvidence(p, s, now + 2 * 3600000)).toEqual([]);
  const key = await digest(evidenceKey(s, 'balanced', now)), copy = structuredClone(s); copy.intel!.headlines.checkedAt = now + 10; copy.teams[0].managers = [{ name: 'Private Manager', kind: 'name' }];
  expect(await digest(evidenceKey(copy, 'balanced', now))).toBe(key);
  const decisions = await generateDecisions(copy, 'balanced', now); expect(JSON.stringify(decisions)).not.toContain('Private Manager');
});
