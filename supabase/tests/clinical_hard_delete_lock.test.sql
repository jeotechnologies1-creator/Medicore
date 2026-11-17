begin;
select plan(11);

select has_function('public','prevent_clinical_hard_delete',array[]::text[],'hard delete guard exists');

-- Every listed clinical or retained relation present on this schema must have
-- a row-level DELETE trigger. RLS alone is not sufficient for service callers.
select ok(not exists(
 select 1 from unnest(array[
  'patients','appointments','admissions','encounters','consultations','consultation_signatures','consultation_addenda',
  'prescriptions','prescription_items','medication_orders','medication_administrations','medication_reconciliations',
  'medication_refill_requests','patient_allergies','patient_conditions','patient_consents','patient_documents',
  'patient_messages','patient_next_of_kin','patient_record_referrals','patient_referral_letters','family_cards',
  'family_card_members','lab_orders','lab_accessions','lab_specimens','lab_results','lab_qc_runs','radiology_orders',
  'radiology_reports','vital_signs','immunizations','surgeries','nursing_notes','nursing_shift_handovers',
  'intake_output_records','pain_assessments','emergency_visits','clinical_alerts','care_plans','care_plan_goals',
  'clinical_tasks','encounter_workflow_events','result_acknowledgements','admission_discharge_summaries',
  'admission_discharge_signatures','discharge_checklist_answers','discharge_checklist_overrides',
  'blood_products','blood_product_issues','transfusion_records','transfusion_observations','encounter_diagnosis_codes',
  'coding_clinician_queries','chart_audit_templates','chart_deficiencies','release_information_requests',
  'data_subject_requests','disclosure_register','retention_schedule','legal_holds','retention_action_requests',
  'record_archive_registry','disposal_certificates','birth_registrations','death_registrations','safety_incidents',
  'safety_incident_reporter_identity','safety_incident_investigations','safety_incident_actions',
  'safety_incident_closures','infection_surveillance_cases','downtime_reconciliation_entries',
  'downtime_reconciliation_discrepancies','downtime_reconciliation_signatures','billing','credit_notes',
  'insurance_claims','payment_submissions','payment_postings','payment_reversals','payment_provider_transactions',
  'gateway_refund_requests','journal_entries','journal_lines','audit_logs','patient_access_logs'
 ]) expected(table_name)
 join pg_class c on c.relnamespace='public'::regnamespace and c.relname=expected.table_name
 where not exists(select 1 from pg_trigger tr where tr.tgrelid=c.oid and tr.tgname='clinical_hard_delete_lock' and not tr.tgisinternal)
),'every existing clinical and retained table has the hard-delete trigger');
select ok(not exists(
 select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
 where n.nspname='public' and c.relkind in ('r','p') and a.attname in ('patient_id','encounter_id')
 and not exists(select 1 from pg_trigger tr where tr.tgrelid=c.oid and tr.tgname='clinical_hard_delete_lock' and not tr.tgisinternal)
),'every patient- or encounter-linked table has the hard-delete trigger');

insert into public.facilities(id,code,name) values('87000000-0000-4000-8000-000000000001','DEL-TEST','Delete Guard Facility');
insert into public.organization_units(id,facility_id,unit_type,code,name) values
 ('87000000-0000-4000-8000-000000000002','87000000-0000-4000-8000-000000000001','department','DEL-CLINIC','Delete Guard Clinic');
insert into public.patients(id,first_name,last_name,home_facility_id) values
 ('87000000-0000-4000-8000-000000000003','Synthetic','Delete Guard','87000000-0000-4000-8000-000000000001');
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('87000000-0000-4000-8000-000000000010','authenticated','authenticated','delete-guard-admin@example.test',now(),'{}','{}',now(),now()),
 ('87000000-0000-4000-8000-000000000011','authenticated','authenticated','delete-guard-doctor@example.test',now(),'{}','{}',now(),now());
update public.profiles set role='super_admin',status='active',facility_id='87000000-0000-4000-8000-000000000001' where auth_user_id='87000000-0000-4000-8000-000000000010';
update public.profiles set role='doctor',status='active',facility_id='87000000-0000-4000-8000-000000000001' where auth_user_id='87000000-0000-4000-8000-000000000011';
insert into public.staff_organization_memberships(profile_id,organization_unit_id,assigned_by,justification)
select (select id from public.profiles where auth_user_id='87000000-0000-4000-8000-000000000011'),
 '87000000-0000-4000-8000-000000000002',(select id from public.profiles where auth_user_id='87000000-0000-4000-8000-000000000010'),'Delete guard test fixture';

insert into public.appointments(id,patient_id,appointment_date,status,department) values
 ('87000000-0000-4000-8000-000000000020','87000000-0000-4000-8000-000000000003',current_date,'requested','DEL-CLINIC');
insert into public.prescriptions(id,patient_id,doctor_id,diagnosis,medications,status) values
 ('87000000-0000-4000-8000-000000000021','87000000-0000-4000-8000-000000000003',(select id from public.profiles where auth_user_id='87000000-0000-4000-8000-000000000011'),'Synthetic test fixture','[]','active');
insert into public.lab_orders(id,patient_id,doctor_id,test_type,status,result_status,results) values
 ('87000000-0000-4000-8000-000000000022','87000000-0000-4000-8000-000000000003',(select id from public.profiles where auth_user_id='87000000-0000-4000-8000-000000000011'),'Synthetic test fixture','pending','pending','{}');
insert into public.patient_documents(id,patient_id,file_name,document_type,uploaded_by) values
 ('87000000-0000-4000-8000-000000000023','87000000-0000-4000-8000-000000000003','synthetic-fixture.pdf','Synthetic test document',(select id from public.profiles where auth_user_id='87000000-0000-4000-8000-000000000011'));

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"87000000-0000-4000-8000-000000000011","role":"authenticated","aal":"aal2"}',true);
select throws_ok($$delete from public.prescriptions where id='87000000-0000-4000-8000-000000000021'$$,'P0001',null,'owning doctor cannot hard-delete a prescription');
select throws_ok($$delete from public.lab_orders where id='87000000-0000-4000-8000-000000000022'$$,'P0001',null,'owning doctor cannot hard-delete a lab order');
select throws_ok($$delete from public.patient_documents where id='87000000-0000-4000-8000-000000000023'$$,'P0001',null,'owning doctor cannot hard-delete a patient document');
select throws_ok($$delete from public.appointments where id='87000000-0000-4000-8000-000000000020'$$,'P0001',null,'owning doctor cannot hard-delete an appointment');
select set_config('request.jwt.claims','{"sub":"87000000-0000-4000-8000-000000000010","role":"authenticated","aal":"aal2"}',true);
select throws_ok($$delete from public.prescriptions where id='87000000-0000-4000-8000-000000000021'$$,'P0001',null,'super admin cannot hard-delete a prescription');
select throws_ok($$delete from public.lab_orders where id='87000000-0000-4000-8000-000000000022'$$,'P0001',null,'super admin cannot hard-delete a lab order');
select throws_ok($$delete from public.patient_documents where id='87000000-0000-4000-8000-000000000023'$$,'P0001',null,'super admin cannot hard-delete a patient document');
select throws_ok($$delete from public.appointments where id='87000000-0000-4000-8000-000000000020'$$,'P0001',null,'super admin cannot hard-delete an appointment');
reset role;

select * from finish();
rollback;
