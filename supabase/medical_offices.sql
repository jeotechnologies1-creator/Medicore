create extension if not exists pgcrypto;

create table if not exists public.medical_offices (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  office_type text not null default 'Clinic',
  specialty text not null,
  location text,
  phone text,
  email text,
  status text not null default 'active',
  head_doctor_id uuid references public.profiles(id),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.medical_offices enable row level security;

drop policy if exists "Allow all access for authenticated users" on public.medical_offices;
create policy "Allow all access for authenticated users"
on public.medical_offices
for all
using (auth.uid() is not null)
with check (auth.uid() is not null);

create index if not exists idx_medical_offices_status
on public.medical_offices(status);

create index if not exists idx_medical_offices_specialty
on public.medical_offices(specialty);
