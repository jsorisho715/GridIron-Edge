import { useEffect, useState } from 'react';
import { matchupContext } from '../../lib/nfl-context';
import type { LeaguePlayer, Snapshot } from '../../lib/football';
import type { PlayerMemoryData } from '../../lib/player-memory.server';
const date = (n: number | null) => n ? new Date(n).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Not provided';
export function PlayerMatchup({ player, snapshot }: { player: LeaguePlayer; snapshot: Snapshot }) {
  const c = matchupContext(player, snapshot);
  return <section className="gi-usage"><h3>The real NFL matchup</h3><p>{player.proTeam} vs. {player.opponent ?? 'opponent not available'}{player.bye ? ' · No game this week' : ''}</p>
    {!c ? <p>Team injury reports and game lines will appear after the next successful refresh.</p> : <>
      <strong>{c.signal}</strong>{!c.upcoming && <p className="ge-footnote">This game has started, finished, or has no confirmed future kickoff. These facts are for review, not an available lineup change.</p>}
      {!c.injuryFresh && <p className="gi-feed-warning">The NFL injury report is missing or outdated. It is excluded from new AI matchup reasons.</p>}
      {c.notes.map(n => <p key={n}>{n}</p>)}
      {c.injuries.length > 0 && <details className="gi-history"><summary>See the relevant opposing injuries ({c.injuries.length})</summary>{c.injuries.slice(0, 12).map(i => <div key={i.playerId}><strong>{i.name} · {i.position}</strong><span>{i.status} · Reported {date(i.reportedAt)}</span></div>)}</details>}
      <p className="ge-footnote">{c.uncertain.length} other relevant players have uncertain availability. “Questionable” does not mean “out.” {c.caveat}</p><p className="ge-footnote">Injuries checked {date(c.injuryCheckedAt)}. <a href="https://www.espn.com/nfl/injuries" target="_blank" rel="noreferrer">Read ESPN injury reports</a></p>
      <h3>What the game betting lines suggest</h3>{c.game?.total !== null && c.game?.total !== undefined ? <><p><strong>{c.game.total} combined NFL points</strong> · {c.game.away} at {c.game.home}</p><p>This is the sportsbook’s total line for both NFL teams together. A higher total suggests a higher-scoring game environment. It is not this player’s expected fantasy score.</p>{c.game.spread && <p>Spread: <strong>{c.game.spread}</strong>. A minus number marks the favored team and the points it is giving.</p>}<p className="ge-footnote">{c.game.provider ?? 'ESPN listed provider'} via ESPN · checked {date(c.marketCheckedAt)}{!c.marketFresh ? ' · Outdated; excluded from new AI reasons' : ''}. {c.game.state !== 'pre' ? 'This game is no longer pregame.' : 'Lines can move before kickoff.'}</p></> : <p>No usable game total was returned for this player’s scheduled game. Individual player betting props are not connected.</p>}
    </>}
  </section>;
}
export function PlayerMemory({ playerId, sourceAt }: { playerId: string; sourceAt: string }) {
  const [open, setOpen] = useState(false), [data, setData] = useState<PlayerMemoryData | null>(null), [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController(); setData(null); setError('');
    void fetch('/api/gridiron/workspace?player=' + encodeURIComponent(playerId), { credentials: 'same-origin', cache: 'no-store', signal: controller.signal }).then(async r => {
      if (!r.ok) throw new Error('Could not load saved player history. Close and reopen to retry.');
      const value = await r.json(); if (!controller.signal.aborted) setData(value);
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [playerId, sourceAt, open]);
  return <details className="gi-history gi-usage" open={open} onToggle={e => setOpen(e.currentTarget.open)}><summary>Saved player history & prediction results</summary>
    <p>This history stays with your private league across devices. It starts when tracking was enabled; past reports are not invented.</p>
    {error ? <p role="alert">{error}</p> : !data ? <p role="status">Loading saved history…</p> : <>
      <h3>Predictions saved before kickoff</h3>{data.forecasts.length ? data.forecasts.map(f => <div key={f.season + ':' + f.week}><strong>{f.season} · Week {f.week}: {f.estimate.toFixed(1)} expected points</strong><span>{f.actual === null ? 'Waiting for a completed-game result' : `Actual: ${f.actual.toFixed(1)} · Missed by ${Math.abs(f.estimate - f.actual).toFixed(1)} points`}</span><small>Saved {date(f.forecast_at)}</small></div>) : <p>No pregame prediction has been saved yet. We never add one after kickoff.</p>}
      <h3>What changed over time</h3>{data.events.length ? data.events.map((e, i) => <div key={i}><small>{date(e.observedAt)} · {e.kind}</small><p>{e.summary}</p></div>) : <p>No saved changes yet. New injury, workload and roster changes appear here.</p>}
      <p className="ge-footnote">Up to 24 recent changes shown. Player reports are retained for up to 180 days; pregame forecasts and results for up to two years. News headlines do not confirm an injury or return date.</p>
    </>}
  </details>;
}
