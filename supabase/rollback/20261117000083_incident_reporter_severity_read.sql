begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

-- Restore migration 74's lead-only read policies. Existing reporter access to
-- severity configuration and CAPA owner self-service is removed by this rollback.
drop policy if exists incident_severity_read on public.incident_severity_scales;
create policy incident_severity_read on public.incident_severity_scales
 for select to authenticated using(public.has_org_permission('incident.safety.read',facility_id,null));

drop policy if exists incident_actions_safety_only on public.safety_incident_actions;
create policy incident_actions_safety_only on public.safety_incident_actions
 for select to authenticated using(public.has_org_permission('incident.safety.read',facility_id,null));

notify pgrst,'reload schema';
commit;
