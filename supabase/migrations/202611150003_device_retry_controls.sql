create or replace function public.ingest_device_event(p_device text,p_hash text,p_key text,p_type text,p_time timestamptz,p_sensor jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare d devices; e device_events; inserted_id uuid;
begin
 select * into d from devices where device_id=p_device for update;
 if not found or not d.enabled or d.token_expires_at<=now() or d.token_sha256<>p_hash then raise exception 'Invalid device credentials'; end if;
 -- Database-derived canonical identity makes retries identical across Python and Edge APIs.
 p_key := encode(sha256(convert_to(jsonb_build_object('device_id',p_device,'event_type',p_type,
   'event_time_us',(extract(epoch from p_time)*1000000)::bigint,'sensor_data',p_sensor)::text,'UTF8')),'hex');
 select * into e from device_events where device_id=p_device and idempotency_key=p_key;
 if found then return jsonb_build_object('id',e.id,'duplicate',true,'linked_video_id',e.linked_video_id); end if;
 if (select count(*) from device_events where device_id=p_device and created_at>now()-interval '1 minute')>=60 then
  raise exception 'Device event rate limit exceeded';
 end if;
 insert into device_events(device_id,owner_user_id,event_type,event_time,sensor_data_json,linked_video_id,idempotency_key)
 values(p_device,d.owner_user_id,p_type,p_time,p_sensor,match_device_video(p_device,d.owner_user_id,p_time),p_key)
 on conflict(device_id,idempotency_key) do nothing returning id into inserted_id;
 select * into e from device_events where device_id=p_device and idempotency_key=p_key;
 return jsonb_build_object('id',e.id,'duplicate',inserted_id is null,'linked_video_id',e.linked_video_id);
end $$;
