import hashlib
import logging
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from .settings import settings
from .store import Store
from .video import probe, extract, visibility
from .domain import summarize, needs_review
from .detector import Detector
from .findings import findings
from .models import CATALOG, ensure, label, name_from_version
from .sensor_assist import VERSION as SENSOR_ASSIST_VERSION, reading_at, readings_from_events

log = logging.getLogger(__name__)

class FramePublisher:
    """Uploads frame images in parallel and inserts their rows in batches, so network round-trips no longer
    block inference. A row is inserted only after its image upload succeeded; any failure fails the job."""
    BATCH = 25
    HEARTBEAT_S = 10

    def __init__(self, db, job_id, workers=4):
        self.db, self.job_id = db, job_id
        self.pool = ThreadPoolExecutor(max_workers=workers)
        self.pending = []
        self.last_beat = 0.0

    def add(self, image_path, content, row):
        self.pending.append((self.pool.submit(self.db.upload_frame, image_path, content), row))
        if len(self.pending) >= self.BATCH:
            self.flush()

    def flush(self):
        if self.pending:
            for future, _ in self.pending:
                future.result()  # re-raises an upload failure
            self.db.insert_many('video_frames', [row for _, row in self.pending])
            self.pending = []
        if time.monotonic() - self.last_beat >= self.HEARTBEAT_S:
            self.db.patch('processing_jobs', self.job_id, {'heartbeat_at': datetime.now(timezone.utc).isoformat()})
            self.last_beat = time.monotonic()

    def close(self):
        self.flush()
        self.pool.shutdown(wait=True)


def run_job(job, db=None):
    import cv2
    db = db or Store()
    s = settings()
    vid = job['video_id']
    try:
        video = db.rows('videos',id='eq.'+vid)[0]
        cfg = job['config']
        # Run exactly the model the job was queued with; refuse anything not pinned in the catalog.
        model = cfg.get('model') or name_from_version(cfg['model_version'])
        if model not in CATALOG or cfg['model_sha256'] != CATALOG[model]['sha256']:
            raise ValueError('Queued model is not a pinned catalog model')
        model_path = ensure(model, s)
        model_name, model_version = label(model), cfg['model_version']+':'+cfg['model_sha256']
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp)/'video'
            db.download(video['storage_path'],source,s.max_video_bytes)
            if hashlib.sha256(source.read_bytes()).hexdigest() != video['content_sha256']:
                raise ValueError('Video integrity check failed')
            meta = probe(source,s.max_video_seconds)
            fps = min(cfg['sampling_fps'],meta['fps'])
            samples = extract(source,Path(tmp)/'frames',fps,meta['duration_seconds'])
            # Sensor readings from the linked device's capture interval (none if the video is not linked).
            # Jobs queued by an API without the flag default to on; per-detection reasons record every adjustment.
            readings = []
            if cfg.get('sensor_assist', True) and video.get('device_id') and video.get('recording_started_at'):
                events = db.rows('device_events',linked_video_id='eq.'+vid,order='event_time.asc',limit='1000')
                readings = readings_from_events(events,video['recording_started_at'],meta['duration_seconds'])
            assisted_seconds = sum(r is not None for r in readings)
            rows=[]
            publisher = FramePublisher(db, job['id'])
            for condition in cfg['conditions']:
                detector = Detector(model_path,cfg['model_sha256'],fps)
                condition_started = time.perf_counter()
                for number,timestamp,path in samples:
                    frame = cv2.imread(str(path))
                    if frame is None:
                        raise ValueError('Sample frame cannot be decoded')
                    frame = visibility(frame,condition)
                    start = time.perf_counter()
                    detections = detector.run(frame,cfg['review_floor'],cfg['threshold'],sensors=reading_at(readings,timestamp))
                    elapsed = (time.perf_counter()-start)*1000
                    flagged = needs_review(detections,cfg['review_floor'],cfg['threshold'])
                    image_path = f"{video['owner_user_id']}/{vid}/{job['id']}/{condition}/{number}.jpg"
                    ok,image = cv2.imencode('.jpg',frame)
                    if not ok:
                        raise ValueError('Frame encoding failed')
                    row={'video_id':vid,'job_id':job['id'],'frame_number':number,'timestamp_seconds':timestamp,
                         'frame_storage_path':image_path,'visibility_condition':condition,'detections_json':detections,
                         'tracking_json':[{'track_id':d['track_id'],'detection_index':i,'bbox':d['bbox']} for i,d in enumerate(detections) if d['track_id'] is not None],
                         'inference_time_ms':elapsed,'review_required':flagged,
                         'review_reason':(f"{'Sensor-fused confidence' if any(d.get('sensor_reasons') for d in detections) else 'Confidence'} in [{cfg['review_floor']}, {cfg['threshold']})") if flagged else None,
                         'model_name':model_name,'model_version':model_version}
                    publisher.add(image_path,image.tobytes(),row)
                    rows.append(row)
                publisher.flush()
                log.info('Job %s: %s done, %d frames in %.1f s',job['id'],condition,len(samples),time.perf_counter()-condition_started)
            publisher.close()
            summary = summarize(rows,video['use_case'])
            summary['metrics_json'].update({'requested_sampling_fps':cfg['sampling_fps'],'effective_sampling_fps':fps,
                                           'threshold':cfg['threshold'],'review_floor':cfg['review_floor'],
                                           'timestamp_semantics':'FFmpeg sampled timeline; not original source frame numbers',
                                           'tracking_scope':'Track IDs are local to each job and visibility condition',
                                           'mean_inference_ms_by_condition':{c:round(sum(r['inference_time_ms'] for r in rows if r['visibility_condition']==c)/max(1,sum(r['visibility_condition']==c for r in rows)),1) for c in cfg['conditions']},
                                           'sensor_assisted_detections':sum(1 for r in rows for d in r['detections_json'] if d.get('sensor_reasons')),
                                           'sensor_assist':{'version':SENSOR_ASSIST_VERSION,'enabled':bool(cfg.get('sensor_assist',True)),
                                                            'seconds_with_readings':assisted_seconds,
                                                            'note':'Sensor-fused scores drove tracking and acceptance; raw model confidence is kept per detection.'}})
            found = findings(rows,cfg['threshold'],cfg['review_floor'],fps)
            summary['metrics_json']['findings'] = found
            summary['metrics_json']['model'] = model
            summary['summary'] = f"{found['headline_text']}. {found['detail']} {summary['summary']}"
            log.info('Job %s: %s', job['id'], found['headline_text'])
            completed = datetime.now(timezone.utc).isoformat()
            db.insert('video_investigations',{**summary,'video_id':vid,'job_id':job['id'],
                      'processing_status':'completed','completed_at':completed})
            db.insert('experiment_runs',{'owner_user_id':video['owner_user_id'],'job_id':job['id'],
                      'experiment_name':'Visibility evaluation','model_name':model_name,'model_version':model_version,
                      'detector_threshold':cfg['threshold'],'frame_sampling_rate':fps,'video_count':1,'frame_count':len(rows),
                      'metrics_json':summary['metrics_json']})
            db.patch('videos',vid,{**meta,'model_name':model_name,'model_version':model_version})
            db.rpc('finish_job',{'p_job':job['id'],'p_error':None})
    except Exception:
        # Never return raw URLs, bearer tokens, local paths or upstream bodies.
        log.error('Job %s failed; check dependencies, media integrity and model checksum',job['id'])
        db.rpc('finish_job',{'p_job':job['id'],'p_error':'Processing failed. Check media, server dependencies and pinned model; explicitly reprocess after correction.'})
        return False
    return True

def configure_threads():
    """Use every core for inference unless INFERENCE_THREADS limits it."""
    import os
    import torch
    threads = settings().inference_threads or os.cpu_count() or 1
    torch.set_num_threads(threads)
    log.info('Inference threads: %d', threads)

def main():
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    # One line per HTTP request drowned the useful progress lines; URLs also never belong in logs.
    logging.getLogger('httpx').setLevel(logging.WARNING)
    configure_threads()
    log.info('Worker ready; polling for queued jobs')
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
