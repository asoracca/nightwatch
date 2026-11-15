"""Run explicitly against a disposable configured Supabase + running API/worker.
Requires a real user-supplied short video. No fake detector and no stored fixture metrics.
"""
import hashlib
import os
from pathlib import Path
import time
import httpx
import pytest

@pytest.mark.integration
def test_real_video_end_to_end_and_rls():
    names=['TEST_VIDEO_PATH','TEST_USER_A_EMAIL','TEST_USER_A_PASSWORD','TEST_USER_B_EMAIL','TEST_USER_B_PASSWORD']
    if not all(os.getenv(n) for n in names):pytest.skip('Real video and two disposable users required')
    base=os.getenv('TEST_API_URL','http://localhost:8000')
    sb=os.environ['SUPABASE_URL'];anon=os.environ['SUPABASE_ANON_KEY']
    def login(letter):
        r=httpx.post(sb+'/auth/v1/token?grant_type=password',headers={'apikey':anon},json={'email':os.environ[f'TEST_USER_{letter}_EMAIL'],'password':os.environ[f'TEST_USER_{letter}_PASSWORD']})
        r.raise_for_status();return {'Authorization':'Bearer '+r.json()['access_token']}
    a,b=login('A'),login('B')
    path=Path(os.environ['TEST_VIDEO_PATH']);content=path.read_bytes()
    body={'filename':path.name,'content_type':{'.mp4':'video/mp4','.mov':'video/quicktime','.webm':'video/webm'}[path.suffix],
          'size_bytes':len(content),'sha256':hashlib.sha256(content).hexdigest(),'use_case':'search and rescue'}
    with httpx.Client(timeout=180) as c:
        init=c.post(base+'/videos/upload-init',headers=a,json=body);init.raise_for_status();data=init.json();vid=data['video']['id']
        if data['upload_url']:
            c.put(data['upload_url'],content=content,headers={'Content-Type':body['content_type']}).raise_for_status()
        c.post(f'{base}/videos/{vid}/upload-complete',headers=a,json={}).raise_for_status()
        job=c.post(f'{base}/videos/{vid}/process',headers=a,json={'conditions':['clear','fog']});job.raise_for_status()
        repeat=c.post(f'{base}/videos/{vid}/process',headers=a,json={});repeat.raise_for_status()
        assert job.json()['id']==repeat.json()['id']
        assert c.get(f'{base}/videos/{vid}',headers=b).status_code==404
        assert c.post(f'{base}/videos/{vid}/process',headers=b,json={}).status_code==404
        for table in ['videos','video_frames','video_investigations']:
            col='id' if table=='videos' else 'video_id'
            r=c.get(f'{sb}/rest/v1/{table}',headers={**b,'apikey':anon},params={col:'eq.'+vid})
            r.raise_for_status();assert r.json()==[]
        storage_path=data['video']['storage_path']
        denied=c.post(f'{sb}/storage/v1/object/sign/videos/{storage_path}',headers={**b,'apikey':anon},json={'expiresIn':60})
        assert denied.status_code>=400
        deadline=time.monotonic()+900
        while time.monotonic()<deadline:
            status=c.get(f'{base}/videos/{vid}/status',headers=a);status.raise_for_status()
            state=status.json()['status']
            assert state!='failed',status.json()
            if state=='completed':break
            time.sleep(2)
        assert state=='completed','Worker did not finish within 15 minutes'
        frames=c.get(f'{base}/videos/{vid}/frames',headers=a).json()
        assert frames and frames[0]['model_version']
        for frame in frames:
            for detection in frame['detections_json']:
                assert 0<=detection['confidence']<=1 and len(detection['bbox'])==4
            for track in frame['tracking_json']:
                assert isinstance(track['track_id'],int)
        inv=c.get(f'{base}/videos/{vid}/investigation',headers=a).json()
        assert inv['total_frames']>0 and inv['miss_rate'] is None
        assert c.get(frames[0]['image_url']).status_code==200
        # Check isolation after results exist, not only while tables are empty.
        for table,params in [
            ('video_frames',{'video_id':'eq.'+vid}),
            ('video_investigations',{'video_id':'eq.'+vid}),
            ('processing_jobs',{'video_id':'eq.'+vid}),
            ('experiment_runs',{'job_id':'eq.'+job.json()['id']})]:
            owner_rows=c.get(f'{sb}/rest/v1/{table}',headers={**a,'apikey':anon},params=params)
            owner_rows.raise_for_status();assert owner_rows.json()
            other_rows=c.get(f'{sb}/rest/v1/{table}',headers={**b,'apikey':anon},params=params)
            other_rows.raise_for_status();assert other_rows.json()==[]
        assert c.get(f'{base}/videos/{vid}/frames',headers=b).status_code==404
        assert c.get(f'{base}/videos/{vid}/investigation',headers=b).status_code==404
        assert c.post(f'{base}/frames/{frames[0]["id"]}/reviews',headers=b,json={'decision':'confirmed'}).status_code==404
        denied_frame=c.post(f'{sb}/storage/v1/object/sign/frames/{frames[0]["frame_storage_path"]}',headers={**b,'apikey':anon},json={'expiresIn':60})
        assert denied_frame.status_code>=400
        # Do not assert a nonzero detection count: the model may validly report none.
