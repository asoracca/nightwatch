"""Privately configure the existing Supabase project for local API/worker use."""
from getpass import getpass
from pathlib import Path
import os

root = Path(__file__).resolve().parents[1]
path = root / 'backend' / '.env'
lines = (path if path.exists() else root / '.env.example').read_text().splitlines()
values = {}
for line in lines:
    if line and not line.startswith('#') and '=' in line:
        key, value = line.split('=', 1)
        values[key] = value
url = input('Supabase project URL [https://sgbpmqfbwqmysvuhiabz.supabase.co]: ').strip()
values['SUPABASE_URL'] = url or 'https://sgbpmqfbwqmysvuhiabz.supabase.co'
for key in ('SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'):
    value = getpass(f'{key} (hidden): ').strip()
    if not value or '\n' in value or '\r' in value:
        raise SystemExit('A non-empty single-line key is required; no changes saved.')
    values[key] = value
values['MODEL_PATH'] = str(root / 'models' / 'yolo11n.pt')
fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, 'w') as f:
    for key, value in values.items():
        f.write(f'{key}={value}\n')
path.chmod(0o600)
print('Saved privately to backend/.env. Run ./scripts/run-local.sh worker.')
