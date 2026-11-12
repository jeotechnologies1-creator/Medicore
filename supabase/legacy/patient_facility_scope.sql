-- Enforce facility boundaries on the patient registry and appointment data.
-- Apply after organization_permissions.sql and patient_appointment_coordination.sql.

begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

insert into public.permission_catalog(permission_key,description,sensitive) values
  ('appointment.manage','Create and manage facility appointments',true)
on conflict(permission_key) do nothing;

create table if not exists public.onemed_migration_20261103000029_grants (
  role text not null, permission_key text not null, scope text not null,
  primary key(role,permission_key,scope)
);
alter table public.onemed_migration_20261103000029_grants enable row level security;
revoke all on public.onemed_migration_20261103000029_grants from public,anon,authenticated;
with inserted_grants as (
  insert into public.role_permission_grants(role,permission_key,scope) values
    ('doctor','patient.create','facility'),('nurse','patient.create','facility'),
    ('doctor','patient.update','facility'),('nurse','patient.update','facility'),
    ('doctor','appointment.manage','facility'),('nurse','appointment.manage','facility'),
    ('records_officer','appointment.manage','facility')
  on conflict do nothing
  returning role,permission_key,scope
)
insert into public.onemed_migration_20261103000029_grants(role,permission_key,scope)
select role,permission_key,scope from inserted_grants on conflict do nothing;

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

-- The original role policies on these tables authorized writers by role only.
-- Intersect every clinical write with active department membership and preserve
-- clinical records through amendments rather than hard deletion.
do $$
declare table_name text; policy_name text; predicate text;
begin
  foreach table_name in array array['patient_next_of_kin','nursing_notes','intake_output_records','pain_assessments','emergency_visits'] loop
    if to_regclass(format('public.%I',table_name)) is null then continue; end if;
    predicate := 'public.has_clinical_department_permission(patient_id,null,''patient.read|observation.record'',false)';
    policy_name := 'facility scoped clinical insert';
    execute format('drop policy if exists %I on public.%I',policy_name,table_name);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (%s)',policy_name,table_name,predicate);
    policy_name := 'facility scoped clinical update';
    execute format('drop policy if exists %I on public.%I',policy_name,table_name);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using (%s) with check (%s)',policy_name,table_name,predicate,predicate);
    policy_name := 'retain patient clinical operations';
    execute format('drop policy if exists %I on public.%I',policy_name,table_name);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using (false)',policy_name,table_name);
  end loop;
end $$;

-- Enforce facility scope on portal message/refill writes and referral casework.
drop policy if exists "facility scoped patient message writes" on public.patient_messages;
create policy "facility scoped patient message writes" on public.patient_messages as restrictive for insert to authenticated with check (
  public.has_patient_facility_access(patient_id)
);
drop policy if exists "facility scoped patient message updates" on public.patient_messages;
create policy "facility scoped patient message updates" on public.patient_messages as restrictive for update to authenticated
using (public.has_patient_facility_access(patient_id)) with check (public.has_patient_facility_access(patient_id));
drop policy if exists "retain patient messages" on public.patient_messages;
create policy "retain patient messages" on public.patient_messages as restrictive for delete to authenticated using (false);

drop policy if exists "facility scoped refill inserts" on public.medication_refill_requests;
create policy "facility scoped refill inserts" on public.medication_refill_requests as restrictive for insert to authenticated with check (
  status='pending' and public.has_patient_facility_access(patient_id)
);
drop policy if exists "facility scoped refill updates" on public.medication_refill_requests;
create policy "facility scoped refill updates" on public.medication_refill_requests as restrictive for update to authenticated
using (public.has_patient_facility_access(patient_id)) with check (public.has_patient_facility_access(patient_id));
drop policy if exists "retain refill requests" on public.medication_refill_requests;
create policy "retain refill requests" on public.medication_refill_requests as restrictive for delete to authenticated using (false);

drop policy if exists "facility scoped referral inserts" on public.patient_record_referrals;
create policy "facility scoped referral inserts" on public.patient_record_referrals as restrictive for insert to authenticated with check (
  public.has_patient_facility_access(patient_id)
);
drop policy if exists "facility scoped referral updates" on public.patient_record_referrals;
create policy "facility scoped referral updates" on public.patient_record_referrals as restrictive for update to authenticated
using (public.has_patient_facility_access(patient_id)) with check (public.has_patient_facility_access(patient_id));
drop policy if exists "retain patient referrals" on public.patient_record_referrals;
create policy "retain patient referrals" on public.patient_record_referrals as restrictive for delete to authenticated using (false);

-- A family-card member must be in the same facility as the card's primary
-- patient, and the actor must have access to both patient records.
drop policy if exists "facility scoped family card member writes" on public.family_card_members;
create policy "facility scoped family card member writes" on public.family_card_members as restrictive for all to authenticated
using (exists(
  select 1 from public.family_cards c join public.patients primary_patient on primary_patient.id=c.primary_contact_patient_id
  join public.patients member_patient on member_patient.id=family_card_members.patient_id
  where c.id=family_card_members.family_card_id
    and primary_patient.home_facility_id=member_patient.home_facility_id
    and public.has_patient_facility_access(primary_patient.id)
    and public.has_patient_facility_access(member_patient.id)
))
with check (exists(
  select 1 from public.family_cards c join public.patients primary_patient on primary_patient.id=c.primary_contact_patient_id
  join public.patients member_patient on member_patient.id=family_card_members.patient_id
  where c.id=family_card_members.family_card_id
    and primary_patient.home_facility_id=member_patient.home_facility_id
    and public.has_patient_facility_access(primary_patient.id)
    and public.has_patient_facility_access(member_patient.id)
));
drop policy if exists "retain family card member links" on public.family_card_members;
create policy "retain family card member links" on public.family_card_members as restrictive for delete to authenticated using (false);
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

-- Security-definer booking RPCs bypass row policies. Validate their actor,
-- patient facility, and assigned doctor's active facility membership at write time.
create or replace function public.guard_appointment_facility_scope()
returns trigger language plpgsql security definer set search_path=public as $$
declare patient_facility uuid; actor_patient_id uuid;
begin
  if auth.role()='service_role' and auth.uid() is null then return new; end if;
  if new.patient_id is null then raise exception 'Appointment must reference a patient.'; end if;
  select home_facility_id into patient_facility from public.patients where id=new.patient_id;
  if patient_facility is null then
    if not public.has_any_role(array['super_admin']) then raise exception 'Assign the patient to a verified facility before scheduling.'; end if;
  elsif public.has_any_role(array['patient']) then
    select patient_id into actor_patient_id from public.profiles where auth_user_id=auth.uid() and status::text='active' limit 1;
    if tg_op <> 'INSERT' or new.status <> 'requested' or new.doctor_id is not null or actor_patient_id is distinct from new.patient_id then
      raise exception 'Patients may only submit their own unassigned appointment request.';
    end if;
  elsif not public.has_any_role(array['super_admin'])
    and not public.has_org_permission('appointment.manage',patient_facility,null) then
    raise exception 'Appointment management permission for the patient facility is required.';
  end if;

  if new.status='scheduled' then
    if new.doctor_id is null or not exists(
      select 1 from public.profiles d
      where d.id=new.doctor_id and d.role::text='doctor' and d.status::text='active'
        and exists(
          select 1 from public.staff_organization_memberships m
          join public.organization_units u on u.id=m.organization_unit_id and u.status='active'
          where m.profile_id=d.id and m.status='active' and m.starts_on<=current_date
            and (m.ends_on is null or m.ends_on>=current_date) and u.facility_id=patient_facility
        )
    ) then raise exception 'Select an active doctor assigned to the patient facility.'; end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_appointment_facility_scope() from public,anon,authenticated;
drop trigger if exists guard_appointment_facility_scope on public.appointments;
create trigger guard_appointment_facility_scope
before insert or update of patient_id,doctor_id,appointment_date,appointment_time,status
on public.appointments for each row execute function public.guard_appointment_facility_scope();

create or replace function public.get_appointment_providers()
returns table(id uuid,full_name text,department text)
language sql stable security definer set search_path=public as $$
  select d.id,d.full_name,d.department from public.profiles d
  where d.role::text='doctor' and d.status::text='active'
    and public.has_any_role(array['super_admin','records_officer'])
    and (public.has_any_role(array['super_admin']) or exists(
      select 1 from public.facilities f
      where public.has_org_permission('appointment.manage',f.id,null)
        and exists(
          select 1 from public.staff_organization_memberships m
          join public.organization_units u on u.id=m.organization_unit_id and u.status='active'
          where m.profile_id=d.id and m.status='active' and m.starts_on<=current_date
            and (m.ends_on is null or m.ends_on>=current_date) and u.facility_id=f.id
        )
    )) order by d.full_name
$$;
revoke all on function public.get_appointment_providers() from public,anon;
grant execute on function public.get_appointment_providers() to authenticated;

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
