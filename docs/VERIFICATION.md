# Verification record — 2026-11-15

**The full real-video milestone is NOT complete. No end-to-end inference success is claimed.**

## Implemented files
Frontend Next.js app and hardware panel/proxy; Python API, worker, detector, tracker and deterministic investigation report; four SQL migrations and RLS tests; Supabase hardware Edge Function; UNO WiFi Rev2 sketch and secrets template; deployment/CI configs; API/setup/demo/hardware guides. No videos, model weights or secret files are tracked.

## Commands and checks actually run
| Check | Result |
|---|---|
| Local `python3 -m unittest discover -s tests -p '*stdlib.py' -v` from backend | 17 passed |
| Isolated Linux, Python 3.11: `python -m pytest -m 'not integration' -q` | 50 passed, 1 integration test deselected |
| Node 22 `npm run typecheck` | Passed |
| `npm test` | 3 passed |
| `npm run build`, Next.js 16.4.6 | Passed in isolated build environment |
| `npm audit` after dependency updates | 0 vulnerabilities reported; lockfile included |
| Supabase four migrations | Applied successfully |
| SQL isolation/lifecycle and device_events suites | Passed in rollback transactions; no fixtures retained |
| Supabase security advisor | No findings |
| Live row counts: videos, video_frames, devices, device_events | Each 0; no legacy/demo records imported |

Python tests used FastAPI 0.115.6, HTTPX 0.28.1, Pydantic 2.10.4, pydantic-settings 2.7.0, pytest 8.3.4 and langchain-core 0.3.29. Unit inference doubles are not detection evidence. Local package installation initially failed due to DNS; tests/builds were therefore run in an isolated Vercel sandbox. The Vercel build initially exposed React test failures under NODE_ENV=production; its build command now uses NODE_ENV=test only for the test subprocess.

Database tests verify UUID ownership/admin policy, job lifecycle, device token hash privilege, duplicate retries across client representations, revocation, timestamp boundaries, late linking, overlap ambiguity and cross-user denial. SQL fixtures are explicitly synthetic tests inside rolled-back transactions, never migrated data.

## Deployed resources
- Frontend: https://nightwatch-anggunsoracca.vercel.app
- Repository: https://github.com/asoracca/nightwatch
- Supabase: https://supabase.com/dashboard/project/sgbpmqfbwqmysvuhiabz
- Hardware ingress: `POST https://nightwatch-anggunsoracca.vercel.app/api/device-events`
- Supabase hardware function deployed with its own restricted-token/user-JWT validation. Service credentials stay in the function runtime.

## Required environment
Frontend: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY; HARDWARE_FUNCTION_URL on the server. NEXT_PUBLIC_API_URL remains unset until a hosted Python service exists; upload controls are deliberately disabled in this hosted deployment.
Backend/worker: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, FRONTEND_ORIGIN, MODEL_PATH, MODEL_VERSION, MODEL_SHA256. See .env.example. Arduino uses Wi-Fi credentials, public API hostname and its own short-lived restricted token; no Supabase service key.

## Remaining blockers
- Python API and durable video worker are not hosted. No suitable long-running backend host is connected/configured.
- Actual FFmpeg → YOLO/PyTorch → ByteTrack → Supabase → browser acceptance remains unrun. Requires approved real video, pinned weights/checksum, running worker, and two test users.
- Hosted Auth site URL/email redirects and email delivery need operational verification.
- Arduino firmware has not been compiled, flashed or tested against physical hardware; TLS certificate provisioning and sensor wiring remain required.
- Camera image upload, SAM, fine-tuning and annotated accuracy evaluation are deferred.
- The complete flow has not passed locally. A successful frontend build or SQL test is not a substitute.
