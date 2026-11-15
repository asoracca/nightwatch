"""No dependencies or synthetic model outputs saved to the product database."""
import unittest
from nightwatch.metrics import idempotency_key, needs_review, summarize

class MetricsTests(unittest.TestCase):
    def test_review_boundaries(self):
        for confidence, expected in [(0.39,False),(0.4,True),(0.74999,True),(0.75,False),(1,False)]:
            self.assertEqual(needs_review([{'confidence':confidence}]),expected)
    def test_empty_review(self):
        self.assertFalse(needs_review([]))
    def test_idempotency_ignores_explicit_flag(self):
        self.assertEqual(idempotency_key('v','1',{'reprocess':True,'fps':5}),idempotency_key('v','1',{'fps':5}))
    def test_idempotency_varies_by_model_config_video(self):
        base=idempotency_key('v','1',{'fps':5})
        for args in [('x','1',{'fps':5}),('v','2',{'fps':5}),('v','1',{'fps':6})]:
            self.assertNotEqual(base,idempotency_key(*args))
    def test_empty_summary_not_fabricated(self):
        s=summarize([],'search and rescue')
        self.assertIsNone(s['miss_rate']);self.assertIsNone(s['average_confidence'])
        self.assertEqual(s['total_detections'],0)
    def test_no_detection_is_not_a_miss(self):
        s=summarize([{'detections_json':[],'visibility_condition':'clear','review_required':False}],'search and rescue')
        self.assertIsNone(s['miss_rate']);self.assertEqual(s['frames_with_detections'],0)
    def test_review_candidates_not_accepted(self):
        # Handwritten unit-test input only, not real evaluation evidence.
        s=summarize([{'detections_json':[{'confidence':0.5,'accepted':False}],
                      'visibility_condition':'fog','review_required':True}],'search and rescue')
        self.assertEqual(s['total_detections'],0);self.assertEqual(s['review_candidate_count'],1)

if __name__=='__main__': unittest.main()
