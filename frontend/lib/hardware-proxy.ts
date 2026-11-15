export async function forwardHardware(request:Request,path:string){
  const url=process.env.HARDWARE_FUNCTION_URL;
  if(!url)return Response.json({detail:'Hardware service is not configured.'},{status:503});
  const reader=request.body?.getReader();let length=0;const chunks:Uint8Array[]=[];
  if(reader){while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>4096){await reader.cancel();return Response.json({detail:'Payload too large'},{status:413});}chunks.push(value);}}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try{
    const upstream=await fetch(url+'/'+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:request.headers.get('Authorization')||''},body:new TextDecoder().decode(bytes),signal:AbortSignal.timeout(15000),redirect:'error',cache:'no-store'});
    return new Response(await upstream.text(),{status:upstream.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  }catch{console.error('Hardware upstream connection failed');return Response.json({detail:'Hardware service temporarily unavailable; retry the same event.'},{status:503});}
}
