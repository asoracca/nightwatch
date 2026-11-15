"""Sensor-assisted detection: distance, movement and thermal readings adjust the scores that YOLO hands to
ByteTrack. Standard library only.

ByteTrack decides from detection scores alone (high/low matching passes, new-track threshold). Here, a person
detection that the sensors corroborate gets a bounded boost before tracking, so weak but corroborated
detections can start or keep a track, and count as accepted or review candidates. Rules:

  distance (Modulino Distance / ultrasonic) -- object 150-1300 mm away and the box overlaps the beam at the
                                              frame centre                                    +0.15
  movement: scene motion (PIR, linked device events)                                          +0.10
  movement: camera moving (accelerometer) -- expect motion blur, compensate                   +0.05
  thermal:  humidity >= 90 % -- fog/condensation expected, compensate                          +0.05
  thermal:  temperature rose >= 2 C since the clip started -- possible heat source nearby      +0.05

Boosts apply to 'person' only and are capped at +0.25 in total. The raw model confidence is always preserved
next to the fused score, with the reasons, so every adjustment stays auditable. These weights are heuristics,
not calibrated accuracy: no ground truth yet shows they improve recall or precision.
"""
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from .fusion import (CORROBORATION_BOOST, DISTANCE_MAX_MM, HEAT_RISE_C, HIGH_HUMIDITY_PCT,
                     OBSTRUCTION_MM, _central)

VERSION = 'sensor-assist-v1'
SCENE_MOTION_BOOST = 0.10
CAMERA_SHAKE_BOOST = 0.05
HUMIDITY_BOOST = 0.05
HEAT_BOOST = 0.05
MAX_BOOST = 0.25
MIN_MODEL_CONF = 0.10        # never ask YOLO for candidates below this
EVENT_WINDOW_S = 2.0         # a device event applies to video seconds within this distance


@dataclass(frozen=True)
class SensorReading:
    distance_mm: Optional[float] = None
    scene_motion: Optional[bool] = None
    camera_moving: Optional[bool] = None
    humidity_pct: Optional[float] = None
    heat_rising: Optional[bool] = None

    def any(self):
        return any(v is not None for v in (self.distance_mm, self.scene_motion, self.camera_moving,
                                           self.humidity_pct, self.heat_rising))


def model_floor(review_floor, assisted):
    """Lowest model confidence to request: lower with sensors so corroborated weak candidates can be rescued."""
    return max(MIN_MODEL_CONF, review_floor - MAX_BOOST) if assisted else review_floor


def assist(label, confidence, bbox, reading):
    """Return (fused_confidence, reasons) for one detection."""
    if reading is None or label != 'person':
        return confidence, []
    boost, reasons = 0.0, []
    d = reading.distance_mm
    if d is not None and OBSTRUCTION_MM <= d <= DISTANCE_MAX_MM and _central(bbox):
        boost += CORROBORATION_BOOST
        reasons.append(f'distance sensor: object at {d:.0f} mm in the beam area (+{CORROBORATION_BOOST:.2f})')
    if reading.scene_motion:
        boost += SCENE_MOTION_BOOST
        reasons.append(f'motion sensor: movement in the scene (+{SCENE_MOTION_BOOST:.2f})')
    if reading.camera_moving:
        boost += CAMERA_SHAKE_BOOST
        reasons.append(f'camera moving: motion-blur compensation (+{CAMERA_SHAKE_BOOST:.2f})')
    if reading.humidity_pct is not None and reading.humidity_pct >= HIGH_HUMIDITY_PCT:
        boost += HUMIDITY_BOOST
        reasons.append(f'humidity {reading.humidity_pct:.0f}%: fog compensation (+{HUMIDITY_BOOST:.2f})')
    if reading.heat_rising:
        boost += HEAT_BOOST
        reasons.append(f'temperature rising: possible heat source (+{HEAT_BOOST:.2f})')
    boost = min(boost, MAX_BOOST)
    return round(min(1.0, confidence + boost), 4), reasons


def readings_from_timeline(timeline):
    """Arduino recordings: one reading per second from fusion.sensor_timeline()."""
    temps = [r['temp_c'] for r in timeline if r.get('temp_c') is not None]
    first = temps[0] if temps else None
    out = []
    for r in timeline:
        t = r.get('temp_c')
        out.append(SensorReading(
            distance_mm=r.get('distance_mm'),
            camera_moving=r.get('camera_moving'),
            humidity_pct=r.get('humidity_pct'),
            heat_rising=None if t is None or first is None else (t - first) >= HEAT_RISE_C,
        ))
    return out


def _time(value):
    return datetime.fromisoformat(str(value).replace('Z', '+00:00'))


def readings_from_events(events, recording_started_at, duration_seconds):
    """Uploads linked to a device: nearest event within EVENT_WINDOW_S of each video second.
    Device events carry distance_cm, temperature_c and a PIR motion flag."""
    seconds = max(1, int(duration_seconds) + 1)
    if not events or not recording_started_at:
        return [None] * seconds
    start = _time(recording_started_at)
    placed = []
    for e in events:
        data = e.get('sensor_data_json') or {}
        placed.append(((_time(e['event_time']) - start).total_seconds(), data))
    temps = sorted((t, d['temperature_c']) for t, d in placed if d.get('temperature_c') is not None)
    first_temp = temps[0][1] if temps else None
    out = []
    for second in range(seconds):
        near = [(abs(t - second), d) for t, d in placed if abs(t - second) <= EVENT_WINDOW_S]
        if not near:
            out.append(None)
            continue
        near.sort(key=lambda item: item[0])
        pick = lambda key: next((d[key] for _, d in near if d.get(key) is not None), None)
        cm, temp, motion = pick('distance_cm'), pick('temperature_c'), pick('motion')
        reading = SensorReading(
            distance_mm=None if cm is None else cm * 10,
            scene_motion=motion,
            heat_rising=None if temp is None or first_temp is None else (temp - first_temp) >= HEAT_RISE_C,
        )
        out.append(reading if reading.any() else None)
    return out


def reading_at(readings, timestamp):
    """Reading for a sampled frame timestamp, or None."""
    if not readings:
        return None
    index = int(timestamp)
    return readings[index] if 0 <= index < len(readings) else None
