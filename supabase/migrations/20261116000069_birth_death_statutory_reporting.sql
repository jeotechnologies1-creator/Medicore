begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

insert into public.permission_catalog(permission_key,description,sensitive) values
 ('vital_registry.read','Read birth and death registry records',true),
 ('vital_registry.manage','Register and verify vital events',true),
 ('statutory_report.read','Run facility-scoped aggregate statutory reports',true),
 ('statutory_report.manage','Configure report definitions and disclosure rules',true)
on conflict(permission_key) do update set description=excluded.description,sensitive=true;
insert into public.role_permission_grants(role,permission_key,scope) values
 ('records_officer','vital_registry.read','facility'),('records_officer','vital_registry.manage','facility'),
 ('records_officer','statutory_report.read','facility'),('records_officer','statutory_report.manage','facility'),
 ('doctor','vital_registry.read','facility'),('doctor','vital_registry.manage','facility')
on conflict do nothing;

-- The source_event_id is an opaque Task 15 integration reference because no
-- maternity event table exists in this migration chain yet. Emergency deaths
-- link directly to an encounter and are verified against its BID assessment.
create table if not exists public.birth_registrations (
 id uuid primary key default gen_random_uuid(), facility_id uuid not null references public.facilities(id) on delete restrict,
 child_patient_id uuid references public.patients(id) on delete restrict,
 mother_patient_id uuid references public.patients(id) on delete restrict,
 mother_encounter_id uuid references public.encounters(id) on delete restrict,
 maternity_source_event_id uuid, source_system text not null default 'manual',
 occurred_at timestamptz not null, birth_outcome text not null check(birth_outcome in ('live_birth','stillbirth')),
 plurality integer not null default 1 check(plurality>0), birth_order integer check(birth_order is null or birth_order>0),
 sex_recorded text check(sex_recorded is null or sex_recorded in ('female','male','undetermined','not_recorded')),
 source_reference text, source_verification_method text, source_verification_notes text,
 verification_status text not null default 'pending' check(verification_status in ('pending','verified','rejected')),
 verified_by uuid references public.profiles(id), verified_at timestamptz,
 external_registration_reference text, created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 check((birth_order is null or birth_order<=plurality)),
 check((verification_status='verified' and verified_by is not null and verified_at is not null) or
       (verification_status<>'verified' and verified_by is null and verified_at is null)),
 unique(facility_id,source_system,maternity_source_event_id,birth_order)
);
create index if not exists birth_registry_facility_date on public.birth_registrations(facility_id,occurred_at desc);
create index if not exists birth_registry_mother on public.birth_registrations(mother_patient_id,occurred_at desc);

create table if not exists public.death_registrations (
 id uuid primary key default gen_random_uuid(), facility_id uuid not null references public.facilities(id) on delete restrict,
 patient_id uuid references public.patients(id) on delete restrict, encounter_id uuid references public.encounters(id) on delete restrict,
 source_system text not null default 'manual', source_event_id uuid, occurred_at timestamptz not null,
 source_reference text, source_verification_method text, source_verification_notes text,
 verification_status text not null default 'pending' check(verification_status in ('pending','verified','rejected')),
 verified_by uuid references public.profiles(id), verified_at timestamptz,
 external_registration_reference text, created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 check((verification_status='verified' and verified_by is not null and verified_at is not null) or
       (verification_status<>'verified' and verified_by is null and verified_at is null)),
 unique(facility_id,source_system,source_event_id)
);
create index if not exists death_registry_facility_date on public.death_registrations(facility_id,occurred_at desc);

create table if not exists public.statutory_report_definitions (
 id uuid primary key default gen_random_uuid(), facility_id uuid not null references public.facilities(id) on delete restrict,
 report_key text not null check(report_key ~ '^[a-z0-9][a-z0-9_.-]{1,79}$'), report_name text not null,
 version integer not null check(version>0), definition jsonb not null check(jsonb_typeof(definition)='object'),
 official_mapping boolean not null default false, active boolean not null default true,
 configured_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 unique(facility_id,report_key,version)
);
create unique index if not exists statutory_report_one_active on public.statutory_report_definitions(facility_id,report_key) where active;
create table if not exists public.statutory_report_suppression_rules (
 facility_id uuid primary key references public.facilities(id) on delete restrict,
 minimum_cell_count integer check(minimum_cell_count is null or minimum_cell_count>0),
 policy_basis text, configured_by uuid references public.profiles(id), configured_at timestamptz,
 check((minimum_cell_count is null and configured_by is null and configured_at is null) or
       (minimum_cell_count is not null and length(btrim(coalesce(policy_basis,'')))>0 and configured_by is not null and configured_at is not null))
);
create table if not exists public.statutory_report_exports (
 id uuid primary key default gen_random_uuid(), facility_id uuid not null references public.facilities(id) on delete restrict,
 report_definition_id uuid not null references public.statutory_report_definitions(id) on delete restrict,
 report_version integer not null, period_start date not null, period_end date not null,
 recipient text not null check(length(btrim(recipient))>0), purpose text not null check(length(btrim(purpose))>0),
 export_payload jsonb not null check(jsonb_typeof(export_payload)='object'), payload_sha256 text not null,
 exported_by uuid not null references public.profiles(id), exported_at timestamptz not null default now(),
 check(period_end>=period_start)
);

alter table public.birth_registrations enable row level security;
alter table public.death_registrations enable row level security;
alter table public.statutory_report_definitions enable row level security;
alter table public.statutory_report_suppression_rules enable row level security;
alter table public.statutory_report_exports enable row level security;
revoke all on public.birth_registrations,public.death_registrations,public.statutory_report_definitions,public.statutory_report_suppression_rules,public.statutory_report_exports from public,anon,authenticated;
grant select on public.birth_registrations,public.death_registrations,public.statutory_report_definitions,public.statutory_report_suppression_rules,public.statutory_report_exports to authenticated;
grant select,insert,update on public.birth_registrations,public.death_registrations,public.statutory_report_definitions,public.statutory_report_suppression_rules to service_role;
grant select,insert on public.statutory_report_exports to service_role;
drop policy if exists birth_registry_read on public.birth_registrations;
create policy birth_registry_read on public.birth_registrations for select to authenticated using(public.has_org_permission('vital_registry.read',facility_id,null));
drop policy if exists death_registry_read on public.death_registrations;
create policy death_registry_read on public.death_registrations for select to authenticated using(public.has_org_permission('vital_registry.read',facility_id,null));
drop policy if exists statutory_definition_read on public.statutory_report_definitions;
create policy statutory_definition_read on public.statutory_report_definitions for select to authenticated using(public.has_org_permission('statutory_report.read',facility_id,null));
drop policy if exists statutory_suppression_read on public.statutory_report_suppression_rules;
create policy statutory_suppression_read on public.statutory_report_suppression_rules for select to authenticated using(public.has_org_permission('statutory_report.read',facility_id,null));
drop policy if exists statutory_export_read on public.statutory_report_exports;
create policy statutory_export_read on public.statutory_report_exports for select to authenticated using(public.has_org_permission('statutory_report.read',facility_id,null));
drop trigger if exists audit_birth_registrations on public.birth_registrations;
create trigger audit_birth_registrations after insert or update on public.birth_registrations for each row execute function public.audit_row_change();
drop trigger if exists audit_death_registrations on public.death_registrations;
create trigger audit_death_registrations after insert or update on public.death_registrations for each row execute function public.audit_row_change();
drop trigger if exists audit_statutory_report_definitions on public.statutory_report_definitions;
create trigger audit_statutory_report_definitions after insert or update on public.statutory_report_definitions for each row execute function public.audit_row_change();
drop trigger if exists audit_statutory_report_suppression_rules on public.statutory_report_suppression_rules;
create trigger audit_statutory_report_suppression_rules after insert or update on public.statutory_report_suppression_rules for each row execute function public.audit_row_change();
drop trigger if exists audit_statutory_report_exports on public.statutory_report_exports;
create trigger audit_statutory_report_exports after insert on public.statutory_report_exports for each row execute function public.audit_row_change();
drop trigger if exists statutory_report_export_immutable on public.statutory_report_exports;
create trigger statutory_report_export_immutable before update or delete on public.statutory_report_exports for each row execute function public.prevent_consultation_history_mutation();

create or replace function public.register_birth(p_facility_id uuid,p_child_patient_id uuid,p_mother_patient_id uuid,p_mother_encounter_id uuid,
 p_maternity_source_event_id uuid,p_source_system text,p_occurred_at timestamptz,p_birth_outcome text,p_plurality integer,p_birth_order integer,p_sex_recorded text,p_source_reference text)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid; result uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if actor is null or not public.has_org_permission('vital_registry.manage',p_facility_id,null) or p_occurred_at is null
  or p_birth_outcome not in ('live_birth','stillbirth') or nullif(btrim(p_source_system),'') is null
  or (p_child_patient_id is null and p_mother_patient_id is null and p_mother_encounter_id is null and p_maternity_source_event_id is null)
  or (p_mother_patient_id is not null and not exists(select 1 from public.patients where id=p_mother_patient_id and (home_facility_id=p_facility_id or public.has_patient_facility_access(id))))
  or (p_child_patient_id is not null and not exists(select 1 from public.patients where id=p_child_patient_id and (home_facility_id=p_facility_id or public.has_patient_facility_access(id))))
  or (p_mother_encounter_id is not null and not exists(select 1 from public.encounters where id=p_mother_encounter_id and patient_id=p_mother_patient_id)) then
  raise exception 'Birth registration requires facility registry permission and a linked patient, maternity encounter, or source event.';
 end if;
 insert into public.birth_registrations(facility_id,child_patient_id,mother_patient_id,mother_encounter_id,maternity_source_event_id,source_system,occurred_at,birth_outcome,plurality,birth_order,sex_recorded,source_reference,created_by)
 values(p_facility_id,p_child_patient_id,p_mother_patient_id,p_mother_encounter_id,p_maternity_source_event_id,btrim(p_source_system),p_occurred_at,p_birth_outcome,coalesce(p_plurality,1),p_birth_order,p_sex_recorded,nullif(btrim(p_source_reference),''),actor) returning id into result;
 return result;
end $$;

create or replace function public.register_death(p_facility_id uuid,p_patient_id uuid,p_encounter_id uuid,p_source_system text,p_source_event_id uuid,p_occurred_at timestamptz,p_source_reference text)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid; result uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if actor is null or not public.has_org_permission('vital_registry.manage',p_facility_id,null) or p_occurred_at is null or nullif(btrim(p_source_system),'') is null
  or (p_patient_id is null and p_encounter_id is null and p_source_event_id is null)
  or (p_encounter_id is not null and not exists(select 1 from public.encounters e where e.id=p_encounter_id and e.case_type='bid' and e.death_assessment_status='death_confirmed' and (e.patient_id=p_patient_id or p_patient_id is null)))
  or (p_patient_id is not null and not exists(select 1 from public.patients where id=p_patient_id and (home_facility_id=p_facility_id or public.has_patient_facility_access(id)))) then
  raise exception 'Death registration requires facility registry permission and a verified emergency death encounter or patient/source link.';
 end if;
 insert into public.death_registrations(facility_id,patient_id,encounter_id,source_system,source_event_id,occurred_at,source_reference,created_by)
 values(p_facility_id,p_patient_id,p_encounter_id,btrim(p_source_system),p_source_event_id,p_occurred_at,nullif(btrim(p_source_reference),''),actor) returning id into result;
 return result;
end $$;

create or replace function public.verify_vital_registration(p_record_type text,p_record_id uuid,p_method text,p_notes text default null)
returns void language plpgsql security definer set search_path=public as $$
declare actor uuid; facility uuid; vstatus text;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if actor is null or not public.has_any_role(array['super_admin','records_officer','doctor']) or nullif(btrim(p_method),'') is null then raise exception 'Source verification requires an authorized verifier and method.'; end if;
 if p_record_type='birth' then
  select facility_id,verification_status into facility,vstatus from public.birth_registrations where id=p_record_id for update;
  if facility is null or not public.has_org_permission('vital_registry.manage',facility,null) or vstatus<>'pending' then raise exception 'Birth record is unavailable for verification.'; end if;
  update public.birth_registrations set verification_status='verified',verified_by=actor,verified_at=now(),source_verification_method=btrim(p_method),source_verification_notes=nullif(btrim(p_notes),'') where id=p_record_id;
 elsif p_record_type='death' then
  select facility_id,verification_status into facility,vstatus from public.death_registrations where id=p_record_id for update;
  if facility is null or not public.has_org_permission('vital_registry.manage',facility,null) or vstatus<>'pending' then raise exception 'Death record is unavailable for verification.'; end if;
  update public.death_registrations set verification_status='verified',verified_by=actor,verified_at=now(),source_verification_method=btrim(p_method),source_verification_notes=nullif(btrim(p_notes),'') where id=p_record_id;
 else raise exception 'Record type must be birth or death.'; end if;
end $$;

create or replace function public.configure_statutory_report(p_facility_id uuid,p_report_key text,p_report_name text,p_definition jsonb,p_official_mapping boolean default false)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid; v integer; result uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if actor is null or not public.has_org_permission('statutory_report.manage',p_facility_id,null) or nullif(btrim(p_report_key),'') is null or nullif(btrim(p_report_name),'') is null
  or jsonb_typeof(p_definition)<>'object' or coalesce(jsonb_typeof(p_definition->'measures'),'')<>'array'
  or exists(select 1 from jsonb_array_elements_text(p_definition->'measures') m where m not in ('verified_birth_count','verified_death_count'))
  or jsonb_array_length(p_definition->'measures')=0 then raise exception 'Report definition must contain supported aggregate measures and facility authorization.'; end if;
 select coalesce(max(version),0)+1 into v from public.statutory_report_definitions where facility_id=p_facility_id and report_key=p_report_key;
 update public.statutory_report_definitions set active=false where facility_id=p_facility_id and report_key=p_report_key and active;
 insert into public.statutory_report_definitions(facility_id,report_key,report_name,version,definition,official_mapping,configured_by)
 values(p_facility_id,btrim(p_report_key),btrim(p_report_name),v,p_definition,p_official_mapping,actor) returning id into result;
 return result;
end $$;

create or replace function public.configure_statutory_small_cell_rule(p_facility_id uuid,p_minimum_cell_count integer,p_policy_basis text)
returns void language plpgsql security definer set search_path=public as $$
declare actor uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if actor is null or not public.has_org_permission('statutory_report.manage',p_facility_id,null)
  or p_minimum_cell_count is not null and p_minimum_cell_count<2
  or p_minimum_cell_count is not null and nullif(btrim(p_policy_basis),'') is null then raise exception 'Small-cell rule requires facility authorization and a threshold of at least two with a documented basis.'; end if;
 insert into public.statutory_report_suppression_rules(facility_id,minimum_cell_count,policy_basis,configured_by,configured_at)
 values(p_facility_id,p_minimum_cell_count,nullif(btrim(p_policy_basis),''),case when p_minimum_cell_count is null then null else actor end,case when p_minimum_cell_count is null then null else now() end)
 on conflict(facility_id) do update set minimum_cell_count=excluded.minimum_cell_count,policy_basis=excluded.policy_basis,configured_by=excluded.configured_by,configured_at=excluded.configured_at;
end $$;

create or replace function public.aggregate_statutory_report(p_definition_id uuid,p_period_start date,p_period_end date)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare d public.statutory_report_definitions%rowtype; threshold integer; result jsonb; counts jsonb:='[]'::jsonb; m text; n bigint;
begin
 select * into d from public.statutory_report_definitions where id=p_definition_id and active;
 if d.id is null or p_period_start is null or p_period_end<p_period_start or not public.has_org_permission('statutory_report.read',d.facility_id,null) then raise exception 'Active facility report definition and valid period are required.'; end if;
 select minimum_cell_count into threshold from public.statutory_report_suppression_rules where facility_id=d.facility_id;
 for m in select jsonb_array_elements_text(d.definition->'measures') loop
  if m='verified_birth_count' then select count(*) into n from public.birth_registrations where facility_id=d.facility_id and verification_status='verified' and occurred_at::date between p_period_start and p_period_end;
  elsif m='verified_death_count' then select count(*) into n from public.death_registrations where facility_id=d.facility_id and verification_status='verified' and occurred_at::date between p_period_start and p_period_end;
  else raise exception 'Unsupported report measure.'; end if;
  counts:=counts||jsonb_build_array(jsonb_build_object('measure',m,'value',case when threshold is not null and n<threshold then null else n end,'suppressed',threshold is not null and n<threshold));
 end loop;
 result:=jsonb_build_object('report_key',d.report_key,'report_name',d.report_name,'version',d.version,'official_mapping',d.official_mapping,
  'facility_id',d.facility_id,'period_start',p_period_start,'period_end',p_period_end,'small_cell_threshold',threshold,'measures',counts);
 return result;
end $$;

create or replace function public.export_statutory_report(p_definition_id uuid,p_period_start date,p_period_end date,p_recipient text,p_purpose text)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid; d public.statutory_report_definitions%rowtype; payload jsonb; result uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 select * into d from public.statutory_report_definitions where id=p_definition_id and active;
 if actor is null or d.id is null or not public.has_org_permission('statutory_report.read',d.facility_id,null)
  or nullif(btrim(p_recipient),'') is null or nullif(btrim(p_purpose),'') is null then raise exception 'Report export requires facility report access, recipient, and purpose.'; end if;
 payload:=public.aggregate_statutory_report(d.id,p_period_start,p_period_end);
 insert into public.statutory_report_exports(facility_id,report_definition_id,report_version,period_start,period_end,recipient,purpose,export_payload,payload_sha256,exported_by)
 values(d.facility_id,d.id,d.version,p_period_start,p_period_end,btrim(p_recipient),btrim(p_purpose),payload,encode(digest(payload::text,'sha256'),'hex'),actor) returning id into result;
 return result;
end $$;

-- A deliberately illustrative definition; it contains no NHMIS form layout or indicator mapping.
insert into public.statutory_report_definitions(facility_id,report_key,report_name,version,definition,official_mapping,configured_by)
select f.id,'sample.vital_events','ILLUSTRATIVE SAMPLE — verified vital event counts (not an official NHMIS mapping)',1,
 '{"measures":["verified_birth_count","verified_death_count"],"dimensions":[],"mapping_status":"illustrative_only"}'::jsonb,false,
 (select p.id from public.profiles p where p.status::text='active' order by p.created_at limit 1)
from public.facilities f
where exists(select 1 from public.profiles p where p.status::text='active')
on conflict(facility_id,report_key,version) do nothing;

revoke all on function public.register_birth(uuid,uuid,uuid,uuid,uuid,text,timestamptz,text,integer,integer,text,text),
 public.register_death(uuid,uuid,uuid,text,uuid,timestamptz,text),public.verify_vital_registration(text,uuid,text,text),
 public.configure_statutory_report(uuid,text,text,jsonb,boolean),public.configure_statutory_small_cell_rule(uuid,integer,text),
 public.aggregate_statutory_report(uuid,date,date),public.export_statutory_report(uuid,date,date,text,text) from public,anon;
grant execute on function public.register_birth(uuid,uuid,uuid,uuid,uuid,text,timestamptz,text,integer,integer,text,text),
 public.register_death(uuid,uuid,uuid,text,uuid,timestamptz,text),public.verify_vital_registration(text,uuid,text,text),
 public.configure_statutory_report(uuid,text,text,jsonb,boolean),public.configure_statutory_small_cell_rule(uuid,integer,text),
 public.aggregate_statutory_report(uuid,date,date),public.export_statutory_report(uuid,date,date,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
