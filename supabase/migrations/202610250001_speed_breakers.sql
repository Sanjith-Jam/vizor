-- Shared speed breakers: rider marks plus helmet bump clusters, and a cache of
-- OpenStreetMap (Overpass) responses so clients need not wait on public mirrors.

create table public.speed_breakers (
 id uuid primary key default gen_random_uuid(),
 lat double precision not null check(lat between -90 and 90), lon double precision not null check(lon between -180 and 180),
 position extensions.geography(point,4326) generated always as (extensions.st_setsrid(extensions.st_makepoint(lon,lat),4326)::extensions.geography) stored,
 -- candidate: bumps only, hidden; suspected: shown as "possible"; confirmed; removed.
 status text not null default 'candidate' check(status in ('candidate','suspected','confirmed','removed')),
 rider_marks integer not null default 0, bump_riders integer not null default 0, removal_votes integer not null default 0,
 first_seen timestamptz not null default now(), last_seen timestamptz not null default now()
);
create index speed_breakers_position on public.speed_breakers using gist(position);
create table public.speed_breaker_reports (
 speed_breaker_id uuid not null references public.speed_breakers on delete cascade,
 user_id uuid not null references auth.users on delete cascade,
 kind text not null check(kind in ('mark','bump','removed')),
 recorded_at timestamptz not null default now(),
 primary key(speed_breaker_id,user_id,kind)
);
create table public.osm_cache (
 key text primary key check(length(key) between 8 and 128),
 fetched_at timestamptz not null default now(),
 elements jsonb not null
);
alter table public.speed_breakers enable row level security;
alter table public.speed_breaker_reports enable row level security;
alter table public.osm_cache enable row level security;
create policy shared_speed_breakers on public.speed_breakers for select to authenticated using(status in ('suspected','confirmed'));
create policy own_speed_breaker_reports on public.speed_breaker_reports for select to authenticated using(user_id=auth.uid());
create policy read_osm_cache on public.osm_cache for select to authenticated using(true);

-- Status from distinct riders. Bumps alone never confirm: a cluster of bumps
-- may equally be a persistent pothole, so it is only ever "possible".
create function public.speed_breaker_status(marks integer, bumps integer, removals integer) returns text language sql immutable as $$
 select case
  when removals>=2 and removals>marks then 'removed'
  when marks>=2 or (marks>=1 and bumps>=2) then 'confirmed'
  when marks>=1 or bumps>=3 then 'suspected'
  else 'candidate' end
$$;

create function public.record_speed_breaker(reporter uuid, latitude double precision, longitude double precision, verdict text, stamp timestamptz default now()) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare candidate uuid; here extensions.geography; result speed_breakers;
begin
 if reporter is null then raise exception 'Authentication required'; end if;
 if verdict not in ('mark','bump','removed') then raise exception 'Invalid speed breaker report'; end if;
 if latitude is null or longitude is null or latitude not between -90 and 90 or longitude not between -180 and 180 then raise exception 'Invalid location'; end if;
 here:=extensions.st_setsrid(extensions.st_makepoint(longitude,latitude),4326)::extensions.geography;
 perform pg_advisory_xact_lock(25102026);
 select id into candidate from speed_breakers where status<>'removed' and extensions.st_dwithin(position,here,15) order by extensions.st_distance(position,here) limit 1 for update;
 if candidate is null then
  if verdict='removed' then return jsonb_build_object('id',null,'status','none'); end if;
  insert into speed_breakers(lat,lon,first_seen,last_seen) values(latitude,longitude,stamp,stamp) returning id into candidate;
 end if;
 insert into speed_breaker_reports(speed_breaker_id,user_id,kind,recorded_at) values(candidate,reporter,verdict,stamp)
 on conflict(speed_breaker_id,user_id,kind) do update set recorded_at=greatest(speed_breaker_reports.recorded_at,excluded.recorded_at);
 -- A rider who marks a spot withdraws an earlier removal vote there, and vice versa.
 if verdict='mark' then delete from speed_breaker_reports where speed_breaker_id=candidate and user_id=reporter and kind='removed'; end if;
 if verdict='removed' then delete from speed_breaker_reports where speed_breaker_id=candidate and user_id=reporter and kind='mark'; end if;
 update speed_breakers s set
  rider_marks=c.marks, bump_riders=c.bumps, removal_votes=c.removals,
  status=speed_breaker_status(c.marks,c.bumps,c.removals),
  last_seen=greatest(s.last_seen,stamp)
 from (select count(*) filter(where kind='mark')::int marks, count(*) filter(where kind='bump')::int bumps, count(*) filter(where kind='removed')::int removals
       from speed_breaker_reports where speed_breaker_id=candidate) c
 where s.id=candidate returning s.* into result;
 return jsonb_build_object('id',result.id,'status',result.status,'riderMarks',result.rider_marks,'bumpRiders',result.bump_riders);
end $$;

create function public.report_speed_breaker(latitude double precision, longitude double precision, verdict text default 'mark') returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if verdict not in ('mark','removed') then raise exception 'Invalid speed breaker report'; end if;
 return record_speed_breaker(auth.uid(),latitude,longitude,verdict);
end $$;

-- Every helmet IMU bump with a usable fix also counts toward a speed breaker
-- cluster at that spot (one vote per rider), alongside the pothole candidate.
create function public.observation_speed_breaker_bump() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.source='imu' and new.lat is not null and coalesce(new.accuracy_m,50)<=25 then
  perform record_speed_breaker(new.user_id,new.lat,new.lon,'bump',new.observed_at);
 end if;
 return new;
end $$;
create trigger observations_speed_breaker_bump after insert on public.observations
 for each row execute function public.observation_speed_breaker_bump();

-- The API stores Overpass responses it fetched; clients only read the cache.
create function public.store_osm_cache(cache_key text, payload jsonb) returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if jsonb_typeof(payload)<>'array' or octet_length(payload::text)>5000000 then raise exception 'Invalid road data'; end if;
 insert into osm_cache(key,fetched_at,elements) values(cache_key,now(),payload)
 on conflict(key) do update set fetched_at=now(),elements=excluded.elements;
 delete from osm_cache where fetched_at<now()-interval '7 days';
end $$;

revoke all on function public.store_osm_cache(text,jsonb) from public;
grant execute on function public.store_osm_cache(text,jsonb) to authenticated;
revoke all on function public.speed_breaker_status(integer,integer,integer),public.record_speed_breaker(uuid,double precision,double precision,text,timestamptz),public.report_speed_breaker(double precision,double precision,text),public.observation_speed_breaker_bump() from public;
grant execute on function public.report_speed_breaker(double precision,double precision,text) to authenticated;

-- Same budget function with two more kinds: road data lookups and speed
-- breaker reports (a rider marks a handful per ride, never dozens a minute).
create or replace function public.consume_request_budget(request_kind text, request_limit integer) returns boolean language plpgsql security definer set search_path=public as $$
declare n integer; b bigint:=floor(extract(epoch from now())/60);
begin
 if auth.uid() is null then return false; end if;
 -- Limits are server-owned; callers cannot raise their own quota.
 if request_kind not in ('assistant','routes','places','roadData','speedBreaker') then return false; end if;
 request_limit:=case request_kind when 'assistant' then 15 when 'roadData' then 40 when 'speedBreaker' then 10 else 60 end;
 insert into request_budgets values(auth.uid(),request_kind,b,1) on conflict(user_id,kind,bucket) do update set count=request_budgets.count+1 returning count into n;
 delete from request_budgets where user_id=auth.uid() and bucket<b-2;
 return n<=request_limit;
end $$;
