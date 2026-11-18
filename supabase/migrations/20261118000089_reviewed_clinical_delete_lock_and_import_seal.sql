begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

-- Import rollback seals imported patients rather than deleting them. This
-- retains both the patient row and its patient_import_rows provenance, and
-- requires no bypass flag that a caller could forge with set_config().
alter table public.patients add column if not exists import_rollback_at timestamptz;
alter table public.patients add column if not exists import_rollback_by uuid references public.profiles(id);
alter table public.patients add column if not exists import_rollback_reason text;

create or replace function public.rollback_patient_import_batch(p_batch_id uuid,p_reason text)
returns integer language plpgsql security definer set search_path=public as $$
declare actor uuid; b public.patient_import_batches%rowtype; n integer; imported record; fk record; has_dependents boolean;
begin
 actor:=(select id from public.profiles where auth_user_id=auth.uid() and status::text='active');
 select * into b from public.patient_import_batches where id=p_batch_id for update;
 if actor is null or b.id is null or not public.has_org_permission('patient.import.review',b.facility_id,null)
   or b.status='rolled_back' or length(btrim(coalesce(p_reason,'')))<10 then
  raise exception 'Authorized reviewer and documented rollback reason required';
 end if;
 for imported in
  select p.id from public.patient_import_rows r join public.patients p on p.id=r.created_patient_id
  where r.batch_id=b.id and r.status='approved' for update of p
 loop
  for fk in
   select ns.nspname schema_name,rel.relname table_name,att.attname column_name
   from pg_constraint con join pg_class rel on rel.oid=con.conrelid join pg_namespace ns on ns.oid=rel.relnamespace
   join pg_attribute att on att.attrelid=rel.oid and att.attnum=con.conkey[1]
   where con.contype='f' and con.confrelid='public.patients'::regclass and array_length(con.conkey,1)=1
    and rel.oid not in ('public.patients'::regclass,'public.patient_import_rows'::regclass)
  loop
   execute format('select exists(select 1 from %I.%I where %I=$1)',fk.schema_name,fk.table_name,fk.column_name)
    into has_dependents using imported.id;
   if has_dependents then
    raise exception 'Rollback refused: imported patient % has dependent rows in %.%',imported.id,fk.schema_name,fk.table_name;
   end if;
  end loop;
 end loop;
 update public.patients p set status='inactive',import_rollback_at=now(),import_rollback_by=actor,
  import_rollback_reason=btrim(p_reason)
 from public.patient_import_rows r where r.batch_id=b.id and r.status='approved' and r.created_patient_id=p.id;
 get diagnostics n=row_count;
 update public.patient_import_rows set status='rolled_back' where batch_id=b.id and status in ('approved','skipped');
 update public.patient_import_batches set status='rolled_back',rolled_back_at=now(),rolled_back_by=actor,rollback_reason=btrim(p_reason) where id=b.id;
 return n;
end $$;
revoke all on function public.rollback_patient_import_batch(uuid,text) from public,anon;
grant execute on function public.rollback_patient_import_batch(uuid,text) to authenticated,service_role;

-- Reviewed permanent record set: patient identity, clinical care, diagnostics,
-- medication, statutory, safety, downtime, finance, retention, and audit data.
-- Notifications, portal messages, and draft/work-queue rows are intentionally
-- excluded: they are operational artifacts that can be cleaned up under their
-- own retention/lifecycle rules, and blocking their deletion would strand
-- transient queues. Their patient links alone do not make them clinical source
-- records. Never infer this list from the presence of a patient_id/encounter_id.
do $$
declare t text;
  locked text[]:=array[
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
  ];
begin
 -- Remove the former column-discovered trigger from unreviewed operational
 -- tables, and normalize the old retention trigger name on reviewed tables.
 for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind in ('r','p') loop
  if not (t=any(locked)) then
   execute format('drop trigger if exists clinical_hard_delete_lock on public.%I',t);
   execute format('drop trigger if exists retention_hard_delete_block on public.%I',t);
   execute format('drop trigger if exists clinical_hard_truncate_lock on public.%I',t);
  end if;
 end loop;
 foreach t in array locked loop
  if to_regclass(format('public.%I',t)) is not null then
   execute format('drop trigger if exists retention_hard_delete_block on public.%I',t);
   execute format('drop trigger if exists clinical_hard_delete_lock on public.%I',t);
   execute format('create trigger clinical_hard_delete_lock before delete on public.%I for each row execute function public.prevent_clinical_hard_delete()',t);
   execute format('drop trigger if exists clinical_hard_truncate_lock on public.%I',t);
   execute format('create trigger clinical_hard_truncate_lock before truncate on public.%I for each statement execute function public.prevent_clinical_hard_delete()',t);
  end if;
 end loop;
end $$;

notify pgrst,'reload schema';
commit;
