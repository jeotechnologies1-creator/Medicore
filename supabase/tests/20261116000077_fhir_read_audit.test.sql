begin;
select plan(7);

insert into public.facilities(id,code,name) values('77000000-0000-4000-8000-000000000001','FHIR-TEST','Synthetic FHIR Facility');
insert into public.patients(id,first_name,last_name,home_facility_id) values
 ('77000000-0000-4000-8000-000000000002','Synthetic','FHIR Allowed','77000000-0000-4000-8000-000000000001'),
 ('77000000-0000-4000-8000-000000000003','Synthetic','FHIR No Consent','77000000-0000-4000-8000-000000000001');
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('77000000-0000-4000-8000-000000000004','authenticated','authenticated','fhir-audit-test@example.test',now(),'{}','{}',now(),now());
update public.profiles set role='super_admin',status='active',facility_id='77000000-0000-4000-8000-000000000001' where auth_user_id='77000000-0000-4000-8000-000000000004';
insert into public.patient_consents(patient_id,consent_type,status,granted_at,consent_version)
values('77000000-0000-4000-8000-000000000002','data_sharing','granted',now(),'synthetic-fhir-test');

select ok(has_function_privilege('authenticated','public.authorize_fhir_read(uuid,text)','EXECUTE'),'authenticated clients can invoke the guarded audit authorization helper');
set local role authenticated;
select set_config('request.jwt.claim.sub','77000000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claims','{"sub":"77000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal2"}',true);
select ok(public.authorize_fhir_read('77000000-0000-4000-8000-000000000002','Patient'),'consented in-scope patient read is authorized');
select throws_ok($$select public.authorize_fhir_read('77000000-0000-4000-8000-000000000003','Patient')$$,'P0001',null,'FHIR access without data-sharing consent is denied');
select throws_ok($$select public.authorize_fhir_read('77000000-0000-4000-8000-000000000002','UnknownResource')$$,'P0001',null,'FHIR resource types outside the read allowlist are denied');
reset role;
select is((select count(*)::integer from public.patient_access_logs where patient_id='77000000-0000-4000-8000-000000000002' and source='fhir_r4_api'),1,'successful FHIR read is recorded in patient access history');
select is((select count(*)::integer from public.audit_logs where action='FHIR_READ' and entity_id='77000000-0000-4000-8000-000000000002'),1,'successful FHIR read emits an AuditEvent wrapper');
select is((select count(*)::integer from public.audit_logs where action='FHIR_READ' and entity_id='77000000-0000-4000-8000-000000000003'),0,'denied FHIR read does not emit a successful-read audit event');
select * from finish();
rollback;
