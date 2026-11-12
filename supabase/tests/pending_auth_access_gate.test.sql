begin;
select plan(9);
insert into public.facilities(code,name) values ('PENDING-TEST','Synthetic Pending Test Facility');
insert into public.patients(id,first_name,last_name,home_facility_id)
values ('33000000-0000-4000-8000-000000000001','Synthetic','Pending Patient',(select id from public.facilities where code='PENDING-TEST'));
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('33000000-0000-4000-8000-000000000002','authenticated','authenticated','pending-test@example.test',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());

select is((select status::text from public.profiles where auth_user_id='33000000-0000-4000-8000-000000000002'),'pending','new Auth identities start pending');
select is((select role::text from public.profiles where auth_user_id='33000000-0000-4000-8000-000000000002'),'unassigned','new Auth identities have no usable role');
select ok(not public.has_active_application_profile(),'pending profile is denied by application access gate');
select ok(not public.has_any_role(array['super_admin','receptionist','patient','unassigned']),'pending profile cannot satisfy role checks');
select ok(public.is_staff() is false and public.is_clinical_staff() is false,'pending profile is neither staff nor clinical staff');

set local role authenticated;
select set_config('request.jwt.claim.sub','33000000-0000-4000-8000-000000000002',true);
select is((select count(*)::integer from public.patients),0,'pending identity cannot read patient rows');
select throws_ok($$insert into public.patients(first_name,last_name) values ('Synthetic','Denied')$$,'42501',null,'pending identity cannot write patient rows');
select is((select count(*)::integer from storage.objects),0,'pending identity cannot read storage objects');
select throws_ok($$select public.set_role_permission_grant('doctor','patient.read','facility',true)$$,'P0001','Only a super administrator may manage role permissions','pending identity cannot use a privileged RPC');
reset role;
select * from finish();
rollback;
