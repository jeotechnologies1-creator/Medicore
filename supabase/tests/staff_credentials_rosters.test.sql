begin;
select plan(16);
select has_table('public','staff_credentials','credential records are supported');
select has_table('public','credential_signoff_rules','credential sign-off blocking is configurable');
select has_table('public','staff_credential_alerts','expiry alerts are deduplicated and logged');
select has_table('public','staff_leave_requests','leave requests have an approval workflow');
select has_table('public','duty_rosters','duty rosters support departments and wards');
select has_function('public','record_staff_credential',array['uuid','uuid','text','text','date','date','text'],'HR can record staff credentials');
select has_function('public','configure_credential_signoff_rule',array['uuid','text','text','boolean'],'HR can configure optional sign-off rules');
select has_function('public','notify_expiring_staff_credentials',array['uuid','integer'],'expiry alert dispatch is available');
select has_function('public','submit_staff_leave_request',array['uuid','text','date','date','text'],'staff can submit leave requests');
select has_function('public','review_staff_leave_request',array['uuid','text','text'],'HR can review leave requests');
select has_function('public','create_duty_roster',array['uuid','uuid','text','uuid','timestamp with time zone','timestamp with time zone','text','text'],'HR can create duty roster assignments');
select has_trigger('public','consultation_signatures','consultation_credential_signoff','configured expired credentials can block consultation sign-off');
select has_trigger('public','admission_discharge_signatures','discharge_credential_signoff','configured expired credentials can block discharge sign-off');
select ok(not has_table_privilege('authenticated','public.staff_credentials','INSERT'),'authenticated clients cannot bypass credential workflow');
select ok(exists(select 1 from pg_policies where schemaname='public' and tablename='staff_leave_requests' and policyname='staff_leave_hr_read'),'leave records have HR/self-scoped RLS');

insert into public.facilities(id,code,name) values('a5720000-0000-4000-8000-000000000001','TEST-STAFF','TEST Staff Facility');
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('a5720000-0000-4000-8000-000000000010','authenticated','authenticated','TEST-staff-clinician@example.invalid',now(),'{}','{}',now(),now());
update public.profiles set role='doctor',status='active',facility_id='a5720000-0000-4000-8000-000000000001' where auth_user_id='a5720000-0000-4000-8000-000000000010';
insert into public.patients(id,first_name,last_name,home_facility_id) values('a5720000-0000-4000-8000-000000000020','TEST','Staff Patient','a5720000-0000-4000-8000-000000000001');
insert into public.organization_units(id,facility_id,unit_type,code,name) values('a5720000-0000-4000-8000-000000000050','a5720000-0000-4000-8000-000000000001','department','TEST-MEDICAL','Medical');
insert into public.staff_organization_memberships(profile_id,organization_unit_id,assigned_by,justification,is_primary)
select id,'a5720000-0000-4000-8000-000000000050',id,'TEST staff credential signoff fixture',true from public.profiles where auth_user_id='a5720000-0000-4000-8000-000000000010';
insert into public.encounters(id,patient_id,attending_clinician_id,encounter_type,status,reason_for_visit)
select 'a5720000-0000-4000-8000-000000000030','a5720000-0000-4000-8000-000000000020',id,'outpatient','in_progress','TEST staff credential encounter'
from public.profiles where auth_user_id='a5720000-0000-4000-8000-000000000010';
insert into public.consultations(id,patient_id,encounter_id,doctor_id,chief_complaint,assessment,plan,note_state,status)
select 'a5720000-0000-4000-8000-000000000040','a5720000-0000-4000-8000-000000000020','a5720000-0000-4000-8000-000000000030',id,'TEST complaint','TEST assessment','TEST plan','draft','draft'
from public.profiles where auth_user_id='a5720000-0000-4000-8000-000000000010';
insert into public.credential_signoff_rules(facility_id,clinical_role,credential_body,blocks_signoff,configured_by)
select 'a5720000-0000-4000-8000-000000000001','doctor','TEST Clinical License',true,id from public.profiles where auth_user_id='a5720000-0000-4000-8000-000000000010';
insert into public.staff_credentials(facility_id,profile_id,credential_body,credential_number,issued_on,expires_on,recorded_by)
select 'a5720000-0000-4000-8000-000000000001',id,'TEST Clinical License','TEST-EXPIRED-001',current_date-730,current_date-1,id
from public.profiles where auth_user_id='a5720000-0000-4000-8000-000000000010';

set local role authenticated;
select set_config('request.jwt.claim.sub','a5720000-0000-4000-8000-000000000010',true);
select throws_ok($$select public.sign_consultation('a5720000-0000-4000-8000-000000000040')$$,'P0001','Clinical sign-off blocked because a required credential is missing or expired.','server rejects clinical signature when required credential is expired');
reset role;
select * from finish();
rollback;
