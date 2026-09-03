create table if not exists public.office_staff (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.medical_offices(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'specialist',
  is_lead boolean not null default false,
  created_at timestamptz not null default now(),
  unique (office_id, profile_id)
);

alter table public.office_staff enable row level security;

create policy "Allow all access for authenticated users"
on public.office_staff
for all
using (true)
with check (true);

create index if not exists idx_office_staff_office_id
on public.office_staff(office_id);

create index if not exists idx_office_staff_profile_id
on public.office_staff(profile_id);