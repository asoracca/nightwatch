"""Opt-in actual FFmpeg/YOLO/ByteTrack acceptance; no mocks or generated videos."""
import hashlib
import os
from pathlib import Path
import pytest

@pytest.mark.integration
def test_actual_model_pipeline(tmp_path):
    if not all(os.getenv(n) for n in ['TEST_VIDEO_PATH','MODEL_PATH','MODEL_SHA256']):
        pytest.skip('Actual clip, pinned weights and checksum required')
    import cv2
    from nightwatch.video import probe, extract, visibility
    from nightwatch.detector import Detector
    from nightwatch.domain import Detection
    source=Path(os.environ['TEST_VIDEO_PATH'])
    metadata=probe(source)
    fps=min(5,metadata['fps'])
    samples=extract(source,tmp_path/'frames',fps,metadata['duration_seconds'])
    assert samples and samples[0][1]==0
    for condition in ['clear','low_light','fog','blurry']:
        detector=Detector(os.environ['MODEL_PATH'],os.environ['MODEL_SHA256'],fps)
        for number,timestamp,path in samples:
            result=detector.run(visibility(cv2.imread(str(path)),condition),.40,.75)
            assert timestamp==number/fps
            for item in result:
                detection=Detection(**item)
                assert detection.accepted==(detection.confidence>=.75)
                x1,y1,x2,y2=detection.bbox
                assert 0<=x1<=x2<=1 and 0<=y1<=y2<=1
                assert detection.track_id is None or detection.track_id>0
    # Do not assert a positive count: valid model output can be empty.
