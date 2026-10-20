-- Application administration uses checked RPCs; clients never receive service credentials.
create table public.app_access (
 user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null default 'rider' check(role in ('owner','admin','moderator','rider')),
 suspended boolean not null default false, updated_at timestamptz not null default now()
);
create table public.app_role_permissions (
 role text not null check(role in ('admin','moderator','rider')),
 permission text not null check(permission in ('hazards.read','hazards.write','users.read','users.write','data.read','data.write','devices.manage','audit.read')),
 primary key(role,permission)
);
insert into public.app_role_permissions
 select 'admin',p from unnest(array['hazards.read','hazards.write','users.read','users.write','data.read','data.write','devices.manage','audit.read']) p;
insert into public.app_role_permissions values ('moderator','hazards.read'),('moderator','hazards.write');
create table public.admin_audit (
 id uuid primary key default gen_random_uuid(), actor_id uuid references auth.users(id) on delete set null,
 action text not null, resource text not null, record_id uuid, before_data jsonb, after_data jsonb,
 created_at timestamptz not null default now()
);
create index admin_audit_time on public.admin_audit(created_at desc);
alter table public.app_access enable row level security;
alter table public.app_role_permissions enable row level security;
alter table public.admin_audit enable row level security;
revoke all on public.app_access,public.app_role_permissions,public.admin_audit from anon,authenticated;
alter table public.devices add column credential_revoked boolean not null default false;

create function public.app_account_active() returns boolean language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and not coalesce((select suspended from app_access where user_id=auth.uid()),false)
$$;
revoke all on function public.app_account_active() from public;
grant execute on function public.app_account_active() to authenticated;
create function public.admin_has(p text) returns boolean language sql stable security definer set search_path=public as $$
 select public.app_account_active() and exists(select 1 from app_access a where a.user_id=auth.uid() and
 (a.role='owner' or (p<>'roles.manage' and exists(select 1 from app_role_permissions r where r.role=a.role and r.permission=p))))
$$;
revoke all on function public.admin_has(text) from public;

-- Suspension also applies to direct client queries, not just the edge function.
do $$ declare t text; begin
 foreach t in array array['devices','potholes','observations','hazard_reports','helmet_telemetry','ride_sessions','sos_contacts','hazard_logs','inference_jobs','request_budgets'] loop
 execute format('create policy account_active on public.%I as restrictive for all to authenticated using (public.app_account_active()) with check (public.app_account_active())',t);
 end loop;
end $$;
create policy account_active_evidence on storage.objects as restrictive for all to authenticated
 using(bucket_id<>'evidence' or public.app_account_active()) with check(bucket_id<>'evidence' or public.app_account_active());
-- Legacy tables had RLS but lacked table privileges on the deployed project.
grant select,insert,update,delete on public.sos_contacts to authenticated;
grant select,insert,delete on public.hazard_logs to authenticated;
create function public.enforce_active_record_owner() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from app_access where user_id=new.user_id and suspended) then raise exception 'Account access is suspended' using errcode='42501'; end if;
 return new;
end $$;
revoke all on function public.enforce_active_record_owner() from public;
do $$ declare t text; begin
 foreach t in array array['devices','observations','helmet_telemetry','inference_jobs','ride_sessions','sos_contacts','hazard_logs'] loop
 execute format('create trigger active_owner before insert or update on public.%I for each row execute function public.enforce_active_record_owner()',t);
 end loop;
end $$;

create function public.admin_console(operation text, payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare
 actor uuid:=auth.uid(); actor_role text; resource text:=payload->>'resource'; identifier uuid;
 permissions jsonb; records jsonb; total bigint; page_no integer; page_size integer:=25; query_text text;
 projection text; required text; allowed text[]; columns_sql text; field text;
 before_row jsonb; after_row jsonb; changes jsonb:=payload->'changes'; target_role text; target_suspended boolean;
 current_access app_access; path text;
begin
 if not public.app_account_active() then raise exception 'Sign in with an active account' using errcode='42501'; end if;
 select role into actor_role from app_access where user_id=actor;
 actor_role:=coalesce(actor_role,'rider');
 select coalesce(jsonb_agg(p),'[]'::jsonb) into permissions from unnest(array['hazards.read','hazards.write','users.read','users.write','roles.manage','data.read','data.write','devices.manage','audit.read']) p where admin_has(p);
 if operation='context' then return jsonb_build_object('role',actor_role,'permissions',permissions); end if;
 if operation='overview' then
  if jsonb_array_length(permissions)=0 then raise exception 'Administrative access required' using errcode='42501'; end if;
  return jsonb_build_object('potholes',case when admin_has('hazards.read') then (select count(*) from potholes) end,'activePotholes',case when admin_has('hazards.read') then (select count(*) from potholes where status<>'repaired') end,
   'users',case when admin_has('users.read') then (select count(*) from auth.users) end,
   'devices',case when admin_has('data.read') then (select count(*) from devices) end,
   'onlineDevices',case when admin_has('data.read') then (select count(*) from devices where worker_seen_at>now()-interval '90 seconds') end,
   'queuedJobs',case when admin_has('data.read') then (select count(*) from inference_jobs where status in ('queued','processing')) end);
 end if;
 if operation='permissions' then
  if not admin_has('roles.manage') then raise exception 'Only an owner can manage roles' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) from app_role_permissions p);
 end if;
 if operation='setPermissions' then
  if not admin_has('roles.manage') then raise exception 'Only an owner can manage roles' using errcode='42501'; end if;
  target_role:=payload->>'role';
  if target_role not in ('admin','moderator','rider') or jsonb_typeof(payload->'permissions') is distinct from 'array' then raise exception 'Invalid role permissions'; end if;
  perform pg_advisory_xact_lock(20261020,1);
  select coalesce(jsonb_agg(permission order by permission),'[]'::jsonb) into before_row from app_role_permissions where role=target_role;
  if payload->'expected' is distinct from before_row then raise exception 'Permissions changed. Reload before saving.' using errcode='40001'; end if;
  delete from app_role_permissions where role=target_role;
  insert into app_role_permissions(role,permission) select target_role,value from jsonb_array_elements_text(payload->'permissions');
  insert into admin_audit(actor_id,action,resource,before_data,after_data) values(actor,'permissions.update',target_role,before_row,payload->'permissions');
  return jsonb_build_object('ok',true);
 end if;
 if operation='list' then
  page_no:=coalesce((payload->>'page')::integer,0);
  if page_no not between 0 and 100000 then raise exception 'Invalid page'; end if;
  query_text:=left(coalesce(payload->>'query',''),100);
  if resource='users' then
   required:='users.read';
   projection:='select u.id,u.email,left(coalesce(u.raw_user_meta_data->>''name'',''''),120) as name,u.created_at,u.last_sign_in_at,u.email_confirmed_at,coalesce(a.role,''rider'') as role,coalesce(a.suspended,false) as suspended,a.updated_at from auth.users u left join public.app_access a on a.user_id=u.id';
  elsif resource='audit' then
   required:='audit.read';projection:='select id,actor_id,action,resource,record_id,before_data,after_data,created_at from public.admin_audit';
  elsif resource='potholes' then
   required:='hazards.read';projection:='select id,lat,lon,uncertainty_m,status,sightings,first_seen,last_seen from public.potholes';
  elsif resource='devices' then
   required:='data.read';projection:='select id,user_id,name,worker_seen_at,worker_model,credential_revoked,created_at from public.devices';
  elsif resource in ('observations','inference_jobs','helmet_telemetry','ride_sessions','hazard_reports','sos_contacts','hazard_logs','request_budgets') then
   required:='data.read';projection:=format('select * from public.%I',resource);
  else raise exception 'Unknown dataset';
  end if;
  if not admin_has(required) then raise exception 'Permission denied: %',required using errcode='42501'; end if;
  execute 'select count(*) from ('||projection||') t where to_jsonb(t)::text ilike $1' into total using '%'||query_text||'%';
  execute 'select coalesce(jsonb_agg(row_data),''[]''::jsonb) from (select to_jsonb(t) as row_data from ('||projection||') t where to_jsonb(t)::text ilike $1 order by coalesce(to_jsonb(t)->>''created_at'',to_jsonb(t)->>''recorded_at'',to_jsonb(t)->>''observed_at'',to_jsonb(t)->>''last_seen'','''') desc, to_jsonb(t)::text limit $2 offset $3) rows' into records using '%'||query_text||'%',page_size,page_no*page_size;
  if resource not in ('potholes','audit') then insert into admin_audit(actor_id,action,resource,after_data) values(actor,'data.read',resource,jsonb_build_object('page',page_no,'rows',jsonb_array_length(records))); end if;
  return jsonb_build_object('rows',records,'total',total,'page',page_no,'pageSize',page_size);
 end if;
 identifier:=(payload->>'id')::uuid;
 if operation='user' then
  if not admin_has('users.write') then raise exception 'Permission denied: users.write' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(20261020,1);
  if not exists(select 1 from auth.users where id=identifier) then raise exception 'User not found'; end if;
  select * into current_access from app_access where user_id=identifier for update;
  target_role:=coalesce(payload->>'role',coalesce(current_access.role,'rider'));
  target_suspended:=coalesce((payload->>'suspended')::boolean,coalesce(current_access.suspended,false));
  if target_role not in ('owner','admin','moderator','rider') then raise exception 'Invalid role'; end if;
  if payload->>'expectedRole' is distinct from coalesce(current_access.role,'rider') or (payload->>'expectedSuspended')::boolean is distinct from coalesce(current_access.suspended,false) then raise exception 'User access changed. Reload before saving.' using errcode='40001'; end if;
  if target_role<>coalesce(current_access.role,'rider') and not admin_has('roles.manage') then raise exception 'Only an owner can assign roles' using errcode='42501'; end if;
  if actor_role<>'owner' and coalesce(current_access.role,'rider') in ('owner','admin') then raise exception 'Only an owner can manage an administrator' using errcode='42501'; end if;
  if identifier=actor and target_suspended then raise exception 'You cannot suspend your own account'; end if;
  if current_access.role='owner' and not current_access.suspended and (target_role<>'owner' or target_suspended) and (select count(*) from app_access where role='owner' and not suspended)<=1 then raise exception 'The last active owner cannot be removed'; end if;
  if payload->>'name' is null or length(trim(payload->>'name')) not between 1 and 120 then raise exception 'Name must contain 1–120 characters'; end if;
  before_row:=jsonb_build_object('role',coalesce(current_access.role,'rider'),'suspended',coalesce(current_access.suspended,false),'name',(select raw_user_meta_data->>'name' from auth.users where id=identifier));
  insert into app_access(user_id,role,suspended) values(identifier,target_role,target_suspended) on conflict(user_id) do update set role=excluded.role,suspended=excluded.suspended,updated_at=now();
  update auth.users set raw_user_meta_data=coalesce(raw_user_meta_data,'{}'::jsonb)||jsonb_build_object('name',trim(payload->>'name')) where id=identifier;
  after_row:=jsonb_build_object('role',target_role,'suspended',target_suspended,'name',trim(payload->>'name'));
  insert into admin_audit(actor_id,action,resource,record_id,before_data,after_data) values(actor,'user.update','users',identifier,before_row,after_row);
  return jsonb_build_object('ok',true);
 end if;
 if operation='evidence' then
  if not admin_has('data.read') then raise exception 'Permission denied: data.read' using errcode='42501'; end if;
  if resource='observations' then select evidence_path into path from observations where id=identifier;
  elsif resource='inference_jobs' then select coalesce(result->>'annotatedPath',evidence_path) into path from inference_jobs where id=identifier;
  else raise exception 'Evidence is only available for observations or photo jobs'; end if;
  if path is null then raise exception 'No evidence is available'; end if;
  insert into admin_audit(actor_id,action,resource,record_id) values(actor,'evidence.view',resource,identifier);
  return jsonb_build_object('path',path);
 end if;
 if operation='deviceRevoke' then
  if not admin_has('devices.manage') then raise exception 'Permission denied: devices.manage' using errcode='42501'; end if;
  select to_jsonb(d)-'secret_hash' into before_row from devices d where id=identifier for update;
  if before_row is null then raise exception 'Device not found'; end if;
  update devices set secret_hash=encode(digest(encode(gen_random_bytes(32),'hex'),'sha256'),'hex'),credential_revoked=true,worker_seen_at=null where id=identifier;
  insert into admin_audit(actor_id,action,resource,record_id,before_data) values(actor,'device.revoke','devices',identifier,before_row);
  return jsonb_build_object('ok',true);
 end if;
 if operation='job' then
  if not admin_has('data.write') then raise exception 'Permission denied: data.write' using errcode='42501'; end if;
  select to_jsonb(j) into before_row from inference_jobs j where id=identifier for update;
  if before_row is null then raise exception 'Photo job not found'; end if;
  if before_row->>'status' is distinct from payload->>'expectedStatus' then raise exception 'Job changed. Reload before saving.' using errcode='40001'; end if;
  if payload->>'command'='cancel' and before_row->>'status' in ('queued','processing') then
   update inference_jobs set status='cancelled',completed_at=now(),lease_until=null where id=identifier;
  elsif payload->>'command'='retry' and before_row->>'status' in ('failed','cancelled') then
   if (select count(*) from inference_jobs where user_id=(before_row->>'user_id')::uuid and status in ('queued','processing'))>=20 then raise exception 'This rider has too many pending jobs'; end if;
   update inference_jobs set status='queued',attempt_base=attempts,error=null,lease_until=null,started_at=null,completed_at=null,result=null where id=identifier;
  else raise exception 'This job cannot perform that action'; end if;
  insert into admin_audit(actor_id,action,resource,record_id,before_data,after_data) values(actor,'job.'||(payload->>'command'),'inference_jobs',identifier,jsonb_build_object('status',before_row->>'status'),jsonb_build_object('command',payload->>'command'));
  return jsonb_build_object('ok',true);
 end if;
 if operation='save' then
  if resource='potholes' then required:='hazards.write';allowed:=array['lat','lon','uncertainty_m','status'];
  elsif resource='devices' then required:='devices.manage';allowed:=array['name'];
  elsif resource='observations' then required:='data.write';allowed:=array['lat','lon','accuracy_m','confidence'];
  elsif resource='ride_sessions' then required:='data.write';allowed:=array['destination','distance_m','hazard_count'];
  elsif resource='sos_contacts' then required:='data.write';allowed:=array['name','phone'];
  else raise exception 'This dataset is read-only. Use its dedicated lifecycle controls.'; end if;
  if not admin_has(required) then raise exception 'Permission denied: %',required using errcode='42501'; end if;
  if jsonb_typeof(changes) is distinct from 'object' or changes='{}'::jsonb then raise exception 'No valid changes'; end if;
  for field in select jsonb_object_keys(changes) loop
   if not field=any(allowed) then raise exception 'Field cannot be edited: %',field; end if;
  end loop;
  if resource='potholes' and ((changes ? 'uncertainty_m' and coalesce((changes->>'uncertainty_m')::real,-1) not between 0 and 10000) or (changes ? 'status' and coalesce(changes->>'status','') not in ('suspected','corroborated','disputed','repaired'))) then raise exception 'Invalid pothole status or uncertainty'; end if;
  if resource='devices' and coalesce(length(trim(changes->>'name')),0) not between 1 and 80 then raise exception 'Device name must contain 1–80 characters'; end if;
  if resource='sos_contacts' and ((changes ? 'name' and coalesce(length(trim(changes->>'name')),0) not between 1 and 120) or (changes ? 'phone' and coalesce(changes->>'phone','') !~ '^\+?[0-9 ()-]{7,25}$')) then raise exception 'Invalid emergency contact'; end if;
  if identifier is null then
   if resource<>'potholes' then raise exception 'Only potholes can be created here'; end if;
   insert into potholes(lat,lon,uncertainty_m,status,first_seen,last_seen) values((changes->>'lat')::double precision,(changes->>'lon')::double precision,coalesce((changes->>'uncertainty_m')::real,15),coalesce(changes->>'status','suspected'),now(),now()) returning to_jsonb(potholes)-'position' into after_row;
   identifier:=(after_row->>'id')::uuid;
  else
   execute format('select to_jsonb(t)-''secret_hash''-''position'' from public.%I t where id=$1 for update',resource) into before_row using identifier;
   if before_row is null then raise exception 'Record not found'; end if;
   for field in select jsonb_object_keys(changes) loop
    if not coalesce(payload->'expected','{}'::jsonb) ? field or before_row->field is distinct from payload->'expected'->field then raise exception 'Record changed. Reload before saving.' using errcode='40001'; end if;
   end loop;
   select string_agg(format('%I=(jsonb_populate_record(null::public.%I,$1)).%I',k,resource,k),',') into columns_sql from jsonb_object_keys(changes) k;
   execute format('update public.%I t set %s where id=$2 returning to_jsonb(t)-''secret_hash''-''position''',resource,columns_sql) into after_row using changes,identifier;
  end if;
  insert into admin_audit(actor_id,action,resource,record_id,before_data,after_data) values(actor,case when before_row is null then 'record.create' else 'record.update' end,resource,identifier,before_row,after_row);
  return jsonb_build_object('ok',true,'record',after_row);
 end if;
 raise exception 'Unknown administration operation';
end $$;
revoke all on function public.admin_console(text,jsonb) from public;
grant execute on function public.admin_console(text,jsonb) to authenticated;
create trigger active_owner before insert or update on public.hazard_reports for each row execute function public.enforce_active_record_owner();
create or replace function public.device_identity(device_secret text) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare result jsonb;
begin
 select jsonb_build_object('device_id',d.id,'user_id',d.user_id) into result from devices d where d.secret_hash=encode(digest(device_secret,'sha256'),'hex') and not d.credential_revoked and not exists(select 1 from app_access a where a.user_id=d.user_id and a.suspended);
 if result is null then raise exception 'Invalid or suspended device credential' using errcode='42501'; end if;
 return result;
end $$;
