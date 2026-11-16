begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

-- Vendor neutral payer configuration. Secrets and endpoint routing remain in the
-- existing integration connection and Edge secret configuration.
create table if not exists public.payer_plans (
 id uuid primary key default gen_random_uuid(), facility_id uuid not null references public.facilities(id) on delete restrict,
 payer_code text not null check(payer_code ~ '^[a-z0-9][a-z0-9_-]{1,49}$'), plan_code text not null,
 display_name text not null check(length(btrim(display_name))>0), required_claim_fields text[] not null default array['claim_number','billing_id','membership_id','amount_claimed']::text[],
 active boolean not null default true, configured_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 unique(facility_id,payer_code,plan_code), check(required_claim_fields <@ array['claim_number','billing_id','membership_id','amount_claimed','diagnosis_code','service_date']::text[])
);
alter table public.insurance_memberships add column if not exists payer_plan_id uuid references public.payer_plans(id) on delete restrict;
alter table public.insurance_eligibility_checks add column if not exists request jsonb not null default '{}'::jsonb check(jsonb_typeof(request)='object');
alter table public.insurance_eligibility_checks add column if not exists response jsonb not null default '{}'::jsonb check(jsonb_typeof(response)='object');
alter table public.insurance_eligibility_checks add column if not exists expires_at timestamptz;
alter table public.insurance_eligibility_checks add column if not exists connection_id uuid references public.integration_connections(id) on delete restrict;
alter table public.insurance_eligibility_checks add column if not exists updated_at timestamptz not null default now();
alter table public.insurance_eligibility_checks drop constraint if exists insurance_eligibility_checks_status_check;
alter table public.insurance_eligibility_checks add constraint insurance_eligibility_checks_status_check check(status in ('pending_manual','pending','eligible','ineligible','authorization_required','error','expired'));

create table if not exists public.preauthorization_requests (
 id uuid primary key default gen_random_uuid(), facility_id uuid not null references public.facilities(id) on delete restrict,
 patient_id uuid not null references public.patients(id) on delete restrict, membership_id uuid not null references public.insurance_memberships(id) on delete restrict,
 encounter_id uuid references public.encounters(id) on delete restrict, payer_plan_id uuid references public.payer_plans(id) on delete restrict,
 connection_id uuid references public.integration_connections(id) on delete restrict, service_type text not null, requested_amount numeric(12,2) check(requested_amount is null or requested_amount>=0),
 request jsonb not null default '{}'::jsonb check(jsonb_typeof(request)='object'), response jsonb not null default '{}'::jsonb check(jsonb_typeof(response)='object'),
 status text not null default 'draft' check(status in ('draft','queued','submitted','approved','denied','more_information','cancelled','expired')),
 external_reference text, denial_reason text, expires_at timestamptz, requested_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.claim_batches (
 id uuid primary key default gen_random_uuid(), facility_id uuid not null references public.facilities(id) on delete restrict,
 payer_plan_id uuid not null references public.payer_plans(id) on delete restrict, status text not null default 'draft' check(status in ('draft','submitted','partial','completed','cancelled')),
 created_by uuid not null references public.profiles(id), submitted_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.claim_batch_items (
 batch_id uuid not null references public.claim_batches(id) on delete restrict, claim_id uuid not null references public.insurance_claims(id) on delete restrict,
 validation_errors jsonb not null default '[]'::jsonb check(jsonb_typeof(validation_errors)='array'), created_at timestamptz not null default now(), primary key(batch_id,claim_id), unique(claim_id)
);
alter table public.insurance_claims add column if not exists diagnosis_code text;
alter table public.insurance_claims add column if not exists service_date date;
alter table public.insurance_claims add column if not exists denial_reason text;
alter table public.insurance_claims add column if not exists resubmission_of_id uuid references public.insurance_claims(id) on delete restrict;
alter table public.insurance_claims add column if not exists batch_id uuid references public.claim_batches(id) on delete restrict;

drop policy if exists "insurance staff manage eligibility checks" on public.insurance_eligibility_checks;
drop policy if exists payer_facility_eligibility_read on public.insurance_eligibility_checks;
create policy payer_facility_eligibility_read on public.insurance_eligibility_checks for select to authenticated using (
 exists(select 1 from public.insurance_memberships m where m.id=membership_id and public.has_finance_department_permission(m.patient_id,'insurance.submit'))
);
drop policy if exists payer_facility_eligibility_insert on public.insurance_eligibility_checks;
create policy payer_facility_eligibility_insert on public.insurance_eligibility_checks for insert to authenticated with check (
 exists(select 1 from public.insurance_memberships m where m.id=membership_id and public.has_finance_department_permission(m.patient_id,'insurance.submit'))
);

create index if not exists payer_plans_facility_idx on public.payer_plans(facility_id,payer_code,active);
create index if not exists preauth_facility_status_idx on public.preauthorization_requests(facility_id,status,created_at desc);
create index if not exists claim_batches_facility_status_idx on public.claim_batches(facility_id,status,created_at desc);

create or replace function public.configure_payer_plan(p_facility_id uuid,p_payer_code text,p_plan_code text,p_display_name text,p_required_fields text[] default array['claim_number','billing_id','membership_id','amount_claimed']::text[])
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid; plan_id uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if actor is null or not (public.has_any_role(array['super_admin']) or public.has_org_permission('integration.manage',p_facility_id,null)) or nullif(btrim(p_payer_code),'') is null or nullif(btrim(p_plan_code),'') is null or nullif(btrim(p_display_name),'') is null or p_required_fields is null or not (p_required_fields <@ array['claim_number','billing_id','membership_id','amount_claimed','diagnosis_code','service_date']::text[]) then raise exception 'Payer plan configuration is invalid or unauthorized.'; end if;
 insert into public.payer_plans(facility_id,payer_code,plan_code,display_name,required_claim_fields,configured_by) values(p_facility_id,lower(btrim(p_payer_code)),btrim(p_plan_code),btrim(p_display_name),p_required_fields,actor)
 on conflict(facility_id,payer_code,plan_code) do update set display_name=excluded.display_name,required_claim_fields=excluded.required_claim_fields,active=true,configured_by=excluded.configured_by returning id into plan_id;
 return plan_id;
end $$;

create or replace function public.request_payer_eligibility(p_membership_id uuid,p_service_type text,p_encounter_id uuid default null,p_connection_id uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare m public.insurance_memberships%rowtype; actor uuid; check_id uuid; facility uuid;
begin
 select * into m from public.insurance_memberships where id=p_membership_id;
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 select home_facility_id into facility from public.patients where id=m.patient_id;
 if m.id is null or actor is null or not public.has_finance_department_permission(m.patient_id,'insurance.submit') or nullif(btrim(p_service_type),'') is null then raise exception 'Eligibility request access denied or service type is missing.'; end if;
 if p_connection_id is not null and not exists(select 1 from public.integration_connections where id=p_connection_id and facility_id=facility and integration_type='payer' and status='active') then raise exception 'Active payer connection is required.'; end if;
 insert into public.insurance_eligibility_checks(membership_id,encounter_id,service_type,status,request,expires_at,checked_by,connection_id)
 values(m.id,p_encounter_id,btrim(p_service_type),case when p_connection_id is null then 'pending_manual' else 'pending' end,
 jsonb_build_object('membership_id',m.id,'policy_number',m.policy_number,'service_type',btrim(p_service_type),'encounter_id',p_encounter_id),now()+interval '24 hours',actor,p_connection_id) returning id into check_id;
 if p_connection_id is not null then perform public.enqueue_integration_event(p_connection_id,'payer.eligibility.check','eligibility_check',check_id,'eligibility:'||check_id::text,
 jsonb_build_object('eligibility_check_id',check_id,'policy_number',m.policy_number,'service_type',btrim(p_service_type),'encounter_id',p_encounter_id)); end if;
 return check_id;
end $$;

create or replace function public.request_preauthorization(p_membership_id uuid,p_service_type text,p_requested_amount numeric,p_request jsonb default '{}'::jsonb,p_encounter_id uuid default null,p_connection_id uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare m public.insurance_memberships%rowtype; actor uuid; facility uuid; request_id uuid;
begin
 select * into m from public.insurance_memberships where id=p_membership_id; select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 select home_facility_id into facility from public.patients where id=m.patient_id;
 if m.id is null or actor is null or not public.has_finance_department_permission(m.patient_id,'insurance.submit') or nullif(btrim(p_service_type),'') is null or (p_requested_amount is not null and p_requested_amount<0) or jsonb_typeof(p_request)<>'object' then raise exception 'Pre-authorization request is invalid or unauthorized.'; end if;
 if p_connection_id is not null and not exists(select 1 from public.integration_connections where id=p_connection_id and facility_id=facility and integration_type='payer' and status='active') then raise exception 'Active payer connection is required.'; end if;
 insert into public.preauthorization_requests(facility_id,patient_id,membership_id,encounter_id,payer_plan_id,connection_id,service_type,requested_amount,request,status,requested_by)
 values(facility,m.patient_id,m.id,p_encounter_id,m.payer_plan_id,p_connection_id,btrim(p_service_type),p_requested_amount,coalesce(p_request,'{}'::jsonb),case when p_connection_id is null then 'draft' else 'queued' end,actor) returning id into request_id;
 if p_connection_id is not null then perform public.enqueue_integration_event(p_connection_id,'payer.preauthorization.request','preauthorization',request_id,'preauthorization:'||request_id::text,jsonb_build_object('preauthorization_id',request_id,'policy_number',m.policy_number,'service_type',btrim(p_service_type),'requested_amount',p_requested_amount,'request',coalesce(p_request,'{}'::jsonb))); end if;
 return request_id;
end $$;

create or replace function public.create_claim_batch(p_payer_plan_id uuid,p_claim_ids uuid[])
returns uuid language plpgsql security definer set search_path=public as $$
declare plan public.payer_plans%rowtype; actor uuid; batch uuid; claim public.insurance_claims%rowtype; claim_key uuid; errors jsonb; required text;
begin
 select * into plan from public.payer_plans where id=p_payer_plan_id and active; select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if plan.id is null or actor is null or not (public.has_any_role(array['super_admin']) or public.has_org_permission('insurance.submit',plan.facility_id,null)) or p_claim_ids is null or cardinality(p_claim_ids)=0 then raise exception 'Claim batch access denied or batch is empty.'; end if;
 insert into public.claim_batches(facility_id,payer_plan_id,created_by) values(plan.facility_id,plan.id,actor) returning id into batch;
 foreach claim_key in array p_claim_ids loop
  select * into claim from public.insurance_claims where id=claim_key;
  errors:='[]'::jsonb;
  if claim.id is null or claim.facility_id is distinct from plan.facility_id or claim.provider<>plan.payer_code then errors:=errors||jsonb_build_array('claim_not_in_payer_facility');
  else
   foreach required in array plan.required_claim_fields loop
    if (required='claim_number' and nullif(btrim(claim.claim_number),'') is null) or (required='billing_id' and claim.billing_id is null) or (required='membership_id' and claim.membership_id is null) or (required='amount_claimed' and claim.amount_claimed<=0) or (required='diagnosis_code' and nullif(btrim(claim.diagnosis_code),'') is null) or (required='service_date' and claim.service_date is null) then errors:=errors||jsonb_build_array(required); end if;
   end loop;
  end if;
  if claim.id is null then raise exception 'Claim % was not found.',claim_key; end if;
  insert into public.claim_batch_items(batch_id,claim_id,validation_errors) values(batch,claim.id,errors);
  update public.insurance_claims set batch_id=batch where id=claim.id;
 end loop;
 return batch;
end $$;

create or replace function public.sync_claim_batch_status() returns trigger language plpgsql security definer set search_path=public as $$
declare target_batch uuid;
begin
 target_batch:=coalesce(new.batch_id,old.batch_id);
 if target_batch is not null then
  update public.claim_batches b set status=case
   when not exists(select 1 from public.claim_batch_items i join public.insurance_claims c on c.id=i.claim_id where i.batch_id=target_batch and c.status not in ('adjudicated','approved','paid','denied','rejected')) then 'completed'
   when exists(select 1 from public.claim_batch_items i join public.insurance_claims c on c.id=i.claim_id where i.batch_id=target_batch and c.status in ('adjudicated','approved','paid','denied','rejected')) then 'partial'
   else 'submitted' end where b.id=target_batch and b.status in ('submitted','partial','completed');
 end if;
 return new;
end $$;
drop trigger if exists insurance_claim_batch_status on public.insurance_claims;
create trigger insurance_claim_batch_status after update of status on public.insurance_claims for each row when (old.status is distinct from new.status) execute function public.sync_claim_batch_status();

create or replace function public.submit_claim_batch(p_batch_id uuid,p_connection_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare b public.claim_batches%rowtype; item record; n integer:=0;
begin
 select * into b from public.claim_batches where id=p_batch_id for update;
 if b.id is null or b.status<>'draft' or not (public.has_any_role(array['super_admin']) or public.has_org_permission('insurance.submit',b.facility_id,null)) then raise exception 'Claim batch is not available for submission.'; end if;
 if exists(select 1 from public.claim_batch_items where batch_id=b.id and validation_errors<>'[]'::jsonb) then raise exception 'Claim batch validation failed; review the validation errors before submission.'; end if;
 if not exists(select 1 from public.integration_connections c join public.payer_plans p on p.facility_id=c.facility_id where c.id=p_connection_id and c.facility_id=b.facility_id and c.integration_type='payer' and c.status='active' and p.id=b.payer_plan_id and c.provider_code=p.payer_code) then raise exception 'Payer connection does not match this facility and plan.'; end if;
 for item in select claim_id from public.claim_batch_items where batch_id=b.id loop perform public.submit_insurance_claim(item.claim_id,p_connection_id); n:=n+1; end loop;
 update public.claim_batches set status='submitted',submitted_at=now() where id=b.id; return n;
end $$;

create or replace function public.resubmit_denied_claim(p_claim_id uuid,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path=public as $$
declare old public.insurance_claims%rowtype; actor uuid; fresh uuid;
begin
 select * into old from public.insurance_claims where id=p_claim_id; select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if old.id is null or old.status not in ('denied','rejected') or nullif(btrim(old.denial_reason),'') is null or actor is null or not public.has_finance_department_permission(old.patient_id,'insurance.submit') or length(btrim(p_idempotency_key))<8 then raise exception 'Only an authorized user may resubmit a denied claim with a recorded denial reason.'; end if;
 insert into public.insurance_claims(patient_id,claim_number,provider,amount_claimed,amount_approved,status,billing_id,membership_id,idempotency_key,diagnosis_code,service_date,resubmission_of_id,facility_id)
 values(old.patient_id,old.claim_number||'-R'||(select count(*)+1 from public.insurance_claims where resubmission_of_id=old.id),old.provider,old.amount_claimed,0,'pending',old.billing_id,old.membership_id,btrim(p_idempotency_key),old.diagnosis_code,old.service_date,old.id,old.facility_id) returning id into fresh;
 return fresh;
end $$;

-- Normalized payer responses preserve the existing signed webhook/inbox contract.
create or replace function public.process_payer_workflow_event(p_connection_id uuid,p_event_id text,p_event_type text,payload jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare inbox uuid; check_id uuid; preauth uuid;
begin
 if auth.role()<>'service_role' then raise exception 'service_role required'; end if;
 if p_event_id is null or length(p_event_id)<1 or length(p_event_id)>200 or jsonb_typeof(payload)<>'object' then raise exception 'Invalid normalized payer workflow event'; end if;
 if p_event_type not in ('payer.eligibility.result','payer.preauthorization.updated','payer.claim.denied') then raise exception 'Unsupported payer workflow event'; end if;
 insert into public.integration_inbox(connection_id,external_event_id,event_type,payload) values(p_connection_id,p_event_id,p_event_type,coalesce(payload,'{}'::jsonb)) on conflict(connection_id,external_event_id) do nothing returning id into inbox;
 if inbox is null then return; end if;
 if p_event_type='payer.eligibility.result' then
  check_id:=(payload->>'eligibility_check_id')::uuid;
  update public.insurance_eligibility_checks set status=payload->>'status',response=coalesce(payload->'response','{}'::jsonb),reference=left(payload->>'reference',200),checked_at=now(),expires_at=coalesce((payload->>'expires_at')::timestamptz,now()+interval '24 hours'),updated_at=now()
   where id=check_id and connection_id=p_connection_id and status='pending' and expires_at>now() and payload->>'status' in ('eligible','ineligible','authorization_required');
  if not found then raise exception 'Eligibility response does not match a pending request'; end if;
 elsif p_event_type='payer.preauthorization.updated' then
  preauth:=(payload->>'preauthorization_id')::uuid;
  perform set_config('app.payer_workflow_writer','on',true);
  update public.preauthorization_requests set status=payload->>'status',response=coalesce(payload->'response','{}'::jsonb),external_reference=left(payload->>'external_reference',200),denial_reason=left(payload->>'denial_reason',1000),expires_at=(payload->>'expires_at')::timestamptz,updated_at=now()
   where id=preauth and connection_id=p_connection_id and status in ('queued','submitted') and payload->>'status' in ('approved','denied','more_information','expired');
  if not found then raise exception 'Pre-authorization response does not match an open request'; end if;
 else
  if nullif(btrim(payload->>'denial_reason'),'') is null then raise exception 'A payer denial reason is required.'; end if;
  perform set_config('onemed.integration_writer','yes',true);
  update public.insurance_claims set status='denied',denial_reason=left(btrim(payload->>'denial_reason'),1000),adjudicated_at=now(),updated_at=now()
   where id=(payload->>'claim_id')::uuid and provider=(select provider_code from public.integration_connections where id=p_connection_id and integration_type='payer') and status in ('queued','submitted','accepted');
  if not found then raise exception 'Claim denial does not match an open claim for this payer.'; end if;
 end if;
 update public.integration_inbox set processed_at=now() where id=inbox;
end $$;

-- Add eligibility/pre-authorization routes to the existing provider-neutral outbox.
create or replace function public.payer_workflow_event_guard() returns trigger language plpgsql as $$
begin
 if tg_table_name='preauthorization_requests' and old.status is distinct from new.status and current_setting('app.payer_workflow_writer',true) is distinct from 'on' then raise exception 'Pre-authorization status changes require the workflow.'; end if;
 return new;
end $$;
drop trigger if exists preauthorization_status_guard on public.preauthorization_requests;
create trigger preauthorization_status_guard before update on public.preauthorization_requests for each row execute function public.payer_workflow_event_guard();
create or replace function public.sync_payer_outbox_delivery() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.status='delivered' and old.status is distinct from new.status and new.event_type='payer.preauthorization.request' then
  perform set_config('app.payer_workflow_writer','on',true);
  update public.preauthorization_requests set status='submitted',updated_at=now() where id=new.aggregate_id and status='queued';
 end if;
 return new;
end $$;
drop trigger if exists payer_outbox_delivery on public.integration_outbox;
create trigger payer_outbox_delivery after update of status on public.integration_outbox for each row execute function public.sync_payer_outbox_delivery();

do $$ declare t text; begin foreach t in array array['payer_plans','claim_batches','claim_batch_items'] loop
 execute format('alter table public.%I enable row level security',t); execute format('revoke all on public.%I from public,anon,authenticated',t); execute format('grant select on public.%I to authenticated',t); execute format('grant select,insert,update on public.%I to service_role',t);
 if t='payer_plans' then
  execute format('drop policy if exists payer_config_read on public.%I',t);
  execute format('create policy payer_config_read on public.%I for select to authenticated using (public.has_any_role(array[''super_admin'']) or public.has_org_permission(''insurance.submit'',facility_id,null))',t);
 elsif t='claim_batches' then
  execute format('drop policy if exists payer_batch_read on public.%I',t);
  execute format('create policy payer_batch_read on public.%I for select to authenticated using (public.has_any_role(array[''super_admin'']) or public.has_org_permission(''insurance.submit'',facility_id,null))',t);
 else
  execute format('drop policy if exists payer_child_read on public.%I',t);
  execute format('create policy payer_child_read on public.%I for select to authenticated using (exists(select 1 from public.claim_batches b where b.id=%I.batch_id and (public.has_any_role(array[''super_admin'']) or public.has_org_permission(''insurance.submit'',b.facility_id,null))))',t,t);
 end if;
 execute format('drop trigger if exists audit_%I on public.%I',t,t);
 execute format('create trigger audit_%I after insert or update or delete on public.%I for each row execute function public.audit_row_change()',t,t);
 end loop; end $$;
alter table public.preauthorization_requests enable row level security;
revoke all on public.preauthorization_requests from public,anon,authenticated;
grant select on public.preauthorization_requests to authenticated;
grant select,insert,update on public.preauthorization_requests to service_role;
drop policy if exists preauthorization_read on public.preauthorization_requests;
create policy preauthorization_read on public.preauthorization_requests for select to authenticated using (public.can_access_financial_record(facility_id,patient_id,'insurance.submit',false));
drop trigger if exists audit_preauthorization_requests on public.preauthorization_requests;
create trigger audit_preauthorization_requests after insert or update or delete on public.preauthorization_requests for each row execute function public.audit_row_change();
revoke all on function public.configure_payer_plan(uuid,text,text,text,text[]),public.request_payer_eligibility(uuid,text,uuid,uuid),public.request_preauthorization(uuid,text,numeric,jsonb,uuid,uuid),public.create_claim_batch(uuid,uuid[]),public.submit_claim_batch(uuid,uuid),public.resubmit_denied_claim(uuid,text),public.process_payer_workflow_event(uuid,text,text,jsonb),public.sync_claim_batch_status(),public.sync_payer_outbox_delivery() from public,anon,authenticated;
grant execute on function public.configure_payer_plan(uuid,text,text,text,text[]),public.request_payer_eligibility(uuid,text,uuid,uuid),public.request_preauthorization(uuid,text,numeric,jsonb,uuid,uuid),public.create_claim_batch(uuid,uuid[]),public.submit_claim_batch(uuid,uuid),public.resubmit_denied_claim(uuid,text) to authenticated;
grant execute on function public.process_payer_workflow_event(uuid,text,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
