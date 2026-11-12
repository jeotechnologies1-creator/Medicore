-- Provider-neutral payer/payment adapters, a durable outbox/inbox, and a
-- balanced internal general ledger. Credentials and URLs stay in Edge secrets.
-- Apply after clinical_department_rls.sql.

insert into public.permission_catalog(permission_key,description,sensitive) values
  ('insurance.submit','Submit payer claims',true),('insurance.adjudicate','Review payer claims',true),
  ('insurance.remittance.review','Reconcile payer remittances',true),('payment.checkout','Create external payment intents',true),
  ('ledger.read','Read the general ledger',true),('integration.manage','Manage external integration connections',true)
on conflict(permission_key) do update set description=excluded.description,sensitive=excluded.sensitive;
insert into public.role_permission_grants(role,permission_key,scope) values
  ('accountant','insurance.submit','facility'),('accountant','insurance.adjudicate','facility'),
  ('accountant','insurance.remittance.review','facility'),('receptionist','payment.checkout','facility'),
  ('accountant','payment.checkout','facility'),('accountant','ledger.read','facility'),
  ('accountant','integration.manage','facility')
on conflict do nothing;

create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete restrict,
  integration_type text not null check(integration_type in ('payer','payment_gateway','general_ledger')),
  provider_code text not null check(provider_code ~ '^[a-z0-9][a-z0-9_-]{1,49}$'),
  status text not null default 'disabled' check(status in ('active','disabled')),
  config jsonb not null default '{}'::jsonb check(jsonb_typeof(config)='object'),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(facility_id,integration_type,provider_code)
);

create table if not exists public.integration_outbox (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.integration_connections(id) on delete restrict,
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  idempotency_key text not null,
  payload jsonb not null check(jsonb_typeof(payload)='object'),
  status text not null default 'queued' check(status in ('queued','processing','retry','delivered','dead')),
  attempts integer not null default 0 check(attempts>=0),
  available_at timestamptz not null default now(),
  locked_until timestamptz,
  response jsonb,
  external_reference text,
  last_error text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  unique(connection_id,idempotency_key)
);
create index if not exists integration_outbox_dispatch_idx on public.integration_outbox(status,available_at,created_at);

create table if not exists public.integration_inbox (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.integration_connections(id) on delete restrict,
  external_event_id text not null,
  event_type text not null,
  payload jsonb not null check(jsonb_typeof(payload)='object'),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique(connection_id,external_event_id)
);

create table if not exists public.payment_provider_transactions (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.integration_connections(id) on delete restrict,
  billing_id uuid not null references public.billing(id) on delete restrict,
  patient_id uuid not null references public.patients(id) on delete restrict,
  amount numeric(12,2) not null check(amount>0),
  currency text not null default 'NGN' check(currency ~ '^[A-Z]{3}$'),
  idempotency_key text not null,
  external_reference text,
  checkout_url text,
  status text not null default 'creating' check(status in ('creating','pending','succeeded','failed','review_pending','posted')),
  created_by uuid not null references public.profiles(id),
  payment_submission_id uuid references public.payment_submissions(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  succeeded_at timestamptz,
  unique(connection_id,idempotency_key)
);

create or replace function public.sync_provider_transaction_review() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status in ('approved','rejected') and old.status='pending' then
    update public.payment_provider_transactions set status=case when new.status='approved' then 'posted' else 'failed' end,updated_at=now()
    where payment_submission_id=new.id;
  end if;
  return new;
end $$;
drop trigger if exists sync_provider_transaction_review on public.payment_submissions;
create trigger sync_provider_transaction_review after update of status on public.payment_submissions for each row execute function public.sync_provider_transaction_review();

create table if not exists public.general_ledger_accounts (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete restrict,
  account_code text not null,
  account_name text not null,
  account_type text not null check(account_type in ('asset','liability','equity','revenue','expense')),
  status text not null default 'active' check(status in ('active','inactive')),
  created_at timestamptz not null default now(),
  unique(facility_id,account_code)
);
create table if not exists public.ledger_posting_rules (
  facility_id uuid not null references public.facilities(id) on delete restrict,
  event_type text not null,
  debit_account_code text not null,
  credit_account_code text not null,
  primary key(facility_id,event_type)
);
create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete restrict,
  source_type text not null,
  source_id uuid not null,
  event_type text not null,
  memo text not null,
  amount numeric(12,2) not null check(amount>0),
  status text not null default 'posted' check(status='posted'),
  posted_by uuid references public.profiles(id),
  posted_at timestamptz not null default now(),
  unique(source_type,source_id,event_type)
);
create table if not exists public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references public.journal_entries(id) on delete restrict,
  account_id uuid not null references public.general_ledger_accounts(id) on delete restrict,
  debit numeric(12,2) not null default 0 check(debit>=0),
  credit numeric(12,2) not null default 0 check(credit>=0),
  check((debit>0 and credit=0) or (credit>0 and debit=0))
);
create index if not exists journal_lines_account_idx on public.journal_lines(account_id,journal_entry_id);

create table if not exists public.payer_remittances (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.integration_connections(id) on delete restrict,
  claim_id uuid not null references public.insurance_claims(id) on delete restrict,
  invoice_id uuid not null references public.billing(id) on delete restrict,
  external_event_id text not null,
  amount numeric(12,2) not null check(amount>0),
  status text not null default 'pending_review' check(status in ('pending_review','posted','rejected')),
  received_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  unique(connection_id,external_event_id)
);

create or replace function public.guard_claim_payer_fields() returns trigger language plpgsql as $$
begin
  if (new.status is distinct from old.status or new.amount_approved is distinct from old.amount_approved
      or new.external_claim_id is distinct from old.external_claim_id or new.submitted_at is distinct from old.submitted_at
      or new.adjudicated_at is distinct from old.adjudicated_at)
     and current_setting('onemed.integration_writer',true) is distinct from 'yes'
     and auth.role() is distinct from 'service_role' then
    raise exception 'Payer claim state can only be changed by the claim or remittance workflow';
  end if;
  return new;
end $$;
drop trigger if exists guard_claim_payer_fields on public.insurance_claims;
create trigger guard_claim_payer_fields before update on public.insurance_claims for each row execute function public.guard_claim_payer_fields();

alter table public.integration_connections enable row level security;
alter table public.integration_outbox enable row level security;
alter table public.integration_inbox enable row level security;
alter table public.payment_provider_transactions enable row level security;
alter table public.general_ledger_accounts enable row level security;
alter table public.ledger_posting_rules enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_lines enable row level security;
alter table public.payer_remittances enable row level security;
revoke all on public.integration_connections,public.integration_outbox,public.integration_inbox,public.payment_provider_transactions,
  public.general_ledger_accounts,public.ledger_posting_rules,public.journal_entries,public.journal_lines,public.payer_remittances from anon,authenticated;
grant select on public.payment_provider_transactions,public.general_ledger_accounts,
  public.journal_entries,public.journal_lines,public.payer_remittances to authenticated;
revoke select on public.integration_connections from authenticated;
grant select(id,facility_id,integration_type,provider_code,status,created_at,updated_at) on public.integration_connections to authenticated;
grant all on public.integration_connections,public.integration_outbox,public.integration_inbox,public.payment_provider_transactions,
  public.general_ledger_accounts,public.ledger_posting_rules,public.journal_entries,public.journal_lines,public.payer_remittances to service_role;
drop policy if exists "finance read integration connections" on public.integration_connections;
create policy "finance read integration connections" on public.integration_connections for select using (
  public.has_any_role(array['super_admin']) or public.has_org_permission('integration.manage',facility_id,null)
  or exists(select 1 from public.patients p where p.home_facility_id=facility_id
    and (public.has_finance_department_permission(p.id,'payment.record') or public.has_finance_department_permission(p.id,'insurance.submit')))
);
drop policy if exists "finance read provider transactions" on public.payment_provider_transactions;
create policy "finance read provider transactions" on public.payment_provider_transactions for select using (
  public.has_finance_department_permission(patient_id,'payment.record') or public.has_finance_department_permission(patient_id,'payment.approve')
);
drop policy if exists "finance read ledger accounts" on public.general_ledger_accounts;
create policy "finance read ledger accounts" on public.general_ledger_accounts for select using (
  public.has_org_permission('ledger.read',facility_id,null)
);
drop policy if exists "finance read ledger rules" on public.ledger_posting_rules;
create policy "finance read ledger rules" on public.ledger_posting_rules for select using (
  public.has_org_permission('ledger.read',facility_id,null)
);
drop policy if exists "finance read ledger entries" on public.journal_entries;
create policy "finance read ledger entries" on public.journal_entries for select using (
  public.has_org_permission('ledger.read',facility_id,null)
);
drop policy if exists "finance read ledger lines" on public.journal_lines;
create policy "finance read ledger lines" on public.journal_lines for select using (
  exists(select 1 from public.journal_entries entry where entry.id=journal_entry_id and public.has_org_permission('ledger.read',entry.facility_id,null))
);
drop policy if exists "finance read payer remittances" on public.payer_remittances;
create policy "finance read payer remittances" on public.payer_remittances for select using (
  exists(select 1 from public.insurance_claims claim where claim.id=claim_id and public.has_finance_department_permission(claim.patient_id,'insurance.remittance.review'))
);
drop policy if exists "department finance read insurance claims" on public.insurance_claims;
create policy "department finance read insurance claims" on public.insurance_claims as restrictive for select to authenticated using (
  public.has_finance_department_permission(patient_id,'insurance.submit') or public.has_finance_department_permission(patient_id,'insurance.remittance.review')
);
drop policy if exists "department finance insert insurance claims" on public.insurance_claims;
create policy "department finance insert insurance claims" on public.insurance_claims as restrictive for insert to authenticated with check (
  public.has_finance_department_permission(patient_id,'insurance.submit')
);
drop policy if exists "department finance update insurance claims" on public.insurance_claims;
create policy "department finance update insurance claims" on public.insurance_claims as restrictive for update to authenticated
  using (public.has_finance_department_permission(patient_id,'insurance.submit') or public.has_finance_department_permission(patient_id,'insurance.adjudicate'))
  with check (public.has_finance_department_permission(patient_id,'insurance.submit') or public.has_finance_department_permission(patient_id,'insurance.adjudicate'));
drop policy if exists "department finance delete insurance claims" on public.insurance_claims;
create policy "department finance delete insurance claims" on public.insurance_claims as restrictive for delete to authenticated using (false);
drop policy if exists "department finance read insurance memberships" on public.insurance_memberships;
create policy "department finance read insurance memberships" on public.insurance_memberships as restrictive for select to authenticated using (
  public.has_finance_department_permission(patient_id,'insurance.submit')
);
drop policy if exists "department finance write insurance memberships" on public.insurance_memberships;
create policy "department finance write insurance memberships" on public.insurance_memberships as restrictive for all to authenticated
  using (public.has_finance_department_permission(patient_id,'insurance.submit')) with check (public.has_finance_department_permission(patient_id,'insurance.submit'));

-- Create a default chart and posting rules when a facility is provisioned.
create or replace function public.seed_facility_ledger_for_facility(target_facility uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  insert into public.general_ledger_accounts(facility_id,account_code,account_name,account_type) values
    (target_facility,'1000','Cash and gateway clearing','asset'),(target_facility,'1100','Patient accounts receivable','asset'),
    (target_facility,'1200','Payer accounts receivable','asset'),(target_facility,'4000','Clinical service revenue','revenue')
  on conflict(facility_id,account_code) do nothing;
  insert into public.ledger_posting_rules(facility_id,event_type,debit_account_code,credit_account_code) values
    (target_facility,'invoice.issued','1100','4000'),(target_facility,'payment.posted','1000','1100'),
    (target_facility,'payment.refunded','1100','1000'),(target_facility,'claim.adjudicated','1200','1100'),
    (target_facility,'payer.remittance','1000','1200')
  on conflict(facility_id,event_type) do nothing;
end;
$$;
create or replace function public.seed_facility_ledger() returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.seed_facility_ledger_for_facility(new.id);
  return new;
end;
$$;
drop trigger if exists seed_facility_ledger on public.facilities;
create trigger seed_facility_ledger after insert on public.facilities for each row execute function public.seed_facility_ledger();
do $$ declare facility_row record; begin
  for facility_row in select id from public.facilities loop
    perform public.seed_facility_ledger_for_facility(facility_row.id);
  end loop;
end $$;

-- Append-only, balanced journals are created once per source event.
create or replace function public.enqueue_integration_event(p_connection uuid,p_event_type text,p_aggregate_type text,p_aggregate_id uuid,p_idempotency_key text,p_payload jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare saved_id uuid;
begin
  insert into public.integration_outbox(connection_id,event_type,aggregate_type,aggregate_id,idempotency_key,payload)
  values(p_connection,p_event_type,p_aggregate_type,p_aggregate_id,p_idempotency_key,p_payload)
  on conflict(connection_id,idempotency_key) do update set idempotency_key=excluded.idempotency_key returning id into saved_id;
  return saved_id;
end $$;

create or replace function public.post_general_ledger_entry(p_facility uuid,p_source_type text,p_source_id uuid,p_event_type text,p_amount numeric,p_memo text,p_actor uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare rule_row public.ledger_posting_rules%rowtype; debit_id uuid; credit_id uuid; entry_id uuid; gl_connection uuid; gl_payload jsonb;
begin
  if p_amount is null or p_amount<=0 then return null; end if;
  select * into rule_row from public.ledger_posting_rules where facility_id=p_facility and event_type=p_event_type;
  if not found then raise exception 'No ledger posting rule for facility/event %',p_event_type; end if;
  select id into debit_id from public.general_ledger_accounts where facility_id=p_facility and account_code=rule_row.debit_account_code and status='active';
  select id into credit_id from public.general_ledger_accounts where facility_id=p_facility and account_code=rule_row.credit_account_code and status='active';
  if debit_id is null or credit_id is null then raise exception 'Ledger posting rule references a missing or inactive account'; end if;
  insert into public.journal_entries(facility_id,source_type,source_id,event_type,memo,amount,posted_by)
  values(p_facility,p_source_type,p_source_id,p_event_type,left(coalesce(p_memo,p_event_type),240),p_amount,p_actor)
  on conflict(source_type,source_id,event_type) do nothing returning id into entry_id;
  if entry_id is null then select id into entry_id from public.journal_entries where source_type=p_source_type and source_id=p_source_id and event_type=p_event_type; return entry_id; end if;
  insert into public.journal_lines(journal_entry_id,account_id,debit,credit) values
    (entry_id,debit_id,p_amount,0),(entry_id,credit_id,0,p_amount);
  if exists(select 1 from public.integration_connections where facility_id=p_facility and integration_type='general_ledger' and status='active') then
    select jsonb_build_object('journal_entry_id',entry_id,'facility_code',f.code,'event_type',p_event_type,'memo',left(coalesce(p_memo,p_event_type),240),
      'amount',p_amount,'currency','NGN','posted_at',now(),'lines',jsonb_agg(jsonb_build_object('account_code',a.account_code,'account_name',a.account_name,'debit',l.debit,'credit',l.credit)))
      into gl_payload from public.journal_lines l join public.general_ledger_accounts a on a.id=l.account_id join public.facilities f on f.id=p_facility
      where l.journal_entry_id=entry_id group by f.code;
    for gl_connection in select id from public.integration_connections where facility_id=p_facility and integration_type='general_ledger' and status='active' loop
      perform public.enqueue_integration_event(gl_connection,'ledger.journal.posted','journal_entry',entry_id,'journal:'||entry_id::text,gl_payload);
    end loop;
  end if;
  return entry_id;
end $$;

create or replace function public.journal_from_invoice() returns trigger language plpgsql security definer set search_path=public as $$
declare facility uuid;
begin
  select home_facility_id into facility from public.patients where id=new.patient_id;
  if facility is not null and coalesce(new.total,0)>0 then perform public.post_general_ledger_entry(facility,'billing',new.id,'invoice.issued',new.total,'Invoice '||new.invoice_number,null); end if;
  return new;
end $$;
drop trigger if exists journal_invoice_issued on public.billing;
create trigger journal_invoice_issued after insert on public.billing for each row execute function public.journal_from_invoice();

create or replace function public.journal_from_payment_posting() returns trigger language plpgsql security definer set search_path=public as $$
declare facility uuid;
begin
  select home_facility_id into facility from public.patients where id=new.patient_id;
  if facility is not null then perform public.post_general_ledger_entry(facility,'payment_posting',new.id,'payment.posted',new.amount,'Payment received',new.recorded_by); end if;
  return new;
end $$;
drop trigger if exists journal_payment_posted on public.payment_postings;
create trigger journal_payment_posted after insert on public.payment_postings for each row execute function public.journal_from_payment_posting();

create or replace function public.journal_from_refund() returns trigger language plpgsql security definer set search_path=public as $$
declare facility uuid;
begin
  select patient.home_facility_id into facility from public.payment_postings posting join public.patients patient on patient.id=posting.patient_id where posting.id=new.payment_posting_id;
  if facility is not null then perform public.post_general_ledger_entry(facility,'payment_reversal',new.id,'payment.refunded',new.amount,'Approved payment refund',new.approved_by); end if;
  return new;
end $$;
drop trigger if exists journal_payment_refund on public.payment_reversals;
create trigger journal_payment_refund after insert on public.payment_reversals for each row execute function public.journal_from_refund();

create or replace function public.prevent_journal_mutation() returns trigger language plpgsql as $$ begin raise exception 'Posted journal records are immutable'; end $$;
drop trigger if exists journal_entries_immutable on public.journal_entries;
create trigger journal_entries_immutable before update or delete on public.journal_entries for each row execute function public.prevent_journal_mutation();
drop trigger if exists journal_lines_immutable on public.journal_lines;
create trigger journal_lines_immutable before update or delete on public.journal_lines for each row execute function public.prevent_journal_mutation();

alter table public.insurance_claims add column if not exists billing_id uuid references public.billing(id) on delete restrict;
alter table public.insurance_claims add column if not exists membership_id uuid references public.insurance_memberships(id) on delete restrict;
alter table public.insurance_claims add column if not exists idempotency_key text;
alter table public.insurance_claims add column if not exists external_claim_id text;
alter table public.insurance_claims add column if not exists submitted_at timestamptz;
alter table public.insurance_claims add column if not exists adjudicated_at timestamptz;
alter table public.insurance_claims add column if not exists updated_at timestamptz not null default now();
update public.insurance_claims set idempotency_key='legacy-claim-'||id::text where idempotency_key is null;
alter table public.insurance_claims alter column idempotency_key set not null;
create unique index if not exists insurance_claims_idempotency_idx on public.insurance_claims(idempotency_key);

create or replace function public.request_payment_checkout(p_billing_id uuid,p_connection_id uuid,p_amount numeric,p_idempotency_key text,p_currency text default 'NGN')
returns uuid language plpgsql security definer set search_path=public as $$
declare invoice_row public.billing%rowtype; connection_row public.integration_connections%rowtype; actor uuid; transaction_id uuid; saved public.payment_provider_transactions%rowtype; patient_row public.patients%rowtype;
begin
  select id into actor from public.profiles where auth_user_id=auth.uid() limit 1;
  select * into invoice_row from public.billing where id=p_billing_id for update;
  if not found or not public.has_finance_department_permission(invoice_row.patient_id,'payment.record') then raise exception 'Payment checkout is not authorized for this invoice'; end if;
  select * into patient_row from public.patients where id=invoice_row.patient_id;
  select * into connection_row from public.integration_connections where id=p_connection_id and facility_id=(select home_facility_id from public.patients where id=invoice_row.patient_id) and integration_type='payment_gateway' and status='active';
  if not found then raise exception 'Active payment gateway is not configured for this facility'; end if;
  if p_amount<=0 or p_amount>invoice_row.balance or p_currency !~ '^[A-Z]{3}$' or length(trim(p_idempotency_key))<8 then raise exception 'Invalid amount, currency, or idempotency key'; end if;
  insert into public.payment_provider_transactions(connection_id,billing_id,patient_id,amount,currency,idempotency_key,created_by)
  values(p_connection_id,p_billing_id,invoice_row.patient_id,p_amount,p_currency,trim(p_idempotency_key),actor)
  on conflict(connection_id,idempotency_key) do nothing returning id into transaction_id;
  if transaction_id is null then
    select * into saved from public.payment_provider_transactions where connection_id=p_connection_id and idempotency_key=trim(p_idempotency_key);
    if saved.billing_id<>p_billing_id or saved.patient_id<>invoice_row.patient_id or saved.amount<>p_amount or saved.currency<>p_currency or saved.created_by<>actor then raise exception 'This idempotency key was already used for a different checkout'; end if;
    return saved.id;
  end if;
  perform public.enqueue_integration_event(p_connection_id,'payment.intent.create','payment_intent',transaction_id,'payment-intent:'||transaction_id::text,
    jsonb_build_object('transaction_id',transaction_id,'invoice_id',p_billing_id,'amount',p_amount,'currency',p_currency,'idempotency_key',trim(p_idempotency_key),
      'customer',jsonb_build_object('email',patient_row.email,'name',concat_ws(' ',patient_row.first_name,patient_row.last_name))));
  return transaction_id;
end $$;

create or replace function public.submit_insurance_claim(p_claim_id uuid,p_connection_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare claim_row public.insurance_claims%rowtype; invoice_row public.billing%rowtype; connection_row public.integration_connections%rowtype; membership_row public.insurance_memberships%rowtype; patient_row public.patients%rowtype; out_id uuid;
begin
  select * into claim_row from public.insurance_claims where id=p_claim_id for update;
  if not found or not public.has_finance_department_permission(claim_row.patient_id,'insurance.submit') then raise exception 'Claim submission is not authorized'; end if;
  select * into invoice_row from public.billing where id=claim_row.billing_id for update;
  if not found or invoice_row.patient_id<>claim_row.patient_id or claim_row.amount_claimed<=0 or claim_row.amount_claimed>invoice_row.balance then raise exception 'Claim does not match an outstanding invoice'; end if;
  if claim_row.membership_id is not null and not exists(select 1 from public.insurance_memberships where id=claim_row.membership_id and patient_id=claim_row.patient_id and coverage_status='active' and verification_status='verified_manual') then raise exception 'Insurance membership is not verified'; end if;
  if claim_row.membership_id is not null then select * into membership_row from public.insurance_memberships where id=claim_row.membership_id; end if;
  select * into patient_row from public.patients where id=claim_row.patient_id;
  select * into connection_row from public.integration_connections where id=p_connection_id and facility_id=(select home_facility_id from public.patients where id=claim_row.patient_id) and integration_type='payer' and status='active';
  if not found then raise exception 'Active payer connection is not configured for this facility'; end if;
  if claim_row.status in ('queued','submitted','accepted','adjudicated') then raise exception 'Claim has already been submitted'; end if;
  perform set_config('onemed.integration_writer','yes',true);
  update public.insurance_claims set provider=connection_row.provider_code,status='queued',submitted_at=now(),updated_at=now() where id=p_claim_id;
  out_id:=public.enqueue_integration_event(p_connection_id,'payer.claim.submit','insurance_claim',p_claim_id,'claim-submit:'||p_claim_id::text,
    jsonb_build_object('claim_id',p_claim_id,'claim_number',claim_row.claim_number,'invoice_id',claim_row.billing_id,'amount',claim_row.amount_claimed,'currency','NGN',
      'patient',jsonb_build_object('patient_number',patient_row.patient_number,'first_name',patient_row.first_name,'last_name',patient_row.last_name,'date_of_birth',patient_row.date_of_birth),
      'coverage',case when claim_row.membership_id is null then null else jsonb_build_object('policy_number',membership_row.policy_number,'scheme',membership_row.scheme,'plan_name',membership_row.plan_name) end,
      'service',jsonb_build_object('department',invoice_row.department,'description',invoice_row.service,'invoice_date',invoice_row.invoice_date)));
  return out_id;
end $$;

create or replace function public.review_payer_remittance(p_remittance_id uuid,p_decision text)
returns void language plpgsql security definer set search_path=public as $$
declare remittance public.payer_remittances%rowtype; claim_row public.insurance_claims%rowtype; invoice_row public.billing%rowtype; facility uuid; actor uuid; already_posted numeric(12,2);
begin
  if p_decision not in ('posted','rejected') then raise exception 'Invalid remittance decision'; end if;
  select * into remittance from public.payer_remittances where id=p_remittance_id for update;
  if not found then raise exception 'Remittance not found'; end if;
  select * into claim_row from public.insurance_claims where id=remittance.claim_id for update;
  if not public.has_finance_department_permission(claim_row.patient_id,'insurance.remittance.review') then raise exception 'Remittance review is not authorized'; end if;
  if remittance.status<>'pending_review' then raise exception 'Remittance has already been reviewed'; end if;
  actor:= (select id from public.profiles where auth_user_id=auth.uid() limit 1);
  if p_decision='posted' then
    select * into invoice_row from public.billing where id=remittance.invoice_id for update;
    select coalesce(sum(amount),0) into already_posted from public.payer_remittances where claim_id=claim_row.id and status='posted';
    if claim_row.status not in ('accepted','adjudicated') or already_posted+remittance.amount>claim_row.amount_approved or remittance.amount>invoice_row.balance then raise exception 'Remittance exceeds adjudicated claim or invoice balance'; end if;
    perform set_config('onemed.approving_payment','yes',true);
    update public.billing set paid=paid+remittance.amount,balance=greatest(0,total-(paid+remittance.amount)),status=case when paid+remittance.amount>=total then 'paid' else 'partial' end where id=invoice_row.id;
    select home_facility_id into facility from public.patients where id=claim_row.patient_id;
    perform public.post_general_ledger_entry(facility,'payer_remittance',remittance.id,'payer.remittance',remittance.amount,'Payer remittance for claim '||claim_row.claim_number,actor);
  end if;
  update public.payer_remittances set status=p_decision,reviewed_by=actor,reviewed_at=now() where id=p_remittance_id;
end $$;

create or replace function public.claim_integration_outbox(p_limit integer default 25)
returns table(id uuid,connection_id uuid,provider_code text,event_type text,aggregate_type text,aggregate_id uuid,idempotency_key text,payload jsonb,attempts integer)
language plpgsql security definer set search_path=public as $$ begin
  if auth.role()<>'service_role' then raise exception 'service_role required'; end if;
  return query with batch as (select o.id from public.integration_outbox o where ((o.status in ('queued','retry') and o.available_at<=now()) or (o.status='processing' and o.locked_until<now())) and exists(select 1 from public.integration_connections c where c.id=o.connection_id and c.status='active') order by o.created_at limit greatest(1,least(coalesce(p_limit,25),100)) for update of o skip locked)
  update public.integration_outbox o set status='processing',attempts=o.attempts+1,locked_until=now()+interval '2 minutes' from batch where o.id=batch.id
  returning o.id,o.connection_id,(select c.provider_code from public.integration_connections c where c.id=o.connection_id),o.event_type,o.aggregate_type,o.aggregate_id,o.idempotency_key,o.payload,o.attempts;
end $$;

create or replace function public.complete_integration_outbox(p_id uuid,p_attempt integer,p_ok boolean,p_response jsonb default '{}'::jsonb,p_external_reference text default null,p_error text default null)
returns void language plpgsql security definer set search_path=public as $$ begin
  if auth.role()<>'service_role' then raise exception 'service_role required'; end if;
  update public.integration_outbox set status=case when p_ok then 'delivered' when attempts>=12 then 'dead' else 'retry' end,
    available_at=case when p_ok then available_at else now()+make_interval(secs=>least(3600,(30*power(2,least(attempts,7)))::integer)) end,
    response=case when p_ok then coalesce(p_response,'{}'::jsonb) else null end,external_reference=case when p_ok then left(p_external_reference,200) else external_reference end,
    last_error=case when p_ok then null else left(coalesce(p_error,'Connector request failed'),500) end,locked_until=null,delivered_at=case when p_ok then now() else null end
  where id=p_id and status='processing' and attempts=p_attempt;
  if not found then raise exception 'Outbox event is not leased or does not exist'; end if;
  if p_ok then
    update public.payment_provider_transactions set status='pending',external_reference=left(p_external_reference,200),
      checkout_url=case when p_response->>'checkout_url' like 'https://%' then left(p_response->>'checkout_url',1000) else null end,updated_at=now()
    where id=(select aggregate_id from public.integration_outbox where id=p_id) and (select event_type from public.integration_outbox where id=p_id)='payment.intent.create';
  elsif (select status from public.integration_outbox where id=p_id)='dead' then
    update public.payment_provider_transactions set status='failed',updated_at=now()
    where id=(select aggregate_id from public.integration_outbox where id=p_id) and (select event_type from public.integration_outbox where id=p_id)='payment.intent.create';
  end if;
end $$;

create or replace function public.process_finance_integration_event(p_connection_id uuid,p_event_id text,p_event_type text,payload jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare inbox_id uuid; intent public.payment_provider_transactions%rowtype; claim_row public.insurance_claims%rowtype; invoice_row public.billing%rowtype; facility uuid; new_payment uuid; external_ref text; connection_type text;
begin
  if auth.role()<>'service_role' then raise exception 'service_role required'; end if;
  if p_event_id is null or length(p_event_id)<1 or length(p_event_id)>200 or p_event_type not in ('payment.succeeded','payment.failed','payer.claim.accepted','payer.claim.adjudicated','payer.remittance') then raise exception 'Invalid normalized integration event'; end if;
  select integration_type into connection_type from public.integration_connections where id=p_connection_id and status='active';
  if not found then raise exception 'Active integration connection not found'; end if;
  if (p_event_type like 'payment.%' and connection_type<>'payment_gateway') or (p_event_type like 'payer.%' and connection_type<>'payer') then raise exception 'Event type does not match integration connection'; end if;
  insert into public.integration_inbox(connection_id,external_event_id,event_type,payload) values(p_connection_id,p_event_id,p_event_type,coalesce(payload,'{}'::jsonb)) on conflict(connection_id,external_event_id) do nothing returning id into inbox_id;
  if inbox_id is null then return; end if;
  if p_event_type in ('payment.succeeded','payment.failed') then
    select * into intent from public.payment_provider_transactions where id=(payload->>'transaction_id')::uuid and connection_id=p_connection_id for update;
    if not found then raise exception 'Payment transaction not found'; end if;
    external_ref:=left(payload->>'external_reference',200);
    if p_event_type='payment.failed' then update public.payment_provider_transactions set status='failed',external_reference=external_ref,updated_at=now() where id=intent.id;
    else
      update public.payment_provider_transactions set status='review_pending',external_reference=external_ref,succeeded_at=now(),updated_at=now() where id=intent.id;
      perform set_config('onemed.integration_writer','yes',true);
      insert into public.payment_submissions(billing_id,patient_id,amount,payment_method,reference,idempotency_key,status,submitted_by)
      values(intent.billing_id,intent.patient_id,intent.amount,'gateway:'||(select provider_code from public.integration_connections where id=p_connection_id),external_ref,'gateway:'||intent.id::text,'pending',intent.created_by)
      on conflict(idempotency_key) do nothing returning id into new_payment;
      if new_payment is null then select id into new_payment from public.payment_submissions where idempotency_key='gateway:'||intent.id::text; end if;
      update public.payment_provider_transactions set payment_submission_id=new_payment where id=intent.id;
    end if;
  elsif p_event_type in ('payer.claim.accepted','payer.claim.adjudicated') then
    select * into claim_row from public.insurance_claims where id=(payload->>'claim_id')::uuid for update;
    if not found then raise exception 'Insurance claim not found'; end if;
    if claim_row.provider<>(select provider_code from public.integration_connections where id=p_connection_id) then raise exception 'Claim payer does not match the webhook connection'; end if;
    if p_event_type='payer.claim.accepted' then
      if claim_row.status not in ('queued','submitted') then raise exception 'Claim is not awaiting payer acceptance'; end if;
      perform set_config('onemed.integration_writer','yes',true);
      update public.insurance_claims set status='accepted',external_claim_id=left(payload->>'external_claim_id',200),updated_at=now() where id=claim_row.id;
    else
      if claim_row.status not in ('queued','submitted','accepted') or payload->>'amount_approved' is null or (payload->>'amount_approved')::numeric<0 or (payload->>'amount_approved')::numeric>claim_row.amount_claimed then raise exception 'Invalid adjudicated claim amount'; end if;
      perform set_config('onemed.integration_writer','yes',true);
      update public.insurance_claims set status=case when (payload->>'amount_approved')::numeric=0 then 'denied' else 'adjudicated' end,amount_approved=(payload->>'amount_approved')::numeric,external_claim_id=left(payload->>'external_claim_id',200),adjudicated_at=now(),updated_at=now() where id=claim_row.id;
      select home_facility_id into facility from public.patients where id=claim_row.patient_id;
      perform public.post_general_ledger_entry(facility,'insurance_claim',claim_row.id,'claim.adjudicated',(payload->>'amount_approved')::numeric,'Payer adjudication '||claim_row.claim_number,null);
    end if;
  elsif p_event_type='payer.remittance' then
    select * into claim_row from public.insurance_claims where id=(payload->>'claim_id')::uuid;
    if not found or claim_row.provider<>(select provider_code from public.integration_connections where id=p_connection_id) or (payload->>'amount')::numeric<=0 or (payload->>'amount')::numeric>claim_row.amount_approved then raise exception 'Invalid payer remittance'; end if;
    insert into public.payer_remittances(connection_id,claim_id,invoice_id,external_event_id,amount) values(p_connection_id,claim_row.id,claim_row.billing_id,p_event_id,(payload->>'amount')::numeric) on conflict(connection_id,external_event_id) do nothing;
  else raise exception 'Unsupported finance integration event'; end if;
  update public.integration_inbox set processed_at=now() where id=inbox_id;
end $$;

revoke all on function public.seed_facility_ledger_for_facility(uuid),public.enqueue_integration_event(uuid,text,text,uuid,text,jsonb),public.post_general_ledger_entry(uuid,text,uuid,text,numeric,text,uuid),public.journal_from_invoice(),public.journal_from_payment_posting(),public.journal_from_refund(),public.prevent_journal_mutation(),public.sync_provider_transaction_review(),public.guard_claim_payer_fields() from public,anon,authenticated;
revoke all on function public.claim_integration_outbox(integer),public.complete_integration_outbox(uuid,integer,boolean,jsonb,text,text),public.process_finance_integration_event(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.claim_integration_outbox(integer),public.complete_integration_outbox(uuid,integer,boolean,jsonb,text,text),public.process_finance_integration_event(uuid,text,text,jsonb) to service_role;
revoke all on function public.request_payment_checkout(uuid,uuid,numeric,text,text),public.submit_insurance_claim(uuid,uuid),public.review_payer_remittance(uuid,text) from public,anon;
grant execute on function public.request_payment_checkout(uuid,uuid,numeric,text,text),public.submit_insurance_claim(uuid,uuid),public.review_payer_remittance(uuid,text) to authenticated;
