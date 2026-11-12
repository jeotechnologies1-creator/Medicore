-- Route patient bank-transfer instructions by invoice department or service.
-- Run on existing installations; new installations also receive these columns from schema.sql.
alter table public.billing add column if not exists department text;
alter table public.billing add column if not exists service text;

-- Patients may see payment instructions without gaining read access to all system settings.
create or replace function public.get_portal_payment_accounts() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(setting_value -> 'bankAccounts', '[]'::jsonb)
  from public.system_settings
  where setting_key = 'hospital_core_settings'
    and exists (
      select 1 from public.profiles p
      where p.auth_user_id = auth.uid() and p.status::text = 'active'
        and (p.role::text <> 'patient' or p.patient_id is not null)
    )
  limit 1;
$$;
revoke all on function public.get_portal_payment_accounts() from public;
grant execute on function public.get_portal_payment_accounts() to authenticated;
