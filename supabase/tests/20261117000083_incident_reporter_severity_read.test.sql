begin;
select plan(3);

select ok(exists(
 select 1 from pg_policies where schemaname='public' and tablename='incident_severity_scales'
  and policyname='incident_severity_read' and qual like '%incident.report%' and qual like '%incident.safety.read%'
),'reporters can read severity vocabulary while safety leads retain access');
select ok(exists(
 select 1 from pg_policies where schemaname='public' and tablename='safety_incident_actions'
  and policyname='incident_actions_safety_only' and qual like '%owner_profile_id%' and qual like '%incident.safety.read%'
),'CAPA self-service is limited to assigned owner or safety lead');
select ok(exists(
 select 1 from pg_policies where schemaname='public' and tablename='safety_incidents'
  and policyname='safety_incidents_restricted_read' and qual like '%incident.safety.read%' and qual like '%is_safety_incident_reporter%'
),'incident report access remains limited to safety leads and reporters');

select * from finish();
rollback;
