begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

-- Retention processing in migration 68 archives or seals records and issues a
-- certificate; it never deletes the source row. Enforce that invariant at the
-- table boundary for both authenticated users and privileged service callers.
do $$
declare t text;
begin
 -- Cover patient/encounter tables added by later migrations without relying
 -- on a hand-maintained name list alone.
 for t in
  select distinct c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
  where n.nspname='public' and c.relkind in ('r','p') and a.attname in ('patient_id','encounter_id')
 loop
  if not exists(select 1 from pg_trigger where tgrelid=to_regclass(format('public.%I',t)) and tgname='clinical_hard_delete_lock' and not tgisinternal) then
   execute format('create trigger clinical_hard_delete_lock before delete on public.%I for each row execute function public.prevent_clinical_hard_delete()',t);
  end if;
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
  if to_regclass(format('public.%I',t)) is not null and not exists(
   select 1 from pg_trigger where tgrelid=to_regclass(format('public.%I',t)) and tgname='clinical_hard_delete_lock' and not tgisinternal
  ) then
   execute format('create trigger clinical_hard_delete_lock before delete on public.%I for each row execute function public.prevent_clinical_hard_delete()',t);
  end if;
 end loop;
end $$;

notify pgrst,'reload schema';
commit;
