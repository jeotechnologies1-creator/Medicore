begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

insert into public.permission_catalog(permission_key,description,sensitive) values
 ('stock.read','Read facility stock and store locations',true),('stock.manage','Receive, issue, transfer, adjust, and return stock',true),
 ('procurement.manage','Create purchase orders and receive goods',true),('procurement.approve','Approve purchase orders',true)
on conflict(permission_key) do update set description=excluded.description,sensitive=true;
insert into public.role_permission_grants(role,permission_key,scope) values
 ('pharmacist','stock.read','facility'),('pharmacist','stock.manage','facility'),('records_officer','stock.read','facility'),
 ('accountant','procurement.manage','facility'),('accountant','procurement.approve','facility'),
 ('super_admin','stock.read','global'),('super_admin','stock.manage','global'),('super_admin','procurement.manage','global'),('super_admin','procurement.approve','global')
on conflict do nothing;

create table public.store_locations(
 id uuid primary key default gen_random_uuid(),facility_id uuid not null references public.facilities(id) on delete restrict,
 location_code text not null,location_name text not null,active boolean not null default true,
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 unique(facility_id,location_code),unique(id,facility_id),check(length(btrim(location_code))>0 and length(btrim(location_name))>0));
alter table public.pharmacy_inventory add column facility_id uuid references public.facilities(id) on delete restrict;
create index pharmacy_inventory_facility_idx on public.pharmacy_inventory(facility_id,formulary_item_id,expiry_date) where facility_id is not null;
create table public.store_stock_items(
 id uuid primary key default gen_random_uuid(),facility_id uuid not null references public.facilities(id) on delete restrict,
 item_code text not null,item_name text not null,unit text not null,pharmacy_inventory_id uuid unique references public.pharmacy_inventory(id) on delete restrict,
 active boolean not null default true,created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 unique(facility_id,item_code),unique(id,facility_id),check(length(btrim(item_code))>0 and length(btrim(item_name))>0 and length(btrim(unit))>0));
alter table public.pharmacy_inventory add column store_stock_item_id uuid unique references public.store_stock_items(id) on delete restrict;

create table public.stock_balances(
 stock_item_id uuid not null references public.store_stock_items(id) on delete restrict,
 location_id uuid not null references public.store_locations(id) on delete restrict,
 facility_id uuid not null references public.facilities(id) on delete restrict,
 quantity numeric(14,3) not null default 0 check(quantity>=0),updated_at timestamptz not null default now(),
 primary key(stock_item_id,location_id));
create index stock_balances_facility_location on public.stock_balances(facility_id,location_id,stock_item_id);

create table public.stock_movements(
 id uuid primary key default gen_random_uuid(),facility_id uuid not null references public.facilities(id) on delete restrict,
 stock_item_id uuid not null references public.store_stock_items(id) on delete restrict,
 inventory_lot_id uuid references public.pharmacy_inventory(id) on delete restrict,
 movement_type text not null check(movement_type in ('receipt','issue','transfer','adjustment','return')),
 quantity numeric(14,3) not null check(quantity>0 and quantity=trunc(quantity)),direction text check(direction in ('in','out')),
 source_location_id uuid references public.store_locations(id) on delete restrict,
 destination_location_id uuid references public.store_locations(id) on delete restrict,
 reason text not null check(length(btrim(reason))>0),reference text,
 purchase_order_id uuid,goods_receipt_note_id uuid,supplier_return_id uuid,
 actor_id uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 check((movement_type='transfer' and direction is null and source_location_id is not null and destination_location_id is not null and source_location_id<>destination_location_id)
  or (movement_type<>'transfer' and direction is not null and ((direction='in' and destination_location_id is not null and source_location_id is null) or (direction='out' and source_location_id is not null and destination_location_id is null)))));
create index stock_movements_item_time on public.stock_movements(stock_item_id,created_at desc,id desc);
create index stock_movements_facility_time on public.stock_movements(facility_id,created_at desc);

create or replace function public.apply_stock_movement() returns trigger language plpgsql security definer set search_path=public as $$
declare item public.store_stock_items%rowtype; source_balance numeric; dest_balance numeric; loc uuid; prior text;
begin
 select * into item from public.store_stock_items where id=new.stock_item_id for update;
 if not found or item.facility_id is distinct from new.facility_id or item.pharmacy_inventory_id is distinct from new.inventory_lot_id then raise exception 'Stock item or pharmacy lot is not assigned to this facility.'; end if;
 if new.source_location_id is not null and not exists(select 1 from public.store_locations where id=new.source_location_id and facility_id=new.facility_id and active) then raise exception 'Source store location is inactive or outside the facility.'; end if;
 if new.destination_location_id is not null and not exists(select 1 from public.store_locations where id=new.destination_location_id and facility_id=new.facility_id and active) then raise exception 'Destination store location is inactive or outside the facility.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(new.stock_item_id::text,0));
 if new.movement_type='transfer' then
  for loc in select x from unnest(array[new.source_location_id,new.destination_location_id]) x order by x loop
   insert into public.stock_balances(stock_item_id,location_id,facility_id,quantity) values(new.stock_item_id,loc,new.facility_id,0) on conflict do nothing;
   perform 1 from public.stock_balances where stock_item_id=new.stock_item_id and location_id=loc for update;
  end loop;
  select quantity into source_balance from public.stock_balances where stock_item_id=new.stock_item_id and location_id=new.source_location_id;
  if source_balance<new.quantity then raise exception 'Insufficient stock for transfer.'; end if;
  update public.stock_balances set quantity=quantity-new.quantity,updated_at=now() where stock_item_id=new.stock_item_id and location_id=new.source_location_id;
  insert into public.stock_balances(stock_item_id,location_id,facility_id,quantity) values(new.stock_item_id,new.destination_location_id,new.facility_id,new.quantity)
   on conflict(stock_item_id,location_id) do update set quantity=public.stock_balances.quantity+excluded.quantity,updated_at=now();
 elsif new.direction='out' then
  insert into public.stock_balances(stock_item_id,location_id,facility_id,quantity) values(new.stock_item_id,new.source_location_id,new.facility_id,0) on conflict do nothing;
  select quantity into source_balance from public.stock_balances where stock_item_id=new.stock_item_id and location_id=new.source_location_id for update;
  if source_balance<new.quantity then raise exception 'Insufficient stock; negative balances are prohibited.'; end if;
  update public.stock_balances set quantity=quantity-new.quantity,updated_at=now() where stock_item_id=new.stock_item_id and location_id=new.source_location_id;
 else
  insert into public.stock_balances(stock_item_id,location_id,facility_id,quantity) values(new.stock_item_id,new.destination_location_id,new.facility_id,new.quantity)
   on conflict(stock_item_id,location_id) do update set quantity=public.stock_balances.quantity+excluded.quantity,updated_at=now();
 end if;
 prior:=current_setting('app.stock_projection_writer',true); perform set_config('app.stock_projection_writer','on',true);
 if new.inventory_lot_id is not null then
  update public.pharmacy_inventory set stock_quantity=coalesce((select sum(quantity) from public.stock_balances where stock_item_id=new.stock_item_id),0)::integer,
   status=case when coalesce((select sum(quantity) from public.stock_balances where stock_item_id=new.stock_item_id),0)<=reorder_level then 'low_stock' else 'active' end
  where id=new.inventory_lot_id;
 end if;
 perform set_config('app.stock_projection_writer',coalesce(prior,''),true);
 return new;
end $$;
create trigger apply_stock_movement_after_insert after insert on public.stock_movements for each row execute function public.apply_stock_movement();

create or replace function public.guard_legacy_pharmacy_stock_change() returns trigger language plpgsql security definer set search_path=public as $$
declare profile_id uuid; loc record; needed numeric; portion numeric; kind text;
begin
 if current_setting('app.stock_projection_writer',true)='on' or new.stock_quantity is not distinct from old.stock_quantity then return new; end if;
 if old.facility_id is null then raise exception 'Assign this legacy pharmacy lot to a facility and store location before changing stock.'; end if;
 select id into profile_id from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if profile_id is null or not public.has_org_permission('stock.manage',old.facility_id,null) then raise exception 'Stock changes must use the authorized stock ledger workflow.'; end if;
 if old.store_stock_item_id is null then raise exception 'Assign this pharmacy lot to a stock ledger item before changing stock.'; end if;
 needed:=abs(new.stock_quantity-old.stock_quantity); kind:=case when new.stock_quantity<old.stock_quantity then 'issue' else 'adjustment' end;
 if new.stock_quantity<old.stock_quantity then
  for loc in select location_id,quantity from public.stock_balances where stock_item_id=old.store_stock_item_id and quantity>0 order by quantity desc,location_id for update loop
   exit when needed<=0; portion:=least(needed,loc.quantity);
   insert into public.stock_movements(facility_id,stock_item_id,inventory_lot_id,movement_type,quantity,direction,source_location_id,reason,actor_id)
    values(old.facility_id,old.store_stock_item_id,old.id,kind,portion,'out',loc.location_id,'Legacy stock decrement captured by ledger trigger',profile_id);
   needed:=needed-portion;
  end loop;
 else
  select id into loc from public.store_locations where facility_id=old.facility_id and active order by created_at,id limit 1;
  if loc.id is null then raise exception 'Create an active store location before adjusting stock.'; end if;
  insert into public.stock_movements(facility_id,stock_item_id,inventory_lot_id,movement_type,quantity,direction,destination_location_id,reason,actor_id)
   values(old.facility_id,old.store_stock_item_id,old.id,'adjustment',needed,'in',loc.id,'Legacy stock increment captured by ledger trigger',profile_id);
 end if;
 if needed>0 then raise exception 'Insufficient ledger balance for legacy stock decrement.'; end if;
 return new;
end $$;
create trigger pharmacy_stock_ledger_guard before update of stock_quantity on public.pharmacy_inventory for each row execute function public.guard_legacy_pharmacy_stock_change();
create or replace function public.guard_pharmacy_stock_mapping() returns trigger language plpgsql as $$
begin
 if (new.facility_id is distinct from old.facility_id or new.store_stock_item_id is distinct from old.store_stock_item_id)
  and current_setting('app.stock_projection_writer',true) is distinct from 'on' then raise exception 'Pharmacy stock facility and ledger links must use the stock workflow.'; end if;
 return new;
end $$;
create trigger pharmacy_stock_mapping_guard before update of facility_id,store_stock_item_id on public.pharmacy_inventory for each row execute function public.guard_pharmacy_stock_mapping();

create table public.purchase_approval_tiers(
 id uuid primary key default gen_random_uuid(),facility_id uuid not null references public.facilities(id) on delete restrict,
 minimum_amount numeric(14,2) not null check(minimum_amount>=0),maximum_amount numeric(14,2) check(maximum_amount is null or maximum_amount>minimum_amount),
 approvals_required integer not null check(approvals_required>0),approver_role text not null,
 configured_by uuid not null references public.profiles(id),configured_at timestamptz not null default now());
create index purchase_approval_tiers_scope on public.purchase_approval_tiers(facility_id,minimum_amount,maximum_amount);
create table public.suppliers(
 id uuid primary key default gen_random_uuid(),facility_id uuid not null references public.facilities(id) on delete restrict,
 supplier_name text not null,contact_details jsonb not null default '{}'::jsonb check(jsonb_typeof(contact_details)='object'),active boolean not null default true,
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),unique(facility_id,supplier_name));
create table public.purchase_orders(
 id uuid primary key default gen_random_uuid(),facility_id uuid not null references public.facilities(id) on delete restrict,
 supplier_id uuid not null references public.suppliers(id) on delete restrict,order_number text not null,status text not null default 'draft'
 check(status in ('draft','pending_approval','approved','partially_received','received','cancelled')),
 total_amount numeric(14,2) not null check(total_amount>0),created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 submitted_at timestamptz,approved_at timestamptz,unique(facility_id,order_number));
create table public.purchase_order_items(
 id uuid primary key default gen_random_uuid(),purchase_order_id uuid not null references public.purchase_orders(id) on delete restrict,
 stock_item_id uuid not null references public.store_stock_items(id) on delete restrict,
 description text not null,quantity_ordered numeric(14,3) not null check(quantity_ordered>0 and quantity_ordered=trunc(quantity_ordered)),unit_cost numeric(14,2) not null check(unit_cost>=0),
 created_at timestamptz not null default now());
create index purchase_order_items_order on public.purchase_order_items(purchase_order_id);
create table public.purchase_order_approvals(
 id uuid primary key default gen_random_uuid(),purchase_order_id uuid not null references public.purchase_orders(id) on delete restrict,
 approver_id uuid not null references public.profiles(id),decision text not null check(decision in ('approved','rejected')),
 note text,decided_at timestamptz not null default now(),unique(purchase_order_id,approver_id));
create table public.goods_received_notes(
 id uuid primary key default gen_random_uuid(),facility_id uuid not null references public.facilities(id) on delete restrict,
 purchase_order_id uuid not null references public.purchase_orders(id) on delete restrict,received_by uuid not null references public.profiles(id),received_at timestamptz not null default now(),supplier_delivery_reference text);
create table public.goods_received_note_items(
 id uuid primary key default gen_random_uuid(),goods_received_note_id uuid not null references public.goods_received_notes(id) on delete restrict,
 purchase_order_item_id uuid not null references public.purchase_order_items(id) on delete restrict,
 quantity_received numeric(14,3) not null check(quantity_received>0 and quantity_received=trunc(quantity_received)),location_id uuid not null references public.store_locations(id) on delete restrict,
 stock_movement_id uuid not null unique references public.stock_movements(id) on delete restrict,created_at timestamptz not null default now());
create table public.supplier_returns(
 id uuid primary key default gen_random_uuid(),facility_id uuid not null references public.facilities(id) on delete restrict,
 supplier_id uuid not null references public.suppliers(id) on delete restrict,return_reference text not null,reason text not null,
 recorded_by uuid not null references public.profiles(id),recorded_at timestamptz not null default now(),unique(facility_id,return_reference));
create table public.supplier_return_items(
 id uuid primary key default gen_random_uuid(),supplier_return_id uuid not null references public.supplier_returns(id) on delete restrict,
 goods_received_note_item_id uuid not null references public.goods_received_note_items(id) on delete restrict,
 quantity numeric(14,3) not null check(quantity>0 and quantity=trunc(quantity)),stock_movement_id uuid not null unique references public.stock_movements(id) on delete restrict);
create table public.supplier_performance_records(
 id uuid primary key default gen_random_uuid(),facility_id uuid not null references public.facilities(id) on delete restrict,
 supplier_id uuid not null references public.suppliers(id) on delete restrict,purchase_order_id uuid references public.purchase_orders(id) on delete restrict,
 evaluated_by uuid not null references public.profiles(id),delivery_score numeric(5,2) check(delivery_score between 0 and 100),
 quality_score numeric(5,2) check(quality_score between 0 and 100),notes text not null,recorded_at timestamptz not null default now());

-- Approval tier insertion validates coverage and forbids overlapping ranges. No
-- approval thresholds are seeded; a PO cannot leave draft until configured.
create or replace function public.configure_purchase_approval_tier(p_facility_id uuid,p_minimum numeric,p_maximum numeric,p_approvals integer,p_approver_role text)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid; result uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if actor is null or not public.has_org_permission('procurement.approve',p_facility_id,null) or p_minimum<0 or p_approvals<1 or nullif(btrim(p_approver_role),'') is null
  or p_maximum is not null and p_maximum<=p_minimum then raise exception 'Approval tier requires a valid threshold, approver count, role, and facility permission.'; end if;
 if exists(select 1 from public.purchase_approval_tiers t where t.facility_id=p_facility_id and numrange(t.minimum_amount,t.maximum_amount,'[)') && numrange(p_minimum,p_maximum,'[)')) then raise exception 'Purchase approval tiers may not overlap.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_facility_id::text||':purchase-approval-tiers',0));
 if exists(select 1 from public.purchase_approval_tiers t where t.facility_id=p_facility_id and numrange(t.minimum_amount,t.maximum_amount,'[)') && numrange(p_minimum,p_maximum,'[)')) then raise exception 'Purchase approval tiers may not overlap.'; end if;
 insert into public.purchase_approval_tiers(facility_id,minimum_amount,maximum_amount,approvals_required,approver_role,configured_by)
 values(p_facility_id,p_minimum,p_maximum,p_approvals,btrim(p_approver_role),actor) returning id into result; return result;
end $$;

create or replace function public.create_store_location(p_facility_id uuid,p_code text,p_name text)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid; result uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if actor is null or not public.has_org_permission('stock.manage',p_facility_id,null) or nullif(btrim(p_code),'') is null or nullif(btrim(p_name),'') is null then raise exception 'Store location is invalid or unauthorized.'; end if;
 insert into public.store_locations(facility_id,location_code,location_name,created_by) values(p_facility_id,btrim(p_code),btrim(p_name),actor) returning id into result; return result;
end $$;

create or replace function public.create_store_stock_item(p_facility_id uuid,p_code text,p_name text,p_unit text)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid; result uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if actor is null or not public.has_org_permission('stock.manage',p_facility_id,null) or nullif(btrim(p_code),'') is null or nullif(btrim(p_name),'') is null or nullif(btrim(p_unit),'') is null then raise exception 'Stock item is invalid or unauthorized.'; end if;
 insert into public.store_stock_items(facility_id,item_code,item_name,unit,created_by) values(p_facility_id,btrim(p_code),btrim(p_name),btrim(p_unit),actor) returning id into result; return result;
end $$;

create or replace function public.create_procurement_supplier(p_facility_id uuid,p_name text,p_contact_details jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid; result uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if actor is null or not public.has_org_permission('procurement.manage',p_facility_id,null) or nullif(btrim(p_name),'') is null or jsonb_typeof(p_contact_details)<>'object' then raise exception 'Supplier configuration is invalid or unauthorized.'; end if;
 insert into public.suppliers(facility_id,supplier_name,contact_details,created_by) values(p_facility_id,btrim(p_name),coalesce(p_contact_details,'{}'::jsonb),actor) returning id into result; return result;
end $$;

create or replace function public.record_store_item_movement(p_stock_item_id uuid,p_movement_type text,p_quantity numeric,p_direction text,p_source_location_id uuid,p_destination_location_id uuid,p_reason text,p_reference text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid; item public.store_stock_items%rowtype; result uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 select * into item from public.store_stock_items where id=p_stock_item_id and active for update;
 if item.id is null or actor is null or not public.has_org_permission('stock.manage',item.facility_id,null)
  or p_movement_type not in ('receipt','issue','transfer','adjustment','return') or p_quantity is null or p_quantity<=0 or p_quantity<>trunc(p_quantity)
  or nullif(btrim(p_reason),'') is null then raise exception 'Stock movement data is invalid or unauthorized.'; end if;
 insert into public.stock_movements(facility_id,stock_item_id,inventory_lot_id,movement_type,quantity,direction,source_location_id,destination_location_id,reason,reference,actor_id)
 values(item.facility_id,item.id,item.pharmacy_inventory_id,p_movement_type,p_quantity,p_direction,p_source_location_id,p_destination_location_id,btrim(p_reason),nullif(btrim(p_reference),''),actor) returning id into result;
 return result;
end $$;

create or replace function public.record_store_stock_movement(p_inventory_lot_id uuid,p_movement_type text,p_quantity numeric,p_direction text,p_source_location_id uuid,p_destination_location_id uuid,p_reason text,p_reference text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid; lot public.pharmacy_inventory%rowtype; facility uuid; item_id uuid; result uuid; opening numeric;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 select * into lot from public.pharmacy_inventory where id=p_inventory_lot_id for update;
 if lot.id is null then raise exception 'Pharmacy lot not found.'; end if;
 facility:=coalesce(lot.facility_id,(select facility_id from public.store_locations where id=coalesce(p_destination_location_id,p_source_location_id)));
 if actor is null or facility is null or not public.has_org_permission('stock.manage',facility,null) then raise exception 'Stock facility permission denied.'; end if;
 if lot.facility_id is null then
  if p_movement_type not in ('receipt','adjustment') or p_destination_location_id is null then raise exception 'Assign legacy inventory through a receipt or opening adjustment.'; end if;
  opening:=lot.stock_quantity; perform set_config('app.stock_projection_writer','on',true);
  update public.pharmacy_inventory set facility_id=facility,stock_quantity=0 where id=lot.id;
  perform set_config('app.stock_projection_writer','',true);
 end if;
 item_id:=lot.store_stock_item_id;
 if item_id is null then
  insert into public.store_stock_items(facility_id,item_code,item_name,unit,pharmacy_inventory_id,created_by)
   values(facility,'LOT-'||replace(lot.id::text,'-',''),lot.name,'unit',lot.id,actor) returning id into item_id;
  perform set_config('app.stock_projection_writer','on',true);
  update public.pharmacy_inventory set store_stock_item_id=item_id where id=lot.id;
  perform set_config('app.stock_projection_writer','',true);
 end if;
 if opening>0 then insert into public.stock_movements(facility_id,stock_item_id,inventory_lot_id,movement_type,quantity,direction,destination_location_id,reason,actor_id)
  values(facility,item_id,lot.id,'adjustment',opening,'in',p_destination_location_id,'Legacy opening balance reconciled to store ledger',actor); end if;
 result:=public.record_store_item_movement(item_id,p_movement_type,p_quantity,p_direction,p_source_location_id,p_destination_location_id,p_reason,p_reference);
 return result;
end $$;

create or replace function public.link_pharmacy_lot_to_store(p_inventory_lot_id uuid,p_facility_id uuid,p_item_code text,p_unit text default 'unit')
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid; lot public.pharmacy_inventory%rowtype; result uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 select * into lot from public.pharmacy_inventory where id=p_inventory_lot_id for update;
 if actor is null or lot.id is null or not public.has_org_permission('stock.manage',p_facility_id,null) or nullif(btrim(p_item_code),'') is null or nullif(btrim(p_unit),'') is null
  or lot.facility_id is not null and lot.facility_id<>p_facility_id or lot.store_stock_item_id is not null or lot.stock_quantity<>0 then raise exception 'Pharmacy lot must be empty or reconciled, unassigned, and authorized before linking to a store.'; end if;
 insert into public.store_stock_items(facility_id,item_code,item_name,unit,pharmacy_inventory_id,created_by) values(p_facility_id,btrim(p_item_code),lot.name,btrim(p_unit),lot.id,actor) returning id into result;
 perform set_config('app.stock_projection_writer','on',true);
 update public.pharmacy_inventory set facility_id=p_facility_id,store_stock_item_id=result where id=lot.id;
 perform set_config('app.stock_projection_writer','',true);
 return result;
end $$;

create or replace function public.submit_purchase_order(p_facility_id uuid,p_supplier_id uuid,p_order_number text,p_items jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid; total numeric; result uuid; item jsonb; stock_item uuid; qty numeric; cost numeric;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if actor is null or not public.has_org_permission('procurement.manage',p_facility_id,null) or not exists(select 1 from public.suppliers where id=p_supplier_id and facility_id=p_facility_id and active)
  or nullif(btrim(p_order_number),'') is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Purchase order is invalid or unauthorized.'; end if;
 select sum((item->>'quantity')::numeric*(item->>'unit_cost')::numeric) into total from jsonb_array_elements(p_items) as rows(item);
 if total is null or total<=0 then raise exception 'Purchase order total must be positive.'; end if;
 if not exists(select 1 from public.purchase_approval_tiers t where t.facility_id=p_facility_id and total>=t.minimum_amount and (t.maximum_amount is null or total<t.maximum_amount)) then raise exception 'Configure a purchase approval tier covering this order amount before submission.'; end if;
 insert into public.purchase_orders(facility_id,supplier_id,order_number,total_amount,created_by) values(p_facility_id,p_supplier_id,btrim(p_order_number),total,actor) returning id into result;
 for item in select value from jsonb_array_elements(p_items) loop
  stock_item:=(item->>'stock_item_id')::uuid; qty:=(item->>'quantity')::numeric; cost:=(item->>'unit_cost')::numeric;
  if qty<=0 or cost<0 or qty<>trunc(qty) or not exists(select 1 from public.store_stock_items where id=stock_item and facility_id=p_facility_id and active) then raise exception 'Purchase order line has an invalid stock item, quantity, or cost.'; end if;
  insert into public.purchase_order_items(purchase_order_id,stock_item_id,description,quantity_ordered,unit_cost)
   values(result,stock_item,coalesce(nullif(btrim(item->>'description'),''),(select item_name from public.store_stock_items where id=stock_item)),qty,cost);
 end loop;
 update public.purchase_orders set status='pending_approval',submitted_at=now() where id=result;
 return result;
end $$;

create or replace function public.approve_purchase_order(p_order_id uuid,p_decision text,p_note text default null)
returns text language plpgsql security definer set search_path=public as $$
declare actor uuid; po public.purchase_orders%rowtype; tier public.purchase_approval_tiers%rowtype; required integer; approved integer;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 select * into po from public.purchase_orders where id=p_order_id and status='pending_approval' for update;
 if actor is null or po.id is null or not public.has_org_permission('procurement.approve',po.facility_id,null) or actor=po.created_by or p_decision not in ('approved','rejected') then raise exception 'Purchase approval is unauthorized or unavailable.'; end if;
 select * into tier from public.purchase_approval_tiers t where t.facility_id=po.facility_id and po.total_amount>=t.minimum_amount and (t.maximum_amount is null or po.total_amount<t.maximum_amount);
 if tier.id is null or not public.has_any_role(array[tier.approver_role]) then raise exception 'No configured approval tier authorizes this user and purchase amount.'; end if;
 insert into public.purchase_order_approvals(purchase_order_id,approver_id,decision,note) values(po.id,actor,p_decision,nullif(btrim(p_note),''));
 if p_decision='rejected' then update public.purchase_orders set status='cancelled' where id=po.id; return 'rejected'; end if;
 select count(*) into approved from public.purchase_order_approvals where purchase_order_id=po.id and decision='approved';
 required:=tier.approvals_required;
 if approved>=required then update public.purchase_orders set status='approved',approved_at=now() where id=po.id; return 'approved'; end if;
 return 'approval_pending';
end $$;

create or replace function public.receive_purchase_order(p_order_id uuid,p_receipt_lines jsonb,p_supplier_delivery_reference text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid; po public.purchase_orders%rowtype; item public.purchase_order_items%rowtype; note uuid; movement uuid; line jsonb; qty numeric; received numeric;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 select * into po from public.purchase_orders where id=p_order_id and status in ('approved','partially_received') for update;
 if actor is null or po.id is null or not public.has_org_permission('procurement.manage',po.facility_id,null) or jsonb_typeof(p_receipt_lines)<>'array' or jsonb_array_length(p_receipt_lines)=0 then raise exception 'Goods receipt is invalid or unauthorized.'; end if;
 insert into public.goods_received_notes(facility_id,purchase_order_id,received_by,supplier_delivery_reference) values(po.facility_id,po.id,actor,nullif(btrim(p_supplier_delivery_reference),'')) returning id into note;
 for line in select value from jsonb_array_elements(p_receipt_lines) loop
  select * into item from public.purchase_order_items where id=(line->>'purchase_order_item_id')::uuid and purchase_order_id=po.id for update;
  qty:=(line->>'quantity')::numeric;
  if item.id is null or qty is null or qty<=0 or not exists(select 1 from public.store_locations where id=(line->>'location_id')::uuid and facility_id=po.facility_id and active) then raise exception 'Receipt line is invalid or has an unavailable location.'; end if;
  select coalesce(sum(i.quantity_received),0) into received from public.goods_received_note_items i where i.purchase_order_item_id=item.id;
  if qty>item.quantity_ordered-received then raise exception 'Receipt quantity exceeds the remaining quantity on a purchase order line.'; end if;
  movement:=public.record_store_item_movement(item.stock_item_id,'receipt',qty,'in',null,(line->>'location_id')::uuid,'Goods received against purchase order '||po.order_number,po.order_number);
  insert into public.goods_received_note_items(goods_received_note_id,purchase_order_item_id,quantity_received,location_id,stock_movement_id)
   values(note,item.id,qty,(line->>'location_id')::uuid,movement);
 end loop;
 if exists(select 1 from public.purchase_order_items i where i.purchase_order_id=po.id and i.quantity_ordered>coalesce((select sum(g.quantity_received) from public.goods_received_note_items g where g.purchase_order_item_id=i.id),0)) then
  update public.purchase_orders set status='partially_received' where id=po.id;
 else update public.purchase_orders set status='received' where id=po.id; end if;
 return note;
end $$;

create or replace function public.return_supplier_goods(p_supplier_id uuid,p_return_reference text,p_reason text,p_return_lines jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid; facility uuid; result uuid; line jsonb; received_line public.goods_received_note_items%rowtype; qty numeric; returned numeric; item public.purchase_order_items%rowtype; movement uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 select facility_id into facility from public.suppliers where id=p_supplier_id and active;
 if actor is null or facility is null or not public.has_org_permission('procurement.manage',facility,null) or nullif(btrim(p_return_reference),'') is null
  or nullif(btrim(p_reason),'') is null or jsonb_typeof(p_return_lines)<>'array' or jsonb_array_length(p_return_lines)=0 then raise exception 'Supplier return is invalid or unauthorized.'; end if;
 insert into public.supplier_returns(facility_id,supplier_id,return_reference,reason,recorded_by) values(facility,p_supplier_id,btrim(p_return_reference),btrim(p_reason),actor) returning id into result;
 for line in select value from jsonb_array_elements(p_return_lines) loop
  select g.* into received_line from public.goods_received_note_items g join public.goods_received_notes n on n.id=g.goods_received_note_id
   join public.purchase_orders o on o.id=n.purchase_order_id where g.id=(line->>'goods_received_note_item_id')::uuid and o.supplier_id=p_supplier_id and o.facility_id=facility for update of g;
  qty:=(line->>'quantity')::numeric;
  if received_line.id is null or qty is null or qty<=0 then raise exception 'Supplier return line must reference goods received from this supplier.'; end if;
  select coalesce(sum(quantity),0) into returned from public.supplier_return_items where goods_received_note_item_id=received_line.id;
  select i.* into item from public.purchase_order_items i where i.id=received_line.purchase_order_item_id;
  if qty>received_line.quantity_received-returned then raise exception 'Supplier return exceeds the unreturned received quantity.'; end if;
  movement:=public.record_store_item_movement(item.stock_item_id,'return',qty,'out',received_line.location_id,null,btrim(p_reason),btrim(p_return_reference));
  insert into public.supplier_return_items(supplier_return_id,goods_received_note_item_id,quantity,stock_movement_id) values(result,received_line.id,qty,movement);
 end loop;
 return result;
end $$;

create or replace function public.record_supplier_performance(p_supplier_id uuid,p_purchase_order_id uuid,p_delivery_score numeric,p_quality_score numeric,p_notes text)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid; facility uuid; result uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 select facility_id into facility from public.suppliers where id=p_supplier_id and active;
 if actor is null or facility is null or not public.has_org_permission('procurement.manage',facility,null) or nullif(btrim(p_notes),'') is null
  or p_delivery_score not between 0 and 100 or p_quality_score not between 0 and 100
  or (p_purchase_order_id is not null and not exists(select 1 from public.purchase_orders where id=p_purchase_order_id and supplier_id=p_supplier_id)) then raise exception 'Supplier performance record is invalid or unauthorized.'; end if;
 insert into public.supplier_performance_records(facility_id,supplier_id,purchase_order_id,evaluated_by,delivery_score,quality_score,notes)
 values(facility,p_supplier_id,p_purchase_order_id,actor,p_delivery_score,p_quality_score,btrim(p_notes)) returning id into result; return result;
end $$;

do $$ declare t text; begin foreach t in array array['store_locations','store_stock_items','stock_balances','stock_movements','purchase_approval_tiers','suppliers','purchase_orders','purchase_order_items','purchase_order_approvals','goods_received_notes','goods_received_note_items','supplier_returns','supplier_return_items','supplier_performance_records'] loop
 execute format('alter table public.%I enable row level security',t); execute format('revoke all on public.%I from public,anon,authenticated',t); execute format('grant select on public.%I to authenticated',t); execute format('grant select,insert on public.%I to service_role',t);
 if t in ('store_locations','store_stock_items','stock_balances','stock_movements') then execute format('create policy stock_facility_read on public.%I for select to authenticated using(public.has_org_permission(''stock.read'',facility_id,null))',t);
 elsif t in ('purchase_approval_tiers','suppliers','purchase_orders','goods_received_notes','supplier_returns','supplier_performance_records') then execute format('create policy procurement_facility_read on public.%I for select to authenticated using(public.has_org_permission(''procurement.manage'',facility_id,null) or public.has_org_permission(''procurement.approve'',facility_id,null))',t);
 elsif t in ('purchase_order_items','purchase_order_approvals') then execute format('create policy procurement_child_read on public.%I for select to authenticated using(exists(select 1 from public.purchase_orders p where p.id=%I.purchase_order_id and (public.has_org_permission(''procurement.manage'',p.facility_id,null) or public.has_org_permission(''procurement.approve'',p.facility_id,null))))',t,t);
 elsif t='goods_received_note_items' then execute format('create policy procurement_child_read on public.%I for select to authenticated using(exists(select 1 from public.goods_received_notes n join public.purchase_orders p on p.id=n.purchase_order_id where n.id=%I.goods_received_note_id and (public.has_org_permission(''procurement.manage'',p.facility_id,null) or public.has_org_permission(''procurement.approve'',p.facility_id,null))))',t,t);
 else execute format('create policy procurement_child_read on public.%I for select to authenticated using(exists(select 1 from public.supplier_returns r where r.id=%I.supplier_return_id and (public.has_org_permission(''procurement.manage'',r.facility_id,null) or public.has_org_permission(''procurement.approve'',r.facility_id,null))))',t,t); end if;
 execute format('create trigger audit_%I after insert or update on public.%I for each row execute function public.audit_row_change()',t,t);
 end loop; end $$;
create trigger stock_movements_immutable before update or delete on public.stock_movements for each row execute function public.prevent_consultation_history_mutation();
create trigger supplier_return_items_immutable before update or delete on public.supplier_return_items for each row execute function public.prevent_consultation_history_mutation();
create trigger purchase_approval_immutable before update or delete on public.purchase_order_approvals for each row execute function public.prevent_consultation_history_mutation();

revoke all on function public.apply_stock_movement(),public.guard_legacy_pharmacy_stock_change(),public.guard_pharmacy_stock_mapping(),public.configure_purchase_approval_tier(uuid,numeric,numeric,integer,text),public.create_store_location(uuid,text,text),public.create_store_stock_item(uuid,text,text,text),
 public.record_store_item_movement(uuid,text,numeric,text,uuid,uuid,text,text),public.record_store_stock_movement(uuid,text,numeric,text,uuid,uuid,text,text),public.link_pharmacy_lot_to_store(uuid,uuid,text,text),public.submit_purchase_order(uuid,uuid,text,jsonb),public.approve_purchase_order(uuid,text,text),
 public.receive_purchase_order(uuid,jsonb,text),public.return_supplier_goods(uuid,text,text,jsonb),public.record_supplier_performance(uuid,uuid,numeric,numeric,text),public.create_procurement_supplier(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.configure_purchase_approval_tier(uuid,numeric,numeric,integer,text),public.create_store_location(uuid,text,text),public.create_store_stock_item(uuid,text,text,text),public.create_procurement_supplier(uuid,text,jsonb),
 public.record_store_item_movement(uuid,text,numeric,text,uuid,uuid,text,text),public.record_store_stock_movement(uuid,text,numeric,text,uuid,uuid,text,text),public.link_pharmacy_lot_to_store(uuid,uuid,text,text),public.submit_purchase_order(uuid,uuid,text,jsonb),public.approve_purchase_order(uuid,text,text),
 public.receive_purchase_order(uuid,jsonb,text),public.return_supplier_goods(uuid,text,text,jsonb),public.record_supplier_performance(uuid,uuid,numeric,numeric,text) to authenticated;
notify pgrst,'reload schema';
commit;
