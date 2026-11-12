begin;
select plan(24);

insert into public.facilities(id,code,name) values
 ('34000000-0000-4000-8000-000000000001','FIN-A','Synthetic Finance Facility A'),
 ('34000000-0000-4000-8000-000000000002','FIN-B','Synthetic Finance Facility B');
insert into public.organization_units(id,facility_id,unit_type,code,name) values
 ('34000000-0000-4000-8000-000000000003','34000000-0000-4000-8000-000000000001','department','FIN-A-RECEPTION','Synthetic Reception A'),
 ('34000000-0000-4000-8000-000000000004','34000000-0000-4000-8000-000000000002','department','FIN-B-RECEPTION','Synthetic Reception B');
insert into public.patients(id,first_name,last_name,home_facility_id) values
 ('34000000-0000-4000-8000-000000000005','Synthetic','Finance A',(select id from public.facilities where code='FIN-A')),
 ('34000000-0000-4000-8000-000000000006','Synthetic','Finance B',(select id from public.facilities where code='FIN-B')),
 ('34000000-0000-4000-8000-000000000016','Synthetic','Unassigned Facility',null);
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('34000000-0000-4000-8000-000000000007','authenticated','authenticated','finance-a@example.test',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
 ('34000000-0000-4000-8000-000000000008','authenticated','authenticated','finance-b@example.test',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
 ('34000000-0000-4000-8000-000000000015','authenticated','authenticated','finance-patient@example.test',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
 ('34000000-0000-4000-8000-000000000018','authenticated','authenticated','finance-admin@example.test',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());
update public.profiles set role='receptionist',status='active' where email in ('finance-a@example.test','finance-b@example.test');
update public.profiles set role='patient',patient_id='34000000-0000-4000-8000-000000000005',status='active' where email='finance-patient@example.test';
update public.profiles set role='super_admin',status='active' where email='finance-admin@example.test';
insert into public.staff_organization_memberships(profile_id,organization_unit_id,assigned_by,justification)
select p.id,u.id,p.id,'Synthetic finance facility-scope test' from public.profiles p join public.organization_units u on
 (p.email='finance-a@example.test' and u.code='FIN-A-RECEPTION') or (p.email='finance-b@example.test' and u.code='FIN-B-RECEPTION');
insert into public.billing(id,patient_id,facility_id,invoice_number,total,balance,status) values
 ('34000000-0000-4000-8000-000000000009','34000000-0000-4000-8000-000000000005','34000000-0000-4000-8000-000000000002','FIN-INV-A',10,10,'pending'),
 ('34000000-0000-4000-8000-000000000010','34000000-0000-4000-8000-000000000006','34000000-0000-4000-8000-000000000001','FIN-INV-B',10,10,'pending'),
 ('34000000-0000-4000-8000-000000000017','34000000-0000-4000-8000-000000000016','34000000-0000-4000-8000-000000000001','FIN-INV-UNASSIGNED',10,10,'pending');
select is((select facility_id from public.billing where id='34000000-0000-4000-8000-000000000009'),'34000000-0000-4000-8000-000000000001'::uuid,'billing facility is derived from patient, ignoring client value');
insert into public.insurance_claims(id,patient_id,claim_number,provider,amount_claimed) values
 ('34000000-0000-4000-8000-000000000011','34000000-0000-4000-8000-000000000005','FIN-CLAIM-A','synthetic',1),
 ('34000000-0000-4000-8000-000000000012','34000000-0000-4000-8000-000000000006','FIN-CLAIM-B','synthetic',1);
select set_config('onemed.integration_writer','yes',true);
insert into public.payment_submissions(id,billing_id,patient_id,amount,payment_method,idempotency_key,submitted_by) values
 ('34000000-0000-4000-8000-000000000013','34000000-0000-4000-8000-000000000009','34000000-0000-4000-8000-000000000005',1,'synthetic','fin-test-a',(select id from public.profiles where email='finance-a@example.test')),
 ('34000000-0000-4000-8000-000000000014','34000000-0000-4000-8000-000000000010','34000000-0000-4000-8000-000000000006',1,'synthetic','fin-test-b',(select id from public.profiles where email='finance-b@example.test'));

set local role authenticated;
select set_config('request.jwt.claim.sub','34000000-0000-4000-8000-000000000007',true);
select is((select count(*)::integer from public.billing where facility_id='34000000-0000-4000-8000-000000000001'),1,'Facility A receptionist can read own facility billing');
select is((select count(*)::integer from public.billing where facility_id='34000000-0000-4000-8000-000000000002'),0,'Facility A receptionist cannot read Facility B billing');
select is((select count(*)::integer from public.payment_submissions where facility_id='34000000-0000-4000-8000-000000000001'),1,'Facility A receptionist can read own facility payment submissions');
select is((select count(*)::integer from public.payment_submissions where facility_id='34000000-0000-4000-8000-000000000002'),0,'Facility A receptionist cannot read Facility B payment submissions');
select is((select count(*)::integer from public.insurance_claims where id='34000000-0000-4000-8000-000000000012'),0,'Facility A receptionist cannot read Facility B claims');
select is((select count(*)::integer from public.billing where id='34000000-0000-4000-8000-000000000017'),0,'Facility A receptionist cannot read billing for an unassigned patient');
select throws_ok($$insert into public.billing(patient_id,invoice_number,total,balance) values ('34000000-0000-4000-8000-000000000006','FIN-CROSS-INV',1,1)$$,'42501',null,'Facility A receptionist cannot create a billing row for Facility B');
select is((with changed as (update public.billing set service='Synthetic update' where id='34000000-0000-4000-8000-000000000010' returning id) select count(*)::integer from changed),0,'Facility A receptionist cannot update Facility B billing');
select is((with removed as (delete from public.billing where id='34000000-0000-4000-8000-000000000010' returning id) select count(*)::integer from removed),0,'Facility A receptionist cannot delete Facility B billing');
select throws_ok($$select public.submit_payment_for_approval('34000000-0000-4000-8000-000000000010',1,'synthetic',null,'fin-cross-key')$$,'P0001','Payment submission facility access denied.','Facility A receptionist cannot submit payment against Facility B billing');
select throws_ok($$insert into public.insurance_claims(patient_id,claim_number,provider,amount_claimed) values ('34000000-0000-4000-8000-000000000006','FIN-CROSS-CLAIM-A','synthetic',1)$$,'42501',null,'Facility A receptionist cannot create a claim for Facility B');
select set_config('request.jwt.claim.sub','34000000-0000-4000-8000-000000000008',true);
select is((select count(*)::integer from public.billing where facility_id='34000000-0000-4000-8000-000000000002'),1,'Facility B receptionist can read own facility billing');
select is((select count(*)::integer from public.billing where facility_id='34000000-0000-4000-8000-000000000001'),0,'Facility B receptionist cannot read Facility A billing');
select is((select count(*)::integer from public.payment_submissions where facility_id='34000000-0000-4000-8000-000000000001'),0,'Facility B receptionist cannot read Facility A payment submissions');
select is((select count(*)::integer from public.insurance_claims where id='34000000-0000-4000-8000-000000000011'),0,'Facility B receptionist cannot read Facility A claims');
select throws_ok($$select public.submit_payment_for_approval('34000000-0000-4000-8000-000000000009',1,'synthetic',null,'fin-cross-key-b')$$,'P0001','Payment submission facility access denied.','Facility B receptionist cannot submit payment against Facility A billing');
select throws_ok($$insert into public.insurance_claims(patient_id,claim_number,provider,amount_claimed) values ('34000000-0000-4000-8000-000000000005','FIN-CROSS-CLAIM-B','synthetic',1)$$,'42501',null,'Facility B receptionist cannot create a claim for Facility A');
select set_config('request.jwt.claim.sub','34000000-0000-4000-8000-000000000015',true);
select is((select count(*)::integer from public.billing where id='34000000-0000-4000-8000-000000000009'),1,'Patient can read own billing');
select is((select count(*)::integer from public.billing where id='34000000-0000-4000-8000-000000000010'),0,'Patient cannot read another patient billing');
select is((select count(*)::integer from public.insurance_claims where id='34000000-0000-4000-8000-000000000011'),1,'Patient can read own insurance claim');
select is((select count(*)::integer from public.payment_submissions where id='34000000-0000-4000-8000-000000000013'),1,'Patient can read own payment submission');
select throws_ok($$insert into public.billing(patient_id,invoice_number,total,balance) values ('34000000-0000-4000-8000-000000000005','FIN-PATIENT-INV',1,1)$$,'42501',null,'Patient cannot create billing records');
select set_config('request.jwt.claim.sub','34000000-0000-4000-8000-000000000018',true);
select is((select count(*)::integer from public.billing where id='34000000-0000-4000-8000-000000000017'),1,'Super Admin can read billing for an unassigned patient');

reset role;
select * from finish();
rollback;
