"""Rules-based sensor fusion; standard library only."""
import unittest
from nightwatch.fusion import fuse, sensor_timeline, hud_text

CENTRE_BOX = [0.4, 0.3, 0.6, 0.9]
EDGE_BOX = [0.0, 0.0, 0.2, 0.2]


def rec(**sensors):
    return {'temp': None, 'humidity': None, 'distance': None, 'accel_mean': None, 'vibration': None, **sensors}


def frame(second, *detections, condition='clear'):
    return {'timestamp_seconds': second + 0.2, 'visibility_condition': condition,
            'detections_json': [{'label': l, 'confidence': c, 'bbox': b} for l, c, b in detections]}


class TimelineTests(unittest.TestCase):
    def test_nulls_text_and_short_arrays(self):
        t = sensor_timeline(rec(distance='[500, null]', temp=[20, 'x', float('nan')]), 3)
        self.assertEqual(len(t), 3)
        self.assertEqual([r['distance_mm'] for r in t], [500, None, None])
        self.assertEqual([r['temp_c'] for r in t], [20, None, None])
        self.assertEqual([r['object_in_range'] for r in t], [True, None, None])

    def test_obstruction_and_range(self):
        t = sensor_timeline(rec(distance=[50, 150, 1300, 1301]), 4)
        self.assertEqual([r['obstructed'] for r in t], [True, False, False, False])
        self.assertEqual([r['object_in_range'] for r in t], [False, True, True, False])

    def test_movement(self):
        t = sensor_timeline(rec(accel_mean=[0.2, 600, None], vibration=[0.8, 0, None]), 3)
        self.assertEqual([r['camera_moving'] for r in t], [False, True, None])

    def test_hud(self):
        t = sensor_timeline(rec(distance=[40], temp=[25.9], humidity=[28.2]), 1)
        self.assertEqual(hud_text(t[0]), 'dist 40mm BLOCKED  25.9C  28%RH')


class FuseTests(unittest.TestCase):
    def run_fuse(self, sensors, frames, seconds=2):
        return fuse(sensor_timeline(rec(**sensors), seconds), frames, threshold=0.75, review_floor=0.40)

    def test_corroboration_promotes_weak_person(self):
        r = self.run_fuse({'distance': [900, None]}, [frame(0, ('person', 0.64, CENTRE_BOX))])
        self.assertEqual(r['verdict'], 'person_confirmed')
        self.assertAlmostEqual(r['person_score'], 0.79)
        self.assertIn('900 mm', r['reasons'][0])

    def test_no_corroboration_outside_beam_or_without_reading(self):
        for sensors, box in [({'distance': [900, None]}, EDGE_BOX), ({}, CENTRE_BOX)]:
            r = self.run_fuse(sensors, [frame(0, ('person', 0.64, box))])
            self.assertEqual((r['verdict'], r['person_score'], r['review_priority']), ('person_possible', 0.64, 'medium'))

    def test_sensor_only_presence(self):
        r = self.run_fuse({'distance': [None, 700]}, [frame(1, ('chair', 0.3, CENTRE_BOX))])
        self.assertEqual(r['verdict'], 'object_unidentified')
        self.assertTrue(any('possible miss' in x for x in r['reasons']))

    def test_obstruction_is_not_presence(self):
        r = self.run_fuse({'distance': [46.8, 61.2]}, [])
        self.assertEqual(r['verdict'], 'nothing_detected')
        self.assertTrue(any('blocked' in x for x in r['reasons']))

    def test_synthetic_conditions_ignored(self):
        r = self.run_fuse({}, [frame(0, ('person', 0.9, CENTRE_BOX), condition='fog')])
        self.assertEqual(r['verdict'], 'nothing_detected')

    def test_heat_raises_priority_and_missing_sensors_reported(self):
        r = self.run_fuse({'temp': [25, 28]}, [frame(0, ('person', 0.5, EDGE_BOX))])
        self.assertTrue(r['environment']['heat_rising'])
        self.assertEqual(r['review_priority'], 'high')
        self.assertTrue(any(x.startswith('No readings from') and 'distance_mm' in x for x in r['reasons']))

    def test_empty_everything(self):
        r = self.run_fuse({}, [], seconds=5)
        self.assertEqual((r['verdict'], r['person_score'], r['review_priority']), ('nothing_detected', None, 'low'))
        self.assertEqual(len(r['sensor_timeline']), 5)
        self.assertEqual(r['environment']['sensor_coverage']['temp_c'], '0/5')


if __name__ == '__main__':
    unittest.main()
