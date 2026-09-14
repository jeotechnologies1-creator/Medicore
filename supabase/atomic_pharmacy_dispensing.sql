-- Run after schema.sql and production_hardening.sql.
-- Dispenses every medication in a prescription as one database transaction.

create or replace function public.dispense_prescription(p_prescription_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_profile_id uuid;
  actor_role text;
  prescription_row public.prescriptions%rowtype;
  medication jsonb;
  inventory_row public.pharmacy_inventory%rowtype;
  medication_name text;
  requested_quantity integer;
  next_quantity integer;
  next_status text;
  dispensed_items jsonb := '[]'::jsonb;
begin
  select id, role into actor_profile_id, actor_role
  from public.profiles
  where auth_user_id = auth.uid() and status = 'active'
  limit 1;

  if actor_profile_id is null or actor_role not in ('super_admin', 'pharmacist') then
    raise exception 'Only an active pharmacist or Super Admin may dispense medication';
  end if;

  select * into prescription_row
  from public.prescriptions
  where id = p_prescription_id
  for update;

  if not found then raise exception 'Prescription not found'; end if;
  if prescription_row.status <> 'active' then raise exception 'Only active prescriptions may be dispensed'; end if;
  if jsonb_typeof(prescription_row.medications) <> 'array' or jsonb_array_length(prescription_row.medications) = 0 then
    raise exception 'Prescription has no medications to dispense';
  end if;

  for medication in select value from jsonb_array_elements(prescription_row.medications)
  loop
    medication_name := nullif(trim(medication ->> 'name'), '');
    requested_quantity := coalesce(nullif(medication ->> 'quantity', '')::integer, 1);
    if medication_name is null or requested_quantity <= 0 then
      raise exception 'Each prescription medication must have a name and a positive whole-number quantity';
    end if;

    -- FEFO: dispense the earliest non-expired lot first. A future enhancement
    -- should accept a barcode/lot identifier for explicit lot selection.
    select * into inventory_row
    from public.pharmacy_inventory
    where lower(trim(name)) = lower(medication_name)
      and stock_quantity >= requested_quantity
      and (expiry_date is null or expiry_date >= current_date)
    order by expiry_date nulls last, created_at, id
    limit 1
    for update;

    if not found then
      raise exception 'Insufficient non-expired stock for %', medication_name;
    end if;

    next_quantity := inventory_row.stock_quantity - requested_quantity;
    next_status := case when next_quantity <= inventory_row.reorder_level then 'low_stock' else 'active' end;
    update public.pharmacy_inventory
    set stock_quantity = next_quantity, status = next_status
    where id = inventory_row.id;

    dispensed_items := dispensed_items || jsonb_build_array(jsonb_build_object(
      'inventoryId', inventory_row.id,
      'medicationName', inventory_row.name,
      'quantity', requested_quantity,
      'remainingStock', next_quantity,
      'status', next_status
    ));
  end loop;

  update public.prescriptions set status = 'dispensed' where id = p_prescription_id;
  insert into public.audit_logs(user_id, action, entity_type, entity_id, severity)
  values (actor_profile_id, 'DISPENSE', 'prescriptions', p_prescription_id::text, 'info');

  return jsonb_build_object('prescriptionId', p_prescription_id, 'status', 'dispensed', 'items', dispensed_items);
end;
$$;

revoke all on function public.dispense_prescription(uuid) from public;
grant execute on function public.dispense_prescription(uuid) to authenticated;
