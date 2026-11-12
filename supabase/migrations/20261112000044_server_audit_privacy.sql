begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

create extension if not exists pgcrypto;

-- Supabase projects can install pgcrypto in `extensions` instead of `public`.
-- Resolve the extension's actual schema once per call instead of assuming one.
create or replace function public.audit_log_sha256(p_data bytea)
returns bytea language plpgsql security definer set search_path=pg_catalog as $$
declare crypto_schema text; result bytea;
begin
  select n.nspname into crypto_schema from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto';
  if crypto_schema is null then raise exception 'pgcrypto extension is required for audit hashing'; end if;
  execute format('select %I.digest($1, %L)',crypto_schema,'sha256') into result using p_data;
  return result;
end $$;
revoke all on function public.audit_log_sha256(bytea) from public,anon,authenticated;

alter table public.audit_logs add column if not exists chain_position bigint;
alter table public.audit_logs add column if not exists change_data jsonb not null default '{}'::jsonb;
alter table public.audit_logs add column if not exists previous_hash text;
alter table public.audit_logs add column if not exists row_hash text;
create unique index if not exists audit_logs_chain_position_uidx on public.audit_logs(chain_position);

-- Backfill a deterministic chain before enabling append-time hashing.
do $$
declare r record; prior text:=''; digest text; content jsonb; pos bigint:=0;
begin
  for r in select * from public.audit_logs order by chain_position,id loop
    pos:=pos+1;
    content:=jsonb_build_object('id',r.id,'user_id',r.user_id,'action',r.action,'entity_type',r.entity_type,
      'entity_id',r.entity_id,'timestamp',r.timestamp,'severity',r.severity,'created_at',r.created_at,'change_data',r.change_data);
    digest:=encode(public.audit_log_sha256(convert_to(coalesce(prior,'')||content::text,'UTF8')),'hex');
    update public.audit_logs set chain_position=pos,previous_hash=nullif(prior,''),row_hash=digest where id=r.id;
    prior:=digest;
  end loop;
end $$;
alter table public.audit_logs alter column chain_position set not null;
alter table public.audit_logs alter column row_hash set not null;

create or replace function public.hash_audit_log_insert() returns trigger
language plpgsql security definer set search_path=public as $$
declare prior text; prior_position bigint; content jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('public.audit_logs.hash_chain'));
  select chain_position,row_hash into prior_position,prior from public.audit_logs order by chain_position desc limit 1;
  new.chain_position:=coalesce(prior_position,0)+1;
  new.previous_hash:=prior;
  content:=jsonb_build_object('id',new.id,'user_id',new.user_id,'action',new.action,'entity_type',new.entity_type,
    'entity_id',new.entity_id,'timestamp',new.timestamp,'severity',new.severity,'created_at',new.created_at,'change_data',new.change_data);
  new.row_hash:=encode(public.audit_log_sha256(convert_to(coalesce(prior,'')||content::text,'UTF8')),'hex');
  return new;
end $$;
revoke all on function public.hash_audit_log_insert() from public,anon,authenticated;
drop trigger if exists hash_audit_log_insert on public.audit_logs;
create trigger hash_audit_log_insert before insert on public.audit_logs for each row execute function public.hash_audit_log_insert();

create or replace function public.reject_audit_log_mutation() returns trigger
language plpgsql set search_path=public as $$ begin
  raise exception 'audit_logs is append-only; update/delete is prohibited';
end $$;
revoke all on function public.reject_audit_log_mutation() from public,anon,authenticated;
drop trigger if exists audit_logs_no_mutation on public.audit_logs;
create trigger audit_logs_no_mutation before update or delete on public.audit_logs for each row execute function public.reject_audit_log_mutation();
revoke update,delete,truncate,references,trigger on public.audit_logs from public,anon,authenticated,service_role;
revoke insert on public.audit_logs from public,anon,authenticated,service_role;

create or replace function public.verify_audit_log_chain()
returns jsonb language plpgsql security definer set search_path=public as $$
declare r record; prior text:=''; expected text; content jsonb; checked bigint:=0;
begin
  if not public.has_any_role(array['super_admin']) then raise exception 'Only Super Admin may verify the audit chain'; end if;
  for r in select * from public.audit_logs order by chain_position,id loop
    content:=jsonb_build_object('id',r.id,'user_id',r.user_id,'action',r.action,'entity_type',r.entity_type,
      'entity_id',r.entity_id,'timestamp',r.timestamp,'severity',r.severity,'created_at',r.created_at,'change_data',r.change_data);
    expected:=encode(public.audit_log_sha256(convert_to(coalesce(prior,'')||content::text,'UTF8')),'hex');
    checked:=checked+1;
    if r.previous_hash is distinct from nullif(prior,'') or r.row_hash is distinct from expected then
      return jsonb_build_object('valid',false,'rows_checked',checked,'first_invalid_position',r.chain_position);
    end if;
    prior:=r.row_hash;
  end loop;
  return jsonb_build_object('valid',true,'rows_checked',checked,'first_invalid_position',null);
end $$;
revoke all on function public.verify_audit_log_chain() from public,anon;
grant execute on function public.verify_audit_log_chain() to authenticated;

create or replace function public.audit_row_change() returns trigger
language plpgsql security definer set search_path=public as $$
declare actor_id uuid; old_row jsonb; new_row jsonb; entity_uuid text; details jsonb; changed text[];
begin
  select id into actor_id from public.profiles where auth_user_id=auth.uid() limit 1;
  if tg_op<>'INSERT' then old_row:=to_jsonb(old); end if;
  if tg_op<>'DELETE' then new_row:=to_jsonb(new); end if;
  entity_uuid:=coalesce(new_row->>'id',old_row->>'id',new_row->>'setting_key',old_row->>'setting_key',
    concat_ws(':',coalesce(new_row->>'role',old_row->>'role'),coalesce(new_row->>'permission_key',old_row->>'permission_key'),coalesce(new_row->>'scope',old_row->>'scope')));
  if tg_op='UPDATE' then
    select array_agg(k order by k) into changed from (
      select coalesce(n.key,o.key) k from jsonb_each(coalesce(new_row,'{}'::jsonb)) n full join jsonb_each(coalesce(old_row,'{}'::jsonb)) o using(key)
      where n.value is distinct from o.value
    ) d;
  end if;
  if tg_table_name='profiles' and tg_op='UPDATE' then
    details:=jsonb_build_object('changed_fields',changed,'old_role',old_row->>'role','new_role',new_row->>'role','old_status',old_row->>'status','new_status',new_row->>'status');
    if old_row->>'role' is not distinct from new_row->>'role' and old_row->>'status' is not distinct from new_row->>'status' then return new; end if;
  else
    details:=jsonb_build_object('changed_fields',changed);
  end if;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,severity,change_data)
  values(actor_id,tg_op,tg_table_name,entity_uuid,'info',coalesce(details,'{}'::jsonb));
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function public.audit_row_change() from public,anon,authenticated;

create or replace function public.stamp_patient_access_log() returns trigger
language plpgsql security definer set search_path=public as $$
declare actor uuid;
begin
  select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' limit 1;
  if actor is null then raise exception 'An active authenticated profile is required to log patient access'; end if;
  new.actor_id:=actor; new.action:=coalesce(nullif(new.action,''),'read'); new.source:=coalesce(nullif(new.source,''),'rpc'); new.accessed_at:=clock_timestamp();
  return new;
end $$;
revoke all on function public.stamp_patient_access_log() from public,anon,authenticated;

do $$
declare t text;
begin
  for t in select c.table_name from information_schema.columns c join information_schema.tables bt using(table_catalog,table_schema,table_name)
    where c.table_schema='public' and bt.table_type='BASE TABLE' and c.column_name='patient_id'
      and c.table_name not in ('audit_logs','patient_access_logs','clinical_record_versions')
  loop
    execute format('drop trigger if exists audit_%I on public.%I',t,t);
    execute format('create trigger audit_%I after insert or update or delete on public.%I for each row execute function public.audit_row_change()',t,t);
  end loop;
  for t in select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE'
    and (left(table_name,9)='facility_' or left(table_name,10)='insurance_' or left(table_name,8)='payment_' or left(table_name,7)='refund_')
  loop
    execute format('drop trigger if exists audit_%I on public.%I',t,t);
    execute format('create trigger audit_%I after insert or update or delete on public.%I for each row execute function public.audit_row_change()',t,t);
  end loop;
  foreach t in array array['profiles','facilities','facility_bank_accounts','staff_organization_memberships','role_permission_grants',
      'profile_permission_assignments','permission_catalog','organization_units','job_positions','system_settings','insurance_memberships',
      'insurance_eligibility_checks','payment_dispute_thresholds','payment_dispute_alerts'] loop
    if to_regclass(format('public.%I',t)) is null then continue; end if;
    execute format('drop trigger if exists audit_%I on public.%I',t,t);
    execute format('create trigger audit_%I after insert or update or delete on public.%I for each row execute function public.audit_row_change()',t,t);
  end loop;
end $$;

create table if not exists public.break_glass_access (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  patient_id uuid not null references public.patients(id) on delete restrict,
  reason text not null check(length(btrim(reason))>=20),
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status text not null default 'active' check(status in ('active','expired','revoked')),
  privacy_officer_profile_id uuid not null references public.profiles(id) on delete restrict,
  notification_id uuid references public.notifications(id) on delete set null,
  check(expires_at>granted_at and expires_at<=granted_at+interval '1 hour')
);
create index if not exists break_glass_active_idx on public.break_glass_access(actor_profile_id,patient_id,expires_at) where status='active';
alter table public.break_glass_access enable row level security;
revoke all on public.break_glass_access from public,anon,authenticated;
grant select,insert,update on public.break_glass_access to service_role;
drop trigger if exists audit_break_glass_access on public.break_glass_access;
create trigger audit_break_glass_access after insert or update on public.break_glass_access for each row execute function public.audit_row_change();

create or replace function public.has_patient_facility_access(target_patient_id uuid)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare actor_role text; actor_patient_id uuid; target_facility_id uuid; actor_profile_id uuid;
begin
  select id,role::text,patient_id into actor_profile_id,actor_role,actor_patient_id from public.profiles
  where auth_user_id=auth.uid() and status::text='active' limit 1;
  if actor_role is null then return false; end if;
  if actor_role='super_admin' or (actor_role='patient' and actor_patient_id=target_patient_id) then return true; end if;
  if actor_role not in ('patient','pending') and exists(select 1 from public.break_glass_access b where b.actor_profile_id=actor_profile_id
    and b.patient_id=target_patient_id and b.status='active' and b.expires_at>clock_timestamp()) then return true; end if;
  select home_facility_id into target_facility_id from public.patients where id=target_patient_id;
  return target_facility_id is not null and (public.has_org_permission('patient.read',target_facility_id,null)
    or public.has_clinical_department_permission(target_patient_id,null,'patient.read',true));
end $$;

create or replace function public.request_break_glass_access(p_patient_id uuid,p_reason text,p_duration_minutes integer default 30)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor_id uuid; officer_id uuid; grant_id uuid; v_notification_id uuid; officer_setting jsonb; fallback_used boolean:=false;
begin
  select id into actor_id from public.profiles where auth_user_id=auth.uid() and status::text='active' and role::text not in ('patient','pending') limit 1;
  if actor_id is null then raise exception 'Active staff access is required for break-glass'; end if;
  if public.mfa_required_for_current_user() and not public.has_aal2() then raise exception 'Multi-factor authentication is required for break-glass access'; end if;
  if nullif(btrim(p_reason),'') is null or length(btrim(p_reason))<20 then raise exception 'Break-glass reason must contain at least 20 characters'; end if;
  if p_duration_minutes not between 1 and 60 then raise exception 'Break-glass duration must be between 1 and 60 minutes'; end if;
  if public.has_patient_facility_access(p_patient_id) then raise exception 'Break-glass is only available outside normal patient scope'; end if;
  select s.setting_value into officer_setting from public.system_settings s where s.setting_key='privacy_officer_profile_id';
  begin officer_id:=(officer_setting#>>'{}')::uuid; exception when others then officer_id:=null; end;
  if officer_id is null or not exists(select 1 from public.profiles where id=officer_id and status::text='active') then
    select id into officer_id from public.profiles where role::text='super_admin' and status::text='active' order by created_at limit 1;
    fallback_used:=true;
  end if;
  if officer_id is null then raise exception 'Configure an active privacy officer or Super Admin before granting break-glass access'; end if;
  insert into public.break_glass_access(actor_profile_id,patient_id,reason,expires_at,privacy_officer_profile_id)
  values(actor_id,p_patient_id,btrim(p_reason),now()+make_interval(mins=>p_duration_minutes),officer_id) returning id into grant_id;
  insert into public.notifications(user_id,type,title,message,priority) values(officer_id,'break_glass_access','Break-glass patient access granted',
    format('Staff profile %s accessed patient %s until %s. Reason: %s%s',actor_id,p_patient_id,to_char(now()+make_interval(mins=>p_duration_minutes),'YYYY-MM-DD HH24:MI:SS TZ'),btrim(p_reason),case when fallback_used then ' (privacy officer setting missing; notified Super Admin)' else '' end),'urgent') returning id into v_notification_id;
  update public.break_glass_access set notification_id=v_notification_id where id=grant_id;
  return jsonb_build_object('id',grant_id,'patient_id',p_patient_id,'expires_at',now()+make_interval(mins=>p_duration_minutes),'privacy_officer_notified',officer_id,'used_super_admin_fallback',fallback_used);
end $$;
revoke all on function public.request_break_glass_access(uuid,text,integer) from public,anon;
grant execute on function public.request_break_glass_access(uuid,text,integer) to authenticated;

create or replace function public.expire_break_glass_access() returns integer language plpgsql security definer set search_path=public as $$
declare n integer;
begin update public.break_glass_access set status='expired' where status='active' and expires_at<=now(); get diagnostics n=row_count; return n; end $$;
revoke all on function public.expire_break_glass_access() from public,anon,authenticated;
grant execute on function public.expire_break_glass_access() to service_role;

create or replace function public.read_patient_chart(p_patient_id uuid,p_purpose text default 'patient_chart')
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  if not public.can_read_patient_record(p_patient_id) or not public.has_patient_facility_access(p_patient_id) then raise exception 'Patient record access denied'; end if;
  select jsonb_build_object('patient',to_jsonb(p),'appointments',coalesce((select jsonb_agg(to_jsonb(x)) from public.appointments x where x.patient_id=p.id),'[]'::jsonb),
    'lab_orders',coalesce((select jsonb_agg(to_jsonb(x)) from public.lab_orders x where x.patient_id=p.id),'[]'::jsonb),
    'radiology_orders',coalesce((select jsonb_agg(to_jsonb(x)) from public.radiology_orders x where x.patient_id=p.id),'[]'::jsonb),
    'prescriptions',coalesce((select jsonb_agg(to_jsonb(x)) from public.prescriptions x where x.patient_id=p.id),'[]'::jsonb),
    'vital_signs',coalesce((select jsonb_agg(to_jsonb(x)) from public.vital_signs x where x.patient_id=p.id),'[]'::jsonb),
    'billing',coalesce((select jsonb_agg(to_jsonb(x)) from public.billing x where x.patient_id=p.id),'[]'::jsonb),
    'admissions',coalesce((select jsonb_agg(to_jsonb(x)) from public.admissions x where x.patient_id=p.id),'[]'::jsonb),
    'patient_allergies',coalesce((select jsonb_agg(to_jsonb(x)) from public.patient_allergies x where x.patient_id=p.id),'[]'::jsonb),
    'patient_conditions',coalesce((select jsonb_agg(to_jsonb(x)) from public.patient_conditions x where x.patient_id=p.id),'[]'::jsonb),
    'medication_orders',coalesce((select jsonb_agg(to_jsonb(x)) from public.medication_orders x where x.patient_id=p.id),'[]'::jsonb),
    'care_plans',coalesce((select jsonb_agg(to_jsonb(x)) from public.care_plans x where x.patient_id=p.id),'[]'::jsonb),
    'consultations',coalesce((select jsonb_agg(to_jsonb(x)) from public.consultations x where x.patient_id=p.id),'[]'::jsonb),
    'patient_documents',coalesce((select jsonb_agg(to_jsonb(x)) from public.patient_documents x where x.patient_id=p.id),'[]'::jsonb),
    'encounter_workflow_events',coalesce((select jsonb_agg(to_jsonb(x)) from public.encounter_workflow_events x where x.patient_id=p.id),'[]'::jsonb)) into result
    from public.patients p where p.id=p_patient_id;
  if result is null then raise exception 'Patient not found'; end if;
  insert into public.patient_access_logs(patient_id,actor_id,action,purpose,source) values(p_patient_id,auth.uid(),'read',left(p_purpose,100),'read_patient_chart');
  return result;
end $$;
revoke all on function public.read_patient_chart(uuid,text) from public,anon;
grant execute on function public.read_patient_chart(uuid,text) to authenticated;

create or replace function public.search_patient_directory(p_query text default '',p_offset integer default 0,p_limit integer default 100)
returns setof public.patients language plpgsql security definer set search_path=public as $$
declare p public.patients%rowtype; actor_id uuid; search_text text:=lower(btrim(coalesce(p_query,'')));
begin
  select id into actor_id from public.profiles where auth_user_id=auth.uid() and status::text='active' and role::text in ('super_admin','records_officer') limit 1;
  if actor_id is null then raise exception 'Patient directory access denied'; end if;
  if p_offset<0 or p_limit not between 1 and 250 then raise exception 'Invalid directory page'; end if;
  for p in select x.* from public.patients x where (search_text='' or lower(concat_ws(' ',x.first_name,x.last_name,x.patient_number,x.medical_record_number,x.phone)) like '%'||search_text||'%')
    and public.can_read_patient_record(x.id) and public.has_patient_facility_access(x.id)
    order by x.last_name,x.first_name,x.id offset p_offset limit p_limit loop
    insert into public.patient_access_logs(patient_id,actor_id,action,purpose,source) values(p.id,auth.uid(),'search_result','patient_directory','search_patient_directory');
    return next p;
  end loop;
end $$;
revoke all on function public.search_patient_directory(text,integer,integer) from public,anon;
grant execute on function public.search_patient_directory(text,integer,integer) to authenticated;

create or replace function public.authorize_patient_document_read(p_object_path text)
returns uuid language plpgsql security definer set search_path=public as $$
declare target_patient uuid;
begin
  select d.patient_id into target_patient from public.patient_documents d where d.file_url=p_object_path limit 1;
  if target_patient is null or not public.can_read_patient_record(target_patient) or not public.has_patient_facility_access(target_patient) then raise exception 'Document access denied'; end if;
  insert into public.patient_access_logs(patient_id,actor_id,action,purpose,source) values(target_patient,auth.uid(),'read','patient_document','authorize_patient_document_read');
  return target_patient;
end $$;
revoke all on function public.authorize_patient_document_read(text) from public,anon;
grant execute on function public.authorize_patient_document_read(text) to authenticated;
revoke insert on public.patient_access_logs from public,anon,authenticated;

-- Storage's restrictive scope must recognize the same time-boxed grant used by
-- the metadata RPC; the normal row policies remain in place as an additional gate.
drop policy if exists "department scope patient document reads" on storage.objects;
create policy "department scope patient document reads" on storage.objects
  as restrictive for select to authenticated using (
    bucket_id <> 'patient-documents' or exists (
      select 1 from public.patients patient
      where patient.id::text=(storage.foldername(name))[1]
        and public.can_read_patient_record(patient.id)
        and public.has_patient_facility_access(patient.id)
    )
  );

do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    if exists(select 1 from cron.job where jobname='expire-break-glass-access') then perform cron.unschedule((select jobid from cron.job where jobname='expire-break-glass-access' limit 1)); end if;
    perform cron.schedule('expire-break-glass-access','* * * * *','select public.expire_break_glass_access()');
  end if;
exception when undefined_table or undefined_function or insufficient_privilege then null; end $$;

commit;
notify pgrst,'reload schema';
