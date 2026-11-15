-- Transactional test fixtures only. Roll back every user/device/video/event.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
('00000000-0000-0000-0000-000000000001','hardware-a@example.invalid','{}'),
('00000000-0000-0000-0000-000000000002','hardware-b@example.invalid','{}');
insert into public.devices(device_id,owner_user_id,label,token_sha256,token_expires_at) values
('test-device','00000000-0000-0000-0000-000000000001','Transaction fixture',repeat('b',64),now()+interval '1 day');
insert into public.videos(id,owner_user_id,original_filename,storage_path,content_sha256,expected_bytes,use_case,upload_verified,duration_seconds) values
('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000001','test.mp4','test/hardware-fixture',repeat('a',64),1,'search and rescue',true,10);
set local role service_role;
do $$ declare a jsonb; b jsonb; begin
 a:=public.ingest_device_event('test-device',repeat('b',64),'client-a','motion_detected','2026-11-15T06:00:05Z','{"motion":true}');
 if a->>'linked_video_id' is not null then raise exception 'Event prematurely matched'; end if;
 b:=public.ingest_device_event('test-device',repeat('b',64),'different-client-key','motion_detected','2026-11-15T06:00:05+00:00','{"motion":true}');
 if a->>'id'<>b->>'id' or (b->>'duplicate')::boolean is not true then raise exception 'Canonical retry duplicated'; end if;
 perform public.link_video_device('00000000-0000-0000-0000-000000000010','test-device','2026-11-15T06:00:00Z');
 if (select linked_video_id from public.device_events where id=(a->>'id')::uuid)<>'00000000-0000-0000-0000-000000000010' then raise exception 'Late video link failed'; end if;
 b:=public.ingest_device_event('test-device',repeat('b',64),'end-boundary','heartbeat','2026-11-15T06:00:10Z','{"motion":false}');
 if b->>'linked_video_id' is not null then raise exception 'End boundary incorrectly included'; end if;
 begin
  perform public.ingest_device_event('test-device',repeat('c',64),'invalid','heartbeat',now(),'{}');
  raise exception 'Invalid credentials accepted';
 exception when others then if sqlerrm <> 'Invalid device credentials' then raise; end if; end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000002","app_metadata":{}}',true);
do $$ begin
 if (select count(*) from public.device_events)<>0 then raise exception 'Cross-owner sensor event leaked'; end if;
 if (select count(device_id) from public.devices)<>0 then raise exception 'Cross-owner device leaked'; end if;
 if has_column_privilege('authenticated','public.devices','token_sha256','SELECT') then raise exception 'Token hash exposed'; end if;
 if has_table_privilege('authenticated','public.device_events','INSERT') then raise exception 'Client can forge events'; end if;
 if has_function_privilege('authenticated','public.ingest_device_event(text,text,text,text,timestamptz,jsonb)','EXECUTE') then raise exception 'Ingest RPC exposed'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","app_metadata":{}}',true);
do $$ begin if (select count(*) from public.device_events)<>2 then raise exception 'Owner cannot read stored events'; end if; end $$;
reset role;
insert into public.videos(id,owner_user_id,original_filename,storage_path,content_sha256,expected_bytes,use_case,upload_verified,duration_seconds) values
('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000001','overlap.mp4','test/overlap-fixture',repeat('c',64),1,'search and rescue',true,10);
set local role service_role;
select public.link_video_device('00000000-0000-0000-0000-000000000011','test-device','2026-11-15T06:00:01Z');
do $$ begin
 if exists(select 1 from public.device_events where event_type='motion_detected' and linked_video_id is not null) then raise exception 'Ambiguous capture interval guessed'; end if;
 update public.devices set enabled=false where device_id='test-device';
 begin
  perform public.ingest_device_event('test-device',repeat('b',64),'revoked','heartbeat',now(),'{}');
  raise exception 'Revoked token accepted';
 exception when others then if sqlerrm<>'Invalid device credentials' then raise; end if; end;
end $$;
reset role;
rollback;
