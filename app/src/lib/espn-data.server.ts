import { boundedText, SafeError } from './espn-security.server';
import type { ESPNInput } from './espn-provider.server';
export async function readESPN(input:ESPNInput,resource:'league'|'schedule'|'activity',params:Record<string,string|string[]>,filter?:unknown,transport:typeof fetch=fetch):Promise<any> {
  const base='https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/'+input.season;
  const url=new URL(resource==='schedule'?base:base+'/segments/0/leagues/'+input.leagueId+(resource==='activity'?'/communication/':''));
  for(const [key,value] of Object.entries(params))for(const v of Array.isArray(value)?value:[value])url.searchParams.append(key,v);
  const headers:Record<string,string>={Accept:'application/json'};
  if(resource!=='schedule')headers.Cookie='SWID='+input.swid+'; espn_s2='+input.espnS2;
  if(filter)headers['X-Fantasy-Filter']=JSON.stringify(filter);
  try {
    const response=await transport(url,{headers,redirect:'manual',signal:AbortSignal.timeout(15000)});
    if(response.status===401)throw new SafeError(422,'espn_auth','ESPN cookies need refreshing. Reconnect in Secure connections.');
    if(response.status===403)throw new SafeError(422,'espn_forbidden','ESPN denied server access. Verify your league access in ESPN before reconnecting.');
    if(response.status===429)throw new SafeError(503,'espn_busy','ESPN is limiting requests. The app will retry automatically.');
    if(response.status>=300&&response.status<400){await response.body?.cancel();throw new SafeError(502,'espn_redirect','ESPN redirected the request. No cookies were forwarded.');}
    if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw new SafeError(502,'espn_unavailable','ESPN did not return usable data. Last successful data is preserved.');
    return JSON.parse(await boundedText(response,6*1024*1024));
  }catch(error){if(error instanceof SafeError)throw error;throw new SafeError(502,'espn_network','ESPN could not be reached or its response could not be read. The app will retry automatically.');}
}
