# Local development

Use Node 22, Python 3.11, Docker Desktop, Git, FFmpeg/ffprobe, PostgreSQL client (`psql`) and Supabase CLI. They are not bundled in this source tree. Commands below run from repository root unless noted. The backend flow passed in an isolated Linux environment with local Supabase, real video, YOLO and ByteTrack; it has not been run on the author’s Mac.

## 1. Supabase
Supabase CLI v3 was used for backend acceptance. Check installed help before running:

```bash
supabase --version
supabase --help
supabase start --help
supabase start
supabase db reset --help
supabase db reset
supabase status
```

`db reset` is for this new disposable local project only; it erases its local database. Do not run against a shared or hosted project. The initial migration creates all tables, RLS, buckets and worker RPCs. Local email confirmation is disabled in config.toml to permit a quick demo; hosted signup should use email confirmation.

Copy `.env.example` to `.env` **in the repository root**; insert the local anon and service-role keys from `supabase status` privately. This one file configures the API, the worker, the scripts, Docker Compose and the frontend; there is no `backend/.env` or `frontend/.env.local`. With native Python use `SUPABASE_URL=http://127.0.0.1:54321`. With Docker Compose the containers need `http://host.docker.internal:54321`; set that in the Compose service `environment:` instead of changing `.env`, because the browser must keep using `http://127.0.0.1:54321`.

## 2. Model
Docker builds download the official YOLO11n model and verify its pinned SHA256. No host model mount is needed. Keep the model settings from `.env.example`; an empty MODEL_SHA256 would override the image default and fail validation.

For native Python, install dependencies first, then from `backend/` run:

```bash
python -m nightwatch.fetch_model ../models/yolo11n.pt
```

Set MODEL_PATH to that file's absolute host path. Keep MODEL_VERSION and MODEL_SHA256 from `.env.example`. Review the Ultralytics model license before use. Weights are ignored by Git; inference never silently downloads or substitutes weights.

## 3. API and worker
Docker option (recommended):

```bash
docker compose up --build
```

Native option, run in `backend/`:

```bash
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install torch==2.15.0 torchvision==0.29.2 --index-url https://download.pytorch.org/whl/cpu
python -m pip install -r requirements.txt
uvicorn nightwatch.api:app --host 127.0.0.1 --port 8000
```

In another terminal, same directory and environment:

```bash
source .venv/bin/activate
python -m nightwatch.worker
```

Health: `http://localhost:8000/health`; OpenAPI: `http://localhost:8000/docs`. FFmpeg must be on PATH for native API **and** worker. Run one API process because its rate limiter is process-local. Multiple workers can claim separate jobs transactionally, but start with one for CPU capacity.

## 4. Frontend
The frontend reads the same root `.env`. `frontend/vite.config.js` passes exactly three values to the browser: `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `API_URL` (the NightWatch API base, e.g. `http://localhost:8000`). Everything else, including the service-role key, stays server-side, and the build fails if `SUPABASE_ANON_KEY` holds a service-role key.

From `frontend/`:

```bash
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

Commit the generated package-lock.json after reviewing it, then use `npm ci` for subsequent installs. Never name a secret with a `VITE_` prefix: Vite ships every `VITE_*` value to the browser.

The Vite dev server runs on `http://localhost:3000`, matching the backend default `FRONTEND_ORIGIN`. On Windows, run `npm test` from an uppercase drive path (`E:\...`); a lowercase drive letter makes Vitest load twice.

## 5. Verify
Create two disposable accounts in the UI. Upload a 2–5 second real clip with permission to process it, preferably showing a moving person or vehicle. Do not commit the clip. Select all conditions; observe queued/processing/completed and actual bounding boxes (if the detector reports them).

Backend tests:

```bash
cd backend
source .venv/bin/activate
pytest -m 'not integration'
```

Database tests on the disposable local Supabase only:

```bash
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -v ON_ERROR_STOP=1 -f supabase/tests/isolation.sql
```

Real integration: export `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `TEST_VIDEO_PATH` (absolute), `TEST_USER_A_EMAIL`, `TEST_USER_A_PASSWORD`, `TEST_USER_B_EMAIL`, `TEST_USER_B_PASSWORD` into the terminal. Do not put credentials on shared command lines or in history. API and worker must be running.

```bash
cd backend
pytest -m integration -v
```

Browser verification, with the same test environment variables:

```bash
cd frontend
npx playwright install chromium
npm run test:e2e
```

The real test is skipped if required inputs are missing. A skip is **not** a pass of the milestone. It creates real records in the dedicated local test project and does not clean them automatically. Reusing identical bytes returns the existing job; use a fresh local project or explicit reprocess when testing the complete pipeline again.

## Mac worker with no paid hosting

The paid Render worker was not created. `render.yaml` now declares only the free API. The processing worker runs on your Mac and connects to the same Supabase project as the API. Keep the Mac awake and online while jobs run. No inbound tunnel or public laptop port is needed for the worker.

The project-local runtime uses uv for Python 3.11 and a Pixi environment for FFmpeg. Both tool binaries, caches, libraries, model weights and test footage stay under ignored local directories. No system Python changes are required. Use `scripts/setup-local-mac.sh` on an Apple Silicon Mac to reproduce installation. Then copy `.env.example` to `.env` (repository root) if it does not already exist.

Run `.runtime/venv/bin/python scripts/configure-local.py` to privately fill SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in the root `.env` (key input is hidden). Never send the service key in chat or commit it. Keep the model checksum/version defaults. The launcher overrides MODEL_PATH with the correct local path.

```bash
./scripts/run-local.sh worker
```

Optional local API, in a second terminal:

```bash
./scripts/run-local.sh api
```

The worker remains foreground; Ctrl+C stops it. Only claim local readiness once the actual dependencies, model, connection and processing are verified.

## Windows worker
Everything stays inside the ignored `.runtime/` and `models/` folders; nothing is installed system-wide. From the repository root in PowerShell:

```powershell
py -3.12 -m venv .runtime\venv-win
.runtime\venv-win\Scripts\python.exe -m pip install torch==2.15.0 torchvision==0.29.2 --index-url https://download.pytorch.org/whl/cpu
.runtime\venv-win\Scripts\python.exe -m pip install -r backend\requirements.txt
# FFmpeg: extract https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip into .runtime\ffmpeg
#         (verify it against the published .sha256 first)
cd backend; ..\.runtime\venv-win\Scripts\python.exe -m nightwatch.fetch_model ..\models\yolo11n.pt; cd ..
powershell -ExecutionPolicy Bypass -File scripts\run-local.ps1          # worker (default)
powershell -ExecutionPolicy Bypass -File scripts\run-local.ps1 api      # optional local API
```

`fetch_model` refuses weights whose SHA-256 differs from the pinned value. The launcher sets `MODEL_PATH` to `models\yolo11n.pt` for its own process only, so `.env` keeps the Docker path. Queued jobs are processed only while the worker window stays open; any one worker (this PC or a teammate's Mac) is enough.

### Start everything on Windows
`powershell -ExecutionPolicy Bypass -File scripts\start-local.ps1` opens the API (http://127.0.0.1:8000) and the worker in their own windows, then waits for `/health`. With `API_URL=http://localhost:8000` in the root `.env`, the frontend (`cd frontend; npm run dev`) uses this local API, which always runs the current code. Switch `API_URL` back to the Render URL once Render is redeployed.

The worker uploads frame images in parallel, inserts frame rows in batches of 25 (only after their images are stored) and sends a heartbeat at most every 10 s: about 220 frames per minute on CPU, roughly 5× the former per-frame round-trip loop.

### Models, CPU and findings
Jobs choose a pinned model (`backend/nightwatch/models.py`): **YOLO11m** (default; most accurate, best in low light), YOLO11s or YOLO11n. The worker downloads official weights on first use into `models/` and refuses any file whose SHA-256 differs. Inference uses every CPU core (`INFERENCE_THREADS` in `.env` limits it). Every completed run stores **findings** (`backend/nightwatch/findings.py`): a headline (Humans found / Possible human / No humans found), when people were visible, best evidence frame, per-condition and per-object statistics. `scripts/backfill_findings.py` adds findings to older runs from their stored frames.
