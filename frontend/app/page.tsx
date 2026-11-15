'use client';
import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { api, supabase, upload, useCases, type Video, type Frame, type Investigation } from '../lib/client';
import {DevicePanel} from '../components/DevicePanel';
import { FrameViewer } from '../components/FrameViewer';

export default function Home() {
  const [session,setSession]=useState<Session|null>(null);
  const [ready,setReady]=useState(false), [error,setError]=useState(''), [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false), [progress,setProgress]=useState<number|null>(null);
  const [videos,setVideos]=useState<Video[]>([]), [selected,setSelected]=useState('');
  const [video,setVideo]=useState<Video|null>(null), [frames,setFrames]=useState<Frame[]>([]);
  const [investigation,setInvestigation]=useState<Investigation|null>(null);
  const [condition,setCondition]=useState('clear'), [reviewOnly,setReviewOnly]=useState(false);
  const [confidence,setConfidence]=useState(0.4), [useCase,setUseCase]=useState(''), [offset,setOffset]=useState(0), [index,setIndex]=useState(0);
  const [degraded,setDegraded]=useState(true), [assistant,setAssistant]=useState<unknown>(null);
  const [loading,setLoading]=useState(false), [listOffset,setListOffset]=useState(0);
  const player=useRef<HTMLVideoElement>(null);
  const mediaIssuedAt=useRef(0);
  const userId=useRef<string|null>(null);
  const token=session?.access_token || '';
  const videoServiceConfigured=Boolean(process.env.NEXT_PUBLIC_API_URL);
  useEffect(()=>{
    try {
      const client=supabase();
      client.auth.getSession().then(({data,error})=>{ if(error)setError(error.message); userId.current=data.session?.user.id||null; setSession(data.session); setReady(true); });
      const {data}=client.auth.onAuthStateChange((_event,s)=>{setSession(s); if(userId.current!==(s?.user.id||null)){userId.current=s?.user.id||null;setVideos([]);setSelected('');setVideo(null);setFrames([]);setInvestigation(null);setAssistant(null);}});
      return ()=>data.subscription.unsubscribe();
    } catch(e) {setError((e as Error).message);setReady(true);}
  },[]);
  useEffect(()=>{
    if(!token||!videoServiceConfigured)return;
    let active=true;
    const refresh=()=>api<Video[]>(`/videos?offset=${listOffset}`,token).then(v=>{if(active)setVideos(v);}).catch(e=>{if(active)setError(e.message);});
    refresh(); const timer=setInterval(refresh,5000);
    return ()=>{active=false;clearInterval(timer);};
  },[token,listOffset,videoServiceConfigured]);
  useEffect(()=>{
    setVideo(null);setFrames([]);setInvestigation(null);setAssistant(null);setIndex(0);
    if(!token||!selected)return;
    let active=true;
    setLoading(true);
    const refresh=async()=>{
      try {
        const [v,f,inv]=await Promise.all([
          api<Video>(`/videos/${selected}`,token),
          api<Frame[]>(`/videos/${selected}/frames?condition=${condition}&review_only=${reviewOnly}&offset=${offset}`,token),
          api<Investigation|null>(`/videos/${selected}/investigation`,token)]);
        if(active){setVideo(previous=>{if(previous?.id===v.id && previous.playback_url && Date.now()-mediaIssuedAt.current<600000)return {...v,playback_url:previous.playback_url}; mediaIssuedAt.current=Date.now(); return v;});setFrames(f);setInvestigation(inv);setLoading(false);}
      }catch(e){if(active){setError((e as Error).message);setLoading(false);}}
    };
    refresh();const timer=setInterval(refresh,8000);
    return()=>{active=false;clearInterval(timer);};
  },[token,selected,condition,reviewOnly,offset]);
  async function action(fn:()=>Promise<void>) {
    setBusy(true);setError('');setNotice('');
    try{await fn();}catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function authenticate(form: FormData) {
    const email=String(form.get('email')),password=String(form.get('password'));
    const signup=form.get('mode')==='signup';
    const result=signup ? await supabase().auth.signUp({email,password,options:{data:{username:String(form.get('username'))}}}) : await supabase().auth.signInWithPassword({email,password});
    if(result.error)throw result.error;
    if(signup&&!result.data.session)setNotice('Check your email to confirm your account, then sign in.');
  }
  async function sendVideo(form: FormData) {
    const currentUser=userId.current;
    const ensureCurrent=()=>{if(userId.current!==currentUser)throw new Error('Session changed; select the video after signing in again.');};
    const file=form.get('video') as File;
    if(!file?.size||file.size>52428800)throw new Error('Choose a video between 1 byte and 50 MiB. Maximum duration: 120 seconds.');
    const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))).map(b=>b.toString(16).padStart(2,'0')).join('');
    const init=await api<{video:Video;duplicate:boolean;upload_url:string|null}>('/videos/upload-init',token,{filename:file.name,content_type:file.type,size_bytes:file.size,sha256,use_case:form.get('use_case')});
    ensureCurrent();setSelected(init.video.id);setOffset(0);
    if(init.upload_url){setProgress(0);await upload(init.upload_url,file,setProgress);}
    ensureCurrent();await api(`/videos/${init.video.id}/upload-complete`,token,{});
    ensureCurrent();await api(`/videos/${init.video.id}/process`,token,{conditions:degraded?['clear','low_light','fog','blurry']:['clear']});
    ensureCurrent();setNotice(init.duplicate?'Existing video selected. No automatic repeat processing.':'Upload verified. Processing job queued.');
    const updated=await api<Video[]>('/videos',token);ensureCurrent();setVideos(updated);setProgress(null);
  }
  const frame=frames[index];
  return <main>
    <header><a href="/" className="brand">◉ NIGHTWATCH</a><span className="badge">Prototype evaluation</span>{session&&<button disabled={busy} onClick={()=>action(async()=>{const {error}=await supabase().auth.signOut();if(error)throw error;})}>Sign out</button>}</header>
    <section className="intro"><p className="eyebrow">VISIBILITY / DETECTION / EVIDENCE</p><h1>What does the model<br/>miss in the dark?</h1><p>Inspect object detection and tracking across clear footage, low light, fog and blur. Every result comes from your video.</p></section>
    <aside className="disclaimer">Not safety-certified · Does not replace rescuers · Results depend on the uploaded footage and model</aside>
    {error&&<div role="alert" className="error">{error}<button onClick={()=>setError('')}>Dismiss</button></div>}
    {notice&&<p role="status">{notice}</p>}
    {!ready?<p role="status">Loading session…</p>:!session?<section className="panel auth"><h2>Your evaluation workspace</h2><form onSubmit={e=>{e.preventDefault();const form=new FormData(e.currentTarget);const button=(e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement;form.set('mode',button?.value||'login');action(()=>authenticate(form));}}>
      <label>Email<input name="email" type="email" autoComplete="email" required/></label>
      <label>Password<input name="password" type="password" minLength={8} autoComplete="current-password" required/></label>
      <label>Username (for signup)<input name="username" maxLength={80} autoComplete="username"/></label>
      <div className="row"><button value="login" disabled={busy}>Sign in</button><button value="signup" className="secondary" disabled={busy}>Create account</button></div>
    </form></section>:<>
      {!videoServiceConfigured&&<aside className="disclaimer">Hardware events are available below. Video uploads and inference are not enabled on this deployment yet.</aside>}
      <div className="workspace"><aside className="panel"><h2>Upload footage</h2><form onSubmit={e=>{e.preventDefault();const form=new FormData(e.currentTarget);action(()=>sendVideo(form));}}>
        <label>Real video<input name="video" type="file" accept="video/mp4,video/quicktime,video/webm" required/></label>
        <p className="muted">MP4, MOV or WebM · 50 MiB · 120 seconds · up to 3840 × 2160</p>
        <label>Use case<select name="use_case">{useCases.map(c=><option key={c}>{c}</option>)}</select></label>
        <label className="check"><input type="checkbox" checked={degraded} onChange={e=>setDegraded(e.target.checked)}/>Compare all four conditions</label>
        <button disabled={busy||!videoServiceConfigured}>{busy?'Working…':'Upload & evaluate'}</button>
        {progress!==null&&<label>Upload {progress}%<progress value={progress} max={100}/></label>}
      </form><hr/><h2>Your videos</h2><label>Filter use case<select value={useCase} onChange={e=>setUseCase(e.target.value)}><option value="">All use cases</option>{useCases.map(c=><option key={c}>{c}</option>)}</select></label>
      {!videos.length&&<p className="muted">No videos on this page. Upload footage to begin.</p>}
      <nav aria-label="Videos">{videos.filter(v=>!useCase||v.use_case===useCase).map(v=><button className={`video-item ${v.id===selected?'selected':''}`} key={v.id} onClick={()=>{setSelected(v.id);setOffset(0);setIndex(0);}}><strong>{v.original_filename}</strong><span>{v.status}{!v.upload_verified?' · upload unverified':''}</span></button>)}</nav>
      <div className="row"><button disabled={!listOffset} onClick={()=>setListOffset(n=>Math.max(0,n-100))}>Previous</button><button disabled={videos.length<100} onClick={()=>setListOffset(n=>n+100)}>More videos</button></div>
      </aside><section className="panel results">
        {!selected?<div className="empty"><h2>Your evidence appears here</h2><p>Select a video to inspect frames, tracks and confidence.</p></div>:loading?<p role="status">Loading video and results…</p>:video?<>
          <div className="row"><h2>{video.original_filename}</h2><span className="badge">{video.status}</span></div>
          {video.error_message&&<p role="alert">{video.error_message}</p>}
          {video.playback_url&&<video ref={player} controls src={video.playback_url} preload="metadata"/>}
          {!video.upload_verified&&<button disabled={busy} onClick={()=>action(async()=>{await api(`/videos/${selected}/upload-complete`,token,{});setNotice('Upload verified. Start processing below.');})}>Verify upload</button>}
          <div className="row"><button disabled={busy||!video.upload_verified||video.status==='processing'} onClick={()=>action(async()=>{await api(`/videos/${selected}/process`,token,{conditions:degraded?['clear','low_light','fog','blurry']:['clear']});setNotice('Existing job returned or new job queued.');})}>Start / check job</button>
          {['completed','failed'].includes(video.status)&&<button className="secondary" disabled={busy} onClick={()=>action(async()=>{await api(`/videos/${selected}/process`,token,{reprocess:true,conditions:degraded?['clear','low_light','fog','blurry']:['clear']});setInvestigation(null);setFrames([]);setNotice('Explicit reprocessing queued.');})}>Reprocess explicitly</button>}</div>
          <div className="filters"><label>Visibility<select value={condition} onChange={e=>{setCondition(e.target.value);setOffset(0);}}>{['clear','low_light','fog','blurry'].map(c=><option key={c}>{c}</option>)}</select></label>
          <label>Min. displayed confidence {confidence.toFixed(2)}<input type="range" min="0.1" max="1" step="0.05" value={confidence} onChange={e=>setConfidence(Number(e.target.value))}/></label>
          <label className="check"><input type="checkbox" checked={reviewOnly} onChange={e=>{setReviewOnly(e.target.checked);setOffset(0);}}/>Pending review only</label></div>
          {frame?<><FrameViewer frame={frame} confidence={confidence}/><div className="row"><button disabled={index===0} onClick={()=>setIndex(n=>n-1)}>Previous frame</button><button disabled={index>=frames.length-1} onClick={()=>setIndex(n=>n+1)}>Next frame</button><button onClick={()=>{if(player.current)player.current.currentTime=frame.timestamp_seconds;}}>Seek video to timestamp</button></div>
          {frame.review_required&&<div className="row">{(['confirmed','dismissed'] as const).map(decision=><button key={decision} disabled={busy} onClick={()=>action(async()=>{await api(`/frames/${frame.id}/reviews`,token,{decision});setFrames(fs=>fs.map(f=>f.id===frame.id?{...f,review_status:decision}:f));setNotice('Review recorded; original model confidence preserved.');})}>{decision==='confirmed'?'Confirm review candidate':'Dismiss review candidate'}</button>)}</div>}</>:<p role="status">No frames for this filter yet. Processing results refresh automatically.</p>}
          <div className="row"><button disabled={offset===0} onClick={()=>setOffset(n=>Math.max(0,n-50))}>Previous 50</button><button disabled={frames.length<50} onClick={()=>setOffset(n=>n+50)}>Next 50</button></div>
          {investigation&&<section className="summary"><h2>Investigation</h2><p>{investigation.summary}</p><div className="stats"><div><strong>{investigation.total_frames}</strong>condition-frames</div><div><strong>{investigation.total_detections}</strong>accepted observations</div><div><strong>{investigation.average_confidence===null?'N/A':(investigation.average_confidence*100).toFixed(1)+'%'}</strong>mean confidence</div></div>
          <table><caption>Visibility comparison — counts are not ground-truth recall</caption><thead><tr><th>Condition</th><th>Frames</th><th>Detections</th><th>Review frames</th></tr></thead><tbody>{Object.entries(investigation.metrics_json.by_condition).map(([c,s])=><tr key={c}><td>{c}</td><td>{s.frames}</td><td>{s.detections}</td><td>{s.review_frames}</td></tr>)}</tbody></table>
          <button disabled={busy} onClick={()=>action(async()=>{setAssistant(await api(`/videos/${selected}/assistant`,token,{topic:'summary'}));})}>Explain verified results</button>
          {assistant!==null&&<details open><summary>Evidence-only report with citations</summary><pre>{JSON.stringify(assistant,null,2)}</pre></details>}</section>}
        </>:<p>Unable to load this video. Select it again to retry.</p>}
      </section></div>
      <DevicePanel key={session.user.id} token={token} videoId={selected}/>
    </>}
    <footer>NightWatch / Research prototype. Synthetic visibility changes are controlled experiments, not a recreation of every real environment.</footer>
  </main>;
}
