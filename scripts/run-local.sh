#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
export PATH="$ROOT/.runtime/venv/bin:$ROOT/.runtime/media/.pixi/envs/default/bin:$PATH"
export PYTHONPYCACHEPREFIX="$ROOT/.runtime/pycache"
export YOLO_CONFIG_DIR="$ROOT/.runtime/ultralytics"
export MPLCONFIGDIR="$ROOT/.runtime/matplotlib"
export MODELS_DIR="$ROOT/models"  # pinned weights are fetched and verified on first use
export MODEL_PATH="$ROOT/models/yolo11n.pt"
cd "$ROOT/backend"
if [ ! -f "$ROOT/.env" ]; then
  echo 'Configure .env (repository root) with the Supabase URL, anon key and server-only service-role key first.' >&2
  exit 1
fi
python - <<'CHECK'
from nightwatch.settings import settings
s = settings()
if not all((s.supabase_url, s.supabase_anon_key, s.supabase_service_role_key)):
    raise SystemExit('Supabase keys are missing. Run: .runtime/venv/bin/python scripts/configure-local.py from the repository root.')
CHECK
case "${1:-worker}" in
  worker) exec python -m nightwatch.worker ;;
  api) exec python -m uvicorn nightwatch.api:app --host 127.0.0.1 --port 8000 ;;
  *) echo 'Usage: scripts/run-local.sh [worker|api]' >&2; exit 2 ;;
esac
