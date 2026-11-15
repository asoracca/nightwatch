import {forwardHardware} from '../../../../lib/hardware-proxy';
export async function POST(request:Request,context:{params:Promise<{path:string[]}>}){
  const {path}=await context.params;const route=path.join('/');
  if(!/^(devices|devices\/[a-zA-Z0-9_-]{3,64}\/revoke|videos\/[a-f0-9-]{36}\/device-link)$/.test(route))return Response.json({detail:'Not found'},{status:404});
  return forwardHardware(request,route);
}
