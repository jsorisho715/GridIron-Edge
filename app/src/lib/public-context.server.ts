import { authorized } from './espn-connection.server';
import { boundedText, missingConfig, type ConnectionEnv } from './espn-security.server';
import type { Snapshot } from './football';
import { normalizeNews } from './league-intel';
import { gameWindow, normalizeNFLGames, normalizeNFLInjuries } from './nfl-context';
import { rememberPlayers } from './player-memory.server';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store, private',Vary:'Cookie'}});
export async function handlePublicContext(request: Request, env: ConnectionEnv) {
  try {
    if(missingConfig(env).length)return json({error:'Secure setup is incomplete.'},503);
    if(!await authorized(request,env))return json({error:'Unlock your private workspace.'},401);
    if(request.method!=='POST')return json({error:'Method not allowed.'},405);
    if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site')return json({error:'Open the app directly.'},403);
    if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return json({error:'Use JSON.'},415);
    let body:any;try{body=JSON.parse(await boundedText(new Response(request.body),512000));}catch{return json({error:'Invalid public context.'},400);}
    const now=Date.now();
    if(!body||!body.sources||typeof body.sources!=='object'||!Number.isSafeInteger(body.collectedAt)||Math.abs(now-body.collectedAt)>10*60000)return json({error:'Public context is missing or too old.'},400);
    const row=await env.DB!.prepare('SELECT w.snapshot,c.revision FROM ge_workspace_cache w JOIN ge_espn_connection c ON w.connection_revision=c.revision WHERE w.id=1 AND c.id=1').first<{snapshot:string;revision:string}>();
    if(!row)return json({error:'Sync your league first.'},409);
    const s:Snapshot=JSON.parse(row.snapshot),previous=structuredClone(s),scope=[s.leagueId,s.teamId,s.season].join(':');
    const preferences=await env.DB!.prepare('SELECT value FROM ge_workspace_preferences WHERE scope=?').bind(scope).first<{value:string}>();
    if(preferences&&JSON.parse(preferences.value).paused)return json({error:'Monitoring is paused.'},409);
    if(body.expectedSnapshot!==s.acquiredAt||body.gameWindow!==gameWindow(s)||!s.intel?.nfl)return json({error:'The league snapshot changed. Retry on the next scheduled check.'},409);
    const feed={checkedAt:body.collectedAt,attemptedAt:now,error:null};
    if(body.sources.news){s.intel.news=normalizeNews(body.sources.news);s.intel.headlines=feed;}
    if(body.sources.injuries){s.intel.nfl.injuries=normalizeNFLInjuries(body.sources.injuries).slice(0,1200);s.intel.nfl.injuryFeed={...feed,checkedAt:now};}
    if(body.sources.games){s.intel.nfl.games=normalizeNFLGames(body.sources.games);s.intel.nfl.marketFeed=feed;}
    s.playerMemory=await rememberPlayers(env,s,previous,row.revision,now);
    s.contextUpdatedAt=now;
    const serialized=JSON.stringify(s);if(serialized.length>1500000)return json({error:'Context exceeded the storage limit.'},400);
    // Do not advance the league refresh timestamp when only public context changed.
    const result=await env.DB!.prepare('UPDATE ge_workspace_cache SET snapshot=? WHERE id=1 AND connection_revision=? AND snapshot=? AND EXISTS(SELECT 1 FROM ge_espn_connection WHERE id=1 AND revision=?)').bind(serialized,row.revision,row.snapshot,row.revision).run();
    return result.meta.changes?json({updated:true}):json({error:'The league changed while context was being saved.'},409);
  }catch{return json({error:'Public context could not be validated or saved.'},503);}
}
