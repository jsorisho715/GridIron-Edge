import type { D1PreparedStatement } from '@cloudflare/workers-types';
import { forecast, type Snapshot } from './football';
import type { ConnectionEnv } from './espn-security.server';
import { usageEvidence } from './player-usage';
export type MemoryEvent = { kind: string; summary: string; observedAt: number };
export type ForecastMemory = { player_id: string; season: number; week: number; forecast_at: number; kickoff: number; espn: number | null; baseline: number | null; estimate: number; actual: number | null };
export type PlayerMemoryData = { events: MemoryEvent[]; forecasts: ForecastMemory[] };
const scopeOf = (s: Snapshot) => [s.leagueId, s.teamId, s.season].join(':');

export async function rememberPlayers(env: ConnectionEnv, s: Snapshot, previous: Snapshot | null, revision: string, now: number) {
  const scope = scopeOf(s), db = env.DB!, statements: D1PreparedStatement[] = [];
  const events: {id:string;playerId:string;kind:string;summary:string}[] = [], predictions: Record<string,unknown>[] = [], results: Record<string,unknown>[] = [];
  const add = (id: string, playerId: string, kind: string, summary: string) => events.push({id:scope+':'+id,playerId,kind,summary:summary.slice(0,420)});
  const old = new Map((previous?.players ?? []).map(p => [p.id, p]));
  for (const p of s.players) {
    const before = old.get(p.id);
    if (!before) add('baseline:' + p.id + ':' + now, p.id, 'baseline', `Tracking started. ESPN availability: ${p.status}.`);
    else {
      if (before.status !== p.status) add('status:' + p.id + ':' + now, p.id, 'injury', `ESPN fantasy availability changed from ${before.status} to ${p.status}.`);
      if (before.teamId !== p.teamId || (previous?.week === s.week && before.slotId !== p.slotId)) add('roster:' + p.id + ':' + now, p.id, 'roster', `Roster observed: ${before.teamId === null ? 'available player' : 'team #' + before.teamId + ', ' + (before.slot ?? 'unassigned')} → ${p.teamId === null ? 'available player' : 'team #' + p.teamId + ', ' + (p.slot ?? 'unassigned')}. See league activity for confirmed transaction details.`);
      const usage = usageEvidence(p);
      if (usage && usage !== usageEvidence(before)) add('usage:' + p.id + ':' + now, p.id, 'usage', usage);
    }
  }
  const priorInjuries = new Map(previous?.intel?.nfl?.injuries.map(i => [i.playerId, i]) ?? []);
  const injuries = s.intel?.nfl?.injuries ?? [];
  if (s.intel?.nfl?.injuryFeed.checkedAt === now) {
    for (const i of injuries) {
      const prior = priorInjuries.get(i.playerId);
      if (!prior || prior.status !== i.status || prior.teamId !== i.teamId) add('nfl:' + i.playerId + ':' + now, i.playerId, 'injury', `NFL injury report: ${prior ? prior.status + ' → ' : ''}${i.status} (${i.position || 'position unknown'}). Report date: ${i.reportedAt ? new Date(i.reportedAt).toISOString().slice(0, 10) : 'not provided'}. This is a reported status, not a verified return date.`);
    }
    for (const i of priorInjuries.values()) if (!injuries.some(p => p.playerId === i.playerId)) add('unlisted:' + i.playerId + ':' + now, i.playerId, 'injury', 'No longer present in the refreshed NFL injury feed. This alone does not confirm that the player is healthy or cleared to play.');
  }
  // News deduplicates by provider article ID. Keep just its headline, not article text.
  const tracked = new Set(s.players.map(p => p.id));
  const previousArticles = new Set(previous?.intel?.news.map(a => a.id) ?? []);
  for (const article of (s.intel?.news ?? []).filter(a=>!previousArticles.has(a.id))) for (const id of article.athleteIds.filter(id => tracked.has(id))) add('news:' + article.id + ':' + id, id, 'news', `ESPN headline (${new Date(article.published).toISOString().slice(0, 10)}): ${article.headline}`);

  // Latest prediction made BEFORE kickoff. Never backfill a prediction after a game.
  const open = (await db.prepare('SELECT * FROM ge_forecast_memory WHERE scope=? AND (actual IS NULL OR settled_at>?) LIMIT 5000').bind(scope,now-30*86400000).all<ForecastMemory>()).results;
  const current = new Map(open.filter(r => r.season === s.season && r.week === s.week).map(r => [r.player_id, r]));
  for (const p of s.players) {
    const f = forecast(p), kickoff = p.kickoff ? Date.parse(p.kickoff) : NaN, prior = current.get(p.id);
    if (!Number.isFinite(kickoff) || kickoff <= now || f.points === null || !p.scheduleKnown) continue;
    const rounded = (v: number | null) => v === null ? null : Math.round(v * 10) / 10;
    if (prior && prior.kickoff === kickoff && rounded(prior.estimate) === rounded(f.points) && rounded(prior.espn) === rounded(p.projected) && rounded(prior.baseline) === rounded(f.baseline)) continue;
    predictions.push({playerId:p.id,season:s.season,week:s.week,kickoff,espn:p.projected,baseline:f.baseline,estimate:f.points});
  }
  for (const record of open) {
    const actual = s.players.find(p => p.id === record.player_id)?.history.find(g => g.season === record.season && g.week === record.week);
    if (actual && actual.points !== record.actual && record.kickoff < now && record.forecast_at < record.kickoff) results.push({...record,actual:actual.points});
  }
  // SQLite JSON batches use one query per 100 changes, not one per NFL player.
  // This keeps the first full-league import within Worker/D1 query limits.
  for(let i=0;i<events.length;i+=100)statements.push(db.prepare("INSERT OR IGNORE INTO ge_player_memory(id,scope,player_id,kind,summary,observed_at) SELECT json_extract(value,'$.id'),?,json_extract(value,'$.playerId'),json_extract(value,'$.kind'),json_extract(value,'$.summary'),? FROM json_each(?) WHERE EXISTS(SELECT 1 FROM ge_espn_connection WHERE id=1 AND revision=?)").bind(scope,now,JSON.stringify(events.slice(i,i+100)),revision));
  for(let i=0;i<predictions.length;i+=100)statements.push(db.prepare("INSERT INTO ge_forecast_memory(scope,player_id,season,week,forecast_at,kickoff,espn,baseline,estimate) SELECT ?,json_extract(value,'$.playerId'),json_extract(value,'$.season'),json_extract(value,'$.week'),?,json_extract(value,'$.kickoff'),json_extract(value,'$.espn'),json_extract(value,'$.baseline'),json_extract(value,'$.estimate') FROM json_each(?) WHERE EXISTS(SELECT 1 FROM ge_espn_connection WHERE id=1 AND revision=?) ON CONFLICT(scope,player_id,season,week) DO UPDATE SET forecast_at=excluded.forecast_at,kickoff=excluded.kickoff,espn=excluded.espn,baseline=excluded.baseline,estimate=excluded.estimate WHERE ge_forecast_memory.actual IS NULL AND ge_forecast_memory.kickoff>?").bind(scope,now,JSON.stringify(predictions.slice(i,i+100)),revision,now));
  for(let i=0;i<results.length;i+=100)statements.push(db.prepare("INSERT INTO ge_forecast_memory(scope,player_id,season,week,forecast_at,kickoff,espn,baseline,estimate,actual,settled_at) SELECT ?,json_extract(value,'$.player_id'),json_extract(value,'$.season'),json_extract(value,'$.week'),json_extract(value,'$.forecast_at'),json_extract(value,'$.kickoff'),json_extract(value,'$.espn'),json_extract(value,'$.baseline'),json_extract(value,'$.estimate'),json_extract(value,'$.actual'),? FROM json_each(?) WHERE EXISTS(SELECT 1 FROM ge_espn_connection WHERE id=1 AND revision=?) ON CONFLICT(scope,player_id,season,week) DO UPDATE SET actual=excluded.actual,settled_at=excluded.settled_at").bind(scope,now,JSON.stringify(results.slice(i,i+100)),revision));
  for (let i = 0; i < statements.length; i += 50) await db.batch(statements.slice(i, i + 50));
  await db.prepare('DELETE FROM ge_player_memory WHERE observed_at<?').bind(now - 180 * 86400000).run();
  await db.prepare('DELETE FROM ge_player_memory WHERE scope=? AND id NOT IN (SELECT id FROM ge_player_memory WHERE scope=? ORDER BY observed_at DESC LIMIT 10000)').bind(scope, scope).run();
  await db.prepare('DELETE FROM ge_forecast_memory WHERE forecast_at<?').bind(now - 730 * 86400000).run();
  // Two short recent changes per player, never article dumps or timestamps that
  // change on refresh. The model sees these only for an actual decision candidate.
  const memory = (await db.prepare("SELECT player_id,summary,observed_at FROM ge_player_memory WHERE scope=? AND kind IN ('injury','usage','roster') ORDER BY observed_at DESC,id LIMIT 320").bind(scope).all<{ player_id: string; summary: string; observed_at: number }>()).results;
  const compact: Record<string, string[]> = {};
  for (const m of memory) if (tracked.has(m.player_id) && (compact[m.player_id]?.length ?? 0) < 2) (compact[m.player_id] ??= []).push(new Date(m.observed_at).toISOString().slice(0, 10) + ': ' + m.summary.slice(0, 240));
  return compact;
}
export async function readPlayerMemory(env: ConnectionEnv, s: Snapshot, playerId: string): Promise<PlayerMemoryData> {
  const scope = scopeOf(s);
  const [events, forecasts] = await Promise.all([
    env.DB!.prepare('SELECT kind,summary,observed_at AS observedAt FROM ge_player_memory WHERE scope=? AND player_id=? ORDER BY observed_at DESC,id LIMIT 24').bind(scope, playerId).all<MemoryEvent>(),
    env.DB!.prepare('SELECT player_id,season,week,forecast_at,kickoff,espn,baseline,estimate,actual FROM ge_forecast_memory WHERE scope=? AND player_id=? ORDER BY season DESC,week DESC LIMIT 18').bind(scope, playerId).all<ForecastMemory>(),
  ]);
  return { events: events.results, forecasts: forecasts.results };
}
