create extension if not exists pgcrypto;

create table if not exists public.vital_signs (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  recorded_by uuid references public.profiles(id),
  temperature numeric(4,1),
  heart_rate integer,
  blood_pressure_systolic integer,
  blood_pressure_diastolic integer,
  respiratory_rate integer,
  oxygen_saturation integer,
  pain_score integer default 0,
  weight numeric(5,1),
  height numeric(5,1),
  bmi numeric(5,1),
  consciousness text default 'Alert',
  recorded_at timestamptz not null default now()
);

create table if not exists public.consultations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  doctor_id uuid references public.profiles(id),
  chief_complaint text,
  diagnosis text,
  assessment text,
  plan text,
  follow_up_date date,
  status text not null default 'completed',
  created_at timestamptz not null default now()
);

create table if not exists public.patient_documents (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  file_name text not null,
  document_type text not null default 'Clinical Note',
  file_url text,
  uploaded_by uuid references public.profiles(id),
  size text default '0 KB',
  created_at timestamptz not null default now()
);

create table if not exists public.immunizations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  vaccine text not null,
  status text not null default 'scheduled',
  administered_date date,
  next_due_date date,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.medication_administrations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  prescription_id uuid references public.prescriptions(id) on delete set null,
  medication_name text not null,
  dosage text,
  administered_by uuid references public.profiles(id),
  administered_at timestamptz not null default now(),
  notes text
);

alter table public.vital_signs enable row level security;
alter table public.consultations enable row level security;
alter table public.patient_documents enable row level security;
alter table public.immunizations enable row level security;
alter table public.medication_administrations enable row level security;

drop policy if exists "Allow all access for authenticated users" on public.vital_signs;
drop policy if exists "Allow all access for authenticated users" on public.consultations;
drop policy if exists "Allow all access for authenticated users" on public.patient_documents;
drop policy if exists "Allow all access for authenticated users" on public.immunizations;
drop policy if exists "Allow all access for authenticated users" on public.medication_administrations;

create policy "Allow all access for authenticated users" on public.vital_signs for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Allow all access for authenticated users" on public.consultations for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Allow all access for authenticated users" on public.patient_documents for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Allow all access for authenticated users" on public.immunizations for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Allow all access for authenticated users" on public.medication_administrations for all using (auth.uid() is not null) with check (auth.uid() is not null);

create index if not exists idx_vital_signs_patient_id on public.vital_signs(patient_id);
create index if not exists idx_consultations_patient_id on public.consultations(patient_id);
create index if not exists idx_patient_documents_patient_id on public.patient_documents(patient_id);
create index if not exists idx_immunizations_patient_id on public.immunizations(patient_id);
create index if not exists idx_medication_admin_patient_id on public.medication_administrations(patient_id);
