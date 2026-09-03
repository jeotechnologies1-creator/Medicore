create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password text not null,
  role text not null default 'super_admin',
  full_name text not null,
  department text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  patient_number text unique,
  first_name text not null,
  last_name text not null,
  date_of_birth date,
  gender text,
  phone text,
  email text,
  address text,
  blood_group text,
  emergency_contact_name text,
  emergency_contact_phone text,
  insurance_provider text,
  insurance_policy_number text,
  status text not null default 'active',
  allergies text default 'None',
  chronic_conditions text default 'None',
  registration_date date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients(id) on delete cascade,
  doctor_id uuid references public.profiles(id),
  appointment_date date not null,
  appointment_time text,
  appointment_type text,
  department text,
  status text not null default 'scheduled',
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.lab_orders (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients(id) on delete cascade,
  doctor_id uuid references public.profiles(id),
  test_type text not null,
  category text,
  priority text not null default 'routine',
  status text not null default 'pending',
  ordered_date date not null default current_date,
  result_date date,
  results jsonb,
  technician_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.radiology_orders (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients(id) on delete cascade,
  doctor_id uuid references public.profiles(id),
  study_type text not null,
  modality text,
  status text not null default 'requested',
  priority text not null default 'routine',
  ordered_date date not null default current_date,
  scheduled_date date,
  report text,
  radiologist_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients(id) on delete cascade,
  doctor_id uuid references public.profiles(id),
  diagnosis text,
  medications jsonb not null default '[]'::jsonb,
  status text not null default 'active',
  prescription_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.pharmacy_inventory (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  generic_name text,
  category text,
  stock_quantity integer not null default 0,
  reorder_level integer not null default 0,
  unit_price numeric(10,2) default 0,
  expiry_date date,
  batch_number text,
  supplier text,
  location text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.billing (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients(id) on delete cascade,
  invoice_number text not null unique,
  invoice_date date not null default current_date,
  subtotal numeric(12,2) default 0,
  discount numeric(12,2) default 0,
  tax numeric(12,2) default 0,
  total numeric(12,2) default 0,
  paid numeric(12,2) default 0,
  balance numeric(12,2) default 0,
  payment_method text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.admissions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients(id) on delete cascade,
  ward text,
  bed_number text,
  admission_date date not null default current_date,
  discharge_date date,
  doctor_id uuid references public.profiles(id),
  diagnosis text,
  status text not null default 'active',
  acuity text default 'stable',
  created_at timestamptz not null default now()
);

create table if not exists public.surgeries (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients(id) on delete cascade,
  surgeon_id uuid references public.profiles(id),
  procedure text not null,
  scheduled_date date not null,
  scheduled_time text,
  duration text,
  status text not null default 'scheduled',
  ot_room text,
  anesthesia text,
  priority text default 'elective',
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id),
  type text,
  title text,
  message text,
  read boolean default false,
  priority text default 'medium',
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id),
  action text not null,
  entity_type text,
  entity_id text,
  timestamp timestamptz not null default now(),
  severity text default 'info',
  created_at timestamptz not null default now()
);

insert into public.profiles (email, password, role, full_name, department, status)
values ('admin@medicore.local', 'admin123', 'super_admin', 'System Administrator', 'IT', 'active')
on conflict (email) do nothing;

alter table public.profiles enable row level security;
alter table public.patients enable row level security;
alter table public.appointments enable row level security;
alter table public.lab_orders enable row level security;
alter table public.radiology_orders enable row level security;
alter table public.prescriptions enable row level security;
alter table public.pharmacy_inventory enable row level security;
alter table public.billing enable row level security;
alter table public.admissions enable row level security;
alter table public.surgeries enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

create policy "Allow all access for authenticated users" on public.profiles for all using (true) with check (true);
create policy "Allow all access for authenticated users" on public.patients for all using (true) with check (true);
create policy "Allow all access for authenticated users" on public.appointments for all using (true) with check (true);
create policy "Allow all access for authenticated users" on public.lab_orders for all using (true) with check (true);
create policy "Allow all access for authenticated users" on public.radiology_orders for all using (true) with check (true);
create policy "Allow all access for authenticated users" on public.prescriptions for all using (true) with check (true);
create policy "Allow all access for authenticated users" on public.pharmacy_inventory for all using (true) with check (true);
create policy "Allow all access for authenticated users" on public.billing for all using (true) with check (true);
create policy "Allow all access for authenticated users" on public.admissions for all using (true) with check (true);
create policy "Allow all access for authenticated users" on public.surgeries for all using (true) with check (true);
create policy "Allow all access for authenticated users" on public.notifications for all using (true) with check (true);
create policy "Allow all access for authenticated users" on public.audit_logs for all using (true) with check (true);
