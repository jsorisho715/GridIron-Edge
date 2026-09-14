// Public ESPN only. This collector runs on the existing GitHub backup runner,
// where ESPN can be reached when its public host refuses Worker requests.
export async function collectPublicContext(snapshot, transport = fetch, now = Date.now()) {
  const intel = snapshot?.intel, nfl = intel?.nfl;
  if (!intel || !nfl) return null;
  const due = feed => !feed?.checkedAt || now - feed.checkedAt >= 30 * 60000;
  const paths = [];
  if (due(intel.headlines)) paths.push(['news', 'news?limit=100']);
  if (due(nfl.injuryFeed)) paths.push(['injuries', 'injuries']);
  if (due(nfl.marketFeed) && /^\d{8}-\d{8}$/.test(nfl.gameWindow)) paths.push(['games', 'scoreboard?limit=100&dates=' + nfl.gameWindow]);
  if (!paths.length) return null;
  const result = { expectedSnapshot: snapshot.acquiredAt, gameWindow: nfl.gameWindow, collectedAt: now, sources: {} };
  await Promise.all(paths.map(async ([key,path]) => {
    const response = await transport('https://site.api.espn.com/apis/site/v2/sports/football/nfl/' + path, { headers: { Accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(30000) });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) { await response.body?.cancel(); throw new Error(`Public ${key} feed returned HTTP ${response.status}.`); }
    const reader = response.body.getReader(), chunks = []; let size = 0;
    try { while (true) { const {done,value} = await reader.read(); if (done) break; size += value.byteLength; if (size > 12 * 1024 * 1024) { await reader.cancel(); throw new Error('Public feed exceeded its size limit.'); } chunks.push(value); } }
    finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
    const raw = JSON.parse(new TextDecoder().decode(bytes)), text = v => typeof v === 'string' ? v.slice(0,300) : '', rows = v => Array.isArray(v) ? v : [];
    // Strip duplicated logos, links, biographies and all article bodies before upload.
    if (key === 'news') {
      if (!Array.isArray(raw.articles)) throw new Error('Public news schema changed.');
      result.sources.news = { articles: raw.articles.slice(0,100).map(a => ({ id:a.id, headline:text(a.headline), published:a.published, links:{web:{href:text(a.links?.web?.href)}}, categories:rows(a.categories).slice(0,64).map(c=>({type:c.type,athleteId:c.athleteId??c.athlete?.id,teamId:c.teamId??c.team?.id})) })) };
    } else if (key === 'injuries') {
      if (!Array.isArray(raw.injuries)) throw new Error('Public injury schema changed.');
      result.sources.injuries = { injuries: raw.injuries.slice(0,40).map(t=>({id:t.id,injuries:rows(t.injuries).slice(0,100).map(i=>({status:text(i.status),date:i.date,athlete:{id:i.athlete?.id??rows(i.athlete?.links).find(l=>rows(l.rel).includes('playercard'))?.href?.match(/\/id\/(\d+)/)?.[1],displayName:text(i.athlete?.displayName),position:{abbreviation:text(i.athlete?.position?.abbreviation)}}}))})) };
    } else {
      if (!Array.isArray(raw.events)) throw new Error('Public game schema changed.');
      result.sources.games = { events: raw.events.slice(0,100).map(e=>({id:e.id,date:e.date,competitions:rows(e.competitions).slice(0,1).map(c=>({competitors:rows(c.competitors).slice(0,2).map(t=>({id:t.id,homeAway:t.homeAway,team:{abbreviation:text(t.team?.abbreviation)}})),status:{type:{state:c.status?.type?.state??e.status?.type?.state}},odds:rows(c.odds).slice(0,1).map(o=>({overUnder:o.overUnder,details:text(o.details),provider:{name:text(o.provider?.displayName??o.provider?.name)}}))}))})) };
    }
  }));
  if (new TextEncoder().encode(JSON.stringify(result)).length > 500000) throw new Error('Normalized public context exceeded the upload limit.');
  return result;
}
export async function refreshPublicContext(data, call, transport = fetch) {
  if (data.preferences?.paused) return data;
  const bundle = await collectPublicContext(data.snapshot, transport);
  if (!bundle) return data;
  const result = await (await call('/api/gridiron/context', bundle)).json();
  if (!result.updated) throw new Error('Public context could not be saved against the current league snapshot.');
  return (await (await call('/api/gridiron/workspace')).json());
}
