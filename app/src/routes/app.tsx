import {createFileRoute} from '@tanstack/react-router';
import {Workspace} from '../components/gridiron/Workspace';
export const Route=createFileRoute('/app')({head:()=>({meta:[{title:'Your week | Gridiron Edge'}],links:[{rel:'canonical',href:'https://gridiron-edge-sorisho.higgsfield.app/app'}]}),component:Workspace});
