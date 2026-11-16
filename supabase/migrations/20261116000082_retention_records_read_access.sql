begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

-- Retention records are readable through facility scoped policies; all writes
-- continue through the audited retention workflow RPCs.
grant select on public.retention_schedule,public.legal_holds,public.retention_action_requests to authenticated;

drop policy if exists retention_schedule_records_read on public.retention_schedule;
create policy retention_schedule_records_read on public.retention_schedule
 for select to authenticated using (
  public.has_any_role(array['super_admin','records_officer'])
  and ((facility_id is null and public.has_any_role(array['super_admin']))
   or (facility_id is not null and public.has_org_permission('patient.read',facility_id,null)))
 );

drop policy if exists legal_holds_records_read on public.legal_holds;
create policy legal_holds_records_read on public.legal_holds
 for select to authenticated using (
  public.has_any_role(array['super_admin','records_officer'])
  and ((facility_id is null and public.has_any_role(array['super_admin']))
   or (facility_id is not null and public.has_org_permission('patient.read',facility_id,null)))
 );

drop policy if exists retention_action_records_read on public.retention_action_requests;
create policy retention_action_records_read on public.retention_action_requests
 for select to authenticated using (
  public.has_any_role(array['super_admin','records_officer'])
  and (public.has_any_role(array['super_admin'])
   or public.has_org_permission('patient.read',facility_id,null)
   or (patient_id is not null and public.has_patient_facility_access(patient_id)))
 );

notify pgrst,'reload schema';
commit;
