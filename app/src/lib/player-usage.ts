import type { LeaguePlayer } from './football';

// ESPN stat IDs cross-checked against espn-api/football/constant.py.
export const USAGE_FIELDS = { passAttempts: [0], passYards: [3], passTD: [4], interceptions: [20], carries: [23], rushYards: [24], rushTD: [25], catches: [53, 41], receivingYards: [42], receivingTD: [43], targets: [58], fumblesLost: [72] } as const;
export type UsageKey = keyof typeof USAGE_FIELDS;
export type PlayerUsage = Partial<Record<UsageKey, number>>;
export const USAGE_LABELS: Record<UsageKey, string> = { passAttempts: 'Pass attempts', passYards: 'Passing yards', passTD: 'Passing touchdowns', interceptions: 'Interceptions thrown', carries: 'Carries', rushYards: 'Rushing yards', rushTD: 'Rushing touchdowns', catches: 'Catches', receivingYards: 'Receiving yards', receivingTD: 'Receiving touchdowns', targets: 'Targets', fumblesLost: 'Fumbles lost' };
export function normalizeUsage(raw: unknown): PlayerUsage | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
  const stats = raw as Record<string, unknown>, result: PlayerUsage = {};
  for (const [key, ids] of Object.entries(USAGE_FIELDS)) for (const id of ids) {
    const value = stats[id];
    if (typeof value === 'number' && Number.isFinite(value)) { result[key as UsageKey] = value; break; }
  }
  return Object.keys(result).length ? result : undefined;
}
export function usageSummary(p: LeaguePlayer) {
  const season = p.history.at(-1)?.season;
  const games = p.history.filter(g => g.season === season).slice(-6), recent = games.slice(-3), earlier = games.length >= 6 ? games.slice(0, 3) : [];
  const keys: UsageKey[] = p.position === 'QB' ? ['passAttempts', 'passYards', 'carries'] : p.position === 'RB' ? ['carries', 'targets', 'rushYards'] : ['targets', 'catches', 'receivingYards'];
  const average = (rows: typeof games, key: UsageKey) => rows.length && rows.every(g => g.usage?.[key] !== undefined) ? rows.reduce((a, g) => a + g.usage![key]!, 0) / rows.length : null;
  return { season, games: recent.length, firstWeek: recent[0]?.week, lastWeek: recent.at(-1)?.week,
    stats: keys.flatMap(key => { const value = average(recent, key), previous = average(earlier, key); return value === null ? [] : [{ key, label: USAGE_LABELS[key], value, previous }]; }) };
}
export function usageEvidence(p: LeaguePlayer) {
  const s = usageSummary(p);
  return s.stats.length ? `${p.name} usage (${s.season}, weeks ${s.firstWeek}–${s.lastWeek}, ${s.games} games): ${s.stats.slice(0, 2).map(v => `${v.label.toLowerCase()} ${v.value.toFixed(1)}/game${v.previous !== null ? ` vs ${v.previous.toFixed(1)} in the previous three games` : ''}`).join('; ')}. Usage adds context; no extra points are assumed.` : '';
}

export function usageTrend(p: LeaguePlayer, season: number) {
  if (!['QB', 'RB', 'WR', 'TE'].includes(p.position)) return null;
  const games = p.history.filter(g => g.season === season).slice(-6);
  if (games.length < 6) return { kind: 'early' as const, label: 'Too early to tell', detail: 'We need six completed games in this season to compare the last three with the three before them. A single big game does not establish a trend.' };
  const keys: UsageKey[] = p.position === 'QB' ? ['passAttempts'] : p.position === 'RB' ? ['carries', 'targets'] : ['targets'];
  if (games.some(g => keys.some(k => g.usage?.[k] === undefined))) return { kind: 'unknown' as const, label: 'Usage data incomplete', detail: 'Some games are missing targets, carries or pass attempts. We do not fill the gaps with zero or assign a Hot badge.' };
  const values = games.map(g => keys.reduce((n, key) => n + g.usage![key]!, 0)), before = values.slice(0, 3).reduce((a, b) => a + b, 0) / 3, recent = values.slice(3).reduce((a, b) => a + b, 0) / 3;
  const difference = recent - before, floor = p.position === 'QB' ? 5 : p.position === 'RB' ? 3 : 2;
  const threshold = Math.max(floor, before * .2);
  const hot = difference >= threshold && values.slice(3).filter(v => v > before).length >= 2;
  const cool = -difference >= threshold && values.slice(3).filter(v => v < before).length >= 2;
  const measure = p.position === 'QB' ? 'pass attempts' : p.position === 'RB' ? 'carries plus targets' : 'targets';
  return { kind: hot ? 'hot' as const : cool ? 'cooling' as const : 'steady' as const, label: hot ? '🔥 Hot: usage rising' : cool ? 'Usage cooling' : 'Usage steady',
    detail: `${measure[0].toUpperCase() + measure.slice(1)} went from ${before.toFixed(1)} to ${recent.toFixed(1)} per game, comparing the previous three games with the latest three in ${season}. A rising or cooling badge requires at least a 20% change, a meaningful change in chances, and two of the latest three games moving in that direction. This describes workload, not guaranteed fantasy points.` };
}
