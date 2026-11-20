begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

alter table public.billing
  add column if not exists prescription_id uuid references public.prescriptions(id) on delete restrict;
comment on column public.billing.prescription_id is
  'Links an Accounts-managed pharmacy invoice to its source prescription; invoice payment and verification remain in the existing billing workflow.';
create unique index if not exists billing_one_pharmacy_invoice_per_prescription_idx
  on public.billing(prescription_id) where prescription_id is not null;

create table if not exists public.pharmacy_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  billing_id uuid not null references public.billing(id) on delete restrict,
  prescription_item_id uuid not null references public.prescription_items(id) on delete restrict,
  inventory_lot_id uuid not null references public.pharmacy_inventory(id) on delete restrict,
  medicine_name text not null,
  strength text not null,
  dosage_form text not null,
  quantity numeric(12,3) not null check(quantity>0),
  unit_price numeric(12,2) not null check(unit_price>0),
  line_total numeric(14,2) not null check(line_total>0),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(billing_id,prescription_item_id)
);
comment on table public.pharmacy_invoice_lines is
  'Immutable medicine, quantity, and price snapshots for pharmacy prescription invoices, visible only through facility/patient-scoped billing access.';
create index if not exists pharmacy_invoice_lines_billing_idx on public.pharmacy_invoice_lines(billing_id,created_at);
alter table public.pharmacy_invoice_lines enable row level security;
revoke all on public.pharmacy_invoice_lines from public,anon,authenticated;
grant select on public.pharmacy_invoice_lines to authenticated;
grant all on public.pharmacy_invoice_lines to service_role;
drop policy if exists "pharmacy invoice line scoped read" on public.pharmacy_invoice_lines;
create policy "pharmacy invoice line scoped read" on public.pharmacy_invoice_lines for select to authenticated using (
  exists(select 1 from public.billing b where b.id=billing_id and (
    public.has_clinical_department_permission(b.patient_id,null,'medication.dispense',false)
    or public.can_access_financial_record(b.facility_id,b.patient_id,'payment.record',true)
    or exists(select 1 from public.profiles actor where actor.auth_user_id=auth.uid() and actor.patient_id=b.patient_id)
  ))
);

create or replace function public.guard_pharmacy_invoice_line_history()
returns trigger language plpgsql set search_path=public as $$
begin
  raise exception 'Pharmacy invoice lines are immutable financial history.';
end $$;
revoke all on function public.guard_pharmacy_invoice_line_history() from public,anon,authenticated;
drop trigger if exists guard_pharmacy_invoice_line_history on public.pharmacy_invoice_lines;
create trigger guard_pharmacy_invoice_line_history before update or delete on public.pharmacy_invoice_lines
for each row execute function public.guard_pharmacy_invoice_line_history();
drop trigger if exists audit_pharmacy_invoice_lines on public.pharmacy_invoice_lines;
create trigger audit_pharmacy_invoice_lines after insert on public.pharmacy_invoice_lines
for each row execute function public.audit_row_change();

create or replace function public.create_pharmacy_prescription_invoice(p_prescription_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor_id uuid; actor_role text; actor_facility uuid; rx public.prescriptions%rowtype; patient public.patients%rowtype;
  existing public.billing%rowtype; item record; lot public.pharmacy_inventory%rowtype;
  invoice_id uuid; invoice_number text; service_description text:=''; line_sum numeric(12,2):=0;
  line_total numeric(14,2); line_rows jsonb:='[]'::jsonb;
begin
  select id,role::text,facility_id into actor_id,actor_role,actor_facility from public.profiles
    where auth_user_id=auth.uid() and status::text='active' limit 1;
  if actor_id is null or actor_role not in ('pharmacist','super_admin') then
    raise exception 'Only an active pharmacist or Super Admin may attach a pharmacy bill.';
  end if;
  if public.mfa_required_for_current_user() and not public.has_aal2() then
    raise exception 'Multi-factor authentication is required to attach a pharmacy bill.';
  end if;
  select * into rx from public.prescriptions where id=p_prescription_id for update;
  if not found or rx.status<>'active' then raise exception 'Only an active prescription can be billed.'; end if;
  if not public.has_clinical_department_permission(rx.patient_id,null,'medication.dispense',false) then
    raise exception 'Pharmacy facility access denied.';
  end if;
  select * into patient from public.patients where id=rx.patient_id;
  if not found or patient.home_facility_id is null then raise exception 'Patient must belong to a facility before billing.'; end if;
  if actor_role='super_admin' and actor_facility is distinct from patient.home_facility_id and not exists(
    select 1 from public.staff_organization_memberships m join public.organization_units u on u.id=m.organization_unit_id
    where m.profile_id=actor_id and m.status='active' and m.starts_on<=current_date
      and (m.ends_on is null or m.ends_on>=current_date) and u.status='active' and u.facility_id=patient.home_facility_id
  ) then raise exception 'Super Admin pharmacy billing is limited to assigned facilities.'; end if;
  select * into existing from public.billing where prescription_id=rx.id for update;
  if found then
    return jsonb_build_object('invoice_id',existing.id,'invoice_number',existing.invoice_number,
      'status',existing.status,'total',existing.total,'paid',existing.paid,'balance',existing.balance);
  end if;
  if not exists(select 1 from public.prescription_items where prescription_id=rx.id) then
    raise exception 'Prescription has no structured medication items to bill.';
  end if;

  for item in
    select pi.id,pi.formulary_item_id,pi.quantity,f.generic_name,f.strength,f.form
    from public.prescription_items pi join public.formulary_items f on f.id=pi.formulary_item_id
    where pi.prescription_id=rx.id order by pi.id
  loop
    select * into lot from public.pharmacy_inventory
      where facility_id=patient.home_facility_id and formulary_item_id=item.formulary_item_id
        and stock_quantity>=item.quantity and (expiry_date is null or expiry_date>=current_date) and unit_price>0
      order by expiry_date nulls last,created_at,id limit 1 for update;
    if not found then
      raise exception 'No in-stock, priced, unexpired lot with sufficient quantity is available for %.',item.generic_name;
    end if;
    line_total:=round(lot.unit_price*item.quantity,2);
    line_sum:=line_sum+line_total;
    service_description:=concat_ws('; ',nullif(service_description,''),format('%s %s (%s) · Qty %s · NGN %s each · NGN %s',
      item.generic_name,item.strength,item.form,item.quantity,
      to_char(lot.unit_price,'FM999999999990.00'),to_char(line_total,'FM999999999990.00')));
    line_rows:=line_rows||jsonb_build_array(jsonb_build_object(
      'prescription_item_id',item.id,'inventory_lot_id',lot.id,'medicine_name',item.generic_name,
      'strength',item.strength,'dosage_form',item.form,'quantity',item.quantity,
      'unit_price',lot.unit_price,'line_total',line_total
    ));
  end loop;
  invoice_number:='PH-'||to_char(current_date,'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  insert into public.billing(patient_id,facility_id,prescription_id,invoice_number,invoice_date,subtotal,total,paid,balance,department,service,status)
  values(patient.id,patient.home_facility_id,rx.id,invoice_number,current_date,line_sum,line_sum,0,line_sum,'Pharmacy',service_description,'pending')
  returning id into invoice_id;
  insert into public.pharmacy_invoice_lines(billing_id,prescription_item_id,inventory_lot_id,medicine_name,strength,dosage_form,quantity,unit_price,line_total,created_by)
  select invoice_id,(line->>'prescription_item_id')::uuid,(line->>'inventory_lot_id')::uuid,line->>'medicine_name',
    line->>'strength',line->>'dosage_form',(line->>'quantity')::numeric,(line->>'unit_price')::numeric,
    (line->>'line_total')::numeric,actor_id
  from jsonb_array_elements(line_rows) line;
  return jsonb_build_object('invoice_id',invoice_id,'invoice_number',invoice_number,'status','pending',
    'total',line_sum,'paid',0,'balance',line_sum);
end $$;
revoke all on function public.create_pharmacy_prescription_invoice(uuid) from public,anon;
grant execute on function public.create_pharmacy_prescription_invoice(uuid) to authenticated;

create or replace function public.get_pharmacy_prescription_invoice_status(p_prescription_ids uuid[])
returns table(prescription_id uuid,invoice_id uuid,invoice_number text,status text,total numeric,paid numeric,balance numeric)
language plpgsql security definer set search_path=public as $$
declare actor_id uuid; actor_role text; actor_facility uuid;
begin
  select id,role::text,facility_id into actor_id,actor_role,actor_facility from public.profiles
    where auth_user_id=auth.uid() and status::text='active' limit 1;
  if actor_id is null or actor_role not in ('pharmacist','super_admin') then
    raise exception 'Pharmacy invoice status access denied.';
  end if;
  return query
    select b.prescription_id,b.id,b.invoice_number,b.status,b.total,b.paid,b.balance
    from public.billing b join public.prescriptions rx on rx.id=b.prescription_id
    where b.prescription_id=any(coalesce(p_prescription_ids,array[]::uuid[]))
      and ((actor_role='super_admin' and exists(select 1 from public.patients patient
          where patient.id=rx.patient_id and (patient.home_facility_id=actor_facility or exists(
            select 1 from public.staff_organization_memberships m join public.organization_units u on u.id=m.organization_unit_id
            where m.profile_id=actor_id and m.status='active' and m.starts_on<=current_date
              and (m.ends_on is null or m.ends_on>=current_date) and u.status='active' and u.facility_id=patient.home_facility_id
          )))) or (actor_role<>'super_admin' and public.has_clinical_department_permission(rx.patient_id,null,'medication.dispense',false)));
end $$;
revoke all on function public.get_pharmacy_prescription_invoice_status(uuid[]) from public,anon;
grant execute on function public.get_pharmacy_prescription_invoice_status(uuid[]) to authenticated;

create or replace function public.require_paid_pharmacy_invoice_for_dispense()
returns trigger language plpgsql security definer set search_path=public as $$
declare invoice_row public.billing%rowtype;
begin
  if new.status='dispensed' and old.status is distinct from 'dispensed' then
    select * into invoice_row from public.billing where prescription_id=new.id for update;
    if not found or invoice_row.status<>'paid' or coalesce(invoice_row.balance,0)>0 or coalesce(invoice_row.total,0)<=0 then
      raise exception 'Prescription must have an Accounts-verified, fully paid pharmacy invoice before dispensing.';
    end if;
    if exists(select 1 from public.payment_postings p join public.payment_reversals r on r.payment_posting_id=p.id where p.billing_id=invoice_row.id) then
      raise exception 'A reversed pharmacy payment cannot authorize dispensing.';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.require_paid_pharmacy_invoice_for_dispense() from public,anon,authenticated;
drop trigger if exists prescriptions_require_paid_pharmacy_invoice on public.prescriptions;
create trigger prescriptions_require_paid_pharmacy_invoice before update of status on public.prescriptions
for each row execute function public.require_paid_pharmacy_invoice_for_dispense();

create or replace function public.get_pharmacy_sales(p_facility_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor_id uuid; actor_role text; actor_facility uuid; local_today date; month_start date;
  today_paid numeric(14,2); today_refunded numeric(14,2); today_count bigint;
  month_paid numeric(14,2); month_refunded numeric(14,2); month_count bigint;
begin
  select id,role::text,facility_id into actor_id,actor_role,actor_facility from public.profiles
    where auth_user_id=auth.uid() and status::text='active' limit 1;
  if actor_id is null or actor_role not in ('pharmacist','super_admin') then raise exception 'Pharmacy sales access denied.'; end if;
  if actor_facility is distinct from p_facility_id and not exists(
    select 1 from public.staff_organization_memberships m join public.organization_units u on u.id=m.organization_unit_id
    where m.profile_id=actor_id and m.status='active' and m.starts_on<=current_date
      and (m.ends_on is null or m.ends_on>=current_date) and u.status='active' and u.facility_id=p_facility_id
  ) then raise exception 'Pharmacy sales facility access denied.'; end if;
  local_today:=(now() at time zone 'Africa/Lagos')::date;
  month_start:=date_trunc('month',local_today::timestamp)::date;
  select coalesce(sum(p.amount),0),count(*) into today_paid,today_count
    from public.payment_postings p join public.billing b on b.id=p.billing_id
    where b.prescription_id is not null and b.facility_id=p_facility_id
      and (p.recorded_at at time zone 'Africa/Lagos')::date=local_today;
  select coalesce(sum(r.amount),0) into today_refunded
    from public.payment_reversals r join public.payment_postings p on p.id=r.payment_posting_id
    join public.billing b on b.id=p.billing_id
    where b.prescription_id is not null and b.facility_id=p_facility_id
      and (r.posted_at at time zone 'Africa/Lagos')::date=local_today;
  select coalesce(sum(p.amount),0),count(*) into month_paid,month_count
    from public.payment_postings p join public.billing b on b.id=p.billing_id
    where b.prescription_id is not null and b.facility_id=p_facility_id
      and (p.recorded_at at time zone 'Africa/Lagos')::date>=month_start
      and (p.recorded_at at time zone 'Africa/Lagos')::date<local_today+1;
  select coalesce(sum(r.amount),0) into month_refunded
    from public.payment_reversals r join public.payment_postings p on p.id=r.payment_posting_id
    join public.billing b on b.id=p.billing_id
    where b.prescription_id is not null and b.facility_id=p_facility_id
      and (r.posted_at at time zone 'Africa/Lagos')::date>=month_start
      and (r.posted_at at time zone 'Africa/Lagos')::date<local_today+1;
  return jsonb_build_object(
    'as_of_date',local_today,
    'today',jsonb_build_object('paid',today_paid,'refunded',today_refunded,'net',today_paid-today_refunded,'payments',today_count),
    'month',jsonb_build_object('paid',month_paid,'refunded',month_refunded,'net',month_paid-month_refunded,'payments',month_count)
  );
end $$;
revoke all on function public.get_pharmacy_sales(uuid) from public,anon;
grant execute on function public.get_pharmacy_sales(uuid) to authenticated;

notify pgrst,'reload schema';
commit;
