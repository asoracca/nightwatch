# Hackathon demo (local acceptance first)

1. Start local Supabase, API, worker and frontend. Confirm model checksum and /health. Sign up as user A.
2. Upload a consented 2–5 second real MP4 with a moving person/vehicle. Show upload progress and processing state. CPU processing may take several minutes, especially four conditions.
3. Show the original video, sample timestamp, model-reported boxes/confidence, and ByteTrack IDs where assigned. Never add detections for demo appeal.
4. Switch between clear, low_light, fog and blurry at the same sample. Explain that synthetic transforms do not cover all real smoke/water/disaster conditions.
5. Open pending reviews and confirm/dismiss a candidate if one exists. If none were flagged, say so; do not manufacture one.
6. Show the investigation table and evidence-only report. Explain that counts are observations, miss rate is unknown without ground truth, and track IDs are condition-local.
7. Upload the same bytes again: existing video/job should be returned, not processed twice. Use explicit reprocess only when demonstrating a new run.
8. Sign in as user B in a separate private browser. Verify A's video list is absent; API and direct database/storage access must be denied. Run the automated isolation test too.
9. Close with: “NightWatch is a prototype evaluation tool. It is not safety-certified, does not replace rescuers, and its results depend on the uploaded footage and model.”

Demo readiness requires all steps to work with real outputs. Current implementation has not met that acceptance gate in the authoring environment. No Databricks records were copied and no live deployment is claimed.
