create extension if not exists pgcrypto;

create table if not exists public.wards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  specialty text,
  capacity integer not null default 0,
  occupied integer not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.beds (
  id uuid primary key default gen_random_uuid(),
  ward_id uuid not null references public.wards(id) on delete cascade,
  bed_number text not null,
  status text not null default 'available',
  created_at timestamptz not null default now(),
  unique (ward_id, bed_number)
);

create table if not exists public.insurance_claims (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  claim_number text not null unique,
  provider text not null,
  amount_claimed numeric(12,2) not null default 0,
  amount_approved numeric(12,2) not null default 0,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

alter table public.wards enable row level security;
alter table public.beds enable row level security;
alter table public.insurance_claims enable row level security;

create policy "Allow all access for authenticated users"
on public.wards
for all
using (true)
with check (true);

create policy "Allow all access for authenticated users"
on public.beds
for all
using (true)
with check (true);

create policy "Allow all access for authenticated users"
on public.insurance_claims
for all
using (true)
with check (true);

create index if not exists idx_wards_status on public.wards(status);
create index if not exists idx_beds_ward_id on public.beds(ward_id);
create index if not exists idx_insurance_claims_patient_id on public.insurance_claims(patient_id);
