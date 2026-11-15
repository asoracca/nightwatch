"""Rules-based fusion of Arduino Modulino sensor readings with YOLO detections. Standard library only.

Sensors arrive as one value per second of video (index i = second i):
  temp (deg C) and humidity (%)  -> Modulino Thermo
  distance (mm)                  -> Modulino Distance (time-of-flight, narrow beam at the frame centre)
  accel_mean, vibration (mm/s^2) -> Modulino Movement

The sensors cannot say *what* an object is. They are used to (a) corroborate weak person
detections, (b) flag likely camera misses, (c) explain low confidence (motion, humidity),
and (d) raise review priority on environmental hazards. These are heuristics, not measured
accuracy: no ground truth exists yet to prove they improve recall or precision.
"""
import json
import math

FUSION_VERSION = 'rules-v2'  # v2: sensors also adjust scores before ByteTrack (sensor_assist.py)  # bump when rules change; the watcher then reprocesses recent recordings

# Modulino Distance: readings beyond ~1300 mm are unreliable. Below ~150 mm the beam is most likely
# blocked (hand, debris, lens cover) rather than seeing a person.
DISTANCE_MAX_MM = 1300
OBSTRUCTION_MM = 150
# Modulino Movement: above this the camera is treated as moving (500 mm/s^2 ~= 0.05 g).
MOVING_ACCEL_MM_S2 = 500
MOVING_VIBRATION_MM_S2 = 500
# Modulino Thermo
HIGH_HUMIDITY_PCT = 90       # fog/condensation likely, camera confidence expected to drop
HEAT_RISE_C = 2.0            # rise within one clip suggests a nearby heat source
HIGH_TEMP_C = 45
# Fusion
CORROBORATION_BOOST = 0.15   # added to a person score when the distance beam confirms an object there
CENTRE = (0.35, 0.65)        # normalized region the narrow distance beam roughly covers

SENSORS = {'temp': 'temp_c', 'humidity': 'humidity_pct', 'distance': 'distance_mm',
           'accel_mean': 'accel_mean_mm_s2', 'vibration': 'vibration_mm_s2'}
VERDICTS = ('person_confirmed', 'person_possible', 'object_unidentified', 'nothing_detected')


def _series(value):
    """Accept a JSON array (or its text form); keep finite numbers, everything else becomes None."""
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except ValueError:
            return []
    if not isinstance(value, list):
        return []
    return [float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) else None
            for v in value]


def sensor_timeline(rec, duration_seconds):
    """One entry per second of video with raw readings and derived flags (None = no reading)."""
    series = {name: _series(rec.get(column)) for column, name in SENSORS.items()}
    timeline = []
    for i in range(max(1, math.ceil(duration_seconds))):
        r = {'second': i, **{name: (s[i] if i < len(s) else None) for name, s in series.items()}}
        d = r['distance_mm']
        r['obstructed'] = None if d is None else d < OBSTRUCTION_MM
        r['object_in_range'] = None if d is None else OBSTRUCTION_MM <= d <= DISTANCE_MAX_MM
        a, v = r['accel_mean_mm_s2'], r['vibration_mm_s2']
        r['camera_moving'] = None if a is None and v is None else \
            (a or 0) > MOVING_ACCEL_MM_S2 or (v or 0) > MOVING_VIBRATION_MM_S2
        timeline.append(r)
    return timeline


def hud_text(r):
    """Short overlay for annotated frames, e.g. 'dist 850mm  MOVING  25.9C 28%'."""
    if r is None:
        return ''
    parts = []
    if r['distance_mm'] is not None:
        parts.append(f"dist {r['distance_mm']:.0f}mm" + (' BLOCKED' if r['obstructed'] else ''))
    if r['camera_moving']:
        parts.append('MOVING')
    if r['temp_c'] is not None:
        parts.append(f"{r['temp_c']:.1f}C")
    if r['humidity_pct'] is not None:
        parts.append(f"{r['humidity_pct']:.0f}%RH")
    return '  '.join(parts)


def _central(bbox):
    x1, y1, x2, y2 = bbox
    lo, hi = CENTRE
    return x1 < hi and x2 > lo and y1 < hi and y2 > lo


def _seconds(values):
    return ', '.join(f'{s}s' for s in values)


def fuse(timeline, frames, threshold, review_floor):
    """Combine the sensor timeline with detections on the original footage ('clear' condition)."""
    secs = {r['second']: {**r, 'any_detection': False, 'yolo_person': None,
                          'person_score': None, 'corroborated': False} for r in timeline}
    for f in frames:
        if f['visibility_condition'] != 'clear':  # synthetic degradations are not what the sensors saw
            continue
        sec = secs.get(int(f['timestamp_seconds']))
        if sec is None:
            continue
        if any((d.get('fused_confidence') or d['confidence']) >= review_floor for d in f['detections_json']):
            sec['any_detection'] = True
        for d in f['detections_json']:
            if d['label'] != 'person':
                continue
            if d.get('fused_confidence') is not None:
                # Already sensor-adjusted before tracking (sensor_assist.py); do not boost twice.
                corroborated = any(r.startswith('distance sensor') for r in d.get('sensor_reasons', []))
                score = d['fused_confidence']
            else:
                corroborated = sec['object_in_range'] is True and _central(d['bbox'])
                score = min(1.0, d['confidence'] + CORROBORATION_BOOST) if corroborated else d['confidence']
            if sec['person_score'] is None or score > sec['person_score']:
                sec.update(person_score=round(score, 4), yolo_person=round(d['confidence'], 4),
                           corroborated=corroborated)
    secs = list(secs.values())

    best = max((s for s in secs if s['person_score'] is not None), key=lambda s: s['person_score'], default=None)
    sensor_only = [s['second'] for s in secs if s['object_in_range'] and not s['any_detection']]
    obstructed = [s['second'] for s in secs if s['obstructed']]
    moving = [s['second'] for s in secs if s['camera_moving']]
    reasons = []

    if best and best['person_score'] >= threshold:
        verdict, priority = 'person_confirmed', 'high'
    elif best:
        verdict, priority = 'person_possible', 'medium'
    elif sensor_only:
        verdict, priority = 'object_unidentified', 'medium'
    else:
        verdict, priority = 'nothing_detected', 'low'

    if best:
        text = f"Person at {best['second']}s: model confidence {best['yolo_person']:.2f}"
        if best['corroborated']:
            text += (f"; distance sensor confirms an object at {best['distance_mm']:.0f} mm in the same area"
                     f" -> fused {best['person_score']:.2f}")
        if best['camera_moving']:
            text += '; camera was moving, so motion blur may be lowering confidence'
        reasons.append(text)
    if sensor_only:
        reasons.append(f'Distance sensor detected an object at {_seconds(sensor_only)} but the camera recognised '
                       'nothing; possible miss in low visibility')
    if obstructed:
        reasons.append(f'Distance under {OBSTRUCTION_MM} mm at {_seconds(obstructed)}: sensor or lens likely blocked')
    if moving:
        reasons.append(f'Camera moving at {_seconds(moving)}; detections in those seconds are less reliable')

    temps = [s['temp_c'] for s in secs if s['temp_c'] is not None]
    hums = [s['humidity_pct'] for s in secs if s['humidity_pct'] is not None]
    rise = round(temps[-1] - temps[0], 3) if len(temps) > 1 else None
    env = {'temp_c_min': min(temps, default=None), 'temp_c_max': max(temps, default=None), 'temp_rise_c': rise,
           'humidity_pct_max': max(hums, default=None),
           'high_humidity': bool(hums) and max(hums) >= HIGH_HUMIDITY_PCT,
           'heat_rising': rise is not None and rise >= HEAT_RISE_C,
           'high_temperature': bool(temps) and max(temps) >= HIGH_TEMP_C,
           'sensor_coverage': {name: f"{sum(s[name] is not None for s in secs)}/{len(secs)}"
                               for name in SENSORS.values()}}
    if env['high_humidity']:
        reasons.append(f"Humidity reached {env['humidity_pct_max']:.0f}%: fog or condensation likely, "
                       'expect lower camera confidence')
    if env['heat_rising'] or env['high_temperature']:
        reasons.append(f"Temperature {env['temp_c_max']:.1f} C (rise {rise or 0:.1f} C during clip): "
                       'possible heat source nearby')
        priority = 'high' if priority != 'low' else 'medium'
    missing = [name for name, cov in env['sensor_coverage'].items() if cov.startswith('0/')]
    if missing:
        reasons.append('No readings from: ' + ', '.join(missing) +
                       ('; corroboration and miss detection unavailable' if 'distance_mm' in missing else ''))

    return {'fusion_version': FUSION_VERSION, 'verdict': verdict,
            'person_score': best['person_score'] if best else None,
            'review_priority': priority, 'reasons': reasons, 'environment': env, 'sensor_timeline': secs}
