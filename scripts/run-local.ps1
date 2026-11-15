# Windows counterpart of scripts/run-local.sh. Runs the NightWatch worker (default) or API locally.
#   powershell -ExecutionPolicy Bypass -File scripts\run-local.ps1            # worker
#   powershell -ExecutionPolicy Bypass -File scripts\run-local.ps1 api        # API on http://127.0.0.1:8000
# One-time setup (all inside ignored .runtime/ and models/ folders): see docs/LOCAL_SETUP.md, "Windows worker".
param([ValidateSet('worker', 'api')][string]$Mode = 'worker')
$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $Root '.runtime\venv-win\Scripts\python.exe'
$Model = Join-Path $Root 'models\yolo11n.pt'
$Ffmpeg = Get-ChildItem (Join-Path $Root '.runtime\ffmpeg') -Recurse -Filter ffmpeg.exe -ErrorAction SilentlyContinue | Select-Object -First 1

if (-not (Test-Path (Join-Path $Root '.env'))) { throw 'Configure .env (repository root) with the Supabase URL, anon key and service-role key first.' }
if (-not (Test-Path $Python)) { throw "Missing $Python. Create it: py -3.12 -m venv .runtime\venv-win, then install backend\requirements.txt (see docs/LOCAL_SETUP.md)." }
# Pinned model weights are downloaded and verified on first use (backend/nightwatch/models.py).
if (-not $Ffmpeg) { throw 'Missing FFmpeg under .runtime\ffmpeg. Extract a Windows build there (see docs/LOCAL_SETUP.md).' }

# Process-local only: nothing here changes system settings or the .env file.
$env:PATH = "$($Ffmpeg.DirectoryName);$env:PATH"
$env:MODEL_PATH = $Model
# Inference uses every core (INFERENCE_THREADS in .env limits it).
$env:MODELS_DIR = Join-Path $Root 'models'
$env:YOLO_CONFIG_DIR = Join-Path $Root '.runtime\ultralytics'
$env:PYTHONUNBUFFERED = '1'

Set-Location (Join-Path $Root 'backend')
& $Python -c "from nightwatch.settings import settings; s = settings(); assert s.supabase_url and s.supabase_anon_key and s.supabase_service_role_key, 'Supabase keys are missing in .env'"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if ($Mode -eq 'worker') {
  Write-Host 'NightWatch worker running. Keep this window open; Ctrl+C stops it.'
  & $Python -m nightwatch.worker
} else {
  & $Python -m uvicorn nightwatch.api:app --host 127.0.0.1 --port 8000
}
exit $LASTEXITCODE
