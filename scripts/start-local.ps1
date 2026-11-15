# Starts the whole local NightWatch backend in two windows: the API (http://127.0.0.1:8000) and the worker.
#   powershell -ExecutionPolicy Bypass -File scripts\start-local.ps1
# Then run the frontend: cd frontend; npm run dev  (http://localhost:3000)
# Set API_URL=http://localhost:8000 in the root .env to use this API instead of the hosted one.
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Launcher = Join-Path $PSScriptRoot 'run-local.ps1'

foreach ($mode in 'api', 'worker') {
  Start-Process powershell -ArgumentList '-NoExit', '-ExecutionPolicy', 'Bypass', '-File', "`"$Launcher`"", $mode `
    -WorkingDirectory $Root -WindowStyle Normal
}

for ($i = 0; $i -lt 30; $i++) {
  try {
    if ((Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8000/health' -TimeoutSec 2).StatusCode -eq 200) {
      Write-Host 'API is up at http://127.0.0.1:8000 (docs: /docs). Worker window is polling for jobs.'
      exit 0
    }
  } catch { Start-Sleep -Seconds 1 }
}
Write-Warning 'API did not answer /health within 30 s; check its window for errors.'
