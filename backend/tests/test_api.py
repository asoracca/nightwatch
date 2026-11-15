import pytest
from fastapi.testclient import TestClient
from nightwatch import api as module
from nightwatch.api import app, identity
from nightwatch.domain import Upload

client=TestClient(app)
A='00000000-0000-0000-0000-000000000001'
V='00000000-0000-0000-0000-000000000010'
@pytest.fixture(autouse=True)
def clean():
    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()
def test_unauthenticated():
    for path in ['/videos',f'/videos/{V}',f'/videos/{V}/frames','/experiments']:
        assert client.get(path).status_code==401
def test_invalid_token(monkeypatch):
    class Invalid: status_code=401
    monkeypatch.setattr(module.httpx,'get',lambda *a,**k:Invalid())
    assert client.get('/videos',headers={'Authorization':'Bearer invalid'}).status_code==401
def test_wrong_owner_even_if_store_returns_row(monkeypatch):
    app.dependency_overrides[identity]=lambda:{'id':A,'token':'test','app_metadata':{}}
    class DB:
        def __init__(self,*a):pass
        def rows(self,*a,**k):return [{'id':V,'owner_user_id':'another'}]
    monkeypatch.setattr(module,'Store',DB)
    assert client.get(f'/videos/{V}').status_code==404
def test_admin_access(monkeypatch):
    app.dependency_overrides[identity]=lambda:{'id':A,'token':'test','app_metadata':{'role':'admin'}}
    class DB:
        def __init__(self,*a):pass
        def rows(self,*a,**k):return [{'id':V,'owner_user_id':'another','upload_verified':False}]
    monkeypatch.setattr(module,'Store',DB)
    assert client.get(f'/videos/{V}').status_code==200
def test_duplicate_upload(monkeypatch):
    app.dependency_overrides[identity]=lambda:{'id':A,'token':'test'}
    class DB:
        def rows(self,*a,**k):return [{'id':V,'upload_verified':True}]
        def insert(self,*a,**k):raise AssertionError('Must not insert duplicate')
    monkeypatch.setattr(module,'Store',DB)
    r=client.post('/videos/upload-init',json={'filename':'x.mp4','content_type':'video/mp4','size_bytes':1,'sha256':'a'*64,'use_case':'search and rescue'})
    assert r.status_code==200 and r.json()['duplicate'] and r.json()['upload_url'] is None
def test_unverified_video_cannot_process(monkeypatch):
    app.dependency_overrides[identity]=lambda:{'id':A,'token':'test'}
    monkeypatch.setattr(module,'owned',lambda *a:{'upload_verified':False})
    assert client.post(f'/videos/{V}/process',json={}).status_code==409
def test_route_schema():
    schema=app.openapi()
    for path in ['/videos/upload-init','/videos/{video_id}/upload-complete','/videos/{video_id}/process',
                 '/videos/{video_id}/status','/videos/{video_id}/frames','/videos/{video_id}/investigation',
                 '/frames/{frame_id}/reviews','/experiments','/videos/{video_id}/assistant']:
        assert path in schema['paths']
