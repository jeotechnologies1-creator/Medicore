begin;
select plan(37);

-- Every row is synthetic and transaction-local. Both patients share a facility
-- so these assertions test patient identity boundaries, not facility filtering.
insert into public.facilities(id,code,name) values
 ('84000000-0000-4000-8000-000000000001','PORTAL-ISOLATION','Synthetic Portal Isolation Facility');
insert into public.patients(id,first_name,last_name,home_facility_id) values
 ('84000000-0000-4000-8000-000000000002','Synthetic','Portal Patient A','84000000-0000-4000-8000-000000000001'),
 ('84000000-0000-4000-8000-000000000003','Synthetic','Portal Patient B','84000000-0000-4000-8000-000000000001');
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('84000000-0000-4000-8000-000000000010','authenticated','authenticated','portal-isolation-a@example.test',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
 ('84000000-0000-4000-8000-000000000011','authenticated','authenticated','portal-isolation-b@example.test',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());
update public.profiles set role='patient',status='active',patient_id='84000000-0000-4000-8000-000000000002'
where auth_user_id='84000000-0000-4000-8000-000000000010';
update public.profiles set role='patient',status='active',patient_id='84000000-0000-4000-8000-000000000003'
where auth_user_id='84000000-0000-4000-8000-000000000011';

insert into public.appointments(id,patient_id,appointment_date,status) values
 ('84000000-0000-4000-8000-000000000020','84000000-0000-4000-8000-000000000002',current_date,'requested'),
 ('84000000-0000-4000-8000-000000000021','84000000-0000-4000-8000-000000000003',current_date,'requested');
insert into public.lab_orders(id,patient_id,test_type,status,result_status,results) values
 ('84000000-0000-4000-8000-000000000030','84000000-0000-4000-8000-000000000002','Synthetic isolation fixture','pending','pending','{"fixture":"synthetic"}'),
 ('84000000-0000-4000-8000-000000000031','84000000-0000-4000-8000-000000000002','Synthetic isolation fixture','completed','final','{"fixture":"synthetic"}'),
 ('84000000-0000-4000-8000-000000000032','84000000-0000-4000-8000-000000000002','Synthetic isolation fixture','completed','corrected','{"fixture":"synthetic"}'),
 ('84000000-0000-4000-8000-000000000033','84000000-0000-4000-8000-000000000003','Synthetic isolation fixture','completed','final','{"fixture":"synthetic"}');
insert into public.prescriptions(id,patient_id,diagnosis,medications,status) values
 ('84000000-0000-4000-8000-000000000040','84000000-0000-4000-8000-000000000002','Synthetic isolation fixture','[]','active'),
 ('84000000-0000-4000-8000-000000000041','84000000-0000-4000-8000-000000000003','Synthetic isolation fixture','[]','active');
insert into public.billing(id,patient_id,invoice_number,total,paid,balance,status) values
 ('84000000-0000-4000-8000-000000000050','84000000-0000-4000-8000-000000000002','PORTAL-ISO-A',10,0,10,'pending'),
 ('84000000-0000-4000-8000-000000000051','84000000-0000-4000-8000-000000000003','PORTAL-ISO-B',10,0,10,'pending');
select set_config('onemed.integration_writer','yes',true);
insert into public.payment_submissions(id,billing_id,patient_id,amount,payment_method,idempotency_key,status,submitted_by) values
 ('84000000-0000-4000-8000-000000000060','84000000-0000-4000-8000-000000000050','84000000-0000-4000-8000-000000000002',1,'synthetic','PORTAL-ISO-PAY-A','pending',(select id from public.profiles where auth_user_id='84000000-0000-4000-8000-000000000010')),
 ('84000000-0000-4000-8000-000000000061','84000000-0000-4000-8000-000000000051','84000000-0000-4000-8000-000000000003',1,'synthetic','PORTAL-ISO-PAY-B','pending',(select id from public.profiles where auth_user_id='84000000-0000-4000-8000-000000000011'));
insert into public.patient_messages(id,patient_id,sender_profile_id,sender_name,direction,message) values
 ('84000000-0000-4000-8000-000000000070','84000000-0000-4000-8000-000000000002',(select id from public.profiles where auth_user_id='84000000-0000-4000-8000-000000000010'),'Synthetic A','outgoing','Synthetic portal thread A'),
 ('84000000-0000-4000-8000-000000000071','84000000-0000-4000-8000-000000000003',(select id from public.profiles where auth_user_id='84000000-0000-4000-8000-000000000011'),'Synthetic B','outgoing','Synthetic portal thread B');
insert into public.patient_documents(id,patient_id,file_name,document_type,file_url,uploaded_by) values
 ('84000000-0000-4000-8000-000000000080','84000000-0000-4000-8000-000000000002','synthetic-a.txt','synthetic','84000000-0000-4000-8000-000000000002/portal-a.txt',(select id from public.profiles where auth_user_id='84000000-0000-4000-8000-000000000010')),
 ('84000000-0000-4000-8000-000000000081','84000000-0000-4000-8000-000000000003','synthetic-b.txt','synthetic','84000000-0000-4000-8000-000000000003/portal-b.txt',(select id from public.profiles where auth_user_id='84000000-0000-4000-8000-000000000011'));
insert into public.patient_consents(id,patient_id,consent_type,status,granted_at,consent_version) values
 ('84000000-0000-4000-8000-000000000090','84000000-0000-4000-8000-000000000002','privacy','granted',now(),'synthetic-test-version'),
 ('84000000-0000-4000-8000-000000000091','84000000-0000-4000-8000-000000000003','privacy','granted',now(),'synthetic-test-version');
insert into public.notifications(id,user_id,type,title,message) values
 ('84000000-0000-4000-8000-000000000100',(select id from public.profiles where auth_user_id='84000000-0000-4000-8000-000000000010'),'synthetic','Synthetic A notification','Synthetic test notification'),
 ('84000000-0000-4000-8000-000000000101',(select id from public.profiles where auth_user_id='84000000-0000-4000-8000-000000000011'),'synthetic','Synthetic B notification','Synthetic test notification');
insert into storage.objects(bucket_id,name,metadata) values
 ('patient-documents','84000000-0000-4000-8000-000000000002/portal-a.txt','{"mimetype":"text/plain","size":9}'),
 ('patient-documents','84000000-0000-4000-8000-000000000003/portal-b.txt','{"mimetype":"text/plain","size":9}');

-- A secure portal stream must publish its rows for the positive-control test;
-- the E2E test confirms A receives A's event and never B's event.
select ok(exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='patient_messages'),
  'patient messages are available for authenticated realtime isolation tests');

set local role authenticated;
select set_config('request.jwt.claim.sub','84000000-0000-4000-8000-000000000010',true);
select set_config('request.jwt.claims','{"sub":"84000000-0000-4000-8000-000000000010","role":"authenticated","aal":"aal2"}',true);

select is((select count(*)::integer from public.appointments where patient_id='84000000-0000-4000-8000-000000000003'),0,'patient A cannot read patient B appointments');
select throws_ok($$insert into public.appointments(patient_id,appointment_date,status) values('84000000-0000-4000-8000-000000000003',current_date,'requested')$$,'42501',null,'patient A cannot request an appointment for patient B');
select is((select count(*)::integer from public.lab_orders where patient_id='84000000-0000-4000-8000-000000000003'),0,'patient A cannot read patient B lab results');
select is((select count(*)::integer from public.lab_orders where patient_id='84000000-0000-4000-8000-000000000002' and result_status in ('final','corrected')),2,'patient A can read own final and corrected lab results');
select is((select count(*)::integer from public.lab_orders where id='84000000-0000-4000-8000-000000000030'),0,'patient A cannot read own pending lab result');
select throws_ok($$insert into public.lab_orders(patient_id,test_type,status,result_status) values('84000000-0000-4000-8000-000000000003','Synthetic denied fixture','pending','pending')$$,'42501',null,'patient A cannot create a lab result for patient B');
select is((select count(*)::integer from public.prescriptions where patient_id='84000000-0000-4000-8000-000000000003'),0,'patient A cannot read patient B prescriptions');
select throws_ok($$insert into public.prescriptions(patient_id,diagnosis,medications,status) values('84000000-0000-4000-8000-000000000003','Synthetic denied fixture','[]','active')$$,'42501',null,'patient A cannot create a prescription for patient B');
select is((select count(*)::integer from public.billing where id='84000000-0000-4000-8000-000000000051'),0,'patient A cannot read patient B invoice');
select throws_ok($$insert into public.billing(patient_id,invoice_number,total,paid,balance,status) values('84000000-0000-4000-8000-000000000003','PORTAL-ISO-DENIED',1,0,1,'pending')$$,'42501',null,'patient A cannot create an invoice for patient B');
select is((select count(*)::integer from public.payment_submissions where id='84000000-0000-4000-8000-000000000061'),0,'patient A cannot read patient B payment submission');
select throws_ok($$insert into public.payment_submissions(billing_id,patient_id,amount,payment_method,idempotency_key,status,submitted_by) values('84000000-0000-4000-8000-000000000051','84000000-0000-4000-8000-000000000003',1,'synthetic','PORTAL-ISO-DENIED','pending',(select id from public.profiles where auth_user_id=auth.uid()))$$,'42501',null,'patient A cannot write payment submissions for patient B');
select is((select count(*)::integer from public.patient_messages where patient_id='84000000-0000-4000-8000-000000000003'),0,'patient A cannot read patient B chat thread');
select throws_ok($$insert into public.patient_messages(patient_id,sender_profile_id,sender_name,direction,message) values('84000000-0000-4000-8000-000000000003',(select id from public.profiles where auth_user_id=auth.uid()),'Synthetic A','outgoing','Synthetic denied cross-patient message')$$,'42501',null,'patient A cannot write to patient B chat thread');
select is((select count(*)::integer from public.patient_documents where patient_id='84000000-0000-4000-8000-000000000003'),0,'patient A cannot read patient B document metadata');
select throws_ok($$insert into public.patient_documents(patient_id,file_name,document_type,file_url) values('84000000-0000-4000-8000-000000000003','synthetic-denied.txt','synthetic','84000000-0000-4000-8000-000000000003/denied.txt')$$,'42501',null,'patient A cannot write document metadata for patient B');
select is((select count(*)::integer from public.patient_consents where patient_id='84000000-0000-4000-8000-000000000003'),0,'patient A cannot read patient B consent rows');
select throws_ok($$insert into public.patient_consents(patient_id,consent_type,status) values('84000000-0000-4000-8000-000000000003','privacy','granted')$$,'42501',null,'patient A cannot write consent rows for patient B');
select is((select count(*)::integer from public.notifications where id='84000000-0000-4000-8000-000000000101'),0,'patient A cannot read patient B notifications');
select throws_ok($$insert into public.notifications(user_id,type,title,message) values((select id from public.profiles where auth_user_id='84000000-0000-4000-8000-000000000011'),'synthetic','Synthetic denied notification','Synthetic test')$$,'42501',null,'patient A cannot create notifications for patient B');
select is((select count(*)::integer from storage.objects where bucket_id='patient-documents' and name='84000000-0000-4000-8000-000000000003/portal-b.txt'),0,'patient A cannot read patient B storage object metadata');
select throws_ok($$insert into storage.objects(bucket_id,name,metadata) values('patient-documents','84000000-0000-4000-8000-000000000003/denied.txt','{"mimetype":"text/plain","size":1}')$$,'42501',null,'patient A cannot write into patient B storage object path');

select is((select count(*)::integer from public.patient_messages where patient_id='84000000-0000-4000-8000-000000000002'),1,'patient A sees only own chat messages');
select is((select count(*)::integer from public.patient_documents where patient_id='84000000-0000-4000-8000-000000000002'),1,'patient A sees own document metadata');
select is((select count(*)::integer from public.patient_consents where patient_id='84000000-0000-4000-8000-000000000002'),1,'patient A sees own consent row');
select is((select count(*)::integer from public.notifications where id='84000000-0000-4000-8000-000000000100'),0,'patient notifications remain staff-only under current policies');
select throws_ok($$select public.read_patient_chart('84000000-0000-4000-8000-000000000003','synthetic isolation test')$$,'P0001',null,'patient A cannot read patient B through chart RPC');
select is((select public.read_patient_chart('84000000-0000-4000-8000-000000000002','synthetic isolation test')->'patient'->>'id'),'84000000-0000-4000-8000-000000000002','chart RPC returns only explicitly requested own patient');
select ok(not exists(select 1 from jsonb_array_elements(public.read_patient_chart('84000000-0000-4000-8000-000000000002','synthetic isolation test')->'lab_orders') as lab(result_row) where result_row->>'result_status' not in ('final','corrected')),'chart RPC must not return pending own lab results');
select throws_ok($$select * from public.read_patient_consents('84000000-0000-4000-8000-000000000003')$$,'P0001',null,'patient A cannot read patient B consents through RPC');
select is((select count(*)::integer from public.read_patient_consents('84000000-0000-4000-8000-000000000002')),1,'consent RPC returns patient A own consent only');
select throws_ok($$select public.authorize_patient_document_read('84000000-0000-4000-8000-000000000003/portal-b.txt')$$,'P0001',null,'patient A cannot authorize patient B document path through RPC');
select throws_ok($$select public.request_patient_payment_checkout('84000000-0000-4000-8000-000000000051','84000000-0000-4000-8000-000000000200',1,'portal-isolation-checkout','NGN')$$,'P0001',null,'patient A cannot create checkout for patient B invoice');
select throws_ok($$select public.dispense_prescription('84000000-0000-4000-8000-000000000041','{}'::jsonb)$$,'P0001',null,'patient A cannot call pharmacist-only dispense RPC');
select throws_ok($$select * from public.search_patient_directory('Synthetic',0,10)$$,'P0001',null,'patient A cannot call staff-only patient directory RPC');
select throws_ok($$select public.review_payment_submission('84000000-0000-4000-8000-000000000061','approved')$$,'P0001',null,'patient A cannot call staff-only payment approval RPC');

reset role;
select * from finish();
rollback;
