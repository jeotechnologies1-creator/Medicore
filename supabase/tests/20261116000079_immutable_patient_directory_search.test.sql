begin;
select plan(6);

insert into public.facilities(id,code,name) values
 ('79000000-0000-4000-8000-000000000001','DIR-TEST-A','Synthetic Directory Facility A'),
 ('79000000-0000-4000-8000-000000000002','DIR-TEST-B','Synthetic Directory Facility B');
insert into public.organization_units(id,facility_id,unit_type,code,name) values
 ('79000000-0000-4000-8000-000000000003','79000000-0000-4000-8000-000000000001','department','DIR-TEST-UNIT','Synthetic Directory Unit');
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('79000000-0000-4000-8000-000000000004','authenticated','authenticated','directory-test@example.test',now(),'{}','{}',now(),now());
update public.profiles set role='records_officer',status='active',facility_id='79000000-0000-4000-8000-000000000001' where auth_user_id='79000000-0000-4000-8000-000000000004';
insert into public.staff_organization_memberships(profile_id,organization_unit_id,assigned_by,justification)
select id,'79000000-0000-4000-8000-000000000003',id,'Synthetic directory facility scope test' from public.profiles where auth_user_id='79000000-0000-4000-8000-000000000004';
insert into public.patients(id,first_name,last_name,patient_number,home_facility_id) values
 ('79000000-0000-4000-8000-000000000005','Synthetic','Directory Search Match','DIR-A-MRN','79000000-0000-4000-8000-000000000001'),
 ('79000000-0000-4000-8000-000000000006','Synthetic','Directory Search Match','DIR-B-MRN','79000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub','79000000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claims','{"sub":"79000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal2"}',true);
select is((select count(*)::integer from public.search_patient_directory('Directory Search Match',0,20)),1,'search returns the matching patient at the operator assigned facility only');
select ok(exists(select 1 from public.search_patient_directory('DIR-A-MRN',0,20) where id='79000000-0000-4000-8000-000000000005'),'search can match the facility patient number');
select is((select count(*)::integer from public.search_patient_directory('DIR-B-MRN',0,20)),0,'search never returns a matching patient from another facility');
reset role;
select is((select count(*)::integer from public.patient_access_logs where patient_id='79000000-0000-4000-8000-000000000005' and actor_id=(select id from public.profiles where auth_user_id='79000000-0000-4000-8000-000000000004') and source='search_patient_directory'),2,'search results are logged under the profile actor id');
select ok((select prosrc from pg_proc where oid='public.search_patient_directory(text,integer,integer)'::regprocedure) like '%lower(x.first_name ||%' and (select prosrc from pg_proc where oid='public.search_patient_directory(text,integer,integer)'::regprocedure) not like '%concat_ws%','search predicate matches the immutable index expression');
select ok(has_function_privilege('authenticated','public.search_patient_directory(text,integer,integer)','EXECUTE') and not has_function_privilege('anon','public.search_patient_directory(text,integer,integer)','EXECUTE'),'directory search is authenticated-only');
select * from finish();
rollback;
