-- Roll back only the additional trigger introduced by migration 87. Earlier
-- retention triggers and the clinical hard-delete guard function are retained.
begin;
set local lock_timeout='2s';
do $$ declare t text; begin
 for t in
  select distinct c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
  where n.nspname='public' and c.relkind in ('r','p') and a.attname in ('patient_id','encounter_id')
 loop
  execute format('drop trigger if exists clinical_hard_delete_lock on public.%I',t);
 end loop;
 foreach t in array array[
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
 ] loop
  if to_regclass(format('public.%I',t)) is not null then execute format('drop trigger if exists clinical_hard_delete_lock on public.%I',t); end if;
 end loop;
end $$;
commit;
