-- Result folders in the recording-results bucket are now named '<recorded_at UTC>_<recording id>'
-- (e.g. 20261115T074418Z_41516563-...). Match the recording by the trailing 36-character ID, which
-- also keeps older folders named by the bare ID readable.
drop policy recording_results_media_read on storage.objects;
create policy recording_results_media_read on storage.objects for select to authenticated using (
 bucket_id = 'recording-results'
 and exists (select 1 from public.video_recordings r where r.id::text = right((storage.foldername(name))[1], 36))
);
