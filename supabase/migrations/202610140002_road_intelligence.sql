create schema if not exists extensions;
create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create table public.devices (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 name text not null check(length(name) between 1 and 80), secret_hash text not null,
 created_at timestamptz not null default now()
);
create table public.potholes (
 id uuid primary key default gen_random_uuid(), lat double precision not null check(lat between -90 and 90),
 lon double precision not null check(lon between -180 and 180),
 position extensions.geography(point,4326) generated always as (extensions.st_setsrid(extensions.st_makepoint(lon,lat),4326)::extensions.geography) stored,
 uncertainty_m real not null default 15, status text not null default 'suspected' check(status in ('suspected','corroborated','disputed','repaired')),
 sightings integer not null default 1, first_seen timestamptz not null, last_seen timestamptz not null
);
create index potholes_position on public.potholes using gist(position);
create table public.observations (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 event_id text not null, device_id uuid references public.devices on delete set null, pothole_id uuid references public.potholes,
 source text not null check(source in ('vision','imu','manual','replay')), observed_at timestamptz not null,
 lat double precision check(lat between -90 and 90), lon double precision check(lon between -180 and 180),
 accuracy_m real check(accuracy_m between 0 and 10000), confidence real check(confidence between 0 and 1),
 model_revision text, g_force real check(g_force between 0 and 655.35), evidence_path text,
 created_at timestamptz not null default now(), unique(user_id,event_id), check((lat is null) = (lon is null))
);
create table public.hazard_reports (
 pothole_id uuid references public.potholes on delete cascade, user_id uuid references auth.users on delete cascade,
 report text not null check(report in ('present','repaired','incorrect')), recorded_at timestamptz not null default now(),
 primary key(pothole_id,user_id)
);
create table public.helmet_telemetry (
 device_id uuid primary key references public.devices on delete cascade, user_id uuid not null references auth.users on delete cascade,
 recorded_at timestamptz not null default now(), camera boolean not null default false, gps boolean not null default false,
 fps real check(fps between 0 and 1000), latency_ms real check(latency_ms between 0 and 600000),
 battery_percent real check(battery_percent between 0 and 100), source text not null check(source in ('live','replay')),
 evidence_path text
);
create table public.ride_sessions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 started_at timestamptz not null, ended_at timestamptz, distance_m real not null default 0 check(distance_m>=0),
 destination text, hazard_count integer not null default 0, client_id text, unique(user_id,client_id)
);
create table public.request_budgets(user_id uuid references auth.users on delete cascade, kind text, bucket bigint, count integer not null, primary key(user_id,kind,bucket));

alter table public.devices enable row level security;
alter table public.potholes enable row level security;
alter table public.observations enable row level security;
alter table public.hazard_reports enable row level security;
alter table public.helmet_telemetry enable row level security;
alter table public.ride_sessions enable row level security;
alter table public.request_budgets enable row level security;
create policy own_devices on public.devices for select to authenticated using(user_id=auth.uid());
create policy delete_device on public.devices for delete to authenticated using(user_id=auth.uid());
create policy shared_potholes on public.potholes for select to authenticated using(true);
create policy own_observations on public.observations for select to authenticated using(user_id=auth.uid());
create policy own_reports on public.hazard_reports for select to authenticated using(user_id=auth.uid());
create policy own_telemetry on public.helmet_telemetry for select to authenticated using(user_id=auth.uid());
create policy own_rides on public.ride_sessions for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

create function public.register_device(device_name text) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare token text; identifier uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 token:=encode(gen_random_bytes(32),'hex');
 insert into devices(user_id,name,secret_hash) values(auth.uid(),device_name,encode(digest(token,'sha256'),'hex')) returning id into identifier;
 return jsonb_build_object('id',identifier,'token',token);
end $$;

create function public.ingest_observation(payload jsonb, device_secret text default null) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare owner uuid:=auth.uid(); device uuid; existing observations; candidate uuid; latitude double precision; longitude double precision; accuracy real; stamp timestamptz; kind text;
begin
 if device_secret is not null then
  select id,user_id into device,owner from devices where secret_hash=encode(digest(device_secret,'sha256'),'hex');
  if owner is null then raise exception 'Invalid device credential'; end if;
 elsif payload->>'deviceId' is not null then
  select id into device from devices where id=(payload->>'deviceId')::uuid and user_id=owner;
  if device is null then raise exception 'Device ownership mismatch'; end if;
 end if;
 if owner is null then raise exception 'Authentication required'; end if;
 if coalesce(payload->>'eventId','') !~ '^[A-Za-z0-9_.-]{1,100}$' then raise exception 'Invalid event ID'; end if;
 if payload->>'evidencePath' is not null and split_part(payload->>'evidencePath','/',1)<>owner::text then raise exception 'Evidence ownership mismatch'; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner::text||coalesce(payload->>'eventId',''),0));
 select * into existing from observations where user_id=owner and event_id=payload->>'eventId';
 if found then return jsonb_build_object('id',existing.id,'potholeId',existing.pothole_id,'duplicate',true); end if;
 kind:=payload->>'source'; stamp:=(payload->>'observedAt')::timestamptz;
 if stamp is null or abs(extract(epoch from now()-stamp))>31536000 then raise exception 'Invalid observation time'; end if;
 latitude:=(payload->'location'->>'lat')::double precision; longitude:=(payload->'location'->>'lon')::double precision; accuracy:=(payload->>'accuracyMeters')::real;
 if latitude is not null and longitude is not null and kind <> 'replay' then
  -- Spatial groups remain candidates; proximity alone never verifies a physical pothole.
  perform pg_advisory_xact_lock(14102026);
  select id into candidate from potholes where accuracy between 0 and 25 and status<>'repaired' and extensions.st_dwithin(position,extensions.st_setsrid(extensions.st_makepoint(longitude,latitude),4326)::extensions.geography,15) order by extensions.st_distance(position,extensions.st_setsrid(extensions.st_makepoint(longitude,latitude),4326)::extensions.geography) limit 1 for update;
  if candidate is null then
   insert into potholes(lat,lon,uncertainty_m,first_seen,last_seen) values(latitude,longitude,greatest(coalesce(accuracy,50),5),stamp,stamp) returning id into candidate;
  else
   update potholes set sightings=sightings+1,last_seen=greatest(last_seen,stamp),uncertainty_m=greatest(uncertainty_m,accuracy) where id=candidate;
  end if;
 end if;
 insert into observations(user_id,event_id,device_id,pothole_id,source,observed_at,lat,lon,accuracy_m,confidence,model_revision,g_force,evidence_path)
 values(owner,payload->>'eventId',device,candidate,kind,stamp,latitude,longitude,accuracy,(payload->>'confidence')::real,left(payload->>'modelRevision',200),(payload->>'gForce')::real,payload->>'evidencePath') returning * into existing;
 return jsonb_build_object('id',existing.id,'potholeId',candidate,'duplicate',false);
end $$;

create function public.update_telemetry(payload jsonb, device_secret text default null) returns void language plpgsql security definer set search_path=public,extensions as $$
declare owner uuid:=auth.uid(); device uuid;
begin
 if device_secret is not null then select id,user_id into device,owner from devices where secret_hash=encode(digest(device_secret,'sha256'),'hex');
 else select id into device from devices where id=(payload->>'device_id')::uuid and user_id=owner; end if;
 if owner is null or device is null then raise exception 'Device ownership mismatch'; end if;
 if payload->>'evidence_path' is not null and split_part(payload->>'evidence_path','/',1)<>owner::text then raise exception 'Evidence ownership mismatch'; end if;
 insert into helmet_telemetry(device_id,user_id,recorded_at,camera,gps,fps,latency_ms,battery_percent,source,evidence_path)
 values(device,owner,now(),(payload->>'camera')::boolean,(payload->>'gps')::boolean,(payload->>'fps')::real,(payload->>'latency_ms')::real,(payload->>'battery_percent')::real,payload->>'source',payload->>'evidence_path')
 on conflict(device_id) do update set recorded_at=excluded.recorded_at,camera=excluded.camera,gps=excluded.gps,fps=excluded.fps,latency_ms=excluded.latency_ms,battery_percent=excluded.battery_percent,source=excluded.source,evidence_path=excluded.evidence_path;
end $$;

create function public.report_hazard(hazard_id uuid, verdict text) returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 insert into hazard_reports(pothole_id,user_id,report) values(hazard_id,auth.uid(),verdict) on conflict(pothole_id,user_id) do update set report=excluded.report,recorded_at=now();
 update potholes set status=case
 when (select count(*) from hazard_reports where pothole_id=hazard_id and report='repaired')>=2 then 'repaired'
 when (select count(*) from hazard_reports where pothole_id=hazard_id and report='present')>=2 then 'corroborated'
 when verdict in ('incorrect','repaired') then 'disputed' else 'suspected' end where id=hazard_id;
end $$;

create function public.consume_request_budget(request_kind text, request_limit integer) returns boolean language plpgsql security definer set search_path=public as $$
declare n integer; b bigint:=floor(extract(epoch from now())/60);
begin
 if auth.uid() is null then return false; end if;
 -- Limits are server-owned; callers cannot raise their own quota.
 if request_kind not in ('assistant','routes','places') then return false; end if;
 request_limit:=case when request_kind='assistant' then 15 else 60 end;
 insert into request_budgets values(auth.uid(),request_kind,b,1) on conflict(user_id,kind,bucket) do update set count=request_budgets.count+1 returning count into n;
 delete from request_budgets where user_id=auth.uid() and bucket<b-2;
 return n<=request_limit;
end $$;

revoke all on function public.register_device(text),public.ingest_observation(jsonb,text),public.update_telemetry(jsonb,text),public.report_hazard(uuid,text),public.consume_request_budget(text,integer) from public;
grant execute on function public.register_device(text),public.report_hazard(uuid,text),public.consume_request_budget(text,integer) to authenticated;
grant execute on function public.ingest_observation(jsonb,text),public.update_telemetry(jsonb,text) to authenticated,anon;
grant select on public.potholes,public.devices,public.observations,public.hazard_reports,public.helmet_telemetry to authenticated;
grant select,insert,update,delete on public.ride_sessions to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('evidence','evidence',false,5242880,array['image/jpeg','image/png']) on conflict(id) do nothing;
create policy evidence_read on storage.objects for select to authenticated using(bucket_id='evidence' and (storage.foldername(name))[1]=auth.uid()::text);
create policy evidence_write on storage.objects for insert to authenticated with check(bucket_id='evidence' and (storage.foldername(name))[1]=auth.uid()::text);
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  alter publication supabase_realtime add table public.potholes,public.helmet_telemetry;
 end if;
end $$;

create function public.device_identity(device_secret text) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare result jsonb;
begin
 select jsonb_build_object('device_id',id,'user_id',user_id) into result from devices where secret_hash=encode(digest(device_secret,'sha256'),'hex');
 if result is null then raise exception 'Invalid device credential'; end if;
 return result;
end $$;
revoke all on function public.device_identity(text) from public;
grant execute on function public.device_identity(text) to anon,authenticated;
