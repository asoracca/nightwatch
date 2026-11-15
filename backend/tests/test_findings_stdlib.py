import unittest

from nightwatch.findings import findings
from nightwatch.models import CATALOG, name_from_version, version


def det(label, confidence, track=None, fused=None, reasons=()):
    return {'label': label, 'confidence': confidence, 'track_id': track, 'bbox': [0.1, 0.1, 0.5, 0.9],
            'accepted': (fused or confidence) >= 0.75, 'fused_confidence': fused, 'sensor_reasons': list(reasons)}


def frame(condition, number, *detections, fps=5):
    return {'visibility_condition': condition, 'frame_number': number, 'timestamp_seconds': number / fps,
            'detections_json': list(detections)}


class Findings(unittest.TestCase):
    def test_humans_found_with_segments_tracks_and_best_frame(self):
        frames = [frame('clear', 10, det('person', 0.47, 1)), frame('clear', 11, det('person', 0.80, 1)),
                  frame('clear', 12, det('person', 0.62, 1)), frame('clear', 30, det('person', 0.50, 2)),
                  frame('fog', 11, det('person', 0.45)), frame('low_light', 11)]
        r = findings(frames, 0.75, 0.40)
        self.assertEqual((r['headline'], r['headline_text']), ('humans_found', 'Humans found'))
        p = r['people']
        self.assertEqual((p['accepted'], p['review'], p['max_tracks']), (1, 4, 2))
        self.assertEqual(p['segments'], [[2.0, 2.4], [6.0, 6.0]])
        self.assertEqual((p['best']['condition'], p['best']['frame_number'], p['best']['confidence']), ('clear', 11, 0.8))
        self.assertEqual(p['conditions'], ['clear', 'fog'])
        self.assertIn('No person detected under: low light', r['detail'])

    def test_review_band_only_is_possible(self):
        r = findings([frame('clear', 15, det('person', 0.55))], 0.75, 0.40)
        self.assertEqual(r['headline'], 'possible_humans')
        self.assertFalse(r['humans_found'])

    def test_nothing_never_claims_absence(self):
        r = findings([frame('clear', 1, det('person', 0.2)), frame('clear', 2, det('car', 0.9))], 0.75, 0.40)
        self.assertEqual(r['headline'], 'no_humans_found')
        self.assertIn('does not establish', r['detail'])
        self.assertEqual([o['label'] for o in r['objects']], ['car'])
        self.assertIn('car ×1', r['detail'])

    def test_sensor_fused_score_decides(self):
        r = findings([frame('clear', 1, det('person', 0.55, 1, fused=0.80, reasons=['distance']))], 0.75, 0.40)
        self.assertEqual(r['headline'], 'humans_found')
        self.assertEqual((r['people']['sensor_assisted'], r['people']['max_model_confidence']), (1, 0.55))


class Catalog(unittest.TestCase):
    def test_versions_round_trip_and_hashes_are_pinned(self):
        for name, spec in CATALOG.items():
            self.assertEqual(name_from_version(version(name)), name)
            self.assertEqual(len(spec['sha256']), 64)
        self.assertEqual(name_from_version('yolo11n-u8.4.213-t2.15.0'), 'yolo11n')


if __name__ == '__main__':
    unittest.main()
