import { bestLineup, forecast, projectedTotal, starters, type LeaguePlayer, type LeagueTeam, type Snapshot } from './football';

export type LeagueActivity = {
  id: string; kind: 'add' | 'drop' | 'trade' | 'move' | 'lineup' | 'status';
  source: 'espn' | 'observed'; playerId: string; playerName: string;
  fromTeamId: number | null; toTeamId: number | null;
  at: number; since: number | null; detail: string;
};
export type NFLArticle = { id: string; headline: string; url: string; published: number; athleteIds: string[]; teamIds: number[] };
export type FeedState = { checkedAt: number | null; attemptedAt: number | null; error: string | null };
export type LeagueIntel = {
  trackingSince: number; activity: LeagueActivity[]; news: NFLArticle[];
  transactions: FeedState; headlines: FeedState;
  nfl?: import('./nfl-context').NFLContext;
};
type Raw = Record<string, any>;
const object = (v: unknown): Raw => v && typeof v === 'object' && !Array.isArray(v) ? v as Raw : {};
const objects = (v: unknown): Raw[] => Array.isArray(v) ? v.slice(0, 500).filter(x => x && typeof x === 'object') : [];
const clean = (v: unknown, limit = 160) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, limit) : '';
const numericId = (v: unknown) => (typeof v === 'number' || typeof v === 'string') && /^\d+$/.test(String(v)) && Number(v) > 0 && Number.isSafeInteger(Number(v)) ? Number(v) : null;

// Allowlist display fields only: member IDs, emails and auth identifiers stay server-side.
export function normalizeManagers(owners: unknown, members: unknown): NonNullable<LeagueTeam['managers']> {
  if (!Array.isArray(owners)) return [];
  const ids = new Set(owners.filter(x => typeof x === 'string').map(x => x.toLowerCase()));
  return objects(members).filter(m => typeof m.id === 'string' && ids.has(m.id.toLowerCase())).slice(0, 8).flatMap(m => {
    const full = [clean(m.firstName, 80), clean(m.lastName, 80)].filter(Boolean).join(' ');
    const name = full || clean(m.displayName);
    return name && !name.includes('@') ? [{ name, kind: full ? 'name' as const : 'display' as const }] : [];
  });
}
export const managerLabel = (team?: LeagueTeam) => team?.managers?.length
  ? team.managers.map(m => m.name + (m.kind === 'display' ? ' (ESPN display name)' : '')).join(' & ')
  : 'Manager name not shared by ESPN';
export function currentOpponent(s: Snapshot) {
  const m = s.matchups.find(m => (m.homeId === s.teamId || m.awayId === s.teamId) && m.week <= s.week && m.endWeek >= s.week);
  return s.teams.find(t => t.id === (m?.homeId === s.teamId ? m?.awayId : m?.homeId));
}

export function normalizeTransactions(raw: unknown, s: Snapshot, previous: Snapshot | null, now: number): LeagueActivity[] {
  const value = object(raw);
  if (!Array.isArray(value.topics)) throw new Error('Transaction feed unavailable');
  const names = new Map([...(previous?.players ?? []), ...s.players].map(p => [p.id, p.name]));
  const teams = new Set(s.teams.map(t => t.id));
  const team = (v: unknown) => teams.has(numericId(v) ?? -1) ? numericId(v) : null;
  const events: LeagueActivity[] = [];
  for (const topic of objects(value.topics).slice(0, 50)) {
    const at = typeof topic.date === 'number' ? topic.date : Date.parse(topic.date);
    if (!Number.isFinite(at) || at < now - 90 * 86400000 || at > now + 60000) continue;
    for (const m of objects(topic.messages).slice(0, 25)) {
      const type = Number(m.messageTypeId), player = numericId(m.targetId);
      if (!player || ![178, 180, 179, 181, 239, 244].includes(type)) continue;
      const kind = type === 244 ? 'trade' : [178, 180].includes(type) ? 'add' : 'drop';
      const fromTeamId = kind === 'trade' ? team(m.from) : kind === 'drop' ? team(type === 239 ? m.for : m.to) : null;
      const toTeamId = kind === 'drop' ? null : team(m.to);
      if ((!fromTeamId && !toTeamId) || (kind === 'trade' && (!fromTeamId || !toTeamId || fromTeamId === toTeamId))) continue;
      const playerId = String(player);
      events.push({ id: `espn:${at}:${type}:${playerId}:${fromTeamId}:${toTeamId}`, kind, source: 'espn', playerId,
        playerName: names.get(playerId) ?? `Player #${playerId} (name unavailable)`, fromTeamId, toTeamId, at, since: null,
        detail: type === 180 ? 'Completed waiver pickup reported by ESPN.' : kind === 'trade' ? 'Completed trade reported by ESPN.' : 'Completed roster transaction reported by ESPN.' });
    }
  }
  return [...new Map(events.map(e => [e.id, e])).values()];
}

export function observedChanges(s: Snapshot, previous: Snapshot | null, now: number): LeagueActivity[] {
  if (!previous || previous.leagueId !== s.leagueId || previous.season !== s.season || previous.teamId !== s.teamId) return [];
  const since = Date.parse(previous.acquiredAt), before = new Map(previous.players.map(p => [p.id, p]));
  const after = new Map(s.players.map(p => [p.id, p])), events: LeagueActivity[] = [];
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const a = before.get(id), b = after.get(id), fromTeamId = a?.teamId ?? null, toTeamId = b?.teamId ?? null;
    const push = (kind: LeagueActivity['kind'], detail: string) => events.push({ id: `seen:${now}:${id}:${kind}`, kind, source: 'observed', playerId: id,
      playerName: (b ?? a)!.name, fromTeamId, toTeamId, at: now, since, detail });
    if (fromTeamId !== toTeamId) push(fromTeamId && toTeamId ? 'move' : toTeamId ? 'add' : 'drop', 'Noticed between refreshes. The transaction type and exact time are not confirmed.');
    else if (a && b && toTeamId !== null) {
      if (a.slotId !== b.slotId && s.week === previous.week) push('lineup', `${slotLabel(a, s)} → ${slotLabel(b, s)}. Noticed between refreshes.`);
      if (a.status !== b.status) push('status', `${a.status} → ${b.status}. ESPN availability changed; this is not a manager transaction.`);
    }
  }
  return events;
}
function slotLabel(p: LeaguePlayer, s: Snapshot) { return p.slot === 'IR' ? 'Injured reserve' : p.slot === 'BE' ? 'Bench' : s.slots.find(x => x.id === p.slot)?.label ?? 'Unassigned'; }
export function mergeActivity(previous: LeagueActivity[], confirmed: LeagueActivity[], observed: LeagueActivity[], now: number) {
  const all = [...previous, ...observed, ...confirmed].filter(e => e.at >= now - 90 * 86400000);
  const official = all.filter(e => e.source === 'espn');
  // Replace a between-refresh observation when ESPN later supplies the same move.
  const retained = all.filter(e => e.source === 'espn' || ['lineup', 'status'].includes(e.kind) || !official.some(c =>
    c.playerId === e.playerId && c.fromTeamId === e.fromTeamId && c.toTeamId === e.toTeamId && c.at >= (e.since ?? e.at) - 60000 && c.at <= e.at + 60000));
  return [...new Map(retained.map(e => [e.id, e])).values()].sort((a, b) => b.at - a.at || a.id.localeCompare(b.id)).slice(0, 200);
}

export function normalizeNews(raw: unknown): NFLArticle[] {
  const value = object(raw);
  if (!Array.isArray(value.articles)) throw new Error('News feed unavailable');
  return objects(value.articles).slice(0, 100).flatMap(a => {
    const id = numericId(a.id), headline = clean(a.headline, 240), published = Date.parse(a.published);
    let url: URL; try { url = new URL(a.links?.web?.href); } catch { return []; }
    if (!id || !headline || !Number.isFinite(published) || url.protocol !== 'https:' || !['www.espn.com', 'espn.com'].includes(url.hostname) || url.username || url.password) return [];
    const categories = objects(a.categories), athleteIds = categories.filter(c => c.type === 'athlete').map(c => numericId(c.athleteId ?? c.athlete?.id)).filter((v): v is number => v !== null).map(String);
    const teamIds = categories.filter(c => c.type === 'team').map(c => numericId(c.teamId ?? c.team?.id)).filter((v): v is number => v !== null);
    return [{ id: String(id), headline, url: url.href, published, athleteIds: [...new Set(athleteIds)].slice(0, 32), teamIds: [...new Set(teamIds)].slice(0, 32) }];
  }).sort((a, b) => b.published - a.published);
}
export function teamNews(s: Snapshot, teamId: number) {
  const roster = s.players.filter(p => p.teamId === teamId);
  return (s.intel?.news ?? []).flatMap(article => {
    const players = roster.filter(p => article.athleteIds.includes(p.id));
    const nflTeams = [...new Set(roster.filter(p => article.teamIds.includes(p.proTeamId)).map(p => p.proTeam))];
    return players.length || nflTeams.length ? [{ article, players, nflTeams, direct: players.length > 0 }] : [];
  }).sort((a, b) => Number(b.direct) - Number(a.direct) || b.article.published - a.article.published).slice(0, 12);
}
export const teamActivity = (s: Snapshot, teamId: number) => (s.intel?.activity ?? []).filter(e => e.fromTeamId === teamId || e.toTeamId === teamId);
export function activityText(e: LeagueActivity, s: Snapshot) {
  const team = (id: number | null) => s.teams.find(t => t.id === id)?.name ?? 'Unassigned team';
  if (e.kind === 'trade') return `${e.playerName}: ${team(e.fromTeamId)} traded to ${team(e.toTeamId)}`;
  if (e.kind === 'move') return `${e.playerName}: moved from ${team(e.fromTeamId)} to ${team(e.toTeamId)}`;
  if (e.kind === 'add') return `${team(e.toTeamId)} added ${e.playerName}`;
  if (e.kind === 'drop') return `${team(e.fromTeamId)} removed ${e.playerName}`;
  return `${team(e.toTeamId)}: ${e.playerName} ${e.kind === 'status' ? 'availability changed' : 'lineup changed'}`;
}

// Grounded game plan. No headline interpretation, invented win odds or panic moves.
export function opponentPlan(s: Snapshot, now = Date.now()) {
  const opponent = currentOpponent(s);
  if (!opponent) return null;
  const theirs = starters(s, opponent.id), ours = starters(s), theirTotal = projectedTotal(theirs), ourTotal = projectedTotal(ours);
  const best = bestLineup(s, undefined, now), gain = Math.max(0, best.points - ourTotal.points);
  const flags = theirs.filter((p): p is LeaguePlayer => !!p && (p.bye || p.status !== 'ACTIVE'));
  const changes = teamActivity(s, opponent.id).filter(e => e.at >= now - 7 * 86400000 && e.kind !== 'status');
  const complete = !theirTotal.missing && !ourTotal.missing;
  const gap = complete ? ourTotal.points - theirTotal.points : null;
  const actionable = !best.missing && !ourTotal.missing && gain >= .5;
  const title = actionable ? 'Review your bench before making a pickup' : 'Keep your current lineup plan';
  const reason = actionable ? `Your best available lineup adds about ${gain.toFixed(1)} expected points using players you already have.` : 'The current estimates do not show a clear, available bench upgrade. An opponent move alone is not a reason to drop a player.';
  const context = gap === null ? 'Some starter estimates are missing, so we cannot make a full matchup comparison.' : `Your starters are estimated ${Math.abs(gap).toFixed(1)} points ${gap >= 0 ? 'ahead of' : 'behind'} their starters. This is a weekly estimate, not a live score or chance of winning.`;
  return { opponent, flags, changes, ourTotal, theirTotal, gap, actionable, title, reason, context,
    caution: flags.length ? `${flags.length} of their starters have an injury flag or a bye. Their lineup may change before kickoff.` : 'Their manager may still change starters. Check again before your remaining players kick off.' };
}

// Compact, stable facts for the optional model. No manager names, articles,
// refresh timestamps or duplicated transaction history enter the prompt.
export function opponentDecisionContext(s: Snapshot) {
  const t = currentOpponent(s); if (!t) return [];
  const players = starters(s, t.id), total = projectedTotal(players);
  const flags = players.filter((p): p is LeaguePlayer => !!p && (p.bye || p.status !== 'ACTIVE'));
  return [total.missing ? 'Opponent starter estimates are incomplete.' : `Current opponent starters: about ${Math.round(total.points)} expected points this week. This is not a live win probability.`,
    ...flags.slice(0, 3).map(p => `Opponent starter ${p.name}: ${p.bye ? 'BYE' : p.status}. Their lineup may change; do not assume this is a guaranteed advantage.`)];
}
