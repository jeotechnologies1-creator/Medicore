begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

do $$ begin
 if exists(select 1 from public.encounter_diagnosis_codes) or exists(select 1 from public.coding_clinician_queries)
   or exists(select 1 from public.chart_audit_templates) or exists(select 1 from public.chart_deficiencies) then
  raise exception 'Coding and chart audit records exist; archive them before rollback.';
 end if;
end $$;
drop view if exists public.chart_deficiency_compliance_by_department;
drop view if exists public.coding_completeness_by_department;
drop view if exists public.discharged_encounter_coding_worklist;
drop function if exists public.resolve_chart_deficiency(uuid,text);
drop function if exists public.record_chart_deficiency(uuid,uuid,text,text,uuid,date);
drop function if exists public.configure_chart_audit_template(uuid,text,jsonb);
drop function if exists public.respond_coding_clinician_query(uuid,text);
drop function if exists public.ask_coding_clinician_query(uuid,uuid,text);
drop function if exists public.assign_encounter_diagnosis(uuid,text,text,boolean);
drop function if exists public.coding_encounter_context(uuid);
drop table if exists public.chart_deficiencies;
drop table if exists public.chart_audit_templates;
drop table if exists public.coding_clinician_queries;
drop table if exists public.encounter_diagnosis_codes;
delete from public.role_permission_grants where (role,permission_key,scope) in (
 ('records_officer','coding.read','facility'),('records_officer','coding.manage','facility'),
 ('records_officer','chart.audit.manage','facility'),('doctor','coding.read','facility'));
delete from public.permission_catalog where permission_key in ('coding.read','coding.manage','chart.audit.manage')
 and not exists(select 1 from public.role_permission_grants g where g.permission_key=permission_catalog.permission_key)
 and not exists(select 1 from public.profile_permission_assignments a where a.permission_key=permission_catalog.permission_key);
notify pgrst,'reload schema';
commit;
