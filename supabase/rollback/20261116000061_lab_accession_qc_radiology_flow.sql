begin;
do $$ begin
 if exists(select 1 from public.lab_specimen_events) or exists(select 1 from public.lab_qc_rules)
   or exists(select 1 from public.lab_qc_runs) or exists(select 1 from public.lab_corrected_result_history)
   or exists(select 1 from public.radiology_report_history)
   or exists(select 1 from public.document_print_audit where document_type='specimen_label') then
   raise exception 'Unsafe rollback refused: diagnostic accession/QC/report history exists; preserve the audit trail and fix forward.';
 end if;
end $$;
drop trigger if exists record_radiology_report_history on public.radiology_orders;
drop trigger if exists aa_sync_radiology_report_state on public.radiology_orders;
drop trigger if exists sync_radiology_report_state on public.radiology_orders;
drop trigger if exists record_lab_corrected_result on public.lab_orders;
drop trigger if exists guard_lab_specimen_rejection on public.lab_orders;
drop trigger if exists guard_lab_result_qc_and_correction on public.lab_orders;
drop trigger if exists assign_lab_accession on public.lab_orders;
drop view if exists public.lab_specimen_labels;
drop function if exists public.record_radiology_report_history();
drop function if exists public.sync_radiology_report_state();
drop function if exists public.record_lab_corrected_result();
drop function if exists public.guard_lab_specimen_rejection();
drop function if exists public.guard_lab_result_qc_and_correction();
drop function if exists public.reject_lab_specimen(uuid,text);
drop function if exists public.collect_lab_specimen(uuid);
drop function if exists public.record_lab_qc_run(uuid,text,text,numeric);
drop function if exists public.configure_lab_qc_rule(uuid,text,text,jsonb);
drop function if exists public.assign_lab_accession();
drop function if exists public.record_specimen_label_print(uuid,uuid);
drop table if exists public.radiology_report_history;
drop table if exists public.lab_corrected_result_history;
drop table if exists public.lab_qc_runs;
drop table if exists public.lab_qc_rules;
drop table if exists public.lab_specimen_events;
drop table if exists public.lab_accession_counters;
drop index if exists public.lab_orders_accession_uidx;
alter table public.document_print_audit drop constraint if exists document_print_audit_document_type_check;
alter table public.document_print_audit add constraint document_print_audit_document_type_check check(document_type in ('prescription','discharge_summary','referral_letter','lab_report','radiology_report','invoice','receipt'));
alter table public.radiology_orders drop column if exists report_state;
alter table public.lab_orders drop column if exists corrected_result_reason;
alter table public.lab_orders drop column if exists specimen_rejection_reason;
alter table public.lab_orders drop column if exists specimen_status;
alter table public.lab_orders drop column if exists accession_number;
alter table public.lab_orders drop column if exists facility_id;
notify pgrst,'reload schema';
commit;
