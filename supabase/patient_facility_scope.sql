-- Enforce facility boundaries on the patient registry and appointment data.
-- Apply after organization_permissions.sql and patient_appointment_coordination.sql.

begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

insert into public.permission_catalog(permission_key,description,sensitive) values
  ('appointment.manage','Create and manage facility appointments',true)
on conflict(permission_key) do update set description=excluded.description,sensitive=excluded.sensitive;

insert into public.role_permission_grants(role,permission_key,scope) values
  ('doctor','patient.create','facility'),('nurse','patient.create','facility'),
  ('doctor','patient.update','facility'),('nurse','patient.update','facility'),
  ('doctor','appointment.manage','facility'),('nurse','appointment.manage','facility'),
  ('records_officer','appointment.manage','facility')
on conflict do nothing;

create or replace function public.has_patient_facility_access(target_patient_id uuid)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare actor_role text; actor_patient_id uuid; target_facility_id uuid;
begin
  select role::text,patient_id into actor_role,actor_patient_id from public.profiles
  where auth_user_id=auth.uid() and status::text='active' limit 1;
  if actor_role is null then return false; end if;
  if actor_role='super_admin' or (actor_role='patient' and actor_patient_id=target_patient_id) then return true; end if;
  select home_facility_id into target_facility_id from public.patients where id=target_patient_id;
  return target_facility_id is not null and (
    public.has_org_permission('patient.read',target_facility_id,null)
    or public.has_clinical_department_permission(target_patient_id,null,'patient.read',true)
  );
end $$;
revoke all on function public.has_patient_facility_access(uuid) from public,anon;
grant execute on function public.has_patient_facility_access(uuid) to authenticated;

create or replace function public.get_patient_registration_facilities()
returns table(facility_id uuid,facility_name text)
language sql stable security definer set search_path=public as $$
  select f.id,f.name from public.facilities f
  where public.has_org_permission('patient.create',f.id,null)
  order by f.name
$$;
revoke all on function public.get_patient_registration_facilities() from public,anon;
grant execute on function public.get_patient_registration_facilities() to authenticated;

-- Legacy patients without a verified facility remain quarantined: patient
-- self-access and Super Admin access still work, while staff facility/department
-- scope checks deny access until an operator assigns the correct facility.
do $$
declare unassigned_count bigint;
begin
  select count(*) into unassigned_count from public.patients where home_facility_id is null;
  if unassigned_count > 0 then
    raise notice '% patient record(s) have no facility and will remain quarantined until explicitly mapped.',unassigned_count;
  end if;
end $$;

-- Do not infer or rewrite legacy patient locations.
drop policy if exists "facility scoped patient registry reads" on public.patients;
create policy "facility scoped patient registry reads" on public.patients as restrictive for select to authenticated using (
  public.has_patient_facility_access(id)
);
drop policy if exists "facility scoped patient registration" on public.patients;
create policy "facility scoped patient registration" on public.patients as restrictive for insert to authenticated with check (
  home_facility_id is not null and public.has_org_permission('patient.create',home_facility_id,null)
);
drop policy if exists "facility scoped patient updates" on public.patients;
create policy "facility scoped patient updates" on public.patients as restrictive for update to authenticated
using (
  (home_facility_id is null and public.has_any_role(array['super_admin']))
  or (home_facility_id is not null and public.has_org_permission('patient.update',home_facility_id,null))
)
with check (
  home_facility_id is not null and (
    public.has_any_role(array['super_admin'])
    or public.has_org_permission('patient.update',home_facility_id,null)
  )
);
drop policy if exists "retain patient registry rows" on public.patients;
create policy "retain patient registry rows" on public.patients as restrictive for delete to authenticated using (false);

-- Constrain every appointment command independently from its older permissive
-- role policy. Portal users can only submit their own request; staff need the
-- grant and active membership for the appointment's patient facility.
drop policy if exists "facility scoped appointment reads" on public.appointments;
create policy "facility scoped appointment reads" on public.appointments as restrictive for select to authenticated using (
  public.has_patient_facility_access(patient_id)
  or public.has_clinical_department_permission(patient_id,department,'patient.read',true)
);
drop policy if exists "facility scoped appointment inserts" on public.appointments;
create policy "facility scoped appointment inserts" on public.appointments as restrictive for insert to authenticated with check (
  ((status='requested' and doctor_id is null and exists(select 1 from public.profiles p where p.auth_user_id=auth.uid() and p.status::text='active' and p.role::text='patient' and p.patient_id=appointments.patient_id))
  and appointments.doctor_id is null
  ) or (patient_id is not null and exists(select 1 from public.patients p where p.id=appointments.patient_id and p.home_facility_id is not null and public.has_org_permission('appointment.manage',p.home_facility_id,null)))
);
drop policy if exists "facility scoped appointment updates" on public.appointments;
create policy "facility scoped appointment updates" on public.appointments as restrictive for update to authenticated
using (patient_id is not null and exists(select 1 from public.patients p where p.id=appointments.patient_id and p.home_facility_id is not null and public.has_org_permission('appointment.manage',p.home_facility_id,null)))
with check (patient_id is not null and exists(select 1 from public.patients p where p.id=appointments.patient_id and p.home_facility_id is not null and public.has_org_permission('appointment.manage',p.home_facility_id,null)));
drop policy if exists "only admins delete appointments" on public.appointments;
create policy "only admins delete appointments" on public.appointments as restrictive for delete to authenticated using (public.has_any_role(array['super_admin']));

-- A subset of additional patient-linked operational records were not included
-- in the original department RLS list. Require at least facility-level patient
-- read permission for those rows, while their existing policies still decide
-- whether the role may see each workflow.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'patient_messages','medication_refill_requests','patient_record_referrals','family_card_members',
    'patient_next_of_kin','nursing_notes','intake_output_records','pain_assessments','emergency_visits'
  ] loop
    if to_regclass(format('public.%I',table_name)) is null then continue; end if;
    execute format('drop policy if exists %I on public.%I','facility scoped patient linked reads',table_name);
    execute format('create policy %I on public.%I as restrictive for select to authenticated using (public.has_patient_facility_access(patient_id))',
      'facility scoped patient linked reads',table_name);
  end loop;
end $$;

create or replace function public.has_patient_insurance_facility_access(target_patient_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.has_patient_facility_access(target_patient_id)
    or public.has_finance_department_permission(target_patient_id,'insurance.submit')
    or public.has_finance_department_permission(target_patient_id,'insurance.remittance.review')
$$;
revoke all on function public.has_patient_insurance_facility_access(uuid) from public,anon;
grant execute on function public.has_patient_insurance_facility_access(uuid) to authenticated;

drop policy if exists "facility scoped insurance membership reads" on public.insurance_memberships;
create policy "facility scoped insurance membership reads" on public.insurance_memberships as restrictive for select to authenticated using (
  public.has_patient_insurance_facility_access(patient_id)
);
drop policy if exists "facility scoped insurance membership updates" on public.insurance_memberships;
create policy "facility scoped insurance membership updates" on public.insurance_memberships as restrictive for update to authenticated
using (public.has_patient_insurance_facility_access(patient_id)) with check (public.has_patient_insurance_facility_access(patient_id));
drop policy if exists "facility scoped insurance membership inserts" on public.insurance_memberships;
create policy "facility scoped insurance membership inserts" on public.insurance_memberships as restrictive for insert to authenticated with check (
  public.has_patient_insurance_facility_access(patient_id)
);
drop policy if exists "facility scoped eligibility check access" on public.insurance_eligibility_checks;
create policy "facility scoped eligibility check access" on public.insurance_eligibility_checks as restrictive for all to authenticated
using (exists(select 1 from public.insurance_memberships m where m.id=membership_id and public.has_patient_insurance_facility_access(m.patient_id)))
with check (exists(select 1 from public.insurance_memberships m where m.id=membership_id and public.has_patient_insurance_facility_access(m.patient_id)));

drop policy if exists "facility scoped family card reads" on public.family_cards;
create policy "facility scoped family card reads" on public.family_cards as restrictive for select to authenticated using (
  primary_contact_patient_id is not null and public.has_patient_facility_access(primary_contact_patient_id)
);
drop policy if exists "facility scoped family card writes" on public.family_cards;
create policy "facility scoped family card writes" on public.family_cards as restrictive for all to authenticated
using (primary_contact_patient_id is not null and public.has_patient_facility_access(primary_contact_patient_id))
with check (primary_contact_patient_id is not null and public.has_patient_facility_access(primary_contact_patient_id));

commit;
notify pgrst,'reload schema';
