import sys
from nightwatch.worker import run_job

def test_failed_processing_marks_job_failed(monkeypatch):
    # No model outputs fabricated; fail before video loading.
    monkeypatch.setitem(sys.modules,'cv2',object())
    class DB:
        calls=[]
        def rows(self,*a,**k):raise ValueError('bad video')
        def rpc(self,name,data):self.calls.append((name,data))
    db=DB()
    assert run_job({'id':'job','video_id':'video'},db) is False
    assert db.calls[0][0]=='finish_job' and db.calls[0][1]['p_error']
