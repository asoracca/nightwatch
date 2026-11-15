// Restricted hardware API. Supabase injects server keys; they never reach clients.
const base=Deno.env.get('SUPABASE_URL')!;
const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anon=Deno.env.get('SUPABASE_ANON_KEY')!;
const devicePattern=/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/;
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const canonical=(value:unknown):string=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(canonical).join(',')+']':'{'+Object.keys(value as object).sort().map(k=>JSON.stringify(k)+':'+canonical((value as Record<string,unknown>)[k])).join(',')+'}';
class ApiError extends Error{constructor(public status:number,message:string){super(message);}}
async function db(path:string,method='GET',body?:unknown){
 const r=await fetch(base+'/rest/v1/'+path,{method,headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json',Prefer:'return=representation'},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 if(!r.ok){if(r.status===409)throw new ApiError(409,'Device ID unavailable or conflicting record');throw new ApiError(503,'Database temporarily unavailable');}return r.status===204?null:r.json();
}
async function authenticated(req:Request){
 const header=req.headers.get('Authorization')||'';if(!header.startsWith('Bearer '))throw new ApiError(401,'Sign in required');
 const r=await fetch(base+'/auth/v1/user',{headers:{apikey:anon,Authorization:header}});
 if(!r.ok)throw new ApiError(401,'Invalid session');return r.json();
}
function requireKeys(body:Record<string,unknown>,allowed:string[]){if(Object.keys(body).some(k=>!allowed.includes(k)))throw new ApiError(422,'Unexpected payload field');}
Deno.serve(async(req)=>{
 if(req.method!=='POST')return json({detail:'POST required'},405);
 try{
  const reader=req.body?.getReader();let bytes=0,text='';const decoder=new TextDecoder();
  if(reader)while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>4096){await reader.cancel();throw new ApiError(413,'Payload exceeds 4096 bytes');}text+=decoder.decode(part.value,{stream:true});}
  text+=decoder.decode();let body:Record<string,unknown>;try{body=JSON.parse(text);}catch{throw new ApiError(422,'Invalid JSON');}
  if(!body||typeof body!=='object'||Array.isArray(body))throw new ApiError(422,'JSON object required');
  const route=new URL(req.url).pathname.split('/hardware/')[1]||'';
  if(route==='device-events'){
   requireKeys(body,['device_id','event_type','event_time','sensor_data']);
   if(typeof body.device_id!=='string'||!devicePattern.test(body.device_id))throw new ApiError(422,'Invalid device ID');
   if(!['motion_detected','distance_changed','temperature_reading','heartbeat'].includes(String(body.event_type)))throw new ApiError(422,'Unsupported event type');
   if(typeof body.event_time!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(body.event_time))throw new ApiError(422,'Timezone-aware event_time required');
   const time=Date.parse(body.event_time);if(!Number.isFinite(time)||time>Date.now()+300000||time<Date.now()-7*86400000)throw new ApiError(422,'Synchronize device clock: allowed 7 days past / 5 minutes future');
   const sensor=body.sensor_data as Record<string,unknown>;
   if(!sensor||typeof sensor!=='object'||Array.isArray(sensor)||!Object.keys(sensor).length)throw new ApiError(422,'Sensor readings required');
   requireKeys(sensor,['distance_cm','temperature_c','motion']);
   for(const [key,min,max] of [['distance_cm',0,100000],['temperature_c',-100,200]] as const){if(key in sensor&&(typeof sensor[key]!=='number'||!Number.isFinite(sensor[key])||Number(sensor[key])<min||Number(sensor[key])>max))throw new ApiError(422,'Invalid sensor value');}
   if('motion' in sensor&&typeof sensor.motion!=='boolean')throw new ApiError(422,'motion must be boolean');
   if(body.event_type==='motion_detected'&&sensor.motion!==true)throw new ApiError(422,'motion_detected requires motion=true');
   const header=req.headers.get('Authorization')||'';if(!/^Bearer nw_device_[A-Za-z0-9_-]{43}$/.test(header))throw new ApiError(401,'Invalid device credentials');
   const tokenHash=await hash(header.slice(7));
   const rows=await db('devices?device_id=eq.'+encodeURIComponent(body.device_id)+'&select=device_id,token_sha256,enabled,token_expires_at');
   const d=rows[0];if(!d||!d.enabled||Date.parse(d.token_expires_at)<=Date.now()||d.token_sha256!==tokenHash)throw new ApiError(401,'Invalid device credentials');
   const payload={...body,event_time:new Date(time).toISOString()};
   const result=await db('rpc/ingest_device_event','POST',{p_device:body.device_id,p_hash:tokenHash,p_key:await hash(canonical(payload)),p_type:body.event_type,p_time:payload.event_time,p_sensor:sensor});
   return json({...result,stored:true});
  }
  const user=await authenticated(req);
  if(route==='devices'){
   requireKeys(body,['device_id','label']);
   if(typeof body.device_id!=='string'||!devicePattern.test(body.device_id)||typeof body.label!=='string'||!body.label.trim()||body.label.length>80)throw new ApiError(422,'Invalid device ID or label');
   const bytes=crypto.getRandomValues(new Uint8Array(32));const token='nw_device_'+btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
   const expires=new Date(Date.now()+30*86400000).toISOString();
   await db('devices','POST',{device_id:body.device_id,label:body.label,owner_user_id:user.id,token_sha256:await hash(token),token_expires_at:expires});
   return json({device_id:body.device_id,token,expires_at:expires});
  }
  const revoke=route.match(/^devices\/([a-zA-Z0-9_-]{3,64})\/revoke$/);
  if(revoke){const rows=await db('devices?device_id=eq.'+encodeURIComponent(revoke[1])+'&owner_user_id=eq.'+user.id+'&select=device_id');if(!rows.length)throw new ApiError(404,'Device not found');await db('devices?device_id=eq.'+encodeURIComponent(revoke[1]),'PATCH',{enabled:false});return json({revoked:true});}
  const link=route.match(/^videos\/([a-f0-9-]{36})\/device-link$/);
  if(link){requireKeys(body,['device_id','recording_started_at']);
   if(typeof body.device_id!=='string'||!devicePattern.test(body.device_id)||typeof body.recording_started_at!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(body.recording_started_at)||!Number.isFinite(Date.parse(body.recording_started_at)))throw new ApiError(422,'Valid device and recording start required');
   const videos=await db('videos?id=eq.'+link[1]+'&owner_user_id=eq.'+user.id+'&select=id,upload_verified,device_id,recording_started_at');
   const devices=await db('devices?device_id=eq.'+encodeURIComponent(body.device_id)+'&owner_user_id=eq.'+user.id+'&select=device_id');
   if(!videos.length||!devices.length)throw new ApiError(404,'Video or device not found');
   if(!videos[0].upload_verified)throw new ApiError(409,'Verify video duration before linking');
   if(videos[0].device_id&&(videos[0].device_id!==body.device_id||Date.parse(videos[0].recording_started_at)!==Date.parse(body.recording_started_at)))throw new ApiError(409,'Capture association is immutable');
   await db('rpc/link_video_device','POST',{p_video:link[1],p_device:body.device_id,p_started:body.recording_started_at});return json({linked:true});
  }
  return json({detail:'Not found'},404);
 }catch(e){if(e instanceof ApiError)return json({detail:e.message},e.status);console.error('Hardware connection or request failure');return json({detail:'Temporary service failure; retry the same event.'},503);}
});
