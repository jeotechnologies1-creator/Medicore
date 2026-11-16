begin;
do $$ begin
 if exists(select 1 from public.preauthorization_requests) or exists(select 1 from public.claim_batches) or exists(select 1 from public.claim_batch_items) or exists(select 1 from public.payer_plans)
   or exists(select 1 from public.insurance_memberships where payer_plan_id is not null)
   or exists(select 1 from public.insurance_eligibility_checks where connection_id is not null or request<>'{}'::jsonb or response<>'{}'::jsonb or expires_at is not null)
   or exists(select 1 from public.insurance_claims where denial_reason is not null or resubmission_of_id is not null or batch_id is not null or diagnosis_code is not null or service_date is not null) then
  raise exception 'Rollback refused: payer eligibility, authorization, batch, or claim history exists; preserve these financial records and fix forward.';
 end if;
end $$;
drop trigger if exists audit_preauthorization_requests on public.preauthorization_requests;
drop trigger if exists preauthorization_status_guard on public.preauthorization_requests;
drop trigger if exists payer_outbox_delivery on public.integration_outbox;
drop function if exists public.sync_payer_outbox_delivery();
drop trigger if exists insurance_claim_batch_status on public.insurance_claims;
drop function if exists public.sync_claim_batch_status();
drop function if exists public.payer_workflow_event_guard();
drop function if exists public.process_payer_workflow_event(uuid,text,text,jsonb);
drop function if exists public.resubmit_denied_claim(uuid,text);
drop function if exists public.submit_claim_batch(uuid,uuid);
drop function if exists public.create_claim_batch(uuid,uuid[]);
drop function if exists public.request_preauthorization(uuid,text,numeric,jsonb,uuid,uuid);
drop function if exists public.request_payer_eligibility(uuid,text,uuid,uuid);
drop function if exists public.configure_payer_plan(uuid,text,text,text,text[]);
drop policy if exists preauthorization_read on public.preauthorization_requests;
drop policy if exists payer_facility_eligibility_read on public.insurance_eligibility_checks;
drop policy if exists payer_facility_eligibility_insert on public.insurance_eligibility_checks;
create policy "insurance staff manage eligibility checks" on public.insurance_eligibility_checks for all
 using (public.has_any_role(array['super_admin','accountant','records_officer']))
 with check (public.has_any_role(array['super_admin','accountant','records_officer']));
drop table public.claim_batch_items;
drop table public.claim_batches;
drop table public.preauthorization_requests;
drop table public.payer_plans;
alter table public.insurance_memberships drop column payer_plan_id;
alter table public.insurance_eligibility_checks drop column request,drop column response,drop column expires_at,drop column connection_id,drop column updated_at;
alter table public.insurance_eligibility_checks drop constraint insurance_eligibility_checks_status_check;
alter table public.insurance_eligibility_checks add constraint insurance_eligibility_checks_status_check check(status in ('pending_manual','eligible','ineligible','authorization_required'));
alter table public.insurance_claims drop column diagnosis_code,drop column service_date,drop column denial_reason,drop column resubmission_of_id,drop column batch_id;
notify pgrst,'reload schema';
commit;
