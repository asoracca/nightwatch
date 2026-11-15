# 🌙 NightWatch

> **When the lights go out, someone still needs to be found.** NightWatch is a small sensor-and-camera device that records the scene, and software that looks through each recording for people and explains how sure it is.

---

## Why NightWatch?

Picture a building that has partly collapsed at night. The power is out. Dust hangs in the air. Somewhere under the rubble, someone is waiting, too hurt or too tired to call out again.

Rescuers have flashlights, cameras and drones, and hours of footage come back that someone has to sit and watch. In the dark, in smoke, in fog, a person can look like a pile of clothes, and a pile of clothes can look like a person. Tired eyes miss things. A second look costs time nobody has.

**What if every clip came back with a note attached?** *"There's probably a person here, at 2 seconds in. The distance sensor agrees something is there. Look at this one first."*

That is what NightWatch is trying to do.

---

## ✨ What it does

🎥 **Records the scene with extra senses.** An Arduino UNO Q records short video clips. While it records, it also measures temperature, humidity, distance to the nearest object, and how much the device is moving or shaking.

🧠 **Looks for people and objects in every clip.** As soon as a clip lands in the cloud, NightWatch goes through it frame by frame and marks what it finds with boxes, labels and a confidence score.

🤝 **Checks the camera against the sensors.** A faint "maybe a person" from the camera means much more when the distance sensor also says *something is right there*. The sensors can't tell what an object is, but they help decide which camera hunches to trust.

🚨 **Flags what the camera might have missed.** If the distance sensor sees something but the camera recognised nothing, that clip is flagged as a possible miss, because that's exactly what goes wrong in the dark.

📝 **Explains itself in plain words.** Every result says why it was flagged, for example *"camera was moving, so blur may be lowering confidence"* or *"humidity reached 92%: fog likely"*.

📋 **Puts the most urgent clips first.** Each recording gets a verdict and a priority (high, medium, low), so a person reviewing the footage knows where to start.

🎞️ **Shows you what it saw.** You get a short annotated video and a still image for each moment it checked, with the boxes drawn and the sensor readings printed in the corner.

---

## 📖 How it works

```
 Arduino UNO Q + Modulino sensors
          │  5-second clip + one sensor reading per second
          ▼
      Supabase (cloud storage + database)
          │  NightWatch notices the new recording
          ▼
   Analysis on a computer (the "watcher")
          │  looks for people · checks against sensors · writes a verdict
          ▼
      Supabase again: verdict, explanations, annotated video
```

1. **The device records.** The UNO Q records a short clip (currently 5 seconds). Every second, it notes what each sensor reads, so second 3 of the video lines up with sensor reading number 3.
2. **The clip is uploaded.** The video goes into cloud storage, and a row describing it (when it was recorded, which device recorded it, the sensor readings) goes into the database.
3. **The watcher picks it up.** A program running on a computer checks for new recordings every 10 seconds. When one appears, it downloads the video.
4. **It looks at the video.** It takes 5 still frames from every second of video and runs each one through an object-recognition model. The model was trained to recognise 80 kinds of everyday things, including people. It also follows the same object from one frame to the next.
5. **It compares the camera with the sensors.** It combines what the camera saw with what the sensors measured during that same second (see below).
6. **It saves the results.** The annotated video, the annotated frames and a full write-up go back into the cloud, in a folder named after when the clip was recorded. Your computer keeps a copy too.

### How the sensors help

The sensors are three Modulino modules plugged into the QWIIC connector on the Arduino UNO Q:

| Sensor | What it measures | How NightWatch uses it |
|---|---|---|
| **Modulino Distance** | How far away the nearest thing is, straight ahead (in mm) | If the camera thinks it sees a person in the middle of the picture *and* the distance sensor confirms something is there, the camera's score gets a boost. If the sensor sees something but the camera sees nothing, the clip is flagged as a possible miss. A reading closer than 15 cm is treated as the sensor being blocked, not as a person. |
| **Modulino Movement** | How much the device is moving and vibrating | When the device is moving, the footage is probably blurry. Those seconds are marked as less reliable, and a low score is explained instead of trusted blindly. |
| **Modulino Thermo** | Temperature (°C) and humidity (%) | Very high humidity suggests fog or condensation, which explains why the camera might struggle. A temperature that climbs quickly or runs very hot suggests a heat source nearby, so the clip's priority goes up. |

### What the verdicts mean

| Verdict | In plain words | Priority |
|---|---|---|
| `person_confirmed` | Very likely a person, either because the camera is confident or because the sensors back up a weaker guess | 🔴 High |
| `person_possible` | The camera thinks it *might* be a person, but nothing confirms it. Worth a human look | 🟡 Medium |
| `object_unidentified` | The distance sensor found something the camera couldn't recognise. Possibly a miss in the dark | 🟡 Medium |
| `nothing_detected` | Nothing found by the camera or the sensors | 🟢 Low |

A clip with signs of heat moves up one priority level.

---

## 🌟 Impact

**For rescuers and reviewers:** NightWatch turns a pile of footage into a sorted list. The clips most likely to contain a person rise to the top, each with a reason. That means less time spent watching empty clips, and fewer quiet moments overlooked at 3 a.m.

**For the hard cases:** the clips that matter most are often the ones where the camera struggles. By flagging possible misses and explaining low confidence (blur, fog, a blocked sensor), NightWatch points people to exactly the footage they shouldn't skip.

**For trust:** NightWatch never claims more than it knows. Each verdict shows its evidence (which second, how confident, what the sensors said), so a person can check its work.

**What we've seen so far:** in our first real recordings from the UNO Q, taken in a dim lecture hall, NightWatch picked out people with confidence of up to 0.94 out of 1. It correctly reported "nothing detected" in clips that contained only chairs, and it noticed when the distance sensor was blocked.

> ⚠️ **Please read:** NightWatch is a research prototype. It is **not safety-certified** and **does not replace rescuers**. Results depend on the footage and the model. "Nothing detected" never proves that nobody is there. The sensor rules are sensible hints, not proven improvements: proving they help would take a set of recordings labelled by hand, which we don't have yet.

---

## 🛠️ What it's built with

| Part | Tools |
|---|---|
| **Device** | Arduino UNO Q with Modulino Thermo, Distance and Movement sensors over QWIIC. The recording code runs as an app in **Arduino App Lab** on the UNO Q |
| **Cloud** | [Supabase](https://supabase.com) for the database, private file storage and sign-in |
| **Analysis** | Python, [YOLO11n](https://docs.ultralytics.com) (object recognition), ByteTrack (following objects between frames), OpenCV and FFmpeg (video handling), PyTorch |
| **Web app** | [Next.js](https://nextjs.org) + TypeScript on [Vercel](https://vercel.com), with a [FastAPI](https://fastapi.tiangolo.com) server on [Render](https://render.com) |

### What's in this repository

```
backend/nightwatch/
  recordings.py     the watcher: finds new Arduino recordings, analyses them, uploads results
  fusion.py         the rules that combine camera results with sensor readings
  detector.py       object recognition and tracking
  video.py          reading videos and pulling out frames
  api.py            web API for the browser app (uploads, results, reviews)
  worker.py         background processing for videos uploaded through the web app
frontend/           the web app: upload footage, see detections, review flagged frames
supabase/           database tables, access rules and storage setup
hardware/           an earlier sketch for the Arduino UNO WiFi Rev2 (motion events only)
scripts/            setup and maintenance helpers
docs/               detailed guides
```

The web app also has a second way to use NightWatch: upload any video and see how detection holds up when the footage is artificially darkened, fogged or blurred.

---

## 🚀 Getting started

These steps run the watcher on a Mac with Apple Silicon (M1 or later).

### 1. Install everything

```bash
git clone https://github.com/asoracca/nightwatch.git
cd nightwatch
./scripts/setup-local-mac.sh
```

This installs Python, the analysis libraries and FFmpeg into a private `.runtime/` folder, and downloads the object-recognition model. Nothing is installed system-wide.

### 2. Connect to Supabase

```bash
.runtime/venv/bin/python scripts/configure-local.py
```

It asks for your Supabase project URL and two keys, found in the Supabase dashboard under **Project Settings → API Keys → Legacy API keys**: the `anon` key and the `service_role` key. They are saved privately to `backend/.env`, which is never committed.

Then add the name of the storage bucket the Arduino uploads to (ours is `videos`) to `backend/.env`:

```
RECORDINGS_BUCKET=videos
```

### 3. Set up the database

In the Supabase **SQL Editor**, run each file in `supabase/migrations/` that your project doesn't have yet, in order. For a project that already has the core tables, that means the `recording_results`, `sensor_fusion` and `result_folder_names` files.

### 4. Start watching

```bash
cd backend
../.runtime/venv/bin/python -m nightwatch.recordings --watch
```

Leave this running and keep the computer awake. Every new recording the Arduino uploads is analysed within about 20 seconds.

Other ways to run it:

```bash
../.runtime/venv/bin/python -m nightwatch.recordings --latest      # just the newest recording
../.runtime/venv/bin/python -m nightwatch.recordings --id <uuid>   # one specific recording
../.runtime/venv/bin/python -m nightwatch.recordings --latest --no-upload   # keep results on this computer only
```

### 5. See the results

- **On your computer:** `outputs/recordings/<time>_<id>/`. Open `annotated_clear.mp4` to watch the clip with boxes drawn on it, or read `result.json` for every number.
- **In Supabase:** the **`recording_results`** table holds one row per recording with its verdict, priority, reasons and sensor timeline. The annotated videos and frames are in the **`recording-results`** storage bucket.

Folders are named `<recording time in UTC>_<recording id>`, e.g. `20261115T074418Z_41516563-…`, in the same style as the Arduino's own video filenames.

### Running the web app

```bash
cd frontend
npm install
npm run dev
```

The web app needs its own settings and the API server. See [local setup](docs/LOCAL_SETUP.md).

---

## 🔒 Privacy and safety

- **Videos and results are stored privately.** Nobody can open them without signing in, and shared links expire after 15 minutes.
- **Access is enforced by the database, not just the app.** People using the web app can only see their own videos. Results for Arduino recordings are visible only to whoever is allowed to see the recording they came from.
- **Secret keys stay out of the code.** They live only in `backend/.env` and are never committed to Git or sent to the Arduino.
- **The explanations come from the stored results.** NightWatch writes its explanations from the recorded numbers using fixed rules. No AI chatbot writes them, and it never gives emergency instructions.

---

## 📚 More detail

[Local setup](docs/LOCAL_SETUP.md) · [Deployment](docs/DEPLOYMENT.md) · [API reference](docs/API.md) · [Arduino hardware](docs/HARDWARE.md) · [Model validation](docs/ML_VALIDATION.md) · [Troubleshooting](docs/TROUBLESHOOTING.md) · [Teammate setup](docs/TEAMMATE_SETUP.md)

**Licensing note:** the YOLO software and model are made by Ultralytics and come with their own license terms (AGPL or a commercial license). Check them before sharing or distributing NightWatch.

---

## 🌙 The point

Darkness, smoke and fog don't make people any less worth finding. They just make people harder to see.

**NightWatch is a second pair of eyes that doesn't get tired, and tells you honestly when it isn't sure.**
