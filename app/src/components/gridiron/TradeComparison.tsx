import type { Decision } from '../../lib/decisions';
import type { LeaguePlayer, LeagueTeam } from '../../lib/football';
import { managerLabel } from '../../lib/league-intel';
import { PlayerPhoto } from './PlayerPhoto';

const nfl: Record<string, string> = { ARI:'Arizona Cardinals', ATL:'Atlanta Falcons', BAL:'Baltimore Ravens', BUF:'Buffalo Bills', CAR:'Carolina Panthers', CHI:'Chicago Bears', CIN:'Cincinnati Bengals', CLE:'Cleveland Browns', DAL:'Dallas Cowboys', DEN:'Denver Broncos', DET:'Detroit Lions', GB:'Green Bay Packers', HOU:'Houston Texans', IND:'Indianapolis Colts', JAX:'Jacksonville Jaguars', JAC:'Jacksonville Jaguars', KC:'Kansas City Chiefs', LAC:'Los Angeles Chargers', LAR:'Los Angeles Rams', LV:'Las Vegas Raiders', MIA:'Miami Dolphins', MIN:'Minnesota Vikings', NE:'New England Patriots', NO:'New Orleans Saints', NYG:'New York Giants', NYJ:'New York Jets', PHI:'Philadelphia Eagles', PIT:'Pittsburgh Steelers', SEA:'Seattle Seahawks', SF:'San Francisco 49ers', TB:'Tampa Bay Buccaneers', TEN:'Tennessee Titans', WAS:'Washington Commanders', WSH:'Washington Commanders' };
const position: Record<string,string> = {QB:'quarterback',RB:'running back',WR:'wide receiver',TE:'tight end',DST:'defense',K:'kicker'};
export function TradeComparison({decision:d,players,teams,onPlayer}:{decision:Decision;players:LeaguePlayer[];teams:LeagueTeam[];onPlayer?:(p:LeaguePlayer)=>void}) {
  const t=d.trade;
  if(!t) return <p>Refresh decisions to load the teams and trade breakdown.</p>;
  const give=players.find(p=>p.id===t.giveId),get=players.find(p=>p.id===t.receiveId);
  const owner=teams.find(x=>x.id===t.owner.teamId),partner=teams.find(x=>x.id===t.partner.teamId);
  const gain=t.owner.after-t.owner.before, theirs=t.partner.after-t.partner.before;
  const player=(p:LeaguePlayer|undefined)=>p ? <button className="gi-player-chip" onClick={()=>onPlayer?.(p)}><PlayerPhoto player={p}/><span>{p.name}<small>{position[p.position]??p.position} · {nfl[p.proTeam]??p.proTeam}</small></span></button> : <span>Player details unavailable</span>;
  return <div className="gt-comparison">
    <p><strong>Trade with {partner ? managerLabel(partner) : 'Manager unavailable'}</strong><br/>{partner?.name??'Team details unavailable'}</p>
    <div className="gt-sides">
      {[{label:'Your team',team:owner,side:t.owner,incoming:get,outgoing:give,improvement:gain},{label:'Their team',team:partner,side:t.partner,incoming:give,outgoing:get,improvement:theirs}].map(s=><section className="gt-side" key={s.label} aria-label={`${s.label} trade benefit`}>
        <h4>{s.label}</h4><p>{s.team?.name??'Team unavailable'}</p>
        <span className="ge-eyebrow">{s.label==='Your team'?'YOU RECEIVE':'THEY RECEIVE'}</span>{player(s.incoming)}
        <span className="ge-eyebrow">{s.label==='Your team'?'YOU GIVE UP':'THEY GIVE UP'}</span>{player(s.outgoing)}
        <strong className="gt-gain">+{s.improvement.toFixed(1)} estimated points</strong>
        <p>Across {t.weeks.length} weeks total. About +{(s.improvement/t.weeks.length).toFixed(1)} per week.</p>
        <p>Adding {s.incoming?.name??'this player'} at {position[s.incoming?.position??'']??s.incoming?.position??'their position'} raises this team's best available starting lineup after giving up {s.outgoing?.name??'the outgoing player'}.</p>
        <details><summary>Before and after</summary><p>All starters combined over weeks {t.weeks.join(', ')}: {s.side.before.toFixed(1)} points before → {s.side.after.toFixed(1)} after. Both lineups are optimized the same way.</p></details>
      </section>)}
    </div>
    <p className="gt-edge"><strong>Your projected edge: {(gain-theirs).toFixed(1)} points.</strong> Your improvement is larger than theirs over the same period. This is not a player value rating or a guaranteed win.</p>
    <details><summary>Upcoming games, explained</summary>
      <p>These are each player's NFL opponents, not your fantasy opponents. A bye means no game and zero points that week. Matchup difficulty is not included in this estimate.</p>
      {[get,give].filter((p):p is LeaguePlayer=>!!p).map(p=><section key={p.id}><h4>{p.name}</h4><ul>{t.weeks.map(w=>{const g=p.future?.find(g=>g.week===w);return <li key={w}>Week {w}: {!g?.known?'Schedule unavailable':g.bye?'Bye week. No game.':g.opponent?`Plays the ${nfl[g.opponent]??g.opponent}`:'Opponent unavailable'}</li>})}</ul></section>)}
    </details>
    <p className="ge-footnote">Giving up depth reduces your backup options. Estimates assume healthy players and exclude future injuries, role changes and weeks outside this window. The other manager may still decline.</p>
  </div>;
}
