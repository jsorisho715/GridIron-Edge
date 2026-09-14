import {createFileRoute} from '@tanstack/react-router';
export const Route=createFileRoute('/api/gridiron/status')({server:{handlers:{GET:()=>Response.json({service:'gridiron-edge',mode:'live',ownerAccessRequired:true},{headers:{'Cache-Control':'no-store'}})}}});
