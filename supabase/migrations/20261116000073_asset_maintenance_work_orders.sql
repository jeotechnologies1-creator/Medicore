begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

do $$ declare s text; n text; begin
 select ns.nspname,t.typname into s,n from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace cn on cn.oid=c.relnamespace join pg_type t on t.oid=a.atttypid join pg_namespace ns on ns.oid=t.typnamespace where cn.nspname='public' and c.relname='profiles' and a.attname='role' and t.typtype='e';
 if n is not null then execute format('alter type %I.%I add value if not exists %L',s,n,'maintenance_officer'); end if;
end $$;
insert into public.permission_catalog(permission_key,description,sensitive) values
 ('asset.read','Read facility assets and maintenance records',true),('asset.manage','Manage assets and work orders',true),('asset.maintenance.manage','Configure preventive maintenance and alerts',true)
on conflict(permission_key) do update set description=excluded.description,sensitive=true;
insert into public.role_permission_grants(role,permission_key,scope) values
 ('maintenance_officer','asset.read','facility'),('maintenance_officer','asset.manage','facility'),('maintenance_officer','asset.maintenance.manage','facility'),
 ('hr_officer','asset.read','facility'),('hr_officer','asset.manage','facility'),('hr_officer','asset.maintenance.manage','facility'),
 ('super_admin','asset.read','global'),('super_admin','asset.manage','global'),('super_admin','asset.maintenance.manage','global')
on conflict do nothing;

create table if not exists public.facility_assets(
 id uuid primary key default gen_random_uuid(),facility_id uuid not null references public.facilities(id) on delete restrict,
 asset_tag text not null,asset_name text not null,category text,location text not null,custodian_id uuid references public.profiles(id) on delete restrict,
 status text not null default 'active' check(status in ('active','maintenance','unavailable','retired')),
 critical_equipment boolean not null default false,manufacturer text,model text,serial_number text,acquired_on date,
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(facility_id,asset_tag),check(length(btrim(asset_tag))>0 and length(btrim(asset_name))>0 and length(btrim(location))>0));
create index if not exists facility_assets_status on public.facility_assets(facility_id,status,critical_equipment);
create index if not exists facility_assets_custodian on public.facility_assets(facility_id,custodian_id);

create table if not exists public.asset_maintenance_schedules(
 id uuid primary key default gen_random_uuid(),asset_id uuid not null references public.facility_assets(id) on delete restrict,
 facility_id uuid not null references public.facilities(id) on delete restrict,maintenance_name text not null,interval_days integer not null check(interval_days>0),
 last_completed_on date,next_due_on date not null,active boolean not null default true,instructions text,
 configured_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(length(btrim(maintenance_name))>0));
create index if not exists asset_maintenance_due on public.asset_maintenance_schedules(facility_id,next_due_on) where active;

create table if not exists public.asset_work_orders(
 id uuid primary key default gen_random_uuid(),facility_id uuid not null references public.facilities(id) on delete restrict,
 asset_id uuid not null references public.facility_assets(id) on delete restrict,schedule_id uuid references public.asset_maintenance_schedules(id) on delete restrict,
 title text not null,description text,priority text not null default 'normal' check(priority in ('low','normal','high','urgent')),
 status text not null default 'open' check(status in ('open','assigned','in_progress','on_hold','completed','cancelled')),
 assigned_to uuid references public.profiles(id) on delete restrict,opened_by uuid not null references public.profiles(id),
 opened_at timestamptz not null default now(),started_at timestamptz,completed_at timestamptz,downtime_started_at timestamptz,downtime_ended_at timestamptz,
 resolution text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(length(btrim(title))>0),check(downtime_ended_at is null or downtime_started_at is not null and downtime_ended_at>=downtime_started_at));
create index if not exists asset_work_orders_queue on public.asset_work_orders(facility_id,status,priority,opened_at desc);
create index if not exists asset_work_orders_asset on public.asset_work_orders(asset_id,opened_at desc);
create table if not exists public.asset_work_order_parts(
 id uuid primary key default gen_random_uuid(),work_order_id uuid not null references public.asset_work_orders(id) on delete restrict,
 stock_item_id uuid references public.store_stock_items(id) on delete restrict,part_description text not null,quantity numeric(14,3) not null check(quantity>0),
 recorded_by uuid not null references public.profiles(id),recorded_at timestamptz not null default now(),stock_movement_id uuid references public.stock_movements(id) on delete restrict,
 check(length(btrim(part_description))>0));
create index if not exists asset_work_order_parts_order on public.asset_work_order_parts(work_order_id,recorded_at);
create table if not exists public.asset_maintenance_alerts(
 id uuid primary key default gen_random_uuid(),schedule_id uuid not null references public.asset_maintenance_schedules(id) on delete restrict,
 days_ahead integer not null check(days_ahead>=0),recipient_profile_id uuid not null references public.profiles(id),notification_id uuid references public.notifications(id),created_at timestamptz not null default now(),
 unique(schedule_id,days_ahead,recipient_profile_id));

do $$ declare t text; begin foreach t in array array['facility_assets','asset_maintenance_schedules','asset_work_orders','asset_work_order_parts','asset_maintenance_alerts'] loop
 execute format('alter table public.%I enable row level security',t); execute format('revoke all on public.%I from public,anon,authenticated',t); execute format('grant select on public.%I to authenticated',t); execute format('grant select,insert,update on public.%I to service_role',t);
 if t='facility_assets' then
  execute format('drop policy if exists asset_facility_read on public.%I',t);
  execute format('create policy asset_facility_read on public.%I for select to authenticated using(public.has_org_permission(''asset.read'',facility_id,null))',t);
 elsif t in ('asset_maintenance_schedules','asset_work_orders') then
  execute format('drop policy if exists asset_child_read on public.%I',t);
  execute format('create policy asset_child_read on public.%I for select to authenticated using(public.has_org_permission(''asset.read'',facility_id,null))',t);
 elsif t='asset_work_order_parts' then
  execute format('drop policy if exists asset_parts_read on public.%I',t);
  execute format('create policy asset_parts_read on public.%I for select to authenticated using(exists(select 1 from public.asset_work_orders w where w.id=%I.work_order_id and public.has_org_permission(''asset.read'',w.facility_id,null)))',t,t);
 else
  execute format('drop policy if exists asset_alert_read on public.%I',t);
  execute format('create policy asset_alert_read on public.%I for select to authenticated using(recipient_profile_id=(select id from public.profiles where auth_user_id=auth.uid() and status::text=''active'') or exists(select 1 from public.asset_maintenance_schedules s where s.id=schedule_id and public.has_org_permission(''asset.maintenance.manage'',s.facility_id,null)))',t);
 end if;
 execute format('drop trigger if exists audit_%I on public.%I',t,t);
 execute format('create trigger audit_%I after insert or update on public.%I for each row execute function public.audit_row_change()',t,t);
 end loop; end $$;
drop trigger if exists asset_work_order_parts_immutable on public.asset_work_order_parts;
create trigger asset_work_order_parts_immutable before update or delete on public.asset_work_order_parts for each row execute function public.prevent_consultation_history_mutation();

create or replace function public.create_facility_asset(p_facility_id uuid,p_asset_tag text,p_asset_name text,p_location text,p_custodian_id uuid default null,p_critical boolean default false,p_category text default null,p_manufacturer text default null,p_model text default null,p_serial_number text default null,p_acquired_on date default null) returns uuid
language plpgsql security definer set search_path=public as $$ declare actor uuid; result uuid; begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if actor is null or not public.has_org_permission('asset.manage',p_facility_id,null) or nullif(btrim(p_asset_tag),'') is null or nullif(btrim(p_asset_name),'') is null or nullif(btrim(p_location),'') is null
  or (p_custodian_id is not null and not exists(select 1 from public.profiles where id=p_custodian_id and status::text='active' and (facility_id=p_facility_id or facility_id is null))) then raise exception 'Asset data or facility permission is invalid.'; end if;
 insert into public.facility_assets(facility_id,asset_tag,asset_name,location,custodian_id,critical_equipment,category,manufacturer,model,serial_number,acquired_on,created_by)
 values(p_facility_id,btrim(p_asset_tag),btrim(p_asset_name),btrim(p_location),p_custodian_id,coalesce(p_critical,false),nullif(btrim(p_category),''),nullif(btrim(p_manufacturer),''),nullif(btrim(p_model),''),nullif(btrim(p_serial_number),''),p_acquired_on,actor) returning id into result; return result;
end $$;

create or replace function public.configure_asset_maintenance(p_asset_id uuid,p_name text,p_interval_days integer,p_next_due_on date,p_instructions text default null) returns uuid
language plpgsql security definer set search_path=public as $$ declare actor uuid; a public.facility_assets%rowtype; result uuid; begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active'; select * into a from public.facility_assets where id=p_asset_id;
 if actor is null or a.id is null or not public.has_org_permission('asset.maintenance.manage',a.facility_id,null) or nullif(btrim(p_name),'') is null or p_interval_days<=0 or p_next_due_on is null then raise exception 'Maintenance schedule requires facility permission, interval, name, and next due date.'; end if;
 insert into public.asset_maintenance_schedules(asset_id,facility_id,maintenance_name,interval_days,next_due_on,instructions,configured_by) values(a.id,a.facility_id,btrim(p_name),p_interval_days,p_next_due_on,nullif(btrim(p_instructions),''),actor) returning id into result; return result;
end $$;

create or replace function public.create_asset_work_order(p_asset_id uuid,p_title text,p_description text,p_priority text,p_assigned_to uuid default null,p_schedule_id uuid default null,p_downtime boolean default false) returns uuid
language plpgsql security definer set search_path=public as $$ declare actor uuid; a public.facility_assets%rowtype; result uuid; begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active'; select * into a from public.facility_assets where id=p_asset_id;
 if actor is null or a.id is null or not public.has_org_permission('asset.manage',a.facility_id,null) or nullif(btrim(p_title),'') is null or p_priority not in ('low','normal','high','urgent')
  or (p_assigned_to is not null and not exists(select 1 from public.profiles where id=p_assigned_to and status::text='active' and (facility_id=a.facility_id or facility_id is null)))
  or (p_schedule_id is not null and not exists(select 1 from public.asset_maintenance_schedules where id=p_schedule_id and asset_id=a.id and active)) then raise exception 'Work order is invalid or unauthorized.'; end if;
 insert into public.asset_work_orders(facility_id,asset_id,schedule_id,title,description,priority,status,assigned_to,opened_by,downtime_started_at)
 values(a.facility_id,a.id,p_schedule_id,btrim(p_title),nullif(btrim(p_description),''),p_priority,case when p_assigned_to is null then 'open' else 'assigned' end,p_assigned_to,actor,case when p_downtime then now() end) returning id into result;
 if a.critical_equipment then update public.facility_assets set status=case when p_downtime then 'unavailable' else 'maintenance' end,updated_at=now() where id=a.id; end if; return result;
end $$;

create or replace function public.update_asset_work_order(p_work_order_id uuid,p_status text,p_assigned_to uuid default null,p_resolution text default null,p_downtime_ended boolean default false) returns void
language plpgsql security definer set search_path=public as $$ declare actor uuid; w public.asset_work_orders%rowtype; begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active'; select * into w from public.asset_work_orders where id=p_work_order_id for update;
 if actor is null or w.id is null or not public.has_org_permission('asset.manage',w.facility_id,null) or p_status not in ('open','assigned','in_progress','on_hold','completed','cancelled')
  or (p_assigned_to is not null and not exists(select 1 from public.profiles where id=p_assigned_to and status::text='active' and (facility_id=w.facility_id or facility_id is null)))
  or (p_status='completed' and nullif(btrim(p_resolution),'') is null) then raise exception 'Work order update is invalid or unauthorized.'; end if;
 update public.asset_work_orders set status=p_status,assigned_to=coalesce(p_assigned_to,assigned_to),started_at=case when p_status='in_progress' then coalesce(started_at,now()) else started_at end,
  completed_at=case when p_status='completed' then now() else completed_at end,downtime_ended_at=case when p_downtime_ended or p_status='completed' then coalesce(downtime_ended_at,now()) else downtime_ended_at end,
  resolution=coalesce(nullif(btrim(p_resolution),''),resolution),updated_at=now() where id=w.id;
 if p_status in ('completed','cancelled') and not exists(select 1 from public.asset_work_orders x where x.asset_id=w.asset_id and x.id<>w.id and x.status in ('open','assigned','in_progress','on_hold')) then
  update public.facility_assets set status='active',updated_at=now() where id=w.asset_id and status in ('maintenance','unavailable'); end if;
end $$;

create or replace function public.record_asset_part_used(p_work_order_id uuid,p_description text,p_quantity numeric,p_stock_item_id uuid default null,p_location_id uuid default null) returns uuid
language plpgsql security definer set search_path=public as $$ declare actor uuid; w public.asset_work_orders%rowtype; result uuid; movement uuid; begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active'; select * into w from public.asset_work_orders where id=p_work_order_id;
 if actor is null or w.id is null or not public.has_org_permission('asset.manage',w.facility_id,null) or nullif(btrim(p_description),'') is null or p_quantity<=0 then raise exception 'Part usage is invalid or unauthorized.'; end if;
 if p_stock_item_id is not null then
  if p_location_id is null or not public.has_org_permission('stock.manage',w.facility_id,null) then raise exception 'Issuing a tracked stock part also requires stock permission and location.'; end if;
  movement:=public.record_store_item_movement(p_stock_item_id,'issue',p_quantity,'out',p_location_id,null,'Used on asset work order '||w.id::text,w.id::text);
 end if;
 insert into public.asset_work_order_parts(work_order_id,stock_item_id,part_description,quantity,recorded_by,stock_movement_id) values(w.id,p_stock_item_id,btrim(p_description),p_quantity,actor,movement) returning id into result; return result;
end $$;

create or replace function public.notify_due_asset_maintenance(p_facility_id uuid,p_days_ahead integer) returns integer
language plpgsql security definer set search_path=public as $$ declare actor uuid; s record; recipient uuid; notice uuid; n integer:=0; begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active'; if actor is null or p_days_ahead<0 or not public.has_org_permission('asset.maintenance.manage',p_facility_id,null) then raise exception 'Maintenance alert dispatch requires facility maintenance permission.'; end if;
 for s in select m.*,a.asset_tag,a.asset_name,a.critical_equipment from public.asset_maintenance_schedules m join public.facility_assets a on a.id=m.asset_id where m.facility_id=p_facility_id and m.active and m.next_due_on between current_date and current_date+p_days_ahead loop
  for recipient in select id from public.profiles where status::text='active' and (role::text in ('maintenance_officer','hr_officer','super_admin') and (facility_id=p_facility_id or facility_id is null) or id=(select custodian_id from public.facility_assets where id=s.asset_id)) loop
   if not exists(select 1 from public.asset_maintenance_alerts where schedule_id=s.id and days_ahead=p_days_ahead and recipient_profile_id=recipient) then
    insert into public.notifications(user_id,type,title,message,priority) values(recipient,'asset_maintenance_due','Preventive maintenance due',format('%s (%s): %s is due on %s.',s.asset_name,s.asset_tag,s.maintenance_name,s.next_due_on),case when s.critical_equipment then 'urgent' else 'high' end) returning id into notice;
    insert into public.asset_maintenance_alerts(schedule_id,days_ahead,recipient_profile_id,notification_id) values(s.id,p_days_ahead,recipient,notice); n:=n+1;
   end if;
  end loop;
 end loop; return n;
end $$;

revoke all on function public.create_facility_asset(uuid,text,text,text,uuid,boolean,text,text,text,text,date),public.configure_asset_maintenance(uuid,text,integer,date,text),public.create_asset_work_order(uuid,text,text,text,uuid,uuid,boolean),public.update_asset_work_order(uuid,text,uuid,text,boolean),public.record_asset_part_used(uuid,text,numeric,uuid,uuid),public.notify_due_asset_maintenance(uuid,integer) from public,anon,authenticated;
grant execute on function public.create_facility_asset(uuid,text,text,text,uuid,boolean,text,text,text,text,date),public.configure_asset_maintenance(uuid,text,integer,date,text),public.create_asset_work_order(uuid,text,text,text,uuid,uuid,boolean),public.update_asset_work_order(uuid,text,uuid,text,boolean),public.record_asset_part_used(uuid,text,numeric,uuid,uuid),public.notify_due_asset_maintenance(uuid,integer) to authenticated;
notify pgrst,'reload schema';
commit;
