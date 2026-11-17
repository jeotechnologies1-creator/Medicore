begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

-- Reporting staff need the configured severity keys to submit a valid report.
-- This exposes only the facility's severity vocabulary, never incident rows or
-- reporter identities. Incident data remains under the restricted policies in
-- migration 74.
drop policy if exists incident_severity_read on public.incident_severity_scales;
create policy incident_severity_read on public.incident_severity_scales
 for select to authenticated using (
  public.has_org_permission('incident.safety.read',facility_id,null)
  or public.has_org_permission('incident.report',facility_id,null)
 );

-- CAPA owners need to see and progress only the actions assigned to their own
-- profile. This does not grant access to the incident report or its reporter.
drop policy if exists incident_actions_safety_only on public.safety_incident_actions;
create policy incident_actions_safety_only on public.safety_incident_actions
 for select to authenticated using (
  public.has_org_permission('incident.safety.read',facility_id,null)
  or owner_profile_id=(select id from public.profiles where auth_user_id=auth.uid() and status::text='active')
 );

notify pgrst,'reload schema';
commit;
