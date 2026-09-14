export const input={leagueId:10309566,teamId:25,season:2026,swid:'{12345678-1234-1234-1234-123456789abc}',espnS2:'synthetic-cookie-for-tests-only'};
export const now=Date.UTC(2026,8,14,12);
const slotIds=[0,2,2,4,4,6,23,16,17,20,20,20,20];
const positions=[1,2,2,3,3,4,2,16,5,2,3,1,4];
const firstNames=['Alex','Jordan','Chris','Sam','Taylor','Jamie','Casey','City','Morgan','Drew','Riley','Cameron','Robin'];
export function leagueFixture(){
  const player=(team:number,i:number,free=false)=>{const position=positions[i%13],slot=slotIds[i%13],main=position===1?0:position===2?2:position===3?4:position===4?6:position===16?16:17;
    const stats=Array.from({length:8},(_,k)=>({seasonId:2025,scoringPeriodId:k+10,statSourceId:0,statSplitTypeId:1,appliedTotal:6+i+(k%3)*2,stats:{3:80+k}}));
    return {id:team*100+i,fullName:firstNames[i%13]+' '+(free?'Available':'Player')+' '+team,defaultPositionId:position,proTeamId:(i%4)+1,eligibleSlots:[main,20,...([2,3,4].includes(position)?[23]:[])],injuryStatus:i===2?'QUESTIONABLE':'ACTIVE',ownership:{percentOwned:free?20:90},stats:[...stats,{seasonId:2026,scoringPeriodId:2,statSourceId:1,statSplitTypeId:1,appliedTotal:i===9?27:12+i,stats:{3:100}},{seasonId:2026,scoringPeriodId:1,statSourceId:0,statSplitTypeId:1,appliedTotal:10+i,stats:{3:100}},{seasonId:2026,scoringPeriodId:3,statSourceId:0,statSplitTypeId:1,appliedTotal:999,stats:{3:999}}]};
  };
  const teams=[25,1,2,3,4,5,6,7,8,9,10,11].map((id,i)=>({id,name:id===25?'The Sunday Strategists':'Opponent Team '+id,record:{overall:{wins:i%2,losses:1-i%2,ties:0,pointsFor:110+i,pointsAgainst:105+i}},transactionCounter:{acquisitionBudgetSpent:7},roster:{entries:slotIds.map((lineupSlotId,j)=>({lineupSlotId,playerPoolEntry:{onTeamId:id,status:'ONTEAM',player:player(id,j)}}))}}));
  const core={id:input.leagueId,seasonId:2026,scoringPeriodId:2,status:{currentScoringPeriod:2,currentMatchupPeriod:2},settings:{name:'Synthetic Sunday League',rosterSettings:{lineupSlotCounts:{0:1,2:2,4:2,6:1,23:1,16:1,17:1,20:4}},scoringSettings:{scoringItems:[{statId:53,points:1},{statId:3,points:.04}]},acquisitionSettings:{acquisitionBudget:100},scheduleSettings:{matchupPeriods:{1:[1],2:[2],3:[3]}}},teams,schedule:[{matchupPeriodId:1,home:{teamId:25,totalPoints:121.4},away:{teamId:1,totalPoints:115.8}},{matchupPeriodId:2,home:{teamId:25,totalPoints:28.7},away:{teamId:2,totalPoints:19.1}},{matchupPeriodId:3,home:{teamId:25,totalPoints:0},away:{teamId:3,totalPoints:0}}]};
  const free={players:Array.from({length:30},(_,i)=>({onTeamId:0,status:i%2?'FREEAGENT':'WAIVERS',player:player(100,i,true)}))};
  const cards={players:[...teams.flatMap(t=>t.roster.entries.map(e=>e.playerPoolEntry)),...free.players]};
  const schedule={settings:{proTeams:[1,2,3,4].map(id=>({id,byeWeek:9,proGamesByScoringPeriod:{2:[{date:now+86400000,homeProTeamId:id,awayProTeamId:10,validForLocking:true,startTimeTBD:false}]}}))}};
  return {core,cards,free,schedule};
}
