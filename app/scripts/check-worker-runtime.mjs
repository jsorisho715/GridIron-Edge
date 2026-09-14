import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// Uses the workerd version shipped with our pinned Wrangler. No production
// bindings or network calls: the upstream is a local, synthetic ESPN response.
export async function checkWorkerRuntime(wranglerPackage) {
  const require = createRequire(wranglerPackage);
  const { Miniflare, convertV4MiniflareOptions } = await import(pathToFileURL(require.resolve("miniflare")).href);
  const dir = mkdtempSync(join(tmpdir(), "gridiron-runtime-"));
  let runtime;
  try {
    const entry = join(dir, "check.ts"), bundle = join(dir, "check.js");
    writeFileSync(entry, `
      import { handleAdvisor } from ${JSON.stringify(resolve("src/lib/advisor.server.ts"))};
      import { verifyESPN } from ${JSON.stringify(resolve("src/lib/espn-provider.server.ts"))};
      import { handleConnection } from ${JSON.stringify(resolve("src/lib/espn-connection.server.ts"))};
      import { syncWorkspace, handleWorkspace } from ${JSON.stringify(resolve("src/lib/workspace.server.ts"))};
      import { encryptConnection } from ${JSON.stringify(resolve("src/lib/espn-security.server.ts"))};
      import { input, leagueFixture } from ${JSON.stringify(resolve("tests/fixtures/live.ts"))};
      export default { async fetch(request, env) {
        const path=new URL(request.url).pathname;
        if(path==='/migrate'){const sql=${JSON.stringify(['0002_secure_espn.sql','0003_live_workspace.sql','0005_player_memory.sql','0004_decision_advisor.sql'].map(file=>readFileSync(resolve('migrations',file),'utf8').replace(/^--.*$/gm,'')).join('\n'))};await env.DB.batch(sql.split(';').map(s=>s.trim()).filter(Boolean).map(s=>env.DB.prepare(s)));return Response.json({migrated:true});}
        if(path==='/fixture')return Response.json(leagueFixture());
        if(path==='/seed'){
          await env.DB.prepare('INSERT INTO ge_espn_connection VALUES(1,?,?,?)').bind(await encryptConnection(env.CREDENTIAL_ENCRYPTION_KEY,input),JSON.stringify({leagueId:input.leagueId,teamId:input.teamId,season:input.season}),'runtime-revision').run();
          return Response.json({seeded:true});
        }
        if(path==='/api/gridiron/connection')return handleConnection(request,env);
        if(path==='/api/gridiron/advisor')return handleAdvisor(request,env);
        if(path==='/api/gridiron/workspace')return handleWorkspace(request,env);
        if(path==='/scheduled')return Response.json(await syncWorkspace(env,fetch,true));
        try {
          return Response.json(await verifyESPN({ leagueId: 10309566, teamId: 25,
            season: 2026, swid: "{12345678-1234-1234-1234-123456789abc}",
            espnS2: "synthetic-runtime-cookie" }));
        } catch (error) {
          return Response.json({ code: error.code, error: error.message }, { status: error.status || 500 });
        }
      } };
    `);
    const buildEnv = { ...process.env };
    for (const name of ["OWNER_ACCESS_KEY", "CREDENTIAL_ENCRYPTION_KEY", "CLOUDFLARE_API_TOKEN"]) delete buildEnv[name];
    const build = spawnSync("bun", ["build", entry, "--target=browser", "--outfile", bundle], {
      env: buildEnv, encoding: "utf8", timeout: 30000,
    });
    assert.equal(build.status, 0, "Could not build the Worker runtime regression check.");
    let upstreamStatus = 200, calls = 0, live=false, fixture, pushCalls=0;
    runtime = new Miniflare(convertV4MiniflareOptions({
      cf: false, modules: true, compatibilityDate: "2026-09-14",
      script: readFileSync(bundle, "utf8"),
      d1Databases:{DB:'runtime-db'},
      bindings:{OWNER_ACCESS_KEY:'a'.repeat(64),CREDENTIAL_ENCRYPTION_KEY:'b'.repeat(64)},
      outboundService: async (request) => {
        calls++;
        if(live){
          const url=new URL(request.url),views=url.searchParams.getAll('view');
          if(url.hostname==='fcm.googleapis.com'){
            pushCalls++;assert.equal(request.headers.get('content-encoding'),'aes128gcm');assert.match(request.headers.get('authorization'),/vapid/);return new Response(null,{status:201});
          }
          if(url.hostname==='site.api.espn.com'){assert.equal(request.headers.get('cookie'),null);return Response.json(url.pathname.endsWith('news')?{articles:[]}:url.pathname.endsWith('injuries')?{injuries:[]}:{events:[]});}if(url.pathname.endsWith('/communication/'))return Response.json({topics:[]});assert.equal(url.hostname,'lm-api-reads.fantasy.espn.com');assert.equal(request.method,'GET');
          if(views.includes('proTeamSchedules_wl')){assert.equal(request.headers.get('cookie'),null);return Response.json(fixture.schedule);}
          assert.match(request.headers.get('cookie'),/synthetic-cookie-for-tests-only/);
          return Response.json(views.includes('kona_playercard')?fixture.cards:views.includes('kona_player_info')?fixture.free:fixture.core);
        }
        assert.equal(request.url, "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026/segments/0/leagues/10309566?view=mSettings&view=mTeam");
        assert.equal(request.method, "GET");
        assert.equal(request.headers.get("cookie"), "SWID={12345678-1234-1234-1234-123456789abc}; espn_s2=synthetic-runtime-cookie");
        if (upstreamStatus === 302) return new Response(null, { status: 302, headers: { Location: "https://untrusted.example/" } });
        if (upstreamStatus !== 200) return new Response(null, { status: upstreamStatus });
        return Response.json({ id: 10309566, seasonId: 2026,
          settings: { name: "Runtime test league" }, teams: [{ id: 25, name: "Runtime test team" }] });
      },
    }));
    console.log("Runtime check: starting provider requests.");
    const success = await runtime.dispatchFetch("https://runtime.test/");
    assert.equal(success.status, 200, "ESPN request must work in workerd, not just Bun mocks.");
    assert.equal((await success.json()).teamName, "Runtime test team");
    assert.equal(calls, 1);
    for (const [status, code, expectedStatus] of [[302, "espn_redirect", 502], [401, "espn_auth", 422], [403, "espn_forbidden", 422]]) {
      upstreamStatus = status;
      const before = calls;
      const response = await runtime.dispatchFetch("https://runtime.test/");
      assert.equal(response.status, expectedStatus);
      assert.equal((await response.json()).code, code);
      assert.equal(calls, before + 1, "Never follow a redirect or retry authentication automatically.");
    }
    console.log("Runtime check: initializing isolated D1.");
    live=true;fixture=await (await runtime.dispatchFetch('https://runtime.test/fixture')).json();
    const migrated=await runtime.dispatchFetch('https://runtime.test/migrate');assert.equal(migrated.status,200,await migrated.text());
    console.log('Runtime check: seeding synthetic credentials.');
    assert.equal((await runtime.dispatchFetch('https://runtime.test/seed')).status,200);
    const origin='https://runtime.test',endpoint=origin+'/api/gridiron/workspace';
    assert.equal((await runtime.dispatchFetch(endpoint)).status,401);
    const login=await runtime.dispatchFetch(origin+'/api/gridiron/connection',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({action:'login',ownerKey:'a'.repeat(64)})});
    assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
    const post=body=>runtime.dispatchFetch(endpoint,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});
    console.log('Runtime check: syncing synthetic league.');
    const first=await post({action:'sync'});assert.equal(first.status,200);const result=await first.json();
    assert.equal(result.synced,true,JSON.stringify(result));assert.equal(result.workspace.snapshot.players.length,186);assert.equal(result.workspace.snapshot.slots.length,9);
    assert(!JSON.stringify(result).includes('synthetic-cookie'));assert.equal(result.workspace.snapshot.players[0].history.length,9);
    assert.equal((await runtime.dispatchFetch(origin+'/api/gridiron/advisor')).status,401);
    const advice=await runtime.dispatchFetch(origin+'/api/gridiron/advisor',{headers:{Cookie:cookie}});assert.equal(advice.status,200);const adviceData=await advice.json();assert.equal(adviceData.model,'gpt-5.6-luna');assert.equal(adviceData.configured,false);assert(Array.isArray(adviceData.decisions));
    const before=calls;assert.equal((await (await post({action:'sync'})).json()).reason,'cached');assert.equal(calls,before);
    assert.equal((await post({action:'preferences',updatedAt:0,notes:'Runtime test note'})).status,200);
    assert.equal((await post({action:'preferences',updatedAt:0,notes:'Stale note'})).status,409);
    assert.equal((await runtime.dispatchFetch(origin+'/scheduled')).status,200);
    const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
    const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/runtime-test',keys:{p256dh:Buffer.from(await crypto.subtle.exportKey('raw',pair.publicKey)).toString('base64url'),auth:Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url')}};
    assert.equal((await post({action:'push_subscribe',subscription})).status,200);
    assert.equal((await post({action:'push_test',endpoint:subscription.endpoint})).status,200);assert.equal(pushCalls,1);
    console.log("Worker runtime checks passed: ESPN access errors, D1 migrations, encrypted import, owner session, cache, preference conflicts, scheduler and encrypted Web Push.");
  } finally {
    if (runtime) await runtime.dispose();
    rmSync(dir, { recursive: true, force: true });
  }
}
