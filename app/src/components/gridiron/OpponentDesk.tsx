import { useState } from 'react';
import { ArrowUpRight, ArrowsLeftRight, Bell, UsersThree } from '@phosphor-icons/react';
import { forecast, starters, type LeaguePlayer, type Snapshot } from '../../lib/football';
import { activityText, currentOpponent, managerLabel, opponentPlan, teamActivity, teamNews } from '../../lib/league-intel';
import { Explain } from './Explain';
import { UsageBadge } from './PlayerUsage';
import { PlayerPhoto } from './PlayerPhoto';

const date = (n: number | string | null | undefined) => n ? new Date(n).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Not yet available';
const points = (n: number | null) => n === null ? 'No estimate' : n.toFixed(1) + ' pts';

export function OpponentBrief({ snapshot, onOpen, onLineup }: { snapshot: Snapshot; onOpen: () => void; onLineup: () => void }) {
  const plan = opponentPlan(snapshot);
  if (!plan) return null;
  return <section className="gi-brief ge-card" aria-label="Opponent game plan">
    <div><span className="ge-eyebrow"><UsersThree size={17} /> YOUR OPPONENT THIS WEEK</span><h2>{plan.opponent.name}</h2><p className="gi-manager">{managerLabel(plan.opponent)}</p></div>
    <div className="gi-plan"><strong>{plan.title}</strong><p>{plan.reason}</p><p className="ge-footnote">{plan.caution}</p>
      <div className="ge-actions"><button className="ge-button secondary" onClick={onOpen}>Opponent news & moves<ArrowUpRight size={17} /></button>{plan.actionable && <button className="ge-link" onClick={onLineup}>Review my lineup</button>}</div>
    </div>
  </section>;
}

export function OpponentDesk({ snapshot: s, onPlayer, onLineup }: { snapshot: Snapshot; onPlayer: (p: LeaguePlayer) => void; onLineup: () => void }) {
  const current = currentOpponent(s);
  const [selected, setSelected] = useState<number | null>(null), [allActivity, setAllActivity] = useState(false), [kind, setKind] = useState('all');
  const team = s.teams.find(t => t.id === selected && t.id !== s.teamId) ?? current ?? s.teams.find(t => t.id !== s.teamId);
  if (!team) return <section className="ge-card gl-empty"><h2>No opponents available yet</h2><p>Opponent rosters appear after ESPN returns your league teams.</p></section>;
  const roster = s.players.filter(p => p.teamId === team.id), starting = starters(s, team.id), bench = roster.filter(p => !s.slots.some(x => x.id === p.slot));
  const plan = team.id === current?.id ? opponentPlan(s) : null, news = teamNews(s, team.id);
  const activity = (allActivity ? s.intel?.activity ?? [] : teamActivity(s, team.id)).filter(e => kind === 'all' || e.kind === kind).slice(0, 40);
  const link = `https://fantasy.espn.com/football/team?leagueId=${s.leagueId}&teamId=${team.id}&seasonId=${s.season}`;
  const row = (p: LeaguePlayer, slot: string) => <button className="gi-roster-player" key={p.id} onClick={() => onPlayer(p)}>
    <PlayerPhoto player={p} /><span><strong>{p.name}</strong><UsageBadge player={p} season={s.season} compact/><small>{slot} · {p.proTeam} · {p.bye ? 'No game this week' : p.status === 'ACTIVE' ? 'No injury flag' : p.status}</small></span><span className="gi-roster-points">{points(forecast(p).points)}<small>expected</small></span>
  </button>;
  return <>
    <div className="gi-opponent-picker"><label htmlFor="opponent-team">Who are we watching?</label><select id="opponent-team" value={team.id} onChange={e => setSelected(Number(e.target.value))}>
      {s.teams.filter(t => t.id !== s.teamId).map(t => <option key={t.id} value={t.id}>{t.name} · {managerLabel(t)}{t.id === current?.id ? ' · This week' : ''}</option>)}
    </select></div>
    <section className="ge-card gi-team-header"><div><span className="ge-eyebrow">{team.id === current?.id ? 'YOUR MATCHUP THIS WEEK' : 'LEAGUE OPPONENT'}</span><h2>{team.name}</h2><p className="gi-manager">Managed by {managerLabel(team)}</p><p className="ge-footnote">{team.wins} wins · {team.losses} losses · {team.ties} ties</p></div><a className="ge-button secondary" href={link} target="_blank" rel="noreferrer">View their ESPN team<ArrowUpRight size={17} /></a></section>
    {plan && <section className="ge-card gi-plan gi-plan-main"><span className="ge-eyebrow">WHAT YOU SHOULD DO NEXT</span><h2>{plan.title}</h2><p>{plan.reason}</p><p>{plan.context}</p><p>{plan.caution}</p>
      <p className="ge-footnote">{plan.changes.length ? `${plan.changes.length} recent roster updates in the saved activity. Recommendations use their current roster and your available options after each refresh.` : 'No recent roster changes in the saved activity. We reassess after each league refresh.'}</p>
      {plan.actionable && <button className="ge-button" onClick={onLineup}>Show my possible changes<ArrowsLeftRight size={18} /></button>}
    </section>}
    <div className="gi-intel-grid">
      <section className="ge-card"><div className="ge-card-head"><h2><Bell size={20} /> News about their players</h2></div><div className="gi-feed-intro"><Explain topic="news">How stories are matched</Explain><p className="ge-footnote">Headlines checked {date(s.intel?.headlines.checkedAt)}.</p></div>
        {s.intel?.headlines.error && <p className="gi-feed-warning" role="status">{s.intel.headlines.error}</p>}
        {news.length ? news.map(({ article, players, nflTeams, direct }) => <article className="gi-news" key={article.id}>
          <span className={'gi-source ' + (direct ? 'gi-direct' : '')}>{direct ? 'PLAYER STORY' : 'NFL TEAM CONTEXT'}</span><h3><a href={article.url} target="_blank" rel="noreferrer">{article.headline}<ArrowUpRight size={16} /></a></h3>
          <p>{direct ? 'About ' + players.map(p => p.name).join(', ') : 'Related to ' + nflTeams.join(', ') + '. This may be about another player on that NFL team.'}</p>
          <small>ESPN · {date(article.published)}</small>{players.length > 0 && <div className="gi-news-players">{players.slice(0, 3).map(p => <button className="gi-player-chip" key={p.id} onClick={() => onPlayer(p)}><PlayerPhoto player={p} /><span>{p.name}</span></button>)}</div>}
        </article>) : <div className="gl-empty"><h3>{s.intel?.headlines.checkedAt ? 'No matching stories in the latest feed' : 'Waiting for the first news refresh'}</h3><p>This checks ESPN’s latest 100 NFL stories. No matching story does not mean every player is healthy.</p></div>}
      </section>
      <section className="ge-card"><div className="ge-card-head"><h2><ArrowsLeftRight size={20} /> Trades & roster changes</h2></div><div className="gi-feed-intro"><Explain topic="activity">Confirmed vs. noticed changes</Explain><p className="ge-footnote">Transactions checked {date(s.intel?.transactions.checkedAt)}. Roster tracking since {date(s.intel?.trackingSince)}.</p>
        <label className="gi-toggle"><input type="checkbox" checked={allActivity} onChange={e => setAllActivity(e.target.checked)} /> Show the whole league</label>
        <label className="gi-filter-label" htmlFor="activity-kind">Show</label><select id="activity-kind" value={kind} onChange={e => setKind(e.target.value)}><option value="all">All updates</option><option value="trade">Confirmed trades</option><option value="add">Pickups</option><option value="drop">Drops</option><option value="lineup">Lineup changes</option><option value="status">Availability changes</option></select>
      </div>{s.intel?.transactions.error && <p className="gi-feed-warning" role="status">{s.intel.transactions.error}</p>}
        {activity.length ? activity.map(e => <article className="gi-activity" key={e.id}><span className={'gi-source ' + (e.source === 'espn' ? 'gi-direct' : '')}>{e.source === 'espn' ? 'CONFIRMED BY ESPN' : 'NOTICED BETWEEN REFRESHES'}</span><h3>{activityText(e, s)}</h3><p>{e.detail}</p><small>{e.source === 'observed' ? 'Noticed ' : ''}{date(e.at)}</small>{s.players.some(p => p.id === e.playerId) && <button className="ge-link" onClick={() => onPlayer(s.players.find(p => p.id === e.playerId)!)}>Review player<ArrowUpRight size={16} /></button>}</article>) : <div className="gl-empty"><h3>No saved updates match this view</h3><p>Completed moves appear when ESPN reports them. Starter and availability changes appear as we compare successful refreshes.</p></div>}
        <p className="ge-footnote gi-feed-intro">Up to 200 recent updates are kept for 90 days, with up to 40 shown here. The first import establishes a roster baseline. Pending claims and private trade offers are not visible.</p>
      </section>
    </div>
    <section className="ge-card ge-spaced"><div className="ge-card-head"><h2>Their starting lineup</h2></div><div className="gi-feed-intro"><Explain topic="estimate">What “expected points” means</Explain></div>
      {starting.map((p, i) => p ? row(p, s.slots[i].label) : <div className="gi-empty-slot" key={s.slots[i].id}>{s.slots[i].label}: empty slot</div>)}
      <details className="gi-bench"><summary>Their bench & injured reserve ({bench.length})</summary>{bench.map(p => row(p, p.slot === 'IR' ? 'Injured reserve' : 'Bench'))}</details>
    </section>
  </>;
}
