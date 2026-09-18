import {bestLineup,forecast,isHeld,projectedTotal,starters,type Snapshot,type LeaguePlayer} from './football';
import {currentOpponent} from './league-intel';

export function matchupReport(s:Snapshot,now=Date.now()) {
  const opponent=currentOpponent(s);
  if(!opponent)return null;
  const match=s.matchups.find(m=>(m.homeId===s.teamId||m.awayId===s.teamId)&&m.week<=s.week&&m.endWeek>=s.week)!;
  const ours=starters(s),theirs=starters(s,opponent.id),own=projectedTotal(ours),other=projectedTotal(theirs);
  const best=bestLineup(s,undefined,now),theirBest=bestLineup({...s,teamId:opponent.id},s.players.filter(p=>p.teamId===opponent.id),now);
  const gain=!own.missing&&!best.missing?Math.max(0,best.points-own.points):null;
  const theirGain=!other.missing&&!theirBest.missing?Math.max(0,theirBest.points-other.points):null;
  const rows=s.slots.map((slot,i)=>{const a=ours[i]?forecast(ours[i]!).points:null,b=theirs[i]?forecast(theirs[i]!).points:null;return {slot,ours:ours[i],theirs:theirs[i],a,b,gap:a===null||b===null?null:a-b};});
  const gap=own.missing||other.missing?null:own.points-other.points;
  const flags=(ps:(LeaguePlayer|undefined)[])=>ps.filter((p):p is LeaguePlayer=>!!p&&(p.bye||p.status!=='ACTIVE'));
  return {opponent,match,ours,theirs,own,other,best,gain,theirGain,rows,gap,
    score:match.homeId===s.teamId?match.homeScore:match.awayScore,
    opponentScore:match.homeId===s.teamId?match.awayScore:match.homeScore,
    ownFlags:flags(ours),theirFlags:flags(theirs),
    open:ours.filter(p=>p&&!isHeld(p,now)).length,
    theirOpen:theirs.filter(p=>p&&!isHeld(p,now)).length,
    changes:best.picks.flatMap((p,i)=>p&&p.id!==ours[i]?.id?[{slot:s.slots[i],incoming:p,outgoing:ours[i]}]:[]),
    strengths:rows.filter(r=>r.gap!==null&&r.gap>=.5).sort((a,b)=>b.gap!-a.gap!).slice(0,2),
    weaknesses:rows.filter(r=>r.gap!==null&&r.gap<=-.5).sort((a,b)=>a.gap!-b.gap!).slice(0,2),
  };
}
