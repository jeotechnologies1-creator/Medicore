begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

create table if not exists public.formulary_items (
  id uuid primary key default gen_random_uuid(),
  atc_code text,
  generic_name text not null,
  form text not null,
  strength text not null,
  unit text not null,
  route text not null,
  controlled boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(atc_code,generic_name,form,strength,route)
);
create index if not exists formulary_items_search_idx on public.formulary_items using gin(to_tsvector('simple',generic_name));
create index if not exists formulary_items_atc_idx on public.formulary_items(atc_code) where atc_code is not null;

create table if not exists public.prescription_items (
  id uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references public.prescriptions(id) on delete cascade,
  formulary_item_id uuid not null references public.formulary_items(id) on delete restrict,
  dose numeric(12,4) not null check(dose>0),
  dose_unit text not null,
  frequency text not null,
  route text not null,
  duration text,
  quantity numeric(12,3) not null check(quantity>0 and quantity=trunc(quantity)),
  instructions text,
  legacy_item_index integer,
  created_at timestamptz not null default now()
);
create index if not exists prescription_items_prescription_idx on public.prescription_items(prescription_id);
create index if not exists prescription_items_formulary_idx on public.prescription_items(formulary_item_id);
create unique index if not exists prescription_items_legacy_position_idx on public.prescription_items(prescription_id,legacy_item_index) where legacy_item_index is not null;

create or replace function public.create_structured_prescription(
  p_patient_id uuid,p_encounter_id uuid,p_diagnosis text,p_code_system text,p_code text,p_display text,
  p_formulary_item_id uuid,p_dose numeric,p_dose_unit text,p_frequency text,p_route text,p_duration text,
  p_quantity numeric,p_instructions text,p_priority text
) returns uuid language plpgsql security definer set search_path=public as $$
declare profile_id uuid; prescription_id uuid; item public.formulary_items%rowtype;
begin
  select id into profile_id from public.profiles where auth_user_id=auth.uid() and status::text='active'
    and role::text in ('doctor','specialist','super_admin') limit 1;
  if profile_id is null then raise exception 'Only an active prescriber may create a medication order'; end if;
  if public.mfa_required_for_current_user() and not public.has_aal2() then raise exception 'Multi-factor authentication is required for prescribing'; end if;
  if not public.has_clinical_department_permission(p_patient_id,null,'medication.prescribe',false) then raise exception 'Clinical department access denied'; end if;
  if p_patient_id is null or nullif(trim(p_diagnosis),'') is null or p_dose<=0 or p_quantity<=0 or p_quantity<>trunc(p_quantity)
    or nullif(trim(p_dose_unit),'') is null or nullif(trim(p_frequency),'') is null or nullif(trim(p_route),'') is null
    then raise exception 'Patient, diagnosis, dose, dose unit, frequency, route, and whole-number quantity are required'; end if;
  if (p_code_system is null)<>(p_code is null) or (p_code is null)<>(p_display is null) then raise exception 'Diagnosis coding must be complete'; end if;
  if p_code is not null and not exists(select 1 from public.concepts where system=p_code_system and code=p_code and display=p_display) then raise exception 'Diagnosis concept is not loaded'; end if;
  select * into item from public.formulary_items where id=p_formulary_item_id and active;
  if not found then raise exception 'Active formulary item not found'; end if;
  if lower(item.route)<>lower(trim(p_route)) then raise exception 'Prescribed route does not match the formulary route'; end if;
  insert into public.prescriptions(patient_id,encounter_id,doctor_id,diagnosis,code_system,code,display,medications,priority,status)
    values(p_patient_id,p_encounter_id,profile_id,trim(p_diagnosis),p_code_system,p_code,p_display,'[]'::jsonb,coalesce(p_priority,'routine'),'active') returning id into prescription_id;
  insert into public.prescription_items(prescription_id,formulary_item_id,dose,dose_unit,frequency,route,duration,quantity,instructions)
    values(prescription_id,item.id,p_dose,trim(p_dose_unit),trim(p_frequency),item.route,nullif(trim(p_duration),''),p_quantity,nullif(trim(p_instructions),''));
  return prescription_id;
end $$;
revoke all on function public.create_structured_prescription(uuid,uuid,text,text,text,text,uuid,numeric,text,text,text,text,numeric,text,text) from public,anon;
grant execute on function public.create_structured_prescription(uuid,uuid,text,text,text,text,uuid,numeric,text,text,text,text,numeric,text,text) to authenticated;

-- Inventory rows are stock lots. A lot is linked to one formulary item; display
-- names are retained for historical inventory reports but never drive dispensing.
alter table public.pharmacy_inventory add column if not exists formulary_item_id uuid references public.formulary_items(id) on delete restrict;
create index if not exists pharmacy_inventory_formulary_lot_idx on public.pharmacy_inventory(formulary_item_id,expiry_date,created_at,id);

create or replace function public.validate_formulary_atc()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.atc_code is not null and not exists(select 1 from public.concepts where system='ATC' and code=new.atc_code and active) then
    raise exception 'ATC code must exist in the loaded official terminology';
  end if;
  return new;
end $$;
revoke all on function public.validate_formulary_atc() from public,anon,authenticated;
drop trigger if exists validate_formulary_atc on public.formulary_items;
create trigger validate_formulary_atc before insert or update of atc_code on public.formulary_items for each row execute function public.validate_formulary_atc();

create table if not exists public.prescription_item_migration_issues (
  id bigint generated always as identity primary key,
  prescription_id uuid not null references public.prescriptions(id) on delete restrict,
  legacy_item jsonb not null,
  reason text not null,
  reported_at timestamptz not null default now(),
  unique(prescription_id,legacy_item)
);

create or replace function public.migrate_legacy_prescription_items()
returns jsonb language plpgsql security definer set search_path=public as $$
declare rx record; med jsonb; med_index bigint; matched public.formulary_items%rowtype; mapped integer:=0; issues integer:=0; qty numeric;
begin
  insert into public.prescription_item_migration_issues(prescription_id,legacy_item,reason)
  select id,medications,'Legacy medications value is not a JSON array.' from public.prescriptions
    where jsonb_typeof(medications)<>'array'
  on conflict(prescription_id,legacy_item) do nothing;
  for rx in select p.id,p.medications from public.prescriptions p
    where jsonb_typeof(p.medications)='array' and exists(select 1 from jsonb_array_elements(p.medications) with ordinality x(value,n)
      where not exists(select 1 from public.prescription_items i where i.prescription_id=p.id and i.legacy_item_index=x.n))
  loop
    for med,med_index in select value,ordinality from jsonb_array_elements(rx.medications) with ordinality
    loop
      if exists(select 1 from public.prescription_items i where i.prescription_id=rx.id and i.legacy_item_index=med_index) then continue; end if;
      delete from public.prescription_item_migration_issues where prescription_id=rx.id and legacy_item=med;
      select f.* into matched from public.formulary_items f where f.active and
        lower(trim(f.generic_name))=lower(trim(coalesce(med->>'generic_name',med->>'name','')))
        and (nullif(trim(med->>'route'),'') is null or lower(f.route)=lower(trim(med->>'route')))
        and (nullif(trim(med->>'strength'),'') is null or lower(f.strength)=lower(trim(med->>'strength')))
      order by f.id limit 2;
      if found and (select count(*) from public.formulary_items f where f.active and
        lower(trim(f.generic_name))=lower(trim(coalesce(med->>'generic_name',med->>'name','')))
        and (nullif(trim(med->>'route'),'') is null or lower(f.route)=lower(trim(med->>'route')))
        and (nullif(trim(med->>'strength'),'') is null or lower(f.strength)=lower(trim(med->>'strength'))))=1
        and coalesce(nullif(med->>'dose',''),'') ~ '^[0-9]+(\.[0-9]+)?$'
        and coalesce(nullif(med->>'quantity',''),'') ~ '^[0-9]+$'
        and nullif(trim(med->>'frequency'),'') is not null then
        qty:=(med->>'quantity')::numeric;
        insert into public.prescription_items(prescription_id,formulary_item_id,dose,dose_unit,frequency,route,duration,quantity,instructions,legacy_item_index)
        values(rx.id,matched.id,(med->>'dose')::numeric,coalesce(nullif(med->>'dose_unit',''),matched.unit),med->>'frequency',coalesce(nullif(med->>'route',''),matched.route),nullif(med->>'duration',''),qty,nullif(med->>'instructions',''),med_index::integer);
        mapped:=mapped+1;
      else
        insert into public.prescription_item_migration_issues(prescription_id,legacy_item,reason)
        values(rx.id,med,'No unique active formulary match or legacy dose, quantity, or frequency is incomplete.')
        on conflict(prescription_id,legacy_item) do nothing;
        issues:=issues+1;
      end if;
    end loop;
  end loop;
  return jsonb_build_object('mapped_items',mapped,'unmapped_items',issues,
    'unmapped_prescriptions',(select count(distinct prescription_id) from public.prescription_item_migration_issues));
end $$;
revoke all on function public.migrate_legacy_prescription_items() from public,anon,authenticated;
grant execute on function public.migrate_legacy_prescription_items() to service_role;
-- Initial import records unmatched legacy rows. Re-run after the official
-- formulary load to map entries that were not yet resolvable.
select public.migrate_legacy_prescription_items();

-- Controlled medicine custody uses an append-only movement register. Dispense
-- requires two different active staff members and atomically decrements balance.
create table if not exists public.controlled_drug_register (
  inventory_lot_id uuid primary key references public.pharmacy_inventory(id) on delete restrict,
  balance numeric(12,3) not null check(balance>=0),
  updated_at timestamptz not null default now()
);
create table if not exists public.controlled_drug_movements (
  id bigint generated always as identity primary key,
  inventory_lot_id uuid not null references public.pharmacy_inventory(id) on delete restrict,
  prescription_item_id uuid references public.prescription_items(id) on delete restrict,
  movement_type text not null check(movement_type in ('receipt','dispense','adjustment','return')),
  quantity numeric(12,3) not null check(quantity<>0),
  balance_after numeric(12,3) not null check(balance_after>=0),
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  verifier_profile_id uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check((movement_type='dispense' and verifier_profile_id is not null and verifier_profile_id<>actor_profile_id)
     or (movement_type<>'dispense' and verifier_profile_id is null))
);
create index if not exists controlled_drug_movements_lot_idx on public.controlled_drug_movements(inventory_lot_id,created_at desc);

create table if not exists public.controlled_drug_dispense_approvals (
  id uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references public.prescriptions(id) on delete restrict,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  approved_by uuid references public.profiles(id) on delete restrict,
  status text not null default 'pending' check(status in ('pending','approved','completed')),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  completed_at timestamptz,
  check((status='pending' and approved_by is null and approved_at is null and completed_at is null)
     or (status='approved' and approved_by is not null and approved_at is not null and completed_at is null)
     or (status='completed' and approved_by is not null and approved_at is not null and completed_at is not null))
);
create unique index if not exists controlled_drug_approval_open_rx_idx on public.controlled_drug_dispense_approvals(prescription_id) where status in ('pending','approved');
create index if not exists controlled_drug_approval_pending_idx on public.controlled_drug_dispense_approvals(created_at) where status='pending';

create or replace function public.record_controlled_drug_receipt(p_inventory_lot_id uuid,p_quantity numeric,p_actor_profile_id uuid)
returns numeric language plpgsql security definer set search_path=public as $$
declare next_balance numeric;
begin
  if p_quantity<=0 then raise exception 'Receipt quantity must be positive'; end if;
  if not exists(select 1 from public.pharmacy_inventory i join public.formulary_items f on f.id=i.formulary_item_id
    where i.id=p_inventory_lot_id and f.controlled) then raise exception 'Lot is not linked to a controlled formulary item'; end if;
  if not exists(select 1 from public.profiles where id=p_actor_profile_id and status::text='active' and role::text in ('pharmacist','super_admin')) then
    raise exception 'Controlled medicine receiver must be an active pharmacist or Super Admin'; end if;
  insert into public.controlled_drug_register(inventory_lot_id,balance) values(p_inventory_lot_id,p_quantity)
    on conflict(inventory_lot_id) do update set balance=public.controlled_drug_register.balance+excluded.balance,updated_at=now()
    returning balance into next_balance;
  insert into public.controlled_drug_movements(inventory_lot_id,movement_type,quantity,balance_after,actor_profile_id)
    values(p_inventory_lot_id,'receipt',p_quantity,next_balance,p_actor_profile_id);
  return next_balance;
end $$;
revoke all on function public.record_controlled_drug_receipt(uuid,numeric,uuid) from public,anon,authenticated;
grant execute on function public.record_controlled_drug_receipt(uuid,numeric,uuid) to service_role;

drop function if exists public.dispense_prescription(uuid);
create or replace function public.dispense_prescription(
  p_prescription_id uuid,p_lots jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare actor_profile_id uuid; dispensing_actor_id uuid; verifier_id uuid; actor_role text; rx public.prescriptions%rowtype; item record; lot public.pharmacy_inventory%rowtype;
  approval_id uuid; approval_status text; remaining numeric; controlled_balance numeric; requested_lot uuid; results jsonb:='[]'::jsonb;
begin
  select id,role::text into actor_profile_id,actor_role from public.profiles
    where auth_user_id=auth.uid() and status::text='active' limit 1;
  if actor_profile_id is null or actor_role not in ('super_admin','pharmacist') then raise exception 'Only an active pharmacist or Super Admin may dispense medication'; end if;
  if public.mfa_required_for_current_user() and not public.has_aal2() then raise exception 'Multi-factor authentication is required for dispensing'; end if;
  if p_lots is null or jsonb_typeof(p_lots)<>'object' then raise exception 'Lot selections must be a JSON object'; end if;
  select * into rx from public.prescriptions where id=p_prescription_id for update;
  if not found then raise exception 'Prescription not found'; end if;
  if not public.has_clinical_department_permission(rx.patient_id,null,'medication.dispense',false) then raise exception 'Pharmacy department access denied'; end if;
  if rx.status<>'active' then raise exception 'Only active prescriptions may be dispensed'; end if;
  if not exists(select 1 from public.prescription_items where prescription_id=rx.id) then raise exception 'Prescription has no structured medication items'; end if;
  dispensing_actor_id:=actor_profile_id;
  if exists(select 1 from public.prescription_items pi join public.formulary_items f on f.id=pi.formulary_item_id where pi.prescription_id=rx.id and f.controlled) then
    select id,requested_by,approved_by,status into approval_id,dispensing_actor_id,verifier_id,approval_status
      from public.controlled_drug_dispense_approvals where prescription_id=rx.id and status='approved' for update;
    if not found then
      insert into public.controlled_drug_dispense_approvals(prescription_id,requested_by) values(rx.id,actor_profile_id)
        on conflict do nothing;
      return jsonb_build_object('prescriptionId',rx.id,'status','awaiting_second_verification','items','[]'::jsonb);
    end if;
    if verifier_id<>actor_profile_id or dispensing_actor_id=verifier_id then raise exception 'Controlled dispense must be finalized by its distinct authenticated verifier'; end if;
  else verifier_id:=null;
  end if;

  for item in select pi.*,f.generic_name,f.controlled from public.prescription_items pi join public.formulary_items f on f.id=pi.formulary_item_id
    where pi.prescription_id=rx.id order by pi.id
  loop
    requested_lot:=nullif(p_lots->>item.id::text,'')::uuid;
    if requested_lot is null then
      select id into requested_lot from public.pharmacy_inventory where formulary_item_id=item.formulary_item_id
        and stock_quantity>=item.quantity and (expiry_date is null or expiry_date>=current_date)
      order by expiry_date nulls last,created_at,id limit 1;
    end if;
    select * into lot from public.pharmacy_inventory where id=requested_lot and formulary_item_id=item.formulary_item_id
      and stock_quantity>=item.quantity and (expiry_date is null or expiry_date>=current_date) for update;
    if not found then raise exception 'No eligible selected lot has sufficient stock for %',item.generic_name; end if;
    if item.controlled then
      if verifier_id is null or verifier_id=dispensing_actor_id then raise exception 'Controlled medicine requires an independent authenticated verifier'; end if;
      select balance into controlled_balance from public.controlled_drug_register where inventory_lot_id=lot.id for update;
      if not found or controlled_balance<item.quantity then raise exception 'Controlled drug register balance is insufficient for lot %',lot.id; end if;
      remaining:=controlled_balance-item.quantity;
      update public.controlled_drug_register set balance=remaining,updated_at=now() where inventory_lot_id=lot.id;
      insert into public.controlled_drug_movements(inventory_lot_id,prescription_item_id,movement_type,quantity,balance_after,actor_profile_id,verifier_profile_id)
      values(lot.id,item.id,'dispense',-item.quantity,remaining,dispensing_actor_id,verifier_id);
    end if;
    remaining:=lot.stock_quantity-item.quantity;
    update public.pharmacy_inventory set stock_quantity=remaining::integer,status=case when remaining<=reorder_level then 'low_stock' else 'active' end where id=lot.id;
    results:=results||jsonb_build_array(jsonb_build_object('prescriptionItemId',item.id,'inventoryId',lot.id,'formularyItemId',item.formulary_item_id,'medicationName',item.generic_name,'quantity',item.quantity,'remainingStock',remaining,'status',case when remaining<=lot.reorder_level then 'low_stock' else 'active' end));
  end loop;
  update public.prescriptions set status='dispensed' where id=rx.id;
  if approval_id is not null then update public.controlled_drug_dispense_approvals set status='completed',completed_at=now() where id=approval_id; end if;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,severity) values(dispensing_actor_id,'DISPENSE','prescriptions',rx.id::text,'info');
  return jsonb_build_object('prescriptionId',rx.id,'status','dispensed','items',results);
end $$;
revoke all on function public.dispense_prescription(uuid,jsonb) from public,anon;
grant execute on function public.dispense_prescription(uuid,jsonb) to authenticated;

create or replace function public.approve_controlled_drug_dispense(p_approval_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare verifier_id uuid; approval public.controlled_drug_dispense_approvals%rowtype;
begin
  select id into verifier_id from public.profiles where auth_user_id=auth.uid() and status::text='active'
    and role::text in ('pharmacist','super_admin') limit 1;
  if verifier_id is null then raise exception 'Only an active pharmacist or Super Admin may verify a controlled dispense'; end if;
  if public.mfa_required_for_current_user() and not public.has_aal2() then raise exception 'Multi-factor authentication is required for controlled medicine verification'; end if;
  update public.controlled_drug_dispense_approvals set approved_by=verifier_id,status='approved',approved_at=now()
    where id=p_approval_id and status='pending' and requested_by<>verifier_id returning * into approval;
  if not found then raise exception 'Approval is unavailable or verifier must be different from the requesting pharmacist'; end if;
  return public.dispense_prescription(approval.prescription_id,'{}'::jsonb);
end $$;
revoke all on function public.approve_controlled_drug_dispense(uuid) from public,anon;
grant execute on function public.approve_controlled_drug_dispense(uuid) to authenticated;

alter table public.formulary_items enable row level security;
alter table public.prescription_items enable row level security;
alter table public.prescription_item_migration_issues enable row level security;
alter table public.controlled_drug_register enable row level security;
alter table public.controlled_drug_movements enable row level security;
alter table public.controlled_drug_dispense_approvals enable row level security;
revoke all on public.formulary_items,public.prescription_items,public.prescription_item_migration_issues,public.controlled_drug_register,public.controlled_drug_movements,public.controlled_drug_dispense_approvals from public,anon;
grant select on public.formulary_items to authenticated;
grant select,insert,update,delete on public.prescription_items to authenticated;
grant select on public.prescription_item_migration_issues,public.controlled_drug_register,public.controlled_drug_movements to authenticated;
grant select,insert,update,delete on public.formulary_items,public.prescription_item_migration_issues,public.controlled_drug_register,public.controlled_drug_dispense_approvals to service_role;
grant select,insert on public.controlled_drug_movements to service_role;
grant usage,select on sequence public.prescription_item_migration_issues_id_seq,public.controlled_drug_movements_id_seq to service_role;
grant select on public.controlled_drug_dispense_approvals to authenticated;
drop policy if exists "active users read formulary" on public.formulary_items;
create policy "active users read formulary" on public.formulary_items for select to authenticated using(public.has_active_application_profile());
drop policy if exists "active users read prescription items" on public.prescription_items;
create policy "active users read prescription items" on public.prescription_items for select to authenticated using(
  public.has_active_application_profile() and exists(select 1 from public.prescriptions p where p.id=prescription_id));
drop policy if exists "prescriber manage prescription items" on public.prescription_items;
create policy "prescriber manage prescription items" on public.prescription_items for all to authenticated
  using(public.has_any_role(array['super_admin']) or exists(select 1 from public.prescriptions p where p.id=prescription_id and public.has_clinical_department_permission(p.patient_id,null,'medication.prescribe',false)))
  with check(public.has_any_role(array['super_admin']) or exists(select 1 from public.prescriptions p where p.id=prescription_id and public.has_clinical_department_permission(p.patient_id,null,'medication.prescribe',false)));
drop policy if exists "pharmacy read controlled register" on public.controlled_drug_register;
create policy "pharmacy read controlled register" on public.controlled_drug_register for select to authenticated using(public.has_any_role(array['super_admin','pharmacist']));
drop policy if exists "pharmacy read controlled movements" on public.controlled_drug_movements;
create policy "pharmacy read controlled movements" on public.controlled_drug_movements for select to authenticated using(public.has_any_role(array['super_admin','pharmacist']));
drop policy if exists "pharmacy read controlled dispense approvals" on public.controlled_drug_dispense_approvals;
create policy "pharmacy read controlled dispense approvals" on public.controlled_drug_dispense_approvals for select to authenticated using(
  public.has_any_role(array['super_admin']) or exists(select 1 from public.prescriptions p where p.id=prescription_id and public.has_clinical_department_permission(p.patient_id,null,'medication.dispense',false)));

commit;
notify pgrst,'reload schema';
