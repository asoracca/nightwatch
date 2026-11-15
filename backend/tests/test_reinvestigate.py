import pytest
from fastapi.testclient import TestClient

from nightwatch import api as module
from nightwatch import recordings
from nightwatch.api import app, identity

client = TestClient(app)
A = '00000000-0000-0000-0000-000000000001'
R = '00000000-0000-0000-0000-0000000000aa'


@pytest.fixture(autouse=True)
def signed_in():
    app.dependency_overrides[identity] = lambda: {'id': A, 'token': 'user-jwt', 'app_metadata': {}}
    yield
    app.dependency_overrides.clear()


def store(visible=True, has_result=True):
    calls = []

    class DB:
        def __init__(self, token=None):
            self.token = token

        def rows(self, table, **q):
            if table == 'video_recordings':
                assert self.token == 'user-jwt'  # visibility checked under the caller's RLS
                return [{'id': R}] if visible else []
            if table == 'recording_results':
                return [{'recording_id': R}] if has_result else []
            raise AssertionError(table)

        def request(self, method, path, **kw):
            calls.append((method, path, kw))

    return DB, calls


def test_marks_result_for_reprocessing(monkeypatch):
    DB, calls = store()
    monkeypatch.setattr(module, 'Store', DB)
    assert client.post(f'/recordings/{R}/reinvestigate').json()['queued'] is True
    assert calls == [('PATCH', '/rest/v1/recording_results',
                      {'params': {'recording_id': 'eq.' + R}, 'json': {'fusion_version': recordings.REPROCESS_MARK}})]


def test_unprocessed_recording_needs_no_mark(monkeypatch):
    DB, calls = store(has_result=False)
    monkeypatch.setattr(module, 'Store', DB)
    assert client.post(f'/recordings/{R}/reinvestigate').status_code == 200 and calls == []


def test_invisible_recording_is_not_found(monkeypatch):
    DB, calls = store(visible=False)
    monkeypatch.setattr(module, 'Store', DB)
    assert client.post(f'/recordings/{R}/reinvestigate').status_code == 404 and calls == []


def test_watcher_picks_up_marked_recordings():
    class DB:
        def rows(self, table, **q):
            if table == recordings.RESULTS_TABLE:
                assert q['fusion_version'] == 'eq.' + recordings.REPROCESS_MARK
                return [{'recording_id': R}]
            assert q['id'] == f'in.({R})'
            return [{'id': R}]

    assert recordings.requested_reprocessing(DB()) == [{'id': R}]
