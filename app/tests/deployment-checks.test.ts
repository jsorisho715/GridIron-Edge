import { expect, test } from 'bun:test';
import { loadDeployedAsset } from '../scripts/deployment-checks.mjs';
test('rollout tolerates temporary missing assets but rejects HTML fallbacks and access blocks',async()=>{
  let calls=0;const response=await loadDeployedAsset('/assets/app.js',async()=>++calls===1?new Response(null,{status:404}):new Response('ok',{headers:{'content-type':'text/javascript'}}),async()=>{});
  expect(response.ok).toBe(true);expect(calls).toBe(2);
  calls=0;await expect(loadDeployedAsset('/assets/app.js',async()=>{calls++;return new Response('<html>',{headers:{'content-type':'text/html'}});},async()=>{})).rejects.toThrow('unexpected content type');expect(calls).toBe(8);
  calls=0;await expect(loadDeployedAsset('/assets/app.js',async()=>{calls++;return new Response(null,{status:403});},async()=>{})).rejects.toThrow('HTTP 403');expect(calls).toBe(1);
});
