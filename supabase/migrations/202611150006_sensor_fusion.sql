-- Sensor readings from the Arduino (one value per second of video) and rules-based fusion results.

-- Mirror of the uploader's new columns so a fresh local database matches production; no-op in production.
alter table public.video_recordings
 add column if not exists temp jsonb,        -- deg C
 add column if not exists humidity jsonb,    -- %
 add column if not exists distance jsonb,    -- mm
 add column if not exists accel_mean jsonb,  -- mm/s^2
 add column if not exists vibration jsonb;   -- mm/s^2

alter table public.recording_results
 add column fusion_version text,             -- rules version that produced this row; watcher reprocesses on change
 add column verdict text check (verdict in ('person_confirmed','person_possible','object_unidentified','nothing_detected')),
 add column person_score real check (person_score between 0 and 1),   -- fused; max_person_confidence stays model-only
 add column review_priority text check (review_priority in ('high','medium','low')),
 add column reasons jsonb not null default '[]'::jsonb,               -- human-readable explanations of the verdict
 add column environment jsonb not null default '{}'::jsonb,           -- temp/humidity summary, hazard flags, sensor coverage
 add column sensor_timeline jsonb not null default '[]'::jsonb;       -- per second: readings, flags, person scores

create index recording_results_priority on public.recording_results(review_priority, person_score desc nulls last);
