import pytest
from pydantic import ValidationError
from nightwatch.domain import Upload, ProcessConfig, Detection

BASE=dict(filename='clip.mp4',content_type='video/mp4',size_bytes=100,sha256='a'*64,use_case='search and rescue')
@pytest.mark.parametrize('change',[{'filename':'../clip.mp4'},{'filename':'clip.exe'},{'size_bytes':0},{'size_bytes':52428801},{'sha256':'bad'},{'content_type':'image/jpeg'},{'use_case':'unsupported'}])
def test_upload_validation(change):
    with pytest.raises(ValidationError): Upload(**{**BASE,**change})
def test_defaults():
    cfg=ProcessConfig()
    assert (cfg.sampling_fps,cfg.threshold,cfg.review_floor)==(5,0.75,0.4)
def test_condition_baseline():
    assert ProcessConfig(conditions=['fog','fog']).conditions==['clear','fog']
def test_invalid_band():
    with pytest.raises(ValidationError): ProcessConfig(review_floor=0.75,threshold=0.75)
def test_detector_and_tracking_schema():
    d=Detection(class_id=0,label='person',confidence=.8,bbox=[.1,.1,.5,.8],track_id=3,accepted=True)
    assert d.track_id==3
    with pytest.raises(ValidationError): Detection(**{**d.model_dump(),'bbox':[1,0,0,1]})
    with pytest.raises(ValidationError): Detection(**{**d.model_dump(),'track_id':-1})
