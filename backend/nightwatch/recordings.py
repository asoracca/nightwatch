"""Process Arduino recordings listed in public.video_recordings and publish the results.

For each recording: download the video, run YOLO11n + ByteTrack, write results locally to
outputs/recordings/<id>/, then upload annotated frames/clips to the 'recording-results'
bucket and upsert one row into public.recording_results. Pass --no-upload to keep
everything local (read-only against Supabase).

Usage (from backend/):
  python -m nightwatch.recordings --list-buckets
  python -m nightwatch.recordings --latest            # newest recording
  python -m nightwatch.recordings --id <uuid>         # one specific recording
  python -m nightwatch.recordings --watch             # poll and process new ones
"""
import argparse
import json
import logging
import subprocess
import sys
import tempfile
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

from .detector import Detector
from .domain import ProcessConfig
from .fusion import FUSION_VERSION, fuse, hud_text, sensor_timeline
from .metrics import needs_review, summarize
from .settings import settings
from .store import Store, StoreError
from .video import extract, probe, visibility

log = logging.getLogger(__name__)
TABLE = 'video_recordings'
RESULTS_TABLE = 'recording_results'
RESULTS_BUCKET = 'recording-results'
COLUMNS = ('id,device_id,recorded_at,uploaded_at,duration_seconds,width,height,fps,file_size_bytes,storage_path,'
           'temp,humidity,distance,accel_mean,vibration')
DEFAULT_OUT = Path(__file__).resolve().parents[2] / 'outputs' / 'recordings'
ACCEPTED_COLOR = (0, 200, 0)      # BGR green: confidence >= threshold
REVIEW_COLOR = (0, 170, 255)      # BGR amber: review band [floor, threshold)


def result_name(rec):
    """Folder name for a recording's results, locally and in the bucket: '<recorded_at UTC>_<id>',
    e.g. 20261115T074418Z_41516563-...; same timestamp style as the Arduino's video filenames."""
    for key in ('recorded_at', 'uploaded_at'):
        try:
            t = datetime.fromisoformat(str(rec[key]).replace('Z', '+00:00')).astimezone(timezone.utc)
            return f"{t:%Y%m%dT%H%M%SZ}_{rec['id']}"
        except (KeyError, TypeError, ValueError):
            continue
    return rec['id']


def name_to_id(name):
    """Recording ID from a folder name in either the new '<time>_<id>' or the old '<id>' form."""
    try:
        return str(UUID(name[-36:]))
    except ValueError:
        return None


def fetch_recordings(db, recording_id=None, limit=1):
    query = {'select': COLUMNS}
    if recording_id:
        query['id'] = 'eq.' + str(recording_id)
    else:
        query.update(order='uploaded_at.desc', limit=str(limit))
    return db.rows(TABLE, **query)


def annotate(frame, detections, hud=''):
    import cv2
    h, w = frame.shape[:2]
    out = frame.copy()
    if hud:  # sensor readings for this second, top-left
        (tw, th), _ = cv2.getTextSize(hud, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
        cv2.rectangle(out, (0, 0), (tw + 8, th + 10), (0, 0, 0), -1)
        cv2.putText(out, hud, (4, th + 4), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)
    for d in detections:
        x1, y1, x2, y2 = d['bbox']
        p1, p2 = (int(x1 * w), int(y1 * h)), (int(x2 * w), int(y2 * h))
        color = ACCEPTED_COLOR if d['accepted'] else REVIEW_COLOR
        cv2.rectangle(out, p1, p2, color, 2)
        text = f"{d['label']} {d['confidence']:.2f}" + (f" #{d['track_id']}" if d['track_id'] is not None else '')
        cv2.putText(out, text, (p1[0], max(12, p1[1] - 4)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1, cv2.LINE_AA)
    return out


def make_clip(frames_dir, fps, destination):
    """Stitch annotated frames into an MP4 for quick viewing. Best effort."""
    try:
        subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-framerate', str(fps), '-start_number', '0',
                        '-i', str(frames_dir / '%06d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
                        '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', str(destination)],
                       check=True, timeout=120)
        return destination.name
    except (subprocess.SubprocessError, FileNotFoundError):
        log.warning('Could not build annotated clip %s; frames are still available', destination.name)
        return None


def process_recording(rec, db, out_root, cfg, bucket):
    import cv2
    s = settings()
    out = Path(out_root) / result_name(rec)
    out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        source = Path(tmp) / ('input' + Path(rec['storage_path']).suffix)
        size = db.download(rec['storage_path'], source, s.max_video_bytes, bucket=bucket)
        if rec.get('file_size_bytes') and size != rec['file_size_bytes']:
            raise ValueError(f"Downloaded {size} bytes but the row says {rec['file_size_bytes']}")
        meta = probe(source, s.max_video_seconds)
        fps = min(cfg.sampling_fps, meta['fps'])
        samples = extract(source, Path(tmp) / 'samples', fps, meta['duration_seconds'])
        timeline = sensor_timeline(rec, meta['duration_seconds'])

        frames, clips = [], {}
        for condition in cfg.conditions:
            # New tracker per condition, so track IDs are scoped to one pass over the clip.
            detector = Detector(s.model_path, s.model_sha256, fps)
            cond_dir = out / 'frames' / condition
            cond_dir.mkdir(parents=True, exist_ok=True)
            for number, timestamp, path in samples:
                frame = cv2.imread(str(path))
                if frame is None:
                    raise ValueError('Sample frame cannot be decoded')
                frame = visibility(frame, condition)
                start = time.perf_counter()
                detections = detector.run(frame, cfg.review_floor, cfg.threshold)
                elapsed = (time.perf_counter() - start) * 1000
                image = cond_dir / f'{number:06d}.jpg'
                second = int(timestamp)
                hud = hud_text(timeline[second]) if second < len(timeline) else ''
                cv2.imwrite(str(image), annotate(frame, detections, hud))
                frames.append({'frame_number': number, 'timestamp_seconds': timestamp,
                               'visibility_condition': condition, 'image': str(image.relative_to(out)),
                               'inference_time_ms': round(elapsed, 1),
                               'review_required': needs_review(detections, cfg.review_floor, cfg.threshold),
                               'detections_json': detections})
            clips[condition] = make_clip(cond_dir, fps, out / f'annotated_{condition}.mp4')

    summary = summarize(frames, None)
    summary.pop('affected_use_case', None)
    result = {'recording': rec, 'video': meta,
              'config': {**cfg.model_dump(exclude={'reprocess'}), 'effective_sampling_fps': fps, 'bucket': bucket},
              'model': {'name': 'YOLO11n + ByteTrack', 'version': s.model_version, 'sha256': s.model_sha256},
              'processed_at': datetime.now(timezone.utc).isoformat(),
              'summary': summary, 'annotated_clips': clips, 'frames': frames,
              'fusion': fuse(timeline, frames, cfg.threshold, cfg.review_floor)}
    (out / 'result.json').write_text(json.dumps(result, indent=2))
    (out / 'error.json').unlink(missing_ok=True)
    return out, result


def publish(db, rec, out, result):
    """Upload annotated media, then upsert the row. The row is written last, so its presence means complete."""
    prefix = result_name(rec)
    for image in sorted((out / 'frames').rglob('*.jpg')):
        db.upload(RESULTS_BUCKET, f'{prefix}/{image.relative_to(out).as_posix()}', image.read_bytes(),
                  'image/jpeg', upsert=True)
    clips = {}
    for condition, name in result['annotated_clips'].items():
        if name:
            clips[condition] = f'{prefix}/{name}'
            db.upload(RESULTS_BUCKET, clips[condition], (out / name).read_bytes(), 'video/mp4', upsert=True)

    detections = [d for f in result['frames'] for d in f['detections_json']]
    people = [d['confidence'] for d in detections if d['label'] == 'person']
    sm = result['summary']
    db.upsert(RESULTS_TABLE, {
        'recording_id': rec['id'], 'device_id': rec['device_id'], 'status': 'completed', 'error_message': None,
        'model_name': result['model']['name'], 'model_version': result['model']['version'],
        'config': result['config'], 'video_meta': result['video'],
        'total_frames': sm['total_frames'], 'frames_with_detections': sm['frames_with_detections'],
        'total_detections': sm['total_detections'], 'review_candidate_count': sm['review_candidate_count'],
        'average_confidence': sm['average_confidence'],
        'max_person_confidence': max(people) if people else None,
        'label_counts': dict(Counter(d['label'] for d in detections if d['accepted'])),
        'summary': sm,
        'frames': [{**f, 'image': f"{prefix}/{f['image']}"} for f in result['frames']],
        'annotated_clips': clips, 'processed_at': result['processed_at'],
        **{k: result['fusion'][k] for k in ('fusion_version', 'verdict', 'person_score', 'review_priority',
                                            'reasons', 'environment', 'sensor_timeline')},
    }, on_conflict='recording_id')


def publish_failure(db, rec, msg):
    try:
        db.upsert(RESULTS_TABLE, {'recording_id': rec['id'], 'device_id': rec['device_id'], 'status': 'failed',
                                  'error_message': msg, 'fusion_version': FUSION_VERSION,
                                  'processed_at': datetime.now(timezone.utc).isoformat()},
                  on_conflict='recording_id')
    except StoreError as e:
        log.error('Could not record failure for %s in %s (HTTP %s)', rec['id'], RESULTS_TABLE, e.status)


def local_result(out_root, rec, cfg, folder=None):
    """The saved result.json if it can be uploaded as-is: same rules, model, settings, recording row
    (including sensor arrays) and all media files present. Otherwise None, meaning reprocess."""
    out = Path(folder) if folder else Path(out_root) / result_name(rec)
    try:
        result = json.loads((out / 'result.json').read_text())
        s = settings()
        current = (result['fusion']['fusion_version'] == FUSION_VERSION
                   and result['model']['version'] == s.model_version and result['model']['sha256'] == s.model_sha256
                   and all(result['config'].get(k) == v for k, v in cfg.model_dump(exclude={'reprocess'}).items())
                   and all(result['recording'].get(k) == rec.get(k) for k in COLUMNS.split(','))
                   and all((out / f['image']).is_file() for f in result['frames'])
                   and all((out / name).is_file() for name in result['annotated_clips'].values() if name))
    except (OSError, ValueError, KeyError, TypeError):
        return None
    return result if current else None


def report(rec, result, where):
    sm, fu = result['summary'], result['fusion']
    score = f"{fu['person_score']:.2f}" if fu['person_score'] is not None else '-'
    print(f"{rec['id']}: {fu['verdict']} (person score {score}, priority {fu['review_priority']}); "
          f"{sm['total_detections']} accepted detections in {sm['total_frames']} frames -> {where}")
    for reason in fu['reasons']:
        print('   - ' + reason)


def run_one(rec, db, out_root, cfg, bucket, upload=True, reuse=True):
    out = Path(out_root) / result_name(rec)
    saved = local_result(out_root, rec, cfg) if upload and reuse else None
    if saved:
        log.info('Uploading saved result for %s (already up to date locally)', rec['id'])
    else:
        log.info('Processing recording %s (%s, %s)', rec['id'], rec['device_id'], rec['storage_path'])
    try:
        if saved:
            result = saved
        else:
            out, result = process_recording(rec, db, out_root, cfg, bucket)
        if upload:
            publish(db, rec, out, result)
    except StoreError as e:
        hint = ' (check --bucket / RECORDINGS_BUCKET, storage_path, and that the recording_results migration is applied)' \
            if e.status in (400, 404) else ''
        msg = f'Supabase request failed with HTTP {e.status}{hint}'
    except ValueError as e:
        msg = str(e)
    else:
        report(rec, result, f"{RESULTS_TABLE} + {out}" if upload else str(out))
        return True
    log.error('Recording %s failed: %s', rec['id'], msg)
    err_dir = Path(out_root) / result_name(rec)
    err_dir.mkdir(parents=True, exist_ok=True)
    (err_dir / 'error.json').write_text(json.dumps({'recording': rec, 'error': msg,
                                                    'at': datetime.now(timezone.utc).isoformat()}, indent=2))
    if upload:
        publish_failure(db, rec, msg)
    return False


def already_handled(db, recs, out_root, upload):
    """IDs to skip: a recording_results row (completed or failed) made with the current fusion rules,
    or local files with --no-upload. Bumping FUSION_VERSION reprocesses the recent recordings."""
    if not upload:
        return {r['id'] for r in recs
                if (Path(out_root) / result_name(r) / 'result.json').exists() or (Path(out_root) / result_name(r) / 'error.json').exists()}
    if not recs:
        return set()
    rows = db.rows(RESULTS_TABLE, select='recording_id,fusion_version',
                   recording_id='in.(' + ','.join(r['id'] for r in recs) + ')')
    return {r['recording_id'] for r in rows if r['fusion_version'] == FUSION_VERSION}


def sync_local(db, out_root, cfg, bucket):
    """Upload every up-to-date local result that Supabase lacks (or has from older rules).
    Covers recordings older than the watcher's 20-most-recent window; stale ones are left alone."""
    ids = [i for i in (name_to_id(d.parent.name) for d in Path(out_root).glob('*/result.json')) if i]
    uploaded = 0
    for i in range(0, len(ids), 50):
        batch = ids[i:i + 50]
        recs = db.rows(TABLE, select=COLUMNS, id='in.(' + ','.join(batch) + ')')
        done = already_handled(db, recs, out_root, upload=True)
        for rec in recs:
            if rec['id'] not in done and local_result(out_root, rec, cfg):
                uploaded += run_one(rec, db, out_root, cfg, bucket)
    log.info('Local sync: %d saved result(s) found, %d uploaded', len(ids), uploaded)


def watch(db, out_root, cfg, bucket, interval, upload):
    log.info('Watching %s every %ss; results -> %s', TABLE, interval, RESULTS_TABLE if upload else out_root)
    if upload:
        try:
            sync_local(db, out_root, cfg, bucket)
        except StoreError as e:
            log.error('Local sync skipped (HTTP %s); the watch loop still handles recent recordings', e.status)
    while True:
        try:
            recs = fetch_recordings(db, limit=20)
            done = already_handled(db, recs, out_root, upload)
            for rec in reversed(recs):
                if rec['id'] not in done:
                    run_one(rec, db, out_root, cfg, bucket, upload)
        except StoreError as e:
            log.error('Cannot list recordings or results (HTTP %s); retrying', e.status)
        time.sleep(interval)


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    which = p.add_mutually_exclusive_group(required=True)
    which.add_argument('--id', type=UUID, help='process one recording by video_recordings.id')
    which.add_argument('--latest', action='store_true', help='process the most recently uploaded recording')
    which.add_argument('--watch', action='store_true', help='poll for new recordings and process each once')
    which.add_argument('--list-buckets', action='store_true', help='list storage buckets and exit')
    p.add_argument('--bucket', help='storage bucket holding storage_path (default: RECORDINGS_BUCKET)')
    p.add_argument('--out', type=Path, default=DEFAULT_OUT, help=f'output directory (default: {DEFAULT_OUT})')
    p.add_argument('--no-upload', action='store_true', help='keep results local; do not write to Supabase')
    p.add_argument('--reprocess', action='store_true',
                   help='with --id/--latest: always rerun detection instead of uploading an up-to-date saved result')
    p.add_argument('--fps', type=float, default=5, help='sampled frames per second (0.5-10, capped at source fps)')
    p.add_argument('--threshold', type=float, default=0.75, help='accepted-detection confidence')
    p.add_argument('--review-floor', type=float, default=0.40, help='lower bound of the review band')
    p.add_argument('--conditions', nargs='+', default=['clear'], choices=['clear', 'low_light', 'fog', 'blurry'],
                   help="'clear' = footage as recorded; others add synthetic degradation on top")
    p.add_argument('--interval', type=float, default=10, help='seconds between polls in --watch mode')
    args = p.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format='%(levelname)s %(message)s')
    logging.getLogger('httpx').setLevel(logging.WARNING)  # hide per-request URL lines

    db = Store()  # service-role key: required to read a private bucket from a background process
    if args.list_buckets:
        for b in db.request('GET', '/storage/v1/bucket'):
            print(f"{b['id']}\tpublic={b['public']}")
        return 0
    bucket = args.bucket or settings().recordings_bucket
    if not bucket:
        p.error('set RECORDINGS_BUCKET in backend/.env or pass --bucket (see --list-buckets)')
    cfg = ProcessConfig(sampling_fps=args.fps, threshold=args.threshold,
                        review_floor=args.review_floor, conditions=args.conditions)
    upload = not args.no_upload

    if args.watch:
        watch(db, args.out, cfg, bucket, args.interval, upload)
    rows = fetch_recordings(db, recording_id=args.id)
    if not rows:
        print('No matching recording found in video_recordings', file=sys.stderr)
        return 1
    return 0 if run_one(rows[0], db, args.out, cfg, bucket, upload, reuse=not args.reprocess) else 1


if __name__ == '__main__':
    sys.exit(main())
