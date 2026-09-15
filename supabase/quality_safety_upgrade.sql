-- Run after production_hardening.sql. Review in a staging project before use.
-- Adds the persistence needed for results follow-up, medication reconciliation,
-- coded clinical data, and lot-level medication inventory.

alter table public.lab_orders
  add column if not exists loinc_code text,
  add column if not exists result_status text not null default 'pending'
    check (result_status in ('pending', 'preliminary', 'final', 'corrected', 'cancelled')),
  add column if not exists responsible_clinician_id uuid references public.profiles(id) on delete set null;

alter table public.radiology_orders
  add column if not exists procedure_code text,
  add column if not exists procedure_code_system text,
  add column if not exists report_status text not null default 'pending'
    check (report_status in ('pending', 'preliminary', 'final', 'amended', 'cancelled')),
  add column if not exists responsible_clinician_id uuid references public.profiles(id) on delete set null;

alter table public.prescriptions
  add column if not exists medication_code text,
  add column if not exists medication_code_system text;

alter table public.medication_orders
  add column if not exists medication_code text,
  add column if not exists medication_code_system text;

alter table public.patient_conditions
  add column if not exists diagnosis_code text,
  add column if not exists diagnosis_code_system text;

alter table public.pharmacy_inventory
  add column if not exists medication_code text,
  add column if not exists medication_code_system text,
  add column if not exists barcode text,
  add column if not exists dosage_form text,
  add column if not exists strength text;

create unique index if not exists pharmacy_inventory_barcode_unique
  on public.pharmacy_inventory (barcode) where barcode is not null;
create index if not exists pharmacy_inventory_medication_lot_idx
  on public.pharmacy_inventory (medication_code, batch_number, expiry_date);

create table if not exists public.result_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  result_type text not null check (result_type in ('laboratory', 'radiology')),
  result_id uuid not null,
  patient_id uuid not null references public.patients(id) on delete cascade,
  responsible_clinician_id uuid references public.profiles(id) on delete set null,
  status text not null default 'unacknowledged'
    check (status in ('unacknowledged', 'acknowledged', 'escalated', 'resolved')),
  due_at timestamptz,
  acknowledged_at timestamptz,
  acknowledged_by uuid references public.profiles(id) on delete set null,
  escalation_reason text,
  escalation_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (result_type, result_id),
  check ((status <> 'acknowledged') or (acknowledged_at is not null and acknowledged_by is not null))
);

create index if not exists result_acknowledgements_open_idx
  on public.result_acknowledgements (responsible_clinician_id, due_at)
  where status in ('unacknowledged', 'escalated');

create table if not exists public.medication_reconciliations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  encounter_id uuid references public.encounters(id) on delete set null,
  transition_type text not null check (transition_type in ('admission', 'transfer', 'discharge', 'referral', 'outpatient')),
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'not_required')),
  reconciled_by uuid references public.profiles(id) on delete set null,
  reconciled_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status <> 'completed') or (reconciled_by is not null and reconciled_at is not null))
);

create index if not exists medication_reconciliations_patient_idx
  on public.medication_reconciliations (patient_id, transition_type, status);

alter table public.result_acknowledgements enable row level security;
alter table public.medication_reconciliations enable row level security;

drop policy if exists "clinical staff manage result acknowledgements" on public.result_acknowledgements;
drop policy if exists "clinical staff manage medication reconciliations" on public.medication_reconciliations;
create policy "clinical staff manage result acknowledgements" on public.result_acknowledgements
  for all using (public.is_clinical_staff()) with check (public.is_clinical_staff());
create policy "clinical staff manage medication reconciliations" on public.medication_reconciliations
  for all using (public.is_clinical_staff()) with check (public.is_clinical_staff());

create or replace function public.queue_result_acknowledgement() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  result_kind text := tg_argv[0];
  is_final boolean;
begin
  is_final := case
    when result_kind = 'laboratory' then new.result_status in ('final', 'corrected') or new.status = 'completed'
    else new.report_status in ('final', 'amended') or new.status = 'reported'
  end;
  if is_final then
    insert into public.result_acknowledgements (result_type, result_id, patient_id, responsible_clinician_id, due_at)
    values (result_kind, new.id, new.patient_id, coalesce(new.responsible_clinician_id, new.doctor_id), now() + interval '24 hours')
    on conflict (result_type, result_id) do update
      set responsible_clinician_id = coalesce(excluded.responsible_clinician_id, result_acknowledgements.responsible_clinician_id),
          due_at = excluded.due_at,
          updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists queue_lab_result_acknowledgement on public.lab_orders;
create trigger queue_lab_result_acknowledgement
  after insert or update of result_status, responsible_clinician_id on public.lab_orders
  for each row execute function public.queue_result_acknowledgement('laboratory');

drop trigger if exists queue_radiology_result_acknowledgement on public.radiology_orders;
create trigger queue_radiology_result_acknowledgement
  after insert or update of report_status, responsible_clinician_id on public.radiology_orders
  for each row execute function public.queue_result_acknowledgement('radiology');

-- A scheduled job should escalate rows past due_at. The job's service account
-- must call this function; do not expose it to browser users.
create or replace function public.escalate_overdue_results() returns integer
language plpgsql security definer set search_path = public as $$
declare changed integer;
begin
  update public.result_acknowledgements
  set status = 'escalated', escalation_at = now(), escalation_reason = 'Acknowledgement overdue', updated_at = now()
  where status = 'unacknowledged' and due_at < now();
  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke all on function public.escalate_overdue_results() from public;
