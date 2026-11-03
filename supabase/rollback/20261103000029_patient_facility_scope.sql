-- Prepare before rollback: pause patient registration/scheduling, export the
-- changed policies and permission grants, and rehearse this script in staging.
-- Removing these restrictive policies restores the prior broader role policies.
begin;
set local lock_timeout='2s';
drop policy if exists "facility scoped patient registry reads" on public.patients;
drop policy if exists "facility scoped patient registration" on public.patients;
drop policy if exists "facility scoped patient updates" on public.patients;
drop policy if exists "retain patient registry rows" on public.patients;
drop policy if exists "facility scoped appointment reads" on public.appointments;
drop policy if exists "facility scoped appointment inserts" on public.appointments;
drop policy if exists "facility scoped appointment updates" on public.appointments;
drop policy if exists "only admins delete appointments" on public.appointments;
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
delete from public.role_permission_grants where (role,permission_key,scope) in (
  ('doctor','patient.create','facility'),('nurse','patient.create','facility'),
  ('doctor','patient.update','facility'),('nurse','patient.update','facility'),
  ('doctor','appointment.manage','facility'),('nurse','appointment.manage','facility'),
  ('records_officer','appointment.manage','facility')
);
commit;
notify pgrst,'reload schema';
