# Troubleshooting

| Symptom | Check |
|---|---|
| Cannot install dependencies | DNS/network access to package registries; use supported Node 22/Python 3.11. The authoring environment was network-restricted. |
| Missing frontend configuration | Set three NEXT_PUBLIC_* variables and restart Next.js; public env is embedded at build. |
| Signup requires confirmation | Confirm email; local config disables confirmation only for disposable development. |
| 401 | Refresh/sign in; verify matching Supabase URL and public anon key. |
| 404 for another user's video | Expected ownership isolation. Do not remove RLS. |
| 503 database/storage | Check keys, migration, network, and server logs; no signed URLs or credentials in reports. |
| Upload succeeds but verification fails | Check actual hash/size, container, duration <=120s, dimensions <=3840×2160, FFmpeg PATH. |
| Retrying uploaded bytes gets 400/409 | Select existing video and use Verify upload; signed uploads do not overwrite existing objects. |
| Job stays uploaded | Check worker heartbeat/service, credentials, and queued jobs. |
| Job stays processing after worker crash | Stop the old worker and explicitly mark the stale job failed with recovery script below; then click Reprocess explicitly. |
| No detections | Valid possible model outcome. Do not inject demo boxes or treat zero as evidence of absence. |
| No track IDs in some frames | ByteTrack may not assign IDs to unmatched observations; preserve nullable IDs. |
| No miss rate | Expected without verified ground truth; detection-count difference is not miss rate. |
| Missing model / checksum | Verify trusted local .pt file and configured SHA256; no auto-download at runtime. |
| Image/video expired | Reload the video to issue fresh private URLs. |
| Browser CORS error | FRONTEND_ORIGIN must exactly match protocol/host/port. |
| Docker cannot access Supabase | Use host.docker.internal:54321 in backend, localhost in browser. |

Interrupted job recovery, from backend directory with its environment loaded, only after stopping the old worker:

```bash
python ../scripts/recover_job.py JOB_UUID --confirm-worker-stopped
```

The command requires a processing job with a heartbeat older than ten minutes, marks it failed, and does **not** restart it. Reprocess explicitly in the UI after fixing the cause. Retain prior partial results for diagnosis. Storage garbage collection and orphan upload expiry are future operational work, not silent deletion tasks.
