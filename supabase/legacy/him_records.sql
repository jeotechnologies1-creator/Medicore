-- Facility-scoped physical medical record register and circulation workflow.
-- Apply after migration 20261103000029_patient_facility_scope.sql.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

insert into public.permission_catalog(permission_key,description,sensitive) values
 ('records.file.read','Read physical medical record register',true),
 ('records.file.manage','Request, release, return, and investigate physical files',true)
on conflict(permission_key) do nothing;
create table if not exists public.onemed_migration_20261103000030_grants(role text not null,permission_key text not null,scope text not null,primary key(role,permission_key,scope));
alter table public.onemed_migration_20261103000030_grants enable row level security;
revoke all on public.onemed_migration_20261103000030_grants from public,anon,authenticated;
with inserted_grants as (insert into public.role_permission_grants(role,permission_key,scope) values
 ('records_officer','records.file.read','facility'),('records_officer','records.file.manage','facility')
 on conflict do nothing returning role,permission_key,scope)
insert into public.onemed_migration_20261103000030_grants(role,permission_key,scope)
select role,permission_key,scope from inserted_grants on conflict do nothing;

create table if not exists public.medical_record_files (
 id uuid primary key default gen_random_uuid(),
 patient_id uuid not null unique references public.patients(id) on delete restrict,
 facility_id uuid not null references public.facilities(id) on delete restrict,
 file_number text not null,
 status text not null default 'available' check(status in ('available','requested','in_circulation','missing','under_investigation','archived','digitised')),
 classification text not null default 'general' check(classification in ('general','confidential','restricted')),
 location text,
 current_custodian text,
 last_retrieved_at timestamptz,
 last_returned_at timestamptz,
 archived_at timestamptz,
 created_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(facility_id,file_number)
);
create index if not exists medical_record_files_facility_status_idx on public.medical_record_files(facility_id,status);
create index if not exists medical_record_files_location_idx on public.medical_record_files(facility_id,location);

create table if not exists public.medical_record_movements (
 id uuid primary key default gen_random_uuid(),
 file_id uuid not null references public.medical_record_files(id) on delete restrict,
 patient_id uuid not null references public.patients(id) on delete restrict,
 facility_id uuid not null references public.facilities(id) on delete restrict,
 requesting_department text not null check(length(btrim(requesting_department)) between 1 and 120),
 destination_department text not null check(length(btrim(destination_department)) between 1 and 120),
 requester_id uuid not null references public.profiles(id) on delete restrict,
 receiver_name text,
 released_by uuid references public.profiles(id) on delete restrict,
 expected_return_at timestamptz,
 released_at timestamptz,
 returned_at timestamptz,
 returned_by uuid references public.profiles(id) on delete restrict,
 status text not null default 'requested' check(status in ('requested','in_circulation','returned','rejected','missing','under_investigation')),
 notes text check(notes is null or length(notes)<=2000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists medical_record_movements_active_idx on public.medical_record_movements(facility_id,status,expected_return_at);
create index if not exists medical_record_movements_patient_idx on public.medical_record_movements(patient_id,created_at desc);

create table if not exists public.medical_record_movement_events (
 id uuid primary key default gen_random_uuid(),
 movement_id uuid not null references public.medical_record_movements(id) on delete restrict,
 event_type text not null check(event_type in ('requested','released','returned','rejected','marked_missing','investigation_started','located')),
 actor_id uuid not null references public.profiles(id) on delete restrict,
 details jsonb not null default '{}'::jsonb check(jsonb_typeof(details)='object'),
 created_at timestamptz not null default now()
);
create index if not exists medical_record_movement_events_movement_idx on public.medical_record_movement_events(movement_id,created_at);

alter table public.medical_record_files enable row level security;
alter table public.medical_record_movements enable row level security;
alter table public.medical_record_movement_events enable row level security;
revoke all on public.medical_record_files,public.medical_record_movements,public.medical_record_movement_events from public,anon;
grant select on public.medical_record_files,public.medical_record_movements,public.medical_record_movement_events to authenticated;

drop policy if exists "HIM read medical record files" on public.medical_record_files;
create policy "HIM read medical record files" on public.medical_record_files for select to authenticated using(public.has_org_permission('records.file.read',facility_id,null));
drop policy if exists "HIM read medical record movements" on public.medical_record_movements;
create policy "HIM read medical record movements" on public.medical_record_movements for select to authenticated using(public.has_org_permission('records.file.read',facility_id,null));
drop policy if exists "HIM read movement event history" on public.medical_record_movement_events;
create policy "HIM read movement event history" on public.medical_record_movement_events for select to authenticated using(exists(select 1 from public.medical_record_movements m where m.id=movement_id and public.has_org_permission('records.file.read',m.facility_id,null)));
drop policy if exists "HIM append movement event history" on public.medical_record_movement_events;
create policy "HIM append movement event history" on public.medical_record_movement_events for insert to authenticated with check(exists(select 1 from public.medical_record_movements m where m.id=movement_id and public.has_org_permission('records.file.manage',m.facility_id,null)) and actor_id=(select id from public.profiles where auth_user_id=auth.uid() and status='active' limit 1));
drop policy if exists "retain medical record movement history" on public.medical_record_movement_events;
create policy "retain medical record movement history" on public.medical_record_movement_events for delete to authenticated using(false);

-- Aggregate only; never returns patient identifiers or row-level clinical data.
create or replace function public.get_him_dashboard_summary()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
 if not exists(select 1 from public.profiles where auth_user_id=auth.uid() and status='active') then raise exception 'Active staff profile required'; end if;
 if not exists(select 1 from public.facilities f where public.has_org_permission('records.file.read',f.id,null)) then raise exception 'HIM read permission required'; end if;
 with accessible_facilities as materialized (
  select f.id from public.facilities f where public.has_org_permission('records.file.read',f.id,null)
 ), patient_stats as (
  select count(*) as total,
   count(*) filter(where p.registration_date=current_date) as registered_today,
   count(*) filter(where p.registration_date>=date_trunc('week',current_date)::date) as registered_week,
   count(*) filter(where p.registration_date>=date_trunc('month',current_date)::date) as registered_month,
   count(*) filter(where p.status='active') as active,
   count(*) filter(where p.status<>'active') as inactive
  from public.patients p join accessible_facilities f on f.id=p.home_facility_id
 ), file_stats as (
  select count(*) as total,
   count(*) filter(where f.status='available') as available,
   count(*) filter(where f.status='in_circulation') as circulating,
   count(*) filter(where f.status='requested') as requested,
   count(*) filter(where f.status in ('missing','under_investigation')) as missing
  from public.medical_record_files f join accessible_facilities a on a.id=f.facility_id
 ), movement_stats as (
  select count(*) filter(where m.status='in_circulation' and m.expected_return_at<now()) as overdue,
   count(*) filter(where m.created_at>=current_date) as requests_today,
   count(*) filter(where m.released_at>=current_date) as retrieved_today,
   count(*) filter(where m.returned_at>=current_date) as returned_today
  from public.medical_record_movements m join accessible_facilities f on f.id=m.facility_id
 )
 select jsonb_build_object(
  'patients_total',p.total,'patients_registered_today',p.registered_today,'patients_registered_week',p.registered_week,
  'patients_registered_month',p.registered_month,'patients_active',p.active,'patients_inactive',p.inactive,
  'files_total',f.total,'files_available',f.available,'files_circulating',f.circulating,'files_requested',f.requested,
  'files_missing',f.missing,'files_overdue',m.overdue,'requests_today',m.requests_today,
  'files_retrieved_today',m.retrieved_today,'files_returned_today',m.returned_today
 ) into result from patient_stats p cross join file_stats f cross join movement_stats m;
 return result;
end $$;
revoke all on function public.get_him_dashboard_summary() from public,anon;
grant execute on function public.get_him_dashboard_summary() to authenticated;

create or replace function public.request_medical_record_file(p_patient_id uuid,p_requesting_department text,p_destination_department text,p_expected_return_at timestamptz default null,p_receiver_name text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor_id uuid; patient_facility uuid; file_row public.medical_record_files%rowtype; movement_id uuid;
begin
 select id into actor_id from public.profiles where auth_user_id=auth.uid() and status='active' limit 1;
 if actor_id is null then raise exception 'Active staff profile required'; end if;
 select home_facility_id into patient_facility from public.patients where id=p_patient_id;
 if patient_facility is null or not public.has_org_permission('records.file.manage',patient_facility,null) then raise exception 'HIM file management permission required for the patient facility'; end if;
 if length(btrim(coalesce(p_requesting_department,''))) not between 1 and 120 or length(btrim(coalesce(p_destination_department,''))) not between 1 and 120 then raise exception 'Requesting and destination departments are required'; end if;
 if length(btrim(coalesce(p_receiver_name,''))) not between 1 and 160 then raise exception 'Receiving officer name is required'; end if;
 if p_expected_return_at is not null and p_expected_return_at<=now() then raise exception 'Expected return must be in the future'; end if;
 insert into public.medical_record_files(patient_id,facility_id,file_number,created_by)
 values(p_patient_id,patient_facility,'MR-'||upper(replace(p_patient_id::text,'-','')),actor_id)
 on conflict(patient_id) do nothing;
 select * into file_row from public.medical_record_files where patient_id=p_patient_id for update;
 if file_row.facility_id<>patient_facility then raise exception 'Medical record file facility does not match the verified patient facility'; end if;
 if file_row.status not in ('available','digitised') then raise exception 'File is not available for circulation'; end if;
 if exists(select 1 from public.medical_record_movements where file_id=file_row.id and status in ('requested','in_circulation','missing','under_investigation')) then raise exception 'An active movement already exists for this file'; end if;
 insert into public.medical_record_movements(file_id,patient_id,facility_id,requesting_department,destination_department,requester_id,receiver_name,expected_return_at)
 values(file_row.id,p_patient_id,patient_facility,btrim(p_requesting_department),btrim(p_destination_department),actor_id,nullif(btrim(p_receiver_name),''),p_expected_return_at)
 returning id into movement_id;
 insert into public.medical_record_movement_events(movement_id,event_type,actor_id) values(movement_id,'requested',actor_id);
 update public.medical_record_files set status='requested',updated_at=now() where id=file_row.id;
 return movement_id;
end $$;

create or replace function public.transition_medical_record_movement(p_movement_id uuid,p_action text,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor_id uuid; m public.medical_record_movements%rowtype; next_status text; event_name text;
begin
 select id into actor_id from public.profiles where auth_user_id=auth.uid() and status='active' limit 1;
 if actor_id is null then raise exception 'Active staff profile required'; end if;
 select * into m from public.medical_record_movements where id=p_movement_id for update;
 if not found or not public.has_org_permission('records.file.manage',m.facility_id,null) then raise exception 'HIM file management permission required'; end if;
 if p_notes is not null and length(p_notes)>2000 then raise exception 'Movement note cannot exceed 2000 characters'; end if;
 if p_action in ('missing','investigate') and length(btrim(coalesce(p_notes,'')))=0 then raise exception 'A documented reason is required'; end if;
 if p_action='release' and m.status='requested' then
   next_status:='in_circulation'; event_name:='released';
   update public.medical_record_movements set status=next_status,released_by=actor_id,released_at=now(),notes=coalesce(nullif(btrim(p_notes),''),notes),updated_at=now() where id=m.id;
   update public.medical_record_files set status='in_circulation',current_custodian=coalesce(m.receiver_name,m.destination_department),last_retrieved_at=now(),updated_at=now() where id=m.file_id;
 elsif p_action='return' and m.status='in_circulation' then
   next_status:='returned'; event_name:='returned';
   update public.medical_record_movements set status=next_status,returned_by=actor_id,returned_at=now(),notes=coalesce(nullif(btrim(p_notes),''),notes),updated_at=now() where id=m.id;
   update public.medical_record_files set status='available',current_custodian=null,last_returned_at=now(),updated_at=now() where id=m.file_id;
 elsif p_action='reject' and m.status='requested' then
   next_status:='rejected'; event_name:='rejected';
   update public.medical_record_movements set status=next_status,notes=coalesce(nullif(btrim(p_notes),''),notes),updated_at=now() where id=m.id;
   update public.medical_record_files set status='available',updated_at=now() where id=m.file_id;
 elsif p_action='missing' and m.status='in_circulation' then
   next_status:='missing'; event_name:='marked_missing';
   update public.medical_record_movements set status=next_status,notes=coalesce(nullif(btrim(p_notes),''),notes),updated_at=now() where id=m.id;
   update public.medical_record_files set status='missing',updated_at=now() where id=m.file_id;
 elsif p_action='investigate' and m.status='missing' then
   next_status:='under_investigation'; event_name:='investigation_started';
   update public.medical_record_movements set status=next_status,notes=coalesce(nullif(btrim(p_notes),''),notes),updated_at=now() where id=m.id;
   update public.medical_record_files set status='under_investigation',updated_at=now() where id=m.file_id;
 elsif p_action='located' and m.status='under_investigation' then
   next_status:='returned'; event_name:='located';
   update public.medical_record_movements set status=next_status,returned_by=actor_id,returned_at=now(),notes=coalesce(nullif(btrim(p_notes),''),notes),updated_at=now() where id=m.id;
   update public.medical_record_files set status='available',current_custodian=null,last_returned_at=now(),updated_at=now() where id=m.file_id;
 else raise exception 'Invalid movement action for current status'; end if;
 insert into public.medical_record_movement_events(movement_id,event_type,actor_id,details) values(m.id,event_name,actor_id,jsonb_build_object('notes',nullif(btrim(p_notes),'')));
 return m.id;
end $$;
revoke all on function public.request_medical_record_file(uuid,text,text,timestamptz,text) from public,anon;
grant execute on function public.request_medical_record_file(uuid,text,text,timestamptz,text) to authenticated;
revoke all on function public.transition_medical_record_movement(uuid,text,text) from public,anon;
grant execute on function public.transition_medical_record_movement(uuid,text,text) to authenticated;
commit;
notify pgrst,'reload schema';
