import {expect,test} from 'bun:test';
import {Database} from 'bun:sqlite';
import {handleConnection} from '../src/lib/espn-connection.server';
import {handleAdvisor,advisorData,reviewAdvisor,reviewRequest,validateReview} from '../src/lib/advisor.server';
import {generateDecisions,digest,evidenceKey,ADVISOR_MODEL} from '../src/lib/decisions';
import {encryptConnection,randomToken,type ConnectionEnv} from '../src/lib/espn-security.server';
import {normalizeLeague} from '../src/lib/espn-normalize';
import type {LeaguePlayer,Snapshot} from '../src/lib/football';
import {input,leagueFixture} from './fixtures/live';
const origin='https://app.test',key='sk-'+('synthetic_key_'.repeat(4));
function snapshot(){const f=leagueFixture(),now=Date.now();const s=normalizeLeague(f.core,f.cards,f.free,f.schedule,input,now);s.players=s.players.map(p=>({...p,locked:false,kickoff:new Date(now+86400000).toISOString(),future:Array.from({length:4},(_,i)=>({week:2+i,opponent:'TEN',kickoff:new Date(now+(1+i*7)*86400000).toISOString(),bye:false,known:true,projected:null}))}));return s;}
async function fixture(){
  const db=new Database(':memory:');for(const f of ['0002_secure_espn.sql','0003_live_workspace.sql','0004_decision_advisor.sql'])db.exec(await Bun.file(new URL('../migrations/'+f,import.meta.url)).text());
  const env:ConnectionEnv={OWNER_ACCESS_KEY:randomToken(),CREDENTIAL_ENCRYPTION_KEY:randomToken(),DB:{async batch(statements:any[]){return Promise.all(statements.map(s=>s.run()));},prepare(sql:string){let args:any[]=[];return{bind(...values:any[]){args=values;return this;},async first(){return db.query(sql).get(...args)??null;},async all(){return{results:db.query(sql).all(...args),success:true};},async run(){return{success:true,meta:{changes:db.query(sql).run(...args).changes}};}};}} as unknown as ConnectionEnv['DB']};
  await env.DB!.prepare('INSERT INTO ge_espn_connection VALUES(1,?,?,?)').bind(await encryptConnection(env.CREDENTIAL_ENCRYPTION_KEY!,input),JSON.stringify({leagueId:input.leagueId,teamId:25,season:2026}),'revision').run();
  const s=snapshot();const save=(s:Snapshot)=>db.query('INSERT OR REPLACE INTO ge_workspace_cache VALUES(1,?,?,?)').run('revision',JSON.stringify(s),Date.now());save(s);
  const login=await handleConnection(new Request(origin+'/api/gridiron/connection',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({action:'login',ownerKey:env.OWNER_ACCESS_KEY})}),env);
  const cookie=login.headers.get('set-cookie')!.split(';')[0];
  const request=(body?:unknown,auth=true,headers={})=>new Request(origin+'/api/gridiron/advisor',{method:body?'POST':'GET',headers:{origin,'content-type':'application/json',cookie:auth?cookie:'',...headers},body:body?JSON.stringify(body):undefined});
  let paid=0,bad=false,redirect=false;const payloads:any[]=[];
  const transport=(async(url:RequestInfo|URL,options?:RequestInit)=>{
    expect(options?.redirect).toBe('manual');expect(new Headers(options?.headers).get('authorization')).toBe('Bearer '+key);
    if(String(url).includes('/models/'))return Response.json({id:ADVISOR_MODEL});
    expect(String(url)).toBe('https://api.openai.com/v1/responses');paid++;const body=JSON.parse(options!.body as string);payloads.push(body);
    if(redirect)return new Response(null,{status:302,headers:{location:'https://evil.test'}});
    const candidates=JSON.parse(body.input).candidates;
    return Response.json({status:'completed',usage:{total_tokens:410},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({decisions:candidates.map((d:any,i:number)=>({id:bad?'invented':d.id,priority:i+1,verdict:'pursue',evidence:[0],cautions:[0]}))})}]}]});
  }) as typeof fetch;
  const enable=()=>handleAdvisor(request({action:'configure',key,risk:'balanced',enabled:true}),env,transport);
  return {db,env,s,save,request,transport,enable,paid:()=>paid,payloads,bad:()=>{bad=true;},redirect:()=>{redirect=true;}};
}
test('decision engine respects complete plans, locks, IR uncertainty and future byes',async()=>{
  const s=snapshot();s.players.find(p=>p.teamId===25&&p.slotId===20)!.slotId=21;s.players.find(p=>p.teamId===25&&p.slotId===21)!.status='INJURY_RESERVE';
  const ds=await generateDecisions(s);expect(ds.some(d=>d.kind==='lineup')).toBe(true);const stash=ds.find(d=>d.kind==='ir')!;expect(stash.title).toStartWith('Keep');expect(stash.gain).toBeNull();expect(stash.cautions.join(' ')).toContain('verified return date');expect(stash.evidence.join(' ')).toContain('W5: TEN');
  const lineup=ds.find(d=>d.kind==='lineup')!;expect(new Set(lineup.moves.map(m=>m.playerId)).size).toBe(lineup.moves.length);
  for(const p of s.players)p.locked=true;expect((await generateDecisions(s)).some(d=>d.kind==='lineup'||d.kind==='waiver'||d.kind==='trade')).toBe(false);
});
test('trade ideas require a modeled improvement for both teams, and disappear with missing schedules or deadline',async()=>{
  const s=snapshot();s.slots=[{id:'0:0',espnId:0,label:'QB'},{id:'2:0',espnId:2,label:'RB'}];s.teams=s.teams.slice(0,2);s.rosterLimit=3;
  const p=(id:string,teamId:number,position:string,points:number,slot:string):LeaguePlayer=>({...s.players[0],id,name:id,teamId,position,status:'ACTIVE',eligible:[position==='QB'?0:2,20],slot,slotId:slot==='BE'?20:position==='QB'?0:2,projected:points,history:Array.from({length:6},(_,i)=>({season:2025,week:i+1,points,projected:null}))});
  s.players=[p('My QB',25,'QB',5,'0:0'),p('My RB',25,'RB',20,'2:0'),p('Spare RB',25,'RB',18,'BE'),p('Their QB',1,'QB',20,'0:0'),p('Their RB',1,'RB',5,'2:0'),p('Spare QB',1,'QB',18,'BE')];
  const trades=(await generateDecisions(s)).filter(d=>d.kind==='trade');expect(trades.length).toBeGreaterThan(0);expect(trades.every(d=>d.gain!>0&&d.evidence[0].includes('improves by'))).toBe(true);
  s.tradeDeadline=Date.now()-1;expect((await generateDecisions(s)).filter(d=>d.kind==='trade')).toHaveLength(0);s.tradeDeadline=null;s.players[0].future=[];expect((await generateDecisions(s)).filter(d=>d.kind==='trade')).toHaveLength(0);
});
test('stable evidence ignores timestamps and scores, but notices locks, status, roster and schedule changes',async()=>{
  const s=snapshot(),key=await digest(evidenceKey(s,'balanced')),copy=structuredClone(s);copy.acquiredAt='different';copy.players[0].actual=100;expect(await digest(evidenceKey(copy,'balanced'))).toBe(key);copy.players[0].status='OUT';expect(await digest(evidenceKey(copy,'balanced'))).not.toBe(key);
  copy.players[0].status=s.players[0].status;copy.players[0].future![1].bye=true;expect(await digest(evidenceKey(copy,'balanced'))).not.toBe(key);
});
test('owner authentication, origin and encrypted key handling fail closed',async()=>{
  const f=await fixture();expect((await handleAdvisor(f.request(undefined,false),f.env)).status).toBe(401);expect((await handleAdvisor(f.request({action:'review'},true,{origin:'https://evil.test'}),f.env)).status).toBe(403);
  const r=await f.enable();expect(r.status).toBe(200);expect(await r.text()).not.toContain(key);expect(JSON.stringify(f.db.query('SELECT * FROM ge_advisor_config').all())).not.toContain(key);expect(f.paid()).toBe(0);
});
test('AI reviews are bounded, grounded, cached across refreshes and approvals, with no private notes or cookies',async()=>{
  const f=await fixture();await f.enable();await Promise.all([reviewAdvisor(f.env,f.transport),reviewAdvisor(f.env,f.transport)]);expect(f.paid()).toBe(1);
  let data=await advisorData(f.env);expect(data.reviewedAt).not.toBeNull();expect(data.tokensToday).toBe(410);expect(data.decisions[0].ai).toBeDefined();
  const payload=JSON.stringify(f.payloads[0]);expect(payload).not.toContain(input.espnS2);expect(payload).not.toContain(input.swid);expect(payload).not.toContain(key);expect(payload).not.toContain(f.s.leagueName);expect(f.payloads[0].store).toBe(false);expect(f.payloads[0].max_output_tokens).toBe(1536);expect(new TextEncoder().encode(payload).length).toBeLessThan(18000);
  const d=data.decisions[0];const r=await handleAdvisor(f.request({action:'decide',id:d.id,fingerprint:d.fingerprint,status:'approved',previousStatus:null}),f.env);expect(r.status).toBe(200);
  f.db.exec('UPDATE ge_advisor_config SET last_attempt=0');await reviewAdvisor(f.env,f.transport);expect(f.paid()).toBe(1);data=await advisorData(f.env);expect(data.decisions[0].status).toBe('approved');expect(data.reviewedAt).not.toBeNull();
  expect((await handleAdvisor(f.request({action:'decide',id:d.id,fingerprint:d.fingerprint,status:'declined',previousStatus:null}),f.env)).status).toBe(409);
});
test('stale data, paused monitoring and changed evidence cannot be approved or trigger paid review',async()=>{
  const f=await fixture();await f.enable();const d=(await advisorData(f.env)).decisions[0];f.s.acquiredAt=new Date(Date.now()-3600000).toISOString();f.save(f.s);
  expect((await handleAdvisor(f.request({action:'decide',id:d.id,fingerprint:d.fingerprint,status:'approved',previousStatus:null}),f.env)).status).toBe(409);await reviewAdvisor(f.env,f.transport);expect(f.paid()).toBe(0);
  f.s.acquiredAt=new Date().toISOString();f.save(f.s);f.db.query('INSERT INTO ge_workspace_preferences VALUES(?,?,?)').run('10309566:25:2026',JSON.stringify({paused:true}),Date.now());await reviewAdvisor(f.env,f.transport);expect(f.paid()).toBe(0);
});
test('invalid model output and redirects preserve statistical advice and cannot retry beyond daily cap',async()=>{
  const f=await fixture();await f.enable();f.bad();for(let i=0;i<6;i++){f.db.exec('UPDATE ge_advisor_config SET last_attempt=0');await reviewAdvisor(f.env,f.transport);}expect(f.paid()).toBe(4);const data=await advisorData(f.env);expect(data.reviewedAt).toBeNull();expect(data.error).toContain('validated');expect(data.decisions.length).toBeGreaterThan(0);
  const g=await fixture();await g.enable();g.redirect();await reviewAdvisor(g.env,g.transport);expect(g.paid()).toBe(1);expect((await advisorData(g.env)).reviewedAt).toBeNull();
});
test('strict review validation rejects invented IDs and fabricated evidence indexes',async()=>{
  const ds=(await generateDecisions(snapshot())).slice(0,1);expect(()=>validateReview({decisions:[{id:ds[0].id,verdict:'pursue',priority:1,evidence:[999],cautions:[0]}]},ds)).toThrow();expect(reviewRequest(ds,'balanced').text.format.strict).toBe(true);
});
