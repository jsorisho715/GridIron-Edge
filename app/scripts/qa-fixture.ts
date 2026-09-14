import {input,now,leagueFixture} from '../tests/fixtures/live';
import {normalizeLeague} from '../src/lib/espn-normalize';
import {EMPTY_PREFS,type WorkspaceData} from '../src/lib/football';
const f=leagueFixture(),snapshot=normalizeLeague(f.core,f.cards,f.free,f.schedule,input,now);
// Keep synthetic kickoffs in the future so browser QA is repeatable year-round.
for(const p of snapshot.players)if(p.kickoff)p.kickoff=new Date(Date.now()+86400000).toISOString();
snapshot.acquiredAt=new Date().toISOString();
const state:WorkspaceData={snapshot,preferences:{...EMPTY_PREFS},connected:true,needsSync:false,alerts:[{id:'qa-alert',title:'Availability changed',detail:'Check a flagged starter before kickoff.',playerId:null,kind:'injury',createdAt:Date.now()}],health:{lastSuccess:Date.now(),lastAttempt:Date.now(),nextAttempt:Date.now()+120000,error:null,running:false,heartbeat:Date.now()}};
console.log(JSON.stringify(state));
