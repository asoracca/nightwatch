-- New schema only. No legacy/demo data.
create extension if not exists pgcrypto;
create function public.is_admin() returns boolean language sql stable
set search_path = public as $$ select coalesce(auth.jwt()->'app_metadata'->>'role' = 'admin', false) $$;

create table public.profiles (
 id uuid primary key references auth.users on delete cascade,
 email text, username text, created_at timestamptz not null default now()
);
create function public.new_profile() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into profiles(id,email,username) values(new.id,new.email,coalesce(new.raw_user_meta_data->>'username',''));
 return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.new_profile();

create table public.videos (
 id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references auth.users,
 owner_email text, owner_username text, original_filename text not null,
 storage_path text not null unique, content_sha256 text not null check(content_sha256 ~ '^[a-f0-9]{64}$'),
 expected_bytes bigint not null check(expected_bytes between 1 and 52428800),
 upload_verified boolean not null default false,
 status text not null default 'uploaded' check(status in ('uploaded','processing','completed','failed')),
 use_case text not null check(use_case in ('search and rescue','fire and smoke response','floods and natural disasters','collapsed buildings','cave and underground rescue','maritime rescue and fog','dangerous industrial inspection','remote drone inspection','war-zone or inaccessible environments')),
 duration_seconds double precision, fps double precision, width integer, height integer,
 uploaded_at timestamptz not null default now(), processing_started_at timestamptz,
 processing_finished_at timestamptz, error_message text, model_name text, model_version text,
 unique(owner_user_id,content_sha256)
);
create table public.processing_jobs (
 id uuid primary key default gen_random_uuid(), video_id uuid not null references public.videos on delete cascade,
 idempotency_key text not null, attempt integer not null default 1, config jsonb not null,
 status text not null default 'queued' check(status in ('queued','processing','completed','failed')),
 created_at timestamptz not null default now(), started_at timestamptz, finished_at timestamptz,
 heartbeat_at timestamptz, error_message text,
 unique(video_id,idempotency_key,attempt)
);
create unique index one_active_job_per_video on public.processing_jobs(video_id) where status in ('queued','processing');
create table public.video_frames (
 id uuid primary key default gen_random_uuid(), video_id uuid not null references public.videos on delete cascade,
 job_id uuid not null references public.processing_jobs on delete cascade,
 frame_number integer not null, timestamp_seconds double precision not null,
 frame_storage_path text not null, visibility_condition text not null check(visibility_condition in ('clear','low_light','fog','blurry')),
 detections_json jsonb not null default '[]', tracking_json jsonb not null default '[]',
 inference_time_ms double precision not null check(inference_time_ms>=0),
 review_required boolean not null, review_reason text, review_status text not null default 'pending' check(review_status in ('pending','confirmed','dismissed')),
 model_name text not null, model_version text not null, created_at timestamptz not null default now(),
 unique(job_id,frame_number,visibility_condition)
);
create table public.video_investigations (
 id uuid primary key default gen_random_uuid(), video_id uuid not null references public.videos on delete cascade,
 job_id uuid not null unique references public.processing_jobs on delete cascade,
 total_frames integer not null, frames_with_detections integer not null, total_detections integer not null,
 average_confidence double precision, miss_rate double precision,
 review_candidate_count integer not null, affected_use_case text not null, summary text not null,
 metrics_json jsonb not null default '{}', processing_status text not null,
 created_at timestamptz not null default now(), completed_at timestamptz
);
create table public.experiment_runs (
 id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references auth.users,
 job_id uuid not null unique references public.processing_jobs on delete cascade,
 experiment_name text not null, model_name text not null, model_version text not null,
 detector_threshold double precision not null, frame_sampling_rate double precision not null,
 video_count integer not null, frame_count integer not null, metrics_json jsonb not null,
 created_at timestamptz not null default now()
);
create table public.review_decisions (
 id uuid primary key default gen_random_uuid(), frame_id uuid not null references public.video_frames on delete cascade,
 reviewer_user_id uuid not null references auth.users, decision text not null check(decision in ('confirmed','dismissed')),
 note text not null default '', created_at timestamptz not null default now()
);
create index videos_owner on public.videos(owner_user_id);
create index frames_video_job on public.video_frames(video_id,job_id,frame_number);
create index investigations_video on public.video_investigations(video_id);

-- Clients can read only. API/worker service role is the only writer.
alter table public.profiles enable row level security;
alter table public.videos enable row level security;
alter table public.processing_jobs enable row level security;
alter table public.video_frames enable row level security;
alter table public.video_investigations enable row level security;
alter table public.experiment_runs enable row level security;
alter table public.review_decisions enable row level security;
create policy profile_read on public.profiles for select to authenticated using(id=(select auth.uid()) or (select public.is_admin()));
create policy videos_read on public.videos for select to authenticated using(owner_user_id=(select auth.uid()) or (select public.is_admin()));
create policy jobs_read on public.processing_jobs for select to authenticated using(exists(select 1 from public.videos v where v.id=video_id));
create policy frames_read on public.video_frames for select to authenticated using(exists(select 1 from public.videos v where v.id=video_id));
create policy investigations_read on public.video_investigations for select to authenticated using(exists(select 1 from public.videos v where v.id=video_id));
create policy experiments_read on public.experiment_runs for select to authenticated using(owner_user_id=(select auth.uid()) or (select public.is_admin()));
create policy reviews_read on public.review_decisions for select to authenticated using(exists(select 1 from public.video_frames f where f.id=frame_id));
revoke all on public.profiles,public.videos,public.processing_jobs,public.video_frames,public.video_investigations,public.experiment_runs,public.review_decisions from anon,authenticated;
grant select on public.profiles,public.videos,public.processing_jobs,public.video_frames,public.video_investigations,public.experiment_runs,public.review_decisions to authenticated;
grant all on public.profiles,public.videos,public.processing_jobs,public.video_frames,public.video_investigations,public.experiment_runs,public.review_decisions to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('videos','videos',false,52428800,array['video/mp4','video/quicktime','video/webm']),
 ('frames','frames',false,5242880,array['image/jpeg']);
create policy private_media_read on storage.objects for select to authenticated using(
 bucket_id in ('videos','frames') and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin())
);
-- No client INSERT/UPDATE policy: upload uses a short-lived signed capability for one reserved path.

create function public.enqueue_job(p_video uuid,p_key text,p_config jsonb,p_reprocess boolean default false)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v videos; j processing_jobs; n integer;
begin
 select * into v from videos where id=p_video for update;
 if not found or not v.upload_verified then raise exception 'Upload is not verified'; end if;
 select * into j from processing_jobs where video_id=p_video and status in ('queued','processing') limit 1;
 if found then return to_jsonb(j); end if;
 select * into j from processing_jobs where video_id=p_video order by created_at desc limit 1;
 if found and not p_reprocess then return to_jsonb(j); end if;
 select coalesce(max(attempt),0)+1 into n from processing_jobs where video_id=p_video and idempotency_key=p_key;
 insert into processing_jobs(video_id,idempotency_key,attempt,config) values(p_video,p_key,n,p_config) returning * into j;
 update videos set status='uploaded',error_message=null,processing_finished_at=null where id=p_video;
 return to_jsonb(j);
end $$;
create function public.claim_job() returns jsonb language plpgsql security invoker set search_path=public as $$
declare j processing_jobs;
begin
 select * into j from processing_jobs where status='queued' order by created_at for update skip locked limit 1;
 if not found then return null; end if;
 update processing_jobs set status='processing',started_at=now(),heartbeat_at=now() where id=j.id returning * into j;
 update videos set status='processing',processing_started_at=now(),error_message=null where id=j.video_id;
 return to_jsonb(j);
end $$;
create function public.finish_job(p_job uuid,p_error text default null) returns void language plpgsql security invoker set search_path=public as $$
declare j processing_jobs;
begin
 select * into j from processing_jobs where id=p_job for update;
 if j.status <> 'processing' then raise exception 'Job is not processing'; end if;
 update processing_jobs set status=case when p_error is null then 'completed' else 'failed' end,finished_at=now(),error_message=p_error where id=p_job;
 update videos set status=case when p_error is null then 'completed' else 'failed' end,processing_finished_at=now(),error_message=p_error where id=j.video_id;
end $$;
create function public.record_review(p_frame uuid,p_user uuid,p_decision text,p_note text) returns void language plpgsql security invoker set search_path=public as $$
begin
 insert into review_decisions(frame_id,reviewer_user_id,decision,note) values(p_frame,p_user,p_decision,p_note);
 update video_frames set review_status=p_decision where id=p_frame;
end $$;
revoke all on function public.enqueue_job(uuid,text,jsonb,boolean),public.claim_job(),public.finish_job(uuid,text),public.record_review(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.enqueue_job(uuid,text,jsonb,boolean),public.claim_job(),public.finish_job(uuid,text),public.record_review(uuid,uuid,text,text) to service_role;

revoke all on function public.new_profile() from public,anon,authenticated;

create index jobs_video_created on public.processing_jobs(video_id,created_at desc);
create index jobs_queue on public.processing_jobs(created_at) where status='queued';
create index reviews_frame on public.review_decisions(frame_id);
create index experiments_owner on public.experiment_runs(owner_user_id,created_at desc);
