begin;
select plan(9);

select has_policy('public','disclosure_register','disclosure_register_records_read','Records Officer disclosure reads are governed by the dedicated facility policy');
select has_function('public','list_data_subject_request_queue',array[]::text[],'the data-subject request queue is exposed only through its scoped RPC');

insert into public.facilities(id,code,name) values
 ('81000000-0000-4000-8000-000000000001','DISC-A','Synthetic Disclosure Facility A'),
 ('81000000-0000-4000-8000-000000000002','DISC-B','Synthetic Disclosure Facility B');
insert into public.organization_units(id,facility_id,unit_type,code,name) values
 ('81000000-0000-4000-8000-000000000003','81000000-0000-4000-8000-000000000001','department','DISC-A-RECORDS','Synthetic Records A'),
 ('81000000-0000-4000-8000-000000000004','81000000-0000-4000-8000-000000000002','department','DISC-B-RECORDS','Synthetic Records B');
insert into public.patients(id,first_name,last_name,home_facility_id) values
 ('81000000-0000-4000-8000-000000000005','Synthetic','Disclosure A','81000000-0000-4000-8000-000000000001'),
 ('81000000-0000-4000-8000-000000000006','Synthetic','Disclosure B','81000000-0000-4000-8000-000000000002');
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('81000000-0000-4000-8000-000000000010','authenticated','authenticated','disclosure-ro-a@example.test',now(),'{}','{}',now(),now()),
 ('81000000-0000-4000-8000-000000000011','authenticated','authenticated','disclosure-ro-b@example.test',now(),'{}','{}',now(),now()),
 ('81000000-0000-4000-8000-000000000012','authenticated','authenticated','disclosure-reception@example.test',now(),'{}','{}',now(),now());
update public.profiles set role='records_officer',status='active',facility_id='81000000-0000-4000-8000-000000000001' where email='disclosure-ro-a@example.test';
update public.profiles set role='records_officer',status='active',facility_id='81000000-0000-4000-8000-000000000002' where email='disclosure-ro-b@example.test';
update public.profiles set role='receptionist',status='active',facility_id='81000000-0000-4000-8000-000000000001' where email='disclosure-reception@example.test';
insert into public.staff_organization_memberships(profile_id,organization_unit_id,assigned_by,justification)
select p.id,u.id,p.id,'Synthetic facility-scope disclosure test' from public.profiles p join public.organization_units u on
 (p.email='disclosure-ro-a@example.test' and u.code='DISC-A-RECORDS') or
 (p.email='disclosure-ro-b@example.test' and u.code='DISC-B-RECORDS') or
 (p.email='disclosure-reception@example.test' and u.code='DISC-A-RECORDS');
insert into public.disclosure_register(id,patient_id,disclosed_to,purpose,data_categories,authority,disclosed_by)
select '81000000-0000-4000-8000-000000000020','81000000-0000-4000-8000-000000000005','Synthetic requester A','Synthetic request','{demographics}','Synthetic authority',id from public.profiles where email='disclosure-ro-a@example.test';
insert into public.disclosure_register(id,patient_id,disclosed_to,purpose,data_categories,authority,disclosed_by)
select '81000000-0000-4000-8000-000000000021','81000000-0000-4000-8000-000000000006','Synthetic requester B','Synthetic request','{demographics}','Synthetic authority',id from public.profiles where email='disclosure-ro-b@example.test';
insert into public.data_subject_requests(id,patient_id,requester_profile_id,request_type,description,status,due_at,facility_id) values
 ('81000000-0000-4000-8000-000000000030','81000000-0000-4000-8000-000000000005',(select id from public.profiles where email='disclosure-ro-a@example.test'),'access','Synthetic access request A','received',now(),'81000000-0000-4000-8000-000000000001'),
 ('81000000-0000-4000-8000-000000000031','81000000-0000-4000-8000-000000000006',(select id from public.profiles where email='disclosure-ro-b@example.test'),'access','Synthetic access request B','received',now(),'81000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000010","role":"authenticated","aal":"aal2"}',true);
select is((select count(*)::integer from public.disclosure_register where id='81000000-0000-4000-8000-000000000020'),1,'Records Officer reads disclosure history for an assigned facility');
select is((select count(*)::integer from public.disclosure_register where id='81000000-0000-4000-8000-000000000021'),0,'Records Officer cannot read another facility disclosure history');
select is((select count(*)::integer from public.list_data_subject_request_queue() where id='81000000-0000-4000-8000-000000000030'),1,'queue RPC returns an in-scope request');
select is((select count(*)::integer from public.list_data_subject_request_queue() where id='81000000-0000-4000-8000-000000000031'),0,'queue RPC omits a request from another facility');
select throws_ok($$insert into public.disclosure_register(patient_id,disclosed_to,purpose,data_categories,authority,disclosed_by) values('81000000-0000-4000-8000-000000000005','Denied','Denied','{demographics}','Denied',(select id from public.profiles where auth_user_id=auth.uid()))$$,'42501',null,'Records Officer cannot write disclosure rows directly');
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000012","role":"authenticated","aal":"aal2"}',true);
select is((select count(*)::integer from public.disclosure_register where id='81000000-0000-4000-8000-000000000020'),0,'Receptionist cannot read disclosure history');
select throws_ok($$select * from public.list_data_subject_request_queue()$$,'P0001','Data-subject request queue access denied','Receptionist cannot use the Records Officer queue RPC');

reset role;
select * from finish();
rollback;
