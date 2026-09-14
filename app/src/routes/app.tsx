import {createFileRoute} from '@tanstack/react-router';
import {Workspace} from '../components/gridiron/LiveWorkspace';
export const Route=createFileRoute('/app')({head:()=>({meta:[{title:'Your week | Gridiron Edge'}]}),component:Workspace});
