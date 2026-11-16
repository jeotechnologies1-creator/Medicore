begin;
do $$ begin
 if exists(select 1 from public.blood_donors) or exists(select 1 from public.blood_units)
   or exists(select 1 from public.blood_compatibility_rules) or exists(select 1 from public.blood_crossmatch_requests)
   or exists(select 1 from public.blood_crossmatch_results) or exists(select 1 from public.blood_unit_events)
   or exists(select 1 from public.transfusion_records) or exists(select 1 from public.transfusion_observations)
   or exists(select 1 from public.transfusion_reactions) or exists(select 1 from public.blood_bank_clinical_owners)
   or exists(select 1 from public.blood_bank_witness_credentials) then
   raise exception 'Unsafe rollback refused: blood-bank or transfusion traceability history exists; preserve the audit trail and fix forward.';
 end if;
end $$;
drop view if exists public.blood_unit_inventory;
drop function if exists public.find_blood_unit_recall(text);
drop function if exists public.report_transfusion_reaction(uuid,text,jsonb);
drop function if exists public.record_transfusion_observation(uuid,text,jsonb,text);
drop function if exists public.complete_transfusion(uuid);
drop function if exists public.start_transfusion(uuid,uuid,uuid,uuid,uuid,text);
drop function if exists public.begin_transfusion(uuid);
drop function if exists public.set_blood_bank_witness_pin(text);
drop function if exists public.return_blood_unit(uuid,boolean,text);
drop function if exists public.issue_blood_unit(uuid,uuid,boolean);
drop function if exists public.record_blood_crossmatch(uuid,uuid,text);
drop function if exists public.request_blood_crossmatch(uuid,uuid,text,text);
drop function if exists public.set_blood_unit_status(uuid,text,text);
drop function if exists public.assign_blood_bank_clinical_owner(uuid,uuid);
drop function if exists public.review_blood_compatibility_rule(uuid,integer,text,text,text,boolean);
drop function if exists public.register_blood_unit(uuid,text,text,text,text,timestamptz);
drop table if exists public.transfusion_reactions;
drop table if exists public.transfusion_observations;
drop table if exists public.transfusion_records;
drop table if exists public.blood_unit_events;
drop table if exists public.blood_crossmatch_results;
drop table if exists public.blood_crossmatch_requests;
drop table if exists public.blood_compatibility_rules;
drop table if exists public.blood_units;
drop table if exists public.blood_donors;
drop table if exists public.blood_bank_clinical_owners;
drop table if exists public.blood_bank_witness_credentials;
delete from public.role_permission_grants where permission_key in ('bloodbank.manage','bloodbank.crossmatch','bloodbank.transfuse','bloodbank.rules.review');
delete from public.permission_catalog where permission_key in ('bloodbank.manage','bloodbank.crossmatch','bloodbank.transfuse','bloodbank.rules.review');
notify pgrst,'reload schema';
commit;
