import type { LeaguePlayer, Snapshot } from './football';
import type { FeedState } from './league-intel';
export type NFLInjury = { playerId: string; name: string; teamId: number; position: string; status: string; reportedAt: number | null };
export type NFLGame = { id: string; kickoff: number; homeId: number; awayId: number; home: string; away: string; state: string; total: number | null; spread: string | null; provider: string | null };
export type NFLContext = { injuries: NFLInjury[]; games: NFLGame[]; injuryFeed: FeedState; marketFeed: FeedState; gameWindow: string };
const clean = (v: unknown, max = 100) => typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, '').trim().slice(0, max) : '';
const id = (v: unknown) => Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : null;
const arr = (v: unknown): any[] => Array.isArray(v) ? v : [];
export function normalizeNFLInjuries(raw: any): NFLInjury[] {
  if (!Array.isArray(raw?.injuries)) throw new Error('Unavailable injury list');
  return raw.injuries.slice(0, 40).flatMap((team: any) => arr(team.injuries).slice(0, 100).flatMap(r => {
    const a = r.athlete, playerId = id(a?.id) ?? id(a?.links?.find((l: any) => arr(l.rel).includes('playercard'))?.href?.match(/\/id\/(\d+)/)?.[1]);
    const teamId = id(team.id), name = clean(a?.displayName), status = clean(r.status, 40).toUpperCase();
    const at = Date.parse(r.date);
    return !playerId || !teamId || !name || !status ? [] : [{ playerId: String(playerId), name, teamId, position: clean(a.position?.abbreviation, 12).toUpperCase(), status, reportedAt: Number.isFinite(at) ? at : null }];
  }));
}
export function normalizeNFLGames(raw: any): NFLGame[] {
  if (!Array.isArray(raw?.events)) throw new Error('Unavailable game list');
  return raw.events.slice(0, 100).flatMap((e: any) => {
    const c = e.competitions?.[0], h = arr(c?.competitors).find(t => t.homeAway === 'home'), a = arr(c?.competitors).find(t => t.homeAway === 'away');
    const homeId = id(h?.id), awayId = id(a?.id), kickoff = Date.parse(e.date), eventId = id(e.id), odds = c?.odds?.[0];
    if (!eventId || !homeId || !awayId || !Number.isFinite(kickoff)) return [];
    return [{ id: String(eventId), kickoff, homeId, awayId, home: clean(h.team?.abbreviation, 12), away: clean(a.team?.abbreviation, 12), state: clean(c?.status?.type?.state ?? e.status?.type?.state, 12),
      total: typeof odds?.overUnder === 'number' && odds.overUnder > 0 && odds.overUnder < 150 ? odds.overUnder : null,
      spread: clean(odds?.details, 40) || null, provider: clean(odds?.provider?.displayName ?? odds?.provider?.name, 60) || null }];
  });
}
export function gameWindow(s: Snapshot) {
  const times = s.players.flatMap(p => p.kickoff && Number.isFinite(Date.parse(p.kickoff)) ? [Date.parse(p.kickoff)] : []).sort((a, b) => a - b);
  if (!times.length || times.at(-1)! - times[0] > 14 * 86400000) return '';
  const date = (n: number) => new Date(n).toISOString().slice(0, 10).replaceAll('-', '');
  return date(times[0]) + '-' + date(times.at(-1)!);
}
const absent = (p: NFLInjury) => ['OUT', 'INJURED RESERVE', 'INJURY RESERVE', 'IR', 'RESERVE', 'SUSPENDED'].includes(p.status);
const front = ['DE', 'DT', 'NT', 'DL', 'LB', 'ILB', 'OLB', 'EDGE'], secondary = ['CB', 'S', 'FS', 'SS', 'DB'], line = ['C', 'G', 'OG', 'OT', 'T', 'OL'];
export function matchupContext(p: LeaguePlayer, s: Snapshot, now = Date.now()) {
  const nfl = s.intel?.nfl;
  if (!nfl) return null;
  const kickoff = p.kickoff ? Date.parse(p.kickoff) : null;
  const game = nfl.games.find(g => (g.homeId === p.proTeamId || g.awayId === p.proTeamId) && kickoff !== null && Math.abs(g.kickoff - kickoff) < 6 * 3600000);
  const opponentId = game ? game.homeId === p.proTeamId ? game.awayId : game.homeId : p.opponentProTeamId;
  const targetPositions = p.position === 'DST' ? ['QB', ...line, 'RB', 'WR', 'TE'] : p.position === 'RB' ? front : ['QB', 'WR', 'TE'].includes(p.position) ? secondary : [];
  const injuries = nfl.injuries.filter(i => i.teamId === opponentId && targetPositions.includes(i.position));
  const out = injuries.filter(absent), uncertain = injuries.filter(i => !absent(i));
  const support = nfl.injuries.filter(i => i.teamId === p.proTeamId && ['QB', ...line].includes(i.position) && absent(i) && i.playerId !== p.id);
  const fresh = (checked: number | null) => !!checked && now - checked < 90 * 60000;
  const injuryFresh = fresh(nfl.injuryFeed.checkedAt) && !nfl.injuryFeed.error;
  const marketFresh = fresh(nfl.marketFeed.checkedAt) && !nfl.marketFeed.error;
  const upcoming = kickoff !== null && kickoff > now;
  const label = p.position === 'DST' ? 'opposing offensive players' : p.position === 'RB' ? 'opposing defensive front players' : 'opposing defensive backs';
  const notes: string[] = [];
  if (targetPositions.length && out.length) notes.push(`${out.length} ${label} are listed Out/IR: ${out.slice(0, 4).map(i => i.name + ' (' + i.position + ')').join(', ')}. Check their roles and game-specific status before calling this an advantage.`);
  if (support.length && p.position !== 'DST') notes.push(`Their own NFL offense has ${support.length} quarterback/offensive-line absences listed. That can also limit scoring opportunities.`);
  if (!notes.length) notes.push('No position-specific absence signal in the saved report. This does not confirm that every starter is healthy.');
  return { game, injuries, out, uncertain, support, notes, upcoming, injuryFresh, marketFresh, injuryCheckedAt: nfl.injuryFeed.checkedAt, marketCheckedAt: nfl.marketFeed.checkedAt,
    signal: upcoming && injuryFresh && out.length > 0 ? 'Matchup worth reviewing' : 'NFL matchup context',
    caveat: 'Injury lists include backups and long-term absences. Starting roles, replacement quality and final inactive lists are not verified. No automatic point boost is applied.' };
}
export function matchupEvidence(p: LeaguePlayer, s: Snapshot, now = Date.now()) {
  const c = matchupContext(p, s, now); if (!c?.upcoming) return [];
  const facts: string[] = [];
  if (c.injuryFresh && c.out.length) facts.push(`${p.name}: ${c.out.length} relevant opposing NFL players listed Out/IR; ${c.out.slice(0, 2).map(i => i.name + ' ' + i.position).join(', ')}. Starter roles and final game status unverified; no point bonus assumed.`);
  if (c.injuryFresh && c.support.length && p.position !== 'DST') facts.push(`${p.name}: own offense has ${c.support.length} listed QB/line absences; check supporting cast.`);
  if (c.marketFresh && c.game?.state === 'pre' && c.game.total !== null) facts.push(`${p.name} NFL game: ${c.game.provider ?? 'ESPN listed market'} total ${c.game.total} combined NFL points${c.game.spread ? ', spread ' + c.game.spread : ''}. Betting lines are context, not fantasy-point predictions.`);
  return facts.slice(0, 2);
}
