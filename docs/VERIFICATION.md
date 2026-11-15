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

## Hosted smoke checks
Final Vercel deployment `dpl_CyBCD8rvWf3GzqdrZrRtPXEZm3JM` reached READY. Its build ran TypeScript checks, all 3 frontend tests, and Next.js production compilation. Public HTTPS checks passed: home 200; malformed device JSON 422; unknown device token 401; body over 4096 bytes 413; unauthenticated device registration POST 401. A preliminary GET to the POST-only registration proxy correctly returned 405; the follow-up POST verified authentication rejection. These requests created no device/event records.

All 73 source/config/documentation files were published to private `asoracca/nightwatch` through the GitHub connector. Commit `7be692b046a7a1c4a8652ded931aa85d7243af0a` contains the implementation. No GitHub Actions result is claimed here.

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

## Backend milestone update — later on 2026-11-15
Scope now excludes frontend replacement: a teammate will supply that separately.

A complete backend acceptance run passed against an isolated local Supabase Docker stack in the Linux verification environment (not on the user's Mac). All four migrations applied on startup. Two users signed up through Auth, then `python -m pytest tests/test_integration.py -q --tb=short` passed: **1 passed in 9.08 seconds**. The test used real sample footage and actual YOLO/ByteTrack, not model mocks.

Verified upload initialization, actual signed Storage upload, byte/hash/container validation, job enqueue, duplicate processing prevention, completed status, saved frames/tracks/investigation/experiment rows, signed frame retrieval, and second-user denial through API, direct REST and private Storage. Stored result: 40 condition-frames (20 clear + 20 fog), 136 accepted observations (85 clear + 51 fog), miss_rate NULL. This is public test footage, not real user or migrated legacy data.

The opt-in real-model test also passed over all four visibility conditions. See ML_VALIDATION.md for provenance, hashes, dependency refresh and audit qualifications. Fifty unit tests passed after web/explanation dependency updates; deployment verification continues.

Render repository access is connected. API/worker deployment configuration is prepared in render.yaml and Dockerfile, with CPU wheels and checksum-pinned model downloading. Hosted service deployment and its acceptance run are still pending. No frontend files were changed in this backend milestone.

## Hosted API deployment

Render deployed commit 87ae502 successfully. Public API: https://nightwatch-api-r7mk.onrender.com. GET /health returned HTTP 200. This is liveness evidence only; the hosted worker and authenticated hosted video acceptance are still pending. The Docker image also built successfully in the isolated test environment. The teammate's frontend remains unchanged.

## Local Mac verification — November 15, 2026

User selected no paid hosting. Paid Render worker was never submitted, and its declaration was removed from render.yaml. Project-local Python 3.11.18, FFmpeg/ffprobe 9.0.2 and pinned backend dependencies were installed on the Apple Silicon Mac. `pytest -m 'not integration' -q`: 50 passed, 2 deselected. `pytest tests/test_real_model.py -q` with actual OpenCV pedestrian footage and checksum-verified YOLO weights: 1 passed in 22.27 seconds, covering clear, low_light, fog and blurry. No model metrics were invented.

The local worker launcher correctly rejects missing Supabase keys. Local-to-hosted Supabase processing remains unverified until the owner fills backend/.env using scripts/configure-local.py. No worker daemon is currently running. The frontend remains unchanged.
