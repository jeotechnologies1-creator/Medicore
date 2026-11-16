begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

create table if not exists public.service_charge_catalogue (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete restrict,
  code text not null,
  name text not null,
  department text not null,
  active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(facility_id,code)
);
create table if not exists public.service_charge_prices (
  id uuid primary key default gen_random_uuid(),
  catalogue_item_id uuid not null references public.service_charge_catalogue(id) on delete restrict,
  price numeric(12,2) not null check(price>=0),
  effective_from date not null,
  effective_to date,
  status text not null default 'pending' check(status in ('pending','active','retired','rejected','superseded')),
  requested_by uuid not null references public.profiles(id) on delete restrict,
  approved_by uuid references public.profiles(id) on delete restrict,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  check(effective_to is null or effective_to>=effective_from),
  check((status='active' and approved_by is not null and approved_at is not null) or status<>'active'),
  check(approved_by is null or approved_by<>requested_by)
);
create unique index if not exists service_charge_one_active_price_idx on public.service_charge_prices(catalogue_item_id) where status='active';
create index if not exists service_charge_price_history_idx on public.service_charge_prices(catalogue_item_id,effective_from desc,created_at desc);

create table if not exists public.invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  billing_id uuid not null references public.billing(id) on delete restrict,
  catalogue_item_id uuid not null references public.service_charge_catalogue(id) on delete restrict,
  price_id uuid not null references public.service_charge_prices(id) on delete restrict,
  code_snapshot text not null,
  name_snapshot text not null,
  department_snapshot text not null,
  unit_price numeric(12,2) not null check(unit_price>=0),
  quantity numeric(12,3) not null check(quantity>0),
  line_total numeric(14,2) not null check(line_total>=0),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists invoice_line_items_billing_idx on public.invoice_line_items(billing_id,created_at);

create table if not exists public.invoice_credit_notes (
  id uuid primary key default gen_random_uuid(),
  billing_id uuid not null references public.billing(id) on delete restrict,
  invoice_line_item_id uuid references public.invoice_line_items(id) on delete restrict,
  amount numeric(12,2) not null check(amount>0),
  reason text not null,
  original_invoice_number text not null,
  issued_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists invoice_credit_notes_billing_idx on public.invoice_credit_notes(billing_id,created_at);

alter table public.service_charge_catalogue enable row level security;
alter table public.service_charge_prices enable row level security;
alter table public.invoice_line_items enable row level security;
alter table public.invoice_credit_notes enable row level security;
revoke all on public.service_charge_catalogue,public.service_charge_prices,public.invoice_line_items,public.invoice_credit_notes from public,anon;
grant select on public.service_charge_catalogue,public.service_charge_prices,public.invoice_line_items,public.invoice_credit_notes to authenticated;
grant select,insert,update,delete on public.service_charge_catalogue,public.service_charge_prices,public.invoice_line_items,public.invoice_credit_notes to service_role;

create policy "finance reads same facility catalogue" on public.service_charge_catalogue for select to authenticated
  using(public.can_access_financial_record(facility_id,null,'payment.record',false));
create policy "finance reads same facility prices" on public.service_charge_prices for select to authenticated
  using(exists(select 1 from public.service_charge_catalogue c where c.id=catalogue_item_id and public.can_access_financial_record(c.facility_id,null,'payment.record',false)));
create policy "finance reads facility invoice lines" on public.invoice_line_items for select to authenticated
  using(exists(select 1 from public.billing b where b.id=billing_id and public.can_access_financial_record(b.facility_id,b.patient_id,'payment.record',true)));
create policy "finance reads facility credit notes" on public.invoice_credit_notes for select to authenticated
  using(exists(select 1 from public.billing b where b.id=billing_id and public.can_access_financial_record(b.facility_id,b.patient_id,'payment.record',true)));

create or replace function public.guard_service_charge_price_history() returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' then raise exception 'Price history cannot be deleted; retire or supersede a price instead.'; end if;
  if tg_op='UPDATE' then
    if new.catalogue_item_id is distinct from old.catalogue_item_id or new.price is distinct from old.price
       or new.effective_from is distinct from old.effective_from or new.requested_by is distinct from old.requested_by
       or new.created_at is distinct from old.created_at then raise exception 'Price history values are immutable.'; end if;
    if current_setting('onemed.reviewing_charge_price',true) is distinct from 'yes' then raise exception 'Price status can only change through the approval workflow.'; end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_service_charge_price_history() from public,anon,authenticated;
create trigger guard_service_charge_price_history before update or delete on public.service_charge_prices for each row execute function public.guard_service_charge_price_history();

create or replace function public.guard_invoice_financial_history() returns trigger language plpgsql as $$
begin raise exception 'Invoice line items and credit notes are append-only.'; end $$;
revoke all on function public.guard_invoice_financial_history() from public,anon,authenticated;
create trigger invoice_line_items_immutable before update or delete on public.invoice_line_items for each row execute function public.guard_invoice_financial_history();
create trigger invoice_credit_notes_immutable before update or delete on public.invoice_credit_notes for each row execute function public.guard_invoice_financial_history();

create or replace function public.guard_invoice_snapshot() returns trigger language plpgsql as $$
begin
  if new.patient_id is distinct from old.patient_id or new.invoice_number is distinct from old.invoice_number
     or new.invoice_date is distinct from old.invoice_date or new.subtotal is distinct from old.subtotal
     or new.discount is distinct from old.discount or new.tax is distinct from old.tax or new.total is distinct from old.total
     or new.department is distinct from old.department or new.service is distinct from old.service then
    raise exception 'Issued invoice details are immutable; issue a credit note for corrections.';
  end if;
  return new;
end $$;
revoke all on function public.guard_invoice_snapshot() from public,anon,authenticated;
drop trigger if exists billing_invoice_snapshot_immutable on public.billing;
create trigger billing_invoice_snapshot_immutable before update on public.billing for each row execute function public.guard_invoice_snapshot();

drop trigger if exists audit_service_charge_catalogue on public.service_charge_catalogue;
drop trigger if exists audit_service_charge_prices on public.service_charge_prices;
drop trigger if exists audit_invoice_line_items on public.invoice_line_items;
drop trigger if exists audit_invoice_credit_notes on public.invoice_credit_notes;
create trigger audit_service_charge_catalogue after insert or update or delete on public.service_charge_catalogue for each row execute function public.audit_row_change();
create trigger audit_service_charge_prices after insert or update or delete on public.service_charge_prices for each row execute function public.audit_row_change();
create trigger audit_invoice_line_items after insert or update or delete on public.invoice_line_items for each row execute function public.audit_row_change();
create trigger audit_invoice_credit_notes after insert or update or delete on public.invoice_credit_notes for each row execute function public.audit_row_change();

create or replace function public.request_service_charge_price(p_facility_id uuid,p_code text,p_name text,p_department text,p_price numeric,p_effective_from date,p_effective_to date default null,p_catalogue_item_id uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid; item_id uuid; price_id uuid;
begin
  if not public.has_any_role(array['super_admin','accountant']) then raise exception 'Only authorized finance staff may request catalogue prices.'; end if;
  if not public.can_access_financial_record(p_facility_id,null,'payment.record',false) then raise exception 'Catalogue facility access denied.'; end if;
  if p_price<0 or nullif(trim(p_code),'') is null or nullif(trim(p_name),'') is null or nullif(trim(p_department),'') is null or p_effective_from is null or p_effective_from<current_date or (p_effective_to is not null and (p_effective_to<p_effective_from or p_effective_to<current_date)) then raise exception 'Valid code, name, department, non-retroactive effective dates, and price are required.'; end if;
  select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
  if p_catalogue_item_id is null then
    if exists(select 1 from public.service_charge_catalogue where facility_id=p_facility_id and code=trim(p_code)) then raise exception 'Catalogue code already exists in this facility.'; end if;
    insert into public.service_charge_catalogue(facility_id,code,name,department,created_by) values(p_facility_id,trim(p_code),trim(p_name),trim(p_department),actor) returning id into item_id;
  else
    select id into item_id from public.service_charge_catalogue where id=p_catalogue_item_id and facility_id=p_facility_id and active for update;
    if item_id is null then raise exception 'Active catalogue item not found in this facility.'; end if;
    if exists(select 1 from public.service_charge_catalogue where facility_id=p_facility_id and code=trim(p_code) and id<>item_id) then raise exception 'Catalogue code already exists in this facility.'; end if;
    update public.service_charge_catalogue set code=trim(p_code),name=trim(p_name),department=trim(p_department) where id=item_id;
  end if;
  insert into public.service_charge_prices(catalogue_item_id,price,effective_from,effective_to,requested_by) values(item_id,p_price,p_effective_from,p_effective_to,actor) returning id into price_id;
  return price_id;
end $$;
revoke all on function public.request_service_charge_price(uuid,text,text,text,numeric,date,date,uuid) from public,anon;
grant execute on function public.request_service_charge_price(uuid,text,text,text,numeric,date,date,uuid) to authenticated;

create or replace function public.approve_service_charge_price(p_price_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare proposed public.service_charge_prices%rowtype; item public.service_charge_catalogue%rowtype; actor uuid;
begin
  if not public.has_any_role(array['super_admin','accountant']) then raise exception 'Only authorized finance staff may approve prices.'; end if;
  select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
  select * into proposed from public.service_charge_prices where id=p_price_id and status='pending' for update;
  if not found then raise exception 'Price request is not pending.'; end if;
  if actor=proposed.requested_by then raise exception 'A different person must approve the price change.'; end if;
  if proposed.effective_from<current_date or (proposed.effective_to is not null and proposed.effective_to<current_date) then raise exception 'Price approval cannot be backdated.'; end if;
  select * into item from public.service_charge_catalogue where id=proposed.catalogue_item_id for update;
  if not found or not public.can_access_financial_record(item.facility_id,null,'payment.record',false) then raise exception 'Catalogue facility access denied.'; end if;
  if exists(select 1 from public.service_charge_prices p where p.catalogue_item_id=item.id and p.status='active' and p.effective_from>=proposed.effective_from) then raise exception 'Effective date must be later than the current active price start date.'; end if;
  perform set_config('onemed.reviewing_charge_price','yes',true);
  update public.service_charge_prices set status='superseded',effective_to=proposed.effective_from-1 where catalogue_item_id=item.id and status='active';
  update public.service_charge_prices set status='active',approved_by=actor,approved_at=now() where id=proposed.id;
end $$;
revoke all on function public.approve_service_charge_price(uuid) from public,anon;
grant execute on function public.approve_service_charge_price(uuid) to authenticated;

create or replace function public.retire_service_charge(p_catalogue_item_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare item public.service_charge_catalogue%rowtype;
begin
  if not public.has_any_role(array['super_admin','accountant']) then raise exception 'Only authorized finance staff may retire catalogue items.'; end if;
  select * into item from public.service_charge_catalogue where id=p_catalogue_item_id for update;
  if not found or not public.can_access_financial_record(item.facility_id,null,'payment.record',false) then raise exception 'Catalogue facility access denied.'; end if;
  update public.service_charge_catalogue set active=false where id=item.id;
  perform set_config('onemed.reviewing_charge_price','yes',true);
  update public.service_charge_prices set status='retired' where catalogue_item_id=item.id and status in ('active','pending');
end $$;
revoke all on function public.retire_service_charge(uuid) from public,anon;
grant execute on function public.retire_service_charge(uuid) to authenticated;

create or replace function public.create_catalogued_invoice(p_patient_id uuid,p_invoice_number text,p_lines jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare patient public.patients%rowtype; actor uuid; invoice_id uuid; line jsonb; selected_price public.service_charge_prices%rowtype; item public.service_charge_catalogue%rowtype; line_sum numeric(12,2):=0; quantity numeric;
begin
  if not public.has_any_role(array['super_admin','accountant','receptionist']) then raise exception 'Invoice creation access denied.'; end if;
  select * into patient from public.patients where id=p_patient_id;
  if not found or not public.can_access_financial_record(patient.home_facility_id,patient.id,'payment.record',false) then raise exception 'Invoice facility access denied.'; end if;
  if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then raise exception 'At least one catalogue line is required.'; end if;
  select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
  for line in select value from jsonb_array_elements(p_lines) loop
    quantity:=(line->>'quantity')::numeric;
    if quantity<=0 then raise exception 'Line quantity must be positive.'; end if;
    select * into item from public.service_charge_catalogue where id=(line->>'catalogue_item_id')::uuid and facility_id=patient.home_facility_id and active;
    if not found then raise exception 'Active catalogue item not found in patient facility.'; end if;
    select * into selected_price from public.service_charge_prices where catalogue_item_id=item.id and status='active' and effective_from<=current_date and (effective_to is null or effective_to>=current_date) for share;
    if not found then raise exception 'No effective approved catalogue price exists.'; end if;
    line_sum:=line_sum+round(selected_price.price*quantity,2);
  end loop;
  insert into public.billing(patient_id,facility_id,invoice_number,invoice_date,subtotal,total,paid,balance,department,service,status)
  values(patient.id,patient.home_facility_id,trim(p_invoice_number),current_date,line_sum,line_sum,0,line_sum,'Catalogue','Itemized services','pending') returning id into invoice_id;
  for line in select value from jsonb_array_elements(p_lines) loop
    quantity:=(line->>'quantity')::numeric;
    select * into item from public.service_charge_catalogue where id=(line->>'catalogue_item_id')::uuid;
    select * into selected_price from public.service_charge_prices where catalogue_item_id=item.id and status='active' and effective_from<=current_date and (effective_to is null or effective_to>=current_date);
    insert into public.invoice_line_items(billing_id,catalogue_item_id,price_id,code_snapshot,name_snapshot,department_snapshot,unit_price,quantity,line_total,created_by)
    values(invoice_id,item.id,selected_price.id,item.code,item.name,item.department,selected_price.price,quantity,round(selected_price.price*quantity,2),actor);
  end loop;
  return invoice_id;
end $$;
revoke all on function public.create_catalogued_invoice(uuid,text,jsonb) from public,anon;
grant execute on function public.create_catalogued_invoice(uuid,text,jsonb) to authenticated;

create or replace function public.issue_invoice_credit_note(p_billing_id uuid,p_invoice_line_item_id uuid,p_amount numeric,p_reason text) returns uuid language plpgsql security definer set search_path=public as $$
declare invoice public.billing%rowtype; actor uuid; note_id uuid;
begin
  if not public.has_any_role(array['super_admin','accountant']) then raise exception 'Credit note access denied.'; end if;
  select * into invoice from public.billing where id=p_billing_id;
  if not found or not public.can_access_financial_record(invoice.facility_id,invoice.patient_id,'payment.record',false) then raise exception 'Credit note facility access denied.'; end if;
  if p_amount<=0 or nullif(trim(p_reason),'') is null then raise exception 'A positive credit amount and documented reason are required.'; end if;
  if p_invoice_line_item_id is not null and not exists(select 1 from public.invoice_line_items where id=p_invoice_line_item_id and billing_id=invoice.id) then raise exception 'Credit note line must belong to the selected invoice.'; end if;
  if p_invoice_line_item_id is not null and p_amount+coalesce((select sum(amount) from public.invoice_credit_notes where invoice_line_item_id=p_invoice_line_item_id),0)>(select line_total from public.invoice_line_items where id=p_invoice_line_item_id) then raise exception 'Credit notes cannot exceed the referenced invoice line total.'; end if;
  if p_amount+coalesce((select sum(amount) from public.invoice_credit_notes where billing_id=invoice.id),0)>invoice.total then raise exception 'Credit notes cannot exceed the invoice total.'; end if;
  select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
  insert into public.invoice_credit_notes(billing_id,invoice_line_item_id,amount,reason,original_invoice_number,issued_by)
  values(invoice.id,p_invoice_line_item_id,p_amount,trim(p_reason),invoice.invoice_number,actor) returning id into note_id;
  return note_id;
end $$;
revoke all on function public.issue_invoice_credit_note(uuid,uuid,numeric,text) from public,anon;
grant execute on function public.issue_invoice_credit_note(uuid,uuid,numeric,text) to authenticated;

notify pgrst,'reload schema';
commit;
