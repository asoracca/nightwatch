"""Real ByteTrack (ultralytics) with a stubbed detector: sensor readings change what gets tracked and accepted."""
import pytest

# CI installs only the lightweight API dependencies; this suite needs the ML stack.
np = pytest.importorskip('numpy')
pytest.importorskip('ultralytics')
pytest.importorskip('torch')

from types import SimpleNamespace

from nightwatch.detector import Detector
from nightwatch.sensor_assist import SensorReading

FRAME = np.zeros((480, 640, 3), dtype=np.uint8)


class StubModel:
    """Always reports one central person box at a fixed raw confidence (only above the requested floor)."""
    names = {0: 'person'}

    def __init__(self, confidence):
        self.confidence = confidence

    def predict(self, frame, device, conf, verbose):
        from ultralytics.engine.results import Boxes
        rows = [[256, 120, 384, 460, self.confidence, 0]] if self.confidence >= conf else []
        data = np.array(rows, dtype=np.float32).reshape(-1, 6)
        return [SimpleNamespace(boxes=Boxes(data, FRAME.shape[:2]), names=self.names)]


def detector(confidence):
    from ultralytics.trackers.byte_tracker import BYTETracker
    d = Detector.__new__(Detector)
    d.model = StubModel(confidence)
    d.tracker = BYTETracker(SimpleNamespace(track_high_thresh=0.5, track_low_thresh=0.1, new_track_thresh=0.6,
                                            track_buffer=5, match_thresh=0.8, fuse_score=True))
    return d


def run(d, frames, sensors):
    return [d.run(FRAME, 0.40, 0.75, sensors=sensors) for _ in range(frames)]


def test_without_sensors_weak_person_is_never_tracked():
    results = run(detector(0.55), 4, None)
    assert all(r[0]['track_id'] is None and r[0]['fused_confidence'] is None for r in results)
    assert not any(r[0]['accepted'] for r in results)


def test_distance_and_motion_start_a_track_and_accept():
    sensors = SensorReading(distance_mm=900, scene_motion=True)
    results = run(detector(0.55), 4, sensors)
    last = results[-1][0]
    assert last['track_id'] is not None
    assert last['confidence'] == pytest.approx(0.55) and last['fused_confidence'] == pytest.approx(0.80)
    assert last['accepted'] and len(last['sensor_reasons']) == 2


def test_sensors_rescue_a_candidate_below_the_review_floor():
    # 0.30 is under the 0.40 floor: invisible without sensors, a review candidate with them.
    assert run(detector(0.30), 1, None) == [[]]
    rescued = run(detector(0.30), 1, SensorReading(distance_mm=900))[0][0]
    assert rescued['fused_confidence'] == pytest.approx(0.45) and not rescued['accepted']
