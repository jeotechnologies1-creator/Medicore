begin;
select plan(15);

insert into public.facilities(id,code,name) values('76000000-0000-4000-8000-000000000001','IMPORT-TEST','Synthetic Import Facility');
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('76000000-0000-4000-8000-000000000002','authenticated','authenticated','import-test@example.test',now(),'{}','{}',now(),now());
update public.profiles set role='super_admin',status='active',facility_id='76000000-0000-4000-8000-000000000001' where auth_user_id='76000000-0000-4000-8000-000000000002';

select has_table('public','patient_import_batches','import batches are quarantined');
select has_table('public','patient_import_rows','import rows retain source and validation data');
select ok(has_function_privilege('service_role','public.stage_patient_import(uuid,uuid,text,jsonb)','EXECUTE'),'only the trusted service role can stage source rows');
select ok(has_function_privilege('authenticated','public.review_patient_import_batch(uuid,jsonb)','EXECUTE'),'authenticated reviewers can approve batches through the guarded RPC');

select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select set_config('test.import_batch',public.stage_patient_import(
 '76000000-0000-4000-8000-000000000001',
 (select id from public.profiles where auth_user_id='76000000-0000-4000-8000-000000000002'),
 'synthetic-existing-patients.csv',
 '[{"source_record_key":"fixture-source-760-A","first_name":"Synthetic","last_name":"Imported Patient","date_of_birth":"1990-02-03","patient_number":"IMPORT-760-A"},{"source_record_key":"fixture-source-760-B","first_name":"","last_name":"Invalid Patient","date_of_birth":"1990-99-99"}]'::jsonb
)::text,true);
select is(public.stage_patient_import(
 '76000000-0000-4000-8000-000000000001',
 (select id from public.profiles where auth_user_id='76000000-0000-4000-8000-000000000002'),
 'synthetic-existing-patients.csv',
 '[{"source_record_key":"fixture-source-760-A","first_name":"Synthetic","last_name":"Imported Patient","date_of_birth":"1990-02-03","patient_number":"IMPORT-760-A"},{"source_record_key":"fixture-source-760-B","first_name":"","last_name":"Invalid Patient","date_of_birth":"1990-99-99"}]'::jsonb
)::text,current_setting('test.import_batch'),'replaying source keys returns the original staged batch');
select is((select jsonb_array_length(validation_errors)::integer from public.patient_import_rows where batch_id=current_setting('test.import_batch')::uuid and source_record_key='fixture-source-760-B'),2,'invalid imported row remains quarantined with field validation errors');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','76000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"76000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
select is(public.review_patient_import_batch(current_setting('test.import_batch')::uuid,jsonb_build_array(jsonb_build_object(
 'row_id',(select id from public.patient_import_rows where batch_id=current_setting('test.import_batch')::uuid and source_record_key='fixture-source-760-A'),
 'decision','approve'))),1,'reviewer approves the valid row through the batch RPC');
select is((select home_facility_id from public.patients where patient_number='IMPORT-760-A'),'76000000-0000-4000-8000-000000000001','approved patient is created at the batch home facility');
select is(public.rollback_patient_import_batch(current_setting('test.import_batch')::uuid,'Synthetic fixture rollback'),1,'reviewer seals the approved patient batch');
select ok(exists(select 1 from public.patients where patient_number='IMPORT-760-A' and status='inactive' and import_rollback_at is not null and import_rollback_by is not null),'rollback retains and marks the patient row for audit');
select is((select status from public.patient_import_batches where id=current_setting('test.import_batch')::uuid),'rolled_back','rollback is recorded on the batch audit state');
select is((select created_patient_id from public.patient_import_rows where batch_id=current_setting('test.import_batch')::uuid and source_record_key='fixture-source-760-A'),(select id from public.patients where patient_number='IMPORT-760-A'),'import row retains its patient provenance link');

-- A second batch with a clinical dependent is refused atomically.
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select set_config('test.dependent_batch',public.stage_patient_import(
 '76000000-0000-4000-8000-000000000001',(select id from public.profiles where auth_user_id='76000000-0000-4000-8000-000000000002'),
 'synthetic-dependent.csv','[{"source_record_key":"fixture-source-760-C","first_name":"Dependent","last_name":"Patient","date_of_birth":"1984-05-06","patient_number":"IMPORT-760-C"}]'::jsonb
)::text,true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','76000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"76000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
select is(public.review_patient_import_batch(current_setting('test.dependent_batch')::uuid,jsonb_build_array(jsonb_build_object(
 'row_id',(select id from public.patient_import_rows where batch_id=current_setting('test.dependent_batch')::uuid and source_record_key='fixture-source-760-C'),
 'decision','approve'))),1,'reviewer approves dependent-row fixture patient');
insert into public.appointments(patient_id,appointment_date,status) select id,current_date,'requested' from public.patients where patient_number='IMPORT-760-C';
select throws_ok(format('select public.rollback_patient_import_batch(%L::uuid,%L)',current_setting('test.dependent_batch'),'Dependent fixture rollback'), 'P0001', null,'rollback refuses a patient with dependent clinical rows');
select ok((select status from public.patient_import_batches where id=current_setting('test.dependent_batch')::uuid)='approved','refused rollback leaves batch unchanged');
select * from finish();
rollback;
