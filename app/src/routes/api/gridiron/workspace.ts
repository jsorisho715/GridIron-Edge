import {createFileRoute} from '@tanstack/react-router';
const handle=async({request}:{request:Request})=>{
  const {handleWorkspace}=await import('../../../lib/workspace.server');
  if(import.meta.env.DEV)return handleWorkspace(request,{});
  const {bindings}=await import('../../../lib/bindings.server');
  return handleWorkspace(request,bindings());
};
export const Route=createFileRoute('/api/gridiron/workspace')({server:{handlers:{GET:handle,POST:handle}}});
