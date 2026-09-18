import {expect,test} from 'bun:test';
import {normalizeLeague} from '../src/lib/espn-normalize';
import {input,leagueFixture,now} from './fixtures/live';
import {matchupReport} from '../src/lib/matchup';
const fixture=()=>{const f=leagueFixture();return normalizeLeague(f.core,f.cards,f.free,f.schedule,input,now);};
test('matchup separates actual scores and forecasts and compares both available benches',()=>{
 const s=fixture(),r=matchupReport(s,now)!;expect(r).not.toBeNull();expect(r.opponent.id).not.toBe(s.teamId);expect(r.rows).toHaveLength(s.slots.length);expect(r.gain).toBeGreaterThanOrEqual(0);expect(r.theirGain).toBeGreaterThanOrEqual(0);
 const before=r.gap;for(const m of s.matchups){m.homeScore=999;m.awayScore=777;}const next=matchupReport(s,now)!;expect(next.gap).toBe(before);expect([999,777]).toContain(next.score!);
});
test('unknown estimates prevent claimed edge; missing opponent returns a safe empty state',()=>{
 const s=fixture(),r=matchupReport(s,now)!;const p=r.ours.find(Boolean)!;p.projected=null;p.history=[];p.bye=false;p.status='ACTIVE';expect(matchupReport(s,now)!.gap).toBeNull();expect(matchupReport(s,now)!.gain).toBeNull();s.matchups=[];expect(matchupReport(s,now)).toBeNull();
});
test('locked starters remain in the plan and flags identify bye and injury exposure',()=>{
 const s=fixture(),r=matchupReport(s,now)!;const p=r.ours.find(Boolean)!;p.locked=true;p.status='OUT';const next=matchupReport(s,now)!;expect(next.ownFlags.map(p=>p.id)).toContain(p.id);expect(next.changes.some(c=>c.outgoing?.id===p.id)).toBe(false);
});
