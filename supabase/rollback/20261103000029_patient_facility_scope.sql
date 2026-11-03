-- Prepare before rollback: pause patient registration/scheduling, export the
-- changed policies and permission grants, and rehearse this script in staging.
-- Removing these restrictive policies restores the prior broader role policies.
begin;
set local lock_timeout='2s';
drop policy if exists "facility scoped patient registry reads" on public.patients;
drop policy if exists "facility scoped patient registration" on public.patients;
drop policy if exists "facility scoped patient updates" on public.patients;
drop policy if exists "retain patient registry rows" on public.patients;
do $$ declare table_name text; begin
  foreach table_name in array array['patient_next_of_kin','nursing_notes','intake_output_records','pain_assessments','emergency_visits'] loop
    if to_regclass(format('public.%I',table_name)) is null then continue; end if;
    execute format('drop policy if exists %I on public.%I','facility scoped clinical insert',table_name);
    execute format('drop policy if exists %I on public.%I','facility scoped clinical update',table_name);
    execute format('drop policy if exists %I on public.%I','retain patient clinical operations',table_name);
  end loop;
end $$;
drop policy if exists "facility scoped patient message writes" on public.patient_messages;
drop policy if exists "facility scoped patient message updates" on public.patient_messages;
drop policy if exists "retain patient messages" on public.patient_messages;
drop policy if exists "facility scoped refill inserts" on public.medication_refill_requests;
drop policy if exists "facility scoped refill updates" on public.medication_refill_requests;
drop policy if exists "retain refill requests" on public.medication_refill_requests;
drop policy if exists "facility scoped referral inserts" on public.patient_record_referrals;
drop policy if exists "facility scoped referral updates" on public.patient_record_referrals;
drop policy if exists "retain patient referrals" on public.patient_record_referrals;
drop policy if exists "facility scoped family card member writes" on public.family_card_members;
drop policy if exists "retain family card member links" on public.family_card_members;
drop policy if exists "facility scoped appointment reads" on public.appointments;
drop policy if exists "facility scoped appointment inserts" on public.appointments;
drop policy if exists "facility scoped appointment updates" on public.appointments;
drop policy if exists "only admins delete appointments" on public.appointments;
drop trigger if exists guard_appointment_facility_scope on public.appointments;
drop function if exists public.guard_appointment_facility_scope();
drop policy if exists "facility scoped insurance membership reads" on public.insurance_memberships;
drop policy if exists "facility scoped insurance membership updates" on public.insurance_memberships;
drop policy if exists "facility scoped insurance membership inserts" on public.insurance_memberships;
drop policy if exists "facility scoped eligibility check access" on public.insurance_eligibility_checks;
drop policy if exists "facility scoped family card reads" on public.family_cards;
drop policy if exists "facility scoped family card writes" on public.family_cards;
do $$ declare table_name text; begin
  foreach table_name in array array['patient_messages','medication_refill_requests','patient_record_referrals','family_card_members','patient_next_of_kin','nursing_notes','intake_output_records','pain_assessments','emergency_visits'] loop
    if to_regclass(format('public.%I',table_name)) is not null then execute format('drop policy if exists %I on public.%I','facility scoped patient linked reads',table_name); end if;
  end loop;
end $$;
drop function if exists public.get_patient_registration_facilities();
drop function if exists public.has_patient_insurance_facility_access(uuid);
drop function if exists public.has_patient_facility_access(uuid);
create or replace function public.get_appointment_providers()
returns table(id uuid,full_name text,department text)
language sql stable security definer set search_path=public as $$
  select p.id,p.full_name,p.department from public.profiles p
  where p.role::text='doctor' and p.status::text='active'
    and public.has_any_role(array['super_admin','records_officer'])
  order by p.full_name
$$;
revoke all on function public.get_appointment_providers() from public,anon;
grant execute on function public.get_appointment_providers() to authenticated;
do $$ begin
  if to_regclass('public.onemed_migration_20261103000029_grants') is not null then
    delete from public.role_permission_grants grant_row
    using public.onemed_migration_20261103000029_grants owned
    where grant_row.role=owned.role and grant_row.permission_key=owned.permission_key and grant_row.scope=owned.scope;
    drop table public.onemed_migration_20261103000029_grants;
  end if;
end $$;
commit;
notify pgrst,'reload schema';
