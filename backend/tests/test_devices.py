from datetime import datetime,timezone
import pytest
from pydantic import ValidationError
from fastapi.testclient import TestClient
from nightwatch.api import app
from nightwatch.devices import DeviceEvent
from nightwatch import devices
from nightwatch.device_logic import token_hash

def payload():return {'device_id':'test-device','event_type':'motion_detected','event_time':datetime.now(timezone.utc).isoformat(),'sensor_data':{'motion':True}}
@pytest.mark.parametrize('change',[{'owner_user_id':'forged'},{'device_id':'../bad'},{'event_type':'inject'},{'sensor_data':{'motion':'yes'}},{'sensor_data':{'motion':False}},{'sensor_data':{}},{'event_time':'2026-11-15T06:00:00'},{'sensor_data':{'temperature_c':float('nan')}}])
def test_malformed(change):
 with pytest.raises(ValidationError):DeviceEvent(**{**payload(),**change})
def test_unknown_device(monkeypatch):
 class DB:
  def rows(self,*a,**k):return []
 monkeypatch.setattr(devices,'Store',DB)
 assert TestClient(app).post('/api/device-events',json=payload(),headers={'Authorization':'Bearer nw_device_'+'a'*43}).status_code==401
def test_user_jwt_not_a_device_token():
 assert TestClient(app).post('/api/device-events',json=payload(),headers={'Authorization':'Bearer user-jwt'}).status_code==401
def test_oversized_body():
 assert TestClient(app).post('/api/device-events',content='x'*4097).status_code==413
