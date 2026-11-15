-- Disposable local database only. All fixtures roll back; no fabricated metrics.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email,raw_user_meta_data) values
('00000000-0000-0000-0000-000000000001','a@example.invalid','{}'),
('00000000-0000-0000-0000-000000000002','b@example.invalid','{}');
insert into public.videos(id,owner_user_id,original_filename,storage_path,content_sha256,expected_bytes,use_case,upload_verified) values
('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000001','test.mp4','00000000-0000-0000-0000-000000000001/test.mp4',repeat('a',64),1,'search and rescue',true);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000002","app_metadata":{}}',true);
do $$ begin
 if (select count(*) from public.videos) <> 0 then raise exception 'Cross-user read leaked'; end if;
 if has_table_privilege('authenticated','public.videos','INSERT') then raise exception 'Client may forge ownership'; end if;
 if has_function_privilege('authenticated','public.claim_job()','EXECUTE') then raise exception 'Worker RPC exposed'; end if;
 if has_function_privilege('anon','public.enqueue_job(uuid,text,jsonb,boolean)','EXECUTE') then raise exception 'Anonymous enqueue exposed'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","app_metadata":{}}',true);
do $$ begin if (select count(*) from public.videos) <> 1 then raise exception 'Owner cannot read'; end if; end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000002","user_metadata":{"role":"admin"},"app_metadata":{}}',true);
do $$ begin if (select count(*) from public.videos) <> 0 then raise exception 'User metadata escalated privileges'; end if; end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000002","app_metadata":{"role":"admin"}}',true);
do $$ begin if (select count(*) from public.videos) <> 1 then raise exception 'Admin access missing'; end if; end $$;
reset role;
set local role service_role;
do $$ declare first_job jsonb; repeated jsonb; claimed jsonb; rerun jsonb; begin
 first_job := public.enqueue_job('00000000-0000-0000-0000-000000000010','key','{}',false);
 repeated := public.enqueue_job('00000000-0000-0000-0000-000000000010','key','{}',false);
 if first_job->>'id' <> repeated->>'id' then raise exception 'Duplicate job enqueued'; end if;
 claimed := public.claim_job();
 if claimed->>'status' <> 'processing' then raise exception 'Claim failed'; end if;
 if (select status from public.videos where id='00000000-0000-0000-0000-000000000010') <> 'processing' then raise exception 'Video status not atomic'; end if;
 perform public.finish_job((claimed->>'id')::uuid,'Intentional test failure');
 if (select status from public.videos where id='00000000-0000-0000-0000-000000000010') <> 'failed' then raise exception 'Failure not recorded'; end if;
 repeated := public.enqueue_job('00000000-0000-0000-0000-000000000010','other-key','{}',false);
 if first_job->>'id' <> repeated->>'id' then raise exception 'Implicit reprocessing allowed'; end if;
 rerun := public.enqueue_job('00000000-0000-0000-0000-000000000010','key','{}',true);
 if (rerun->>'attempt')::int <> 2 then raise exception 'Explicit reprocessing failed'; end if;
 claimed := public.claim_job();
 perform public.finish_job((claimed->>'id')::uuid,null);
 if (select status from public.videos where id='00000000-0000-0000-0000-000000000010') <> 'completed' then raise exception 'Completion not atomic'; end if;
end $$;
reset role;
do $$ declare n integer; begin
 select count(*) into n from pg_class c join pg_namespace s on s.oid=c.relnamespace
 where s.nspname='public' and c.relname in ('profiles','videos','video_frames','video_investigations','experiment_runs','processing_jobs','review_decisions') and c.relrowsecurity;
 if n<>7 then raise exception 'Missing RLS'; end if;
 if exists(select 1 from storage.buckets where id in ('videos','frames') and public) then raise exception 'Public media bucket'; end if;
end $$;
rollback;
