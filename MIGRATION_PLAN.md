# NightWatch implementation and migration plan

## Inspection baseline
This is a new project. The provided workspace was empty and contained no Git repository. No existing frontend, routes, upload flow, backend, database, Databricks schema, detector, deployment configuration, environment files, tests, or README were available to inspect. No old implementation is inferred.

## 1. What is being migrated
Only the supplied product requirements. Legacy Databricks notebooks, table names, field mappings, real row counts, and experiment provenance are unknown. Data import is blocked until source exports are verified and the new end-to-end flow passes.

## 2. What is being replaced
Databricks runtime responsibilities are implemented by Supabase Auth/Postgres/private Storage, a Next.js frontend, and a separate Python FastAPI API plus durable polling worker. No Databricks SDK or runtime dependency.

## 3. What is preserved
Prototype evaluation positioning, confidence evidence, timestamps, review decisions, model provenance, and intended visibility comparisons. Preserve all external Databricks assets unchanged. No fabricated/demo records are imported.

## 4. New Supabase schema
Profiles reference auth.users. Videos belong to authenticated UUIDs, retain display identity, and store upload hash and lifecycle. Frames and investigations inherit access through videos. Experiments have explicit owner IDs. Jobs have configuration hashes and durable status. Reviews are append-only decisions with reviewer UUIDs. Admin rights come only from server-controlled app_metadata. Private video/frame buckets are owner-readable; only the API/worker writes derived results.

## 5. New API routes
Supabase Auth handles signup/login/logout/refresh. FastAPI exposes /videos/upload-init, /videos/{id}/upload-complete, /videos, /videos/{id}, /videos/{id}/process, /videos/{id}/status, /videos/{id}/frames, /videos/{id}/investigation, /frames/{id}/reviews, /experiments, and /videos/{id}/assistant. /docs provides generated OpenAPI. Every data route validates the bearer session using Supabase Auth and enforces ownership; UUIDs never come from email.

## 6. Processing workflow
Authenticated upload reservation → private signed upload → server validates actual size/hash/container → uploaded → transactional unique job enqueue → worker claims using SKIP LOCKED → processing → FFmpeg 5 FPS samples → per-condition YOLO and independent ByteTrack state → persisted frame images and results → factual aggregation → completed. Failures set failed with sanitized errors. Explicit reprocessing creates a new attempt; ordinary retries return the existing job. Detection runs down to 0.40 to retain review candidates; accepted detections are >=0.75. CPU default. Miss rate remains NULL without ground truth; detection loss against clear is not recall or miss rate.

## 7. Deployment plan
Verify locally first. Next.js on Vercel; Docker-based API and worker on a long-running container host, sharing Supabase and a pinned model file. Do not put video inference in a Vercel request. Supabase migration creates RLS and private buckets. Environment-only secrets, frontend only public URL and anon key. Deployment is blocked until real flow and isolation tests pass.

## 8. Risks and unresolved questions
Supabase project credentials, Docker/FFmpeg/Node availability, hosting account, real consented test clip, model weights and license choice are unresolved. YOLO weights must be pinned by checksum. CPU time, maximum duration/resolution, upload bandwidth, container resource limits, tracker identity switches, synthetic visibility realism, and unknown ground truth limit conclusions. SAM is deferred. LangChain explanation is deterministic and evidence-only, with no free-form emergency advice. No claim of safety certification or accident prevention.
