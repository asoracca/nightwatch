import hashlib
import tempfile
import threading
import time
from collections import defaultdict, deque
from pathlib import Path
from uuid import UUID, uuid4
import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from .domain import Upload, ProcessConfig, Review, AssistantRequest, idempotency_key
from .settings import settings
from .store import Store, StoreError

app = FastAPI(title='NightWatch prototype evaluation', version='0.1.0')
# Configuration is read at process startup, never baked into source.
app.add_middleware(CORSMiddleware, allow_origins=[settings().frontend_origin],
                   allow_credentials=False, allow_methods=['GET','POST','DELETE'], allow_headers=['Authorization','Content-Type'])
_limits = defaultdict(deque)
_lock = threading.Lock()

@app.exception_handler(StoreError)
def store_error(request: Request, exc: StoreError):
    return JSONResponse(status_code=503, content={'detail':'Database/storage request failed. Retry later.'})

def identity(authorization: str = Header(default='')):
    if not authorization.startswith('Bearer '):
        raise HTTPException(401,'Sign in required')
    token = authorization[7:]
    s = settings()
    try:
        r = httpx.get(s.supabase_url.rstrip('/')+'/auth/v1/user',
                      headers={'apikey':s.supabase_anon_key,'Authorization':'Bearer '+token}, timeout=10)
    except httpx.HTTPError:
        raise HTTPException(503,'Authentication service unavailable')
    if r.status_code != 200:
        raise HTTPException(401,'Invalid or expired session')
    user = r.json()
    user['token'] = token
    rate_limit(user['id'],120)
    return user

def rate_limit(key,maximum):
    now = time.monotonic()
    with _lock:
        # Bound memory and enforce a single-process prototype rate limit.
        for old_key in list(_limits):
            if not _limits[old_key] or now-_limits[old_key][-1] > 60:
                del _limits[old_key]
        q = _limits[key]
        while q and now-q[0] > 60:
            q.popleft()
        if len(q) >= maximum:
            raise HTTPException(429,'Rate limit exceeded',headers={'Retry-After':'60'})
        q.append(now)


def owned(video_id, user):
    # Use caller JWT so Postgres RLS is enforced as well as this check.
    rows = Store(user['token']).rows('videos', id='eq.'+str(video_id))
    if not rows:
        raise HTTPException(404,'Video not found')
    row = rows[0]
    if row['owner_user_id'] != user['id'] and user.get('app_metadata',{}).get('role') != 'admin':
        raise HTTPException(404,'Video not found')
    return row

def latest_job(video_id,user):
    rows = Store(user['token']).rows('processing_jobs',video_id='eq.'+str(video_id),order='created_at.desc',limit='1')
    return rows[0] if rows else None

@app.get('/health')
def health():
    return {'status':'ok','purpose':'Prototype evaluation; not safety-certified'}

@app.post('/videos/upload-init')
def upload_init(body: Upload, user=Depends(identity)):
    if body.size_bytes > settings().max_video_bytes:
        raise HTTPException(413,'Video too large')
    db = Store()
    existing = db.rows('videos',owner_user_id='eq.'+user['id'],content_sha256='eq.'+body.sha256)
    if existing:
        row = existing[0]
        return {'video':row,'duplicate':True,'upload_url':None if row['upload_verified'] else db.sign_upload(row['storage_path'])}
    vid = str(uuid4())
    path = f"{user['id']}/{vid}/original{Path(body.filename).suffix}"
    data = {'id':vid,'owner_user_id':user['id'],'owner_email':user.get('email'),
            'owner_username':user.get('user_metadata',{}).get('username',''),
            'original_filename':body.filename,'storage_path':path,'content_sha256':body.sha256,
            'expected_bytes':body.size_bytes,'use_case':body.use_case}
    try:
        row = db.insert('videos',data)
    except StoreError as e:
        if e.status == 409:
            raise HTTPException(409,'Upload already reserved; retry initialization')
        raise
    return {'video':row,'duplicate':False,'upload_url':db.sign_upload(path)}

@app.post('/videos/{video_id}/upload-complete')
def upload_complete(video_id: UUID, user=Depends(identity)):
    row = owned(video_id,user)
    if row['upload_verified']:
        return row
    from .video import probe
    db = Store()
    try:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)/'input'
            size = db.download(row['storage_path'],path,settings().max_video_bytes)
            if size != row['expected_bytes'] or hashlib.sha256(path.read_bytes()).hexdigest() != row['content_sha256']:
                raise ValueError('Uploaded size or SHA256 does not match reservation')
            metadata = probe(path, settings().max_video_seconds)
    except ValueError as e:
        db.patch('videos',video_id,{'status':'failed','error_message':str(e)},upload_verified='eq.false')
        raise HTTPException(422,str(e))
    db.patch('videos',video_id,{**metadata,'upload_verified':True,'status':'uploaded','error_message':None},upload_verified='eq.false')
    return owned(video_id,user)

@app.get('/videos')
def videos(user=Depends(identity), offset: int=Query(0,ge=0)):
    # Even admins see their own videos by default; direct detail may inspect all.
    return Store(user['token']).rows('videos',owner_user_id='eq.'+user['id'],order='uploaded_at.desc',limit='100',offset=str(offset))

@app.get('/videos/{video_id}')
def video_detail(video_id: UUID,user=Depends(identity)):
    row = owned(video_id,user)
    return {**row,'playback_url':Store(user['token']).signed('videos',row['storage_path']) if row['upload_verified'] else None}

@app.delete('/videos/{video_id}')
def delete_video(video_id: UUID, user=Depends(identity)):
    """Permanently delete an upload: its stored original and frame images, then the row. Database cascades
    remove jobs, frames, investigations, experiment runs and reviews; linked device events are kept, unlinked."""
    row = owned(video_id, user)
    db = Store()
    active = db.rows('processing_jobs', video_id='eq.'+str(video_id), status='in.(queued,processing)', select='id')
    if active:
        raise HTTPException(409, 'A job is queued or processing for this video; delete it after the job finishes')
    frames, offset = [], 0
    while True:
        page = db.rows('video_frames', video_id='eq.'+str(video_id), select='frame_storage_path',
                       order='id.asc', limit='1000', offset=str(offset))
        frames += [r['frame_storage_path'] for r in page]
        if len(page) < 1000:
            break
        offset += 1000
    # Files first: if storage fails, the row still exists and the delete can simply be retried.
    db.remove_objects('frames', frames)
    db.remove_objects('videos', [row['storage_path']])
    db.delete_rows('videos', id='eq.'+str(video_id))
    return {'deleted': True, 'frames_removed': len(frames)}

@app.post('/recordings/{recording_id}/reinvestigate')
def reinvestigate_recording(recording_id: UUID, user=Depends(identity)):
    """Ask the recordings watcher to rerun detection and fusion for one Arduino recording from scratch."""
    from .recordings import REPROCESS_MARK
    # Visibility is decided by the caller's own RLS on video_recordings, never by the service key.
    if not Store(user['token']).rows('video_recordings', id='eq.'+str(recording_id), select='id'):
        raise HTTPException(404, 'Recording not found')
    db = Store()
    existing = db.rows('recording_results', recording_id='eq.'+str(recording_id), select='recording_id')
    if existing:
        db.request('PATCH', '/rest/v1/recording_results', params={'recording_id': 'eq.'+str(recording_id)},
                   json={'fusion_version': REPROCESS_MARK})
    return {'queued': True,
            'note': 'The recordings watcher (python -m nightwatch.recordings --watch) reprocesses it on its next poll; '
                    'the current result stays visible until the new one is published.'}

@app.post('/videos/{video_id}/process')
def process(video_id: UUID, body: ProcessConfig,user=Depends(identity)):
    row = owned(video_id,user)
    if not row['upload_verified']:
        raise HTTPException(409,'Complete and validate upload first')
    from .models import CATALOG, version
    s = settings()
    name = body.model or s.default_model
    if name not in CATALOG:
        raise HTTPException(503,'Server default model is not in the pinned catalog')
    config = {**body.model_dump(exclude={'reprocess'}),'model':name,'model_version':version(name),
              'model_sha256':CATALOG[name]['sha256'],'pipeline_version':'visibility-v4-findings'}
    key = idempotency_key(video_id,version(name),config)
    return Store().rpc('enqueue_job',{'p_video':str(video_id),'p_key':key,'p_config':config,'p_reprocess':body.reprocess})

@app.get('/videos/{video_id}/status')
def status(video_id: UUID,user=Depends(identity)):
    row = owned(video_id,user)
    return {'status':row['status'],'error_message':row['error_message'],'job':latest_job(video_id,user)}

@app.get('/videos/{video_id}/frames')
def frames(video_id: UUID, user=Depends(identity), offset: int=Query(0,ge=0),
           condition: str=Query('clear',pattern='^(clear|fog|low_light|blurry)$'),
           review_only: bool=False):
    owned(video_id,user)
    job = latest_job(video_id,user)
    if not job:
        return []
    query = {'video_id':'eq.'+str(video_id),'job_id':'eq.'+job['id'],'visibility_condition':'eq.'+condition,
             'order':'frame_number.asc','limit':'50','offset':str(offset)}
    if review_only:
        query.update(review_required='eq.true',review_status='eq.pending')
    db = Store(user['token'])
    rows = db.rows('video_frames',**query)
    for row in rows:
        row['image_url'] = db.signed('frames',row['frame_storage_path'])
    return rows

@app.get('/videos/{video_id}/investigation')
def investigation(video_id: UUID,user=Depends(identity)):
    owned(video_id,user)
    job = latest_job(video_id,user)
    if not job or job['status'] != 'completed':
        return None
    rows = Store(user['token']).rows('video_investigations',job_id='eq.'+job['id'])
    return rows[0] if rows else None

@app.post('/frames/{frame_id}/reviews')
def review(frame_id: UUID,body: Review,user=Depends(identity)):
    rows = Store(user['token']).rows('video_frames',id='eq.'+str(frame_id))
    if not rows:
        raise HTTPException(404,'Frame not found')
    owned(rows[0]['video_id'],user)
    if not rows[0]['review_required']:
        raise HTTPException(409,'Frame is not flagged for review')
    Store().rpc('record_review',{'p_frame':str(frame_id),'p_user':user['id'],'p_decision':body.decision,'p_note':body.note})
    return {'status':'recorded'}

@app.get('/experiments')
def experiments(user=Depends(identity),offset: int=Query(0,ge=0)):
    return Store(user['token']).rows('experiment_runs',order='created_at.desc',limit='100',offset=str(offset))

@app.post('/videos/{video_id}/assistant')
def assistant(video_id: UUID,body: AssistantRequest,user=Depends(identity)):
    from .assistant import report
    row = owned(video_id,user)
    inv = investigation(video_id,user)
    if not inv:
        raise HTTPException(409,'A completed investigation is required')
    evidence = Store(user['token']).rows('video_frames',job_id='eq.'+inv['job_id'],review_required='eq.true',order='frame_number.asc',limit='10')
    return report(row,inv,evidence,body.topic)

from .devices import router as device_router, DeviceBodyLimit
app.add_middleware(DeviceBodyLimit)
app.include_router(device_router(identity,owned,rate_limit))
