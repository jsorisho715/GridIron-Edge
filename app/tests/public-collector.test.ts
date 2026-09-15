import {expect,test} from 'bun:test';
import {collectPublicContext} from '../scripts/collect-public-context.mjs';
test('backup collector uses only fixed public hosts, strips bulky metadata and avoids unchanged reads',async()=>{
  const snapshot={acquiredAt:new Date().toISOString(),intel:{headlines:{checkedAt:null},nfl:{injuryFeed:{checkedAt:null},marketFeed:{checkedAt:null},gameWindow:'20260910-20260915'}}};
  const urls:string[]=[];const transport=async(url:string,options:any)=>{urls.push(url);expect(new URL(url).hostname).toBe('site.api.espn.com');expect(options.redirect).toBe('manual');expect(new Headers(options.headers).has('cookie')).toBe(false);
    return Response.json(url.includes('/news?')?{articles:[{id:1,headline:'Sample',published:new Date().toISOString(),story:'DO NOT STORE THE FULL ARTICLE',links:{web:{href:'https://www.espn.com/nfl/story/_/id/1'}},categories:[]}]}:url.endsWith('/injuries')?{injuries:[{id:'1',injuries:[{status:'Out',athlete:{id:'123',displayName:'Synthetic Athlete',position:{abbreviation:'CB'},hugeLogo:'DO NOT STORE LOGOS'}}]}]}:{events:[]});};
  const bundle=await collectPublicContext(snapshot,transport);expect(urls).toHaveLength(3);expect(JSON.stringify(bundle)).not.toContain('DO NOT STORE');expect(bundle.sources.injuries.injuries[0].injuries[0].athlete.id).toBe('123');
  snapshot.intel.headlines.checkedAt=snapshot.intel.nfl.injuryFeed.checkedAt=snapshot.intel.nfl.marketFeed.checkedAt=Date.now() as never;
  expect(await collectPublicContext(snapshot,transport)).toBeNull();expect(urls).toHaveLength(3);
});
test('backup collector preserves cached context when one public feed is blocked',async()=>{
  const snapshot={acquiredAt:new Date().toISOString(),intel:{headlines:{checkedAt:null},nfl:{injuryFeed:{checkedAt:null},marketFeed:{checkedAt:null},gameWindow:'20260910-20260915'}}};
  const transport=async(url:string)=>url.endsWith('/injuries')?new Response('',{status:403}):Response.json(url.includes('/news?')?{articles:[]}:{events:[]});
  const bundle=await collectPublicContext(snapshot,transport);
  expect(bundle).not.toBeNull();expect(bundle.sources.injuries).toBeUndefined();expect(bundle.sources.news).toBeDefined();expect(bundle.errors).toHaveLength(1);
  expect(await collectPublicContext(snapshot,async()=>new Response('',{status:403}))).toBeNull();
});
