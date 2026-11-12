begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

create table if not exists public.code_systems (
  code text primary key,
  name text not null,
  version text,
  source_url text,
  licence_note text,
  loaded_at timestamptz
);

create table if not exists public.concepts (
  system text not null references public.code_systems(code) on update cascade on delete restrict,
  code text not null,
  display text not null,
  active boolean not null default true,
  parent_code text,
  primary key(system,code)
);
create index if not exists concepts_search_display_idx on public.concepts using gin (to_tsvector('simple',display));
create index if not exists concepts_system_active_idx on public.concepts(system,active);
create index if not exists concepts_code_prefix_idx on public.concepts(code text_pattern_ops) where active;
create index if not exists concepts_parent_idx on public.concepts(system,parent_code) where parent_code is not null;

-- Register supported systems only. No clinical concepts or codes are bundled.
insert into public.code_systems(code,name) values
  ('ICD-10','International Classification of Diseases, 10th Revision'),
  ('SNOMED CT','SNOMED Clinical Terms'),
  ('LOINC','Logical Observation Identifiers Names and Codes'),
  ('ATC','Anatomical Therapeutic Chemical Classification System')
on conflict(code) do update set name=excluded.name;

alter table public.consultations add column if not exists code_system text;
alter table public.consultations add column if not exists code text;
alter table public.consultations add column if not exists display text;
alter table public.prescriptions add column if not exists code_system text;
alter table public.prescriptions add column if not exists code text;
alter table public.prescriptions add column if not exists display text;
alter table public.admissions add column if not exists code_system text;
alter table public.admissions add column if not exists code text;
alter table public.admissions add column if not exists display text;
alter table public.surgeries add column if not exists code_system text;
alter table public.surgeries add column if not exists code text;
alter table public.surgeries add column if not exists display text;
alter table public.patient_allergies add column if not exists code_system text;
alter table public.patient_allergies add column if not exists code text;
alter table public.patient_allergies add column if not exists display text;
alter table public.patient_conditions add column if not exists display text;
alter table public.lab_orders add column if not exists code_system text;
alter table public.lab_orders add column if not exists code text;
alter table public.lab_orders add column if not exists display text;
alter table public.radiology_orders add column if not exists code_system text;
alter table public.radiology_orders add column if not exists code text;
alter table public.radiology_orders add column if not exists display text;

-- Newly added coded fields may only reference concepts loaded from the
-- corresponding official release. Patient conditions retain legacy code
-- columns, which are reported as uncoded until reviewed and reconciled.
do $$
declare t text; constraint_name text;
begin
  foreach t in array array['consultations','prescriptions','admissions','surgeries','patient_allergies','lab_orders','radiology_orders'] loop
    constraint_name:=t||'_terminology_concept_fkey';
    if not exists(select 1 from pg_constraint where conrelid=format('public.%I',t)::regclass and conname=constraint_name) then
      execute format('alter table public.%I add constraint %I foreign key(code_system,code) references public.concepts(system,code) on update cascade on delete restrict not valid',t,constraint_name);
    end if;
    execute format('alter table public.%I validate constraint %I',t,constraint_name);
  end loop;
end $$;

-- patient_conditions already carried legacy code fields. Keep historical
-- values untouched while requiring concept references on subsequent coded
-- writes.
do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.patient_conditions'::regclass and conname='patient_conditions_terminology_concept_fkey') then
    alter table public.patient_conditions add constraint patient_conditions_terminology_concept_fkey
      foreign key(code_system,code) references public.concepts(system,code) on update cascade on delete restrict not valid;
  end if;
end $$;

create or replace function public.request_inpatient_admission_coded(
  p_patient_id uuid,p_encounter_id uuid,p_doctor_id uuid,p_ward_id uuid,
  p_diagnosis text,p_acuity text,p_priority text,
  p_code_system text,p_code text,p_display text
) returns uuid language plpgsql security definer set search_path=public as $$
declare request_id uuid;
begin
  if (p_code_system is null) <> (p_code is null) or (p_code is null) <> (p_display is null) then
    raise exception 'Diagnosis coding must include system, code, and display together.' using errcode='22023';
  end if;
  if p_code is not null and not exists(select 1 from public.concepts where system=p_code_system and code=p_code and display=p_display) then
    raise exception 'Diagnosis concept is not present in the loaded terminology.' using errcode='22023';
  end if;
  request_id:=public.request_inpatient_admission(p_patient_id,p_encounter_id,p_doctor_id,p_ward_id,p_diagnosis,p_acuity,p_priority);
  if p_code is not null then
    update public.admissions set code_system=p_code_system,code=p_code,display=p_display where id=request_id;
  end if;
  return request_id;
end $$;
revoke all on function public.request_inpatient_admission_coded(uuid,uuid,uuid,uuid,text,text,text,text,text,text) from public,anon;
grant execute on function public.request_inpatient_admission_coded(uuid,uuid,uuid,uuid,text,text,text,text,text,text) to authenticated;

alter table public.code_systems enable row level security;
alter table public.concepts enable row level security;
revoke all on public.code_systems,public.concepts from public,anon,authenticated;
grant select on public.code_systems,public.concepts to authenticated;
grant select,insert,update,delete on public.code_systems,public.concepts to service_role;

-- Keep this migration applicable on databases where the pending-user gate
-- migration has not yet installed this helper. This definition matches its
-- active, assigned application-role semantics.
create or replace function public.has_active_application_profile()
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce(exists(
    select 1 from public.profiles p
    where p.auth_user_id=auth.uid() and p.status::text='active'
      and p.role::text in ('super_admin','doctor','nurse','receptionist','pharmacist',
        'laboratory_scientist','radiographer','accountant','records_officer','surgeon',
        'specialist','theatre_staff','patient')
  ),false)
$$;
revoke all on function public.has_active_application_profile() from public,anon;
grant execute on function public.has_active_application_profile() to authenticated;

drop policy if exists "active users read code systems" on public.code_systems;
create policy "active users read code systems" on public.code_systems for select to authenticated
  using (public.has_active_application_profile());
drop policy if exists "active users read concepts" on public.concepts;
create policy "active users read concepts" on public.concepts for select to authenticated
  using (public.has_active_application_profile());
drop policy if exists "active profile terminology gate" on public.code_systems;
create policy "active profile terminology gate" on public.code_systems as restrictive for all to authenticated
  using (public.has_active_application_profile()) with check (public.has_active_application_profile());
drop policy if exists "active profile terminology gate" on public.concepts;
create policy "active profile terminology gate" on public.concepts as restrictive for all to authenticated
  using (public.has_active_application_profile()) with check (public.has_active_application_profile());

create or replace view public.uncoded_terminology_entries with (security_invoker=true) as
  select 'consultations'::text as source_table,id as source_id,patient_id,'diagnosis'::text as field_name,diagnosis as free_text,created_at
    from public.consultations where nullif(btrim(diagnosis),'') is not null and (code_system is null or code is null or display is null)
  union all
  select 'prescriptions',id,patient_id,'diagnosis',diagnosis,created_at from public.prescriptions
    where nullif(btrim(diagnosis),'') is not null and (code_system is null or code is null or display is null)
  union all
  select 'admissions',id,patient_id,'diagnosis',diagnosis,created_at from public.admissions
    where nullif(btrim(diagnosis),'') is not null and (code_system is null or code is null or display is null)
  union all
  select 'surgeries',id,patient_id,'diagnosis',diagnosis,created_at from public.surgeries
    where nullif(btrim(diagnosis),'') is not null and (code_system is null or code is null or display is null)
  union all
  select 'patient_allergies',id,patient_id,'substance',substance,recorded_at from public.patient_allergies
    where nullif(btrim(substance),'') is not null and (code_system is null or code is null or display is null)
  union all
  select 'patient_conditions',id,patient_id,'condition_name',condition_name,recorded_at from public.patient_conditions
    where nullif(btrim(condition_name),'') is not null and (code_system is null or code is null or display is null)
  union all
  select 'lab_orders',id,patient_id,'test_type',test_type,created_at from public.lab_orders
    where nullif(btrim(test_type),'') is not null and (code_system is null or code is null or display is null)
  union all
  select 'radiology_orders',id,patient_id,'study_type',study_type,created_at from public.radiology_orders
    where nullif(btrim(study_type),'') is not null and (code_system is null or code is null or display is null);
grant select on public.uncoded_terminology_entries to authenticated;

commit;
notify pgrst,'reload schema';
