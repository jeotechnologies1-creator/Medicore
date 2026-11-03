begin;
select plan(9);

insert into public.facilities(code,name) values
 ('HIM-A','Synthetic HIM Facility A'),('HIM-B','Synthetic HIM Facility B');
insert into public.organization_units(facility_id,unit_type,code,name)
select id,'department','HIM-RECORDS','HIM Records' from public.facilities where code='HIM-A';
insert into public.patients(id,first_name,last_name,home_facility_id) values
 ('21000000-0000-4000-8000-000000000001','Synthetic','HIM Patient',(select id from public.facilities where code='HIM-A')),
 ('21000000-0000-4000-8000-000000000002','Synthetic','Out of Scope',(select id from public.facilities where code='HIM-B'));
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('11000000-0000-4000-8000-000000000001','authenticated','authenticated','him-records@example.test',now(),' {"provider":"email","providers":["email"]}','{}',now(),now());
update public.profiles set role='records_officer',facility_id=(select id from public.facilities where code='HIM-A') where email='him-records@example.test';
insert into public.staff_organization_memberships(profile_id,organization_unit_id,assigned_by,justification)
select p.id,u.id,p.id,'Synthetic HIM migration test' from public.profiles p cross join public.organization_units u
where p.email='him-records@example.test' and u.code='HIM-RECORDS';

set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
select ok(public.has_org_permission('records.file.manage',(select id from public.facilities where code='HIM-A'),null),'HIM facility membership grants scoped file-management access');
select set_config('test.him_movement_id',public.request_medical_record_file('21000000-0000-4000-8000-000000000001','HIM','Outpatient','2099-01-01T12:00:00Z','Synthetic Receiving Officer')::text,true);
select is((select status from public.medical_record_files where patient_id='21000000-0000-4000-8000-000000000001'),'requested','request creates the existing patient file index and marks it requested');
select public.transition_medical_record_movement(current_setting('test.him_movement_id')::uuid,'release',null);
select is((select status from public.medical_record_movements where id=current_setting('test.him_movement_id')::uuid),'in_circulation','release records the active file movement');
select is((select count(*)::integer from public.medical_record_movement_events where movement_id=current_setting('test.him_movement_id')::uuid),2,'request and release each append an immutable movement event');
select public.transition_medical_record_movement(current_setting('test.him_movement_id')::uuid,'return',null);
select is((select status from public.medical_record_movements where id=current_setting('test.him_movement_id')::uuid),'returned','return closes the movement');
select is((select status from public.medical_record_files where patient_id='21000000-0000-4000-8000-000000000001'),'available','return makes the file available again');
select throws_ok($$update public.medical_record_files set status='missing' where patient_id='21000000-0000-4000-8000-000000000001'$$,'42501',null,'authenticated clients cannot bypass the movement RPC');
select throws_ok($$select public.request_medical_record_file('21000000-0000-4000-8000-000000000002','HIM','Ward',null,'Synthetic Receiving Officer')$$,'P0001','HIM file management permission required for the patient facility','HIM cannot request a file from another facility');
select is((public.get_him_dashboard_summary()->>'files_total')::integer,1,'HIM aggregate includes only the authorized facility');
reset role;
select * from finish();
rollback;
