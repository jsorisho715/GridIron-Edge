import {expect,test} from 'bun:test';
import {normalizeLeague} from '../src/lib/espn-normalize';
import {backtest,bestLineup,forecast,starters,waiverOptions} from '../src/lib/football';
import {input,now,leagueFixture} from './fixtures/live';
function snapshot(){const f=leagueFixture();return normalizeLeague(f.core,f.cards,f.free,f.schedule,input,now);}
test('imports real schema: custom scoring, roster slots, matchups, history and free-agent state',()=>{
  const s=snapshot();expect(s.slots).toHaveLength(9);expect(s.rosterLimit).toBe(13);expect(s.faab).toBe(93);expect(s.scoring).toContain('PPR');expect(s.players.filter(p=>p.teamId===25)).toHaveLength(13);expect(s.matchups[1]).toMatchObject({week:2,homeId:25,awayId:2,homeScore:28.7});
  const p=s.players[0];expect(p.history).toHaveLength(9);expect(p.history.some(g=>g.points===999)).toBe(false);expect(p.projected).toBe(12);expect(p.locked).toBe(false);expect(p.scheduleKnown).toBe(true);
  expect(s.players.filter(p=>p.teamId===null)).toHaveLength(30);expect(s.players.find(p=>p.teamId===null)?.availability).toBe('WAIVERS');
});
test('unknown kickoff, TBD times and started games hold the correct players',()=>{const f=leagueFixture();const unknown=normalizeLeague(f.core,f.cards,f.free,null,input,now);expect(unknown.players.every(p=>p.locked)).toBe(true);expect(bestLineup(unknown,undefined,now).picks.map(p=>p?.id)).toEqual(starters(unknown).map(p=>p?.id));
  f.schedule.settings.proTeams[0].proGamesByScoringPeriod[2][0].startTimeTBD=true;
  const s=normalizeLeague(f.core,f.cards,f.free,f.schedule,input,now);expect(s.players.filter(p=>p.proTeamId===1).every(p=>p.locked&&!p.scheduleKnown)).toBe(true);
});
test('assignment preserves kickoff locks, never duplicates players and respects flexible slots',()=>{const s=snapshot(),held=s.players.find(p=>p.teamId===25&&p.slot==='2:1')!;held.locked=true;held.status='OUT';const best=bestLineup(s,undefined,now);expect(best.picks[2]?.id).toBe(held.id);const chosen=best.picks.filter(p=>!!p);expect(new Set(chosen.map(p=>p!.id)).size).toBe(chosen.length);best.picks.forEach((p,i)=>{if(p)expect(p.eligible).toContain(s.slots[i].espnId);});expect(best.points).toBeGreaterThan(0);});
test('bye players are excluded and missing estimates stay missing',()=>{const s=snapshot(),p=s.players[0];p.bye=true;expect(forecast(p).points).toBe(0);expect(bestLineup(s,undefined,now).picks.some(x=>x?.id===p.id)).toBe(false);p.bye=false;p.projected=null;p.history=[];expect(forecast(p).points).toBeNull();});
test('waiver review models a drop and never recommends another league team’s player',()=>{const s=snapshot();const wire=waiverOptions(s,now);expect(wire.length).toBeGreaterThan(0);for(const w of wire){expect(w.player.teamId).toBeNull();expect(w.drop?.teamId).toBe(25);expect(w.drop?.locked).toBe(false);}expect(wire.map(w=>w.gain)).toEqual(wire.map(w=>w.gain).sort((a,b)=>(b??0)-(a??0)));});
test('walk-forward baseline only uses prior observations, not future or current outcomes',()=>{const s=snapshot(),p=s.players[0];p.history=[1,2,3,4].map((points,i)=>({season:2025,week:i+1,points,projected:null}));const r=backtest([p]);expect(r.games).toBe(1);expect(r.mae).toBeCloseTo(4-14/6);expect(r.meanMae).toBeCloseTo(2);p.projected=100000;expect(backtest([p])).toEqual(r);});

test('time passing locks a cached starter and bench without needing a new ESPN sync',()=>{
  const s=snapshot(),cutoff=Math.max(...s.players.map(p=>Date.parse(p.kickoff??'' )||0))+1;
  expect(bestLineup(s,undefined,cutoff).picks.map(p=>p?.id)).toEqual(starters(s).map(p=>p?.id));
  expect(waiverOptions(s,cutoff)).toHaveLength(0);
});
test('waiver gain is unknown when a locked starter lacks a projection and history',()=>{
  const s=snapshot(),p=s.players[0];p.projected=null;p.history=[];p.locked=true;
  expect(waiverOptions(s,now).every(w=>w.gain===null)).toBe(true);
});
