import pytest
from fastapi.testclient import TestClient

from nightwatch import api as module
from nightwatch.api import app, identity

client = TestClient(app)
A = '00000000-0000-0000-0000-000000000001'
V = '00000000-0000-0000-0000-000000000010'


@pytest.fixture(autouse=True)
def clean():
    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()


def fake_store(owner=A, active_jobs=(), frames=('f/1.jpg', 'f/2.jpg')):
    log = []

    class DB:
        def __init__(self, *a):
            pass

        def rows(self, table, **q):
            if table == 'videos':
                return [{'id': V, 'owner_user_id': owner, 'storage_path': 'o/v/original.mp4'}]
            if table == 'processing_jobs':
                return list(active_jobs)
            if table == 'video_frames':
                return [{'frame_storage_path': p} for p in frames] if q.get('offset') == '0' else []
            raise AssertionError(table)

        def remove_objects(self, bucket, paths):
            log.append(('remove', bucket, list(paths)))

        def delete_rows(self, table, **q):
            log.append(('delete', table, q))

    return DB, log


def test_delete_removes_files_then_row(monkeypatch):
    app.dependency_overrides[identity] = lambda: {'id': A, 'token': 't', 'app_metadata': {}}
    DB, log = fake_store()
    monkeypatch.setattr(module, 'Store', DB)
    r = client.delete(f'/videos/{V}')
    assert r.status_code == 200 and r.json() == {'deleted': True, 'frames_removed': 2}
    assert log == [('remove', 'frames', ['f/1.jpg', 'f/2.jpg']), ('remove', 'videos', ['o/v/original.mp4']),
                   ('delete', 'videos', {'id': 'eq.' + V})]


def test_delete_refused_while_job_active(monkeypatch):
    app.dependency_overrides[identity] = lambda: {'id': A, 'token': 't', 'app_metadata': {}}
    DB, log = fake_store(active_jobs=[{'id': 'job'}])
    monkeypatch.setattr(module, 'Store', DB)
    assert client.delete(f'/videos/{V}').status_code == 409 and log == []


def test_delete_other_users_video_is_not_found(monkeypatch):
    app.dependency_overrides[identity] = lambda: {'id': A, 'token': 't', 'app_metadata': {}}
    DB, log = fake_store(owner='someone-else')
    monkeypatch.setattr(module, 'Store', DB)
    assert client.delete(f'/videos/{V}').status_code == 404 and log == []


def test_delete_requires_sign_in():
    assert client.delete(f'/videos/{V}').status_code == 401
