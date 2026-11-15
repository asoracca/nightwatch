import unittest
from nightwatch.device_logic import event_key,new_device_token,token_hash
class DeviceLogicTests(unittest.TestCase):
 def test_random_restricted_tokens(self):
  a,b=new_device_token(),new_device_token()
  self.assertTrue(a.startswith('nw_device_'));self.assertNotEqual(a,b);self.assertEqual(len(a),53)
 def test_hash_does_not_store_bearer(self):
  token=new_device_token();hashed=token_hash(token)
  self.assertNotEqual(token,hashed);self.assertEqual(len(hashed),64)
 def test_duplicate_retry_key(self):
  a={'device_id':'test-device','sensor_data':{'motion':True},'event_time':'2026-11-15T06:00:00Z'}
  b={'event_time':a['event_time'],'sensor_data':a['sensor_data'],'device_id':a['device_id']}
  self.assertEqual(event_key(a),event_key(b))
 def test_changed_reading_changes_key(self):
  self.assertNotEqual(event_key({'motion':True}),event_key({'motion':False}))
 def test_nan_rejected(self):
  with self.assertRaises(ValueError):event_key({'temperature_c':float('nan')})
