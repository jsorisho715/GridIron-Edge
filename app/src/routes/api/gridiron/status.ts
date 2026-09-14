import {createFileRoute} from '@tanstack/react-router';
export const Route=createFileRoute('/api/gridiron/status')({server:{handlers:{GET:()=>Response.json({ready:false,mode:'sample',liveEnabled:false},{headers:{'Cache-Control':'no-store'}})}}});
