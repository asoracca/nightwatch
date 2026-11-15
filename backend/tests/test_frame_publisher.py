import pytest

from nightwatch.worker import FramePublisher


class FakeDB:
    def __init__(self, fail_upload=None):
        self.uploads, self.inserts, self.beats, self.fail_upload = [], [], 0, fail_upload

    def upload_frame(self, path, content):
        if path == self.fail_upload:
            raise RuntimeError('upload failed')
        self.uploads.append(path)

    def insert_many(self, table, rows):
        assert table == 'video_frames'
        # Every row inserted must already have its image uploaded.
        assert all(r['frame_storage_path'] in self.uploads for r in rows)
        self.inserts.append(len(rows))

    def patch(self, table, row_id, data):
        assert table == 'processing_jobs' and 'heartbeat_at' in data
        self.beats += 1


def rows(n):
    return [(f'p/{i}.jpg', b'x', {'frame_storage_path': f'p/{i}.jpg'}) for i in range(n)]


def test_batches_rows_after_uploads_and_throttles_heartbeats():
    db = FakeDB()
    pub = FramePublisher(db, 'job')
    for path, content, row in rows(60):
        pub.add(path, content, row)
    pub.close()
    assert sorted(db.inserts) == [10, 25, 25] and len(db.uploads) == 60
    assert db.beats == 1  # within the 10 s window


def test_upload_failure_fails_the_batch_without_inserting():
    db = FakeDB(fail_upload='p/3.jpg')
    pub = FramePublisher(db, 'job')
    with pytest.raises(RuntimeError):
        for path, content, row in rows(25):
            pub.add(path, content, row)
    assert db.inserts == []
