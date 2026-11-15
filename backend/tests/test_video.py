import json
import subprocess
import pytest
from nightwatch.video import probe, extract

def test_corrupted_probe(monkeypatch,tmp_path):
    def fail(*a,**k):raise subprocess.CalledProcessError(1,'ffprobe')
    monkeypatch.setattr(subprocess,'run',fail)
    with pytest.raises(ValueError,match='Invalid'):probe(tmp_path/'corrupt')
def test_zero_duration(monkeypatch,tmp_path):
    class Result:
        stdout=json.dumps({'streams':[{'codec_type':'video','avg_frame_rate':'30/1','width':640,'height':480}],
                           'format':{'duration':'0','format_name':'mp4'}})
    monkeypatch.setattr(subprocess,'run',lambda *a,**k:Result())
    with pytest.raises(ValueError):probe(tmp_path/'empty')
def test_sampling_timeline_and_command(monkeypatch,tmp_path):
    def fake(command,**kwargs):
        assert 'fps=5:start_time=0' in command[command.index('-vf')+1]
        for i in range(10): (tmp_path/f'{i+1:06}.jpg').touch()
    monkeypatch.setattr(subprocess,'run',fake)
    rows=extract('source',tmp_path,5,2)
    assert len(rows)==10 and rows[-1][1]==1.8
