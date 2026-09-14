import {createFileRoute} from '@tanstack/react-router';
const handle=async({request}:{request:Request})=>{
  const {handlePublicContext}=await import('../../../lib/public-context.server');
  if(import.meta.env.DEV)return handlePublicContext(request,{});
  const {bindings}=await import('../../../lib/bindings.server');
  return handlePublicContext(request,bindings());
};
export const Route=createFileRoute('/api/gridiron/context')({server:{handlers:{POST:handle}}});
