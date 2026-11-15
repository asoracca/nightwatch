# Deployment — gated on local verification

The Supabase database and hardware Edge Function are deployed; the frontend is hosted on Vercel. Hosted video processing remains disabled. Complete the real-video API and browser acceptance tests before enabling that milestone. See VERIFICATION.md for actual evidence. The frontend lockfile is included.

## Supabase
Create a dedicated project. Inspect CLI help/version before linking/applying migrations (v3 has changed hosted targeting). Apply the reviewed initial migration through your established Supabase deployment workflow, and verify all application tables have RLS and both buckets are private. Run Supabase security advisors. Do not disable RLS to fix connectivity.

Configure Auth site URL and allowed redirects to the Vercel frontend. Enable email confirmation, configure email delivery, and create two test accounts. Put public URL/anon key in frontend environment, and service-role key only in backend and worker environment. Retain anon compatibility keys for this implementation; do not substitute a secret key into the browser.

## API and worker
Deploy the supplied Dockerfile to a long-running container host such as Render, Railway or a VM. Use two services from the same image: API (default CMD) and worker (`python -m nightwatch.worker`). Select hosting only after CPU/memory testing; no hosting account is configured here. Use HTTPS on the API, port 8000 internally, health path `/health`, one API process initially. Configure the exact Vercel origin for CORS.

Required environment: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, FRONTEND_ORIGIN, MODEL_PATH, MODEL_VERSION, MODEL_SHA256; optional MAX_VIDEO_BYTES and MAX_VIDEO_SECONDS within documented caps. Mount the pinned model read-only in the worker. Provide writable ephemeral `/tmp` and sufficient disk for decoded frames. Start with one worker; measure CPU/memory before increasing concurrency. Do not put inference on Vercel functions.

Set ingress request/connection limits and CPU/memory caps at the host. Do not log authorization headers, signed URLs or upstream bodies. Use isolated private logs and monitor failed jobs and stale heartbeats. Database backups and storage retention require an operator policy; no deletion policy is assumed.

## Vercel
Import the GitHub repository, choose **Root Directory: frontend**, framework Next.js. `frontend/vercel.json` supplies build configuration. Install Command is `npm ci`. Set the three NEXT_PUBLIC_* variables before building. API URL must be public HTTPS; no secret/server key belongs in browser variables. Add the actual frontend origin to backend CORS and Auth redirect configuration.

## Acceptance / rollback
Repeat the real-video and second-user isolation tests on staging. Confirm private Storage denies a second user, frame overlays align with images, and failed uploads are explicit. Promote only after evidence is recorded. Roll back the frontend/API image if necessary; preserve all real data and legacy Databricks assets. This is a research prototype and is not approved for real emergency deployment.
