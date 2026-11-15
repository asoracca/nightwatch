"""Privately configure the existing Supabase project for local API/worker use."""
from getpass import getpass
from pathlib import Path
import os
from urllib.parse import urlsplit

root = Path(__file__).resolve().parents[1]
path = root / 'backend' / '.env'
lines = (path if path.exists() else root / '.env.example').read_text().splitlines()
values = {}
for line in lines:
    if line and not line.startswith('#') and '=' in line:
        key, value = line.split('=', 1)
        values[key] = value
url = input('Supabase project URL [https://sgbpmqfbwqmysvuhiabz.supabase.co]: ').strip()
url = url or 'https://sgbpmqfbwqmysvuhiabz.supabase.co'
parsed = urlsplit(url)
if (parsed.scheme not in ('http', 'https') or not parsed.hostname
        or parsed.username or parsed.password or parsed.query or parsed.fragment
        or parsed.path not in ('', '/') or any(c.isspace() for c in url)):
    raise SystemExit('Enter the project URL (https://...supabase.co), not an API key. No changes saved.')
values['SUPABASE_URL'] = url.rstrip('/')
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
