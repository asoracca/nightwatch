# Real model validation — 2026-11-15

Ran actual FFmpeg, OpenCV 4.10.0.84, YOLO11n (Ultralytics 8.3.61), PyTorch 2.5.1 CPU, and ByteTrack in Linux/Python 3.11. No GPU, detector mocks, generated scenes, or fabricated detection counts were used.

Input: first 4 seconds of the real pedestrian sample from https://raw.githubusercontent.com/opencv/opencv/4.10.0/samples/data/vtest.avi, transcoded with FFmpeg to H.264 MP4. This is a clearly labelled public test fixture, not migrated user footage. No video or weights are committed, and no database records were created by this inference-only check.

Model source: https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11n.pt

Model SHA256: `0ebbc80d4a7680d14987a577cd21342b65ecfd94632bd9a8da63ae6417644ee1`

Test clip SHA256: `59c03de1b9f801f60f181bec106e4e01cdc71a54c7e60c3a792e8a955ff1b605`

Input: 768×576, 10 FPS, 4 seconds. Sampled at 5 FPS, resized preserving aspect ratio. Each condition has 20 frames.

| Condition | Observations >= .40 | Accepted observations >= .75 | Distinct assigned track IDs within condition |
|---|---:|---:|---:|
| clear | 113 | 85 | 9 |
| low_light | 114 | 81 | 8 |
| fog | 111 | 51 | 8 |
| blurry | 70 | 0 | 2 |

These counts measure repeated object observations and tracker IDs, not unique people or accuracy. Track IDs can fragment. No ground-truth miss rate, recall or safety conclusion is available. Blurry frames can retain review-band observations and tracks despite zero accepted observations.

An initial dependency install put two OpenCV distributions into the same cv2 namespace and failed without libGL. Requirements now pin one OpenCV distribution; the Docker image supplies its native libraries and uses CPU PyTorch wheels. The 50 existing backend unit tests passed after the correction.

Run the opt-in real model test from backend with TEST_VIDEO_PATH, MODEL_PATH and MODEL_SHA256 set:

```bash
python -m pytest tests/test_real_model.py -q
```

This verifies the media/model/tracker path. The separate `tests/test_integration.py` must still pass against the live API, worker and Supabase with two users before upload-to-database acceptance is claimed.

## Dependency refresh and repeat verification
The table above records the first successful inference run on the original model stack. Before deployment, the audit found vulnerabilities in the older web/explanation dependencies and PyTorch release. Backend pins were updated to FastAPI 0.163.0, Starlette 1.10.0, Pydantic 2.14.3, LangChain Core 1.8.0, LangSmith 0.14.17, pytest 9.2.0, PyTorch 2.15.0 CPU, torchvision 0.29.2 CPU, Ultralytics 8.4.213, OpenCV 5.0.0.93 and NumPy 2.4.6.

The ByteTrack constructor changed in the updated version: removed frame_rate and expressed the one-second retention buffer directly in sampled frames. Model version and pipeline version were updated so changed inference configurations cannot silently share old job keys. The real-model test passed again (1 passed, 14.30 seconds). Original counts above are not claimed as new-version results.

`pip-audit` found no known vulnerabilities among audited installed packages. It could not directly audit the `+cpu` torch/torchvision distributions; separate advisory queries for their matching base versions (2.15.0 and 0.29.2) also returned no known vulnerabilities. This is not a guarantee of absence.
