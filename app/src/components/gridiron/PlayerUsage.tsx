import { usageSummary, usageTrend } from '../../lib/player-usage';
import type { LeaguePlayer } from '../../lib/football';

export function UsageBadge({ player, season, compact = false }: { player: LeaguePlayer; season: number; compact?: boolean }) {
  const trend = usageTrend(player, season);
  if (!trend || (compact && !['hot', 'cooling'].includes(trend.kind))) return null;
  // Compact badges sit inside player buttons; the detail page explains the rule.
  return compact ? <span className={'gi-trend gi-trend-' + trend.kind}>{trend.label}</span> : <details className={'gi-trend-help gi-trend-' + trend.kind}><summary>{trend.label}<span aria-hidden="true"> ?</span></summary><p>{trend.detail}</p></details>;
}
export function PlayerUsage({ player, season }: { player: LeaguePlayer; season: number }) {
  const usage = usageSummary(player);
  if (['DST', 'K'].includes(player.position)) return null;
  return <section className="gi-usage"><h3>How much are they getting the ball?</h3>
    <UsageBadge player={player} season={season}/>
    <p>A target is a pass thrown their way. A carry is a run with the ball. More chances can support future scoring, but do not guarantee it.</p>
    {usage.stats.length ? <><p className="ge-footnote">{usage.season} season · weeks {usage.firstWeek}–{usage.lastWeek} · averages from {usage.games} completed {usage.games === 1 ? 'game' : 'games'}. {usage.games < 3 ? 'Early sample: too little to call this a trend.' : ''}</p>
      <dl className="ge-system">{usage.stats.map(v => <div key={v.key}><dt>{v.label} per game</dt><dd><strong>{v.value.toFixed(1)}</strong>{v.previous !== null && <small>Previously {v.previous.toFixed(1)} across three games</small>}</dd></div>)}</dl></>
      : <p>ESPN has not returned enough of these stats for this player. Missing values are not counted as zero.</p>}
    <p className="ge-footnote">Usage helps explain a decision. It does not add an untested bonus to the point estimate.</p>
  </section>;
}
