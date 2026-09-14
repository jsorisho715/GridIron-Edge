export type Player={id:string;name:string;pos:string;team:string;history:number[];slot:string;status:string;note:string;rostered:boolean;locked:boolean;bye:boolean};
export const SLOTS=['QB','RB1','RB2','WR1','WR2','TE','FLEX','DST','K'];
export const label=(s:string)=>s.replace(/[12]$/,'');
export const mean=(a:number[])=>a.length?a.reduce((s,n)=>s+n,0)/a.length:0;
export const estimate=(p:Player)=>p.bye||p.status==='OUT'?0:p.history.reduce((s,n,i)=>s+n*(i+1),0)/(p.history.length*(p.history.length+1)/2||1);
export function quantile(a:number[],q:number){const b=[...a].sort((a,b)=>a-b);if(!b.length)return 0;const i=(b.length-1)*q;return b[Math.floor(i)]+(b[Math.ceil(i)]-b[Math.floor(i)])*(i%1);}
export const eligible=(p:Player,s:string)=>label(s)===p.pos||(s==='FLEX'&&['RB','WR','TE'].includes(p.pos));
export function optimize(players:Player[]){const roster=players.filter(p=>p.rostered),fixed=new Map(roster.filter(p=>p.locked&&SLOTS.includes(p.slot)).map(p=>[p.slot,p]));const candidates=roster.filter(p=>!p.locked&&!p.bye&&p.status!=='OUT');const memo=new Map<string,{score:number;picks:(Player|undefined)[]}>();
function solve(i:number,mask:number):{score:number;picks:(Player|undefined)[]}{if(i===SLOTS.length)return {score:0,picks:[]};const k=i+':'+mask;if(memo.has(k))return memo.get(k)!;const f=fixed.get(SLOTS[i]);if(f){const r=solve(i+1,mask);return {score:estimate(f)+r.score,picks:[f,...r.picks]};}const r=solve(i+1,mask);let best={score:r.score,picks:[undefined,...r.picks] as (Player|undefined)[]};candidates.forEach((p,j)=>{if((mask&(1<<j))||!eligible(p,SLOTS[i]))return;const next=solve(i+1,mask|(1<<j)),score=estimate(p)+next.score;if(score>best.score)best={score,picks:[p,...next.picks]};});memo.set(k,best);return best;}if(candidates.length>24)throw new Error('Roster safety limit');return solve(0,0);}
export const current=(p:Player[])=>SLOTS.map(s=>p.find(p=>p.rostered&&p.slot===s));
export const total=(p:(Player|undefined)[])=>p.reduce((s,p)=>s+(p?estimate(p):0),0);
export function simulate(ps:Player[],runs=2000){const opponent=samplePlayers().filter(p=>SLOTS.includes(p.slot));let seed=73,wins=0;const aa:number[]=[],bb:number[]=[];const rnd=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};for(let i=0;i<runs;i++){const a=ps.reduce((s,p)=>s+(p.status==='OUT'||p.bye?0:p.history[Math.floor(rnd()*p.history.length)]??0),0),b=opponent.reduce((s,p)=>s+(p.history[Math.floor(rnd()*p.history.length)]??0)*.94,0);aa.push(a);bb.push(b);wins+=a>b?1:a===b?.5:0;}return {win:wins/runs,a:mean(aa),b:mean(bb),runs};}
export function waivers(ps:Player[]){const base=optimize(ps).score;return ps.filter(p=>!p.rostered).map(p=>({player:p,gain:optimize(ps.map(x=>x.id===p.id?{...x,rostered:true,slot:'BENCH'}:x)).score-base})).sort((a,b)=>b.gain-a.gain||estimate(b.player)-estimate(a.player));}
export function samplePlayers():Player[]{const rows:[string,string,string,number[],string,string,string][]=[
['Miles Carter','QB','DEN',[19.2,23.1,16.8,26.4,22.3,24.1],'QB','ACTIVE','Consistent passing output in the fictional game log.'],
['Jordan Brooks','RB','ATL',[14.8,18.2,13.6,20.1,16.4,21.8],'RB1','ACTIVE','Recent sample production has strengthened.'],
['Evan Cole','RB','SEA',[8.2,14.1,9.5,12.8,7.4,10.6],'RB2','QUESTIONABLE','Fictional report: limited practice with an ankle issue. Check final availability before kickoff.'],
['Noah Hayes','WR','DET',[15.2,12.4,21.8,16.6,19.3,18.2],'WR1','ACTIVE','Steady involvement across the sample history.'],
['Dylan Reed','WR','BUF',[11.8,18.4,9.2,15.7,17.8,14.6],'WR2','ACTIVE','Compare the spread of past results, as well as the average.'],
['Caleb Grant','TE','BAL',[8.1,11.6,7.4,14.2,10.8,13.5],'TE','ACTIVE','A stable sample starting option.'],
['Owen Price','WR','LAC',[6.2,9.4,5.1,11.2,7.6,6.8],'FLEX','ACTIVE','Lower recent output than your strongest bench alternative.'],
['Summit Defense','DST','SUM',[8,5,12,7,10,6],'DST','ACTIVE','Fictional defense for demonstration only.'],
['Liam Stone','K','PHI',[7,11,8,6,12,9],'K','ACTIVE','Kicker output is especially variable.'],
['Marcus Lane','RB','HOU',[9.8,13.6,16.2,11.4,18.7,17.1],'BENCH','ACTIVE','Recent sample results make him a flex candidate.'],
['Theo James','WR','MIN',[6.8,18.4,4.2,21.7,10.8,17.6],'BENCH','ACTIVE','A wider range: upside and downside both matter.'],
['Isaac West','QB','ARI',[14.8,22.7,18.1,25.2,17.4,19.8],'BENCH','ACTIVE','A second quarterback for comparison.'],
['Lucas Ford','TE','JAX',[4.2,8.1,6.8,9.4,7.2,5.6],'BENCH','OUT','Fictional report: ruled out. Excluded from unlocked lineup suggestions.'],
['Adrian Bell','RB','CHI',[10.1,12.6,15.4,17.2,18.8,20.6],'FREE','ACTIVE','Free agent sample: stronger results than your second running back.'],
['Mason Blake','WR','GB',[9.8,13.4,11.2,18.6,16.4,19.2],'FREE','ACTIVE','Free agent sample with improving recent output.'],
['Felix Hart','TE','NYJ',[5.1,8.2,12.6,10.8,14.2,12.4],'FREE','ACTIVE','Compare against your starter before spending a waiver claim.']];return rows.map(([name,pos,team,history,slot,status,note],i)=>({id:'demo-'+i,name,pos,team,history,slot,status,note,rostered:slot!=='FREE',locked:false,bye:false}));}
