import type { GameLog, LeaguePlayer, Slot, Snapshot } from './football';
import type { ESPNInput } from './espn-provider.server';
// Boundary-only representation. All data leaving this module is normalized.
type Raw=Record<string,any>;
const obj=(v:unknown):Raw=>v&&typeof v==='object'&&!Array.isArray(v)?v as Raw:{};
const arr=(v:unknown):Raw[]=>Array.isArray(v)?v.filter(x=>x&&typeof x==='object'):[];
const num=(v:unknown,fallback=0)=>typeof v==='number'&&Number.isFinite(v)?v:fallback;
const maybe=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:null;
const name=(v:unknown,fallback:string)=>typeof v==='string'&&v.trim()?v.trim().slice(0,160):fallback;
export const SLOT_NAMES:Record<number,string>={0:'QB',1:'TQB',2:'RB',3:'RB/WR',4:'WR',5:'WR/TE',6:'TE',7:'SUPERFLEX',8:'DT',9:'DE',10:'LB',11:'DL',12:'CB',13:'S',14:'DB',15:'IDP',16:'DST',17:'K',18:'P',19:'HC',20:'BE',21:'IR',23:'FLEX',24:'IR',25:'Rookie'};
const POS:Record<number,string>={1:'QB',2:'RB',3:'WR',4:'TE',5:'K',16:'DST',6:'DT',7:'DE',8:'LB',9:'CB',10:'S'};
const PRO:Record<number,string>={0:'FA',1:'ATL',2:'BUF',3:'CHI',4:'CIN',5:'CLE',6:'DAL',7:'DEN',8:'DET',9:'GB',10:'TEN',11:'IND',12:'KC',13:'LV',14:'LAR',15:'MIA',16:'MIN',17:'NE',18:'NO',19:'NYG',20:'NYJ',21:'PHI',22:'ARI',23:'PIT',24:'LAC',25:'SF',26:'SEA',27:'TB',28:'WSH',29:'CAR',30:'JAX',33:'BAL',34:'HOU'};
export function normalizeLeague(core:unknown, cards:unknown, free:unknown, schedule:unknown, input:ESPNInput, now=Date.now()):Snapshot {
  const raw=obj(core),settings=obj(raw.settings),roster=obj(settings.rosterSettings),counts=obj(roster.lineupSlotCounts);
  if(raw.id!==input.leagueId||raw.seasonId!==input.season||!Array.isArray(raw.teams)||!raw.teams.some((t:Raw)=>t.id===input.teamId))throw new Error('League response did not match the connected team and season.');
  const slots:Slot[]=[];let rosterLimit=0;
  for(const [key,value] of Object.entries(counts)){const count=Math.max(0,Math.min(30,num(value))),id=Number(key);if(![21,24].includes(id))rosterLimit+=count;if([20,21,24].includes(id)||!count)continue;for(let i=0;i<count;i++)slots.push({id:key+':'+i,espnId:id,label:(SLOT_NAMES[id]??'Slot '+id)+(count>1?' '+(i+1):'')});}
  if(!slots.length||slots.length>30||raw.teams.length>100)throw new Error('Unsupported or missing ESPN roster configuration.');
  const week=num(raw.scoringPeriodId,num(raw.status?.currentScoringPeriod,1));
  const proTeams=arr(obj(schedule).settings?.proTeams??obj(schedule).proTeams),cardMap=new Map<string,Raw>();
  for(const entry of arr(obj(cards).players)){const p=obj(entry.player??entry.playerPoolEntry?.player??entry);if(p.id!==undefined)cardMap.set(String(p.id),p);}
  const players:LeaguePlayer[]=[],seen=new Set<string>();
  const normalize=(entry:Raw,teamId:number|null,slot:string|null,slotId:number|null):LeaguePlayer|null=>{
    const pool=obj(entry.playerPoolEntry??entry),base=obj(pool.player??entry.player??entry);if(base.id===undefined||!base.fullName)return null;
    const id=String(base.id);if(seen.has(id))return null;seen.add(id);
    const card=cardMap.get(id),p={...base,...card},statRows=[...arr(card?.stats),...arr(base.stats)],history:GameLog[]=[];
    const statFor=(season:number,period:number,source:number)=>statRows.find(s=>s.seasonId===season&&s.scoringPeriodId===period&&s.statSourceId===source&&s.statSplitTypeId!==2);
    for(const stat of statRows){if(stat.statSourceId!==0||stat.statSplitTypeId===2||!Number.isInteger(stat.scoringPeriodId)||stat.scoringPeriodId<1||stat.scoringPeriodId>18||stat.seasonId>input.season||(stat.seasonId===input.season&&stat.scoringPeriodId>=week)||stat.seasonId<input.season-1||maybe(stat.appliedTotal)===null)continue;
      // Exclude explicitly empty inactive/bye rows, retain real zero-point games.
      if(stat.stats&&Object.keys(obj(stat.stats)).length===0)continue;
      if(!history.some(g=>g.season===stat.seasonId&&g.week===stat.scoringPeriodId))history.push({season:stat.seasonId,week:stat.scoringPeriodId,points:stat.appliedTotal,projected:maybe(statFor(stat.seasonId,stat.scoringPeriodId,1)?.appliedTotal)});
    }
    history.sort((a,b)=>a.season-b.season||a.week-b.week);
    const proTeamId=num(p.proTeamId),pro=proTeams.find(t=>t.id===proTeamId),games=arr(obj(pro?.proGamesByScoringPeriod)[String(week)]),game=games[0];
    const date=maybe(game?.date),kickoff=date!==null?new Date(date).toISOString():null;
    const bye=!!pro&&pro.byeWeek===week,scheduleKnown=bye||(kickoff!==null&&game?.startTimeTBD!==true&&game?.validForLocking!==false);
    const eligible=Array.isArray(p.eligibleSlots)?p.eligibleSlots.filter((x:unknown)=>Number.isInteger(x)).slice(0,30):[];
    return {id,name:name(p.fullName,'Player '+id),position:POS[num(p.defaultPositionId)]??SLOT_NAMES[eligible.find((s:number)=>![20,21,23,24,25].includes(s))]??'OTHER',proTeam:PRO[proTeamId]??'NFL',proTeamId,teamId,slot,slotId,eligible,
      status:name(p.injuryStatus,p.injured?'UNKNOWN':'ACTIVE').toUpperCase(),availability:teamId!==null?'ROSTERED':name(pool.status,'UNKNOWN'),owned:maybe(p.ownership?.percentOwned),
      droppable:p.droppable===true,locked:!scheduleKnown||(!bye&&date!==null&&date<=now),kickoff,opponent:game?PRO[game.homeProTeamId===proTeamId?game.awayProTeamId:game.homeProTeamId]??null:null,bye,scheduleKnown,
      projected:maybe(statFor(input.season,week,1)?.appliedTotal),actual:maybe(statFor(input.season,week,0)?.appliedTotal),history:history.slice(-32)};
  };
  for(const team of arr(raw.teams)){const used:Record<string,number>={};for(const entry of arr(team.roster?.entries)){const id=num(entry.lineupSlotId,20),index=used[id]??0;used[id]=index+1;const slot=slots.find(s=>s.id===id+':'+index)?.id??(id===21||id===24?'IR':'BE');const p=normalize(entry,num(team.id),slot,id);if(p)players.push(p);}}
  for(const entry of arr(obj(free).players).slice(0,150)){if(num(entry.onTeamId)>0)continue;const p=normalize(entry,null,null,null);if(p)players.push(p);}
  // Explicitly requested watchlist cards remain visible if they leave the ranked free pool.
  for(const entry of arr(obj(cards).players).slice(0,120)){
    const team=num(entry.onTeamId),p=normalize(entry,team>0?team:null,null,null);if(p)players.push(p);
  }
  const teams=arr(raw.teams).map(t=>({id:num(t.id),name:name(t.name,[t.location,t.nickname].filter(Boolean).join(' ')||'Team '+t.id),wins:num(t.record?.overall?.wins),losses:num(t.record?.overall?.losses),ties:num(t.record?.overall?.ties),pointsFor:num(t.record?.overall?.pointsFor),pointsAgainst:num(t.record?.overall?.pointsAgainst),rank:maybe(t.rankCalculatedFinal??t.playoffSeed)}));
  const matchups=arr(raw.schedule).map(m=>{const periods=obj(settings.scheduleSettings?.matchupPeriods)[String(m.matchupPeriodId)],weeks=Array.isArray(periods)?periods:[m.matchupPeriodId];return {homeId:num(m.home?.teamId),awayId:maybe(m.away?.teamId),homeScore:maybe(m.home?.totalPoints),awayScore:maybe(m.away?.totalPoints),week:num(weeks[0]),endWeek:num(weeks[weeks.length-1])};}).filter(m=>m.homeId>0);
  const scoringRules=arr(settings.scoringSettings?.scoringItems).map(r=>({id:num(r.statId),points:num(r.points)})),ppr=scoringRules.find(r=>r.id===53)?.points??0;
  const scoring=(ppr===1?'PPR':ppr===.5?'Half PPR':ppr===0?'No reception points':'Custom reception scoring')+' · ESPN league rules';
  const owner=arr(raw.teams).find(t=>t.id===input.teamId)!;
  return {leagueId:input.leagueId,teamId:input.teamId,season:input.season,week,matchupPeriod:num(raw.status?.currentMatchupPeriod,week),leagueName:name(settings.name,'Your league'),teamName:teams.find(t=>t.id===input.teamId)!.name,scoring,scoringRules,slots,rosterLimit,faab:typeof settings.acquisitionSettings?.acquisitionBudget==='number'?Math.max(0,settings.acquisitionSettings.acquisitionBudget-num(owner.transactionCounter?.acquisitionBudgetSpent)):null,acquiredAt:new Date(now).toISOString(),teams,players,matchups,warnings:[],sources:{league:new Date(now).toISOString(),history:cards?new Date(now).toISOString():null,schedule:schedule?new Date(now).toISOString():null,waivers:free?new Date(now).toISOString():null}};
}
