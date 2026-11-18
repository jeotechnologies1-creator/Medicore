begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

-- Super Admin retention access is limited to facilities explicitly assigned
-- on the profile or through an active organization membership. Records Officers
-- retain the existing patient.read facility permission check.
drop policy if exists retention_schedule_records_read on public.retention_schedule;
create policy retention_schedule_records_read on public.retention_schedule
 for select to authenticated using (
  facility_id is not null and (
   (public.has_any_role(array['records_officer']) and public.has_org_permission('patient.read',facility_id,null))
   or (public.has_any_role(array['super_admin']) and exists(
    select 1 from public.profiles actor where actor.auth_user_id=auth.uid() and actor.status::text='active'
     and actor.role::text='super_admin' and (actor.facility_id=retention_schedule.facility_id or exists(
      select 1 from public.staff_organization_memberships membership
      join public.organization_units unit on unit.id=membership.organization_unit_id
      where membership.profile_id=actor.id and membership.status='active' and membership.starts_on<=current_date
       and (membership.ends_on is null or membership.ends_on>=current_date)
       and unit.status='active' and unit.facility_id=retention_schedule.facility_id
     ))
   ))
  )
 );

drop policy if exists legal_holds_records_read on public.legal_holds;
create policy legal_holds_records_read on public.legal_holds
 for select to authenticated using (
  facility_id is not null and (
   (public.has_any_role(array['records_officer']) and public.has_org_permission('patient.read',facility_id,null))
   or (public.has_any_role(array['super_admin']) and exists(
    select 1 from public.profiles actor where actor.auth_user_id=auth.uid() and actor.status::text='active'
     and actor.role::text='super_admin' and (actor.facility_id=legal_holds.facility_id or exists(
      select 1 from public.staff_organization_memberships membership
      join public.organization_units unit on unit.id=membership.organization_unit_id
      where membership.profile_id=actor.id and membership.status='active' and membership.starts_on<=current_date
       and (membership.ends_on is null or membership.ends_on>=current_date)
       and unit.status='active' and unit.facility_id=legal_holds.facility_id
     ))
   ))
  )
 );

drop policy if exists retention_action_records_read on public.retention_action_requests;
create policy retention_action_records_read on public.retention_action_requests
 for select to authenticated using (
  facility_id is not null and (
   (public.has_any_role(array['records_officer']) and (
    public.has_org_permission('patient.read',facility_id,null)
    or (patient_id is not null and public.has_patient_facility_access(patient_id))
   ))
   or (public.has_any_role(array['super_admin']) and exists(
    select 1 from public.profiles actor where actor.auth_user_id=auth.uid() and actor.status::text='active'
     and actor.role::text='super_admin' and (actor.facility_id=retention_action_requests.facility_id or exists(
      select 1 from public.staff_organization_memberships membership
      join public.organization_units unit on unit.id=membership.organization_unit_id
      where membership.profile_id=actor.id and membership.status='active' and membership.starts_on<=current_date
       and (membership.ends_on is null or membership.ends_on>=current_date)
       and unit.status='active' and unit.facility_id=retention_action_requests.facility_id
     ))
   ))
  )
 );

notify pgrst,'reload schema';
commit;
