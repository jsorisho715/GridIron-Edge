import type { D1PreparedStatement } from '@cloudflare/workers-types';
import { authorized } from './espn-connection.server';
import { boundedText, decryptConnection, missingConfig, randomToken, SafeError, type ConnectionEnv } from './espn-security.server';
import type { ESPNInput } from './espn-provider.server';
import { readESPN } from './espn-data.server';
import { normalizeLeague } from './espn-normalize';
import { EMPTY_PREFS, type Preferences, type Snapshot, type WorkspaceData, type Alert } from './football';
import { deliverAlerts, handlePush } from './push.server';
import { enrichLeague } from './league-intel.server';
import { activityText, currentOpponent } from './league-intel';
import { readPlayerMemory, rememberPlayers } from './player-memory.server';

type ConnectionRow={envelope:string;metadata:string;revision:string};
type HealthRow={last_attempt:number|null;last_success:number|null;next_attempt:number|null;failures:number;error:string|null;heartbeat:number|null;lease_until:number};
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store, private','Vary':'Cookie'}});
const scopeOf=(row:ConnectionRow)=>{const c=JSON.parse(row.metadata);return [c.leagueId,c.teamId,c.season].join(':');};
const connection=(env:ConnectionEnv)=>env.DB!.prepare('SELECT envelope,metadata,revision FROM ge_espn_connection WHERE id=1').first<ConnectionRow>();
async function prefs(env:ConnectionEnv,scope:string):Promise<Preferences>{const row=await env.DB!.prepare('SELECT value,updated_at FROM ge_workspace_preferences WHERE scope=?').bind(scope).first<{value:string;updated_at:number}>();return row?{...EMPTY_PREFS,...JSON.parse(row.value),updatedAt:row.updated_at}:{...EMPTY_PREFS};}
async function cache(env:ConnectionEnv,row:ConnectionRow){return env.DB!.prepare('SELECT snapshot,updated_at FROM ge_workspace_cache WHERE id=1 AND connection_revision=?').bind(row.revision).first<{snapshot:string;updated_at:number}>();}
export async function workspaceData(env:ConnectionEnv):Promise<WorkspaceData>{
  const row=await connection(env),health=await env.DB!.prepare('SELECT * FROM ge_sync_health WHERE id=1').first<HealthRow>();
  const saved=row?await cache(env,row):null,scope=row?scopeOf(row):'';
  const alerts=scope?(await env.DB!.prepare('SELECT id,title,detail,player_id AS playerId,kind,created_at AS createdAt FROM ge_alerts WHERE scope=? ORDER BY created_at DESC LIMIT 80').bind(scope).all<Alert>()).results:[];
  return {snapshot:saved?JSON.parse(saved.snapshot):null,preferences:scope?await prefs(env,scope):{...EMPTY_PREFS},alerts,connected:!!row,
    needsSync:!!row&&(!saved||Date.now()-saved.updated_at>15*60000),health:{lastSuccess:saved?.updated_at??null,lastAttempt:health?.last_attempt??null,nextAttempt:health?.next_attempt??null,error:health?.error??null,running:(health?.lease_until??0)>Date.now(),heartbeat:health?.heartbeat??null}};
}
function alertStatement(env:ConnectionEnv,scope:string,id:string,title:string,detail:string,kind:string,playerId:string|null=null){return env.DB!.prepare('INSERT OR IGNORE INTO ge_alerts(id,scope,title,detail,player_id,kind,created_at) VALUES(?,?,?,?,?,?,?)').bind(scope+':'+id,scope,title.slice(0,160),detail.slice(0,600),playerId,kind,Date.now());}
export async function syncWorkspace(env:ConnectionEnv,transport:typeof fetch=fetch,scheduled=false){
  if(missingConfig(env).length)return {synced:false,reason:'setup'};
  const row=await connection(env);if(!row)return {synced:false,reason:'not_connected'};
  const scope=scopeOf(row),preferences=await prefs(env,scope),now=Date.now();
  if(scheduled)await env.DB!.prepare('UPDATE ge_sync_health SET heartbeat=? WHERE id=1').bind(now).run();
  if(preferences.paused)return {synced:false,reason:'paused'};
  const saved=await cache(env,row),health=await env.DB!.prepare('SELECT * FROM ge_sync_health WHERE id=1').first<HealthRow>();
  const oldSnapshot:Snapshot|null=saved?JSON.parse(saved.snapshot):null;
  const needsUpgrade=!!oldSnapshot&&(!oldSnapshot.intel?.nfl||oldSnapshot.playerMemory===undefined);
  if((saved&&!needsUpgrade&&now-saved.updated_at<120000)||((!needsUpgrade||health?.error)&&(health?.next_attempt??0)>now))return {synced:false,reason:'cached'};
  const lease=randomToken();
  const acquired=await env.DB!.prepare('UPDATE ge_sync_health SET lease_token=?,lease_until=?,last_attempt=? WHERE id=1 AND lease_until<?').bind(lease,now+180000,now,now).run();
  if(!acquired.meta.changes)return {synced:false,reason:'running'};
  try {
    const input=await decryptConnection<ESPNInput>(env.CREDENTIAL_ENCRYPTION_KEY!,row.envelope);
    const core=await readESPN(input,'league',{view:['mTeam','mRoster','mSettings','mStandings','mMatchup','mMatchupScore','mScoreboard']},undefined,transport);
    const week=core.scoringPeriodId??core.status?.currentScoringPeriod??1;
    const optional=await Promise.allSettled([
      readESPN(input,'schedule',{view:'proTeamSchedules_wl'},undefined,transport),
      readESPN(input,'league',{view:'kona_player_info',scoringPeriodId:String(week)},{players:{filterStatus:{value:['FREEAGENT','WAIVERS']},limit:75,sortPercOwned:{sortPriority:1,sortAsc:false}}},transport),
    ]);
    const schedule=optional[0].status==='fulfilled'?optional[0].value:null,free=optional[1].status==='fulfilled'?optional[1].value:null;
    const currentMatch=(core.schedule??[]).find((m:any)=>m.matchupPeriodId===(core.status?.currentMatchupPeriod??week)&&(m.home?.teamId===input.teamId||m.away?.teamId===input.teamId));
    const opponentId=currentMatch?(currentMatch.home?.teamId===input.teamId?currentMatch.away?.teamId:currentMatch.home?.teamId):null;
    const teamIds=(id:number|null)=>(core.teams??[]).filter((t:any)=>t.id===id).flatMap((t:any)=>(t.roster?.entries??[]).map((e:any)=>e.playerPoolEntry?.player?.id));
    const ids=[...new Set<number>([...teamIds(input.teamId),...preferences.watched.map(Number),...teamIds(opponentId),...(free?.players??[]).slice(0,50).map((e:any)=>e.player?.id)].filter(Number.isSafeInteger))].slice(0,120);
    let cards:any=null,weekly:any=null;
    if(ids.length){
      const results=await Promise.allSettled([
        readESPN(input,'league',{view:'kona_playercard',scoringPeriodId:String(week)},{players:{filterIds:{value:ids},filterStatsForTopScoringPeriodIds:{value:18,additionalValue:['00'+input.season,'10'+input.season,'00'+(input.season-1),'10'+(input.season-1)]}}},transport),
        readESPN(input,'league',{view:'kona_player_info',scoringPeriodId:String(week)},{players:{filterIds:{value:ids},limit:120}},transport),
      ]);
      cards=results[0].status==='fulfilled'?results[0].value:null;
      weekly=results[1].status==='fulfilled'?results[1].value:null;
    }
    // Weekly projection views and history cards can carry different stats. Merge,
    // never replace the current roster projection with a history-only card.
    const merged=new Map<number,any>();
    for(const e of [...(cards?.players??[]),...(weekly?.players??[])]){
      const id=e.player?.id;if(!Number.isSafeInteger(id))continue;const previous=merged.get(id);
      merged.set(id,previous?{...previous,...e,player:{...previous.player,...e.player,stats:[...(e.player.stats??[]),...(previous.player.stats??[])]}}:e);
    }
    const snapshot=normalizeLeague(core,merged.size?{players:[...merged.values()]}:null,free,schedule,input,now);
    if(!schedule)snapshot.warnings.push('NFL schedule unavailable. Lineup changes are held until kickoff locks can be verified.');
    if(!free)snapshot.warnings.push('Waiver availability could not be refreshed. No free-agent recommendations are shown.');
    if(!cards)snapshot.warnings.push('Player history could not be refreshed. Available ESPN projections are shown.');
    const owned=snapshot.players.filter(p=>p.teamId===input.teamId);
    if(owned.length&&owned.every(p=>p.projected===null))snapshot.warnings.push('ESPN has not returned current-week projections. Estimates use available completed-game history.');
    if(!owned.length)snapshot.warnings.push('ESPN returned an empty roster. This may be a predraft league.');
    if(owned.some(p=>!p.scheduleKnown))snapshot.warnings.push('Some kickoff times are unknown. Those players are held in their current slots.');
    const previous:Snapshot|null=saved?JSON.parse(saved.snapshot):null;
    snapshot.intel=await enrichLeague(snapshot,previous,input,transport,now);
    snapshot.playerMemory=await rememberPlayers(env,snapshot,previous,row.revision,now);
    const serialized=JSON.stringify(snapshot);if(serialized.length>1500000)throw new SafeError(502,'size','League data exceeded the storage safety limit.');
    // Conditional commit prevents a slow sync from reviving disconnected or replaced data.
    const commit=await env.DB!.prepare('INSERT INTO ge_workspace_cache(id,connection_revision,snapshot,updated_at) SELECT 1,?,?,? WHERE EXISTS(SELECT 1 FROM ge_espn_connection WHERE id=1 AND revision=?) AND EXISTS(SELECT 1 FROM ge_sync_health WHERE id=1 AND lease_token=?) ON CONFLICT(id) DO UPDATE SET connection_revision=excluded.connection_revision,snapshot=excluded.snapshot,updated_at=excluded.updated_at').bind(row.revision,serialized,now,row.revision,lease).run();
    if(!commit.meta.changes)return {synced:false,reason:'connection_changed'};
    const pendingAlerts:D1PreparedStatement[]=[];
    const rival=currentOpponent(snapshot);
    // First import establishes a baseline. Never notify a historical transaction dump.
    if(previous&&rival){
      const oldIds=new Set(previous.intel?.activity.map(e=>e.id)??[]);
      const recent=snapshot.intel.activity.filter(e=>!oldIds.has(e.id)&&e.at>=Date.parse(previous.acquiredAt)&&e.at>now-30*60000&&(e.fromTeamId===rival.id||e.toTeamId===rival.id));
      if(recent.length)pendingAlerts.push(alertStatement(env,scope,'opponent:'+recent[0].id,'Your opponent has updates',recent.slice(0,3).map(e=>activityText(e,snapshot)).join('. ')+'. Review Opponents for your next step.','opponent'));
    }
    for(const p of snapshot.players.filter(p=>p.teamId===input.teamId||preferences.watched.includes(p.id))){
      const prior=previous?.players.find(x=>x.id===p.id);
      if((prior&&prior.status!==p.status)||(!prior&&p.status!=='ACTIVE'))pendingAlerts.push(alertStatement(env,scope,'status:'+p.id+':'+p.status+':'+(prior?now:week),p.name+': '+p.status,prior?'Availability changed from '+prior.status+'. Review your lineup in ESPN.':'ESPN reports '+p.status+'. Review before kickoff.','injury',p.id));
      if(p.slot&&snapshot.slots.some(s=>s.id===p.slot)&&p.status!=='ACTIVE'&&p.kickoff&&!p.locked&&Date.parse(p.kickoff)-now<2*3600000)pendingAlerts.push(alertStatement(env,scope,'kickoff:'+p.id+':'+p.kickoff,'Kickoff check: '+p.name,'Your starter has an availability flag and kickoff is within two hours.','kickoff',p.id));
    }
    for(let i=0;i<pendingAlerts.length;i+=50)await env.DB!.batch(pendingAlerts.slice(i,i+50));
    await env.DB!.prepare('INSERT INTO ge_weekly_history(scope,season,week,summary,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(scope,season,week) DO UPDATE SET summary=excluded.summary,updated_at=excluded.updated_at').bind(scope,input.season,week,JSON.stringify({matchups:snapshot.matchups.filter(m=>m.week<=week&&m.endWeek>=week),team:snapshot.teams.find(t=>t.id===input.teamId)}),now).run();
    await env.DB!.prepare('UPDATE ge_sync_health SET last_success=?,failures=0,error=NULL,next_attempt=?,lease_until=0 WHERE id=1 AND lease_token=?').bind(now,now+120000,lease).run();
    await env.DB!.prepare('DELETE FROM ge_alerts WHERE created_at<?').bind(now-90*86400000).run();
    await deliverAlerts(env,scope,transport).catch(()=>{});
    const projectionPeriods=[...new Set([...merged.values()].flatMap(e=>(e.player?.stats??[]).filter((s:any)=>s.statSourceId===1).map((s:any)=>[s.seasonId,s.scoringPeriodId,s.statSplitTypeId,typeof s.appliedTotal==='number'].join(':'))))].sort().slice(0,80);
    return {synced:true,diagnostics:{season:input.season,week,weeklyCards:weekly?.players?.length??0,projectionPeriods},players:snapshot.players.length,rostered:owned.length,historyPlayers:owned.filter(p=>p.history.length).length,schedulePlayers:owned.filter(p=>p.scheduleKnown).length,warnings:snapshot.warnings};
  }catch(error){
    const message=error instanceof SafeError?error.message:'The league response could not be imported. Last successful data is preserved.';
    const failures=(health?.failures??0)+1,delay=error instanceof SafeError&&['espn_auth','espn_forbidden','key_changed'].includes(error.code)?6*3600000:Math.min(3600000,15*60000*2**Math.min(failures-1,3));
    await env.DB!.prepare('UPDATE ge_sync_health SET failures=?,error=?,next_attempt=?,lease_until=0 WHERE id=1 AND lease_token=?').bind(failures,message,now+delay,lease).run();
    await alertStatement(env,scope,'sync:'+Math.floor(now/86400000),'League sync needs attention',message,'connection').run();
    await deliverAlerts(env,scope,transport).catch(()=>{});
    return {synced:false,reason:'error',error:message};
  }finally{await env.DB!.prepare('UPDATE ge_sync_health SET lease_until=0 WHERE id=1 AND lease_token=?').bind(lease).run();}
}
export async function handleWorkspace(request:Request,env:ConnectionEnv,transport:typeof fetch=fetch){
  try {
    if(missingConfig(env).length)return json({error:'Secure setup is incomplete.',code:'setup'},503);
    if(!await authorized(request,env))return json({error:'Unlock your private workspace.',code:'locked'},401);
    if(request.method==='GET'){
      const data=await workspaceData(env),player=new URL(request.url).searchParams.get('player');
      if(player!==null){if(!/^\d{1,12}$/.test(player)||!data.snapshot?.players.some(p=>p.id===player))return json({error:'Player is not in your current private workspace.'},404);return json(await readPlayerMemory(env,data.snapshot,player));}
      return json(data);
    }
    if(request.method!=='POST')return json({error:'Method not allowed.'},405);
    if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site')return json({error:'Open the app directly before making changes.'},403);
    if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return json({error:'Use the app form.'},415);
    let body:Record<string,unknown>;try{body=JSON.parse(await boundedText(new Response(request.body),16000));if(!body||typeof body!=='object'||Array.isArray(body))throw new Error();}catch{return json({error:'Invalid request.'},400);}
    if(body.action==='sync')return json({...await syncWorkspace(env,transport),workspace:await workspaceData(env)});
    if(typeof body.action==='string'&&body.action.startsWith('push_'))return handlePush(body,env,transport);
    const row=await connection(env);if(!row)return json({error:'Connect ESPN first.'},409);
    if(body.action==='preferences'){
      const scope=scopeOf(row),previous=await prefs(env,scope);
      if(body.updatedAt!==previous.updatedAt)return json({error:'Your preferences changed on another device. Refresh and retry.',code:'conflict'},409);
      const next={...previous},ids=(value:unknown)=>Array.isArray(value)&&value.length<=100&&value.every(x=>typeof x==='string'&&x.length<=180);
      if(body.watched!==undefined){if(!ids(body.watched))return json({error:'Invalid watchlist.'},400);next.watched=[...new Set(body.watched as string[])];}
      if(body.reviewed!==undefined){if(!ids(body.reviewed))return json({error:'Invalid reviewed items.'},400);next.reviewed=body.reviewed as string[];}
      if(body.notes!==undefined){if(typeof body.notes!=='string'||body.notes.length>4000)return json({error:'Notes must be at most 4,000 characters.'},400);next.notes=body.notes;}
      if(body.paused!==undefined){if(typeof body.paused!=='boolean')return json({error:'Invalid monitoring setting.'},400);next.paused=body.paused;}
      next.updatedAt=Math.max(Date.now(),previous.updatedAt+1);
      const result=await env.DB!.prepare('INSERT INTO ge_workspace_preferences(scope,value,updated_at) VALUES(?,?,?) ON CONFLICT(scope) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at WHERE ge_workspace_preferences.updated_at=?').bind(scope,JSON.stringify(next),next.updatedAt,previous.updatedAt).run();
      if(!result.meta.changes)return json({error:'Your preferences changed on another device. Refresh and retry.',code:'conflict'},409);
      return json({preferences:next});
    }
    return json({error:'Unknown action.'},400);
  }catch(error){return json({error:error instanceof SafeError?error.message:'Private workspace storage is temporarily unavailable.',code:error instanceof SafeError?error.code:'storage'},error instanceof SafeError?error.status:503);}
}
