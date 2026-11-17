begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

-- Procurement RPCs may post only the stock movements that follow from an
-- approved purchase order or a supplier return. The context flag is set inside
-- those SECURITY DEFINER workflows after their procurement checks pass.
create or replace function public.record_store_item_movement(p_stock_item_id uuid,p_movement_type text,p_quantity numeric,p_direction text,p_source_location_id uuid,p_destination_location_id uuid,p_reason text,p_reference text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid; item public.store_stock_items%rowtype; result uuid; procurement_writer boolean;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 select * into item from public.store_stock_items where id=p_stock_item_id and active for update;
 procurement_writer:=current_setting('app.purchase_order_stock_writer',true)='on'
  and public.has_org_permission('procurement.manage',item.facility_id,null);
 if item.id is null or actor is null or (not public.has_org_permission('stock.manage',item.facility_id,null) and not procurement_writer)
  or p_movement_type not in ('receipt','issue','transfer','adjustment','return') or p_quantity is null or p_quantity<=0 or p_quantity<>trunc(p_quantity)
  or nullif(btrim(p_reason),'') is null then raise exception 'Stock movement data is invalid or unauthorized.'; end if;
 insert into public.stock_movements(facility_id,stock_item_id,inventory_lot_id,movement_type,quantity,direction,source_location_id,destination_location_id,reason,reference,actor_id)
 values(item.facility_id,item.id,item.pharmacy_inventory_id,p_movement_type,p_quantity,p_direction,p_source_location_id,p_destination_location_id,btrim(p_reason),nullif(btrim(p_reference),''),actor) returning id into result;
 return result;
end $$;

create or replace function public.receive_purchase_order(p_order_id uuid,p_receipt_lines jsonb,p_supplier_delivery_reference text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid; po public.purchase_orders%rowtype; item public.purchase_order_items%rowtype; note uuid; movement uuid; line jsonb; qty numeric; received numeric; previous_writer text;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 select * into po from public.purchase_orders where id=p_order_id and status in ('approved','partially_received') for update;
 if actor is null or po.id is null or not public.has_org_permission('procurement.manage',po.facility_id,null) or jsonb_typeof(p_receipt_lines)<>'array' or jsonb_array_length(p_receipt_lines)=0 then raise exception 'Goods receipt is invalid or unauthorized.'; end if;
 insert into public.goods_received_notes(facility_id,purchase_order_id,received_by,supplier_delivery_reference) values(po.facility_id,po.id,actor,nullif(btrim(p_supplier_delivery_reference),'')) returning id into note;
 previous_writer:=current_setting('app.purchase_order_stock_writer',true);
 perform set_config('app.purchase_order_stock_writer','on',true);
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
 perform set_config('app.purchase_order_stock_writer',coalesce(previous_writer,''),true);
 if exists(select 1 from public.purchase_order_items i where i.purchase_order_id=po.id and i.quantity_ordered>coalesce((select sum(g.quantity_received) from public.goods_received_note_items g where g.purchase_order_item_id=i.id),0)) then
  update public.purchase_orders set status='partially_received' where id=po.id;
 else update public.purchase_orders set status='received' where id=po.id; end if;
 return note;
end $$;

create or replace function public.return_supplier_goods(p_supplier_id uuid,p_return_reference text,p_reason text,p_return_lines jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid; facility uuid; result uuid; line jsonb; received_line public.goods_received_note_items%rowtype; qty numeric; returned numeric; item public.purchase_order_items%rowtype; movement uuid; previous_writer text;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 select facility_id into facility from public.suppliers where id=p_supplier_id and active;
 if actor is null or facility is null or not public.has_org_permission('procurement.manage',facility,null) or nullif(btrim(p_return_reference),'') is null
  or nullif(btrim(p_reason),'') is null or jsonb_typeof(p_return_lines)<>'array' or jsonb_array_length(p_return_lines)=0 then raise exception 'Supplier return is invalid or unauthorized.'; end if;
 insert into public.supplier_returns(facility_id,supplier_id,return_reference,reason,recorded_by) values(facility,p_supplier_id,btrim(p_return_reference),btrim(p_reason),actor) returning id into result;
 previous_writer:=current_setting('app.purchase_order_stock_writer',true);
 perform set_config('app.purchase_order_stock_writer','on',true);
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
 perform set_config('app.purchase_order_stock_writer',coalesce(previous_writer,''),true);
 return result;
end $$;

revoke all on function public.record_store_item_movement(uuid,text,numeric,text,uuid,uuid,text,text),public.receive_purchase_order(uuid,jsonb,text),public.return_supplier_goods(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.record_store_item_movement(uuid,text,numeric,text,uuid,uuid,text,text),public.receive_purchase_order(uuid,jsonb,text),public.return_supplier_goods(uuid,text,text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
