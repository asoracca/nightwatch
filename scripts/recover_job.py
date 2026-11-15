import argparse
import sys
from datetime import datetime,timezone,timedelta
from pathlib import Path
from uuid import UUID
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from nightwatch.store import Store
parser=argparse.ArgumentParser()
parser.add_argument('job_id',type=UUID)
parser.add_argument('--confirm-worker-stopped',action='store_true',required=True)
args=parser.parse_args()
db=Store()
rows=db.rows('processing_jobs',id='eq.'+str(args.job_id))
if not rows or rows[0]['status']!='processing':raise SystemExit('Job is not processing')
j=rows[0]
heartbeat=datetime.fromisoformat((j['heartbeat_at'] or j['started_at']).replace('Z','+00:00'))
if datetime.now(timezone.utc)-heartbeat<timedelta(minutes=10):raise SystemExit('Heartbeat is too recent; refusing recovery')
db.rpc('finish_job',{'p_job':str(args.job_id),'p_error':'Interrupted worker; explicitly reprocess after recovery.'})
print('Marked interrupted job failed. No reprocessing was started.')
