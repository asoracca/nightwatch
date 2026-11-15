import hashlib
from pathlib import Path
from types import SimpleNamespace
from .domain import Detection

class Detector:
    """Real YOLO/PyTorch inference; preserve unmatched detections alongside ByteTrack IDs."""
    def __init__(self, model_path, checksum, fps):
        from ultralytics import YOLO
        from ultralytics.trackers.byte_tracker import BYTETracker
        path = Path(model_path)
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != checksum:
            raise ValueError('Model file missing or checksum mismatch')
        self.model = YOLO(str(path))
        self.tracker = BYTETracker(SimpleNamespace(track_high_thresh=0.5,track_low_thresh=0.1,
                                  new_track_thresh=0.6,track_buffer=max(1, int(fps)),match_thresh=0.8,fuse_score=True))

    def run(self, frame, floor, threshold):
        import torch
        with torch.inference_mode():
            result = self.model.predict(frame,device='cpu',conf=floor,verbose=False)[0]
        boxes = result.boxes.cpu().numpy()
        tracks = self.tracker.update(boxes,frame)
        ids = {int(t[-1]):int(t[4]) for t in tracks}
        detections=[]
        for i,(xyxy,confidence,cls) in enumerate(zip(boxes.xyxyn,boxes.conf,boxes.cls)):
            detections.append(Detection(class_id=int(cls),label=result.names[int(cls)],confidence=float(confidence),
                              bbox=[max(0.,min(1.,float(x))) for x in xyxy],track_id=ids.get(i),
                              accepted=float(confidence)>=threshold).model_dump())
        return detections
