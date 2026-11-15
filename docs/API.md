# API contract

FastAPI's `/openapi.json` and `/docs` are authoritative request schemas. All data routes require `Authorization: Bearer <Supabase access token>`. Auth is validated server-side using `/auth/v1/user`. Unauthorized is 401; another user's or absent resource is 404; invalid input is 422; unverified upload is 409; rate limit is 429; storage/database failures are sanitized 503. The prototype limits each authenticated user to 120 requests/minute in one API process. Supabase handles its own auth rate limits. Before scaling API replicas use a shared limiter and ingress upload/time limits.

## Authentication (Supabase Auth, not duplicated in Python)
| Operation | Supabase route / browser client |
|---|---|
| Signup | POST `/auth/v1/signup` / `auth.signUp` |
| Login | POST `/auth/v1/token?grant_type=password` / `auth.signInWithPassword` |
| Refresh | POST `/auth/v1/token?grant_type=refresh_token` / SDK auto-refresh |
| Logout | POST `/auth/v1/logout` / `auth.signOut` |
| Validate user | GET `/auth/v1/user` |

Auth calls require the public anon key in `apikey`. Signups may require email confirmation on hosted Supabase. Anon key is not permission to read another user's records.

## Application routes
| Method | Path | Request / response |
|---|---|---|
| GET | `/health` | Public process liveness; not a database/model readiness assertion |
| POST | `/videos/upload-init` | filename, content_type, size_bytes, sha256, use_case → video, duplicate, upload_url |
| PUT | returned signed upload URL | Raw video bytes, Content-Type; no overwrite/upsert |
| POST | `/videos/{id}/upload-complete` | `{}` → validates actual bytes/hash/container/duration/dimensions, marks upload_verified |
| GET | `/videos?offset=0` | Logged-in user's videos, pages of 100 |
| GET | `/videos/{id}` | Owned video metadata + 15-minute playback URL |
| POST | `/videos/{id}/process` | sampling_fps=5, threshold=.75, review_floor=.40, conditions=[clear], reprocess=false → durable job |
| GET | `/videos/{id}/status` | Video state and latest job; queued jobs leave video uploaded |
| GET | `/videos/{id}/frames` | condition=clear, review_only=false, offset=0; pages of 50, latest attempt only, signed frame URLs |
| GET | `/videos/{id}/investigation` | Latest completed attempt summary or null while pending/failed |
| POST | `/frames/{id}/reviews` | decision=confirmed or dismissed, optional note → append-only audit + current review status |
| GET | `/experiments?offset=0` | RLS-filtered experiment metrics, pages of 100 |
| POST | `/videos/{id}/assistant` | topic=summary/flags/comparison → deterministic report, stored metrics, citations |

## Result schema
A detection contains class_id, label, confidence (0–1), bbox (normalized [x1,y1,x2,y2]), nullable track_id, and accepted. Tracking contains track_id, detection_index and normalized bbox. Unmatched detections are retained. Coordinates apply to the stored resized condition-frame. Sample number is zero-based; timestamp_seconds is the sample timeline. FPS is capped at source FPS. The review band is inclusive of floor and exclusive of accepted threshold. Human review does not rewrite confidence or detections.

Video totals include each condition-frame separately. Mean confidence considers only accepted observations. `miss_rate=null` without ground truth. Experiments record requested/effective sampling FPS, thresholds, per-condition counts and model checksum. No person counts, recall, mAP or tracking accuracy are inferred without annotations.

## Job lifecycle
Unique owner/content hash prevents duplicate uploads. Unique job keys hash video ID, model version/checksum and configuration. `enqueue_job` locks the video and permits only one active job. Normal calls always return the latest existing job even when configuration changes. Explicit reprocessing creates a new attempt after the active job finishes. Old results remain auditable; UI shows only the newest attempt. Partial rows from a failed job are not presented as a completed investigation.

Worker heartbeats are stored. A killed worker leaves an interrupted processing job; recovery is explicit (see troubleshooting), never automatic duplicate processing. Signed URLs are capabilities: ownership is checked when issued, and their holder can read until expiry.


## Arduino events
See HARDWARE.md. `POST /api/device-events` takes a restricted device bearer token, not a Supabase user token. The payload is bounded to 4096 bytes and contains device_id, event_type, event_time, sensor_data. Returns event ID, duplicate flag and nullable linked_video_id. Retries are deduplicated by database-derived canonical payload identity across hosted and Python ingestion paths. At most 60 new events per device/minute; duplicates reuse the stored row. Device tokens expire after 30 days and can be revoked. No read access is granted to a device.

Authenticated management: `POST /api/devices` (one-time token), `GET /api/devices`, `POST /api/devices/{id}/revoke`, `POST /videos/{id}/device-link`, `GET /videos/{id}/device-events`. Hosted frontend management proxies `/api/hardware/devices` and `/api/hardware/videos/{id}/device-link` to the Supabase hardware function; event/device reads use the caller's Supabase JWT and RLS directly.
