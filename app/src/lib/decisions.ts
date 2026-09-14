import {bestLineup,forecast,isHeld,projectedTotal,starters,unavailable,type LeaguePlayer,type Snapshot} from './football';

export const ADVISOR_VERSION='2026-09-14.1';
export const ADVISOR_MODEL='gpt-5.6-luna';
export type Risk='careful'|'balanced'|'upside';
export type DecisionStatus='approved'|'declined'|'completed';
export type Decision={
  id:string; fingerprint:string; kind:'lineup'|'waiver'|'ir'|'trade'; title:string;
  players:string[]; gain:number|null; horizon:string; evidence:string[]; cautions:string[];
  moves:{playerId:string;slot:string}[]; expiresAt:number; link:string;
  status?:DecisionStatus; ai?:{verdict:'pursue'|'watch';priority:number;evidence:number[];cautions:number[]};
};
export type AdvisorData={
  decisions:Decision[]; stale:boolean; sourceAt:string|null; model:string;
  configured:boolean; enabled:boolean; risk:Risk; reviewedAt:number|null;
  callsToday:number; tokensToday:number; nextReviewAt:number; error:string|null;
  needsReview:boolean; fingerprint:string;
};
export const scopeOf=(s:Snapshot)=>`${s.leagueId}:${s.teamId}:${s.season}`;
const rounded=(n:number)=>Math.round(n*10)/10;
const ir=(p:LeaguePlayer)=>p.slotId===21||p.slotId===24||p.slot==='IR';
const baseline=(p:LeaguePlayer)=>forecast(p).baseline??p.projected;
export async function digest(value:unknown){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
// Excludes sync timestamps, live scores, team names and notes. Half-point buckets
// avoid spending tokens on inconsequential projection movement.
export function evidenceKey(s:Snapshot,risk:Risk,now=Date.now()){
  return [ADVISOR_VERSION,scopeOf(s),s.week,s.slots,s.rosterLimit,s.tradeDeadline,risk,
    s.players.map(p=>[p.id,p.teamId,p.slot,p.eligible,p.status,p.availability,p.droppable,isHeld(p,now),p.bye,p.scheduleKnown,p.kickoff,
      p.projected===null?null:Math.round(p.projected*2)/2,baseline(p)===null?null:Math.round(baseline(p)!*2)/2,
      p.history.length,p.future?.map(g=>[g.week,g.opponent,g.bye,g.known,g.kickoff,g.projected===null?null:Math.round(g.projected*2)/2])])];
}
function scheduleText(p:LeaguePlayer){return (p.future??[]).slice(0,4).map(g=>`W${g.week}: ${g.bye?'bye':g.opponent??'schedule unknown'}`).join(' · ')||'Future schedule unavailable';}
function evidence(p:LeaguePlayer){const f=forecast(p);return `${p.name}: ${f.points===null?'no current estimate':rounded(f.points)+' estimated points'}; ${p.status}; ${f.games} recent games. ${f.method}.`;}
function healthyFuture(p:LeaguePlayer,s:Snapshot,w:number):LeaguePlayer|null{
  const g=p.future?.find(g=>g.week===w),b=baseline(p);
  if(!g?.known||b===null||p.status!=='ACTIVE'||ir(p))return null;
  return {...p,projected:g.bye?0:g.projected??b,history:[],locked:false,scheduleKnown:true,kickoff:null,bye:g.bye,status:'ACTIVE'};
}

export async function generateDecisions(s:Snapshot,risk:Risk='balanced',now=Date.now()):Promise<Decision[]>{
  const mine=s.players.filter(p=>p.teamId===s.teamId),teamLink=`https://fantasy.espn.com/football/team?leagueId=${s.leagueId}&teamId=${s.teamId}&seasonId=${s.season}`;
  const out:Omit<Decision,'fingerprint'>[]=[],minimum=risk==='careful'?2:risk==='upside'?.5:1;
  const base=bestLineup(s,mine,now),current=starters(s),total=projectedTotal(current);
  const expiry=(players:LeaguePlayer[])=>Math.min(now+24*3600000,...players.map(p=>p.kickoff?Date.parse(p.kickoff):Infinity).filter(t=>t>now));
  const warnings=['Estimates are uncalibrated and can change before kickoff.','Approve saves your plan. Confirm the actual transaction in ESPN.'];
  const changed=base.picks.flatMap((p,i)=>p&&p.id!==current[i]?.id?[{p,old:current[i],slot:s.slots[i]}]:[]);
  // One complete plan preserves FLEX chains; separate swap cards could conflict.
  if(changed.length&&!base.missing&&current.every(p=>!p||forecast(p).points!==null)&&base.points-total.points>=minimum){
    const gain=rounded(base.points-total.points),involved=[...new Set(changed.flatMap(x=>[x.p,...(x.old?[x.old]:[])]))];
    out.push({id:'lineup:'+s.week,kind:'lineup',title:`Improve your starting lineup by an estimated ${gain} points`,players:involved.map(p=>p.id),gain,horizon:'This week',
      evidence:[...changed.map(x=>`${x.slot.label}: ${x.old?.name??'empty slot'} → ${x.p.name}.`),...involved.map(evidence)],cautions:[...warnings,...involved.filter(p=>p.status!=='ACTIVE').map(p=>`${p.name} is ${p.status}. Recheck before kickoff.`)],
      moves:base.picks.flatMap((p,i)=>p?[{playerId:p.id,slot:s.slots[i].id}]:[]),expiresAt:expiry(involved),link:teamLink});
  }
  const free=s.players.filter(p=>p.teamId===null&&['FREEAGENT','WAIVERS'].includes(p.availability)&&!isHeld(p,now)&&!unavailable(p)&&forecast(p).points!==null)
    .sort((a,b)=>forecast(b).points!-forecast(a).points!).slice(0,6);
  const bench=mine.filter(p=>!base.picks.some(b=>b?.id===p.id)&&!ir(p)&&!isHeld(p,now)&&p.droppable)
    .sort((a,b)=>(baseline(a)??Infinity)-(baseline(b)??Infinity));
  const drops:(LeaguePlayer|null)[]=mine.filter(p=>!ir(p)).length<s.rosterLimit?[null]:bench.slice(0,3);
  const waivers:Omit<Decision,'fingerprint'>[]=[];
  if(!base.missing)for(const add of free){let choice:{drop:LeaguePlayer|null;gain:number}|null=null;
    for(const drop of drops){
      // Avoid selling future depth for a one-week bump without evidence.
      if(drop&&(baseline(drop)===null||baseline(add)===null||baseline(drop)!>baseline(add)!))continue;
      const next=bestLineup(s,[...mine.filter(p=>p.id!==drop?.id),{...add,teamId:s.teamId}],now);
      if(!next.missing&&next.points-base.points>=minimum&&(!choice||next.points-base.points>choice.gain))choice={drop,gain:rounded(next.points-base.points)};
    }
    if(choice)waivers.push({id:'waiver:'+add.id+':'+(choice.drop?.id??'open'),kind:'waiver',title:`${add.availability==='WAIVERS'?'Claim':'Add'} ${add.name}${choice.drop?'; release '+choice.drop.name:''}`,players:[add.id,...(choice.drop?[choice.drop.id]:[])],gain:choice.gain,horizon:'This week, after optimizing your bench',evidence:[evidence(add),...(choice.drop?[evidence(choice.drop)]:['Your normal roster has an open space.']),scheduleText(add)],cautions:[...warnings,'Waiver priority, position limits, acquisition limits and budget must be confirmed in ESPN.','These are alternatives. Approving one does not make the others compatible.'],moves:[],expiresAt:expiry([add,...(choice.drop?[choice.drop]:[])]),link:teamLink});
  }
  out.push(...waivers.sort((a,b)=>b.gain!-a.gain!).slice(0,2));
  for(const p of mine.filter(ir).slice(0,3)){
    const b=baseline(p),replacement=free.find(x=>x.position===p.position),games=(p.future??[]).slice(0,4),known=games.filter(g=>g.known&&!g.bye).length;
    out.push({id:'ir:'+p.id,kind:'ir',title:p.status==='ACTIVE'?`Review activating ${p.name}`:`Keep ${p.name} in IR for now`,players:[p.id],gain:null,horizon:'Next four weeks',
      evidence:[`${p.name}: ESPN availability is ${p.status}.`,scheduleText(p),b===null?'No usable healthy baseline is available.':`Healthy scoring baseline: ${rounded(b)} per game. ${known} confirmed games in the next ${games.length||4} weeks. This is a return scenario, not a recovery forecast.`,replacement?`${replacement.name} is a current same-position alternative at ${rounded(forecast(replacement).points!)} estimated points this week.`:'No eligible same-position alternative is in the current free pool.','Releasing an IR player frees an IR space, not a normal roster space.'],
      cautions:['A verified return date and recovery outlook are not available. Do not release a player solely because this week’s projection is zero.','Reconsider if a verified absence covers your remaining fantasy schedule, or you need the IR space for a better stash.','Check ESPN news and IR eligibility before activation or release.'],moves:[],expiresAt:now+24*3600000,link:teamLink});
  }
  // A bounded set of cross-position surplus trades, scored for BOTH teams over
  // the next four scheduled weeks. No opponent difficulty or acceptance odds invented.
  const weeks=Array.from({length:Math.min(4,19-s.week)},(_,i)=>s.week+i);
  if(weeks.length>=2&&(!s.tradeDeadline||s.tradeDeadline>now)){
    const outgoing=mine.filter(p=>p.status==='ACTIVE'&&!isHeld(p,now)&&!ir(p)&&!base.picks.some(b=>b?.id===p.id)).sort((a,b)=>(baseline(b)??0)-(baseline(a)??0)).slice(0,3);
    let assessed=0;
    const score=(roster:LeaguePlayer[],teamId:number)=>{let points=0;for(const w of weeks){const pool=roster.filter(p=>p.status==='ACTIVE'&&!ir(p)).map(p=>healthyFuture(p,s,w));if(pool.some(p=>p===null))return null;const v=bestLineup({...s,teamId},pool as LeaguePlayer[],now);if(v.missing)return null;points+=v.points;}return points;};
    // Insufficient history/schedule anywhere in either roster suppresses a trade
    // instead of filling unknown values with zero.
    const ownerBase=score(mine,s.teamId),trades:Omit<Decision,'fingerprint'>[]=[];
    if(ownerBase!==null)for(const team of s.teams.filter(t=>t.id!==s.teamId)){
      const theirs=s.players.filter(p=>p.teamId===team.id),theirBase=score(theirs,team.id);if(theirBase===null)continue;
      const targets=theirs.filter(p=>p.status==='ACTIVE'&&!ir(p)&&!isHeld(p,now)).sort((a,b)=>(baseline(b)??0)-(baseline(a)??0)).slice(0,5);
      for(const give of outgoing)for(const get of targets){if(give.position===get.position||assessed>=24)continue;assessed++;
        const a=score([...mine.filter(p=>p.id!==give.id),{...get,teamId:s.teamId,slot:'BE',slotId:20}],s.teamId),b=score([...theirs.filter(p=>p.id!==get.id),{...give,teamId:team.id,slot:'BE',slotId:20}],team.id);
        if(a===null||b===null||a-ownerBase<minimum*weeks.length||b-theirBase<minimum*weeks.length)continue;
        trades.push({id:`trade:${give.id}:${get.id}`,kind:'trade',title:`Explore ${give.name} for ${get.name}`,players:[give.id,get.id],gain:rounded(a-ownerBase),horizon:`Next ${weeks.length} weeks combined`,evidence:[`Your optimized starter baseline improves by ${rounded(a-ownerBase)} points; ${team.name} improves by ${rounded(b-theirBase)} points across the same weeks.`,`${give.name}: ${scheduleText(give)}`,`${get.name}: ${scheduleText(get)}`,'Uses ESPN weekly projections where available, otherwise the healthy historical baseline. Actual byes count as zero.'],cautions:[...warnings,'This is a trade idea, not a fair-value guarantee or prediction that the other owner will accept.','Only currently healthy players are modeled. Injury returns, opponent strength, role changes and playoff weeks outside this window are not modeled.','Confirm the trade deadline, roster limits and both owners’ preferences in ESPN.'],moves:[],expiresAt:Math.min(expiry([give,get]),s.tradeDeadline??Infinity),link:teamLink});
      }
    }
    out.push(...trades.sort((a,b)=>b.gain!-a.gain!).slice(0,2));
  }
  return Promise.all(out.slice(0,8).map(async d=>({...d,fingerprint:await digest([ADVISOR_VERSION,s.week,risk,d.id,d.title,d.players,d.gain,d.evidence,d.cautions,d.moves])})));
}
