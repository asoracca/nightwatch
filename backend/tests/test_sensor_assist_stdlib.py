import unittest

from nightwatch.metrics import needs_review
from nightwatch.sensor_assist import (MAX_BOOST, SensorReading, assist, model_floor, reading_at,
                                      readings_from_events, readings_from_timeline)

CENTRAL = [0.40, 0.40, 0.60, 0.90]
EDGE = [0.00, 0.00, 0.10, 0.20]


class SensorAssistRules(unittest.TestCase):
    def test_no_reading_or_other_class_is_unchanged(self):
        self.assertEqual(assist('person', 0.55, CENTRAL, None), (0.55, []))
        self.assertEqual(assist('car', 0.55, CENTRAL, SensorReading(distance_mm=800, scene_motion=True)), (0.55, []))

    def test_distance_needs_range_and_central_box(self):
        self.assertEqual(assist('person', 0.55, CENTRAL, SensorReading(distance_mm=800))[0], 0.70)
        self.assertEqual(assist('person', 0.55, EDGE, SensorReading(distance_mm=800))[0], 0.55)
        self.assertEqual(assist('person', 0.55, CENTRAL, SensorReading(distance_mm=100))[0], 0.55)   # blocked beam
        self.assertEqual(assist('person', 0.55, CENTRAL, SensorReading(distance_mm=2000))[0], 0.55)  # out of range

    def test_movement_and_thermal_boosts_have_reasons(self):
        fused, reasons = assist('person', 0.40, EDGE, SensorReading(scene_motion=True, camera_moving=True,
                                                                     humidity_pct=95, heat_rising=True))
        self.assertAlmostEqual(fused, 0.65)
        self.assertEqual(len(reasons), 4)

    def test_total_boost_is_capped(self):
        everything = SensorReading(distance_mm=800, scene_motion=True, camera_moving=True, humidity_pct=95, heat_rising=True)
        self.assertAlmostEqual(assist('person', 0.30, CENTRAL, everything)[0], 0.30 + MAX_BOOST)
        self.assertEqual(assist('person', 0.95, CENTRAL, everything)[0], 1.0)

    def test_model_floor_drops_only_when_assisted(self):
        self.assertEqual(model_floor(0.40, False), 0.40)
        self.assertAlmostEqual(model_floor(0.40, True), 0.15)
        self.assertEqual(model_floor(0.20, True), 0.10)

    def test_review_uses_fused_score(self):
        rescued = {'confidence': 0.30, 'fused_confidence': 0.55}
        self.assertTrue(needs_review([rescued], 0.40, 0.75))
        self.assertFalse(needs_review([{'confidence': 0.30, 'fused_confidence': None}], 0.40, 0.75))


class SensorReadingSources(unittest.TestCase):
    def test_timeline_readings_track_heat_rise(self):
        timeline = [
            {'second': 0, 'temp_c': 20.0, 'humidity_pct': 50, 'distance_mm': 900, 'camera_moving': False},
            {'second': 1, 'temp_c': 22.5, 'humidity_pct': 92, 'distance_mm': None, 'camera_moving': True},
        ]
        r0, r1 = readings_from_timeline(timeline)
        self.assertEqual((r0.distance_mm, r0.heat_rising), (900, False))
        self.assertEqual((r1.heat_rising, r1.camera_moving, r1.humidity_pct), (True, True, 92))

    def test_device_events_align_to_video_seconds(self):
        events = [
            {'event_time': '2026-11-15T10:00:01Z', 'sensor_data_json': {'distance_cm': 80, 'temperature_c': 20.0}},
            {'event_time': '2026-11-15T10:00:03Z', 'sensor_data_json': {'motion': True, 'temperature_c': 23.0}},
        ]
        readings = readings_from_events(events, '2026-11-15T10:00:00Z', 10)
        self.assertEqual(readings[1].distance_mm, 800)
        self.assertTrue(reading_at(readings, 3.4).scene_motion)
        self.assertTrue(readings[3].heat_rising)
        self.assertIsNone(readings[9])  # no event within 2 s

    def test_unlinked_video_has_no_readings(self):
        self.assertEqual(readings_from_events([], None, 3), [None, None, None, None])
        self.assertIsNone(reading_at([], 1.0))


if __name__ == '__main__':
    unittest.main()
