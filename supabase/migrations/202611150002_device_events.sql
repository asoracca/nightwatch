-- Restricted devices can only ingest through the API, never access the Data API.
create table public.devices (
 device_id text primary key check(device_id ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$'),
 owner_user_id uuid not null references auth.users,
 label text not null, token_sha256 text not null unique check(token_sha256 ~ '^[a-f0-9]{64}$'),
 token_expires_at timestamptz not null, enabled boolean not null default true,
 created_at timestamptz not null default now()
);
alter table public.videos add column device_id text references public.devices;
alter table public.videos add column recording_started_at timestamptz;
create table public.device_events (
 id uuid primary key default gen_random_uuid(), device_id text not null references public.devices,
 owner_user_id uuid not null references auth.users, event_type text not null
 check(event_type in ('motion_detected','distance_changed','temperature_reading','heartbeat')),
 event_time timestamptz not null, sensor_data_json jsonb not null,
 linked_video_id uuid references public.videos on delete set null,
 idempotency_key text not null,
 created_at timestamptz not null default now(), unique(device_id,idempotency_key)
);
alter table public.devices enable row level security;
alter table public.device_events enable row level security;
create policy devices_read on public.devices for select to authenticated using(owner_user_id=(select auth.uid()) or (select public.is_admin()));
create policy events_read on public.device_events for select to authenticated using(owner_user_id=(select auth.uid()) or (select public.is_admin()));
revoke all on public.devices,public.device_events from anon,authenticated;
-- Never expose even the token hash through the user's Data API permissions.
grant select(device_id,owner_user_id,label,enabled,token_expires_at,created_at) on public.devices to authenticated;
grant select on public.device_events to authenticated;
grant all on public.devices,public.device_events to service_role;
create index devices_owner on public.devices(owner_user_id);
create index events_owner on public.device_events(owner_user_id);
create index events_device_time on public.device_events(device_id,event_time);
create index events_linked_video on public.device_events(linked_video_id,event_time);
create index videos_device_time on public.videos(device_id,recording_started_at);

create function public.match_device_video(p_device text,p_owner uuid,p_time timestamptz) returns uuid
language sql stable security invoker set search_path=public as $$
 select case when count(*)=1 then (array_agg(id))[1] else null end
 from videos where device_id=p_device and owner_user_id=p_owner and upload_verified
 and recording_started_at is not null and p_time>=recording_started_at
 and p_time < recording_started_at + duration_seconds * interval '1 second'
$$;
create function public.ingest_device_event(p_device text,p_hash text,p_key text,p_type text,p_time timestamptz,p_sensor jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare d devices; e device_events; inserted_id uuid;
begin
 select * into d from devices where device_id=p_device for update;
 if not found or not d.enabled or d.token_expires_at<=now() or d.token_sha256<>p_hash then raise exception 'Invalid device credentials'; end if;
 insert into device_events(device_id,owner_user_id,event_type,event_time,sensor_data_json,linked_video_id,idempotency_key)
 values(p_device,d.owner_user_id,p_type,p_time,p_sensor,match_device_video(p_device,d.owner_user_id,p_time),p_key)
 on conflict(device_id,idempotency_key) do nothing returning id into inserted_id;
 select * into e from device_events where device_id=p_device and idempotency_key=p_key;
 return jsonb_build_object('id',e.id,'duplicate',inserted_id is null,'linked_video_id',e.linked_video_id);
end $$;
create function public.link_video_device(p_video uuid,p_device text,p_started timestamptz)
returns void language plpgsql security invoker set search_path=public as $$
declare v videos; d devices;
begin
 select * into d from devices where device_id=p_device for update;
 select * into v from videos where id=p_video for update;
 if d.device_id is null or v.id is null or d.owner_user_id<>v.owner_user_id or not v.upload_verified then raise exception 'Invalid video/device association'; end if;
 -- Immutable association: changing it requires a deliberate future administrative workflow.
 if v.device_id is not null and (v.device_id<>p_device or v.recording_started_at<>p_started) then raise exception 'Video is already linked to a capture interval'; end if;
 update videos set device_id=p_device,recording_started_at=p_started where id=p_video;
 -- Reconcile earlier events and remove ambiguous matches if capture intervals overlap.
 update device_events e set linked_video_id=match_device_video(e.device_id,e.owner_user_id,e.event_time)
 where e.device_id=p_device and e.owner_user_id=d.owner_user_id;
end $$;
revoke all on function public.match_device_video(text,uuid,timestamptz),public.ingest_device_event(text,text,text,text,timestamptz,jsonb),public.link_video_device(uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.match_device_video(text,uuid,timestamptz),public.ingest_device_event(text,text,text,text,timestamptz,jsonb),public.link_video_device(uuid,text,timestamptz) to service_role;
