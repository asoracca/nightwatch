# Arduino sensor-event integration

MVP: **real sensor → authenticated HTTPS `/api/device-events` → Supabase → matched video result**. Arduino does not run YOLO, ByteTrack, PyTorch or LangChain.

## Hosted and local paths
- Hosted: Vercel `/api/device-events` proxies a bounded body to the Supabase `hardware` function. The function performs its own restricted-device authentication. Its gateway JWT check is disabled specifically because device tokens are not Supabase user JWTs; user-management routes independently validate Supabase sessions.
- Native Python: FastAPI also exposes `/api/device-events` with the same restrictions and database RPC. Its configuration remains server-only.
- Frontend Hardware panel registers/revokes devices, shows actual stored readings, and associates a selected video with a real recording start time.

## Device provisioning
1. Sign up/sign in as the video owner.
2. Register a device ID and descriptive label in the hardware panel. IDs are globally unique; collisions return 409.
3. Copy the one-time `nw_device_...` token to `arduino_secrets.h`, created locally from the example. Token contains 256 random bits. Only its SHA256 is stored server-side. It expires after 30 days and grants ingestion for exactly one device, not reads or model jobs.
4. Configure API_HOST to the actual deployed hostname, without scheme or path. Never use Supabase service keys on hardware or in the browser.
5. Revoke the device token from the UI if lost. For this MVP register a new device ID when replacing an expired/revoked token; in-place rotation is deferred.

## UNO WiFi Rev2
Open `hardware/uno_wifi_rev2/uno_wifi_rev2.ino` in Arduino IDE. Select UNO WiFi Rev2 / Arduino megaAVR Boards. Install official WiFiNINA, ArduinoHttpClient and Time libraries through Library Manager. The sketch has not been compiled/flashed or tested on physical hardware in this environment.

Connect a compatible PIR sensor signal to D2 and common ground, using the sensor's documented voltage/pin requirements. The example reads actual motion transitions only. It does not fabricate temperature or distance values. Add those fields only after wiring and reading actual sensors.

Update NINA firmware and install API_HOST's trusted root certificates using Arduino's firmware/certificate uploader. Do not bypass TLS validation. WiFi.getTime synchronizes UTC; events are withheld until a real clock is available. Serial output reports status/errors and never prints tokens or WiFi passwords.

Queue: three events in RAM, exact payload retained across retries, exponential retry to 60 seconds plus jitter on network/408/429/5xx. 401/403 blocks transmission until reprovisioning/reboot. Other 4xx reject that event. Queue overflow logs a dropped newest event. **Power loss loses pending RAM events**; persistent SD/FRAM queue support is a future hardware option. Distinct identical readings at the same timestamp are deduplicated; this sketch emits only rising motion edges.

## Event validation and matching
Payload fields: device_id, supported event_type, timezone-aware event_time, sensor_data. Supported types: motion_detected, distance_changed, temperature_reading, heartbeat. Sensor fields are distance_cm (0..100000), temperature_c (-100..200), motion (boolean). No unknown keys, nonfinite numbers, arbitrary owner IDs or device-selected linked_video_id. Maximum body 4096 bytes. Time accepted within seven days in the past and five minutes in the future.

Linking requires an owner-verified video, matching device owner, a known real recording_started_at, and validated duration. Half-open matching interval: `[recording_started_at, recording_started_at + duration)`. Exactly one overlapping same-owner/device interval links an event; zero or multiple matches remain unlinked. Events arriving before video association are reconciled later. Upload time is never substituted for capture time. Hardware evidence does not alter YOLO detections, confidence, or human review decisions.

## Camera-capable boards — separate future path
Nicla Vision has a 2 MP camera, WiFi/BLE and edge capabilities; Portenta Vision Shield offers camera/connectivity options for compatible Portenta boards. Those images should use a separately authenticated image-upload pipeline with its own validation and provenance. Camera upload/segmentation is **not implemented** by this sensor-event MVP. No image bytes are accepted by `/api/device-events`.

Official references:
- https://docs.arduino.cc/hardware/uno-wifi-rev2/
- https://github.com/arduino-libraries/WiFiNINA/blob/master/docs/api.md
- https://support.arduino.cc/hc/en-us/articles/360016119219-Upload-SSL-root-certificates
- https://docs.arduino.cc/hardware/nicla-vision/
- https://docs.arduino.cc/hardware/portenta-vision-shield/
