begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

insert into public.permission_catalog(permission_key,description,sensitive) values
 ('accounting.read','Read accounting reports and periods',true),
 ('accounting.manage','Record supplier invoices and payments',true),
 ('accounting.period.manage','Open and close accounting periods; post adjustments',true)
on conflict(permission_key) do update set description=excluded.description,sensitive=excluded.sensitive;
insert into public.role_permission_grants(role,permission_key,scope) values
 ('accountant','accounting.read','facility'),('accountant','accounting.manage','facility'),('accountant','accounting.period.manage','facility')
on conflict do nothing;

create table public.accounting_periods (
 id uuid primary key default gen_random_uuid(), facility_id uuid not null references public.facilities(id) on delete restrict,
 period_name text not null check(length(btrim(period_name))>0), starts_on date not null, ends_on date not null,
 status text not null default 'open' check(status in ('open','closed')),
 created_by uuid references public.profiles(id), created_at timestamptz not null default now(),
 closed_by uuid references public.profiles(id), closed_at timestamptz,
 unique(facility_id,period_name), check(ends_on>=starts_on),
 check((status='open' and closed_by is null and closed_at is null) or (status='closed' and closed_by is not null and closed_at is not null))
);
create index accounting_periods_scope_dates on public.accounting_periods(facility_id,starts_on,ends_on);

create or replace function public.seed_ap_ledger_for_facility(p_facility_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 insert into public.general_ledger_accounts(facility_id,account_code,account_name,account_type) values
  (p_facility_id,'2000','Accounts payable','liability'),(p_facility_id,'5000','Procurement and supplies expense','expense')
 on conflict(facility_id,account_code) do nothing;
 insert into public.ledger_posting_rules(facility_id,event_type,debit_account_code,credit_account_code) values
  (p_facility_id,'procurement.invoice.received','5000','2000'),(p_facility_id,'procurement.invoice.paid','2000','1000')
 on conflict(facility_id,event_type) do nothing;
end $$;
do $$ declare f record; begin for f in select id from public.facilities loop perform public.seed_ap_ledger_for_facility(f.id); end loop; end $$;
create or replace function public.seed_ap_ledger_for_new_facility() returns trigger language plpgsql security definer set search_path=public as $$
begin perform public.seed_ap_ledger_for_facility(new.id); return new; end $$;
create trigger seed_ap_ledger_after_facility after insert on public.facilities for each row execute function public.seed_ap_ledger_for_new_facility();

create or replace function public.guard_accounting_period() returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtext(new.facility_id::text),hashtext('accounting-period'));
 if exists(select 1 from public.accounting_periods p where p.facility_id=new.facility_id and p.id is distinct from new.id
   and daterange(p.starts_on,p.ends_on,'[]') && daterange(new.starts_on,new.ends_on,'[]')) then
  raise exception 'Accounting periods for a facility cannot overlap.';
 end if;
 if tg_op='UPDATE' then
  if old.status='closed' then raise exception 'Closed accounting periods are immutable.'; end if;
  if new.starts_on is distinct from old.starts_on or new.ends_on is distinct from old.ends_on or new.facility_id is distinct from old.facility_id
    or new.period_name is distinct from old.period_name then raise exception 'Accounting period boundaries and identity are immutable.'; end if;
  if new.status is distinct from old.status and (new.status<>'closed' or current_setting('app.accounting_period_writer',true) is distinct from 'on') then
   raise exception 'Period status changes require the accounting close workflow.';
  end if;
 end if;
 return new;
end $$;
create trigger accounting_period_guard before insert or update on public.accounting_periods for each row execute function public.guard_accounting_period();
create trigger audit_accounting_periods after insert or update on public.accounting_periods for each row execute function public.audit_row_change();

create or replace function public.seed_accounting_period(p_facility_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare actor uuid; y integer:=extract(year from current_date)::integer;
begin
 select id into actor from public.profiles where role::text='super_admin' and status::text='active' order by created_at limit 1;
 if actor is null then select id into actor from public.profiles where status::text='active' order by created_at limit 1; end if;
 insert into public.accounting_periods(facility_id,period_name,starts_on,ends_on,created_by)
 values(p_facility_id,y::text,make_date(y,1,1),make_date(y,12,31),actor) on conflict(facility_id,period_name) do nothing;
end $$;
do $$ declare f record; begin for f in select id from public.facilities loop perform public.seed_accounting_period(f.id); end loop; end $$;
create or replace function public.seed_accounting_period_for_facility() returns trigger language plpgsql security definer set search_path=public as $$
begin perform public.seed_accounting_period(new.id); return new; end $$;
create trigger seed_accounting_period_after_facility after insert on public.facilities for each row execute function public.seed_accounting_period_for_facility();

create table public.procurement_invoices (
 id uuid primary key default gen_random_uuid(), facility_id uuid not null references public.facilities(id) on delete restrict,
 supplier_name text not null check(length(btrim(supplier_name))>0), invoice_number text not null,
 invoice_date date not null, due_date date not null, amount numeric(12,2) not null check(amount>0),
 amount_paid numeric(12,2) not null default 0 check(amount_paid>=0 and amount_paid<=amount),
 currency text not null default 'NGN' check(currency='NGN'), description text,
 status text not null default 'open' check(status in ('open','partially_paid','paid','void')),
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(facility_id,supplier_name,invoice_number), check(due_date>=invoice_date),
 check((status='open' and amount_paid=0) or (status='partially_paid' and amount_paid>0 and amount_paid<amount) or (status='paid' and amount_paid=amount) or status='void')
);
create index procurement_invoices_ap_ageing on public.procurement_invoices(facility_id,due_date) where status in ('open','partially_paid');
create table public.procurement_invoice_payments (
 id uuid primary key default gen_random_uuid(), procurement_invoice_id uuid not null references public.procurement_invoices(id) on delete restrict,
 facility_id uuid not null references public.facilities(id) on delete restrict, amount numeric(12,2) not null check(amount>0),
 amount_paid_after numeric(12,2) not null check(amount_paid_after>0), idempotency_key text not null,
 recorded_by uuid not null references public.profiles(id), recorded_at timestamptz not null default now(),
 unique(facility_id,idempotency_key)
);
create index procurement_invoice_payments_invoice_idx on public.procurement_invoice_payments(procurement_invoice_id,recorded_at desc);

create or replace function public.guard_procurement_invoice() returns trigger language plpgsql as $$
begin
 if tg_op='UPDATE' and (new.facility_id is distinct from old.facility_id or new.supplier_name is distinct from old.supplier_name
   or new.invoice_number is distinct from old.invoice_number or new.invoice_date is distinct from old.invoice_date
   or new.due_date is distinct from old.due_date or new.amount is distinct from old.amount or new.currency is distinct from old.currency)
 then raise exception 'Supplier invoice details are immutable; record a separate credit or replacement invoice.'; end if;
 if tg_op='UPDATE' and (new.amount_paid is distinct from old.amount_paid or new.status is distinct from old.status)
   and current_setting('app.procurement_payment_writer',true) is distinct from 'on' then raise exception 'Supplier payments require the accounts payable workflow.'; end if;
 return new;
end $$;
create trigger procurement_invoice_guard before update on public.procurement_invoices for each row execute function public.guard_procurement_invoice();
create trigger audit_procurement_invoices after insert or update on public.procurement_invoices for each row execute function public.audit_row_change();
create or replace function public.post_procurement_invoice() returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform public.post_general_ledger_entry(new.facility_id,'procurement_invoice',new.id,'procurement.invoice.received',new.amount,'Supplier invoice '||new.invoice_number,new.created_by);
 return new;
end $$;
create trigger procurement_invoice_journal after insert on public.procurement_invoices for each row execute function public.post_procurement_invoice();
create or replace function public.post_procurement_invoice_payment() returns trigger language plpgsql security definer set search_path=public as $$
declare inv public.procurement_invoices%rowtype;
begin
 select * into inv from public.procurement_invoices where id=new.procurement_invoice_id;
 perform public.post_general_ledger_entry(new.facility_id,'procurement_invoice_payment',new.id,'procurement.invoice.paid',new.amount,'Supplier invoice payment '||inv.invoice_number,new.recorded_by);
 return new;
end $$;
create trigger procurement_invoice_payment_journal after insert on public.procurement_invoice_payments for each row execute function public.post_procurement_invoice_payment();
create trigger audit_procurement_invoice_payments after insert on public.procurement_invoice_payments for each row execute function public.audit_row_change();

alter table public.accounting_periods enable row level security;
alter table public.procurement_invoices enable row level security;
alter table public.procurement_invoice_payments enable row level security;
revoke all on public.accounting_periods,public.procurement_invoices,public.procurement_invoice_payments from public,anon,authenticated;
grant select on public.accounting_periods,public.procurement_invoices,public.procurement_invoice_payments to authenticated;
grant all on public.accounting_periods,public.procurement_invoices,public.procurement_invoice_payments to service_role;
create policy finance_read_accounting_periods on public.accounting_periods for select to authenticated using (public.has_org_permission('accounting.read',facility_id,null));
create policy finance_read_procurement_invoices on public.procurement_invoices for select to authenticated using (public.has_org_permission('accounting.read',facility_id,null));
create policy finance_read_procurement_invoice_payments on public.procurement_invoice_payments for select to authenticated using (public.has_org_permission('accounting.read',facility_id,null));

create or replace function public.create_accounting_period(p_facility_id uuid,p_period_name text,p_starts_on date,p_ends_on date) returns uuid
language plpgsql security definer set search_path=public as $$
declare actor uuid; result uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if actor is null or not public.has_org_permission('accounting.period.manage',p_facility_id,null) or nullif(btrim(p_period_name),'') is null or p_starts_on is null or p_ends_on<p_starts_on
   or p_starts_on<=coalesce((select max(closed.ends_on) from public.accounting_periods closed where closed.facility_id=p_facility_id and closed.status='closed'),'-infinity'::date) then
  raise exception 'Accounting period configuration is invalid or unauthorized.';
 end if;
 insert into public.accounting_periods(facility_id,period_name,starts_on,ends_on,created_by) values(p_facility_id,btrim(p_period_name),p_starts_on,p_ends_on,actor) returning id into result;
 return result;
end $$;

create or replace function public.close_accounting_period(p_period_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare p public.accounting_periods%rowtype; actor uuid;
begin
 select * into p from public.accounting_periods where id=p_period_id for update;
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if p.id is null or actor is null or not public.has_org_permission('accounting.period.manage',p.facility_id,null) or p.status<>'open' then raise exception 'Open accounting period is not available to close.'; end if;
 if exists(select 1 from public.accounting_periods earlier where earlier.facility_id=p.facility_id and earlier.status='open' and earlier.starts_on<p.starts_on) then
  raise exception 'Accounting periods must be closed in chronological order.';
 end if;
 if exists(select 1 from public.journal_entries e left join public.journal_lines l on l.journal_entry_id=e.id
   where e.facility_id=p.facility_id and e.posted_at::date between p.starts_on and p.ends_on
   group by e.id having count(l.id)<2 or coalesce(sum(l.debit),0)<>coalesce(sum(l.credit),0)) then raise exception 'Period cannot close while a journal entry is unbalanced.'; end if;
 perform set_config('app.accounting_period_writer','on',true);
 update public.accounting_periods set status='closed',closed_by=actor,closed_at=now() where id=p.id;
end $$;

create or replace function public.record_procurement_invoice(p_facility_id uuid,p_supplier_name text,p_invoice_number text,p_invoice_date date,p_due_date date,p_amount numeric,p_currency text default 'NGN',p_description text default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare actor uuid; result uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if actor is null or not public.has_org_permission('accounting.manage',p_facility_id,null) or nullif(btrim(p_supplier_name),'') is null or nullif(btrim(p_invoice_number),'') is null or p_invoice_date is null or p_due_date<p_invoice_date or p_amount is null or p_amount<=0 or p_currency is distinct from 'NGN' then
  raise exception 'Supplier invoice is invalid or unauthorized.';
 end if;
 insert into public.procurement_invoices(facility_id,supplier_name,invoice_number,invoice_date,due_date,amount,currency,description,created_by)
 values(p_facility_id,btrim(p_supplier_name),btrim(p_invoice_number),p_invoice_date,p_due_date,p_amount,p_currency,nullif(btrim(p_description),''),actor) returning id into result;
 return result;
end $$;

create or replace function public.record_procurement_invoice_payment(p_invoice_id uuid,p_amount numeric,p_idempotency_key text) returns numeric
language plpgsql security definer set search_path=public as $$
declare inv public.procurement_invoices%rowtype; actor uuid; new_paid numeric; prior public.procurement_invoice_payments%rowtype;
begin
 select * into inv from public.procurement_invoices where id=p_invoice_id for update;
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if inv.id is null or actor is null or not public.has_org_permission('accounting.manage',inv.facility_id,null) or nullif(btrim(p_idempotency_key),'') is null then raise exception 'Supplier invoice payment is invalid or unauthorized.'; end if;
 select * into prior from public.procurement_invoice_payments where facility_id=inv.facility_id and idempotency_key=btrim(p_idempotency_key);
 if prior.id is not null then
  if prior.procurement_invoice_id<>inv.id or prior.amount<>p_amount then raise exception 'This payment idempotency key was used for a different supplier payment.'; end if;
  return prior.amount_paid_after;
 end if;
 if inv.status='void' or p_amount is null or p_amount<=0 or inv.amount_paid+p_amount>inv.amount then
  raise exception 'Supplier invoice payment is invalid or unauthorized.';
 end if;
 new_paid:=inv.amount_paid+p_amount;
 perform set_config('app.procurement_payment_writer','on',true);
 update public.procurement_invoices set amount_paid=new_paid,status=case when new_paid=amount then 'paid' when new_paid>0 then 'partially_paid' else 'open' end,updated_at=now() where id=inv.id;
 insert into public.procurement_invoice_payments(procurement_invoice_id,facility_id,amount,amount_paid_after,idempotency_key,recorded_by)
 values(inv.id,inv.facility_id,p_amount,new_paid,btrim(p_idempotency_key),actor);
 return new_paid;
end $$;

create or replace function public.guard_journal_open_period() returns trigger language plpgsql security definer set search_path=public as $$
declare open_period uuid;
begin
 if exists(select 1 from public.journal_entries e where e.source_type=new.source_type and e.source_id=new.source_id and e.event_type=new.event_type) then return new; end if;
 select p.id into open_period from public.accounting_periods p where p.facility_id=new.facility_id and p.status='open' and new.posted_at::date between p.starts_on and p.ends_on for update;
 if open_period is null then
  raise exception 'No open accounting period covers this posting date. Post corrections in the next open period.';
 end if;
 return new;
end $$;
create trigger journal_open_period_guard before insert on public.journal_entries for each row execute function public.guard_journal_open_period();

create or replace function public.post_ledger_adjustment(p_facility_id uuid,p_period_id uuid,p_memo text,p_lines jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare p public.accounting_periods%rowtype; actor uuid; entry uuid; entry_source uuid:=gen_random_uuid(); next_open uuid; line jsonb; acct uuid; debit_total numeric:=0; credit_total numeric:=0; debit_value numeric; credit_value numeric; line_count integer:=0; posting_day date; connector uuid; gl_payload jsonb;
begin
 select * into p from public.accounting_periods where id=p_period_id and facility_id=p_facility_id;
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if actor is null or not public.has_org_permission('accounting.period.manage',p_facility_id,null) or p.id is null or p.status<>'open'
   or nullif(btrim(p_memo),'') is null or p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)<2 then raise exception 'Ledger adjustment requires finance authorization, an open period, memo, and balanced lines.'; end if;
 select id into next_open from public.accounting_periods open_row where open_row.facility_id=p_facility_id and open_row.status='open'
  and open_row.starts_on>coalesce((select max(closed.ends_on) from public.accounting_periods closed where closed.facility_id=p_facility_id and closed.status='closed'),'-infinity'::date)
  order by open_row.starts_on limit 1;
 if p.id is distinct from next_open then raise exception 'Corrections must be posted in the next open accounting period.'; end if;
 posting_day:=greatest(current_date,p.starts_on);
 if posting_day>p.ends_on then raise exception 'Selected open period does not cover the adjustment date.'; end if;
 for line in select item from jsonb_array_elements(p_lines) as items(item) loop
  debit_value:=coalesce(nullif(line->>'debit','')::numeric,0); credit_value:=coalesce(nullif(line->>'credit','')::numeric,0);
  if debit_value<0 or credit_value<0 or (debit_value<=0 and credit_value<=0) or (debit_value>0 and credit_value>0) then raise exception 'Each adjustment line must have a positive debit or credit, but not both.'; end if;
  select id into acct from public.general_ledger_accounts where facility_id=p_facility_id and account_code=line->>'account_code' and status='active';
  if acct is null then raise exception 'Adjustment account must be active in the selected facility.'; end if;
  debit_total:=debit_total+debit_value; credit_total:=credit_total+credit_value; line_count:=line_count+1;
 end loop;
 if debit_total<=0 or debit_total<>credit_total then raise exception 'Ledger adjustment debits and credits must balance.'; end if;
 insert into public.journal_entries(facility_id,source_type,source_id,event_type,memo,amount,posted_by,posted_at)
 values(p_facility_id,'manual_adjustment',entry_source,'manual.adjustment',left(btrim(p_memo),240),debit_total,actor,posting_day::timestamp at time zone 'UTC') returning id into entry;
 for line in select item from jsonb_array_elements(p_lines) as items(item) loop
  debit_value:=coalesce(nullif(line->>'debit','')::numeric,0); credit_value:=coalesce(nullif(line->>'credit','')::numeric,0);
  select id into acct from public.general_ledger_accounts where facility_id=p_facility_id and account_code=line->>'account_code' and status='active';
  insert into public.journal_lines(journal_entry_id,account_id,debit,credit) values(entry,acct,debit_value,credit_value);
 end loop;
 select jsonb_build_object('journal_entry_id',entry,'facility_code',f.code,'event_type','manual.adjustment','memo',left(btrim(p_memo),240),
   'amount',debit_total,'currency','NGN','posted_at',posting_day,'lines',jsonb_agg(jsonb_build_object('account_code',a.account_code,'account_name',a.account_name,'debit',l.debit,'credit',l.credit)))
 into gl_payload from public.journal_lines l join public.general_ledger_accounts a on a.id=l.account_id join public.facilities f on f.id=p_facility_id
 where l.journal_entry_id=entry group by f.code;
 for connector in select id from public.integration_connections where facility_id=p_facility_id and integration_type='general_ledger' and status='active' loop
  perform public.enqueue_integration_event(connector,'ledger.journal.posted','journal_entry',entry,'journal:'||entry::text,gl_payload);
 end loop;
 return entry;
end $$;

create view public.accounts_receivable_ageing with (security_barrier=true) as
select b.facility_id,b.id invoice_id,b.invoice_number,b.patient_id,b.invoice_date,b.balance outstanding,
 greatest(current_date-b.invoice_date,0) age_days,
 case when current_date-b.invoice_date<=30 then b.balance else 0 end current_amount,
 case when current_date-b.invoice_date between 31 and 60 then b.balance else 0 end days_31_60,
 case when current_date-b.invoice_date between 61 and 90 then b.balance else 0 end days_61_90,
 case when current_date-b.invoice_date>90 then b.balance else 0 end days_over_90
from public.billing b where b.balance>0 and (public.has_any_role(array['super_admin']) or public.has_finance_department_permission(b.patient_id,'payment.record'));
create view public.accounts_payable_ageing with (security_barrier=true) as
select i.facility_id,i.id invoice_id,i.supplier_name,i.invoice_number,i.invoice_date,i.due_date,i.currency,
 i.amount-i.amount_paid outstanding,greatest(current_date-i.due_date,0) overdue_days,
 case when current_date<=i.due_date then i.amount-i.amount_paid else 0 end current_amount,
 case when current_date-i.due_date between 1 and 30 then i.amount-i.amount_paid else 0 end days_1_30,
 case when current_date-i.due_date between 31 and 60 then i.amount-i.amount_paid else 0 end days_31_60,
 case when current_date-i.due_date between 61 and 90 then i.amount-i.amount_paid else 0 end days_61_90,
 case when current_date-i.due_date>90 then i.amount-i.amount_paid else 0 end days_over_90
from public.procurement_invoices i where i.status in ('open','partially_paid') and (public.has_org_permission('accounting.read',i.facility_id,null));
create view public.trial_balance_report with (security_barrier=true) as
select p.facility_id,p.id accounting_period_id,p.period_name,p.starts_on,p.ends_on,a.id account_id,a.account_code,a.account_name,a.account_type,
 coalesce(sum(l.debit),0)::numeric(14,2) debit_total,coalesce(sum(l.credit),0)::numeric(14,2) credit_total,
 (coalesce(sum(l.debit),0)-coalesce(sum(l.credit),0))::numeric(14,2) net_balance
from public.accounting_periods p join public.general_ledger_accounts a on a.facility_id=p.facility_id
left join public.journal_entries e on e.facility_id=p.facility_id and e.posted_at::date between p.starts_on and p.ends_on
left join public.journal_lines l on l.journal_entry_id=e.id and l.account_id=a.id
where public.has_org_permission('ledger.read',p.facility_id,null)
group by p.facility_id,p.id,p.period_name,p.starts_on,p.ends_on,a.id,a.account_code,a.account_name,a.account_type;
revoke all on public.accounts_receivable_ageing,public.accounts_payable_ageing,public.trial_balance_report from public,anon,authenticated;
grant select on public.accounts_receivable_ageing,public.accounts_payable_ageing,public.trial_balance_report to authenticated;
grant select on public.accounts_receivable_ageing,public.accounts_payable_ageing,public.trial_balance_report to service_role;

revoke all on function public.seed_accounting_period(uuid),public.seed_accounting_period_for_facility(),public.seed_ap_ledger_for_facility(uuid),public.seed_ap_ledger_for_new_facility(),public.post_procurement_invoice(),public.post_procurement_invoice_payment(),public.guard_accounting_period(),public.guard_procurement_invoice(),public.guard_journal_open_period(),public.create_accounting_period(uuid,text,date,date),public.close_accounting_period(uuid),public.record_procurement_invoice(uuid,text,text,date,date,numeric,text,text),public.record_procurement_invoice_payment(uuid,numeric,text),public.post_ledger_adjustment(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.create_accounting_period(uuid,text,date,date),public.close_accounting_period(uuid),public.record_procurement_invoice(uuid,text,text,date,date,numeric,text,text),public.record_procurement_invoice_payment(uuid,numeric,text),public.post_ledger_adjustment(uuid,uuid,text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
