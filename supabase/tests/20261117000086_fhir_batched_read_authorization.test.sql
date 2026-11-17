begin;
select plan(11);

insert into public.facilities(id,code,name) values
 ('86000000-0000-4000-8000-000000000001','FHIR-BATCH-A','FHIR Batch Facility A'),
 ('86000000-0000-4000-8000-000000000002','FHIR-BATCH-B','FHIR Batch Facility B');
insert into public.patients(id,first_name,last_name,home_facility_id) values
 ('86000000-0000-4000-8000-000000000003','Synthetic','In Scope','86000000-0000-4000-8000-000000000001'),
 ('86000000-0000-4000-8000-000000000004','Synthetic','Cross Facility','86000000-0000-4000-8000-000000000002'),
 ('86000000-0000-4000-8000-000000000005','Synthetic','No Consent','86000000-0000-4000-8000-000000000001');
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('86000000-0000-4000-8000-000000000006','authenticated','authenticated','fhir-batch-test@example.test',now(),'{}','{}',now(),now());
update public.profiles set role='records_officer',status='active',facility_id='86000000-0000-4000-8000-000000000001'
 where auth_user_id='86000000-0000-4000-8000-000000000006';
insert into public.patient_consents(patient_id,consent_type,status,granted_at,consent_version) values
 ('86000000-0000-4000-8000-000000000003','data_sharing','granted',now(),'synthetic-fhir-batch'),
 ('86000000-0000-4000-8000-000000000004','data_sharing','granted',now(),'synthetic-fhir-batch');

select ok(has_function_privilege('authenticated','public.authorize_fhir_read_batch(uuid[],text)','EXECUTE'),
 'authenticated FHIR callers can use the batched guarded authorization helper');
set local role authenticated;
select set_config('request.jwt.claim.sub','86000000-0000-4000-8000-000000000006',true);
select set_config('request.jwt.claims','{"sub":"86000000-0000-4000-8000-000000000006","role":"authenticated","aal":"aal2"}',true);
select is(public.authorize_fhir_read_batch(array[
 '86000000-0000-4000-8000-000000000003'::uuid,
 '86000000-0000-4000-8000-000000000003'::uuid,
 '86000000-0000-4000-8000-000000000004'::uuid,
 '86000000-0000-4000-8000-000000000005'::uuid
],'Patient'),array['86000000-0000-4000-8000-000000000003'::uuid],
 'batch authorization deduplicates reads and withholds cross-facility or unconsented patients');
select is(public.authorize_fhir_read_batch(array['86000000-0000-4000-8000-000000000003'::uuid],'Patient'),array['86000000-0000-4000-8000-000000000003'::uuid],
 'a consented patient in the caller facility is authorized');
select is(public.authorize_fhir_read_batch(array['86000000-0000-4000-8000-000000000004'::uuid],'Patient'),'{}'::uuid[],
 'a patient in another facility is denied');
select is(public.authorize_fhir_read_batch(array['86000000-0000-4000-8000-000000000005'::uuid],'Patient'),'{}'::uuid[],
 'a patient without data-sharing consent is denied');
select throws_ok($$select public.authorize_fhir_read_batch(array['86000000-0000-4000-8000-000000000003'::uuid],'UnknownResource')$$,'P0001',null,
 'resource types outside the FHIR allowlist are denied');
select is(public.authorize_fhir_read_batch('{}'::uuid[],'Encounter'),'{}'::uuid[],
 'an empty search returns an empty authorized patient set');
reset role;
select is((select count(*)::integer from public.patient_access_logs where patient_id='86000000-0000-4000-8000-000000000003' and source='fhir_r4_api'),2,
 'each successful batched FHIR request is recorded in patient access history');
select is((select count(*)::integer from public.audit_logs where action='FHIR_READ' and entity_id='86000000-0000-4000-8000-000000000003'),2,
 'each successful batched FHIR request writes an AuditEvent');
select is((select count(*)::integer from public.audit_logs where action='FHIR_READ_DENIED' and entity_id in ('86000000-0000-4000-8000-000000000004','86000000-0000-4000-8000-000000000005')),4,
 'cross-facility and withheld-consent reads are audited as denied');
select is((select count(*)::integer from public.audit_logs where action='FHIR_READ' and entity_type='FHIR.Encounter' and entity_id is null),1,
 'a valid search returning no patient rows still emits an AuditEvent');

select * from finish();
rollback;
