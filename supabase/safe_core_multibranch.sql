-- Apply after role_authorization.sql. Test in staging before production.
-- This is a data and authorization foundation, not a compliance certification.

-- Fail clearly when this migration is run against an uninitialised project.
-- The core schema and authorization helpers are intentionally not duplicated
-- here because that could replace or weaken an existing deployment.
do $$
begin
  if to_regclass('public.patients') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.encounters') is null
     or to_regprocedure('public.can_read_patient_record(uuid)') is null then
    raise exception 'OneMed prerequisites are missing. Apply schema.sql, medical_offices.sql, office_staff.sql, wards_beds_insurance.sql, clinical_modules.sql, clinical_safety.sql, patient_portal.sql, production_hardening.sql, atomic_pharmacy_dispensing.sql, quality_safety_upgrade.sql, app_activation.sql, and role_authorization.sql before safe_core_multibranch.sql.';
  end if;
end $$;

create table if not exists public.facilities (
  id uuid primary key default gen_random_uuid(), code text not null unique, name text not null,
  facility_type text not null default 'hospital' check (facility_type in ('hospital','clinic','diagnostic_center','pharmacy')),
  address text, state text, phone text, email text, timezone text not null default 'Africa/Lagos',
  status text not null default 'active' check (status in ('active','inactive')), created_at timestamptz not null default now()
);
create table if not exists public.facility_bank_accounts (
  id uuid primary key default gen_random_uuid(), facility_id uuid not null references public.facilities(id) on delete cascade,
  bank_name text not null, account_name text not null, account_number text not null, currency text not null default 'NGN',
  is_primary boolean not null default false, status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(), unique (facility_id, account_number)
);
create unique index if not exists facility_primary_bank_account_idx on public.facility_bank_accounts (facility_id) where is_primary and status = 'active';

alter table public.profiles add column if not exists facility_id uuid references public.facilities(id) on delete set null;
alter table public.patients add column if not exists home_facility_id uuid references public.facilities(id) on delete set null;
alter table public.patients add column if not exists medical_record_number text;
alter table public.patients add column if not exists national_id_hash text;
alter table public.patients add column if not exists photo_path text;
alter table public.patients add column if not exists genotype text;
alter table public.patients add column if not exists marital_status text;
alter table public.patients add column if not exists occupation text;
alter table public.patients add column if not exists nationality text;
alter table public.patients add column if not exists state_of_residence text;
alter table public.patients add column if not exists local_government_area text;
alter table public.patients add column if not exists identity_verified_at timestamptz;
alter table public.patients add column if not exists identity_verified_by uuid references public.profiles(id) on delete set null;
create unique index if not exists patients_facility_mrn_unique on public.patients (home_facility_id, medical_record_number) where home_facility_id is not null and medical_record_number is not null;
create unique index if not exists patients_national_id_hash_unique on public.patients (national_id_hash) where national_id_hash is not null;
create table if not exists public.patient_next_of_kin (
  id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.patients(id) on delete cascade,
  full_name text not null, relationship text not null, phone text, address text, is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists patient_primary_next_of_kin_idx on public.patient_next_of_kin (patient_id) where is_primary;

create table if not exists public.nursing_notes (
  id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.patients(id) on delete cascade,
  encounter_id uuid references public.encounters(id) on delete set null, author_id uuid references public.profiles(id) on delete set null,
  shift text, note text not null check (length(trim(note)) > 0), handover_to uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(), amended_at timestamptz
);
create table if not exists public.intake_output_records (
  id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.patients(id) on delete cascade,
  encounter_id uuid references public.encounters(id) on delete set null, recorded_by uuid references public.profiles(id) on delete set null,
  recorded_at timestamptz not null default now(), intake_ml numeric(10,2) not null default 0 check (intake_ml >= 0),
  output_ml numeric(10,2) not null default 0 check (output_ml >= 0), output_type text, notes text
);
create table if not exists public.pain_assessments (
  id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.patients(id) on delete cascade,
  encounter_id uuid references public.encounters(id) on delete set null, recorded_by uuid references public.profiles(id) on delete set null,
  score smallint not null check (score between 0 and 10), scale text not null default 'numeric_rating', intervention text,
  reassessment_due_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.emergency_visits (
  id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.patients(id) on delete cascade,
  encounter_id uuid unique references public.encounters(id) on delete set null, triage_by uuid references public.profiles(id) on delete set null,
  triage_level text not null check (triage_level in ('resuscitation','emergent','urgent','less_urgent','non_urgent')),
  chief_complaint text not null, arrival_at timestamptz not null default now(), seen_at timestamptz,
  disposition text check (disposition in ('discharged','admitted','transferred','left_without_being_seen','deceased')),
  trauma_activated boolean not null default false, notes text, created_at timestamptz not null default now()
);

create table if not exists public.clinical_record_versions (
  id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.patients(id) on delete cascade,
  entity_type text not null, entity_id uuid not null, version_number integer not null,
  operation text not null check (operation in ('INSERT','UPDATE','DELETE')), record_snapshot jsonb not null,
  changed_by uuid references public.profiles(id) on delete set null, changed_at timestamptz not null default now(),
  unique (entity_type, entity_id, version_number)
);
create index if not exists clinical_record_versions_patient_idx on public.clinical_record_versions (patient_id, changed_at desc);
create or replace function public.version_clinical_record() returns trigger language plpgsql security definer set search_path = public as $$
declare source jsonb; actor uuid; next_version integer;
begin
  source := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  select id into actor from public.profiles where auth_user_id = auth.uid() limit 1;
  select coalesce(max(version_number), 0) + 1 into next_version from public.clinical_record_versions where entity_type = tg_table_name and entity_id = (source ->> 'id')::uuid;
  insert into public.clinical_record_versions(patient_id, entity_type, entity_id, version_number, operation, record_snapshot, changed_by)
  values ((source ->> 'patient_id')::uuid, tg_table_name, (source ->> 'id')::uuid, next_version, tg_op, source, actor);
  return case when tg_op = 'DELETE' then old else new end;
end; $$;
do $$ declare table_name text; begin
  foreach table_name in array array['consultations','nursing_notes','medication_orders','patient_conditions','patient_allergies'] loop
    execute format('drop trigger if exists version_%I on public.%I', table_name, table_name);
    execute format('create trigger version_%I after insert or update or delete on public.%I for each row execute function public.version_clinical_record()', table_name, table_name);
  end loop;
end $$;

create table if not exists public.patient_access_logs (
  id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.patients(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null, action text not null default 'read', purpose text,
  source text not null default 'web', accessed_at timestamptz not null default now()
);
create index if not exists patient_access_logs_patient_idx on public.patient_access_logs(patient_id, accessed_at desc);
create or replace function public.log_patient_access(target_patient_id uuid, access_purpose text default null) returns void language plpgsql security definer set search_path = public as $$
declare actor uuid; begin
  if not public.can_read_patient_record(target_patient_id) then raise exception 'Not authorized to access this patient record'; end if;
  select id into actor from public.profiles where auth_user_id = auth.uid() limit 1;
  insert into public.patient_access_logs(patient_id, actor_id, purpose) values (target_patient_id, actor, nullif(trim(access_purpose), ''));
end; $$;
revoke all on function public.log_patient_access(uuid, text) from public;
grant execute on function public.log_patient_access(uuid, text) to authenticated;

create table if not exists public.fhir_exchange_jobs (
  id uuid primary key default gen_random_uuid(), patient_id uuid references public.patients(id) on delete set null,
  resource_type text not null, resource_id uuid, operation text not null check (operation in ('create','update','delete','export')),
  payload jsonb not null default '{}'::jsonb, status text not null default 'pending' check (status in ('pending','processing','completed','failed')),
  error_message text, created_at timestamptz not null default now(), processed_at timestamptz
);
create table if not exists public.downtime_events (
  id uuid primary key default gen_random_uuid(), facility_id uuid references public.facilities(id) on delete set null,
  started_at timestamptz not null, ended_at timestamptz, declared_by uuid references public.profiles(id) on delete set null,
  recovery_owner uuid references public.profiles(id) on delete set null, status text not null default 'open' check (status in ('open','recovering','reconciled','closed')),
  notes text, created_at timestamptz not null default now(), check (ended_at is null or ended_at >= started_at)
);

alter table public.facilities enable row level security;
alter table public.facility_bank_accounts enable row level security;
alter table public.patient_next_of_kin enable row level security;
alter table public.nursing_notes enable row level security;
alter table public.intake_output_records enable row level security;
alter table public.pain_assessments enable row level security;
alter table public.emergency_visits enable row level security;
alter table public.clinical_record_versions enable row level security;
alter table public.patient_access_logs enable row level security;
alter table public.fhir_exchange_jobs enable row level security;
alter table public.downtime_events enable row level security;
do $$
declare table_name text; policy_name text;
begin
  foreach table_name in array array['facilities','facility_bank_accounts','patient_next_of_kin','nursing_notes','intake_output_records','pain_assessments','emergency_visits','clinical_record_versions','patient_access_logs','fhir_exchange_jobs','downtime_events'] loop
    for policy_name in select policyname from pg_policies where schemaname = 'public' and tablename = table_name loop
      execute format('drop policy if exists %I on public.%I', policy_name, table_name);
    end loop;
  end loop;
end $$;
create policy "staff read facilities" on public.facilities for select using (public.is_staff());
create policy "admins manage facilities" on public.facilities for all using (public.is_admin()) with check (public.is_admin());
create policy "finance read bank accounts" on public.facility_bank_accounts for select using (public.has_any_role(array['super_admin','accountant','receptionist']));
create policy "admins manage bank accounts" on public.facility_bank_accounts for all using (public.is_admin()) with check (public.is_admin());
do $$ declare table_name text; begin
  foreach table_name in array array['patient_next_of_kin','nursing_notes','intake_output_records','pain_assessments','emergency_visits','clinical_record_versions','patient_access_logs'] loop
    execute format('create policy %I on public.%I for select using (public.can_read_patient_record(patient_id))', 'authorized patient record read', table_name);
  end loop;
  foreach table_name in array array['patient_next_of_kin','nursing_notes','intake_output_records','pain_assessments','emergency_visits'] loop
    execute format('create policy %I on public.%I for all using (public.has_any_role(array[''super_admin'',''doctor'',''nurse''])) with check (public.has_any_role(array[''super_admin'',''doctor'',''nurse'']))', 'clinical manage record', table_name);
  end loop;
end $$;
create policy "admins read clinical versions" on public.clinical_record_versions for select using (public.is_admin());
create policy "admins read patient access logs" on public.patient_access_logs for select using (public.is_admin());
create policy "admins manage fhir jobs" on public.fhir_exchange_jobs for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage downtime events" on public.downtime_events for all using (public.is_admin()) with check (public.is_admin());
