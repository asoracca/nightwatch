import {forwardHardware} from '../../../lib/hardware-proxy';
export async function POST(request:Request){return forwardHardware(request,'device-events');}
