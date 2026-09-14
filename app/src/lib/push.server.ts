import { buildPushPayload, type PushSubscription, type VapidKeys } from '@block65/webcrypto-web-push';
import { decryptConnection, encryptConnection, keyedHash, SafeError, type ConnectionEnv } from './espn-security.server';
const subject='https://gridiron-edge.gridiron-edge-2b093f15.workers.dev';
const base64url=(data:ArrayBuffer)=>btoa(String.fromCharCode(...new Uint8Array(data))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
export function validateSubscription(value:unknown):PushSubscription{
  const s=value as PushSubscription;
  if(!s||typeof s.endpoint!=='string'||s.endpoint.length>4096)throw new SafeError(400,'subscription','Invalid notification subscription.');
  let u:URL;try{u=new URL(s.endpoint);}catch{throw new SafeError(400,'subscription','Invalid notification endpoint.');}
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||!['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'].includes(u.hostname))throw new SafeError(400,'subscription','This browser notification service is not supported. Use Chrome on your Pixel.');
  const length=(v:unknown)=>{if(typeof v!=='string'||!/^[\w-]+={0,2}$/.test(v))return 0;try{return atob(v.replaceAll('-','+').replaceAll('_','/')).length;}catch{return 0;}};
  if(length(s.keys?.p256dh)!==65||length(s.keys?.auth)!==16)throw new SafeError(400,'subscription','Invalid browser notification keys.');
  return {endpoint:u.href,expirationTime:s.expirationTime??null,keys:{p256dh:s.keys.p256dh,auth:s.keys.auth}};
}
async function vapid(env:ConnectionEnv):Promise<VapidKeys>{
  let row=await env.DB!.prepare('SELECT public_key,envelope FROM ge_push_config WHERE id=1').first<{public_key:string;envelope:string}>();
  if(!row){const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);const publicKey=base64url(await crypto.subtle.exportKey('raw',pair.publicKey)),privateKey=(await crypto.subtle.exportKey('jwk',pair.privateKey)).d!;
    await env.DB!.prepare('INSERT OR IGNORE INTO ge_push_config(id,public_key,envelope) VALUES(1,?,?)').bind(publicKey,await encryptConnection(env.CREDENTIAL_ENCRYPTION_KEY!,{privateKey})).run();
    row=await env.DB!.prepare('SELECT public_key,envelope FROM ge_push_config WHERE id=1').first<{public_key:string;envelope:string}>();}
  return {subject,publicKey:row!.public_key,privateKey:(await decryptConnection<{privateKey:string}>(env.CREDENTIAL_ENCRYPTION_KEY!,row!.envelope)).privateKey};
}
async function send(env:ConnectionEnv,subscription:PushSubscription,test:boolean,transport:typeof fetch){
  const payload=await buildPushPayload({data:JSON.stringify({title:test?'Gridiron Edge is connected':'Your league needs a look',body:test?'Notifications can reach this device.':'Open your private workspace to review the latest changes.',url:'/app?tab=reports'}),options:{ttl:3600}},subscription,await vapid(env));
  const response=await transport(subscription.endpoint,{...payload,redirect:'manual',signal:AbortSignal.timeout(10000)});
  await response.body?.cancel();return response.status;
}
export async function handlePush(body:Record<string,unknown>,env:ConnectionEnv,transport:typeof fetch){
  const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store, private'}});
  if(body.action==='push_config')return reply({publicKey:(await vapid(env)).publicKey});
  if(body.action==='push_subscribe'){
    const subscription=validateSubscription(body.subscription),id=await keyedHash(env.CREDENTIAL_ENCRYPTION_KEY!,'push:'+subscription.endpoint);
    const count=await env.DB!.prepare('SELECT count(*) AS count FROM ge_push_subscriptions').first<{count:number}>();
    if((count?.count??0)>=5&&!await env.DB!.prepare('SELECT id FROM ge_push_subscriptions WHERE id=?').bind(id).first())return reply({error:'Five devices are already subscribed. Remove a device before adding another.'},409);
    await env.DB!.prepare('INSERT INTO ge_push_subscriptions(id,envelope,created_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET envelope=excluded.envelope,failures=0').bind(id,await encryptConnection(env.CREDENTIAL_ENCRYPTION_KEY!,subscription),Date.now()).run();
    return reply({subscribed:true});
  }
  if(body.action==='push_unsubscribe'||body.action==='push_test'){
    if(typeof body.endpoint!=='string')return reply({error:'Notification subscription missing.'},400);
    const id=await keyedHash(env.CREDENTIAL_ENCRYPTION_KEY!,'push:'+body.endpoint);
    if(body.action==='push_unsubscribe'){await env.DB!.prepare('DELETE FROM ge_push_subscriptions WHERE id=?').bind(id).run();return reply({subscribed:false});}
    const row=await env.DB!.prepare('SELECT envelope FROM ge_push_subscriptions WHERE id=?').bind(id).first<{envelope:string}>();if(!row)return reply({error:'Enable notifications on this device first.'},409);
    const subscription=validateSubscription(await decryptConnection(env.CREDENTIAL_ENCRYPTION_KEY!,row.envelope)),status=await send(env,subscription,true,transport);
    if(status>=200&&status<300)return reply({sent:true});
    if(status===404||status===410)await env.DB!.prepare('DELETE FROM ge_push_subscriptions WHERE id=?').bind(id).run();
    return reply({error:'Notification delivery was not accepted. Disable and re-enable notifications on this device.'},502);
  }
  return reply({error:'Unknown notification action.'},400);
}
export async function deliverAlerts(env:ConnectionEnv,scope:string,transport:typeof fetch){
  const alerts=(await env.DB!.prepare('SELECT id FROM ge_alerts WHERE scope=? AND notified_at IS NULL AND created_at>? ORDER BY created_at DESC LIMIT 10').bind(scope,Date.now()-3600000).all<{id:string}>()).results;
  if(!alerts.length)return;
  const devices=(await env.DB!.prepare('SELECT id,envelope,failures FROM ge_push_subscriptions LIMIT 5').all<{id:string;envelope:string;failures:number}>()).results;
  if(!devices.length)return;
  let accepted=false;
  for(const device of devices){try {const s=validateSubscription(await decryptConnection(env.CREDENTIAL_ENCRYPTION_KEY!,device.envelope)),status=await send(env,s,false,transport);
    if(status>=200&&status<300){accepted=true;await env.DB!.prepare('UPDATE ge_push_subscriptions SET last_success=?,failures=0 WHERE id=?').bind(Date.now(),device.id).run();}
    else if(status===404||status===410)await env.DB!.prepare('DELETE FROM ge_push_subscriptions WHERE id=?').bind(device.id).run();
    else await env.DB!.prepare('UPDATE ge_push_subscriptions SET failures=failures+1 WHERE id=?').bind(device.id).run();
  }catch{await env.DB!.prepare('UPDATE ge_push_subscriptions SET failures=failures+1 WHERE id=?').bind(device.id).run();}}
  if(accepted)for(const a of alerts)await env.DB!.prepare('UPDATE ge_alerts SET notified_at=? WHERE id=?').bind(Date.now(),a.id).run();
}
