# Backend integration for the teammate's frontend

The existing frontend is being replaced separately. These routes are frontend-framework independent. API base: https://nightwatch-api-r7mk.onrender.com. The API is live; the hosted processing worker is pending approval and deployment. Do not start hosted processing until the worker is verified. Do not use the Vercel URL as the Python API base.

1. Authenticate with Supabase using its public URL and anon key. Retain the session access token; send `Authorization: Bearer <access_token>` to the Python API. Refresh sessions through Supabase. Never put the service-role key in frontend code.
2. Compute the selected file's SHA256. POST `/videos/upload-init` with `filename`, `content_type`, `size_bytes`, `sha256`, and `use_case`. Limits: 50 MiB and 120 seconds; MP4, MOV or WebM. The backend validates the real bytes/container.
3. PUT the actual bytes to the returned `upload_url`, setting the video's Content-Type. Use XHR upload progress if needed. A duplicate response may have a null upload_url; do not upload again then.
4. POST `/videos/{id}/upload-complete`. Only proceed after success.
5. POST `/videos/{id}/process` with `{"conditions":["clear","low_light","fog","blurry"]}`. Defaults are 5 FPS, threshold .75, review floor .40. Retrying returns the existing job. Only send `reprocess:true` after an explicit user reprocessing request.
6. Poll GET `/videos/{id}/status` every 3–5 seconds. Stop on completed/failed. Show returned sanitized errors; don't spin indefinitely.
7. GET `/videos/{id}` for a short-lived playback_url. GET `/videos/{id}/frames?condition=clear&offset=0` for up to 50 frames. Increment offset by 50 until an empty page. Fetch each selected visibility condition independently.
8. Each frame has timestamp_seconds, frame_number (sample sequence), image_url, detections_json and tracking_json. Boxes use normalized `[x1,y1,x2,y2]`: multiply x by the displayed image width and y by its height. Account for letterboxing. Confidence is 0..1. A null track_id means no assigned track; IDs are scoped to condition/job, not global identities.
9. GET `/videos/{id}/investigation` after completion for stored aggregates. `miss_rate:null` means unmeasured, never zero. Counts are observations over frames, not unique people. No-detection results do not establish absence.
10. Use GET `/videos` for the owner's list, `/experiments` for metrics, and `/videos/{id}/frames?review_only=true` for pending review frames. POST `/frames/{id}/reviews` with a supported decision from `/openapi.json`.

OpenAPI: GET `/openapi.json`; interactive API docs: `/docs`. Backend CORS must use your frontend's exact origin via FRONTEND_ORIGIN. Send errors 401 to sign-in, 404 to an unavailable state, 409 to a workflow conflict state, 422 to a validation state, and 429/503 to bounded retries. Never log bearer tokens or signed media URLs.

Device ingestion remains `POST /api/device-events` with its own device token. User device registration is `POST /api/devices`; the video/device association uses a real capture start time. See API.md and HARDWARE.md.

Prototype evaluation • Not safety-certified • Does not replace rescuers • Results depend on the uploaded footage and model.
