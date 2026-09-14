// Independent owner-only health check. No private payloads or session values in logs.
const origin='https://gridiron-edge.gridiron-edge-2b093f15.workers.dev';
let cookie;
const check=(ok,message)=>{if(!ok)throw new Error(message);};
async function call(path,body){const r=await fetch(origin+path,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(body?.action==='sync'?120000:60000),headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});check(r.ok,'Health endpoint returned HTTP '+r.status);return r;}
try{
  check(process.env.OWNER_ACCESS_KEY,'Owner health secret is missing.');
  const login=await call('/api/gridiron/connection',{action:'login',ownerKey:process.env.OWNER_ACCESS_KEY});cookie=login.headers.get('set-cookie')?.split(';')[0];check(cookie,'Owner health session failed.');
  let data=await (await call('/api/gridiron/workspace')).json();
  check(data.connected,'ESPN is disconnected. Reconnect through the private app.');
  if(data.preferences.paused)console.log('Monitoring is intentionally paused by the owner.');
  else{
    const primaryHealthy=!!data.health.heartbeat&&Date.now()-data.health.heartbeat<45*60000;
    if(!data.snapshot||!data.health.lastSuccess||Date.now()-data.health.lastSuccess>20*60000){
      const recovery=await (await call('/api/gridiron/workspace',{action:'sync'})).json();
      data=recovery.workspace;
      check(!recovery.error,'Backup refresh could not import ESPN. Review the private app for details.');
      console.log('Independent backup refresh completed.');
    }
    check(data.snapshot,'No league snapshot is available.');
    check(!data.health.error,'ESPN sync needs attention. Review the private app for details.');
    check(data.health.lastSuccess&&Date.now()-data.health.lastSuccess<30*60000,'League data is more than 30 minutes old despite the backup refresh.');
    const advisor=await (await call('/api/gridiron/advisor')).json();
    if(advisor.needsReview)await call('/api/gridiron/advisor',{action:'review'});
    if(!primaryHealthy)console.log('::warning::Cloudflare primary heartbeat is missing or late. Independent backup verified fresh league data; the primary scheduler remains degraded.');
    else console.log('Private league sync and primary scheduler heartbeat are healthy.');
    console.log('Verified automation: '+JSON.stringify({primaryHealthy,snapshotAgeMinutes:Math.round((Date.now()-data.health.lastSuccess)/60000),aiConfigured:advisor.configured,aiEnabled:advisor.enabled}));
  }
}catch(e){console.error('Health check failed: '+e.message);process.exitCode=1;}
finally{if(cookie)try{await call('/api/gridiron/connection',{action:'logout'});}catch{console.error('Health session cleanup failed. The session will expire automatically.');process.exitCode=1;}cookie=undefined;}
