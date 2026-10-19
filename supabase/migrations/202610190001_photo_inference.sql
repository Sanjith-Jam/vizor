-- Authenticated photo jobs are pulled by the owner's device; no public Pi port.
alter table public.devices add column worker_seen_at timestamptz, add column worker_model text;
create function public.worker_heartbeat(device_secret text,model_revision text) returns void language plpgsql security definer set search_path=public,extensions as $$
begin
 if coalesce(length(model_revision),0) not between 1 and 200 then raise exception 'Invalid model revision'; end if;
 update devices set worker_seen_at=now(),worker_model=model_revision where secret_hash=encode(digest(device_secret,'sha256'),'hex');
 if not found then raise exception 'Invalid device credential'; end if;
end $$;
revoke all on function public.worker_heartbeat(text,text) from public;
grant execute on function public.worker_heartbeat(text,text) to anon,authenticated;
create table public.inference_jobs (
 id uuid primary key, user_id uuid not null references auth.users on delete cascade,
 device_id uuid not null references public.devices on delete cascade,
 evidence_path text not null, lat double precision not null check(lat between -90 and 90),
 lon double precision not null check(lon between -180 and 180),
 mode text not null check(mode in ('demo','report')),
 status text not null default 'queued' check(status in ('queued','processing','completed','failed','cancelled')),
 created_at timestamptz not null default now(), started_at timestamptz, completed_at timestamptz,
 lease_until timestamptz, attempts integer not null default 0, result jsonb, error text
);
create index inference_jobs_queue on public.inference_jobs(device_id,status,created_at);
alter table public.inference_jobs enable row level security;
create policy own_inference_jobs on public.inference_jobs for select to authenticated using(user_id=auth.uid());
grant select on public.inference_jobs to authenticated;

create function public.queue_inference(payload jsonb) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare j inference_jobs; owner uuid:=auth.uid(); identifier uuid:=(payload->>'id')::uuid; device uuid:=(payload->>'deviceId')::uuid;
begin
 if owner is null then raise exception 'Authentication required'; end if;
 if not exists(select 1 from devices where id=device and user_id=owner) then raise exception 'Device ownership mismatch'; end if;
 if payload->>'mode'='report' and coalesce((payload->>'locationConfirmed')::boolean,false) is not true then raise exception 'Confirm the photo location'; end if;
 if payload->>'evidencePath'<>owner::text||'/inference-'||identifier::text||'.jpg' then raise exception 'Evidence ownership mismatch'; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner::text,19));
 select * into j from inference_jobs where id=identifier;
 if found then
  if j.user_id<>owner then raise exception 'Job ownership mismatch'; end if;
  return to_jsonb(j);
 end if;
 if (select count(*) from inference_jobs where user_id=owner and status in ('queued','processing'))>=20 then raise exception 'Finish or cancel existing uploads first'; end if;
 if not exists(select 1 from storage.objects where bucket_id='evidence' and name=payload->>'evidencePath') then raise exception 'Upload the photo first'; end if;
 insert into inference_jobs(id,user_id,device_id,evidence_path,lat,lon,mode)
 values(identifier,owner,device,payload->>'evidencePath',(payload->'location'->>'lat')::double precision,(payload->'location'->>'lon')::double precision,payload->>'mode') returning * into j;
 return to_jsonb(j);
end $$;

create function public.claim_inference(device_secret text) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare owner uuid; device uuid; j inference_jobs;
begin
 select id,user_id into device,owner from devices where secret_hash=encode(digest(device_secret,'sha256'),'hex');
 if device is null then raise exception 'Invalid device credential'; end if;
 perform pg_advisory_xact_lock(hashtextextended(device::text,19));
 update inference_jobs set status='failed',error='Worker did not finish after three attempts',completed_at=now()
 where device_id=device and status='processing' and lease_until<now() and attempts>=3;
 select * into j from inference_jobs where device_id=device and user_id=owner and
  (status='queued' or (status='processing' and lease_until<now() and attempts<3))
  order by created_at for update skip locked limit 1;
 if not found then return null; end if;
 update inference_jobs set status='processing',started_at=now(),lease_until=now()+interval '3 minutes',attempts=attempts+1,error=null where id=j.id returning * into j;
 return to_jsonb(j);
end $$;

create function public.finish_inference(job_id uuid,device_secret text,result_payload jsonb default null,failure text default null,claim_attempt integer default 0) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare owner uuid; device uuid; j inference_jobs; d jsonb; idx integer:=0; observation jsonb; observations_result jsonb:='[]'::jsonb; box jsonb; v real; confidence real:=0;
begin
 select id,user_id into device,owner from devices where secret_hash=encode(digest(device_secret,'sha256'),'hex');
 if device is null then raise exception 'Invalid device credential'; end if;
 select * into j from inference_jobs where id=job_id and device_id=device and user_id=owner for update;
 if not found then raise exception 'Job ownership mismatch'; end if;
 if j.status='completed' then return to_jsonb(j); end if;
 if j.status<>'processing' or j.attempts<>claim_attempt or j.lease_until<now() then raise exception 'Job lease is no longer valid'; end if;
 if failure is not null then
  update inference_jobs set status='failed',error=left(failure,300),completed_at=now(),lease_until=null where id=j.id returning * into j;
  return to_jsonb(j);
 end if;
 if result_payload is null or jsonb_typeof(result_payload->'detections') is distinct from 'array' or jsonb_array_length(result_payload->'detections')>20
 or coalesce(length(result_payload->>'modelRevision'),0) not between 1 and 200
 or coalesce((result_payload->>'inferenceMs')::double precision,-1) not between 0 and 600000
 or coalesce((result_payload->>'imageWidth')::integer,0) not between 1 and 8192
 or coalesce((result_payload->>'imageHeight')::integer,0) not between 1 and 8192 then raise exception 'Invalid inference result'; end if;
 if result_payload->>'annotatedPath' is not null and split_part(result_payload->>'annotatedPath','/',1)<>owner::text then raise exception 'Evidence ownership mismatch'; end if;
 for d in select value from jsonb_array_elements(result_payload->'detections') loop
  box:=d->'bbox';
  if coalesce((d->>'confidence')::double precision,-1) not between 0 and 1 or jsonb_typeof(box) is distinct from 'array' or jsonb_array_length(box)<>4 then raise exception 'Invalid detection'; end if;
  for v in select value::text::real from jsonb_array_elements(box) loop
   if v is null or v not between 0 and 1 then raise exception 'Invalid bounding box'; end if;
  end loop;
  if (box->>0)::real>=(box->>2)::real or (box->>1)::real>=(box->>3)::real then raise exception 'Invalid bounding box'; end if;
  confidence:=greatest(confidence,(d->>'confidence')::real);
 end loop;
 -- A photo provides one approximate map position even when several boxes are detected.
 if jsonb_array_length(result_payload->'detections')>0 then
  observation:=public.ingest_observation(jsonb_build_object('eventId','photo-'||j.id::text,'source',case when j.mode='demo' then 'replay' else 'vision' end,
   'observedAt',now(),'location',jsonb_build_object('lat',j.lat,'lon',j.lon),'accuracyMeters',null,'confidence',confidence,
   'modelRevision',result_payload->>'modelRevision','evidencePath',coalesce(result_payload->>'annotatedPath',j.evidence_path)),device_secret);
  observations_result:=jsonb_build_array(observation);
 end if;
 update inference_jobs set status='completed',result=result_payload||jsonb_build_object('observations',observations_result),completed_at=now(),lease_until=null,error=null where id=j.id returning * into j;
 return to_jsonb(j);
end $$;

create function public.cancel_inference(job_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 update inference_jobs set status='cancelled',completed_at=now(),lease_until=null where id=job_id and user_id=auth.uid() and status in ('queued','processing');
 if not found then raise exception 'This upload cannot be cancelled'; end if;
end $$;
create function public.retry_inference(job_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if (select count(*) from inference_jobs where user_id=auth.uid() and status in ('queued','processing'))>=20 then raise exception 'Finish existing uploads first'; end if;
 update inference_jobs set status='queued',attempts=0,error=null,lease_until=null,started_at=null,completed_at=null,result=null where id=job_id and user_id=auth.uid() and status in ('failed','cancelled');
 if not found then raise exception 'This upload cannot be retried'; end if;
end $$;
revoke all on function public.queue_inference(jsonb),public.claim_inference(text),public.finish_inference(uuid,text,jsonb,text,integer),public.cancel_inference(uuid) from public;
grant execute on function public.queue_inference(jsonb),public.cancel_inference(uuid) to authenticated;
grant execute on function public.claim_inference(text),public.finish_inference(uuid,text,jsonb,text,integer) to anon,authenticated;
revoke all on function public.retry_inference(uuid) from public;
grant execute on function public.retry_inference(uuid) to authenticated;
alter publication supabase_realtime add table public.inference_jobs;
alter publication supabase_realtime add table public.observations,public.devices;
