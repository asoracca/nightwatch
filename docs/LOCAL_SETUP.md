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

Copy `.env.example` to `backend/.env`; insert the local anon and service-role keys from `supabase status` privately. With native Python use `http://127.0.0.1:54321`. With Docker Compose use `http://host.docker.internal:54321` for the backend URL. Browser env always uses `http://127.0.0.1:54321`.

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
Create `frontend/.env.local` with only:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_LOCAL_ANON_KEY
NEXT_PUBLIC_API_URL=http://localhost:8000
```

From `frontend/`:

```bash
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

Commit the generated package-lock.json after reviewing it, then use `npm ci` for subsequent installs. Never place the service-role key in `NEXT_PUBLIC_*`.

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
