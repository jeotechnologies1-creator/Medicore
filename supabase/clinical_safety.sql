-- MediCore clinical-safety and interoperability migration
-- Run this AFTER schema.sql, clinical_modules.sql and wards_beds_insurance.sql.
-- It is intentionally additive: existing records remain available.

create extension if not exists pgcrypto;

-- A visit/encounter is the clinical context that ties notes, orders and observations together.
create table if not exists public.encounters (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  attending_clinician_id uuid references public.profiles(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  encounter_type text not null default 'outpatient' check (encounter_type in ('outpatient','emergency','inpatient','telehealth','home_visit')),
  status text not null default 'in_progress' check (status in ('planned','arrived','triaged','in_progress','completed','cancelled')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  location text,
  reason_for_visit text,
  created_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);

-- Keep safety-critical information as structured, longitudinal data instead of free text.
create table if not exists public.patient_allergies (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  encounter_id uuid references public.encounters(id) on delete set null,
  substance text not null,
  category text not null default 'medication' check (category in ('medication','food','environment','biologic','other')),
  reaction text,
  severity text check (severity in ('mild','moderate','severe','unknown')),
  criticality text not null default 'low' check (criticality in ('low','high','unable_to_assess')),
  verification_status text not null default 'unconfirmed' check (verification_status in ('unconfirmed','confirmed','refuted','entered_in_error')),
  clinical_status text not null default 'active' check (clinical_status in ('active','inactive','resolved')),
  onset_date date,
  recorded_by uuid references public.profiles(id) on delete set null,
  recorded_at timestamptz not null default now(),
  notes text
);

create table if not exists public.patient_conditions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  encounter_id uuid references public.encounters(id) on delete set null,
  condition_name text not null,
  code_system text,
  code text,
  clinical_status text not null default 'active' check (clinical_status in ('active','recurrence','relapse','inactive','remission','resolved')),
  verification_status text not null default 'provisional' check (verification_status in ('unconfirmed','provisional','differential','confirmed','refuted','entered_in_error')),
  onset_date date,
  abatement_date date,
  recorded_by uuid references public.profiles(id) on delete set null,
  recorded_at timestamptz not null default now(),
  notes text,
  check (abatement_date is null or onset_date is null or abatement_date >= onset_date)
);

create table if not exists public.medication_orders (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  encounter_id uuid references public.encounters(id) on delete set null,
  prescription_id uuid references public.prescriptions(id) on delete set null,
  ordered_by uuid references public.profiles(id) on delete set null,
  medication_name text not null,
  generic_name text,
  dose text not null,
  dose_unit text,
  route text,
  frequency text,
  indication text,
  start_date date not null default current_date,
  end_date date,
  status text not null default 'active' check (status in ('draft','active','on_hold','completed','cancelled','entered_in_error')),
  dispense_quantity numeric(10,2),
  refills integer not null default 0 check (refills >= 0),
  pharmacy_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create table if not exists public.care_plans (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  encounter_id uuid references public.encounters(id) on delete set null,
  author_id uuid references public.profiles(id) on delete set null,
  title text not null,
  description text,
  status text not null default 'active' check (status in ('draft','active','on_hold','completed','cancelled')),
  start_date date not null default current_date,
  target_date date,
  review_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.care_plan_goals (
  id uuid primary key default gen_random_uuid(),
  care_plan_id uuid not null references public.care_plans(id) on delete cascade,
  description text not null,
  target_date date,
  status text not null default 'in_progress' check (status in ('proposed','in_progress','achieved','sustaining','not_achieved','cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.clinical_tasks (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  encounter_id uuid references public.encounters(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  task_type text not null default 'follow_up',
  title text not null,
  due_at timestamptz,
  priority text not null default 'routine' check (priority in ('routine','urgent','stat')),
  status text not null default 'open' check (status in ('open','in_progress','completed','cancelled')),
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.patient_consents (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  consent_type text not null check (consent_type in ('treatment','privacy','data_sharing','procedure','telehealth','research')),
  status text not null default 'granted' check (status in ('granted','declined','withdrawn','expired')),
  granted_at timestamptz,
  expires_at timestamptz,
  recorded_by uuid references public.profiles(id) on delete set null,
  document_id uuid references public.patient_documents(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  check (expires_at is null or granted_at is null or expires_at >= granted_at)
);

-- Clinical decision-support results are persisted so alerts can be acknowledged and reviewed.
create table if not exists public.clinical_alerts (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  encounter_id uuid references public.encounters(id) on delete set null,
  alert_type text not null check (alert_type in ('allergy','vital','medication','duplicate_therapy','overdue_follow_up','other')),
  severity text not null default 'warning' check (severity in ('info','warning','critical')),
  message text not null,
  source_entity_type text,
  source_entity_id uuid,
  status text not null default 'open' check (status in ('open','acknowledged','resolved','dismissed')),
  acknowledged_by uuid references public.profiles(id) on delete set null,
  acknowledged_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_encounters_patient_started on public.encounters(patient_id, started_at desc);
create index if not exists idx_allergies_patient_active on public.patient_allergies(patient_id, clinical_status);
create index if not exists idx_conditions_patient_active on public.patient_conditions(patient_id, clinical_status);
create index if not exists idx_medication_orders_patient_status on public.medication_orders(patient_id, status);
create index if not exists idx_clinical_tasks_assignee_due on public.clinical_tasks(assigned_to, due_at) where status in ('open','in_progress');
create index if not exists idx_clinical_alerts_patient_status on public.clinical_alerts(patient_id, status);

-- Automatically keep updated_at correct and create a vital-sign safety alert for clearly dangerous values.
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists medication_orders_set_updated_at on public.medication_orders;
create trigger medication_orders_set_updated_at before update on public.medication_orders for each row execute function public.set_updated_at();
drop trigger if exists care_plans_set_updated_at on public.care_plans;
create trigger care_plans_set_updated_at before update on public.care_plans for each row execute function public.set_updated_at();

create or replace function public.raise_vital_sign_alert() returns trigger language plpgsql security definer set search_path = public as $$
declare alert_message text;
begin
  if new.oxygen_saturation is not null and new.oxygen_saturation < 90 then
    alert_message := 'Critical oxygen saturation: ' || new.oxygen_saturation || '%';
  elsif new.blood_pressure_systolic is not null and new.blood_pressure_systolic < 90 then
    alert_message := 'Hypotension: systolic blood pressure ' || new.blood_pressure_systolic || ' mmHg';
  elsif new.temperature is not null and new.temperature >= 39 then
    alert_message := 'High temperature: ' || new.temperature || ' °C';
  end if;
  if alert_message is not null then
    insert into public.clinical_alerts(patient_id, alert_type, severity, message, source_entity_type, source_entity_id)
    values (new.patient_id, 'vital', 'critical', alert_message, 'vital_signs', new.id);
  end if;
  return new;
end; $$;

drop trigger if exists vital_signs_alert on public.vital_signs;
create trigger vital_signs_alert after insert on public.vital_signs for each row execute function public.raise_vital_sign_alert();

-- Auth hardening: switch profiles from an application password column to Supabase Auth.
-- Create users in Supabase Auth (email/password or SSO), then set role/department on their profile.
alter table public.profiles add column if not exists auth_user_id uuid unique references auth.users(id) on delete cascade;
alter table public.profiles add column if not exists patient_id uuid unique references public.patients(id) on delete set null;
alter table public.profiles drop column if exists password;

create or replace function public.handle_new_auth_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (auth_user_id, email, full_name, role, status)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)), 'receptionist', 'active')
  on conflict (email) do update set auth_user_id = excluded.auth_user_id;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_auth_user();

-- Tighten policies created by earlier MediCore scripts on already-deployed projects.
-- Role- and patient-scoped policies should replace this transitional staff setup before go-live.
do $$
declare table_name text;
begin
  foreach table_name in array array['profiles','patients','appointments','lab_orders','radiology_orders','prescriptions','pharmacy_inventory','billing','admissions','surgeries','notifications','audit_logs','medical_offices','office_staff','vital_signs','consultations','patient_documents','immunizations','medication_administrations','wards','beds','insurance_claims']
  loop
    execute format('drop policy if exists %I on public.%I', 'Allow all access for authenticated users', table_name);
    execute format('drop policy if exists %I on public.%I', 'Authenticated application access', table_name);
    execute format('create policy %I on public.%I for all using (auth.uid() is not null) with check (auth.uid() is not null)', 'Authenticated application access', table_name);
  end loop;
end; $$;

create or replace function public.current_profile_role() returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where auth_user_id = auth.uid() limit 1;
$$;

create or replace function public.is_clinical_staff() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_profile_role() in ('super_admin','doctor','nurse','pharmacist','laboratory_scientist','radiographer'), false);
$$;

create or replace function public.can_access_patient(target_patient_id uuid) returns boolean language sql stable security definer set search_path = public as $$
  select public.is_clinical_staff()
      or exists (select 1 from public.profiles where auth_user_id = auth.uid() and patient_id = target_patient_id);
$$;

-- These are the policies for the new clinical tables. Existing broad policies in schema.sql
-- must be removed before production; do not deploy a public/anonymously accessible database.
alter table public.encounters enable row level security;
alter table public.patient_allergies enable row level security;
alter table public.patient_conditions enable row level security;
alter table public.medication_orders enable row level security;
alter table public.care_plans enable row level security;
alter table public.care_plan_goals enable row level security;
alter table public.clinical_tasks enable row level security;
alter table public.patient_consents enable row level security;
alter table public.clinical_alerts enable row level security;

drop policy if exists "clinical staff or patient read encounters" on public.encounters;
drop policy if exists "clinical staff manage encounters" on public.encounters;
drop policy if exists "clinical staff or patient read allergies" on public.patient_allergies;
drop policy if exists "clinical staff manage allergies" on public.patient_allergies;
drop policy if exists "clinical staff or patient read conditions" on public.patient_conditions;
drop policy if exists "clinical staff manage conditions" on public.patient_conditions;
drop policy if exists "clinical staff or patient read medication orders" on public.medication_orders;
drop policy if exists "clinical staff manage medication orders" on public.medication_orders;
drop policy if exists "clinical staff or patient read care plans" on public.care_plans;
drop policy if exists "clinical staff manage care plans" on public.care_plans;
drop policy if exists "clinical staff manage care goals" on public.care_plan_goals;
drop policy if exists "clinical staff or patient read tasks" on public.clinical_tasks;
drop policy if exists "clinical staff manage tasks" on public.clinical_tasks;
drop policy if exists "clinical staff or patient read consents" on public.patient_consents;
drop policy if exists "clinical staff manage consents" on public.patient_consents;
drop policy if exists "clinical staff read alerts" on public.clinical_alerts;
drop policy if exists "clinical staff manage alerts" on public.clinical_alerts;
create policy "clinical staff or patient read encounters" on public.encounters for select using (public.can_access_patient(patient_id));
create policy "clinical staff manage encounters" on public.encounters for all using (public.is_clinical_staff()) with check (public.is_clinical_staff());
create policy "clinical staff or patient read allergies" on public.patient_allergies for select using (public.can_access_patient(patient_id));
create policy "clinical staff manage allergies" on public.patient_allergies for all using (public.is_clinical_staff()) with check (public.is_clinical_staff());
create policy "clinical staff or patient read conditions" on public.patient_conditions for select using (public.can_access_patient(patient_id));
create policy "clinical staff manage conditions" on public.patient_conditions for all using (public.is_clinical_staff()) with check (public.is_clinical_staff());
create policy "clinical staff or patient read medication orders" on public.medication_orders for select using (public.can_access_patient(patient_id));
create policy "clinical staff manage medication orders" on public.medication_orders for all using (public.is_clinical_staff()) with check (public.is_clinical_staff());
create policy "clinical staff or patient read care plans" on public.care_plans for select using (public.can_access_patient(patient_id));
create policy "clinical staff manage care plans" on public.care_plans for all using (public.is_clinical_staff()) with check (public.is_clinical_staff());
create policy "clinical staff manage care goals" on public.care_plan_goals for all using (public.is_clinical_staff()) with check (public.is_clinical_staff());
create policy "clinical staff or patient read tasks" on public.clinical_tasks for select using (public.can_access_patient(patient_id));
create policy "clinical staff manage tasks" on public.clinical_tasks for all using (public.is_clinical_staff()) with check (public.is_clinical_staff());
create policy "clinical staff or patient read consents" on public.patient_consents for select using (public.can_access_patient(patient_id));
create policy "clinical staff manage consents" on public.patient_consents for all using (public.is_clinical_staff()) with check (public.is_clinical_staff());
create policy "clinical staff read alerts" on public.clinical_alerts for select using (public.is_clinical_staff());
create policy "clinical staff manage alerts" on public.clinical_alerts for all using (public.is_clinical_staff()) with check (public.is_clinical_staff());
