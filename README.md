# NightWatch

Computer-vision **prototype evaluation** of detection and tracking under poor visibility.
**Not safety-certified. Does not replace rescuers. Results depend on the uploaded footage and model.**

## Status
Supabase schema and authenticated Arduino event service are deployed. The Next.js frontend is deployed on Vercel; validation and dependency updates are recorded in [verification](docs/VERIFICATION.md). **Hosted video inference remains disabled until the Python API/worker is deployed and verified.** Source repository: https://github.com/asoracca/nightwatch. No legacy data has been copied.

Hardware integration: [Arduino setup and protocol](docs/HARDWARE.md). The UNO WiFi Rev2 sketch sends real motion events over TLS using a restricted, expiring device token. Camera-board image ingestion remains a separate future feature.

## Stack and structure
- `frontend/`: Next.js App Router, React, Supabase browser auth, upload progress, private playback, overlays, review queue, comparisons.
- `backend/nightwatch/`: FastAPI, authenticated API, polling worker, FFmpeg/OpenCV, YOLO11n/PyTorch, ByteTrack, deterministic LangChain report.
- `supabase/`: migrations, RLS, private buckets, transactional job functions and isolation tests.
- `docs/`: API, development, deployment, teammate, troubleshooting and hackathon demo guides.
- `scripts/`: checksum verification and explicit recovery of interrupted jobs.

## Start here
1. Follow [local setup](docs/LOCAL_SETUP.md), using two disposable users and a short real video.
2. Run unit, database, API integration and browser tests.
3. Follow [deployment](docs/DEPLOYMENT.md) only after the complete local flow passes.
4. Use [teammate setup](docs/TEAMMATE_SETUP.md) to clone and contribute.

## Evaluation semantics
Defaults: 5 sampled FPS, CPU, accepted confidence >=0.75, review band >=0.40 and <0.75. Detection inference retains review-band observations; accepted counts exclude them. Tracks may be unassigned; IDs are scoped to job and visibility condition and must not be equated across variants. Frame numbers refer to the sampled sequence and timestamps to the FFmpeg sample timeline. All four variants use the same sampling schedule.

Counts mean object observations per condition-frame, not unique people. **Miss rate is NULL without annotated ground truth.** Clear-versus-degraded counts are descriptive, not measured recall. An all-empty result is valid and does not establish absence. The use case comes from the uploader; the system does not infer which disaster is most affected.

Jobs are idempotent across retries. Even a changed configuration does not reprocess an existing video unless `reprocess=true`. Uploaded bytes are SHA256 checked; duplicate hashes are isolated per user. Model weights must exist locally and match a configured SHA256. No model or video files are committed.

## Explanation and segmentation
The optional report endpoint uses a LangChain RunnableLambda, **without an LLM or API key**. It returns stored aggregates plus citations to up to ten flagged frames, including timestamp, model, confidence and stored review reason. It does not answer arbitrary prompts or provide emergency instructions. SAM is deliberately deferred until a segmentation requirement is established.

## Auth/security
Supabase handles signup/login/logout/refresh. API authentication checks the token against Supabase Auth. Reads use the caller JWT and RLS. Mutations use a server-only key after ownership checks. Email and username are display fields only. Admin rights must be set by a trusted administrator in app_metadata, never user_metadata. Private signed media URLs expire after 15 minutes; anyone holding a URL can use it until expiry, so do not share or log them. Service keys and signed URLs never belong in Git.

## Documentation
[API](docs/API.md) · [Local setup](docs/LOCAL_SETUP.md) · [Deployment](docs/DEPLOYMENT.md) · [Troubleshooting](docs/TROUBLESHOOTING.md) · [Demo](docs/DEMO.md) · [Migration plan](MIGRATION_PLAN.md) · [Migration report](MIGRATION_REPORT.md)

## Dependency and model licensing
Direct dependency versions are pinned. The frontend npm lockfile is included; npm audit reported zero vulnerabilities on 2026-11-15. Re-audit dependencies before subsequent releases. Ultralytics software/weights licensing (AGPL or commercial terms as applicable) must be reviewed for your intended distribution. No fine-tuning or ground-truth accuracy evaluation is claimed. PyTorch currently supplies real model inference and stored per-run evaluation observations.
