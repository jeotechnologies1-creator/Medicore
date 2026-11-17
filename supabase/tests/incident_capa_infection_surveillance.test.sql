begin;
select plan(27);
select has_table('public','incident_severity_scales','facility severity classification is configurable');
select has_table('public','safety_incidents','confidential incident reports are recorded');
select has_table('public','safety_incident_reporter_identity','reporter identity is stored separately');
select has_table('public','safety_incident_investigations','investigation records are available');
select has_table('public','safety_incident_actions','corrective and preventive actions are tracked');
select has_table('public','safety_incident_closures','governed closure sign-off is immutable');
select has_table('public','infection_surveillance_cases','infection control cases are available');
select has_function('public','report_safety_incident',array['uuid','text','text','text','text','timestamp with time zone','text','uuid'],'incident reporting RPC stores identity separately');
select has_function('public','investigate_safety_incident',array['uuid','text','text'],'safety lead can investigate');
select has_function('public','add_safety_incident_action',array['uuid','text','text','uuid','date'],'CAPA actions have owners and due dates');
select has_function('public','update_safety_incident_action',array['uuid','text'],'CAPA completion and verification workflow exists');
select has_function('public','close_safety_incident',array['uuid','text'],'incident closure requires governed sign-off');
select has_function('public','record_infection_surveillance_case',array['uuid','uuid','uuid','text','text','date','text'],'infection cases are facility scoped');
select has_function('public','get_ward_infection_trends',array['uuid','date','date'],'infection RPC returns aggregate ward trends');
select ok(exists(select 1 from pg_policies where schemaname='public' and tablename='safety_incident_reporter_identity' and policyname='incident_identity_safety_only' and qual like '%safety_officer%' and qual like '%incident.safety.read%'),'reporter identity table is restricted to the designated safety lead role');
select ok(exists(select 1 from pg_policies where schemaname='public' and tablename='incident_severity_scales' and policyname='incident_severity_read' and qual like '%incident.report%'),'incident reporters can read severity choices without incident access');
select ok(exists(select 1 from pg_policies where schemaname='public' and tablename='safety_incident_actions' and policyname='incident_actions_safety_only' and qual like '%owner_profile_id%'),'CAPA owners can read their assigned actions only');
select ok(not has_table_privilege('authenticated','public.safety_incident_reporter_identity','INSERT'),'authenticated users cannot write reporter identity directly');

insert into public.facilities(id,code,name) values('a8740000-0000-4000-8000-000000000001','TEST-INCIDENT','TEST Incident Facility');
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('a8740000-0000-4000-8000-000000000010','authenticated','authenticated','TEST-incident-reporter@example.invalid',now(),'{}','{}',now(),now()),
 ('a8740000-0000-4000-8000-000000000011','authenticated','authenticated','TEST-incident-safety@example.invalid',now(),'{}','{}',now(),now()),
 ('a8740000-0000-4000-8000-000000000012','authenticated','authenticated','TEST-incident-unrelated@example.invalid',now(),'{}','{}',now(),now()),
 ('a8740000-0000-4000-8000-000000000013','authenticated','authenticated','TEST-incident-superadmin@example.invalid',now(),'{}','{}',now(),now());
update public.profiles set role='nurse',status='active',facility_id='a8740000-0000-4000-8000-000000000001' where auth_user_id='a8740000-0000-4000-8000-000000000010';
update public.profiles set role='safety_officer',status='active',facility_id='a8740000-0000-4000-8000-000000000001' where auth_user_id='a8740000-0000-4000-8000-000000000011';
update public.profiles set role='accountant',status='active',facility_id='a8740000-0000-4000-8000-000000000001' where auth_user_id='a8740000-0000-4000-8000-000000000012';
update public.profiles set role='super_admin',status='active',facility_id='a8740000-0000-4000-8000-000000000001' where auth_user_id='a8740000-0000-4000-8000-000000000013';
insert into public.organization_units(id,facility_id,unit_type,code,name) values('a8740000-0000-4000-8000-000000000050','a8740000-0000-4000-8000-000000000001','department','TEST-SAFETY','Safety Test Department');
insert into public.staff_organization_memberships(profile_id,organization_unit_id,assigned_by,justification,is_primary)
select id,'a8740000-0000-4000-8000-000000000050',id,'TEST incident RLS fixture',true from public.profiles where auth_user_id in ('a8740000-0000-4000-8000-000000000010','a8740000-0000-4000-8000-000000000011','a8740000-0000-4000-8000-000000000012');
insert into public.incident_severity_scales(id,facility_id,severity_key,display_label,rank_order,configured_by)
select 'a8740000-0000-4000-8000-000000000060','a8740000-0000-4000-8000-000000000001','test','TEST severity',1,id from public.profiles where auth_user_id='a8740000-0000-4000-8000-000000000011';
insert into public.safety_incidents(id,facility_id,severity_id,incident_type,title,description,occurred_at,location)
values('a8740000-0000-4000-8000-000000000070','a8740000-0000-4000-8000-000000000001','a8740000-0000-4000-8000-000000000060','TEST','TEST confidential incident','TEST confidential incident details',now(),'TEST ward');
insert into public.safety_incidents(id,facility_id,severity_id,incident_type,title,description,occurred_at,location)
values('a8740000-0000-4000-8000-000000000071','a8740000-0000-4000-8000-000000000001','a8740000-0000-4000-8000-000000000060','TEST','TEST another confidential incident','TEST another confidential detail',now(),'TEST ward');
insert into public.safety_incident_reporter_identity(incident_id,reporter_profile_id)
select 'a8740000-0000-4000-8000-000000000070',id from public.profiles where auth_user_id='a8740000-0000-4000-8000-000000000010';
insert into public.safety_incident_reporter_identity(incident_id,reporter_profile_id)
select 'a8740000-0000-4000-8000-000000000071',id from public.profiles where auth_user_id='a8740000-0000-4000-8000-000000000011';
insert into public.safety_incident_actions(id,incident_id,facility_id,action_type,description,owner_profile_id,due_date,created_by)
select 'a8740000-0000-4000-8000-000000000072','a8740000-0000-4000-8000-000000000071','a8740000-0000-4000-8000-000000000001','preventive','TEST assigned action',id,current_date+7,
 (select id from public.profiles where auth_user_id='a8740000-0000-4000-8000-000000000011')
from public.profiles where auth_user_id='a8740000-0000-4000-8000-000000000012';

set local role authenticated;
select set_config('request.jwt.claim.sub','a8740000-0000-4000-8000-000000000010',true);
select is((select count(*)::integer from public.safety_incidents),1,'reporter can read only their own incident through the API');
select is((select count(*)::integer from public.safety_incident_reporter_identity where incident_id='a8740000-0000-4000-8000-000000000070'),0,'reporter cannot read the separated identity mapping');
select set_config('request.jwt.claim.sub','a8740000-0000-4000-8000-000000000012',true);
select is((select count(*)::integer from public.safety_incidents),0,'unrelated accountant cannot read incidents through the API');
select is((select count(*)::integer from public.safety_incident_reporter_identity where incident_id='a8740000-0000-4000-8000-000000000070'),0,'unrelated accountant cannot read reporter identities through the API');
select is((select count(*)::integer from public.safety_incident_actions where id='a8740000-0000-4000-8000-000000000072'),1,'assigned CAPA owner can read their action without incident access');
select set_config('request.jwt.claim.sub','a8740000-0000-4000-8000-000000000011',true);
select is((select count(*)::integer from public.safety_incidents),2,'facility safety lead can read the facility incident queue');
select is((select count(*)::integer from public.safety_incident_reporter_identity),2,'facility safety lead can read reporter identities');
select set_config('request.jwt.claim.sub','a8740000-0000-4000-8000-000000000013',true);
select is((select count(*)::integer from public.safety_incidents),2,'Super Admin can read the restricted incident queue');
select is((select count(*)::integer from public.safety_incident_reporter_identity),0,'Super Admin cannot read reporter identity reserved for the safety lead');
reset role;
select * from finish();
rollback;
