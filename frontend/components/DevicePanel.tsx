'use client';
import {useEffect,useState} from 'react';
import {supabase} from '../lib/client';

type Device={device_id:string;label:string;enabled:boolean};
type Event={id:string;device_id:string;event_type:string;event_time:string;sensor_data_json:Record<string,number|boolean>;linked_video_id:string|null};
export function DevicePanel({token,videoId}:{token:string;videoId:string}){
  const [devices,setDevices]=useState<Device[]>([]),[events,setEvents]=useState<Event[]>([]);
  const [error,setError]=useState(''),[secret,setSecret]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [revision,setRevision]=useState(0);
  useEffect(()=>{
    let active=true;
    const refresh=async()=>{
      const d=await supabase().from('devices').select('device_id,label,enabled').order('created_at',{ascending:false});
      let q=supabase().from('device_events').select('id,device_id,event_type,event_time,sensor_data_json,linked_video_id').order('event_time',{ascending:false}).limit(50);
      if(videoId)q=q.eq('linked_video_id',videoId);
      const e=await q;
      if(active){if(d.error||e.error)setError(d.error?.message||e.error?.message||'Hardware data unavailable');else{setDevices(d.data||[]);setEvents(e.data||[]);}}
    };
    refresh();const timer=setInterval(refresh,10000);return()=>{active=false;clearInterval(timer);};
  },[token,videoId,revision]);
  async function call(path:string,body:unknown){
    const r=await fetch('/api/hardware/'+path,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data=await r.json();if(!r.ok)throw new Error(data.detail||'Hardware request failed');return data;
  }
  async function action(fn:()=>Promise<void>){setBusy(true);setError('');setMessage('');try{await fn();setRevision(n=>n+1);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <section className="panel hardware"><h2>Arduino sensor events</h2><p className="muted">Sensor readings are separate evidence. They do not establish a person’s presence or change model confidence.</p>
    {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
    <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);action(async()=>{const d=await call('devices',{device_id:f.get('device_id'),label:f.get('label')});setSecret(d.token);setMessage('Device registered. Token expires in 30 days and is shown once.');});}}>
      <div className="filters"><label>New device ID<input name="device_id" placeholder="nightwatch-device-001" pattern="[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}" required/></label><label>Device label<input name="label" maxLength={80} required/></label></div><button disabled={busy}>Register sensor device</button>
    </form>
    {secret&&<div><p>Copy this restricted token into your ignored <code>arduino_secrets.h</code>. Never share it or commit it.</p><input aria-label="One-time device token" type="password" value={secret} readOnly/><button onClick={()=>action(async()=>{await navigator.clipboard.writeText(secret);setMessage('Device token copied.');})}>Copy device token</button> <button className="secondary" onClick={()=>setSecret('')}>Hide permanently</button></div>}
    <ul>{devices.map(d=><li key={d.device_id}>{d.label} · {d.device_id} · {d.enabled?'enabled':'revoked'} {d.enabled&&<button disabled={busy} className="secondary" onClick={()=>action(async()=>{await call('devices/'+encodeURIComponent(d.device_id)+'/revoke',{});setSecret('');setMessage('Device token revoked.');})}>Revoke</button>}</li>)}</ul>
    {videoId&&<form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);action(async()=>{await call('videos/'+videoId+'/device-link',{device_id:f.get('device_id'),recording_started_at:new Date(String(f.get('started'))).toISOString()});setMessage('Capture interval linked. Overlapping or uncertain matches remain unlinked.');});}}><h3>Link this video to a device</h3><div className="filters"><label>Device<select name="device_id" required>{devices.map(d=><option key={d.device_id}>{d.device_id}</option>)}</select></label><label>Actual recording start (your local time)<input type="datetime-local" name="started" step="1" required/></label></div><button disabled={busy||!devices.length}>Link capture interval</button><p className="muted">Use the real recording time, not upload time. A verified video duration is required. This association is immutable.</p></form>}
    <h3>{videoId?'Events linked to selected video':'Recent device events'}</h3>
    {!events.length?<p>No stored events for this view yet.</p>:<table><thead><tr><th>Time (UTC)</th><th>Device / event</th><th>Actual sensor readings</th></tr></thead><tbody>{events.map(e=><tr key={e.id}><td>{new Date(e.event_time).toISOString()}</td><td>{e.device_id}<br/>{e.event_type}</td><td>{JSON.stringify(e.sensor_data_json)}</td></tr>)}</tbody></table>}
  </section>;
}
