-- Additive completion of family, insurance, admission, and theatre workflows.
-- Apply after hospital_workflows.sql. No existing clinical records are dropped.

create table if not exists public.family_cards (
  id uuid primary key default gen_random_uuid(),
  card_number text not null unique default ('FC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))),
  primary_contact_patient_id uuid references public.patients(id) on delete set null,
  contact_name text not null,
  contact_phone text,
  address text,
  status text not null default 'active' check (status in ('active','inactive')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.family_card_members (
  id uuid primary key default gen_random_uuid(),
  family_card_id uuid not null references public.family_cards(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  relationship text not null check (relationship in ('primary_contact','parent','child','spouse','guardian','sibling','other')),
  linked_by uuid references public.profiles(id) on delete set null,
  linked_at timestamptz not null default now(),
  unique (family_card_id, patient_id)
);
create index if not exists family_card_members_patient_idx on public.family_card_members(patient_id);
alter table public.family_cards enable row level security;
alter table public.family_card_members enable row level security;
revoke all on public.family_cards, public.family_card_members from anon;
grant select, insert, update on public.family_cards, public.family_card_members to authenticated;
drop policy if exists "HIM manage family cards" on public.family_cards;
drop policy if exists "HIM read family cards" on public.family_cards;
drop policy if exists "HIM manage family members" on public.family_card_members;
drop policy if exists "HIM read family members" on public.family_card_members;
create policy "HIM read family cards" on public.family_cards for select using (public.has_any_role(array['super_admin','records_officer','receptionist']));
create policy "HIM manage family cards" on public.family_cards for all using (public.has_any_role(array['super_admin','records_officer'])) with check (public.has_any_role(array['super_admin','records_officer']));
create policy "HIM read family members" on public.family_card_members for select using (public.has_any_role(array['super_admin','records_officer','receptionist']));
create policy "HIM manage family members" on public.family_card_members for all using (public.has_any_role(array['super_admin','records_officer'])) with check (public.has_any_role(array['super_admin','records_officer']));
drop trigger if exists audit_family_cards on public.family_cards;
create trigger audit_family_cards after insert or update or delete on public.family_cards for each row execute function public.audit_row_change();
drop trigger if exists audit_family_card_members on public.family_card_members;
create trigger audit_family_card_members after insert or update or delete on public.family_card_members for each row execute function public.audit_row_change();

create table if not exists public.insurance_memberships (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  provider text not null,
  scheme text,
  plan_name text,
  policy_number text not null,
  principal_member text,
  dependent_relationship text,
  coverage_status text not null default 'pending' check (coverage_status in ('pending','active','inactive','rejected','expired')),
  effective_from date,
  effective_to date,
  copayment numeric(12,2) not null default 0 check (copayment >= 0),
  deductible numeric(12,2) not null default 0 check (deductible >= 0),
  verification_status text not null default 'pending_manual' check (verification_status in ('pending_manual','verified_manual','rejected_manual')),
  verification_reference text,
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_from is null or effective_to >= effective_from)
);
create index if not exists insurance_memberships_patient_idx on public.insurance_memberships(patient_id, created_at desc);
alter table public.insurance_memberships enable row level security;
revoke all on public.insurance_memberships from anon;
grant select, insert, update on public.insurance_memberships to authenticated;
drop policy if exists "authorized read insurance memberships" on public.insurance_memberships;
drop policy if exists "finance manage insurance memberships" on public.insurance_memberships;
create policy "authorized read insurance memberships" on public.insurance_memberships for select
  using (public.has_any_role(array['super_admin','accountant','records_officer']) or public.can_access_patient(patient_id));
create policy "finance manage insurance memberships" on public.insurance_memberships for all
  using (public.has_any_role(array['super_admin','accountant','records_officer']))
  with check (public.has_any_role(array['super_admin','accountant','records_officer']));
drop trigger if exists audit_insurance_memberships on public.insurance_memberships;
create trigger audit_insurance_memberships after insert or update or delete on public.insurance_memberships for each row execute function public.audit_row_change();

create table if not exists public.insurance_eligibility_checks (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.insurance_memberships(id) on delete cascade,
  encounter_id uuid references public.encounters(id) on delete set null,
  service_type text not null,
  status text not null check (status in ('pending_manual','eligible','ineligible','authorization_required')),
  reference text,
  notes text,
  checked_by uuid references public.profiles(id) on delete set null,
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.insurance_eligibility_checks enable row level security;
revoke all on public.insurance_eligibility_checks from anon;
grant select, insert on public.insurance_eligibility_checks to authenticated;
drop policy if exists "insurance staff manage eligibility checks" on public.insurance_eligibility_checks;
create policy "insurance staff manage eligibility checks" on public.insurance_eligibility_checks for all
  using (public.has_any_role(array['super_admin','accountant','records_officer']))
  with check (public.has_any_role(array['super_admin','accountant','records_officer']));
drop trigger if exists audit_insurance_eligibility_checks on public.insurance_eligibility_checks;
create trigger audit_insurance_eligibility_checks after insert or update or delete on public.insurance_eligibility_checks for each row execute function public.audit_row_change();

alter table public.admissions add column if not exists encounter_id uuid references public.encounters(id) on delete set null;
alter table public.admissions add column if not exists bed_id uuid references public.beds(id) on delete set null;
alter table public.admissions add column if not exists requested_ward_id uuid references public.wards(id) on delete set null;
alter table public.admissions add column if not exists admission_priority text not null default 'routine';
alter table public.admissions add column if not exists discharge_summary text;
alter table public.admissions add column if not exists discharge_instructions text;
alter table public.admissions add column if not exists discharged_by uuid references public.profiles(id) on delete set null;
alter table public.admissions add column if not exists discharged_at timestamptz;
alter table public.beds add column if not exists admission_id uuid references public.admissions(id) on delete set null;
drop index if exists public.beds_one_admission_per_bed;
create unique index beds_one_admission_per_bed on public.beds(admission_id) where status = 'occupied' and admission_id is not null;
create unique index if not exists admissions_one_active_bed on public.admissions(bed_id) where status = 'active' and bed_id is not null;

create or replace function public.request_inpatient_admission(p_patient_id uuid, p_encounter_id uuid, p_doctor_id uuid, p_ward_id uuid, p_diagnosis text, p_acuity text default 'stable', p_priority text default 'routine')
returns uuid language plpgsql security definer set search_path = public as $$
declare request_id uuid; ward_row public.wards%rowtype;
begin
  if not public.has_any_role(array['super_admin','doctor']) then raise exception 'Only a treating clinician may request inpatient admission.'; end if;
  if p_patient_id is null or nullif(trim(p_diagnosis),'') is null then raise exception 'Patient and clinical admission indication are required.'; end if;
  if public.has_any_role(array['doctor']) and p_doctor_id is distinct from (select id from public.profiles where auth_user_id=auth.uid() limit 1) then raise exception 'The admission request must record the authenticated clinician.'; end if;
  if p_ward_id is not null then select * into ward_row from public.wards where id=p_ward_id and status='active'; if not found then raise exception 'Requested ward is unavailable.'; end if; end if;
  insert into public.admissions(patient_id, encounter_id, requested_ward_id, ward, doctor_id, diagnosis, acuity, admission_priority, status)
  values(p_patient_id,p_encounter_id,p_ward_id,ward_row.name,p_doctor_id,trim(p_diagnosis),coalesce(p_acuity,'stable'),coalesce(p_priority,'routine'),'awaiting_bed') returning id into request_id;
  return request_id;
end;
$$;
revoke all on function public.request_inpatient_admission(uuid,uuid,uuid,uuid,text,text,text) from public, anon;
grant execute on function public.request_inpatient_admission(uuid,uuid,uuid,uuid,text,text,text) to authenticated;

create or replace function public.allocate_requested_admission(p_admission_id uuid, p_bed_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare admission_row public.admissions%rowtype; bed_row public.beds%rowtype; ward_row public.wards%rowtype;
begin
  if not public.has_any_role(array['super_admin','nurse']) then raise exception 'Only ward staff may allocate an inpatient bed.'; end if;
  select * into admission_row from public.admissions where id=p_admission_id for update;
  if not found or admission_row.status <> 'awaiting_bed' then raise exception 'Admission request is no longer awaiting a bed.'; end if;
  select * into bed_row from public.beds where id=p_bed_id for update;
  if not found or bed_row.status <> 'available' then raise exception 'The selected bed is not available.'; end if;
  if admission_row.requested_ward_id is not null and bed_row.ward_id <> admission_row.requested_ward_id then raise exception 'The selected bed is not in the requested ward.'; end if;
  select * into ward_row from public.wards where id=bed_row.ward_id for update;
  update public.beds set status='occupied', admission_id=admission_row.id where id=bed_row.id;
  update public.admissions set bed_id=bed_row.id, ward=ward_row.name, bed_number=bed_row.bed_number, status='active', admission_date=current_date where id=admission_row.id;
  update public.wards set occupied=(select count(*) from public.beds where ward_id=ward_row.id and status='occupied') where id=ward_row.id;
end;
$$;
revoke all on function public.allocate_requested_admission(uuid,uuid) from public, anon;
grant execute on function public.allocate_requested_admission(uuid,uuid) to authenticated;
create or replace function public.allocate_admission_bed(
  p_patient_id uuid, p_encounter_id uuid, p_doctor_id uuid, p_bed_id uuid,
  p_diagnosis text, p_acuity text default 'stable', p_priority text default 'routine'
) returns uuid language plpgsql security definer set search_path = public as $$
declare bed_row public.beds%rowtype; ward_row public.wards%rowtype; admission_uuid uuid;
begin
  if not public.has_any_role(array['super_admin','nurse']) then raise exception 'Only ward staff may allocate an inpatient bed.'; end if;
  if p_patient_id is null or p_bed_id is null or nullif(trim(p_diagnosis), '') is null then raise exception 'Patient, available bed, and admission indication are required.'; end if;
  select * into bed_row from public.beds where id = p_bed_id for update;
  if not found or bed_row.status <> 'available' then raise exception 'The selected bed is not available.'; end if;
  select * into ward_row from public.wards where id = bed_row.ward_id for update;
  if not found or ward_row.status <> 'active' then raise exception 'The selected ward is unavailable.'; end if;
  insert into public.admissions(patient_id, encounter_id, bed_id, ward, bed_number, doctor_id, diagnosis, acuity, admission_priority, status)
  values (p_patient_id, p_encounter_id, bed_row.id, ward_row.name, bed_row.bed_number, p_doctor_id, trim(p_diagnosis), coalesce(p_acuity,'stable'), coalesce(p_priority,'routine'), 'active')
  returning id into admission_uuid;
  update public.beds set status = 'occupied', admission_id = admission_uuid where id = bed_row.id;
  update public.wards set occupied = (select count(*) from public.beds where ward_id = ward_row.id and status = 'occupied') where id = ward_row.id;
  return admission_uuid;
end;
$$;
-- Keep the compatibility RPC disabled: it can create an active admission in one
-- step and would bypass the clinician request and ward allocation workflow.
revoke all on function public.allocate_admission_bed(uuid,uuid,uuid,uuid,text,text,text) from public, anon, authenticated;

create or replace function public.complete_inpatient_disposition(p_admission_id uuid, p_disposition text, p_summary text, p_instructions text default null)
returns void language plpgsql security definer set search_path = public as $$
declare admission_row public.admissions%rowtype; bed_row public.beds%rowtype;
begin
  if not public.has_any_role(array['super_admin','doctor','nurse']) then raise exception 'Admission disposition access denied.'; end if;
  if p_disposition not in ('discharged','transferred') or nullif(trim(p_summary), '') is null then raise exception 'Select a valid disposition and provide a discharge or transfer summary.'; end if;
  if p_disposition='discharged' and not public.has_any_role(array['super_admin','doctor']) then raise exception 'Only the treating clinician may authorize discharge.'; end if;
  select * into admission_row from public.admissions where id = p_admission_id for update;
  if not found or admission_row.status <> 'active' then raise exception 'This admission is not active.'; end if;
  update public.admissions set status = p_disposition, discharge_date = current_date, discharged_at = now(), discharged_by = (select id from public.profiles where auth_user_id = auth.uid() limit 1), discharge_summary = trim(p_summary), discharge_instructions = nullif(trim(p_instructions), '') where id = p_admission_id;
  if admission_row.bed_id is not null then
    select * into bed_row from public.beds where id = admission_row.bed_id for update;
    update public.beds set status = 'available', admission_id = null where id = admission_row.bed_id and admission_id = p_admission_id;
    update public.wards set occupied = (select count(*) from public.beds where ward_id = bed_row.ward_id and status = 'occupied') where id = bed_row.ward_id;
  end if;
end;
$$;
revoke all on function public.complete_inpatient_disposition(uuid,text,text,text) from public, anon;
grant execute on function public.complete_inpatient_disposition(uuid,text,text,text) to authenticated;

create or replace function public.guard_admission_bed_transitions() returns trigger
language plpgsql security definer set search_path = public as $$
declare actor uuid;
begin
  select id into actor from public.profiles where auth_user_id=auth.uid() limit 1;
  if tg_op='INSERT' then
    if new.status <> 'awaiting_bed' or new.bed_id is not null then raise exception 'Admission requests must wait for ward bed allocation.'; end if;
    return new;
  end if;
  if new.bed_id is distinct from old.bed_id and not (old.status='awaiting_bed' and new.status='active') then raise exception 'Beds may only be assigned through the ward allocation workflow.'; end if;
  if new.status is distinct from old.status then
    if old.status='awaiting_bed' and new.status='active' then
      if new.bed_id is null or not exists(select 1 from public.beds b where b.id=new.bed_id and b.status='occupied' and b.admission_id=new.id and b.bed_number=new.bed_number) then raise exception 'An available bed must be atomically allocated before admission.'; end if;
    elsif old.status='active' and new.status in ('discharged','transferred') then
      if nullif(trim(new.discharge_summary),'') is null or new.discharged_by is distinct from actor or new.discharged_at is null then raise exception 'An authorized disposition with summary and staff identity is required.'; end if;
      if new.status='discharged' and not public.has_any_role(array['super_admin','doctor']) then raise exception 'Only the treating clinician may authorize discharge.'; end if;
      if new.status='transferred' and not public.has_any_role(array['super_admin','doctor','nurse']) then raise exception 'Only the care team may authorize transfer.'; end if;
    else
      raise exception 'This inpatient status transition is not permitted.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_admission_bed_transitions on public.admissions;
create trigger guard_admission_bed_transitions before insert or update on public.admissions for each row execute function public.guard_admission_bed_transitions();

create or replace function public.guard_bed_occupancy() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status='occupied' and (new.ward_id is distinct from old.ward_id or new.bed_number is distinct from old.bed_number) then raise exception 'An occupied bed cannot be moved or renumbered.'; end if;
  if new.status='occupied' then
    if new.admission_id is null or not exists(select 1 from public.admissions a where a.id=new.admission_id and a.status='awaiting_bed' and (a.requested_ward_id is null or a.requested_ward_id=new.ward_id)) then raise exception 'Bed occupation requires a matching pending admission request.'; end if;
  elsif new.status='available' and new.admission_id is not null then
    raise exception 'An available bed cannot retain an admission assignment.';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_bed_occupancy on public.beds;
create trigger guard_bed_occupancy before update on public.beds for each row execute function public.guard_bed_occupancy();

alter table public.surgeries add column if not exists encounter_id uuid references public.encounters(id) on delete set null;
alter table public.surgeries add column if not exists indication text;
alter table public.surgeries add column if not exists diagnosis text;
alter table public.surgeries add column if not exists requesting_clinician_id uuid references public.profiles(id) on delete set null;
alter table public.surgeries add column if not exists review_reason text;
alter table public.surgeries add column if not exists consent_status text not null default 'pending';
alter table public.surgeries add column if not exists preoperative_notes text;
alter table public.surgeries add column if not exists operative_notes text;
alter table public.surgeries add column if not exists postoperative_plan text;
alter table public.surgeries add column if not exists started_at timestamptz;
alter table public.surgeries add column if not exists ended_at timestamptz;
alter table public.surgeries add column if not exists complications text;
alter table public.surgeries drop constraint if exists surgeries_priority_allowed;
alter table public.surgeries add constraint surgeries_priority_allowed check (priority in ('elective','urgent','emergency')) not valid;
create or replace function public.guard_surgery_workflow() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op='INSERT' then
    if not public.has_any_role(array['super_admin','doctor','surgeon']) then raise exception 'Only an authorized clinician may request surgery.'; end if;
    if new.status <> 'requested' then raise exception 'Surgical requests must enter the review queue first.'; end if;
    new.requesting_clinician_id := coalesce(new.requesting_clinician_id,(select id from public.profiles where auth_user_id=auth.uid() limit 1));
    return new;
  end if;
  if new.status in ('deferred','rejected') and nullif(trim(new.review_reason),'') is null then raise exception 'A reason is required to defer or reject surgery.'; end if;
  if new.priority='elective' and new.status in ('scheduled','in-progress') and new.consent_status <> 'documented' then raise exception 'Document consent before scheduling or starting elective surgery.'; end if;
  if new.status='scheduled' and (new.scheduled_time is null or nullif(trim(new.ot_room),'') is null) then raise exception 'A scheduled procedure requires a time and theatre room.'; end if;
  if new.status='in-progress' then new.started_at := coalesce(new.started_at,now()); end if;
  if new.status='completed' then
    if nullif(trim(new.operative_notes),'') is null or nullif(trim(new.postoperative_plan),'') is null then raise exception 'Operative notes and a postoperative plan are required before completing surgery.'; end if;
    new.ended_at := coalesce(new.ended_at,now());
  end if;
  return new;
end;
$$;
drop trigger if exists guard_surgery_workflow on public.surgeries;
create trigger guard_surgery_workflow before insert or update on public.surgeries for each row execute function public.guard_surgery_workflow();
create unique index if not exists surgeries_theatre_slot_unique on public.surgeries(scheduled_date, scheduled_time, ot_room)
  where status in ('scheduled','in-progress') and scheduled_time is not null and ot_room is not null;

-- Orders remain patient linked while optionally attached to the current encounter.
alter table public.lab_orders add column if not exists encounter_id uuid references public.encounters(id) on delete set null;
alter table public.lab_orders add column if not exists specimen_collected_at timestamptz;
alter table public.lab_orders add column if not exists result_verified_at timestamptz;
alter table public.lab_orders add column if not exists verified_by uuid references public.profiles(id) on delete set null;
alter table public.lab_orders add column if not exists clinical_notes text;
alter table public.lab_orders add column if not exists result_verified_at timestamptz;
alter table public.lab_orders add column if not exists result_verified_by uuid references public.profiles(id) on delete set null;
alter table public.prescriptions add column if not exists encounter_id uuid references public.encounters(id) on delete set null;
alter table public.prescriptions add column if not exists priority text not null default 'routine';
alter table public.prescriptions drop constraint if exists prescriptions_priority_allowed;
alter table public.prescriptions add constraint prescriptions_priority_allowed check (priority in ('routine','urgent','emergency')) not valid;
alter table public.consultations add column if not exists encounter_id uuid references public.encounters(id) on delete set null;
alter table public.vital_signs add column if not exists encounter_id uuid references public.encounters(id) on delete set null;
alter table public.radiology_orders add column if not exists encounter_id uuid references public.encounters(id) on delete set null;
alter table public.medication_administrations add column if not exists encounter_id uuid references public.encounters(id) on delete set null;

alter table public.patients add column if not exists identity_status text not null default 'verified';
alter table public.patients add column if not exists temporary_identifier text unique;
alter table public.patients add column if not exists merged_into_patient_id uuid references public.patients(id) on delete set null;
alter table public.patients add column if not exists identity_verified_at timestamptz;
alter table public.encounters add column if not exists registration_staff_id uuid references public.profiles(id) on delete set null;
do $$
declare role_label text; role_type_schema text; role_type_name text;
begin
  select type_namespace.nspname, type_def.typname into role_type_schema, role_type_name
  from pg_attribute attribute_def join pg_class table_def on table_def.oid=attribute_def.attrelid
  join pg_namespace table_namespace on table_namespace.oid=table_def.relnamespace
  join pg_type type_def on type_def.oid=attribute_def.atttypid join pg_namespace type_namespace on type_namespace.oid=type_def.typnamespace
  where table_namespace.nspname='public' and table_def.relname='profiles' and attribute_def.attname='role' and attribute_def.attnum>0 and not attribute_def.attisdropped and type_def.typtype='e';
  if role_type_name is not null then
    foreach role_label in array array['surgeon','specialist','theatre_staff'] loop
      execute format('alter type %I.%I add value if not exists %L', role_type_schema, role_type_name, role_label);
    end loop;
  end if;
end $$;
alter table public.patients drop constraint if exists patients_identity_status_allowed;
alter table public.patients add constraint patients_identity_status_allowed check (identity_status in ('verified','unidentified','merged')) not valid;
alter table public.profiles drop constraint if exists profiles_role_allowed;
alter table public.profiles add constraint profiles_role_allowed check (role::text in ('super_admin','doctor','nurse','receptionist','pharmacist','laboratory_scientist','radiographer','accountant','records_officer','surgeon','specialist','theatre_staff','patient')) not valid;

create or replace function public.register_unidentified_emergency(
  p_reason text, p_arrival_mode text default null, p_presenting_emergency text default null,
  p_triage_priority text default 'emergency', p_referral_source text default null, p_accompanying_person text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare temp_patient uuid; encounter_uuid uuid; temp_number text;
begin
  if not public.has_any_role(array['super_admin','records_officer','receptionist','doctor','nurse']) then raise exception 'Emergency registration access denied.'; end if;
  if nullif(trim(p_reason), '') is null then raise exception 'Presenting circumstances are required.'; end if;
  temp_patient := gen_random_uuid();
  temp_number := 'TEMP-' || upper(substr(replace(temp_patient::text, '-', ''), 1, 12));
  insert into public.patients(id, patient_number, first_name, last_name, identity_status, temporary_identifier, registration_date)
  values (temp_patient, temp_number, 'Unidentified', 'Emergency Patient', 'unidentified', temp_number, current_date);
  insert into public.encounters(patient_id, encounter_type, status, reason_for_visit, case_type, arrival_mode, presenting_emergency, triage_priority, referral_source, accompanying_person)
  values (temp_patient, 'emergency', 'arrived', trim(p_reason), 'emergency', nullif(trim(p_arrival_mode),''), nullif(trim(p_presenting_emergency),''), coalesce(p_triage_priority,'emergency'), nullif(trim(p_referral_source),''), nullif(trim(p_accompanying_person),'')) returning id into encounter_uuid;
  update public.encounters set registration_staff_id = (select id from public.profiles where auth_user_id = auth.uid() limit 1) where id = encounter_uuid;
  insert into public.encounter_workflow_events(encounter_id, patient_id, event_type, to_status, department, notes, actor_id)
  values (encounter_uuid, temp_patient, 'unidentified_emergency_registered', 'arrived', 'Emergency / HIM', trim(p_reason), (select id from public.profiles where auth_user_id = auth.uid() limit 1));
  return encounter_uuid;
end;
$$;
revoke all on function public.register_unidentified_emergency(text,text,text,text,text,text) from public, anon;
grant execute on function public.register_unidentified_emergency(text,text,text,text,text,text) to authenticated;

create or replace function public.merge_unidentified_patient(p_temporary_patient_id uuid, p_permanent_patient_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare temp_row public.patients%rowtype; real_row public.patients%rowtype; table_name text;
begin
  if not public.has_any_role(array['super_admin','records_officer','doctor']) then raise exception 'Identity verification access denied.'; end if;
  if p_temporary_patient_id = p_permanent_patient_id or nullif(trim(p_reason),'') is null then raise exception 'Select distinct patient records and document the verification reason.'; end if;
  select * into temp_row from public.patients where id = p_temporary_patient_id for update;
  if not found then raise exception 'Temporary patient record not found.'; end if;
  select * into real_row from public.patients where id = p_permanent_patient_id for update;
  if not found then raise exception 'Permanent patient record not found.'; end if;
  if temp_row.identity_status <> 'unidentified' then raise exception 'The source record is not an unidentified temporary record.'; end if;
  insert into public.encounter_workflow_events(encounter_id, patient_id, event_type, department, notes, actor_id)
  select e.id, e.patient_id, 'identity_verification_started', 'Health Information Management', trim(p_reason), (select id from public.profiles where auth_user_id = auth.uid() limit 1)
  from public.encounters e where e.patient_id = p_temporary_patient_id;
  -- Repoint the encounter and all patient-linked history atomically. The temporary
  -- patient row remains as a merge tombstone for audit and traceability.
  foreach table_name in array array['encounters','encounter_workflow_events','appointments','lab_orders','radiology_orders','prescriptions','vital_signs','consultations','admissions','surgeries','patient_allergies','patient_conditions','medication_orders','care_plans','clinical_tasks','patient_consents','clinical_alerts','patient_documents','immunizations','medication_administrations','insurance_claims','insurance_memberships','billing','payment_submissions','patient_messages','medication_refill_requests','patient_access_logs','patient_record_referrals','result_acknowledgements','medication_reconciliations'] loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('update public.%I set patient_id = $1 where patient_id = $2', table_name) using p_permanent_patient_id, p_temporary_patient_id;
    end if;
  end loop;
  update public.family_cards set primary_contact_patient_id=p_permanent_patient_id where primary_contact_patient_id=p_temporary_patient_id;
  update public.family_card_members temporary_member set patient_id = p_permanent_patient_id
  where temporary_member.patient_id = p_temporary_patient_id
    and not exists (select 1 from public.family_card_members existing_member where existing_member.family_card_id = temporary_member.family_card_id and existing_member.patient_id = p_permanent_patient_id);
  delete from public.family_card_members where patient_id = p_temporary_patient_id;
  update public.patients set identity_status = 'merged', merged_into_patient_id = p_permanent_patient_id where id = p_temporary_patient_id;
  update public.patients set identity_verified_at = now() where id = p_permanent_patient_id;
  insert into public.encounter_workflow_events(encounter_id, patient_id, event_type, department, notes, actor_id)
  select e.id, p_permanent_patient_id, 'identity_verified_and_linked', 'Health Information Management', trim(p_reason), (select id from public.profiles where auth_user_id = auth.uid() limit 1)
  from public.encounters e join public.encounter_workflow_events old_event on old_event.encounter_id = e.id and old_event.event_type = 'identity_verification_started'
  where e.patient_id = p_permanent_patient_id;
end;
$$;
revoke all on function public.merge_unidentified_patient(uuid,uuid,text) from public, anon;
grant execute on function public.merge_unidentified_patient(uuid,uuid,text) to authenticated;

drop policy if exists "clinical manage admissions" on public.admissions;
drop policy if exists "authorized read admissions" on public.admissions;
create policy "authorized read admissions" on public.admissions for select using (public.can_read_patient_record(patient_id));
revoke insert, update, delete on public.admissions from anon, authenticated;
grant select on public.admissions to authenticated;
drop policy if exists "clinical manage beds" on public.beds;
drop policy if exists "staff read beds" on public.beds;
create policy "staff read beds" on public.beds for select using (public.is_staff());
revoke insert, update, delete on public.beds from anon, authenticated;
grant select on public.beds to authenticated;
drop policy if exists "clinical manage surgeries" on public.surgeries;
drop policy if exists "authorized read surgeries" on public.surgeries;
create policy "authorized read surgeries" on public.surgeries for select using (public.can_read_patient_record(patient_id));
create policy "clinical manage surgeries" on public.surgeries for all using (public.has_any_role(array['super_admin','doctor','surgeon','theatre_staff','nurse'])) with check (public.has_any_role(array['super_admin','doctor','surgeon','theatre_staff','nurse']));

create or replace function public.can_manage_patient_table(target_table text) returns boolean
language sql stable security definer set search_path = public as $$
  select case target_table
    when 'lab_orders' then public.has_any_role(array['super_admin','doctor','specialist','laboratory_scientist'])
    when 'radiology_orders' then public.has_any_role(array['super_admin','doctor','specialist','radiographer'])
    when 'prescriptions' then public.has_any_role(array['super_admin','doctor','specialist'])
    when 'vital_signs' then public.has_any_role(array['super_admin','doctor','specialist','nurse'])
    when 'consultations' then public.has_any_role(array['super_admin','doctor','specialist','nurse'])
    when 'patient_documents' then public.has_any_role(array['super_admin','doctor','specialist','nurse'])
    when 'immunizations' then public.has_any_role(array['super_admin','doctor','specialist','nurse'])
    when 'medication_administrations' then public.has_any_role(array['super_admin','doctor','nurse'])
    when 'encounters' then public.has_any_role(array['super_admin','doctor','specialist','nurse'])
    when 'patient_allergies' then public.has_any_role(array['super_admin','doctor','specialist','nurse'])
    when 'patient_conditions' then public.has_any_role(array['super_admin','doctor','specialist','nurse'])
    when 'medication_orders' then public.has_any_role(array['super_admin','doctor','specialist','nurse'])
    when 'care_plans' then public.has_any_role(array['super_admin','doctor','specialist','nurse'])
    when 'clinical_tasks' then public.has_any_role(array['super_admin','doctor','specialist','nurse'])
    when 'patient_consents' then public.has_any_role(array['super_admin','doctor','specialist','nurse'])
    when 'clinical_alerts' then public.has_any_role(array['super_admin','doctor','specialist','nurse'])
    else false
  end;
$$;

create or replace function public.can_read_patient_record(target_patient_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_clinical_staff()
    or public.has_any_role(array['records_officer','surgeon','specialist'])
    or exists (select 1 from public.profiles where auth_user_id = auth.uid() and status::text='active' and patient_id=target_patient_id);
$$;

create or replace function public.guard_lab_result_verification() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.result_status in ('final','corrected') and old.result_status is distinct from new.result_status then
    if not public.has_any_role(array['super_admin','doctor','laboratory_scientist']) then raise exception 'Only authorized laboratory or medical staff may verify laboratory results.'; end if;
    if new.results is null or new.result_verified_by is distinct from (select id from public.profiles where auth_user_id = auth.uid() limit 1) then raise exception 'A verified result requires saved findings and the verifying staff identity.'; end if;
    new.result_verified_at := coalesce(new.result_verified_at, now());
    if new.status <> 'critical' then new.status := 'completed'; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_lab_result_verification on public.lab_orders;
create trigger guard_lab_result_verification before update on public.lab_orders for each row execute function public.guard_lab_result_verification();

drop policy if exists "authorized clinical read encounters" on public.encounters;
create policy "authorized clinical read encounters" on public.encounters for select using (
  public.can_read_patient_record(patient_id)
  or (registration_staff_id = (select id from public.profiles where auth_user_id = auth.uid() limit 1) and public.has_any_role(array['receptionist']))
);
drop policy if exists "reception read own encounter history" on public.encounter_workflow_events;
create policy "reception read own encounter history" on public.encounter_workflow_events for select using (
  public.has_any_role(array['receptionist']) and exists(select 1 from public.encounters e where e.id = encounter_id and e.registration_staff_id = (select id from public.profiles where auth_user_id = auth.uid() limit 1))
);

create or replace function public.record_encounter_workflow_event_from_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare payload jsonb; target_encounter uuid; target_patient uuid; event_status text; department_name text; actor uuid;
begin
  payload := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  target_encounter := nullif(payload->>'encounter_id','')::uuid;
  target_patient := nullif(payload->>'patient_id','')::uuid;
  if target_encounter is null or target_patient is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  event_status := payload->>'status';
  department_name := case tg_table_name when 'vital_signs' then 'Nursing' when 'consultations' then 'Medical' when 'lab_orders' then 'Laboratory' when 'radiology_orders' then 'Radiology' when 'prescriptions' then 'Pharmacy' when 'medication_administrations' then 'Ward / Nursing' when 'surgeries' then 'Surgery / Theatre' when 'admissions' then 'Ward / Inpatient' else 'Clinical Care' end;
  select id into actor from public.profiles where auth_user_id = auth.uid() limit 1;
  if actor is not null and exists(select 1 from public.encounters where id = target_encounter and patient_id = target_patient) then
    insert into public.encounter_workflow_events(encounter_id, patient_id, event_type, to_status, department, actor_id)
    values(target_encounter, target_patient, tg_table_name || '_' || lower(tg_op), event_status, department_name, actor);
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
do $$ declare table_name text; begin
  foreach table_name in array array['vital_signs','consultations','lab_orders','radiology_orders','prescriptions','medication_administrations','surgeries','admissions'] loop
    execute format('drop trigger if exists workflow_event_%I on public.%I', table_name, table_name);
    execute format('create trigger workflow_event_%I after insert or update or delete on public.%I for each row execute function public.record_encounter_workflow_event_from_row()', table_name, table_name);
  end loop;
end $$;

notify pgrst, 'reload schema';
