import {createFileRoute} from '@tanstack/react-router';
import {Workspace} from '../components/gridiron/Workspace';
export const Route=createFileRoute('/')({head:()=>({links:[{rel:'canonical',href:'https://gridiron-edge-sorisho.higgsfield.app'}]}),component:Workspace});
