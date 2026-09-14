import {useCallback,useEffect,useRef,useState} from 'react';
import {ArrowUpRight,Check,Lightning,ShieldCheck} from '@phosphor-icons/react';
import type {LeaguePlayer} from '../../lib/football';
import {PlayerPhoto} from './PlayerPhoto';
import type {AdvisorData,Decision,DecisionStatus,Risk} from '../../lib/decisions';

async function request(body?:Record<string,unknown>):Promise<AdvisorData>{
  const response=await fetch('/api/gridiron/advisor',{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});
  const value=await response.json();if(!response.ok)throw Object.assign(new Error(value.error??'Could not load decisions.'),{status:response.status});return value;
}
export function useAdvisor(ready:boolean,sourceAt:string|undefined,paused:boolean|undefined,onAuthError:(error:any)=>void){
  const [data,setData]=useState<AdvisorData|null>(null),[busy,setBusy]=useState(''),[error,setError]=useState('');
  const epoch=useRef(0),running=useRef(false),enabled=useRef(ready);enabled.current=ready;
  const act=useCallback(async(body?:Record<string,unknown>)=>{
    if(running.current||!enabled.current)return;running.current=true;const ticket=epoch.current;setBusy(body?.action as string??'load');setError('');
    try{let result=await request(body);if(enabled.current&&epoch.current===ticket){setData(result);
      if(!body&&result.needsReview){setBusy('review');result=await request({action:'review'});if(enabled.current&&epoch.current===ticket)setData(result);}
    }}catch(e:any){if(enabled.current&&epoch.current===ticket){setError(e.name==='TimeoutError'?'The review is taking longer than expected. Its saved result will appear on refresh.':e.message);if(e.status===401)onAuthError(e);}}
    finally{running.current=false;if(epoch.current===ticket)setBusy('');}
  },[onAuthError]);
  useEffect(()=>{epoch.current++;if(!ready){setData(null);setBusy('');setError('');return;}
    void act();const timer=setInterval(()=>{if(document.visibilityState==='visible')void act();},60000);
    return()=>{epoch.current++;clearInterval(timer);};
  },[ready,sourceAt,paused,act]);
  return {data,busy,error,act};
}
type Advisor=ReturnType<typeof useAdvisor>;
export function DecisionQueue({advisor,onSettings,players=[],onPlayer}:{advisor:Advisor;onSettings:()=>void;players?:LeaguePlayer[];onPlayer?:(p:LeaguePlayer)=>void}){
  const {data,busy,error,act}=advisor,[showHistory,setShowHistory]=useState(false);
  const pending=data?.decisions.filter(d=>!d.status).sort((a,b)=>(a.ai?.priority??5)-(b.ai?.priority??5))??[];
  const approved=data?.decisions.filter(d=>d.status==='approved')??[],history=data?.decisions.filter(d=>d.status==='declined'||d.status==='completed')??[];
  const decide=(d:Decision,status:DecisionStatus)=>void act({action:'decide',id:d.id,fingerprint:d.fingerprint,status,previousStatus:d.status??null});
  const card=(d:Decision,i:number)=><article key={d.id} className={'ga-decision '+(i===0&&!d.status?'ga-priority':'')} aria-label={d.title}>
    <div className="ga-card-top"><span className="ge-eyebrow">{d.kind==='ir'?'INJURED RESERVE':d.kind.toUpperCase()} · {d.horizon}</span><span className="ge-tag">{d.status==='approved'?'APPROVED PLAN':d.status==='completed'?'MARKED DONE':d.status==='declined'?'DECLINED':d.ai?d.ai.verdict==='pursue'?'AI: RECOMMENDED':'AI: WATCH / REVIEW':'STATISTICAL SUGGESTION'}</span></div>
    <h3>{d.title}</h3><div className="gi-decision-players">{d.players.slice(0,4).map(id=>players.find(p=>p.id===id)).filter((p):p is LeaguePlayer=>!!p).map(p=><button className="gi-player-chip" key={p.id} onClick={()=>onPlayer?.(p)}><PlayerPhoto player={p}/><span>{p.name}</span></button>)}</div>
    <p className="ga-reason">{d.evidence[d.ai?.evidence[0]??0]}</p>
    <details><summary>Why this recommendation?</summary><ul>{(d.ai?.evidence??d.evidence.map((_,i)=>i)).map(i=><li key={i}>{d.evidence[i]}</li>)}</ul>
      {d.ai&&<p className="ge-footnote">GPT-5.6 Luna selected these reasons from verified inputs. It did not calculate or invent the point estimates.</p>}
      <h4>Before you decide</h4><ul>{d.cautions.map((c,i)=><li key={i}>{c}</li>)}</ul>
      <p className="ge-footnote">ESPN league data and completed game history. Updated {data?.sourceAt?new Date(data.sourceAt).toLocaleString():'time unavailable'}.</p>
    </details>
    <div className="ga-actions">{!d.status?<><button className="ge-button" disabled={!!busy||data?.stale} onClick={()=>decide(d,'approved')}><Check size={18}/>{d.kind==='ir'?'Approve review plan':'Approve plan'}</button><button className="ge-button secondary" disabled={!!busy||data?.stale} onClick={()=>decide(d,'declined')}>Decline</button></>:d.status==='approved'?<><a className="ge-button" href={d.link} target="_blank" rel="noreferrer">Review in ESPN<ArrowUpRight size={18}/></a><button className="ge-button secondary" disabled={!!busy||data?.stale} onClick={()=>decide(d,'completed')}>Mark done</button><button className="ge-link" disabled={!!busy||data?.stale} onClick={()=>decide(d,'declined')}>Cancel plan</button></>:null}</div>
    {d.status==='approved'&&<p className="ge-footnote">Saved for you. ESPN has not been changed. “Mark done” records your confirmation.</p>}
  </article>;
  return <section className="ga-queue" aria-labelledby="decision-title"><div className="ga-heading"><div><span className="ge-eyebrow"><Lightning size={17}/>YOUR NEXT MOVES</span><h2 id="decision-title">A clearer call. One decision at a time.</h2><p>Review the reason. Approve a plan. Make the final move in ESPN.</p></div><button className="ge-button secondary" onClick={onSettings}>AI settings</button></div>
    {error&&<div role="alert" className="gl-warning">{error} <button className="ge-link" disabled={!!busy} onClick={()=>void act()}>Retry decisions</button></div>}
    {!data&&!error&&<p role="status">Loading your decision desk…</p>}
    {data&&<><div className="ga-status" role="status"><span><i/>{busy==='review'?'AI is reviewing the shortlist…':data.reviewedAt?'AI review saved · '+new Date(data.reviewedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}):data.enabled?'Statistical suggestions ready; AI review pending.':'Statistical suggestions ready. Enable AI to prioritize them.'}</span><span>{pending.length} to review · {approved.length} approved</span></div>
      {data.stale&&<p className="gl-warning">Refresh league data or resume monitoring before approving. Recommendations require data less than 30 minutes old.</p>}
      {data.error&&<p className="gl-warning">{data.error}</p>}
      <div className="ga-grid">{pending.map(card)}</div>
      {!pending.length&&<div className="ge-card ga-empty"><ShieldCheck size={28}/><h3>You’re caught up.</h3><p>{data.decisions.length?'Your choices are saved. Material changes bring a decision back for review.':'No supported upgrade is available from the current evidence. There is no need to force a move.'}</p></div>}
      <p className="ge-footnote">Trade ideas appear only when enough healthy-player history and upcoming schedules support an improvement for both teams. Missing evidence can prevent a recommendation.</p>
      {approved.length>0&&<><h3 className="ga-section-title">Your approved plans</h3><div className="ga-grid">{approved.map(card)}</div></>}
      {history.length>0&&<><button className="ge-link ga-history" onClick={()=>setShowHistory(v=>!v)} aria-expanded={showHistory}>{showHistory?'Hide':'Show'} saved decisions ({history.length})</button>{showHistory&&<div className="ga-grid">{history.map(card)}</div>}</>}
    </>}
  </section>;
}
export function AdvisorSettings({advisor}:{advisor:Advisor}){
  const {data,busy,error,act}=advisor,[key,setKey]=useState(''),[risk,setRisk]=useState<Risk>('balanced'),[enabled,setEnabled]=useState(false),[saved,setSaved]=useState(false);
  useEffect(()=>{if(data){setRisk(data.risk);setEnabled(data.enabled);}},[data?.risk,data?.enabled]);
  return <section className="ge-card ge-settings-card ga-settings"><Lightning size={28}/><h2>Your AI decision partner</h2><p>GPT-5.6 Luna reviews a compact shortlist. Lineup math, eligibility and saved decisions stay in the app.</p>
    <dl className="ge-system"><div><dt>API key</dt><dd>{data?.configured?'Saved and encrypted':'Not connected'}</dd></div><div><dt>Reviews today</dt><dd>{data?.callsToday??0} / 4 maximum</dd></div><div><dt>Reported tokens today</dt><dd>{(data?.tokensToday??0).toLocaleString()}</dd></div><div><dt>Next review eligible</dt><dd>{data?.nextReviewAt&&data.nextReviewAt>Date.now()?new Date(data.nextReviewAt).toLocaleString():'When facts change'}</dd></div></dl>
    <form onSubmit={async e=>{e.preventDefault();setSaved(false);await act({action:'configure',key:key||undefined,risk,enabled});setKey('');setSaved(true);}}>
      <label htmlFor="ga-key">{data?.configured?'Replace OpenAI API key (optional)':'OpenAI API key'}</label><input id="ga-key" type="password" value={key} onChange={e=>setKey(e.target.value)} autoComplete="off" spellCheck={false} placeholder="sk-…" maxLength={503}/>
      <p className="ge-footnote"><a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">Create an OpenAI API key ↗</a>. API billing is separate from ChatGPT. Enter the key here once; it is encrypted on the server and never saved in browser storage.</p>
      <label htmlFor="ga-risk">Decision preference</label><select id="ga-risk" value={risk} onChange={e=>setRisk(e.target.value as Risk)}><option value="careful">Careful: require a larger improvement</option><option value="balanced">Balanced: value and flexibility</option><option value="upside">Upside: consider smaller potential gains</option></select>
      <label className="ga-toggle"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>Automatically review material changes</label>
      <p className="ge-footnote">Sends only candidate facts to OpenAI, with response storage disabled. No ESPN cookies or private notes are sent. At most four calls per UTC day, at least two hours apart, and 20,000 reserved tokens per call. Failed attempts count toward the cap. Your approvals and declines are remembered.</p>
      <button className="ge-button ge-full" disabled={!!busy}>{busy==='configure'?'Saving securely…':'Save AI settings'}</button>
      {saved&&!error&&<p role="status">Settings saved. Your key has been cleared from this form.</p>}
    </form>
    {error&&<p role="alert" className="gl-warning">{error}</p>}{data?.error&&<p className="gl-warning">{data.error}</p>}
    <div className="ga-actions"><button className="ge-button secondary" disabled={!!busy||!data?.needsReview} onClick={()=>void act({action:'review'})}>{busy==='review'?'Reviewing…':'Review changed decisions'}</button>{data?.configured&&<button className="ge-link" disabled={!!busy} onClick={()=>void act({action:'configure',removeKey:true,enabled:false,risk})}>Remove AI key</button>}</div>
  </section>;
}
