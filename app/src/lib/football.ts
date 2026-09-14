export type GameLog = { season: number; week: number; points: number; projected: number | null };
export type Slot = { id: string; espnId: number; label: string };
export type LeaguePlayer = {
  id: string; name: string; position: string; proTeam: string; proTeamId: number;
  teamId: number | null; slot: string | null; slotId: number | null; eligible: number[];
  status: string; availability: string; owned: number | null; locked: boolean;
  kickoff: string | null; opponent: string | null; bye: boolean; scheduleKnown: boolean;
  projected: number | null; actual: number | null; history: GameLog[];
};
export type LeagueTeam = { id: number; name: string; wins: number; losses: number; ties: number; pointsFor: number; pointsAgainst: number; rank: number | null };
export type Matchup = { homeId: number; awayId: number | null; homeScore: number | null; awayScore: number | null; week: number; endWeek: number };
export type Snapshot = {
  leagueId: number; teamId: number; season: number; week: number; matchupPeriod: number;
  leagueName: string; teamName: string; scoring: string; scoringRules: { id: number; points: number }[];
  slots: Slot[]; rosterLimit: number; faab: number | null; acquiredAt: string;
  teams: LeagueTeam[]; players: LeaguePlayer[]; matchups: Matchup[]; warnings: string[];
  sources: { league: string; history: string | null; schedule: string | null; waivers: string | null };
};
export type Preferences = { watched: string[]; notes: string; reviewed: string[]; paused: boolean; updatedAt: number };
export type Alert = { id: string; title: string; detail: string; playerId: string | null; kind: string; createdAt: number };
export type SyncHealth = { lastSuccess: number | null; lastAttempt: number | null; nextAttempt: number | null; error: string | null; running: boolean; heartbeat: number | null };
export type WorkspaceData = { snapshot: Snapshot | null; preferences: Preferences; alerts: Alert[]; health: SyncHealth; connected: boolean; needsSync: boolean };
export const EMPTY_PREFS: Preferences = { watched: [], notes: '', reviewed: [], paused: false, updatedAt: 0 };
export const average = (values: number[]) => values.length ? values.reduce((a,b)=>a+b,0)/values.length : 0;
export const unavailable = (p: LeaguePlayer) => p.bye || ['OUT','INJURY_RESERVE','IR','SUSPENSION','SUSPENDED','PUP'].includes(p.status);
export function forecast(p: LeaguePlayer) {
  const games=p.history.slice(-8), history=games.length ? games.reduce((s,g,i)=>s+g.points*(i+1),0)/(games.length*(games.length+1)/2) : null;
  const points=unavailable(p) ? 0 : p.projected === null ? history : history === null ? p.projected : .7*p.projected+.3*history;
  const sorted=games.map(g=>g.points).sort((a,b)=>a-b);
  const percentile=(q:number)=>sorted.length ? sorted[Math.floor((sorted.length-1)*q)] : null;
  return { points, baseline:history, low:percentile(.25), high:percentile(.75), games:games.length,
    evidence:games.length>=6 ? 'Established history' : games.length>=3 ? 'Limited history' : 'Sparse history',
    method:p.projected!==null && history!==null ? '70% ESPN projection + 30% weighted recent games' : p.projected!==null ? 'ESPN projection; history unavailable' : history!==null ? 'Weighted recent games; ESPN projection unavailable' : 'No usable projection or game history' };
}
export const estimateLive = (p: LeaguePlayer) => forecast(p).points;
export function starters(snapshot: Snapshot, teamId=snapshot.teamId) { return snapshot.slots.map(s=>snapshot.players.find(p=>p.teamId===teamId&&p.slot===s.id)); }
export function projectedTotal(players: (LeaguePlayer|undefined)[]) { const values=players.map(p=>p?estimateLive(p):null);return { points:values.reduce<number>((s,v)=>s+(v??0),0), missing:values.filter(v=>v===null).length }; }

// Exact maximum-weight matching for custom ESPN slots. Unlike bitmask DP this
// remains bounded for large rosters, superflex and individual defensive players.
export const isHeld = (p: LeaguePlayer, now=Date.now()) => p.locked || !p.scheduleKnown || (!!p.kickoff && Date.parse(p.kickoff)<=now);
export function bestLineup(snapshot: Snapshot, pool=snapshot.players.filter(p=>p.teamId===snapshot.teamId), now=Date.now()) {
  const picks:(LeaguePlayer|undefined)[]=snapshot.slots.map(s=>pool.find(p=>isHeld(p,now)&&p.slot===s.id));
  const open=snapshot.slots.map((s,i)=>({s,i})).filter(x=>!picks[x.i]);
  const candidates=pool.filter(p=>!isHeld(p,now)&&!unavailable(p)&&!['IR','BE-IR'].includes(p.slot??'')&&p.slotId!==21&&p.slotId!==24);
  type Edge={to:number;rev:number;cap:number;cost:number};
  const n=2+open.length+candidates.length, end=n-1, graph:Edge[][]=Array.from({length:n},()=>[]);
  const add=(a:number,b:number,cost:number)=>{const edge={to:b,rev:graph[b].length,cap:1,cost};graph[a].push(edge);graph[b].push({to:a,rev:graph[a].length-1,cap:0,cost:-cost});return edge;};
  const links:{slot:number;player:number;edge:Edge}[]=[];
  open.forEach(({s,i},j)=>{add(0,1+j,0);candidates.forEach((p,k)=>{if(p.eligible.includes(s.espnId))links.push({slot:i,player:k,edge:add(1+j,1+open.length+k,-10000-(estimateLive(p)??0))});});});
  candidates.forEach((_,k)=>add(1+open.length+k,end,0));
  for(let flow=0;flow<open.length;flow++) {
    const dist=Array(n).fill(Infinity),prev:(number[]|undefined)[]=Array(n);dist[0]=0;
    for(let iteration=0;iteration<n-1;iteration++){let changed=false;for(let a=0;a<n;a++)if(Number.isFinite(dist[a]))graph[a].forEach((edge,k)=>{if(edge.cap&&dist[a]+edge.cost<dist[edge.to]-1e-8){dist[edge.to]=dist[a]+edge.cost;prev[edge.to]=[a,k];changed=true;}});if(!changed)break;}
    if(!prev[end])break;
    for(let v=end;v!==0;){const [a,k]=prev[v]!;const e=graph[a][k];e.cap--;graph[v][e.rev].cap++;v=a;}
  }
  for(const l of links)if(l.edge.cap===0)picks[l.slot]=candidates[l.player];
  return {picks,...projectedTotal(picks)};
}
export function waiverOptions(snapshot: Snapshot, now=Date.now()) {
  const roster=snapshot.players.filter(p=>p.teamId===snapshot.teamId),base=bestLineup(snapshot,roster,now);
  const droppable=roster.filter(p=>!isHeld(p,now)&&p.slotId!==21&&p.slotId!==24);
  return snapshot.players.filter(p=>p.teamId===null&&['FREEAGENT','WAIVERS'].includes(p.availability)&&!isHeld(p,now)&&!unavailable(p)&&estimateLive(p)!==null)
    .sort((a,b)=>(estimateLive(b)??-Infinity)-(estimateLive(a)??-Infinity)).slice(0,35).map(player=>{
      let result:{drop:LeaguePlayer|null;gain:number}|null=null;
      const options:(LeaguePlayer|null)[]=roster.length<snapshot.rosterLimit?[null]:droppable;
      for(const drop of options){const best=bestLineup(snapshot,[...roster.filter(p=>p.id!==drop?.id),{...player,teamId:snapshot.teamId}],now);if(best.missing)continue;const gain=best.points-base.points;if(!result||gain>result.gain+1e-6||(Math.abs(gain-result.gain)<1e-6&&(drop?estimateLive(drop)??0:0)<(result.drop?estimateLive(result.drop)??0:0)))result={drop,gain};}
      return {player,drop:result?.drop??null,gain:base.missing?null:result?.gain??null};
    }).sort((a,b)=>(b.gain??-Infinity)-(a.gain??-Infinity));
}
export function backtest(players: LeaguePlayer[]) {
  let total=0, error=0, naiveError=0;
  for(const p of players){const games=p.history;for(let i=3;i<games.length;i++){const prior=games.slice(Math.max(0,i-8),i),baseline=prior.reduce((s,g,j)=>s+g.points*(j+1),0)/(prior.length*(prior.length+1)/2);error+=Math.abs(baseline-games[i].points);naiveError+=Math.abs(average(prior.map(g=>g.points))-games[i].points);total++;}}
  return {games:total,mae:total?error/total:null,meanMae:total?naiveError/total:null};
}
