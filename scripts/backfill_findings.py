"""Add findings (human headline, per-object statistics) to investigations stored before findings existed.
Recomputed from the stored frames only; no inference is rerun and detections are untouched.

  .runtime/venv-win/Scripts/python.exe scripts/backfill_findings.py [--dry-run]
"""
import argparse
import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1] / 'backend'
sys.path.insert(0, str(BACKEND))
os.chdir(BACKEND)
from nightwatch.findings import findings  # noqa: E402
from nightwatch.store import Store  # noqa: E402


def frames_for(db, job_id):
    rows, offset = [], 0
    while True:
        page = db.rows('video_frames', job_id='eq.' + job_id, select='visibility_condition,frame_number,timestamp_seconds,detections_json',
                       order='frame_number.asc', limit='1000', offset=str(offset))
        rows += page
        if len(page) < 1000:
            return rows
        offset += 1000


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    db = Store()
    done = 0
    for inv in db.rows('video_investigations', select='id,job_id,summary,metrics_json', order='created_at.asc', limit='1000'):
        metrics = inv['metrics_json'] or {}
        if 'findings' in metrics:
            continue
        job = db.rows('processing_jobs', id='eq.' + inv['job_id'], select='config')[0]['config']
        found = findings(frames_for(db, inv['job_id']), job['threshold'], job['review_floor'],
                         metrics.get('effective_sampling_fps') or job.get('sampling_fps', 5))
        print(f"{inv['id'][:8]}: {found['headline_text']}")
        if not args.dry_run:
            db.patch('video_investigations', inv['id'], {
                'metrics_json': {**metrics, 'findings': found},
                'summary': f"{found['headline_text']}. {found['detail']} {inv['summary']}",
            })
        done += 1
    print(f'{done} investigation(s) {"would be " if args.dry_run else ""}updated')


if __name__ == '__main__':
    main()
