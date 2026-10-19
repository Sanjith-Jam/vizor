-- Claim attempts stay monotonic across manual retries, fencing late worker results.
alter table public.inference_jobs add column attempt_base integer not null default 0;
create or replace function public.claim_inference(device_secret text) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare owner uuid; device uuid; j inference_jobs;
begin
 select id,user_id into device,owner from devices where secret_hash=encode(digest(device_secret,'sha256'),'hex');
 if device is null then raise exception 'Invalid device credential'; end if;
 perform pg_advisory_xact_lock(hashtextextended(device::text,19));
 update inference_jobs set status='failed',error='Worker did not finish after three attempts',completed_at=now()
 where device_id=device and status='processing' and lease_until<now() and attempts>=attempt_base+3;
 select * into j from inference_jobs where device_id=device and user_id=owner and
  (status='queued' or (status='processing' and lease_until<now() and attempts<attempt_base+3))
  order by created_at for update skip locked limit 1;
 if not found then return null; end if;
 update inference_jobs set status='processing',started_at=now(),lease_until=now()+interval '3 minutes',attempts=attempts+1,error=null where id=j.id returning * into j;
 return to_jsonb(j);
end $$;

create or replace function public.retry_inference(job_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,19));
 if (select count(*) from inference_jobs where user_id=auth.uid() and status in ('queued','processing'))>=20 then raise exception 'Finish existing uploads first'; end if;
 update inference_jobs set status='queued',attempt_base=attempts,error=null,lease_until=null,started_at=null,completed_at=null,result=null where id=job_id and user_id=auth.uid() and status in ('failed','cancelled');
 if not found then raise exception 'This upload cannot be retried'; end if;
end $$;
