-- Run after schema.sql and clinical_safety.sql.
-- Portal communication and refill requests are persisted records, never browser-only data.

create table if not exists public.patient_messages (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  sender_profile_id uuid references public.profiles(id) on delete set null,
  sender_name text not null,
  direction text not null check (direction in ('incoming', 'outgoing')),
  message text not null check (length(trim(message)) > 0),
  read_at timestamptz,
  sent_at timestamptz not null default now()
);

create table if not exists public.medication_refill_requests (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  medication_name text not null,
  quantity numeric(10,2),
  notes text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'cancelled', 'fulfilled')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_patient_messages_patient_sent on public.patient_messages(patient_id, sent_at);
create index if not exists idx_refill_requests_patient_status on public.medication_refill_requests(patient_id, status);

alter table public.patient_messages enable row level security;
alter table public.medication_refill_requests enable row level security;

drop policy if exists "portal participants read messages" on public.patient_messages;
drop policy if exists "patients send messages" on public.patient_messages;
drop policy if exists "clinical staff send messages" on public.patient_messages;
drop policy if exists "portal participants read refill requests" on public.medication_refill_requests;
drop policy if exists "patients request refills" on public.medication_refill_requests;
drop policy if exists "clinical staff manage refill requests" on public.medication_refill_requests;

create policy "portal participants read messages" on public.patient_messages for select using (public.can_access_patient(patient_id));
create policy "patients send messages" on public.patient_messages for insert with check (
  exists (select 1 from public.profiles p where p.auth_user_id = auth.uid() and p.patient_id = patient_messages.patient_id)
  and direction = 'outgoing'
);
create policy "clinical staff send messages" on public.patient_messages for insert with check (public.is_clinical_staff());
create policy "portal participants read refill requests" on public.medication_refill_requests for select using (public.can_access_patient(patient_id));
create policy "patients request refills" on public.medication_refill_requests for insert with check (
  exists (select 1 from public.profiles p where p.auth_user_id = auth.uid() and p.patient_id = medication_refill_requests.patient_id)
  and status = 'pending'
);
create policy "clinical staff manage refill requests" on public.medication_refill_requests for all using (public.is_clinical_staff()) with check (public.is_clinical_staff());
