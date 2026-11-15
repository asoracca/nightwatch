import hashlib
from pathlib import Path
from types import SimpleNamespace
from .domain import Detection
from .sensor_assist import assist, model_floor

class Detector:
    """Real YOLO/PyTorch inference; preserve unmatched detections alongside ByteTrack IDs.

    With a sensor reading, person scores are adjusted (sensor_assist.py) BEFORE ByteTrack, so sensors influence
    which boxes start or continue tracks and which count as accepted. The raw model confidence is kept."""
    def __init__(self, model_path, checksum, fps):
        from ultralytics import YOLO
        from ultralytics.trackers.byte_tracker import BYTETracker
        path = Path(model_path)
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != checksum:
            raise ValueError('Model file missing or checksum mismatch')
        self.model = YOLO(str(path))
        self.tracker = BYTETracker(SimpleNamespace(track_high_thresh=0.5,track_low_thresh=0.1,
                                  new_track_thresh=0.6,track_buffer=max(1, int(fps)),match_thresh=0.8,fuse_score=True))

    def run(self, frame, floor, threshold, sensors=None):
        import torch
        from ultralytics.engine.results import Boxes
        assisted = sensors is not None
        with torch.inference_mode():
            result = self.model.predict(frame,device='cpu',conf=model_floor(floor, assisted),verbose=False)[0]
        boxes = result.boxes.cpu().numpy()
        candidates = []
        for i,(xyxyn,confidence,cls) in enumerate(zip(boxes.xyxyn,boxes.conf,boxes.cls)):
            bbox = [max(0.,min(1.,float(x))) for x in xyxyn]
            label = result.names[int(cls)]
            fused, reasons = assist(label, float(confidence), bbox, sensors) if assisted else (float(confidence), [])
            # Anything below the review floor after sensor adjustment is not a candidate.
            if fused >= floor:
                candidates.append((i, bbox, label, float(confidence), int(cls), fused, reasons))

        # ByteTrack sees the fused scores: they decide high/low matching and whether a new track may start.
        data = boxes.data[[c[0] for c in candidates]].copy() if candidates else boxes.data[:0].copy()
        if candidates:
            data[:, 4] = [c[5] for c in candidates]
        tracks = self.tracker.update(Boxes(data, boxes.orig_shape), frame)
        ids = {int(t[-1]):int(t[4]) for t in tracks}

        detections=[]
        for j,(_,bbox,label,confidence,cls,fused,reasons) in enumerate(candidates):
            detections.append(Detection(class_id=cls,label=label,confidence=confidence,bbox=bbox,track_id=ids.get(j),
                              accepted=fused>=threshold,fused_confidence=fused if assisted else None,
                              sensor_reasons=reasons).model_dump())
        return detections
