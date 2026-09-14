import {createFileRoute} from '@tanstack/react-router';
const handle=async({request}:{request:Request})=>{
  const {handleAdvisor}=await import('../../../lib/advisor.server');
  if(import.meta.env.DEV)return handleAdvisor(request,{});
  const {bindings}=await import('../../../lib/bindings.server');
  return handleAdvisor(request,bindings());
};
export const Route=createFileRoute('/api/gridiron/advisor')({server:{handlers:{GET:handle,POST:handle}}});
