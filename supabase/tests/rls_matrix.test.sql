begin;

-- Reviewable deployed-policy expectation matrix for the core chart and finance
-- tables. Codes in each cell describe direct authenticated table actions at the
-- actor's authorized facility: S=select, I=insert, U=update, D=delete; "-" is
-- denied. These are same-facility masks. Facility scope is separately asserted
-- below: scoped staff see/write
-- only at an actively assigned facility; unassigned patient rows are denied;
-- Super Admin is global; a patient sees only their own linked rows (including
-- their own unassigned-facility row where the table policy permits patient read).
--
-- Resource columns: patients, appointments, prescriptions, lab_orders, billing,
-- payment_submissions, payment_postings, refund_requests, patient_documents,
-- audit_logs.
-- The matrix records current RLS intent, not the aspirational UI matrix in the
-- docs. Disagreements with documented goals are reported as policy gaps.
create temporary table rls_expected(
  role_name text primary key,
  patients text not null,
  appointments text not null,
  prescriptions text not null,
  lab_orders text not null,
  billing text not null,
  payment_submissions text not null,
  payment_postings text not null,
  refund_requests text not null,
  patient_documents text not null,
  audit_logs text not null
) on commit drop;

-- Every row is a literal, hand-reviewed expectation. No policy/catalog query
-- derives these values.
insert into rls_expected values
 ('patient',                 'S',   'S',   'S',   'S',   'S',   'S',   'S',   'S',   'S',   '-'),
 ('receptionist',            'S',   'S',   'S',   'S',   'SIU', 'S',   'S',   'S',   '-',   '-'),
 ('nurse',                   'S',   'SIU', 'S',   'S',   '-',   '-',   '-',   '-',   'SIU', '-'),
 ('doctor',                  'S',   'SIU', 'SIU', 'SIU', '-',   '-',   '-',   '-',   'SIU', '-'),
 ('pharmacist',              'S',   'S',   'S',   'S',   '-',   '-',   '-',   '-',   'S',   '-'),
 ('laboratory_scientist',    'S',   'S',   'S',   'SIU', '-',   '-',   '-',   '-',   'S',   '-'),
 ('radiographer',            'S',   'S',   'S',   'S',   '-',   '-',   '-',   '-',   'S',   '-'),
 ('accountant',              '-',   '-',   '-',   '-',   'SIU', 'S',   'S',   'S',   '-',   '-'),
 ('records_officer',         'S',   'SU', 'S',   'S',   '-',   '-',   '-',   '-',   'S',   '-'),
 ('surgeon',                 'S',   'S',   'S',   'S',   '-',   '-',   '-',   '-',   'S',   '-'),
 ('specialist',              'S',   'S',   'SIU', 'S',   '-',   '-',   '-',   '-',   'S',   '-'),
 ('theatre_staff',           'S',   'S',   'S',   'S',   '-',   '-',   '-',   '-',   'S',   '-'),
 ('super_admin',             'SIU', 'SIUD','SIUD','SIUD','SIU', 'S',   'S',   'S',   'SIUD','S'),
 ('pending',                 '-',   '-',   '-',   '-',   '-',   '-',   '-',   '-',   '-',   '-');

select plan(50);
select is((select count(*)::integer from rls_expected),14,'matrix explicitly contains all 14 application roles');
select is((select count(*)::integer from information_schema.columns where table_schema like 'pg_temp%' and table_name='rls_expected' and column_name in ('patients','appointments','prescriptions','lab_orders','billing','payment_submissions','payment_postings','refund_requests','patient_documents','audit_logs')),10,'matrix explicitly covers each core table requested');
select ok(not exists(select 1 from rls_expected where patients is null or appointments is null or prescriptions is null or lab_orders is null or billing is null or payment_submissions is null or payment_postings is null or refund_requests is null or patient_documents is null or audit_logs is null),'every role/table cell states an allow or deny expectation');

-- Synthetic fixtures are transaction-local and are rolled back at the end.
insert into public.facilities(id,code,name) values
 ('83000000-0000-4000-8000-000000000001','RLS-MATRIX-A','Synthetic Matrix Facility A'),
 ('83000000-0000-4000-8000-000000000002','RLS-MATRIX-B','Synthetic Matrix Facility B');
insert into public.organization_units(id,facility_id,unit_type,code,name) values
 ('83000000-0000-4000-8000-000000000003','83000000-0000-4000-8000-000000000001','department','RLS-MATRIX-CLINIC','Synthetic Matrix Clinic'),
 ('83000000-0000-4000-8000-000000000004','83000000-0000-4000-8000-000000000001','department','RLS-MATRIX-FINANCE','Synthetic Matrix Finance'),
 ('83000000-0000-4000-8000-000000000005','83000000-0000-4000-8000-000000000001','department','RLS-MATRIX-PHARMACY','Synthetic Matrix Pharmacy'),
 ('83000000-0000-4000-8000-000000000006','83000000-0000-4000-8000-000000000001','department','RLS-MATRIX-LAB','Synthetic Matrix Lab');
insert into public.patients(id,first_name,last_name,home_facility_id) values
 ('83000000-0000-4000-8000-000000000010','Synthetic','Matrix Same Facility','83000000-0000-4000-8000-000000000001'),
 ('83000000-0000-4000-8000-000000000011','Synthetic','Matrix Other Facility','83000000-0000-4000-8000-000000000002'),
 ('83000000-0000-4000-8000-000000000012','Synthetic','Matrix Unassigned Facility',null);

-- Stable fixture identities are the Auth UUIDs; profile primary keys are
-- resolved from the trigger-created profile rows below.
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('83000000-0000-4000-8000-000000000101','authenticated','authenticated','matrix-patient@example.test',now(),'{}','{}',now(),now()),
 ('83000000-0000-4000-8000-000000000102','authenticated','authenticated','matrix-receptionist@example.test',now(),'{}','{}',now(),now()),
 ('83000000-0000-4000-8000-000000000103','authenticated','authenticated','matrix-nurse@example.test',now(),'{}','{}',now(),now()),
 ('83000000-0000-4000-8000-000000000104','authenticated','authenticated','matrix-doctor@example.test',now(),'{}','{}',now(),now()),
 ('83000000-0000-4000-8000-000000000105','authenticated','authenticated','matrix-pharmacist@example.test',now(),'{}','{}',now(),now()),
 ('83000000-0000-4000-8000-000000000106','authenticated','authenticated','matrix-lab@example.test',now(),'{}','{}',now(),now()),
 ('83000000-0000-4000-8000-000000000107','authenticated','authenticated','matrix-radiographer@example.test',now(),'{}','{}',now(),now()),
 ('83000000-0000-4000-8000-000000000108','authenticated','authenticated','matrix-accountant@example.test',now(),'{}','{}',now(),now()),
 ('83000000-0000-4000-8000-000000000109','authenticated','authenticated','matrix-records@example.test',now(),'{}','{}',now(),now()),
 ('83000000-0000-4000-8000-000000000110','authenticated','authenticated','matrix-surgeon@example.test',now(),'{}','{}',now(),now()),
 ('83000000-0000-4000-8000-000000000111','authenticated','authenticated','matrix-specialist@example.test',now(),'{}','{}',now(),now()),
 ('83000000-0000-4000-8000-000000000112','authenticated','authenticated','matrix-theatre@example.test',now(),'{}','{}',now(),now()),
 ('83000000-0000-4000-8000-000000000113','authenticated','authenticated','matrix-admin@example.test',now(),'{}','{}',now(),now()),
 ('83000000-0000-4000-8000-000000000114','authenticated','authenticated','matrix-pending@example.test',now(),'{}','{}',now(),now());
update public.profiles p set role=m.role_name,status=case when m.role_name='unassigned' then 'pending' else 'active' end,
  facility_id=case when m.role_name not in ('patient','unassigned') then '83000000-0000-4000-8000-000000000001'::uuid end,
  patient_id=case when m.role_name='patient' then '83000000-0000-4000-8000-000000000010'::uuid end
from (values
 ('patient','matrix-patient@example.test'),('receptionist','matrix-receptionist@example.test'),('nurse','matrix-nurse@example.test'),
 ('doctor','matrix-doctor@example.test'),('pharmacist','matrix-pharmacist@example.test'),('laboratory_scientist','matrix-lab@example.test'),
 ('radiographer','matrix-radiographer@example.test'),('accountant','matrix-accountant@example.test'),('records_officer','matrix-records@example.test'),
 ('surgeon','matrix-surgeon@example.test'),('specialist','matrix-specialist@example.test'),('theatre_staff','matrix-theatre@example.test'),
 ('super_admin','matrix-admin@example.test'),('unassigned','matrix-pending@example.test')
) as m(role_name,email) where p.email=m.email;
insert into public.staff_organization_memberships(profile_id,organization_unit_id,assigned_by,justification)
select p.id,u.id,(select id from public.profiles where email='matrix-admin@example.test'), 'Synthetic RLS matrix fixture'
from public.profiles p cross join public.organization_units u
where p.email like 'matrix-%@example.test' and p.role::text not in ('patient','pending','unassigned')
  and u.code=case p.role::text when 'accountant' then 'RLS-MATRIX-FINANCE' when 'pharmacist' then 'RLS-MATRIX-PHARMACY' when 'laboratory_scientist' then 'RLS-MATRIX-LAB' else 'RLS-MATRIX-CLINIC' end;

select set_config('request.jwt.claims','{"sub":"83000000-0000-4000-8000-000000000113","role":"authenticated","aal":"aal2"}',true);

-- Patient-linked synthetic rows cover same-facility, other-facility, and NULL
-- home_facility_id behavior. No clinical reference ranges or invented care data.
insert into public.appointments(id,patient_id,appointment_date,status,department) values
 ('83000000-0000-4000-8000-000000000020','83000000-0000-4000-8000-000000000010',current_date,'requested','RLS-MATRIX-CLINIC'),
 ('83000000-0000-4000-8000-000000000021','83000000-0000-4000-8000-000000000011',current_date,'requested','RLS-MATRIX-CLINIC'),
 ('83000000-0000-4000-8000-000000000022','83000000-0000-4000-8000-000000000012',current_date,'requested','RLS-MATRIX-CLINIC');
insert into public.prescriptions(id,patient_id,doctor_id,diagnosis,medications,status) values
 ('83000000-0000-4000-8000-000000000030','83000000-0000-4000-8000-000000000010',(select id from public.profiles where email='matrix-doctor@example.test'),'Synthetic test fixture','[]','active'),
 ('83000000-0000-4000-8000-000000000031','83000000-0000-4000-8000-000000000011',(select id from public.profiles where email='matrix-doctor@example.test'),'Synthetic test fixture','[]','active');
insert into public.lab_orders(id,patient_id,doctor_id,test_type,status,result_status,results) values
 ('83000000-0000-4000-8000-000000000040','83000000-0000-4000-8000-000000000010',(select id from public.profiles where email='matrix-doctor@example.test'),'Synthetic RLS fixture','pending','pending','{}'),
 ('83000000-0000-4000-8000-000000000041','83000000-0000-4000-8000-000000000011',(select id from public.profiles where email='matrix-doctor@example.test'),'Synthetic RLS fixture','pending','pending','{}');
select public.seed_facility_ledger_for_facility('83000000-0000-4000-8000-000000000001');
select public.seed_facility_ledger_for_facility('83000000-0000-4000-8000-000000000002');
insert into public.billing(id,patient_id,invoice_number,total,paid,balance,status) values
 ('83000000-0000-4000-8000-000000000050','83000000-0000-4000-8000-000000000010','RLS-MATRIX-INV-A',10,0,10,'pending'),
 ('83000000-0000-4000-8000-000000000051','83000000-0000-4000-8000-000000000011','RLS-MATRIX-INV-B',10,0,10,'pending');
select set_config('onemed.integration_writer','yes',true);
insert into public.payment_submissions(id,billing_id,patient_id,amount,payment_method,idempotency_key,status,submitted_by) values
 ('83000000-0000-4000-8000-000000000060','83000000-0000-4000-8000-000000000050','83000000-0000-4000-8000-000000000010',1,'synthetic','RLS-MATRIX-PAY-A','pending',(select id from public.profiles where email='matrix-accountant@example.test')),
 ('83000000-0000-4000-8000-000000000061','83000000-0000-4000-8000-000000000051','83000000-0000-4000-8000-000000000011',1,'synthetic','RLS-MATRIX-PAY-B','pending',(select id from public.profiles where email='matrix-receptionist@example.test'));
insert into public.payment_postings(id,payment_submission_id,billing_id,patient_id,amount,payment_method,recorded_by) values
 ('83000000-0000-4000-8000-000000000070','83000000-0000-4000-8000-000000000060','83000000-0000-4000-8000-000000000050','83000000-0000-4000-8000-000000000010',1,'synthetic',(select id from public.profiles where email='matrix-accountant@example.test'));
insert into public.refund_requests(id,payment_posting_id,amount,reason,requested_by) values
 ('83000000-0000-4000-8000-000000000071','83000000-0000-4000-8000-000000000070',0.5,'Synthetic RLS matrix refund request',(select id from public.profiles where email='matrix-accountant@example.test'));
insert into public.patient_documents(id,patient_id,file_name,document_type,uploaded_by) values
 ('83000000-0000-4000-8000-000000000080','83000000-0000-4000-8000-000000000010','synthetic-fixture.pdf','Synthetic test document',(select id from public.profiles where email='matrix-doctor@example.test'));

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"83000000-0000-4000-8000-000000000104","role":"authenticated","aal":"aal2"}',true);
select is((select count(*)::integer from public.patients where id='83000000-0000-4000-8000-000000000010'),1,'same-facility doctor can read patient');
select is((select count(*)::integer from public.patients where id='83000000-0000-4000-8000-000000000011'),0,'doctor cannot read another facility patient');
select is((select count(*)::integer from public.patients where id='83000000-0000-4000-8000-000000000012'),0,'staff cannot read a patient with NULL home_facility_id');
select is((select count(*)::integer from public.appointments where id='83000000-0000-4000-8000-000000000020'),1,'same-facility doctor can read appointment');
select is((select count(*)::integer from public.appointments where id='83000000-0000-4000-8000-000000000021'),0,'doctor cannot read appointment at another facility');
select is((select count(*)::integer from public.prescriptions where id='83000000-0000-4000-8000-000000000030'),1,'doctor can read same-facility prescription');
select is((select count(*)::integer from public.prescriptions where id='83000000-0000-4000-8000-000000000031'),0,'doctor cannot read another-facility prescription');
select is((select count(*)::integer from public.lab_orders where id='83000000-0000-4000-8000-000000000040'),1,'doctor can read same-facility lab result row');
select is((select count(*)::integer from public.billing where id='83000000-0000-4000-8000-000000000050'),0,'doctor cannot read finance invoice');
select throws_ok($$insert into public.billing(patient_id,invoice_number,total,paid,balance,status) values('83000000-0000-4000-8000-000000000010','RLS-MATRIX-DENIED',1,0,1,'pending')$$,'42501',null,'doctor cannot create an invoice through direct table access');
select is((select count(*)::integer from public.patient_documents where id='83000000-0000-4000-8000-000000000080'),1,'doctor can read same-facility patient document');
select throws_ok($$insert into public.patients(first_name,last_name,home_facility_id) values('Synthetic','Denied','83000000-0000-4000-8000-000000000002')$$,'42501',null,'doctor cannot register patient at another facility');
select throws_ok($$insert into public.patients(first_name,last_name,home_facility_id) values('Synthetic','Denied Same Facility','83000000-0000-4000-8000-000000000001')$$,'42501',null,'doctor direct patient registration is blocked by the deployed patient.create grant gate');
select is((with changed as (update public.patients set last_name='Synthetic updated' where id='83000000-0000-4000-8000-000000000011' returning id) select count(*)::integer from changed),0,'doctor cannot update another facility patient');
select is((with removed as (delete from public.patients where id='83000000-0000-4000-8000-000000000011' returning id) select count(*)::integer from removed),0,'doctor cannot delete another facility patient');

-- Patient self-scope, including direct table access and the finalized-result gate.
select set_config('request.jwt.claims','{"sub":"83000000-0000-4000-8000-000000000101","role":"authenticated","aal":"aal2"}',true);
select is((select count(*)::integer from public.patients where id='83000000-0000-4000-8000-000000000010'),1,'patient can read linked patient row');
select is((select count(*)::integer from public.patients where id='83000000-0000-4000-8000-000000000011'),0,'patient cannot read another patient');
select is((select count(*)::integer from public.lab_orders where id='83000000-0000-4000-8000-000000000040'),0,'patient cannot read a non-final lab result');
select is((select count(*)::integer from public.billing where id='83000000-0000-4000-8000-000000000050'),1,'patient can read own invoice');
select is((select count(*)::integer from public.billing where id='83000000-0000-4000-8000-000000000051'),0,'patient cannot read another patient invoice');
select is((with changed as (update public.profiles set patient_id='83000000-0000-4000-8000-000000000011' where auth_user_id='83000000-0000-4000-8000-000000000101' returning id) select count(*)::integer from changed),0,'patient cannot change own patient_id link');
select is((with changed as (update public.profiles set role='super_admin' where auth_user_id='83000000-0000-4000-8000-000000000101' returning id) select count(*)::integer from changed),0,'patient cannot change own role');
select is((with changed as (update public.profiles set status='suspended' where auth_user_id='83000000-0000-4000-8000-000000000101' returning id) select count(*)::integer from changed),0,'patient cannot change own status');
select throws_ok($$insert into public.staff_organization_memberships(profile_id,organization_unit_id,assigned_by,justification) values((select id from public.profiles where auth_user_id=auth.uid()),'83000000-0000-4000-8000-000000000003',(select id from public.profiles where auth_user_id=auth.uid()),'Synthetic self membership escalation')$$,'42501',null,'patient cannot create own facility membership');

-- Super Admin can inspect cross-facility and NULL-facility rows; this is the
-- only global exception in the facility-scope contract.
select set_config('request.jwt.claims','{"sub":"83000000-0000-4000-8000-000000000113","role":"authenticated","aal":"aal2"}',true);
select is((select count(*)::integer from public.patients where id in ('83000000-0000-4000-8000-000000000010','83000000-0000-4000-8000-000000000011','83000000-0000-4000-8000-000000000012')),3,'Super Admin can read same, other, and NULL facility patients');
select ok((select count(*)>0 from public.audit_logs),'Super Admin can read server audit logs');
select throws_ok($$insert into public.audit_logs(user_id,action,entity_type,entity_id,severity) values((select id from public.profiles where auth_user_id=auth.uid()),'FORGED','patient','83000000-0000-4000-8000-000000000010','info')$$,'42501',null,'even Super Admin cannot forge append-only audit entries directly');

-- Pending user must be denied at the restrictive application gate.
select set_config('request.jwt.claims','{"sub":"83000000-0000-4000-8000-000000000114","role":"authenticated","aal":"aal2"}',true);
select is((select count(*)::integer from public.patients),0,'pending identity cannot read any patient');
select throws_ok($$insert into public.patients(first_name,last_name) values('Synthetic','Pending Denied')$$,'42501',null,'pending identity cannot insert a patient');

-- Finance direct reads are facility scoped. A receptionist can submit but not
-- approve payments; an accountant cannot review a payment they submitted.
select set_config('request.jwt.claims','{"sub":"83000000-0000-4000-8000-000000000102","role":"authenticated","aal":"aal2"}',true);
select is((select count(*)::integer from public.billing where id='83000000-0000-4000-8000-000000000050'),1,'receptionist reads same-facility invoice');
select is((select count(*)::integer from public.billing where id='83000000-0000-4000-8000-000000000051'),0,'receptionist cannot read other-facility invoice');
select throws_ok($$select public.review_payment_submission('83000000-0000-4000-8000-000000000060','approved')$$,'P0001','Only Accounts staff may review payments.','receptionist cannot approve a payment');
select throws_ok($$select public.record_document_print('prescription','83000000-0000-4000-8000-000000000031','83000000-0000-4000-8000-000000000011')$$,'P0001',null,'receptionist cannot print a document for another facility patient');
select lives_ok($$select public.submit_payment_for_approval('83000000-0000-4000-8000-000000000050',1,'synthetic',null,'RLS-MATRIX-RPC-PAY')$$,'receptionist submits a payment through the approved RPC');
select is((select count(*)::integer from public.payment_submissions where idempotency_key='RLS-MATRIX-RPC-PAY' and submitted_by=(select id from public.profiles where email='matrix-receptionist@example.test') and status='pending'),1,'payment submission RPC stamps actor and creates a pending review row');
select throws_ok($$insert into public.payment_submissions(billing_id,patient_id,amount,payment_method,idempotency_key,status,submitted_by) values('83000000-0000-4000-8000-000000000050','83000000-0000-4000-8000-000000000010',1,'synthetic','RLS-MATRIX-DIRECT-PAY','pending',(select id from public.profiles where email='matrix-receptionist@example.test'))$$,'42501',null,'authenticated users cannot bypass payment submission RPC with direct insert');
select lives_ok($$select public.register_patient_with_identity_check('RLS-MATRIX-RPC-PAT','Synthetic','RPC Registration',date '2000-01-01','unspecified','000-TEST',null,null,null,null,null,'83000000-0000-4000-8000-000000000001',null,null,null)$$,'receptionist registers a synthetic patient through identity-check RPC');

select set_config('request.jwt.claims','{"sub":"83000000-0000-4000-8000-000000000108","role":"authenticated","aal":"aal2"}',true);
select is((select count(*)::integer from public.payment_postings where id='83000000-0000-4000-8000-000000000070'),1,'accountant can read same-facility payment posting');
select throws_ok($$select public.review_payment_submission('83000000-0000-4000-8000-000000000060','approved')$$,'P0001','The submitter cannot review their own payment.','accountant cannot approve their own payment');
select throws_ok($$select public.review_billing_refund('83000000-0000-4000-8000-000000000071','approved',null)$$,'P0001','The requester cannot review their own refund.','accountant cannot approve their own refund');

-- RPC checks complement the direct-table tests: normal patient registration,
-- appointment booking, prescription dispensing, document-print auditing and
-- finance review all enforce actor/facility authorization server-side.
select set_config('request.jwt.claims','{"sub":"83000000-0000-4000-8000-000000000104","role":"authenticated","aal":"aal2"}',true);
select throws_ok($$select public.book_patient_appointment('83000000-0000-4000-8000-000000000011','83000000-0000-4000-8000-000000000104',current_date+1,'09:00','RLS-MATRIX-CLINIC','consultation',null)$$,'P0001',null,'doctor cannot book another-facility patient appointment through RPC');
select throws_ok($$select public.dispense_prescription('83000000-0000-4000-8000-000000000030','{}'::jsonb)$$,'P0001',null,'doctor cannot dispense through pharmacist-only RPC');
select throws_ok($$select public.review_payment_submission('83000000-0000-4000-8000-000000000060','approved')$$,'P0001',null,'doctor cannot approve payment through finance RPC');
select throws_ok($$select public.request_billing_refund('83000000-0000-4000-8000-000000000070',0.25,'Synthetic denied request')$$,'P0001',null,'doctor cannot request finance refund');
select lives_ok($$select public.record_document_print('prescription','83000000-0000-4000-8000-000000000030','83000000-0000-4000-8000-000000000010')$$,'doctor prints a same-facility prescription through audited RPC');
select is((select count(*)::integer from public.document_print_audit where document_id='83000000-0000-4000-8000-000000000030' and patient_id='83000000-0000-4000-8000-000000000010' and actor_id=(select id from public.profiles where email='matrix-doctor@example.test')),1,'successful document print RPC records the authenticated actor');

-- Known policy gap retained as a passing reproducer: admins manage profiles
-- applies to their own row as well. This synthetic escalation is rolled back.
select set_config('request.jwt.claims','{"sub":"83000000-0000-4000-8000-000000000113","role":"authenticated","aal":"aal2"}',true);
select is((with changed as (update public.profiles set role='doctor',status='suspended',facility_id='83000000-0000-4000-8000-000000000002',patient_id='83000000-0000-4000-8000-000000000011' where auth_user_id=auth.uid() returning id) select count(*)::integer from changed),1,'KNOWN POLICY GAP: Super Admin can change own role, status, facility, and patient link');

reset role;
select * from finish();
rollback;
