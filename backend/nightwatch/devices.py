from datetime import datetime, timedelta, timezone
from typing import Optional, Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, AwareDatetime, model_validator
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from .device_logic import new_device_token, token_hash, event_key
from .store import Store, StoreError

class DeviceCreate(BaseModel):
    model_config=ConfigDict(extra='forbid')
    device_id: str=Field(pattern=r'^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$')
    label: str=Field(min_length=1,max_length=80)

class Sensors(BaseModel):
    model_config=ConfigDict(extra='forbid',allow_inf_nan=False,strict=True)
    distance_cm: Optional[float]=Field(default=None,ge=0,le=100000)
    temperature_c: Optional[float]=Field(default=None,ge=-100,le=200)
    motion: Optional[bool]=None

class DeviceEvent(BaseModel):
    model_config=ConfigDict(extra='forbid')
    device_id: str=Field(pattern=r'^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$')
    event_type: Literal['motion_detected','distance_changed','temperature_reading','heartbeat']
    event_time: AwareDatetime
    sensor_data: Sensors

    @model_validator(mode='after')
    def valid_time(self):
        now=datetime.now(timezone.utc)
        if self.event_time>now+timedelta(minutes=5) or self.event_time<now-timedelta(days=7):
            raise ValueError('Device time must be within 7 days past / 5 minutes future; synchronize the clock')
        if not self.sensor_data.model_dump(exclude_none=True):
            raise ValueError('At least one sensor reading is required')
        if self.event_type=='motion_detected' and self.sensor_data.motion is not True:
            raise ValueError('motion_detected requires motion=true')
        return self

class VideoDeviceLink(BaseModel):
    model_config=ConfigDict(extra='forbid')
    device_id: str=Field(pattern=r'^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$')
    recording_started_at: AwareDatetime

class DeviceBodyLimit:
    """Bound bodies before JSON parsing, including chunked transfer requests."""
    def __init__(self,app):self.app=app
    async def __call__(self,scope,receive,send):
        if scope['type']!='http' or scope['path']!='/api/device-events' or scope['method']!='POST':
            return await self.app(scope,receive,send)
        data=bytearray()
        while True:
            message=await receive()
            if message['type']=='http.disconnect':return
            data.extend(message.get('body',b''))
            if len(data)>4096:
                await send({'type':'http.response.start','status':413,'headers':[(b'content-type',b'application/json')]})
                await send({'type':'http.response.body','body':b'{"detail":"Device event exceeds 4096 bytes"}'})
                return
            if not message.get('more_body'):break
        delivered=False
        async def bounded_receive():
            nonlocal delivered
            if not delivered:
                delivered=True
                return {'type':'http.request','body':bytes(data),'more_body':False}
            return await receive()
        await self.app(scope,bounded_receive,send)

def router(identity,owned,rate_limit):
    api=APIRouter(tags=['Arduino hardware events'])

    @api.post('/api/devices')
    def register(body:DeviceCreate,user=Depends(identity)):
        db=Store(); token=new_device_token()
        try:
            row=db.insert('devices',{'device_id':body.device_id,'owner_user_id':user['id'],'label':body.label,
                                     'token_sha256':token_hash(token),'token_expires_at':(datetime.now(timezone.utc)+timedelta(days=30)).isoformat()})
        except StoreError as e:
            if e.status==409:raise HTTPException(409,'Device ID unavailable; choose another')
            raise
        return {'device_id':row['device_id'],'token':token,'expires_at':row['token_expires_at'],
                'notice':'Copy once into ignored arduino_secrets.h. Restricted to event ingestion for this device.'}

    @api.get('/api/devices')
    def device_list(user=Depends(identity)):
        return Store(user['token']).rows('devices',select='device_id,label,enabled,token_expires_at,created_at',owner_user_id='eq.'+user['id'])

    @api.post('/api/devices/{device_id}/revoke')
    def revoke(device_id:str,user=Depends(identity)):
        rows=Store(user['token']).rows('devices',device_id='eq.'+device_id,select='device_id,owner_user_id')
        if not rows or rows[0]['owner_user_id']!=user['id']:raise HTTPException(404,'Device not found')
        Store().request('PATCH','/rest/v1/devices',params={'device_id':'eq.'+device_id},json={'enabled':False})
        return {'revoked':True}

    @api.post('/api/device-events')
    def ingest(body:DeviceEvent,authorization:str=Header(default='')):
        # Never accepts a user JWT, Supabase service key, or arbitrary claimed owner.
        if not authorization.startswith('Bearer nw_device_') or len(authorization)>160:
            raise HTTPException(401,'Invalid device credentials')
        token=authorization[7:]
        db=Store()
        rows=db.rows('devices',device_id='eq.'+body.device_id,select='device_id,token_sha256,enabled,token_expires_at')
        if not rows:raise HTTPException(401,'Invalid device credentials')
        import hmac
        device=rows[0]
        expires=datetime.fromisoformat(device['token_expires_at'].replace('Z','+00:00'))
        if not device['enabled'] or expires<=datetime.now(timezone.utc) or not hmac.compare_digest(device['token_sha256'],token_hash(token)):
            raise HTTPException(401,'Invalid device credentials')
        rate_limit('device:'+body.device_id,60)
        payload=body.model_dump(mode='json',exclude_none=True)
        payload['event_time']=body.event_time.astimezone(timezone.utc).isoformat()
        result=db.rpc('ingest_device_event',{'p_device':body.device_id,'p_hash':token_hash(token),'p_key':event_key(payload),
                    'p_type':body.event_type,'p_time':payload['event_time'],'p_sensor':payload['sensor_data']})
        return {'id':result['id'],'stored':True,'duplicate':result['duplicate'],'linked_video_id':result['linked_video_id']}

    @api.post('/videos/{video_id}/device-link')
    def link(video_id:UUID,body:VideoDeviceLink,user=Depends(identity)):
        video=owned(video_id,user)
        devices=Store(user['token']).rows('devices',device_id='eq.'+body.device_id,select='device_id,owner_user_id')
        if not devices or devices[0]['owner_user_id']!=video['owner_user_id']:
            raise HTTPException(404,'Device not owned by the video owner')
        if not video['upload_verified']:raise HTTPException(409,'Verify video duration before linking hardware')
        Store().rpc('link_video_device',{'p_video':str(video_id),'p_device':body.device_id,
                    'p_started':body.recording_started_at.astimezone(timezone.utc).isoformat()})
        return {'linked':True,'note':'Only a unique overlapping capture interval is matched; ambiguous events remain unlinked.'}

    @api.get('/videos/{video_id}/device-events')
    def video_events(video_id:UUID,user=Depends(identity),offset:int=Query(0,ge=0)):
        video=owned(video_id,user)
        rows=Store(user['token']).rows('device_events',linked_video_id='eq.'+str(video_id),order='event_time.asc',limit='100',offset=str(offset))
        for event in rows:
            start=video.get('recording_started_at')
            event['video_timestamp_seconds']=(datetime.fromisoformat(event['event_time'].replace('Z','+00:00'))-datetime.fromisoformat(start.replace('Z','+00:00'))).total_seconds() if start else None
        return rows
    return api
