import {input,now,leagueFixture} from '../tests/fixtures/live';
import {normalizeLeague} from '../src/lib/espn-normalize';
import {EMPTY_PREFS,type WorkspaceData} from '../src/lib/football';
import {generateDecisions,ADVISOR_MODEL} from '../src/lib/decisions';
const f=leagueFixture(),snapshot=normalizeLeague(f.core,f.cards,f.free,f.schedule,input,now);
// Keep synthetic kickoffs in the future so browser QA is repeatable year-round.
for(const p of snapshot.players)if(p.kickoff)p.kickoff=new Date(Date.now()+86400000).toISOString();
snapshot.acquiredAt=new Date().toISOString();
const stamp=Date.now(),feed={checkedAt:stamp,attemptedAt:stamp,error:null};
snapshot.intel={trackingSince:stamp-86400000,transactions:feed,headlines:feed,activity:[
 {id:'qa-trade',kind:'trade',source:'espn',playerId:'203',playerName:'Sam Player 2',fromTeamId:3,toTeamId:2,at:stamp-60000,since:null,detail:'Completed trade reported by ESPN.'},
 {id:'qa-lineup',kind:'lineup',source:'observed',playerId:'209',playerName:'Drew Player 2',fromTeamId:2,toTeamId:2,at:stamp-120000,since:stamp-600000,detail:'Bench → RB. Noticed between refreshes.'}],
 news:[{id:'111',headline:'Synthetic receiver earns more first-team opportunities',url:'https://www.espn.com/nfl/story/_/id/111',published:stamp,athleteIds:['203'],teamIds:[4]},{id:'112',headline:'Synthetic team reviews its offensive line rotation',url:'https://www.espn.com/nfl/story/_/id/112',published:stamp-3600000,athleteIds:[],teamIds:[1]}],
 nfl:{injuryFeed:feed,marketFeed:feed,gameWindow:'qa',injuries:[{playerId:'9991',name:'Synthetic Corner',teamId:10,position:'CB',status:'OUT',reportedAt:stamp},{playerId:'9992',name:'Synthetic Safety',teamId:10,position:'S',status:'OUT',reportedAt:stamp}],games:[1,2,3,4].map(id=>({id:'game'+id,homeId:id,awayId:10,home:'NFL',away:'TEN',kickoff:stamp+86400000,state:'pre',total:45.5,spread:'TEN -3',provider:'Synthetic sportsbook'}))}};
const state:WorkspaceData={snapshot,preferences:{...EMPTY_PREFS},connected:true,needsSync:false,alerts:[{id:'qa-alert',title:'Availability changed',detail:'Check a flagged starter before kickoff.',playerId:null,kind:'injury',createdAt:Date.now()}],health:{lastSuccess:Date.now(),lastAttempt:Date.now(),nextAttempt:Date.now()+120000,error:null,running:false,heartbeat:Date.now()}};
console.log(JSON.stringify({...state,advisor:{decisions:await generateDecisions(snapshot),stale:false,sourceAt:snapshot.acquiredAt,model:ADVISOR_MODEL,configured:false,enabled:false,risk:'balanced',reviewedAt:null,callsToday:0,tokensToday:0,nextReviewAt:0,error:null,needsReview:false,fingerprint:'qa'}}));
