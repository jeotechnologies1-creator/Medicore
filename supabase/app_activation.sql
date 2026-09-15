-- MediCore application-contract migration
-- Run AFTER every migration listed in README.md, including quality_safety_upgrade.sql.
-- It aligns the database policies/functions with the front-end workflows.

-- Inactive accounts must not pass clinical authorization checks.
create or replace function public.is_clinical_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select role in ('super_admin','doctor','nurse','pharmacist','laboratory_scientist','radiographer')
      and status = 'active'
    from public.profiles
    where auth_user_id = auth.uid()
    limit 1
  ), false);
$$;

-- The appointment, clinical, and office forms need a staff directory. Patients
-- retain access to only their own profile.
drop policy if exists "staff read directory" on public.profiles;
create policy "staff read directory" on public.profiles for select using (public.is_staff());

-- Notifications are private to their intended profile. Staff may create a
-- notification for a recipient; only administrators may remove one.
drop policy if exists "staff manage records" on public.notifications;
drop policy if exists "users read own notifications" on public.notifications;
drop policy if exists "users update own notifications" on public.notifications;
drop policy if exists "staff create notifications" on public.notifications;
drop policy if exists "admins delete notifications" on public.notifications;
create policy "users read own notifications" on public.notifications for select using (
  user_id = (select id from public.profiles where auth_user_id = auth.uid() limit 1) or public.is_admin()
);
create policy "users update own notifications" on public.notifications for update using (
  user_id = (select id from public.profiles where auth_user_id = auth.uid() limit 1) or public.is_admin()
) with check (
  user_id = (select id from public.profiles where auth_user_id = auth.uid() limit 1) or public.is_admin()
);
create policy "staff create notifications" on public.notifications for insert with check (public.is_staff());
create policy "admins delete notifications" on public.notifications for delete using (public.is_admin());

-- Keep acknowledgement/reconciliation timestamps accurate for direct UI updates.
drop trigger if exists result_acknowledgements_set_updated_at on public.result_acknowledgements;
create trigger result_acknowledgements_set_updated_at
  before update on public.result_acknowledgements
  for each row execute function public.set_updated_at();

drop trigger if exists medication_reconciliations_set_updated_at on public.medication_reconciliations;
create trigger medication_reconciliations_set_updated_at
  before update on public.medication_reconciliations
  for each row execute function public.set_updated_at();

-- Indexes for the query paths used by the browser app and its role-scoped RLS.
create index if not exists appointments_patient_date_idx on public.appointments (patient_id, appointment_date);
create index if not exists lab_orders_patient_ordered_idx on public.lab_orders (patient_id, ordered_date desc);
create index if not exists radiology_orders_patient_ordered_idx on public.radiology_orders (patient_id, ordered_date desc);
create index if not exists notifications_user_read_idx on public.notifications (user_id, read, created_at desc);
create index if not exists profiles_auth_user_idx on public.profiles (auth_user_id);
