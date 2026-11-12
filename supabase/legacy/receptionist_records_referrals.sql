-- Run after role_authorization.sql.
-- Reception can send an administrative referral; the Records team can review it.
create table if not exists public.patient_record_referrals (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  referred_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  destination text not null default 'records' check (destination = 'records'),
  reason text not null check (length(trim(reason)) > 0),
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'completed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index if not exists patient_record_referrals_status_created_idx
  on public.patient_record_referrals(status, created_at desc);

-- Reception can view patient overviews and manage appointment scheduling, but cannot
-- register/edit patient records or access billing records.
drop policy if exists "registration manage patients" on public.patients;
create policy "registration manage patients" on public.patients for insert
  with check (public.has_any_role(array['super_admin', 'nurse', 'doctor']));
drop policy if exists "clinical update patients" on public.patients;
create policy "clinical update patients" on public.patients for update
  using (public.has_any_role(array['super_admin', 'nurse', 'doctor']))
  with check (public.has_any_role(array['super_admin', 'nurse', 'doctor']));
drop policy if exists "finance read billing" on public.billing;
create policy "finance read billing" on public.billing for select
  using (public.has_any_role(array['super_admin', 'accountant']) or public.can_access_patient(patient_id));
drop policy if exists "finance manage billing" on public.billing;
create policy "finance manage billing" on public.billing for all
  using (public.has_any_role(array['super_admin', 'accountant']))
  with check (public.has_any_role(array['super_admin', 'accountant']));
drop policy if exists "authorized read insurance" on public.insurance_claims;
create policy "authorized read insurance" on public.insurance_claims for select
  using (public.has_any_role(array['super_admin', 'accountant']) or public.can_access_patient(patient_id));

alter table public.patient_record_referrals enable row level security;
revoke all on public.patient_record_referrals from anon;
grant select, insert, update on public.patient_record_referrals to authenticated;

drop policy if exists "reception sends records referrals" on public.patient_record_referrals;
drop policy if exists "records team reads referrals" on public.patient_record_referrals;
drop policy if exists "records team updates referrals" on public.patient_record_referrals;
create policy "reception sends records referrals" on public.patient_record_referrals for insert
  with check (
    public.has_any_role(array['super_admin', 'receptionist'])
    and destination = 'records'
    and referred_by_profile_id = (select p.id from public.profiles p where p.auth_user_id = auth.uid() and p.status::text = 'active' limit 1)
  );
create policy "records team reads referrals" on public.patient_record_referrals for select
  using (public.has_any_role(array['super_admin', 'records_officer']));
create policy "records team updates referrals" on public.patient_record_referrals for update
  using (public.has_any_role(array['super_admin', 'records_officer']))
  with check (public.has_any_role(array['super_admin', 'records_officer']));

drop trigger if exists audit_patient_record_referrals on public.patient_record_referrals;
create trigger audit_patient_record_referrals after insert or update or delete on public.patient_record_referrals
  for each row execute function public.audit_row_change();
