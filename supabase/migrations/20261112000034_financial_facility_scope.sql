-- Facility ownership for patient billing and downstream financial records.
-- Unassigned legacy patients remain facility NULL and Super Admin only.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

alter table public.billing add column if not exists facility_id uuid;
alter table public.insurance_claims add column if not exists facility_id uuid;
alter table public.payment_submissions add column if not exists facility_id uuid;
alter table public.payment_postings add column if not exists facility_id uuid;
alter table public.payment_provider_transactions add column if not exists facility_id uuid;
alter table public.refund_requests add column if not exists facility_id uuid;
alter table public.refund_requests add column if not exists patient_id uuid;
alter table public.payment_reversals add column if not exists facility_id uuid;
alter table public.payment_reversals add column if not exists patient_id uuid;
alter table public.payment_disputes add column if not exists facility_id uuid;
alter table public.payment_disputes add column if not exists patient_id uuid;
alter table public.payment_dispute_history add column if not exists facility_id uuid;
alter table public.payment_dispute_history add column if not exists patient_id uuid;
alter table public.payment_dispute_thresholds add column if not exists facility_id uuid;
alter table public.payment_dispute_alerts add column if not exists facility_id uuid;
alter table public.payer_remittances add column if not exists facility_id uuid;
alter table public.payer_remittances add column if not exists patient_id uuid;

update public.billing b set facility_id=p.home_facility_id from public.patients p where p.id=b.patient_id;
update public.insurance_claims c set facility_id=p.home_facility_id from public.patients p where p.id=c.patient_id;
update public.payment_submissions s set facility_id=p.home_facility_id from public.patients p where p.id=s.patient_id;
update public.payment_postings s set facility_id=p.home_facility_id from public.patients p where p.id=s.patient_id;
update public.payment_provider_transactions s set facility_id=p.home_facility_id from public.patients p where p.id=s.patient_id;
update public.refund_requests r set patient_id=p.patient_id,facility_id=p.facility_id from public.payment_postings p where p.id=r.payment_posting_id;
update public.payment_reversals r set patient_id=p.patient_id,facility_id=p.facility_id from public.payment_postings p where p.id=r.payment_posting_id;
update public.payment_disputes d set patient_id=t.patient_id,facility_id=t.facility_id from public.payment_provider_transactions t where t.id=d.transaction_id;
update public.payment_dispute_history h set patient_id=t.patient_id,facility_id=t.facility_id
  from public.payment_disputes d join public.payment_provider_transactions t on t.id=d.transaction_id where d.id=h.dispute_id;
update public.payment_dispute_thresholds d set facility_id=c.facility_id from public.integration_connections c where c.id=d.connection_id;
update public.payment_dispute_alerts d set facility_id=c.facility_id from public.integration_connections c where c.id=d.connection_id;
update public.payer_remittances r set patient_id=c.patient_id,facility_id=c.facility_id from public.insurance_claims c where c.id=r.claim_id;

-- Nullable NOT VALID foreign keys preserve legitimate NULL facility assignments;
-- validation rejects bad facility IDs after the backfill has completed.
do $$
declare t text; c text;
begin
  foreach t in array array['billing','insurance_claims','payment_submissions','payment_postings','payment_provider_transactions',
    'refund_requests','payment_reversals','payment_disputes','payment_dispute_history','payment_dispute_thresholds','payment_dispute_alerts','payer_remittances'] loop
    c:=t||'_facility_id_fkey';
    if not exists(select 1 from pg_constraint where conrelid=format('public.%I',t)::regclass and conname=c) then
      execute format('alter table public.%I add constraint %I foreign key(facility_id) references public.facilities(id) on delete restrict not valid',t,c);
    end if;
    execute format('alter table public.%I validate constraint %I',t,c);
  end loop;
  foreach t in array array['refund_requests','payment_reversals','payment_disputes','payment_dispute_history','payer_remittances'] loop
    c:=t||'_patient_id_fkey';
    if not exists(select 1 from pg_constraint where conrelid=format('public.%I',t)::regclass and conname=c) then
      execute format('alter table public.%I add constraint %I foreign key(patient_id) references public.patients(id) on delete restrict not valid',t,c);
    end if;
    execute format('alter table public.%I validate constraint %I',t,c);
  end loop;
end $$;

create or replace function public.set_financial_scope_from_patient()
returns trigger language plpgsql security definer set search_path=public as $$
declare target_patient uuid; target_facility uuid;
begin
  target_patient:=nullif(to_jsonb(new)->>tg_argv[0],'')::uuid;
  if target_patient is null then
    new:=jsonb_populate_record(new,jsonb_build_object('facility_id',null));
    return new;
  end if;
  select home_facility_id into target_facility from public.patients where id=target_patient;
  if not found then raise exception 'Financial record patient does not exist.'; end if;
  new:=jsonb_populate_record(new,jsonb_build_object('facility_id',target_facility));
  return new;
end $$;
revoke all on function public.set_financial_scope_from_patient() from public,anon,authenticated;

create or replace function public.set_financial_scope_from_parent()
returns trigger language plpgsql security definer set search_path=public as $$
declare parent_id uuid; target_patient uuid; target_facility uuid;
begin
  case tg_table_name
    when 'refund_requests' then
      parent_id:=(to_jsonb(new)->>'payment_posting_id')::uuid;
      select patient_id,facility_id into target_patient,target_facility from public.payment_postings where id=parent_id;
    when 'payment_reversals' then
      parent_id:=(to_jsonb(new)->>'payment_posting_id')::uuid;
      select patient_id,facility_id into target_patient,target_facility from public.payment_postings where id=parent_id;
    when 'payment_disputes' then
      parent_id:=(to_jsonb(new)->>'transaction_id')::uuid;
      select patient_id,facility_id into target_patient,target_facility from public.payment_provider_transactions where id=parent_id;
    when 'payment_dispute_history' then
      parent_id:=(to_jsonb(new)->>'dispute_id')::uuid;
      select t.patient_id,t.facility_id into target_patient,target_facility from public.payment_disputes d
        join public.payment_provider_transactions t on t.id=d.transaction_id where d.id=parent_id;
    when 'payer_remittances' then
      parent_id:=(to_jsonb(new)->>'claim_id')::uuid;
      select patient_id,facility_id into target_patient,target_facility from public.insurance_claims where id=parent_id;
    when 'payment_dispute_thresholds' then
      parent_id:=(to_jsonb(new)->>'connection_id')::uuid;
      select facility_id into target_facility from public.integration_connections where id=parent_id;
    when 'payment_dispute_alerts' then
      parent_id:=(to_jsonb(new)->>'connection_id')::uuid;
      select facility_id into target_facility from public.integration_connections where id=parent_id;
    else raise exception 'Unsupported financial scope relation.';
  end case;
  if not found then raise exception 'Financial parent record does not exist.'; end if;
  new:=jsonb_populate_record(new,jsonb_build_object('patient_id',target_patient,'facility_id',target_facility));
  return new;
end $$;
revoke all on function public.set_financial_scope_from_parent() from public,anon,authenticated;

do $$
declare t text;
begin
  foreach t in array array['billing','insurance_claims','payment_submissions','payment_postings','payment_provider_transactions'] loop
    execute format('drop trigger if exists derive_financial_facility on public.%I',t);
    execute format('create trigger derive_financial_facility before insert or update of patient_id,facility_id on public.%I for each row execute function public.set_financial_scope_from_patient(''patient_id'')',t);
  end loop;
  foreach t in array array['refund_requests','payment_reversals','payment_disputes','payment_dispute_history','payer_remittances','payment_dispute_thresholds','payment_dispute_alerts'] loop
    execute format('drop trigger if exists derive_financial_facility on public.%I',t);
    execute format('create trigger derive_financial_facility before insert or update on public.%I for each row execute function public.set_financial_scope_from_parent()',t);
  end loop;
end $$;

create or replace function public.can_access_financial_record(target_facility uuid,target_patient uuid,permission_key text,allow_patient boolean)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare actor_role text; actor_patient uuid;
begin
  if public.has_any_role(array['super_admin']) then return true; end if;
  select role::text,patient_id into actor_role,actor_patient from public.profiles
  where auth_user_id=auth.uid() and status::text='active' limit 1;
  if actor_role is null then return false; end if;
  if target_facility is null then return false; end if;
  if actor_role='patient' then return allow_patient and target_patient is not null and actor_patient=target_patient; end if;
  if permission_key in ('payment.record','payment.approve') then
    return public.has_org_permission('payment.record',target_facility,null)
      or public.has_org_permission('payment.approve',target_facility,null);
  end if;
  if permission_key in ('insurance.submit','insurance.remittance.review') then
    return public.has_org_permission('insurance.submit',target_facility,null)
      or public.has_org_permission('insurance.remittance.review',target_facility,null)
      or public.has_org_permission('insurance.adjudicate',target_facility,null);
  end if;
  return public.has_org_permission(permission_key,target_facility,null);
end $$;
revoke all on function public.can_access_financial_record(uuid,uuid,text,boolean) from public,anon;
grant execute on function public.can_access_financial_record(uuid,uuid,text,boolean) to authenticated;

-- Existing restrictive read policies also need the patient self-read path;
-- PostgreSQL ANDs restrictive policies, so a new policy alone cannot override them.
drop policy if exists "department finance read payment submissions" on public.payment_submissions;
create policy "department finance read payment submissions" on public.payment_submissions as restrictive for select to authenticated using (
  public.can_access_financial_record(facility_id,patient_id,'payment.record',true)
  or submitted_by=(select id from public.profiles where auth_user_id=auth.uid() and status::text='active' limit 1)
);
drop policy if exists "department finance read insurance claims" on public.insurance_claims;
create policy "department finance read insurance claims" on public.insurance_claims as restrictive for select to authenticated using (
  public.can_access_financial_record(facility_id,patient_id,'insurance.submit',true)
);
drop policy if exists "patient reads own provider transactions" on public.payment_provider_transactions;
create policy "patient reads own provider transactions" on public.payment_provider_transactions for select to authenticated using (
  public.can_access_financial_record(facility_id,patient_id,'payment.record',true)
);
drop policy if exists "patient reads own payment disputes" on public.payment_disputes;
create policy "patient reads own payment disputes" on public.payment_disputes for select to authenticated using (
  public.can_access_financial_record(facility_id,patient_id,'payment.approve',true)
);
drop policy if exists "patient reads own payment dispute history" on public.payment_dispute_history;
create policy "patient reads own payment dispute history" on public.payment_dispute_history for select to authenticated using (
  public.can_access_financial_record(facility_id,patient_id,'payment.approve',true)
);
drop policy if exists "patient reads own payer remittances" on public.payer_remittances;
create policy "patient reads own payer remittances" on public.payer_remittances for select to authenticated using (
  public.can_access_financial_record(facility_id,patient_id,'insurance.remittance.review',true)
);

do $$
declare t text; permission_key text;
begin
  foreach t in array array['billing','payment_submissions','payment_postings','payment_provider_transactions',
    'refund_requests','payment_reversals','insurance_claims','payer_remittances','payment_disputes','payment_dispute_history'] loop
    permission_key:=case t when 'insurance_claims' then 'insurance.submit'
      when 'payer_remittances' then 'insurance.remittance.review'
      when 'payment_reversals' then 'refund.approve'
      when 'payment_disputes' then 'payment.approve'
      when 'payment_dispute_history' then 'payment.approve'
      else 'payment.record' end;
    execute format('drop policy if exists %I on public.%I','financial facility select scope',t);
    execute format('create policy %I on public.%I as restrictive for select to authenticated using (public.can_access_financial_record(facility_id,patient_id,%L,true))',
      'financial facility select scope',t,permission_key);
    execute format('drop policy if exists %I on public.%I','financial facility insert scope',t);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (public.can_access_financial_record(facility_id,patient_id,%L,false))',
      'financial facility insert scope',t,permission_key);
    execute format('drop policy if exists %I on public.%I','financial facility update scope',t);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using (public.can_access_financial_record(facility_id,patient_id,%L,false)) with check (public.can_access_financial_record(facility_id,patient_id,%L,false))',
      'financial facility update scope',t,permission_key,permission_key);
    execute format('drop policy if exists %I on public.%I','financial facility delete scope',t);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using (public.has_any_role(array[''super_admin'']))',
      'financial facility delete scope',t);
  end loop;

  foreach t in array array['payment_dispute_thresholds','payment_dispute_alerts'] loop
    execute format('drop policy if exists %I on public.%I','financial facility select scope',t);
    execute format('create policy %I on public.%I as restrictive for select to authenticated using (public.has_any_role(array[''super_admin'']) or (facility_id is not null and public.has_org_permission(''integration.manage'',facility_id,null)))',
      'financial facility select scope',t);
    execute format('drop policy if exists %I on public.%I','financial facility insert scope',t);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (facility_id is not null and public.has_org_permission(''integration.manage'',facility_id,null))',
      'financial facility insert scope',t);
    execute format('drop policy if exists %I on public.%I','financial facility update scope',t);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using (facility_id is not null and public.has_org_permission(''integration.manage'',facility_id,null)) with check (facility_id is not null and public.has_org_permission(''integration.manage'',facility_id,null))',
      'financial facility update scope',t);
    execute format('drop policy if exists %I on public.%I','financial facility delete scope',t);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using (public.has_any_role(array[''super_admin'']))',
      'financial facility delete scope',t);
  end loop;
end $$;

create index if not exists billing_facility_created_idx on public.billing(facility_id,created_at desc);
create index if not exists insurance_claims_facility_created_idx on public.insurance_claims(facility_id,created_at desc);
create index if not exists payment_submissions_facility_created_idx on public.payment_submissions(facility_id,created_at desc);
create index if not exists payment_postings_facility_recorded_idx on public.payment_postings(facility_id,recorded_at desc);
create index if not exists payment_provider_transactions_facility_created_idx on public.payment_provider_transactions(facility_id,created_at desc);
create index if not exists refund_requests_facility_created_idx on public.refund_requests(facility_id,created_at desc);
create index if not exists payment_reversals_facility_posted_idx on public.payment_reversals(facility_id,posted_at desc);
create index if not exists payment_disputes_facility_created_idx on public.payment_disputes(facility_id,created_at desc);
create index if not exists payer_remittances_facility_received_idx on public.payer_remittances(facility_id,received_at desc);

commit;
notify pgrst,'reload schema';
