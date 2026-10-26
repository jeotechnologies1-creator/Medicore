begin;
select plan(29);

select has_table('public','organization_units','organization hierarchy table exists');
select has_table('public','job_positions','reporting position table exists');
select has_table('public','staff_organization_memberships','staff memberships are persisted');
select has_function('public','has_org_permission',array['text','uuid','uuid'],'scoped permission helper exists');

insert into public.facilities(code,name) values
 ('TEST-A','RLS Test Facility A'),('TEST-B','RLS Test Facility B');
insert into public.organization_units(facility_id,unit_type,code,name)
select id,'department','TEST-CLINIC','Test Clinic' from public.facilities where code='TEST-A';
insert into public.organization_units(facility_id,unit_type,code,name)
select id,'department','TEST-OTHER','Other Facility Clinic' from public.facilities where code='TEST-B';
insert into public.organization_units(facility_id,unit_type,code,name)
select id,'department','TEST-SURGERY','Test Surgery' from public.facilities where code='TEST-A';
insert into public.organization_units(facility_id,unit_type,code,name)
select id,'department','TEST-ACCOUNTS','Test Accounts' from public.facilities where code='TEST-A';
insert into public.organization_units(facility_id,unit_type,code,name)
select id,'department','TEST-PHARMACY','Test Pharmacy' from public.facilities where code='TEST-A';
insert into public.patients(id,first_name,last_name,home_facility_id) values
 ('20000000-0000-4000-8000-000000000001','Synthetic','RLS Patient',(select id from public.facilities where code='TEST-A')),
 ('20000000-0000-4000-8000-000000000002','Synthetic','Other Facility Patient',(select id from public.facilities where code='TEST-B'));
insert into public.billing(id,patient_id,invoice_number,subtotal,discount,tax,total,paid,balance,status)
values ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','RLS-INV-001',10,0,0,10,0,10,'pending');
insert into public.billing(id,patient_id,invoice_number,subtotal,discount,tax,total,paid,balance,status)
values ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','RLS-INV-002',5,0,0,5,0,5,'pending');

insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('10000000-0000-4000-8000-000000000001','authenticated','authenticated','rls-reception@example.test',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());
update public.profiles set role='receptionist',facility_id=(select id from public.facilities where code='TEST-A') where email='rls-reception@example.test';
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('10000000-0000-4000-8000-000000000002','authenticated','authenticated','rls-accountant@example.test',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());
update public.profiles set role='accountant',facility_id=(select id from public.facilities where code='TEST-A') where email='rls-accountant@example.test';
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('10000000-0000-4000-8000-000000000003','authenticated','authenticated','rls-doctor@example.test',now(),' {"provider":"email","providers":["email"]}','{}',now(),now());
update public.profiles set role='doctor',facility_id=(select id from public.facilities where code='TEST-A') where email='rls-doctor@example.test';
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('10000000-0000-4000-8000-000000000004','authenticated','authenticated','rls-pharmacist@example.test',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());
update public.profiles set role='pharmacist',facility_id=(select id from public.facilities where code='TEST-A') where email='rls-pharmacist@example.test';
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
insert into public.staff_organization_memberships(profile_id,organization_unit_id,assigned_by,justification)
select p.id,u.id,p.id,'Automated RLS fixture' from public.profiles p cross join public.organization_units u
where p.email='rls-reception@example.test' and u.code='TEST-CLINIC';
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
insert into public.staff_organization_memberships(profile_id,organization_unit_id,assigned_by,justification)
select p.id,u.id,p.id,'Automated department RLS fixture' from public.profiles p cross join public.organization_units u
where p.email='rls-doctor@example.test' and u.code='TEST-CLINIC';
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
insert into public.staff_organization_memberships(profile_id,organization_unit_id,assigned_by,justification)
select p.id,u.id,p.id,'Automated finance RLS fixture' from public.profiles p cross join public.organization_units u
where p.email='rls-accountant@example.test' and u.code='TEST-ACCOUNTS';
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
insert into public.staff_organization_memberships(profile_id,organization_unit_id,assigned_by,justification)
select p.id,u.id,p.id,'Automated pharmacy RLS fixture' from public.profiles p cross join public.organization_units u
where p.email='rls-pharmacist@example.test' and u.code='TEST-PHARMACY';
insert into public.pharmacy_inventory(id,name,stock_quantity,reorder_level,expiry_date,status) values
 ('40000000-0000-4000-8000-000000000001','Test Med',5,1,current_date+30,'active');
insert into public.prescriptions(id,patient_id,medications,status) values
 ('50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','[{"name":"Test Med","quantity":2}]','active'),
 ('50000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','[{"name":"Test Med","quantity":1},{"name":"Unavailable Med","quantity":1}]','active');

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select ok(public.has_org_permission('patient.read',(select id from public.facilities where code='TEST-A'),null),'membership grants the role permission in assigned facility');
select ok(not public.has_org_permission('patient.read',(select id from public.facilities where code='TEST-B'),null),'facility scope denies access to another facility');
select is((select count(*)::integer from public.staff_organization_memberships),1,'staff member sees only their own assignment');
select ok(public.has_finance_department_permission('20000000-0000-4000-8000-000000000001','payment.record'),'cashier can submit payments in the assigned facility');
select ok(not public.has_finance_department_permission('20000000-0000-4000-8000-000000000002','payment.record'),'cashier cannot submit payments in another facility');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select ok(public.has_finance_department_permission('20000000-0000-4000-8000-000000000001','payment.approve'),'Accounts staff can approve payments in the assigned facility');
select ok(not public.has_finance_department_permission('20000000-0000-4000-8000-000000000002','payment.approve'),'Accounts staff cannot approve payments in another facility');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select ok(public.has_clinical_department_permission('20000000-0000-4000-8000-000000000001','Test Clinic','patient.read',false),'clinical staff can read within their assigned department');
select ok(not public.has_clinical_department_permission('20000000-0000-4000-8000-000000000001','Test Surgery','patient.read',false),'clinical staff are denied outside their assigned department');
select ok(public.has_clinical_department_permission('20000000-0000-4000-8000-000000000001',null,'patient.read',false),'untagged clinical records use the staff member’s sole active unit');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
select is(public.dispense_prescription('50000000-0000-4000-8000-000000000001')->>'status','dispensed','pharmacy staff can dispense in their assigned facility');
select is((select stock_quantity from public.pharmacy_inventory where id='40000000-0000-4000-8000-000000000001'),3,'successful dispense updates inventory atomically');
select throws_ok($$select public.dispense_prescription('50000000-0000-4000-8000-000000000002')$$,'P0001','Insufficient non-expired stock for Unavailable Med','a failed multi-item dispense reports the missing stock');
select is((select stock_quantity from public.pharmacy_inventory where id='40000000-0000-4000-8000-000000000001'),3,'failed multi-item dispense rolls back earlier stock changes');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select set_config('test.payment_id',public.submit_payment_for_approval('30000000-0000-4000-8000-000000000001',10,'cash','RLS-RECEIPT-001','rls-payment-idempotency-001')::text,true);
select is(public.submit_payment_for_approval('30000000-0000-4000-8000-000000000001',10,'cash','RLS-RECEIPT-001','rls-payment-idempotency-001')::text,current_setting('test.payment_id'),'payment retry returns the original submission');
select is((select count(*)::integer from public.payment_submissions where idempotency_key='rls-payment-idempotency-001'),1,'payment submission is stored once with its idempotency key');
select throws_ok($$insert into public.organization_units(unit_type,code,name) values ('department','UNAUTH','Unauthorized')$$,'42501',null,'non-admin cannot modify organization structure');
set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select set_config('test.self_payment_id',public.submit_payment_for_approval('30000000-0000-4000-8000-000000000002',5,'cash','RLS-RECEIPT-002','rls-payment-idempotency-002')::text,true);
select throws_ok($$select public.review_payment_submission(current_setting('test.self_payment_id')::uuid,'approved')$$,'P0001','The submitter cannot review their own payment.','payment submitter cannot approve their own payment');
select public.review_payment_submission(current_setting('test.payment_id')::uuid,'approved');
select is((select count(*)::integer from public.payment_postings where payment_submission_id=current_setting('test.payment_id')::uuid),1,'Accounts approval writes one immutable payment posting');
select is((select balance from public.billing where id='30000000-0000-4000-8000-000000000001'),0::numeric,'approved payment updates invoice balance transactionally');
select is((select reviewed_by from public.payment_submissions where id=current_setting('test.payment_id')::uuid),(select id from public.profiles where email='rls-accountant@example.test'),'review audit stores profile ID rather than Auth user ID');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select set_config('test.refund_id',public.request_billing_refund((select id from public.payment_postings where payment_submission_id=current_setting('test.payment_id')::uuid),4,'RLS refund fixture')::text,true);
select throws_ok($$select public.review_billing_refund(current_setting('test.refund_id')::uuid,'approved')$$,'P0001','The requester cannot review their own refund.','refund requester cannot approve their own refund');
set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select public.review_billing_refund(current_setting('test.refund_id')::uuid,'approved');
select is((select count(*)::integer from public.payment_reversals where refund_request_id=current_setting('test.refund_id')::uuid),1,'approved refund creates one immutable reversal record');
select is((select balance from public.billing where id='30000000-0000-4000-8000-000000000001'),4::numeric,'approved refund restores the invoice balance transactionally');
set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.request_billing_refund((select id from public.payment_postings where payment_submission_id=current_setting('test.payment_id')::uuid),7,'Exceeds remaining amount')$$,'P0001','Refund request exceeds the remaining posted payment.','refund request cannot exceed remaining payment value');
reset role;

select * from finish();
rollback;
