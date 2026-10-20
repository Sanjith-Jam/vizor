-- Run against a migrated development database; all fixtures and mutations roll back.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('e0000000-0000-4000-8000-000000000001','owner-admin-test@example.invalid','{"name":"Test owner"}'),
 ('e0000000-0000-4000-8000-000000000002','rider-admin-test@example.invalid','{"name":"Test rider","role":"owner"}'),
 ('e0000000-0000-4000-8000-000000000003','moderator-admin-test@example.invalid','{"name":"Test moderator"}'),
 ('e0000000-0000-4000-8000-000000000004','staff-admin-test@example.invalid','{"name":"Test admin"}');
insert into public.app_access(user_id,role) values
 ('e0000000-0000-4000-8000-000000000001','owner'),('e0000000-0000-4000-8000-000000000003','moderator'),('e0000000-0000-4000-8000-000000000004','admin');
-- Temporarily demote other owners only inside this rollback transaction, to exercise last-owner protection.
update public.app_access set role='admin' where role='owner' and user_id<>'e0000000-0000-4000-8000-000000000001';
insert into public.potholes(id,lat,lon,uncertainty_m,first_seen,last_seen) values('e1000000-0000-4000-8000-000000000001',12.9,79.1,15,now(),now());
insert into public.devices(id,user_id,name,secret_hash) values('e2000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000002','Test Pi',encode(extensions.digest(repeat('a',64),'sha256'),'hex'));
insert into public.inference_jobs(id,user_id,device_id,evidence_path,lat,lon,mode,attempts) values('e3000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000004','e2000000-0000-4000-8000-000000000001','fixture.jpg',12.9,79.1,'demo',3);
set local role anon;
do $$ begin
 begin perform public.admin_console('list','{"resource":"users"}'); raise exception 'Anonymous admin access was allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000002',true);
do $$ begin
 if public.admin_console('context')->>'role'<>'rider' then raise exception 'Editable metadata elevated user'; end if;
 begin perform public.admin_console('list','{"resource":"users"}'); raise exception 'Rider read user data'; exception when insufficient_privilege then null; end;
 begin perform public.admin_console('evidence','{"resource":"observations","id":"e1000000-0000-4000-8000-000000000001"}'); raise exception 'Rider read private evidence'; exception when insufficient_privilege then null; end;
 begin perform public.admin_console('setPermissions','{"role":"rider","permissions":["data.read"],"expected":[]}'); raise exception 'Rider granted permissions'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000003',true);
do $$ begin
 perform public.admin_console('list','{"resource":"potholes"}');
 begin perform public.admin_console('list','{"resource":"observations"}'); raise exception 'Moderator read private data'; exception when insufficient_privilege then null; end;
 begin perform public.admin_console('save','{"resource":"potholes","id":"e1000000-0000-4000-8000-000000000001","changes":{"user_id":"e0000000-0000-4000-8000-000000000003"},"expected":{"user_id":null}}'); raise exception 'Protected column changed'; exception when raise_exception then if sqlerrm not like 'Field cannot be edited:%' then raise; end if; end;
 perform public.admin_console('save','{"resource":"potholes","id":"e1000000-0000-4000-8000-000000000001","changes":{"status":"repaired"},"expected":{"status":"suspected"}}');
 begin perform public.admin_console('save','{"resource":"potholes","id":"e1000000-0000-4000-8000-000000000001","changes":{"status":"disputed"},"expected":{"status":"suspected"}}'); raise exception 'Stale write allowed'; exception when serialization_failure then null; end;
end $$;
select set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000004',true);
do $$ begin
 begin perform public.admin_console('user','{"id":"e0000000-0000-4000-8000-000000000002","name":"Test rider","role":"owner","suspended":false,"expectedRole":"rider","expectedSuspended":false}'); raise exception 'Admin granted ownership'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000001',true);
do $$ begin
 begin perform public.admin_console('user','{"id":"e0000000-0000-4000-8000-000000000001","name":"Test owner","role":"rider","suspended":false,"expectedRole":"owner","expectedSuspended":false}'); raise exception 'Last owner removed'; exception when raise_exception then if sqlerrm<>'The last active owner cannot be removed' then raise; end if; end;
 perform public.admin_console('job','{"id":"e3000000-0000-4000-8000-000000000001","command":"cancel","expectedStatus":"queued"}');
 perform public.admin_console('job','{"id":"e3000000-0000-4000-8000-000000000001","command":"retry","expectedStatus":"cancelled"}');
 if not exists(select 1 from jsonb_array_elements(public.admin_console('list','{"resource":"inference_jobs","query":"e3000000-0000-4000-8000-000000000001"}')->'rows') j where j->>'status'='queued' and (j->>'attempt_base')::integer=3) then raise exception 'Admin retry lost claim fencing'; end if;
 perform public.admin_console('deviceRevoke','{"id":"e2000000-0000-4000-8000-000000000001"}');
 perform public.admin_console('user','{"id":"e0000000-0000-4000-8000-000000000002","name":"Test rider","role":"rider","suspended":true,"expectedRole":"rider","expectedSuspended":false}');
 perform public.admin_console('setPermissions','{"role":"moderator","permissions":["hazards.read","hazards.write","users.read"],"expected":["hazards.read","hazards.write"]}');
 if (public.admin_console('list','{"resource":"audit","query":"record.update"}')->>'total')::integer<1 then raise exception 'Audit not written'; end if;
end $$;
select set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000003',true);
do $$ begin perform public.admin_console('list','{"resource":"users"}'); end $$;
select set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000002',true);
do $$ begin
 if public.app_account_active() then raise exception 'Suspension ineffective'; end if;
 if (select count(*) from public.potholes)>0 then raise exception 'Suspended direct RLS read allowed'; end if;
 begin perform public.register_device('Suspended device'); raise exception 'Suspended direct mutation allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform public.device_identity(repeat('a',64)); raise exception 'Revoked device accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'Admin authorization, metadata isolation, role updates, last-owner, conflict, suspension, revocation and audit checks passed' as result;
rollback;
