import hashlib
import logging
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from .settings import settings
from .store import Store
from .video import probe, extract, visibility
from .domain import summarize, needs_review
from .detector import Detector

log = logging.getLogger(__name__)

def run_job(job, db=None):
    import cv2
    db = db or Store()
    s = settings()
    vid = job['video_id']
    try:
        video = db.rows('videos',id='eq.'+vid)[0]
        cfg = job['config']
        # Refuse silently changing weights/version after a job was queued.
        if cfg['model_sha256'] != s.model_sha256 or cfg['model_version'] != s.model_version:
            raise ValueError('Configured model differs from queued job')
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp)/'video'
            db.download(video['storage_path'],source,s.max_video_bytes)
            if hashlib.sha256(source.read_bytes()).hexdigest() != video['content_sha256']:
                raise ValueError('Video integrity check failed')
            meta = probe(source,s.max_video_seconds)
            fps = min(cfg['sampling_fps'],meta['fps'])
            samples = extract(source,Path(tmp)/'frames',fps,meta['duration_seconds'])
            rows=[]
            for condition in cfg['conditions']:
                detector = Detector(s.model_path,s.model_sha256,fps)
                for number,timestamp,path in samples:
                    frame = cv2.imread(str(path))
                    if frame is None:
                        raise ValueError('Sample frame cannot be decoded')
                    frame = visibility(frame,condition)
                    start = time.perf_counter()
                    detections = detector.run(frame,cfg['review_floor'],cfg['threshold'])
                    elapsed = (time.perf_counter()-start)*1000
                    flagged = needs_review(detections,cfg['review_floor'],cfg['threshold'])
                    image_path = f"{video['owner_user_id']}/{vid}/{job['id']}/{condition}/{number}.jpg"
                    ok,image = cv2.imencode('.jpg',frame)
                    if not ok:
                        raise ValueError('Frame encoding failed')
                    db.upload_frame(image_path,image.tobytes())
                    row={'video_id':vid,'job_id':job['id'],'frame_number':number,'timestamp_seconds':timestamp,
                         'frame_storage_path':image_path,'visibility_condition':condition,'detections_json':detections,
                         'tracking_json':[{'track_id':d['track_id'],'detection_index':i,'bbox':d['bbox']} for i,d in enumerate(detections) if d['track_id'] is not None],
                         'inference_time_ms':elapsed,'review_required':flagged,
                         'review_reason':f"Confidence in [{cfg['review_floor']}, {cfg['threshold']})" if flagged else None,
                         'model_name':'YOLO11n + ByteTrack','model_version':s.model_version+':'+s.model_sha256}
                    db.insert('video_frames',row)
                    rows.append(row)
                    db.patch('processing_jobs',job['id'],{'heartbeat_at':datetime.now(timezone.utc).isoformat()})
            summary = summarize(rows,video['use_case'])
            summary['metrics_json'].update({'requested_sampling_fps':cfg['sampling_fps'],'effective_sampling_fps':fps,
                                           'threshold':cfg['threshold'],'review_floor':cfg['review_floor'],
                                           'timestamp_semantics':'FFmpeg sampled timeline; not original source frame numbers',
                                           'tracking_scope':'Track IDs are local to each job and visibility condition'})
            completed = datetime.now(timezone.utc).isoformat()
            db.insert('video_investigations',{**summary,'video_id':vid,'job_id':job['id'],
                      'processing_status':'completed','completed_at':completed})
            db.insert('experiment_runs',{'owner_user_id':video['owner_user_id'],'job_id':job['id'],
                      'experiment_name':'Visibility evaluation','model_name':'YOLO11n + ByteTrack','model_version':s.model_version+':'+s.model_sha256,
                      'detector_threshold':cfg['threshold'],'frame_sampling_rate':fps,'video_count':1,'frame_count':len(rows),
                      'metrics_json':summary['metrics_json']})
            db.patch('videos',vid,{**meta,'model_name':'YOLO11n + ByteTrack','model_version':s.model_version+':'+s.model_sha256})
            db.rpc('finish_job',{'p_job':job['id'],'p_error':None})
    except Exception:
        # Never return raw URLs, bearer tokens, local paths or upstream bodies.
        log.error('Job %s failed; check dependencies, media integrity and model checksum',job['id'])
        db.rpc('finish_job',{'p_job':job['id'],'p_error':'Processing failed. Check media, server dependencies and pinned model; explicitly reprocess after correction.'})
        return False
    return True

def main():
    logging.basicConfig(level=logging.INFO)
    db=Store()
    while True:
        try:
            job=db.rpc('claim_job')
            if job:
                run_job(job,db)
            else:
                time.sleep(2)
        except Exception:
            log.error('Worker cannot reach database; retrying in 5 seconds')
            time.sleep(5)

if __name__ == '__main__':
    main()
