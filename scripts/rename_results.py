"""One-time rename of existing results to the '<recorded_at>_<id>' folder naming.

Local:    outputs/recordings/<id>/  ->  outputs/recordings/<time>_<id>/
Supabase: re-uploads each up-to-date local copy under the new bucket folder, updates the
          recording_results row's paths, then deletes the old bucket folder's files.
          Rows without an up-to-date local copy are left under the old name (still readable).

Dry run by default; add --apply to make changes. Safe to re-run. Stop the watcher first.
  .runtime/venv/bin/python scripts/rename_results.py [--apply]
"""
import argparse
import logging
import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1] / 'backend'
sys.path.insert(0, str(BACKEND))
os.chdir(BACKEND)  # settings() reads the repository-root .env
from nightwatch.domain import ProcessConfig  # noqa: E402
from nightwatch.recordings import (COLUMNS, DEFAULT_OUT, RESULTS_BUCKET, RESULTS_TABLE, TABLE,  # noqa: E402
                                   local_result, name_to_id, publish, result_name)
from nightwatch.store import Store  # noqa: E402


def stored_paths(row):
    return [f['image'] for f in row['frames']] + [p for p in row['annotated_clips'].values() if p]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--apply', action='store_true', help='make the changes (default: only show the plan)')
    ap.add_argument('--out', type=Path, default=DEFAULT_OUT)
    args = ap.parse_args()
    logging.basicConfig(level=logging.WARNING)
    db, cfg, act = Store(), ProcessConfig(), 'Renamed' if args.apply else 'Would rename'
    recs = {r['id']: r for r in db.rows(TABLE, select=COLUMNS)}

    print('Local folders:')
    for d in sorted(p for p in args.out.iterdir() if p.is_dir()):
        rid = name_to_id(d.name)
        if rid not in recs or d.name == result_name(recs[rid]):
            continue
        target = d.with_name(result_name(recs[rid]))
        if target.exists():
            print(f'  skip {d.name}: {target.name} already exists')
            continue
        if args.apply:
            d.rename(target)
        print(f'  {act} {d.name} -> {target.name}')

    print('Supabase (recording-results bucket + recording_results rows):')
    rows = db.rows(RESULTS_TABLE, select='recording_id,status,frames,annotated_clips', status='eq.completed')
    for row in rows:
        rec = recs.get(row['recording_id'])
        old = stored_paths(row)
        if not rec or not old or old[0].split('/')[0] == result_name(rec):
            continue
        new_name = result_name(rec)
        # Before --apply has renamed it, the local copy may still be in the old '<id>' folder.
        folder = next((f for f in (args.out / new_name, args.out / rec['id']) if f.is_dir()), args.out / new_name)
        result = local_result(args.out, rec, cfg, folder)
        if result is None:
            print(f"  skip {row['recording_id']}: no up-to-date local copy (rename locally first / reprocess); "
                  'old name still works')
            continue
        if args.apply:
            publish(db, rec, folder, result)  # uploads under the new folder, then updates the row
            db.request('DELETE', f'/storage/v1/object/{RESULTS_BUCKET}', json={'prefixes': old})
        print(f"  {act} {old[0].split('/')[0]} -> {new_name} ({len(old)} files)")
    if not args.apply:
        print('Dry run only. Re-run with --apply to make these changes.')


if __name__ == '__main__':
    main()
