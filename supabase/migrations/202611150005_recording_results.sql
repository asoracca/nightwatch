-- Results of processing Arduino recordings (public.video_recordings) with YOLO11n + ByteTrack.
-- Written only by the local processor (backend/nightwatch/recordings.py) using the service role.

-- video_recordings was created outside these migrations by the Arduino uploader.
-- This mirrors its columns so a fresh local database can apply this file; it is a no-op in production.
create table if not exists public.video_recordings (
 id uuid primary key default gen_random_uuid(),
 device_id text not null,
 recorded_at timestamptz not null,
 uploaded_at timestamptz not null default now(),
 duration_seconds integer, width integer, height integer, fps integer,
 file_size_bytes bigint,
 storage_path text not null
);

create table public.recording_results (
 id uuid primary key default gen_random_uuid(),
 recording_id uuid not null unique references public.video_recordings(id) on delete cascade,
 device_id text not null,
 status text not null check (status in ('completed','failed')),
 error_message text,
 model_name text,
 model_version text,
 config jsonb not null default '{}'::jsonb,           -- sampling fps, threshold, review floor, conditions
 video_meta jsonb,                                    -- ffprobe: duration, fps, width, height
 total_frames integer check (total_frames >= 0),      -- sampled condition-frames
 frames_with_detections integer check (frames_with_detections >= 0),
 total_detections integer check (total_detections >= 0),           -- confidence >= threshold
 review_candidate_count integer check (review_candidate_count >= 0), -- frames with a review-band detection
 average_confidence real,
 max_person_confidence real,                          -- highest 'person' confidence, any band; null if none
 label_counts jsonb not null default '{}'::jsonb,     -- accepted detections per label, e.g. {"person": 4}
 summary jsonb,                                       -- full summary incl. per-condition breakdown
 frames jsonb not null default '[]'::jsonb,           -- per-frame detections; image = path in recording-results bucket
 annotated_clips jsonb not null default '{}'::jsonb,  -- condition -> MP4 path in recording-results bucket
 processed_at timestamptz not null default now()
);
create index recording_results_device_time on public.recording_results(device_id, processed_at desc);

-- Readable by anyone who can read the underlying recording (inherits video_recordings' RLS).
alter table public.recording_results enable row level security;
create policy recording_results_read on public.recording_results for select to authenticated
 using (exists (select 1 from public.video_recordings r where r.id = recording_id));
revoke all on public.recording_results from anon, authenticated;
grant select on public.recording_results to authenticated;
grant all on public.recording_results to service_role;

-- Annotated frames and clips, stored under <recording_id>/...
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types) values
 ('recording-results', 'recording-results', false, 52428800, array['image/jpeg', 'video/mp4'])
on conflict (id) do nothing;
create policy recording_results_media_read on storage.objects for select to authenticated using (
 bucket_id = 'recording-results'
 and exists (select 1 from public.video_recordings r where r.id::text = (storage.foldername(name))[1])
);
