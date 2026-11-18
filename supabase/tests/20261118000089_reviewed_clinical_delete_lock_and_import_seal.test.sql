begin;
select plan(8);

-- This is the reviewed permanent-record set used by migration 89. Operational
-- notifications and draft/work-queue artifacts are intentionally outside it.
select ok(not exists(
 select 1 from unnest(array[
  'patients','appointments','admissions','encounters','consultations','consultation_signatures','consultation_addenda',
  'prescriptions','prescription_items','medication_orders','medication_administrations','medication_reconciliations',
  'medication_refill_requests','patient_allergies','patient_conditions','patient_consents','patient_documents','patient_messages',
  'patient_next_of_kin','patient_record_referrals','patient_referral_letters','family_cards','family_card_members',
  'lab_orders','lab_accessions','lab_specimens','lab_results','lab_qc_runs','radiology_orders','radiology_reports',
  'vital_signs','immunizations','surgeries','nursing_notes','nursing_shift_handovers','intake_output_records',
  'pain_assessments','emergency_visits','clinical_alerts','care_plans','care_plan_goals','clinical_tasks',
  'encounter_workflow_events','result_acknowledgements','admission_discharge_summaries','admission_discharge_signatures',
  'discharge_checklist_answers','discharge_checklist_overrides','blood_products','blood_product_issues',
  'transfusion_records','transfusion_observations','encounter_diagnosis_codes','coding_clinician_queries',
  'chart_audit_templates','chart_deficiencies','release_information_requests','data_subject_requests',
  'disclosure_register','retention_schedule','legal_holds','retention_action_requests','record_archive_registry',
  'disposal_certificates','birth_registrations','death_registrations','safety_incidents',
  'safety_incident_reporter_identity','safety_incident_investigations','safety_incident_actions','safety_incident_closures',
  'infection_surveillance_cases','downtime_reconciliation_entries','downtime_reconciliation_discrepancies',
  'downtime_reconciliation_signatures','billing','credit_notes','insurance_claims','payment_submissions',
  'payment_postings','payment_reversals','payment_provider_transactions','gateway_refund_requests',
  'journal_entries','journal_lines','audit_logs','patient_access_logs'
 ]) expected(table_name)
 join pg_class c on c.relnamespace='public'::regnamespace and c.relname=expected.table_name
 where not exists(select 1 from pg_trigger tr where tr.tgrelid=c.oid and tr.tgname='clinical_hard_delete_lock' and not tr.tgisinternal)
),'every reviewed permanent-record table has a row DELETE guard');

select ok(not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
 where n.nspname='public' and c.relkind in ('r','p') and a.attname in ('patient_id','encounter_id')
 and c.relname in ('notifications','patient_portal_messages')
 and exists(select 1 from pg_trigger tr where tr.tgrelid=c.oid and tr.tgname='clinical_hard_delete_lock' and not tr.tgisinternal)
),'notifications remain outside the permanent clinical record lock');

select ok(not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname in (
  'patients','appointments','admissions','encounters','consultations','consultation_signatures','consultation_addenda',
  'prescriptions','prescription_items','medication_orders','medication_administrations','medication_reconciliations',
  'medication_refill_requests','patient_allergies','patient_conditions','patient_consents','patient_documents','patient_messages',
  'patient_next_of_kin','patient_record_referrals','patient_referral_letters','family_cards','family_card_members',
  'lab_orders','lab_accessions','lab_specimens','lab_results','lab_qc_runs','radiology_orders','radiology_reports',
  'vital_signs','immunizations','surgeries','nursing_notes','nursing_shift_handovers','intake_output_records',
  'pain_assessments','emergency_visits','clinical_alerts','care_plans','care_plan_goals','clinical_tasks',
  'encounter_workflow_events','result_acknowledgements','admission_discharge_summaries','admission_discharge_signatures',
  'discharge_checklist_answers','discharge_checklist_overrides','blood_products','blood_product_issues',
  'transfusion_records','transfusion_observations','encounter_diagnosis_codes','coding_clinician_queries',
  'chart_audit_templates','chart_deficiencies','release_information_requests','data_subject_requests',
  'disclosure_register','retention_schedule','legal_holds','retention_action_requests','record_archive_registry',
  'disposal_certificates','birth_registrations','death_registrations','safety_incidents',
  'safety_incident_reporter_identity','safety_incident_investigations','safety_incident_actions','safety_incident_closures',
  'infection_surveillance_cases','downtime_reconciliation_entries','downtime_reconciliation_discrepancies',
  'downtime_reconciliation_signatures','billing','credit_notes','insurance_claims','payment_submissions',
  'payment_postings','payment_reversals','payment_provider_transactions','gateway_refund_requests',
  'journal_entries','journal_lines','audit_logs','patient_access_logs'
 ) and not exists(select 1 from pg_trigger tr where tr.tgrelid=c.oid and tr.tgname='clinical_hard_truncate_lock' and not tr.tgisinternal)
),'every reviewed permanent-record table has a statement TRUNCATE guard');

select ok(position('set_config' in lower(pg_get_functiondef('public.rollback_patient_import_batch(uuid,text)'::regprocedure)))=0
 and position('delete from public.patients' in lower(pg_get_functiondef('public.rollback_patient_import_batch(uuid,text)'::regprocedure)))=0,
 'rollback uses no configurable bypass and issues no patient DELETE');

insert into public.facilities(id,code,name) values('89000000-0000-4000-8000-000000000001','LOCK-TEST','Lock Test Facility');
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('89000000-0000-4000-8000-000000000010','authenticated','authenticated','lock-test-admin@example.test',now(),'{}','{}',now(),now()),
 ('89000000-0000-4000-8000-000000000011','authenticated','authenticated','lock-test-doctor@example.test',now(),'{}','{}',now(),now());
update public.profiles set role='super_admin',status='active',facility_id='89000000-0000-4000-8000-000000000001' where auth_user_id='89000000-0000-4000-8000-000000000010';
update public.profiles set role='doctor',status='active',facility_id='89000000-0000-4000-8000-000000000001' where auth_user_id='89000000-0000-4000-8000-000000000011';
insert into public.organization_units(id,facility_id,unit_type,code,name) values
 ('89000000-0000-4000-8000-000000000012','89000000-0000-4000-8000-000000000001','department','LOCK-CLINIC','Lock Test Clinic');
insert into public.staff_organization_memberships(profile_id,organization_unit_id,assigned_by,justification)
select (select id from public.profiles where auth_user_id='89000000-0000-4000-8000-000000000011'),
 '89000000-0000-4000-8000-000000000012',(select id from public.profiles where auth_user_id='89000000-0000-4000-8000-000000000010'),'Delete lock test fixture';
insert into public.patients(id,first_name,last_name,home_facility_id) values
 ('89000000-0000-4000-8000-000000000003','Synthetic','Delete Lock','89000000-0000-4000-8000-000000000001');
insert into public.appointments(id,patient_id,appointment_date,status) values
 ('89000000-0000-4000-8000-000000000004','89000000-0000-4000-8000-000000000003',current_date,'requested');

-- A client can set arbitrary custom GUC names, but no such value grants delete.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"89000000-0000-4000-8000-000000000011","role":"authenticated","aal":"aal2"}',true);
select set_config('onemed.import_rollback_delete_bypass','on',true);
select throws_ok($$delete from public.patients where id='89000000-0000-4000-8000-000000000003'$$,'P0001',null,'authenticated client cannot forge a delete bypass');
select set_config('request.jwt.claims','{"sub":"89000000-0000-4000-8000-000000000010","role":"authenticated","aal":"aal2"}',true);
select throws_ok($$delete from public.patients where id='89000000-0000-4000-8000-000000000003'$$,'P0001',null,'Super Admin cannot directly delete patient');
reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select throws_ok($$delete from public.appointments where id='89000000-0000-4000-8000-000000000004'$$,'P0001',null,'service_role cannot directly delete an appointment');
select throws_ok($$truncate table public.appointments$$,'P0001',null,'service_role TRUNCATE is blocked at statement level');
reset role;

select * from finish();
rollback;
