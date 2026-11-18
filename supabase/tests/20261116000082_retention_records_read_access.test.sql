begin;
select plan(30);

select has_policy('public','retention_schedule','retention_schedule_records_read','retention schedules have a dedicated read policy');
select has_policy('public','legal_holds','legal_holds_records_read','legal holds have a dedicated read policy');
select has_policy('public','retention_action_requests','retention_action_records_read','retention action requests have a dedicated read policy');
select ok(has_function_privilege('authenticated','public.configure_retention_schedule(uuid,text,integer,text)','EXECUTE'),'schedule changes remain available through the authorized RPC');
select ok(has_function_privilege('authenticated','public.place_legal_hold_case(uuid,uuid,text,text,text,text)','EXECUTE'),'legal holds remain available through the authorized RPC');
select ok(has_function_privilege('authenticated','public.request_retention_action(uuid,text,text,text,text)','EXECUTE'),'retention actions remain available through the authorized RPC');

insert into public.facilities(id,code,name) values
 ('82000000-0000-4000-8000-000000000001','RET-A','Synthetic Retention Facility A'),
 ('82000000-0000-4000-8000-000000000002','RET-B','Synthetic Retention Facility B');
insert into public.organization_units(id,facility_id,unit_type,code,name) values
 ('82000000-0000-4000-8000-000000000003','82000000-0000-4000-8000-000000000001','department','RET-A-RECORDS','Synthetic Retention A'),
 ('82000000-0000-4000-8000-000000000004','82000000-0000-4000-8000-000000000002','department','RET-B-RECORDS','Synthetic Retention B');
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('82000000-0000-4000-8000-000000000010','authenticated','authenticated','retention-ro-a@example.test',now(),'{}','{}',now(),now()),
 ('82000000-0000-4000-8000-000000000011','authenticated','authenticated','retention-reception@example.test',now(),'{}','{}',now(),now()),
 ('82000000-0000-4000-8000-000000000012','authenticated','authenticated','retention-admin@example.test',now(),'{}','{}',now(),now());
update public.profiles set role='records_officer',status='active',facility_id='82000000-0000-4000-8000-000000000001' where email='retention-ro-a@example.test';
update public.profiles set role='receptionist',status='active',facility_id='82000000-0000-4000-8000-000000000001' where email='retention-reception@example.test';
update public.profiles set role='super_admin',status='active',facility_id='82000000-0000-4000-8000-000000000001' where email='retention-admin@example.test';
insert into public.staff_organization_memberships(profile_id,organization_unit_id,assigned_by,justification)
select p.id,u.id,(select id from public.profiles where email='retention-admin@example.test'),'Synthetic facility-scope retention test'
from public.profiles p join public.organization_units u on p.email='retention-ro-a@example.test' and u.code='RET-A-RECORDS';
insert into public.retention_schedule(id,record_category,retention_days,retention_basis,facility_id,version,active)
values ('82000000-0000-4000-8000-000000000020','retention-test-a',30,'Synthetic test basis','82000000-0000-4000-8000-000000000001',1,true),
       ('82000000-0000-4000-8000-000000000021','retention-test-b',30,'Synthetic test basis','82000000-0000-4000-8000-000000000002',1,true);
insert into public.legal_holds(id,facility_id,case_reference,reason,authority_basis,placed_by)
select '82000000-0000-4000-8000-000000000030','82000000-0000-4000-8000-000000000001','RET-CASE-A','Synthetic legal hold reason','Synthetic legal authority',id from public.profiles where email='retention-admin@example.test'
union all
select '82000000-0000-4000-8000-000000000031','82000000-0000-4000-8000-000000000002','RET-CASE-B','Synthetic legal hold reason','Synthetic legal authority',id from public.profiles where email='retention-admin@example.test';
insert into public.retention_action_requests(id,record_category,record_id,action,reason,requested_by,facility_id)
select '82000000-0000-4000-8000-000000000040','retention-test-a','synthetic-a','archive','Synthetic retention test request',id,'82000000-0000-4000-8000-000000000001' from public.profiles where email='retention-admin@example.test'
union all
select '82000000-0000-4000-8000-000000000041','retention-test-b','synthetic-b','archive','Synthetic retention test request',id,'82000000-0000-4000-8000-000000000002' from public.profiles where email='retention-admin@example.test';

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"82000000-0000-4000-8000-000000000010","role":"authenticated","aal":"aal2"}',true);
select is((select count(*)::integer from public.retention_schedule where id='82000000-0000-4000-8000-000000000020'),1,'Records Officer reads retention schedule in assigned facility');
select is((select count(*)::integer from public.retention_schedule where id='82000000-0000-4000-8000-000000000021'),0,'Records Officer cannot read another facility schedule');
select is((select count(*)::integer from public.legal_holds where id='82000000-0000-4000-8000-000000000030'),1,'Records Officer reads legal holds in assigned facility');
select is((select count(*)::integer from public.legal_holds where id='82000000-0000-4000-8000-000000000031'),0,'Records Officer cannot read another facility legal holds');
select is((select count(*)::integer from public.retention_action_requests where id='82000000-0000-4000-8000-000000000040'),1,'Records Officer reads retention actions in assigned facility');
select is((select count(*)::integer from public.retention_action_requests where id='82000000-0000-4000-8000-000000000041'),0,'Records Officer cannot read another facility retention actions');
select throws_ok($$insert into public.retention_schedule(record_category,retention_basis,facility_id) values('direct-write','Denied','82000000-0000-4000-8000-000000000001')$$,'42501',null,'schedule writes are denied outside the RPC');
select throws_ok($$update public.retention_schedule set retention_basis='Denied' where id='82000000-0000-4000-8000-000000000020'$$,'42501',null,'schedule updates are denied outside the RPC');
select throws_ok($$delete from public.retention_schedule where id='82000000-0000-4000-8000-000000000020'$$,'42501',null,'schedule deletes are denied outside the RPC');
select throws_ok($$insert into public.legal_holds(facility_id,reason,placed_by) values('82000000-0000-4000-8000-000000000001','Denied direct hold',(select id from public.profiles where auth_user_id=auth.uid()))$$,'42501',null,'legal hold writes are denied outside the RPC');
select throws_ok($$update public.legal_holds set reason='Denied update' where id='82000000-0000-4000-8000-000000000030'$$,'42501',null,'legal hold updates are denied outside the RPC');
select throws_ok($$delete from public.legal_holds where id='82000000-0000-4000-8000-000000000030'$$,'42501',null,'legal hold deletes are denied outside the RPC');
select throws_ok($$insert into public.retention_action_requests(record_category,record_id,action,reason,requested_by,facility_id) values('retention-test','direct-write','archive','Denied direct request',(select id from public.profiles where auth_user_id=auth.uid()),'82000000-0000-4000-8000-000000000001')$$,'42501',null,'retention action writes are denied outside the RPC');
select throws_ok($$update public.retention_action_requests set reason='Denied update' where id='82000000-0000-4000-8000-000000000040'$$,'42501',null,'retention action updates are denied outside the RPC');
select throws_ok($$delete from public.retention_action_requests where id='82000000-0000-4000-8000-000000000040'$$,'42501',null,'retention action deletes are denied outside the RPC');
select set_config('request.jwt.claims','{"sub":"82000000-0000-4000-8000-000000000011","role":"authenticated","aal":"aal2"}',true);
select is((select count(*)::integer from public.retention_schedule where id='82000000-0000-4000-8000-000000000020'),0,'Receptionist cannot read retention schedules');
select is((select count(*)::integer from public.legal_holds where id='82000000-0000-4000-8000-000000000030'),0,'Receptionist cannot read legal holds');
select is((select count(*)::integer from public.retention_action_requests where id='82000000-0000-4000-8000-000000000040'),0,'Receptionist cannot read retention actions');
select set_config('request.jwt.claims','{"sub":"82000000-0000-4000-8000-000000000012","role":"authenticated","aal":"aal2"}',true);
select is((select count(*)::integer from public.retention_schedule where id='82000000-0000-4000-8000-000000000020'),1,'Super Admin can read a facility retention schedule');
select is((select count(*)::integer from public.retention_schedule where id='82000000-0000-4000-8000-000000000021'),0,'Super Admin cannot read a schedule outside explicitly assigned facilities');
select is((select count(*)::integer from public.legal_holds where id='82000000-0000-4000-8000-000000000030'),1,'Super Admin can read a facility legal hold');
select is((select count(*)::integer from public.legal_holds where id='82000000-0000-4000-8000-000000000031'),0,'Super Admin cannot read a legal hold outside explicitly assigned facilities');
select is((select count(*)::integer from public.retention_action_requests where id='82000000-0000-4000-8000-000000000040'),1,'Super Admin can read a facility retention action');
select is((select count(*)::integer from public.retention_action_requests where id='82000000-0000-4000-8000-000000000041'),0,'Super Admin cannot read a retention action outside explicitly assigned facilities');

reset role;
select * from finish();
rollback;
