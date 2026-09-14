import {expect,test} from 'bun:test';
function run(mode:'fresh'|'stale'|'failed'|'paused'){
  const source=`
    const calls=[];let age=${mode==='fresh'?60000:3600000};
    const workspace=()=>({connected:true,preferences:{paused:${mode==='paused'}},snapshot:{},health:{heartbeat:${mode==='fresh'?'Date.now()':'null'},lastSuccess:Date.now()-age,error:null}});
    globalThis.fetch=async(url,options)=>{
      if(!String(url).startsWith('https://gridiron-edge.gridiron-edge-2b093f15.workers.dev/'))throw new Error('Wrong host');
      if(options.redirect!=='error')throw new Error('Unsafe redirect policy');
      const body=options.body?JSON.parse(options.body):null;calls.push(body?.action??'read');
      if(body?.action==='login')return Response.json({}, {headers:{'set-cookie':'owner=synthetic; HttpOnly; Secure'}});
      if(body?.action==='sync'){age=1000;return Response.json({workspace:workspace(),${mode==='failed'?"error:'Provider failed'":'synced:true'}});}
      if(String(url).endsWith('/advisor'))return Response.json({needsReview:false,configured:false,enabled:false});
      if(body?.action==='logout')return Response.json({});
      return Response.json(workspace());
    };
    await import('./scripts/check-health.mjs');console.log('CALLS='+JSON.stringify(calls));
  `;
  const r=Bun.spawnSync(['node','--input-type=module','-e',source],{cwd:new URL('..',import.meta.url).pathname,env:{...process.env,OWNER_ACCESS_KEY:'synthetic-owner-key-for-test-only'}});
  return {code:r.exitCode,text:new TextDecoder().decode(r.stdout)+new TextDecoder().decode(r.stderr)};
}
test('backup refresh repairs stale data and labels a missing primary heartbeat honestly',()=>{
  const r=run('stale');expect(r.code).toBe(0);expect(r.text).toContain('"sync"');expect(r.text).toContain('primary scheduler remains degraded');expect(r.text).toContain('"logout"');expect(r.text).not.toContain('synthetic-owner-key');
});
test('fresh or intentionally paused monitoring makes no redundant sync requests',()=>{
  for(const mode of ['fresh','paused'] as const){const r=run(mode);expect(r.code).toBe(0);expect(r.text).not.toContain('"sync"');expect(r.text).toContain('"logout"');}
});
test('a failed backup import remains a failing health check',()=>{
  const r=run('failed');expect(r.code).toBe(1);expect(r.text).toContain('Health check failed');expect(r.text).toContain('"logout"');
});
